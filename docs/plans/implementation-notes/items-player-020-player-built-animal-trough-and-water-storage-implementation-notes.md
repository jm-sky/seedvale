# Implementation Notes: Player-built animal trough and water storage

**Plan:** `items-player-020-player-built-animal-trough-and-water-storage.md`  
**Reviewed against:** current `main`, 2026-09-09  
**Recon baseline:** `5994894da2ce422a6153c5c726fdcea433ac1f2d`

## Recon conclusion

Plan nadal pasuje do aktualnej architektury, ale po `fauna-017` trzeba precyzyjniej ustawić integration boundary.

Najważniejsze ustalenia:

1. `src/fauna/animalForaging.ts` jest teraz faktycznym ownerem source selection, live validation i successful-resource-mutation-before-relief.
2. `AnimalAgent` pozostał integration/movement ownerem; nie jest już właściwym miejscem na trough-specific search/consume policy.
3. `ForagingContext` nadal jest właściwym dependency-injection seamem dla world-owned source provider.
4. Obecne `SourceTarget.trough?: boolean` jest zbyt wąskie. Przy dodaniu drugiego finite water source warto zastąpić je discriminated water-source refem, zamiast dodawać `playerTrough?: true`.
5. Household trough nadal zużywa `Household.water`; player-built trough powinien być dodatkowym źródłem, nie replacementem settlement storage.
6. `fauna-020` pozostaje planem. Trough nie powinien zależeć od jego niezrealizowanego ownership API.
7. Persistence notes były nieaktualne: current `src/persistence/saveData.ts` ma `CURRENT_SAVE_VERSION = 20` i działający versioned migration pipeline.

## 1. Fauna ownership po fauna-017

### `src/fauna/animalForaging.ts`

Current symbols:

- `ForagingContext`
- `SourceTargetKind`
- `SourceTarget`
- `findTroughTarget()`
- `findWaterTarget()`
- `isSourceTargetValid()`
- `applySourceRelief()`
- `WATER_INTERACTION_RANGE`
- `DRINK_DURATION_SEC`
- `SOURCE_SEARCH_COOLDOWN_SEC`
- `SOURCE_TARGET_TIMEOUT_SEC`

Current water behaviour:

```text
findWaterTarget(ctx)
→ findTroughTarget(ctx)
   → if ctx.household.water has TROUGH_DRINK_AMOUNT
      return { kind: 'water', x: home.x, z: home.z, trough: true }
→ otherwise probe natural shoreline
```

Final relief:

```text
water + trough
→ re-check Household.water
→ remove(TROUGH_DRINK_AMOUNT)
→ drinkWater(ctx.life)

water + natural
→ drinkWater(ctx.life)
```

This is the exact pipeline player trough must extend.

### `src/fauna/AnimalAgent.ts`

Relevant current role:

- holds `sourceTarget` / pursuit/action timers,
- `foragingContext()` builds a fresh context during needs handling,
- calls `findWaterTarget()` / `findFoodTarget()`,
- uses `isSourceTargetValid()` during pursuit/completion,
- calls `applySourceRelief()` after the action timer,
- owns steering/walkability/home bounds.

Do not add player-trough discovery/consumption policy here. The only expected changes are dependency threading needed so `foragingContext()` can expose the narrow water-source provider.

### `src/fauna/AnimalLife.ts`

`drinkWater()` remains the only thirst-relief operation. Trough code must not assign `life.thirst` directly.

## 2. Recommended water source type seam

Current `SourceTarget` uses:

```ts
kind: 'water'
trough?: boolean
```

`trough: true` specifically means `ctx.household.water`. A second boolean would create ambiguous combinations and duplicate dispatch state.

Recommended refactor inside `animalForaging.ts`:

```ts
type WaterSourceRef =
  | { kind: 'natural' }
  | { kind: 'household' }
  | { kind: 'playerTrough', id: string }
```

Then water target carries one source ref, e.g. semantically:

