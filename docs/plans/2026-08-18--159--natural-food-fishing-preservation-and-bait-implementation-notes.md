# Plan: Natural Food, Fishing, Preservation and Bait — implementation notes

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** ~~155~~ ~~156~~ ~~106~~ ~~141~~

## 1. Review result

Plan 159 is directionally compatible with Seedvale, but it currently assumes several systems that do not exist yet. The implementation should extend the existing item/inventory, world-time, item-spawner, trap, persistence and NPC-storage mechanisms rather than introduce food-, fishing- or preservation-specific managers.

Important dependency finding:

- **155 is still planned, not implemented.** Current `Inventory` is strictly `ItemKind → count`; there is no `ItemInstance`. Therefore freshness cannot be added safely by simply attaching a timestamp to an item instance. Plan 155 must establish the instance boundary first, while Plan 159 should extend the stackable side with stateful stacks/buckets rather than migrate all food to instances.
- **156 is done.** The generic NPC gather → carry → deposit contract already exists. Food currently goes directly to `Household.stock`, while wood/water/ore use the chained carrying/deposit action. Do not create food logistics.
- **106 is implemented.** Player hunger/thirst, consumables, raw/species meat, roasted meat, tomato, cooking and water sources already exist. Plan 159 should extend these definitions instead of creating another food/needs layer.
- **141 is implemented.** Traps are persisted world objects with deterministic detection and a shared `PlacedTraps` runtime. Bait should extend this lifecycle, not create a second trap system.

## 2. Current codebase anchors

### Items / inventory

- `src/items/items.ts` — authoritative `ItemKind`, labels, categories and weights.
- `src/items/itemCatalog.ts` — gameplay flags, spawn metadata and consumable definitions.
- `src/items/Inventory.ts` — current count-based inventory; no instances or per-stack state.
- `src/items/createItemSpawners.ts` — existing renewable/one-time settlement pickup mechanism; tomato already uses it.
- `src/items/campfireCooking.ts` — existing recipe table; raw/species meat → `roasted_meat` is already the established cooking seam.
- `src/items/tradeCatalog.ts` / `src/items/trade.ts` — merchant stock and prices.
- `docs/items/CATALOG.md` — current item inventory; notably `dried_meat` already exists and is merchant-sourced.

### Player / needs

- `src/player/PlayerNeeds.ts` — authoritative player hunger/thirst pools.
- `src/app/gameLoop.ts` / `src/app/createApp.ts` — existing player consumption and world interaction dispatch.
- `src/persistence/saveData.ts` — canonical save schema, currently **v17**.

### NPC / settlement

- `NpcAgent` / existing `NpcPlannedAction` lifecycle — reusable gather → carry → deposit flow.
- `Household.stock` — household food/resource stock owner.
- `SettlementEconomy` — settlement stock owner.
- `src/settlement/createSettlement.ts` / `src/settlement/props.ts` — existing physical household/settlement storage presentation from 156.

### Traps / fauna

- `src/world/animalTraps.ts` — pure trap rules and `PlacedTrapRecord`.
- `src/world/createPlacedTraps.ts` — runtime trap objects, detection, capture and weather wear.
- `src/world/trapProp.ts` — visual trap presentation.
- `src/fauna/AnimalAgent.ts` / `src/fauna/animalMeat.ts` — existing death and species-meat mapping.
- `src/interaction/Interactable.ts` and `src/app/interactables.ts` — existing interaction seam.

### World lifecycle / persistence

- `src/app/worldBundle.ts` — runtime lifetime boundary. New runtime state must respect rebuild/recreate semantics.
- `src/persistence/saveData.ts` — add only authoritative state that cannot be derived from seed/time.
- World weather remains deterministic from `(worldSeed, elapsedDays)`; do not create a second weather history.

These ownership boundaries are consistent with `docs/STATE.md`: simulation state must not live in Three.js `Object3D`s, and world systems belong to `WorldBundle` lifetime.

## 3. Model corrections before implementation

### 3.1 Freshness is stack state, not `ItemInstance`

