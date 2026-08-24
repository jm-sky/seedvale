# Plan: Natural Food, Fishing, Preservation and Bait — implementation notes

**Created:** 2026-08-18  
**Status:** `verification needed` 🔍 — implemented 2026-08-20, see plan §18 "Implementation summary" for what actually shipped and where it deviated from these notes (drying rack and hive ended up as deterministic settlement landmarks rather than player-placed/crafted, trap bait auto-loads on arm rather than a separate action).  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~155~~ ~~156~~ ~~106~~ ~~141~~

## 1. Review result

Plan 159 remains a valid feature boundary. The implementation must extend the current item, inventory, consumable, storage, resource, fauna, interaction and persistence seams instead of introducing parallel systems.

Current dependency state:

- **155 done:** `Inventory` now separates stackable `ItemKind → count` storage from individually stateful `ItemInstance` storage. Food remains stackable; do not create one instance per food unit.
- **156 done:** household/settlement storage and the generic NPC transport contract already exist. Food must continue through existing stock ownership and transport rather than a food logistics system.
- **106 done:** player hunger/thirst/food consumption is established. Extend the existing consumable model and consumption path.
- **141 done:** traps have a persisted world-record lifecycle and shared runtime. Trap bait extends `PlacedTrapRecord`/`animalTraps.ts`.

The old notes claiming 155 was planned and SaveData was v17 are obsolete. The current persistence baseline is **v19**, including `inventoryInstances`.

## 2. Current ownership anchors

### Items / inventory

- `src/items/items.ts` — authoritative `ItemKind` and item-facing metadata.
- `src/items/itemCatalog.ts` — central gameplay/item definitions and consumable metadata.
- `src/items/Inventory.ts` — stackable inventory plus completed 155 instance storage.
- `src/items/createItemSpawners.ts` — existing renewable/one-time item source mechanism.
- `src/items/campfireCooking.ts` — existing cooking recipe seam.
- `src/items/tradeCatalog.ts` / `src/items/trade.ts` — existing merchant stock/pricing.

### Player

- `src/player/PlayerNeeds.ts` — player need ownership.
- existing consumption/interactions — reuse rather than create a food manager.

### NPC / settlement

- `NpcAgent` / `NpcPlannedAction` — existing gather/carry/deposit lifecycle.
- `Household.stock` — household stock owner.
- `SettlementEconomy` — settlement stock owner.
- physical storage props/interactions from 156 — presentation of authoritative stock.

### Fauna / traps

- `src/fauna/AnimalAgent.ts` and existing corpse/harvest lifecycle — species meat source.
- `src/fauna/animalMeat.ts` — species → meat mapping.
- `src/world/animalTraps.ts` — pure trap rules and `PlacedTrapRecord`.
- `src/world/createPlacedTraps.ts` — runtime trap orchestration.

### World / persistence

- `src/app/worldBundle.ts` — runtime lifetime boundary.
- `src/persistence/saveData.ts` — canonical persistence, currently v19.
- world time/weather remains deterministic; do not add another world-time history.

Simulation state must remain outside Three.js `Object3D`s.

## 3. Shared food model

### 3.1 Food stays stackable

155 establishes the identity boundary. `ItemInstance` is for individually stateful items such as traps. Food must remain in stackable inventory/storage.

Use a stateful stack/bucket concept only where needed:

```ts
ItemStackState {
  kind: ItemKind
  count: number
  acquiredAtDays: number
}
```

An equivalent absolute spoilage deadline is also valid. The important rule is that freshness belongs to the stack, not to an individual food unit.

Conceptually:

```text
same kind + compatible age → same stack
same kind + incompatible age → separate stack
```

Do not split all food into instances.

### 3.2 Central item metadata

Extend `ItemCatalogEntry` with an optional food block rather than adding a second food registry:

```ts
food?: {
  foodValue: number
  freshness?: {
    freshDurationDays: number
    mediumDurationDays: number
  }
  bait?: 'meat' | 'plant'
}
```

Spoilage is derived from item definition + stack timestamp + world time. Do not create a `FreshnessManager` or per-frame freshness mutation.

