# fauna-010 — Species metabolism, herbivore diet and renewable forage — Implementation Notes

> Review against current `main`, `docs/STATE.md`, `docs/plans/PLANNING.md` and related implemented systems. Keep the existing fauna source-action path; do not build a second feeding simulation.

## 1. Current codebase facts

- `src/fauna/AnimalLife.ts` owns `AnimalLifeState` and currently hardcodes one `HUNGER_RATE`, `THIRST_RATE`, stamina max/drain/regen for every species. `consumeFood(life, reliefScale)` already supports relative nutritional value and should be reused for diet quality.
- `AnimalDef` / `ANIMAL_DEFS` live in `src/fauna/AnimalAgent.ts`. This is the existing per-species capability/configuration seam (`production`, `scavenging`, mount data, etc.); metabolism and herbivore diet belong there rather than in role-specific branches.
- `AnimalAgent` already has the full source lifecycle: elevated need → throttled search → `SourceTarget` → live validation → movement → fixed-duration eat/drink → mutation on completion. `SourceTarget` is currently private and supports `water | forage | carcass`.
- Current non-predator forage is still abstract: `findForageTarget()` samples random walkable terrain points and a completed forage action relieves hunger without consuming world state. Replace that branch; do not add a parallel `AnimalFeedingSystem`.
- Trough drinking is the exact ownership pattern to mirror: `findTroughTarget()` prefers the owning household, `SourceTarget.trough` identifies the source, and `performSourceAction()` re-checks `household.water` before atomically removing it on completion.
- `Household.items` (`src/settlement/household.ts`) is a generic `Inventory`; concrete human food is derived from `ItemCategory = 'food'` through `src/items/foodItems.ts`. Therefore `hay` must **not** receive the `food` category, otherwise it automatically enters `foodCount()`, `takeFood()`, household shortage logic and settlement food flows.
- Livestock state is now persisted. `src/settlement/livestock.ts` stores `AnimalAgent.snapshot()` through `LivestockRegistry`; `AnimalSaveState.life` currently persists `{ hunger, thirst, stamina }`. The older fauna wording in `STATE.md` saying animal runtime state is not persisted is stale for livestock; wild individual fauna remains non-persistent.

## 2. Species metabolism

Add one data block to `AnimalDef`, e.g. `metabolism`, and make `createAnimalLifeState` / `tickAnimalLife` consume that definition. Do not copy derived rates into `AnimalLifeState`; runtime state should remain only hunger/thirst/stamina.

`StaminaState` currently starts with max `1`, while persisted livestock saves store only the stamina scalar. If species capacities become different, preserve save compatibility by treating the persisted scalar as a **normalized stamina ratio**: snapshot with `getStaminaRatio()`, hydrate as `ratio * def.metabolism.staminaCapacity`. Existing saves are compatible because the previous max was exactly `1`. Avoid persisting species-derived max/rates.

Keep `NEED_ELEVATED_THRESHOLD`, source cooldown and eat/drink duration global as planned. Do not move them into every species config pre-emptively.

## 3. Diet shape and source selection

Use a declarative diet that can answer two questions from one definition:

1. is this source/item edible for this species?
2. what relief scale should `consumeFood()` receive?

A compact shape such as `grass?: number` plus `items?: Partial<Record<ItemKind, number>>` is sufficient for this plan. Do not derive herbivore diet from `AnimalRole`.

Keep predator/carcass logic unchanged. `findFoodTarget()` currently chooses carcass for `role === 'predator'` and forage otherwise; only replace the non-predator branch with diet-aware source selection. Reuse `consumeFood(life, reliefScale)` rather than adding a second nutrition mutation path.

For household feed, select deterministically among eligible item kinds present in `household.items` rather than relying on object/map iteration accident. Re-check the exact selected kind at eat completion and call `Inventory.remove(kind, 1)` only then. If removal fails because another consumer took it first, grant no hunger relief and let the existing retry/cooldown path replan.

## 4. Grass forage ownership

Do not let each `AnimalAgent` generate or own patches. Patches are world state and must be queryable by many animals with one authoritative depletion state.

Recommended boundary: a small world/chunk-owned forage service injected into fauna with operations equivalent to:

- bounded query near `(x, z)`,
- `isAvailable(id, nowDays)`,
- atomic `consume(id, nowDays)`.