`ItemInstance` from 155 is intended for items with individual identity, initially traps. Food remains stackable.

Recommended model after 155:

```ts
ItemStackState {
  kind: ItemKind
  count: number
  freshness: FreshnessStage
  // absolute spoilage deadline or equivalent world-time value
}
```

Conceptually inventory becomes:

```text
kind + freshness state → count
```

rather than:

```text
one ItemInstance per berry/meat/fish
```

If two stacks of the same food have different spoilage deadlines, they remain separate stacks. Do not split every unit into an instance.

Freshness stages should be derived from the authoritative spoilage timestamp where possible; the stage is presentation/gameplay state, not an independently drifting timer.

### 3.2 One freshness definition

Add a central food definition/resolver, preferably next to the existing item catalog rather than a `FreshnessManager`:

```ts
FoodConfig {
  foodValue: number
  freshness?: {
    freshDurationDays: number
    mediumDurationDays: number
    spoiledDurationDays: number
  }
  bait?: 'meat' | 'plant'
}
```

Better implementation shape: keep `ItemCatalogEntry` as the central definition and add an optional `food` block, avoiding a parallel food registry.

`melt/spoil` must be a pure function of item definition + world elapsed time + stack timestamp. No per-frame mutation is required.

`miel/honey` gets no spoilage deadline or a very large/explicitly non-spoiling configuration.

## 4. Item set — reuse before adding

Already present and should be reused:

- `mushroom`
- `tomato`
- `raw_meat`
- `deer_meat`
- `wolf_meat`
- `boar_meat`
- `rabbit_meat`
- `beef`
- `roasted_meat`
- `cheese`
- `dried_meat`

Missing from the current item catalog and therefore genuinely new:

- berries
- apple
- nuts
- honey
- carrot
- potato
- cabbage
- fish
- dried fish
- bait is **not** a new item kind; use existing food items classified as meat/plant bait.

Do not add `fresh_meat`, `spoiled_meat`, `fresh_fish`, etc. as `ItemKind`s. Freshness is state, not type.

`dried_meat` must be upgraded rather than duplicated. Its current merchant-only acquisition can remain temporarily, but the preservation recipe becomes an additional source.

## 5. Natural food and crops

Extend `src/items/createItemSpawners.ts` / its existing `ItemSpawnPoint` mechanism for simple renewable pickups where a physical pickup is sufficient.

Use existing settlement garden anchors for crops, as tomato already does. Do not create `CropManager` for this plan.

For world natural food:

- mushroom keeps its current chunk-item lifecycle;
- berries/nuts can use deterministic chunk/vegetation placement if that is the best fit for their visual/source lifecycle;
- apples should be tied to tree species/lifecycle only if the current tree data provides a stable source without creating a second tree-resource system.

The important distinction is **source ownership**: do not make an `AppleSystem` or `BerrySystem`; extend the existing item/resource spawn mechanisms.

Food collection must produce normal inventory items, so player and NPC acquisition can reuse the same item definitions.

## 6. Freshness / spoiled food

Implement a pure resolver such as:

```ts
getFreshness(itemKind, acquiredAtDays, nowDays): FreshnessState
```

with states:

```text
fresh → medium → spoiled
```

The resolver must be deterministic and save/load safe.

For inventory stacks, preserve the acquisition/spoilage timestamp required to distinguish stacks with different ages. When merging two stacks, merge only when their freshness state/deadline is compatible; otherwise keep separate stacks.

Consumption rules:

- fresh/medium food restores its configured hunger value;
- spoiled food should not silently behave as fresh food;
- the plan currently excludes disease, so first implementation should make spoiled food non-consumable or give zero/explicitly reduced value rather than invent an illness framework.

NPC consumption must use the same food resolver as the player.

## 7. Cooking integration

Extend the existing `src/items/campfireCooking.ts` recipe table instead of adding a cooking system.

Existing:

```text
raw/species meat → roasted_meat
```

Plan 159 should additionally allow fish input and preserve the output's own freshness timeline.