Honey can explicitly have no spoilage deadline.

## 4. Existing and new items

Reuse existing food wherever possible:

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

Potentially new item kinds only where absent:

- berries
- apple
- nuts
- honey
- carrot
- potato
- cabbage
- fish
- dried fish

Do not add fresh/spoiled/bait variants as separate item kinds.

`dried_meat` is extended as an existing product, not duplicated.

## 5. Freshness resolver

Use a pure resolver conceptually equivalent to:

```ts
getFreshness(itemKind, acquiredAtDays, nowDays): FreshnessState
```

with:

```text
fresh → medium → spoiled
```

The stage is derived. Persistence stores the timestamp/deadline required to derive it.

Inventory/storage operations must preserve this state through add/remove/split/merge and transfers.

Merge only compatible stacks. Do not silently refresh a stack when it enters household/settlement storage.

Player and NPC consumption must use the same resolver and item definition.

In scope there is no disease framework. Spoiled food should therefore be non-consumable or have a specifically defined reduced/zero value, not invent a parallel health system.

## 6. Natural food / crops / resources

Extend existing source ownership:

- mushroom keeps its current chunk-item lifecycle;
- simple renewable pickups use existing item spawners/source mechanisms;
- crops reuse existing garden anchors used by tomato;
- fruit should reuse existing tree/resource lifecycle where possible.

Do not create `AppleSystem`, `BerrySystem`, `CropManager` or another resource manager.

All gathered food becomes normal inventory items, allowing the same player/NPC/storage/consumable mechanisms.

## 7. Player consumption and cooking

Plan 106 remains the ownership boundary for player needs and food consumption.

Extend existing consumable definitions and `eatFood()` behavior. Do not create a new player food system.

Extend `src/items/campfireCooking.ts` rather than create another cooking system.

Cooking:

```text
source food stack
→ existing cooking interaction/recipe
→ consume source
→ create output stack with new production timestamp
```

The cooked item gets its own freshness timeline. Do not carry the raw item's old spoilage deadline into the output.

Existing busy-channel cooking remains separate from background timed processes.

## 8. TimedProcess

There is no need for a global manager. Introduce a small persistent value used by background processes such as drying:

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

Completion is derived from start + duration. Progress is derived for UI.

The owner of the process is authoritative. The process must survive stream-out, reload and time-skip without requiring a live `Object3D` or per-frame manager.

Completion can be resolved when the owning state is updated/read; do not add a global per-frame tick unless implementation evidence proves it necessary.

## 9. Preservation / drying

Reuse `dried_meat` and add `dried_fish`.

A drying rack should follow the existing persistent-world-object pattern:

```text
persistent record
→ interaction/runtime
→ presentation Object3D
```

Example authoritative record:

```ts
DryingRackRecord {
  id: string
  x: number
  z: number
  yaw: number
  process: TimedProcess | null
}
```

Do not create a drying manager.

## 10. Fishing

Fishing is new, but it does not need a simulation subsystem.

Use existing interaction/action infrastructure and water/coast detection where possible.

Conceptual flow:

```text
fishing action
→ deterministic spot/attempt key
→ seeded catch roll
→ fish ItemKind or no catch
→ normal inventory stack
```

The rod is a normal tool item.

Fishing spots should preferably be derived from existing water geometry rather than persisting every possible spot. Only persistent state such as bait needs to survive streaming when it cannot be derived.

No fish agents, fish populations, migration or ecology in this plan.

## 11. Fishing bait

Bait is an existing food item with bait capability in the central item catalog.

Persistent effect:

```ts
FishingBaitState {
  kind: ItemKind
  appliedAtDays: number
  expiresAtDays: number
  strength: number
}
```

The state belongs to the fishing spot/domain, not its rendered object.

Catch probability reads this state. Reapplication can refresh or strengthen it according to a central rule.

Presentation is transient only:

- throw animation;
- particles;
- local water effect;
- fade-out.

The effect must continue while the area is streamed out.

## 12. Bees / honey

Keep the bee feature minimal.

Production is a world-time rule owned by persistent hive state, not a bee-agent simulation.