```ts
{ kind: 'water', x, z, waterSource: { kind: 'playerTrough', id } }
```

Keep `SourceTargetKind` unchanged unless compiler ergonomics justify a fuller discriminated union. The important part is one unambiguous source identity, not boolean flags.

Cached target stores:

- source kind,
- stable player trough id when needed,
- target x/z.

It must not store live record refs or cached `waterLitres`.

## 3. `ForagingContext` provider is still the correct seam

`ForagingContext` is created fresh by `AnimalAgent.foragingContext()` only while needs handling is active. That makes it the correct place for an optional world-owned water provider.

Recommended narrow capability shape:

```ts
export type AnimalWaterSourceProvider = {
  queryAvailableNear(
    x: number,
    z: number,
    radius: number,
  ): readonly { id: string, x: number, z: number }[]
  isAvailable(id: string, litres: number): boolean
  consume(id: string, litres: number): boolean
}
```

Possible simplification: omit `isAvailable()` and implement validation through a single `canConsume()`/`resolve(id)` call. Do not expose mutable `PlayerTroughRecord` if it can be avoided.

Ownership rule:

```text
world/createPlayerTroughs
owns records + waterLitres mutation

animalForaging
owns selection + eligibility + source-type dispatch

AnimalAgent
owns movement/timing/context assembly

AnimalLife
owns thirst state/relief
```

This keeps the cross-domain seam narrow and deterministic.

## 4. Search ordering / eligibility

Current household behaviour is intentional: household livestock checks local stored water first, then natural water.

For V1 extend it semantically as:

```text
household trough available
→ household target
else eligible player trough available
→ best/local player trough target
else
→ existing natural shoreline search
```

Do not move household water into the new provider just to make everything uniform. `Household.water` already has coherent settlement ownership and atomic `has/remove`; replacing it would increase scope and risk.

Player trough provider should be neutral. `animalForaging` decides whether a candidate is eligible for the current animal.

Important: current code has no player-owned-animal API. Therefore V1 cannot use `ownerHouseId == null` or `horse` as a fake ownership test. Keep eligibility conservative/general and leave stronger player-owner preference to `fauna-020` if it lands first.

## 5. Completion-time validation and atomic consume

Current `isSourceTargetValid()` validates live source state for carcass/feed/grass and movement bounds, while `applySourceRelief()` performs the final atomic-ish resource mutation before relief.

Player trough must follow that same two-step contract.

### Validation

For `waterSource.kind === 'playerTrough'`:

```text
provider available
+ id resolves
+ completed
+ has >= TROUGH_DRINK_AMOUNT
+ existing walkable/roam constraints still pass
```

### Relief

```ts
if (provider.consume(target.waterSource.id, TROUGH_DRINK_AMOUNT)) {
  drinkWater(ctx.life)
}
```

`consume()` must re-read the live record again. Validation is advisory for pursuit/action UX; final consume is the race winner.

This preserves correctness when:

- another animal drinks first,
- player interaction changes trough state,
- future removal deletes the trough,
- cached target survives longer than source availability.

Do not grant relief after a failed consume.

## 6. Player trough authoritative world state

No common runtime `PlayerBuiltStructure` abstraction exists. Current `WorldBundle` owns separate small systems:

- `playerWells`
- `playerGardens`
- `standingTorches`
- `palisades`
- `residentialBuildings`
- `sleepingUtilities`
- `terrainPreparations`
- etc.

Follow the same pattern.

### Proposed files

`src/world/playerTrough.ts`

Owns pure state/constants/helpers:

```ts
PlayerTroughRecord
PLAYER_TROUGH_CAPACITY_LITRES
PLAYER_TROUGH_REQUIRED_WORK
PLAYER_TROUGH_* placement/material constants
playerTroughRemainingWork()
isPlayerTroughConstructionComplete()
```

`src/world/createPlayerTroughs.ts`