Cooking should consume the source stack and create a new stack with a new production timestamp. Do not carry the raw item's spoilage deadline onto cooked food.

The current busy-channel interaction for cooking remains the correct interaction pattern; Plan 159's generic `TimedProcess` is a **different abstraction** for background/non-blocking processes.

## 8. Generic TimedProcess

There is currently no `TimedProcess` implementation in the codebase.

Introduce a small domain/persistence model, not a manager:

```ts
TimedProcess {
  id: string
  kind: TimedProcessKind
  startedAtDays: number
  durationDays: number
  input: ItemStackInput[]
  output: ItemStackOutput[]
}
```

Completion is derived:

```ts
completedAtDays = startedAtDays + durationDays
progress = clamp((nowDays - startedAtDays) / durationDays, 0, 1)
```

Avoid storing both `duration` and mutable `completedAt` unless the persistence contract explicitly needs both; `completedAt` is derivable.

The process must be owned by the relevant persistent simulation state (for the first use, a drying rack/process record), not by the UI or `Object3D`.

The process engine should be small enough to:

- start a process;
- inspect progress;
- complete all due processes after time-skip/reload;
- serialize/restore active processes.

Do not make a global per-frame `TimedProcessManager` if completion can be checked when the owning state is updated/read.

## 9. Preservation / drying

Reuse `dried_meat` from `ITEM_DEFS` / `ITEM_CATALOG`.

Add `dried_fish`.

The physical drying rack should follow the same pattern as tents/traps: persistent world record + presentation object, with authoritative state outside the Three.js object.

Recommended record shape:

```ts
DryingRackRecord {
  id: string
  x: number
  z: number
  yaw: number
  process: TimedProcess | null
}
```

Do not create a `DryingRackManager`; the owning world bundle can expose the small lifecycle required by the interaction layer.

## 10. Fishing

No fishing implementation currently exists.

Reuse the existing interaction/action framework and held-tool/item model.

Suggested minimal model:

```ts
FishingSpot {
  id: string
  x: number
  z: number
  kind: 'shore' | 'deep'
}
```

Prefer deterministic spot discovery from existing water/coast geometry over persisting every spot. The actual catch roll should be deterministic from world seed + spot + attempt/day state, while avoiding a new simulation subsystem.

Add a fishing rod as an ordinary tool item. Fishing is a player/NPC action with a duration, not a real-time per-frame fish simulation.

Catch result:

```text
fishing action
→ deterministic catch roll
→ fish / bait / no catch
→ normal inventory item
```

Do not introduce fish agents or fish population simulation in Plan 159.

## 11. Fishing bait state

Bait should be a temporary state on the fishing spot/action, not an item subtype.

Minimal persisted state:

```ts
FishingBaitState {
  kind: ItemKind
  appliedAtDays: number
  expiresAtDays: number
  strength: number
}
```

Repeated baiting can refresh or cap/increase `strength`; exact balance should be a central constant/function.

Persist this state because the effect lasts several in-game days.

The visual effect is presentation only:

- throw animation;
- short particle burst;
- localized water effect while active;
- fade-out when expired.

Do not persist particle/effect objects.

A spot outside the streamed/rendered area can keep its bait bonus without a Three.js object.

## 12. Bees / honey

There is currently no bee/hive system.

Reuse:

- existing `HealthState` / damage path;
- existing held `wooden_torch` semantics;
- existing fire/placed-fire interaction where applicable;
- normal `ItemKind` inventory and item spawning.

Introduce only the minimum domain state required for a hive:

```ts
HiveRecord {
  id: string
  x: number
  z: number
  burned: boolean
  productionStartedAtDays: number
  // or an equivalent deterministic production timestamp
}
```

Honey production should be time-based world state, not a per-frame bee simulation. Bees can be visual agents/effects around the hive, but the production result must not depend on their render objects.

Burning a hive must use the existing fire/torch interaction path. Do not create a `BeeCombatSystem`.

The plan's "one-time honey after burning" needs an explicit persisted flag/state so stream/reload cannot duplicate it.