Use existing interaction, health/damage, torch/fire and item mechanisms.

Persist only state necessary for:

- production timing;
- burned state;
- one-time reward after burning.

Bee visuals may be transient. Do not create a bee manager or separate combat/damage system.

## 13. Trap bait

Extend the completed 141/155 trap lifecycle.

Use central item metadata:

```ts
bait?: 'meat' | 'plant'
```

and trap state:

```ts
baitKind: ItemKind | null
```

Loading bait is atomic:

```text
validate item
→ remove one item
→ store ItemKind on trap
→ existing trap detection/capture rule applies bonus
```

`src/world/animalTraps.ts` remains the pure rule owner. `createPlacedTraps.ts` remains orchestration.

Prefer returning bait on disarm/collect before capture and consuming it on successful capture, unless current trap lifecycle evidence requires another rule.

Do not add `MeatBait`, `PlantBait` or a bait manager.

## 14. NPC / household / settlement integration

156 is done and should be treated as the existing storage/logistics boundary.

Target flow:

```text
food source
→ existing NPC gather/carry/deposit
→ Household.stock / SettlementEconomy
→ existing NPC consumption
```

No `HouseholdFoodInventory`, food transport or food logistics manager.

If freshness requires `Household.stock` / settlement stock to hold stateful food stacks, extend those existing representations. Do not create a parallel stock structure.

The later player storage/containers work (164) and helper delivery (167) are not dependencies and should not be absorbed into 159.

## 15. Persistence / migration

Current baseline is **SaveData v19**.

Plan 159 needs the next schema migration for whichever authoritative state is actually introduced, potentially including:

- stateful food stack timestamps/deadlines;
- drying rack/process records;
- fishing bait state;
- hive production/burn state;
- trap bait state if not already represented by existing trap persistence.

Do not persist derived freshness stages, UI progress, particles or ordinary live fauna/render objects.

Migration must preserve v19 `inventoryInstances` and existing stackable inventory.

Before implementation, audit the exact save schema and choose the smallest authoritative representation; do not pre-allocate fields for speculative future systems.

## 16. Implementation order

### Phase 0 — dependency alignment

1. Verify completed 155 inventory instance boundary and v19 persistence.
2. Verify completed 156 stock ownership and transport.
3. Verify 106 consumption/needs seam and 141 trap lifecycle.

### Phase 1 — shared item model

1. Extend `ItemCatalogEntry` food metadata.
2. Add only missing food items.
3. Add tests for definitions.

### Phase 2 — stateful food stacks / freshness

1. Add minimal stack state.
2. Add pure freshness resolver.
3. Update merge/split/add/remove and existing storage transfer.
4. Update player/NPC consumption.
5. Add persistence migration and round-trip tests.

### Phase 3 — natural food / crops

Extend existing source/spawner/garden mechanisms.

### Phase 4 — cooking integration

Extend existing campfire recipes and output freshness semantics.

### Phase 5 — TimedProcess / preservation

Add persistent process value, drying rack lifecycle and dried-fish output.

### Phase 6 — fishing / bait

Add rod, action, deterministic catch, persistent bait state and transient visual effects.

### Phase 7 — bees / honey

Add minimal hive state, production and fire/torch interaction.

### Phase 8 — trap bait

Add bait metadata and `PlacedTrapRecord` integration.

### Phase 9 — NPC integration / audit

Verify existing gather/storage/consumption paths for all new products.

## 17. Verification focus

Verify:

- 155 `ItemInstance` storage remains separate from food stacks;
- freshness survives inventory/storage transfer and save/load;
- incompatible food ages do not merge;
- player and NPC use the same freshness/consumable rules;
- existing `dried_meat` is reused;
- cooking uses the existing recipe system;
- drying completes after reload/time-skip without a live render object;
- fishing produces ordinary inventory items;
- bait state survives stream-out/in and expires by world time;
- hive production and one-time burn reward survive reload/streaming;
- trap bait modifies existing trap rules and is conserved/consumed exactly once;
- no food/resource/storage/fishing/trap manager duplicates an existing mechanism;
- SaveData migration preserves v19 state and does not persist derived/presentation data.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