Owns live collection and Three.js/runtime side effects:

```text
place(...)
contributeWork(id, hours)
addWater(id, litres)
consumeWater(id, litres)
queryAvailableNear(x, z, radius)
nodes()
dispose()
```

Avoid returning mutable records from public query functions unless existing owner patterns make it unavoidable.

## 7. Construction seam

Canonical placement remains `src/app/actions/placementActions.ts`:

- `GroundPlacementDefinition`
- `evaluatePlacementSite()`
- `previewGroundPlacement()`

Construction reference implementation remains the single-stage `StandingTorchRecord` / `StandingTorches.contributeWork()` or palisade equivalent, not the stage-based `PlayerWell` lifecycle.

Trough is single-stage:

```text
placed persistent unfinished record
→ completedWork += accepted work
→ completion derived from required-work constant
```

Materials are consumed on successful placement via current construction-material handling.

Do not create a generic `ConstructionManager`.

## 8. Liquid container seam

`src/items/liquidContainer.ts` current contract is pure:

- `liquidContainerCapacity()`
- `canFillLiquidContainer()`
- `fillLiquidContainer()`
- `addLiquidToContainer()`
- `hasLiquidContent()`
- `drinkFromLiquidContainer()`
- `emptyLiquidContainer()`

Callers commit the returned instance through `Inventory.updateInstance()`.

For pouring out water, do not misuse `drinkFromLiquidContainer()` semantically if it obscures amount handling. A small reusable pure helper for removing an arbitrary litre amount is acceptable if needed, but do not create trough-specific container state.

Transfer completion should operate on live state:

```text
current inventory instance
+ current trough record
→ validate water + completed + free capacity
→ amount = min(container water, free capacity)
→ derive next container instance
→ apply trough add + Inventory.updateInstance in one synchronous completion block
```

If either side fails validation, commit neither side.

Because JS execution is single-threaded here, a synchronous no-await completion block is enough for V1 atomicity; do not invent transactional infrastructure.

## 9. Household trough integration remains separate

`findTroughTarget()` currently means household storage at `ctx.home` and consumes `ctx.household.water`.

Keep that semantic branch. Rename helper if needed for clarity, e.g. `findHouseholdTroughTarget()`, but avoid refactoring unrelated livestock feeding/household ownership.

Settlement `createTrough()` is presentation; real settlement drinkable stock lives in `Household.water`. Player trough does not change that ownership.

## 10. Visual reuse

`src/settlement/settlementStructures.ts::createTrough()` can still be reused as a visual builder.

Old notes correctly identified one fragility: runtime code must not depend on `group.children[1]` to find water.

Preferred small change:

- stable child `name`/`userData` marker, or
- wrapper/helper returning visual + `setHasWater()`.

Do not turn `settlementStructures.ts` into storage ownership.

## 11. WorldBundle wiring

`src/app/worldBundle.ts` is the lifecycle owner for world systems and player-built structures.

Required changes when implementing:

- import `PlayerTroughRecord` and `PlayerTroughs`,
- add `playerTroughs: PlayerTroughs` to `WorldBundle`,
- accept initial trough records in the same rebuild/carry path as other placed structures,
- create before consumers that need the provider or use late-bound accessor if current construction order requires it,
- dispose during rebuild,
- snapshot `nodes()` before rebuild and restore them after rebuild.

Do not pass `WorldBundle` into fauna. Thread only the provider capability through existing constructor/update dependencies.

## 12. Persistence seam — current v20

Current source of truth:

```ts
src/persistence/saveData.ts
export const CURRENT_SAVE_VERSION = 20
```

The project now has an explicit migration pipeline. Do not retain the old note saying schema v6.

Expected implementation:

- add `SavePlayerTrough` or use the plain serializable record type if persistence conventions permit,
- add `playerTroughs` to `SaveData`,
- validate finite x/z/yaw/completedWork/waterLitres and sensible bounds,
- `src/app/saveState.ts::buildSaveData()` reads `bundle.playerTroughs.nodes()`,
- next migration defaults missing `playerTroughs` to `[]`,
- update canonical test fixtures that construct complete `SaveData`.