## 13. Trap bait — Plan 141 integration

Extend `PlacedTrapRecord` minimally, for example:

```ts
baitKind: ItemKind | null
```

Bait category belongs to the item definition:

```ts
bait?: 'meat' | 'plant'
```

Do not create `MeatBait` / `PlantBait` item kinds.

Arming/loading a trap with bait should:

1. validate the food item category;
2. remove one item from inventory atomically;
3. store its `ItemKind` on the trap;
4. increase the existing detection/capture interest calculation through a pure trap rule;
5. consume the bait when the trap fires/when the bait is considered spent, according to the final rule.

The safest initial model is: bait is consumed when the trap successfully captures an animal. If the trap is collected/disarmed before firing, the bait should either be returned or explicitly lost; choose one rule and test it. Prefer returning it on disarm/collect to avoid hidden item loss.

Bait must modify the existing detection/capture probability in `src/world/animalTraps.ts`; `createPlacedTraps.ts` remains orchestration/runtime.

The current trap capture already goes through `AnimalAgent.takeDamage()` and leaves an ordinary corpse, so do not add automatic meat loot here. The player can use the existing knife-harvest flow.

## 14. NPC integration

Do not create new NPC food logic.

Plan 156 already provides the reusable transport contract. The required work is mainly to expose the new food sources and ensure food stacks/freshness are handled by the same household stock representation.

Target flow:

```text
food source
→ existing NPC gather action
→ carrying / existing food stock path
→ Household.stock
→ existing NPC consumption
```

For perishable food, household stock must preserve the minimum state needed to avoid turning old food into fresh food merely because it entered storage.

This may require extending `Household.stock` from plain counts to stateful stacks. Do not add a parallel `HouseholdFoodInventory`.

## 15. Suggested implementation order

### Phase 0 — dependency alignment

1. Finish/verify Plan 155 inventory instances and persistence changes.
2. Preserve count-based stackable inventory as the default model.
3. Add the smallest stateful-stack extension needed for freshness.

### Phase 1 — shared food definitions

1. Extend `ItemCatalogEntry` with food/freshness/bait metadata.
2. Add missing food `ItemKind`s.
3. Reuse existing meat, mushroom, tomato, cheese and `dried_meat` definitions.
4. Add tests for definitions and freshness resolver.

### Phase 2 — freshness

1. Add freshness timestamp/state to stackable food.
2. Add pure freshness resolver.
3. Update inventory add/remove/merge/split semantics.
4. Update player and NPC consumption.
5. Add save migration and round-trip tests.

### Phase 3 — natural food / crops

1. Extend existing item spawn/source mechanisms.
2. Add berries/apple/nuts and missing crops.
3. Reuse garden anchors and chunk/vegetation sources.
4. Verify player + NPC acquisition.

### Phase 4 — generic timed processes

1. Add persisted domain process type.
2. Add due/completion resolver.
3. Integrate time-skip/reload catch-up.
4. Add progress data for UI.

### Phase 5 — preservation

1. Add drying rack world record + presentation.
2. Add drying recipes.
3. Reuse `dried_meat`; add `dried_fish`.
4. Add inventory/process/save integration.

### Phase 6 — fishing

1. Add rod item definition.
2. Add deterministic fishing spot resolution.
3. Add fishing interaction/action.
4. Add fish item.
5. Add bait state and persistence.
6. Add render-only bait visual effects.

### Phase 7 — bees/honey

1. Add hive world state.
2. Add deterministic/time-based honey production.
3. Add bee visuals.
4. Integrate torch/fire damage and hive burning.
5. Persist one-time burned-hive result state.

### Phase 8 — trap bait

1. Add bait metadata to food definitions.
2. Extend `PlacedTrapRecord` and `SavePlacedTrap`.
3. Add bait loading/consumption.
4. Extend pure trap detection/capture rule.
5. Reuse existing trap runtime and corpse lifecycle.

### Phase 9 — end-to-end integration