`SourceTarget` should carry a stable patch id plus position; live validation and final consumption must resolve through the authoritative forage owner. This makes two animals racing for one patch safe without reservations: the first completed `consume` wins; the second fails cleanly and replans.

Placement must use `createSeededRandom` / chunk+world seed, not the current `Math.random()` forage sampling. Stable identity must be derived from deterministic chunk/patch coordinates/index so the same patch is reconstructed after streaming or reload.

Use `src/world/treeLifecycle.ts` as the closest existing persistence/lifecycle pattern: deterministic presence + sparse override + lazy world-time resolution. Store only depleted patches, preferably `patchId -> availableAtDays`; once `nowDays >= availableAtDays`, treat the patch as available and prune the override. Do not tick regeneration per frame.

Keep gameplay patches independent from rendered grass density. Spatial queries should inspect only loaded/relevant chunk patch sets and run through the existing hunger threshold + `SOURCE_SEARCH_COOLDOWN_SEC` throttling.

## 5. World time, streaming and time skip

`AnimalAgent.update()` already receives `nowDays` (`dayNight.elapsedDays`) for livestock production. Reuse the same clock for forage regrowth and temporary hay-source cooldowns; do not introduce `Date.now()` or a second timebase.

Lazy `availableAtDays` comparisons naturally survive settlement/chunk stream-out and time skip. There is no need to replay growth ticks in `resolveTimeSkip()` for forage or hay availability; after a skip, the next query resolves against the new `elapsedDays`.

Wild animals themselves still are not persisted. This is fine: patch depletion is world state and must survive independently of whichever wild `AnimalAgent` consumed it.

## 6. Hay and temporary hay source

Add `hay` as a real `ItemKind`/`ITEM_DEFS` entry, but classify it as a non-human-food item (normally `resource`). Animal diet, not `foodItems.ts`, decides whether it can be eaten.

The temporary renewable hay source should have a stable world identity and finite persisted state; otherwise save/load resets the 4/day limit and cooldown. Reuse the existing lazy absolute-day pattern from `src/fauna/livestockProduction.ts` / timed world processes rather than an active timer. Persist only the minimal counters/anchors needed to reconstruct `takenToday` and `nextReadyAtDays`.

Keep this source responsible only for producing `hay` items. It must not become the authoritative animal-food store or encode diet rules, so it can later be replaced by `grass → cut → dry → hay` without touching animal feeding.

## 7. Livestock feeding point

Mirror `AnimalTrough → Household.water`:

```text
feeding point / position
        ↓
Household.items (authority)
        ↓
diet filter
        ↓
remove selected item on completed eat
```

Do not add inventory to the feeding prop. The prop/source may expose position and household id only. Natural grass remains fallback after no eligible household item is available.

Be careful not to call `Household.takeFood()`: it intentionally means human food and chooses from all `food`-category items. Animal feeding needs the exact diet-approved `ItemKind` and should remove that exact kind from `household.items`.

## 8. Persistence integration

Two different persistence rules apply:

- livestock metabolism state already travels through `AnimalSaveState` / `LivestockRegistry`; adapt snapshot/hydration for species stamina capacity as above,
- forage/hay-source depletion belongs to world persistence as sparse source overrides, not inside livestock records.

Follow the current optional-field/defaulting style in `src/persistence/saveData.ts`; do not persist deterministic patch position/species/terrain suitability. Verify save parsing/defaulting for any new optional collection and add focused round-trip coverage.

## 9. High-value tests / pitfalls

Prioritize tests that catch ownership errors rather than presentation details:

- old persisted livestock stamina restores to the same **ratio** under a non-1 species capacity,
- diet eligibility and relief scale use the same definition for selection and completion,
- two animals completing against one patch/item cannot both consume it,
- interrupted/invalidated eat never removes inventory or depletes a patch,
- depleted patch remains depleted across save/load/stream reconstruction and becomes available after `elapsedDays` passes its anchor,
- hay is absent from `FOOD_ITEM_KINDS` / household human `foodCount()`,
- household feed is preferred, but depletion during approach falls back through the existing retry path,
- predator carcass/scavenging tests remain unchanged.

No unresolved plan dependency is required before implementation; the important foundations are already implemented: fauna source actions (plan 094), household trough/water ownership (plan 122), concrete household item food storage (`settlements-npcs-008`), sparse/lazy tree resource state, livestock production lazy day anchors, and livestock persistence (`persistence-001`).