Do not hardcode "v21" in plan logic beyond the implementation commit that actually owns the next migration; another schema change may land first.

## 13. Interaction seam

Current interaction architecture uses:

- `src/interaction/Interactable.ts` union,
- `src/app/interactables.ts` builder,
- app/game-loop action dispatch,
- busy/action completion for timed work.

Implement trough through that path.

Recommended precedence:

```text
unfinished
→ [E] build/work

completed + water container + capacity
→ fill

completed + full
→ full feedback

completed + no water
→ no carried water feedback
```

No separate screen.

## 14. Relationship to fauna-020

Current `fauna-020-player-owned-animals-and-follow-stay-behaviour.md` is `planned` and its refreshed notes confirm player ownership is not implemented yet.

Therefore items-player-020 must not import future `AnimalOwner` types or wait for detached player-owned lifecycle.

If fauna-020 lands first, only eligibility/preference may consume its public ownership seam. The water provider itself remains owner-neutral.

## 15. Focused code/test files to touch during implementation

Likely production files:

- `src/world/playerTrough.ts` — new
- `src/world/createPlayerTroughs.ts` — new
- `src/app/worldBundle.ts`
- `src/app/saveState.ts`
- `src/persistence/saveData.ts`
- `src/app/actions/placementActions.ts` consumer/wiring, not contract rewrite
- relevant placement/action module where standing torch/palisade placement is currently dispatched
- `src/interaction/Interactable.ts`
- `src/app/interactables.ts`
- `src/items/liquidContainer.ts` only if a generic arbitrary-removal helper is justified
- `src/fauna/animalForaging.ts`
- `src/fauna/AnimalAgent.ts` only for provider dependency threading
- livestock/fauna creation/update call-sites that construct `AnimalAgentDeps` / `AnimalUpdateContext`
- `src/settlement/settlementStructures.ts` only for stable water-visual seam

Focused tests:

- `src/fauna/animalForaging.test.ts`
- new `src/world/playerTrough.test.ts`
- new/runtime owner test next to `createPlayerTroughs` if current conventions justify it
- `src/items/liquidContainer.test.ts` only if adding a generic remove helper
- `src/persistence/saveData.test.ts`
- save fixtures such as `src/persistence/saveDb.test.ts` / `saveSlots.test.ts` that construct full `SaveData`
- existing placement/action tests nearest the selected placement consumer

## 16. Suggested implementation order

1. Pure trough record/constants/helpers + unit tests.
2. Runtime `PlayerTroughs` owner + visual + `contributeWork` + water mutation/query tests.
3. Placement/construction/interactable + `WorldBundle` lifecycle/rebuild.
4. Persistence/save migration + fixtures/tests.
5. Container → trough transfer action and exact-litre balance tests.
6. `animalForaging.ts` water-source discriminator refactor with regression tests for household + natural paths first.
7. Add provider candidate selection, validation and successful-consume-before-`drinkWater` tests.
8. Thread provider through `AnimalAgent`/livestock/fauna call-sites.
9. Derived water visual visibility and final focused regression run.

## Guardrails

- Nie cofać `fauna-017`.
- Nie dodawać trough-specific behaviour do `AnimalAgent`.
- Nie tworzyć `WaterStorageManager`.
- Nie tworzyć `ConstructionManager`.
- Nie tworzyć trough-specific FSM.
- Nie tworzyć drugiego fauna sensing/foraging systemu.
- Nie przepinać household trough storage do player trough ownera.
- Nie uzależniać implementacji od niezrealizowanego `fauna-020`.
- Nie wykonywać browser verification przez AI.
- Nie uruchamiać `pnpm docs:sync` ręcznie; workflow GitHub robi to automatycznie.