1. NPC food gathering/storage/consumption.
2. Player food consumption/cooking/preservation.
3. Save/load.
4. Time-skip.
5. Streaming/rebuild.
6. Final browser verification.

## 16. Tests / verification

### Unit / domain

- freshness boundaries: fresh → medium → spoiled;
- freshness deterministic for identical timestamps;
- stack merge only when state is compatible;
- cooking resets production/freshness timestamp correctly;
- timed process completion exactly at/after deadline;
- time-skip completes overdue processes once;
- fishing catch roll deterministic;
- fishing bait expiry/refresh works;
- bait category accepts meat/plant foods and rejects unrelated items;
- trap bait changes the existing detection/capture calculation;
- trap bait persistence survives save/load;
- burned hive cannot generate its one-time reward twice.

### Save/load

At minimum:

```text
food acquired
→ save
→ reload
→ same freshness deadline/state
```

```text
drying started
→ time-skip across completion
→ reload
→ output exists exactly once
```

```text
fishing spot baited
→ save
→ reload
→ bait bonus remains until expiry
```

```text
trap baited
→ save
→ reload
→ bait remains attached to the same trap
```

### Browser/manual

- collect each new natural food;
- eat fresh/medium food;
- spoiled food follows the explicit v1 rule;
- cook meat/fish;
- start drying and leave the rack without blocking the player;
- progress bar advances with world time;
- time-skip/reload completes drying exactly once;
- fish from a valid spot;
- bait increases activity and its visual effect appears/disappears;
- hive produces honey;
- torch protects from bee attack;
- burning a hive stops production and does not duplicate reward;
- trap bait changes behaviour and is consumed/returned according to the chosen lifecycle;
- NPCs gather/store/consume new food;
- stream-out/in does not duplicate or lose items/processes/state.

### Technical verification

Run the normal repository checks after implementation:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Browser/manual verification is required for the Three.js interactions, fishing visuals, drying-rack presentation, hive/bee behaviour and bait water effects.

## 17. Important discrepancies / decisions to record

1. **Plan 159 says `TimedProcess.completedAt` is state; it should preferably be derived from `startedAt + duration`.** Persist only what is authoritative.
2. **Plan 159 says freshness may use `ItemInstance`; this conflicts with 155's explicit decision that stackable items remain count-based.** Use stateful stack buckets, not one instance per food unit.
3. **`dried_meat` already exists.** Do not create it again; extend its acquisition path.
4. **`raw_meat` is not the only meat kind.** Plan 134 already has species-specific meat and a shared harvest mapping; preservation/cooking should reuse that mapping.
5. **Tomato already has a renewable garden spawn path.** Extend the same mechanism for missing crops instead of adding crop infrastructure.
6. **There is no fishing, bee/hive or TimedProcess system today.** These are genuinely new domain features, but they should remain small and data/state driven.
7. **Plan 141 already has the correct trap runtime seam.** Bait belongs in `animalTraps.ts` + `PlacedTrapRecord`, not in a new bait manager.
8. **Plan 106 already owns player food consumption and needs.** Plan 159 must not create another food-consumption path.
9. **Plan 156 is already the generic logistics mechanism.** New food sources must plug into it rather than create food-specific transport.
10. **SaveData is v17.** Freshness, timed processes, fishing bait and new persistent world objects require a deliberate schema migration; do not hide state in `Object3D` or UI.

## 18. Scope guard

Do not implement in this plan:

- fish population/migration/ecology;
- advanced bee breeding;
- refrigerators;
- fermentation;
- disease/poison framework for spoiled food;
- dynamic food pricing;
- a dedicated food/logistics manager;
- a dedicated fishing manager;
- a dedicated preservation/drying manager;
- a dedicated trap-bait manager.

The architectural target remains:

```text
Item definitions + Inventory
        ↓
shared food state / freshness
        ↓
existing world sources + NPC logistics + player needs
        ↓
small persistent timed/world-state records
        ↓
existing interaction / rendering / persistence seams
```

No feature implementation, commit or push is part of this review.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
