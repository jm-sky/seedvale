# Plan 155 — Implementation Notes

**Reviewed:** 2026-08-18  
**Plan:** `2026-08-18--155--inventory-item-instances-and-trap-lifecycle.md`  
**Status:** implementation notes  
**Source of truth:** current code + tests + build configuration; `docs/STATE.md` is the current-state reference.

## 1. Review verdict

The plan is architecturally sound, but the implementation needs to respect several current-code constraints that are not obvious from the plan alone.

The important rule is: **do not replace `Inventory`'s count model. Extend it with a second instance collection.** Existing stackable items, NPC temporary inventories, item drops, tools and all existing callers must continue to use the count API.

The first implementation should be deliberately narrow:

- generic `ItemInstance` storage/API;
- `TrapItemInstance` state represented by `kind + durability`;
- stable ID transfer between inventory and world trap;
- trap purchase/place/collect/save/load/sell using the instance;
- instance-aware inventory weight;
- instance-aware inventory presentation for traps;
- instance-aware trade for manual/automatic/multi-sell;
- no migration of existing stackable items.

Do not create an inventory manager, item-instance manager, trap-inventory manager, or separate persistence manager.

## 2. Current code facts

### Inventory

`src/items/Inventory.ts` is currently a small class backed by:

```ts
private readonly counts = new Map<ItemKind, number>()
```

It owns weight calculation, capacity checks, add/remove/count/has/clear and JSON serialization. The same class is reused by the player and by `NpcAgent` for short-lived carrying.

Therefore:

- instance storage belongs inside `Inventory`;
- instance weight must participate in `totalWeight()` / `canAdd()`;
- `isEmpty()` must consider both collections;
- `clear()` must clear both collections;
- `toJSON()` should remain the count-based representation for compatibility;
- add a separate serialization method for instances rather than changing the meaning of `toJSON()`.

Do not make `Inventory` know about traps, durability formulas or world trap state.

### Existing trap world object

`src/world/animalTraps.ts` already defines `PlacedTrapRecord` with:

- stable `id`;
- `kind` (`simple | good`);
- world position/yaw;
- `state` (`placed | active | broken`);
- `durability`;
- `skillAtActivation`;
- `weatherCheckedAtDay`.

`src/world/createPlacedTraps.ts` already owns the runtime/scene lifecycle and returns records from `collect()`.

This is the correct boundary: the world record should temporarily own the same instance identity while the trap is placed, but world-only fields must not leak into inventory.

### Current trap purchase/place/collect path

`src/items/trade.ts` currently buys every item with `inventory.add(kind, 1)`. This is the main purchase path that must change for instance-backed kinds.

`src/app/createApp.ts` currently places a trap by:

1. checking `inventory.has(def.itemKind, 1)`;
2. busy-channel setup;
3. `inventory.remove(def.itemKind, 1)`;
4. `bundle.placedTraps.place(kind, x, z, yaw)`.

This loses the instance ID and durability. The completion callback must instead remove a concrete instance and pass that instance to the world trap.

Current collect does the opposite problem: it removes the world trap and then calls `inventory.add(def.itemKind, 1)`. That must become `inventory.addInstance(...)` with the returned instance data.

### Important existing discrepancy: broken traps

The current `createApp.ts` explicitly treats a broken trap as scrap and does not put it back into inventory.

That conflicts with plan 155, which explicitly requires:

- broken keeps ID/kind/durability 0;
- broken may be collected;
- broken may exist in inventory;
- broken may be sold for a very low price;
- broken cannot be activated again.

**Implementation decision: plan 155 wins here.** Change the current collect caller so a broken trap is converted to a `TrapItemInstance` and returned to inventory. Do not add repair or reactivation.

## 3. Item-instance model

Recommended location:

`src/items/itemInstances.ts`

Keep the model small and independent from `THREE`, Vue, `PlayerController` and world runtime.

Recommended shape:

```ts
export type ItemInstance = {
  id: string
  kind: ItemKind
}

export type TrapItemInstance = ItemInstance & {
  kind: 'trap_simple' | 'trap_good'
  durability: number
}
```

Use a discriminated union/type guard if useful, but do not introduce a general component/property system.

Durability is an instance property because it is the only persistent per-trap state required by this plan. `maxDurability` remains derived from the existing `TRAP_DEFS`.

Do not store:

- `maxDurability`;
- `TrapState`;
- x/z/yaw;
- skillAtActivation;
- weatherCheckedAtDay;
- price;
- weight;
- model URL.

All of those are either world-only or derived.

## 4. Stable ID

Use one stable ID for the physical item throughout its lifecycle:

`inventory instance → world trap → inventory instance`.

Do not generate a new ID during `place()`.

Prefer a small item-instance ID generator in the item domain rather than reusing the current `PlacedTraps` ID generator. The world record should receive an already-created ID.

The ID must be collision-safe for normal save/load and multiple purchases in one session. It must not depend on a Vue component or world manager.

Do not use array index as identity.

## 5. Inventory extension

Extend `Inventory` with a second private collection, for example:

```ts
private readonly instances = new Map<string, ItemInstance>()
```

Recommended API:

```ts
addInstance(instance): boolean
removeInstance(id): boolean
getInstance(id): ItemInstance | null
getInstances(kind): readonly ItemInstance[]
countInstances(kind): number
```

If callers need a concrete instance for placement, expose the instance itself through `getInstance()`; never expose the mutable internal map.

For safe mutation, `getInstance()` / `getInstances()` should return readonly views or copies consistent with the project's existing style. Do not let UI mutate durability directly.

### Count API decision

Do **not** silently redefine `count(kind)` / `has(kind)` to mean count-based + instance-based.

Existing code relies on the count model. Mixing the two semantics would make tools, stackables and UI availability difficult to reason about.

For instance-backed items use `countInstances()` / `getInstances()` explicitly.

Likewise, `inventory.add('trap_simple', 1)` must not be used to create a trap instance.

## 6. Weight and capacity

`Inventory.totalWeight()` currently iterates count entries. Extend it to add the weight of all instances using `ITEM_DEFS[instance.kind].weight`.

`canAdd(kind)` remains for count items.

Add an instance equivalent, e.g.:

```ts
canAddInstance(instance): boolean
```

The exact API may follow the local naming style.

This is important for trap placement/collect and broken traps. A broken trap still occupies the same inventory weight because its `kind` is unchanged.

No weight belongs in `ItemInstance`.

## 7. Purchase architecture

`src/items/trade.ts` currently assumes every purchased item is count-based. Change the transaction layer so instance-backed item kinds are purchased as instances while normal items still use `inventory.add(kind, 1)`.

Avoid hard-coding a complete list of instance behavior in the merchant UI.

Preferred boundary:

```text
trade transaction
    ↓
item-instance factory / capability lookup
    ↓
Inventory.addInstance()
```

The factory should return an instance only for kinds that are currently instance-backed. For ordinary stackables/tools it should return no instance and the existing count path remains unchanged.

For traps the factory creates:

```text
new ID
kind = trap_simple / trap_good
durability = TRAP_DEFS[trapKind].maxDurability
```

Keep the existing merchant catalog prices. Purchase price is not persisted on the instance.

Avoid importing world runtime modules into the generic item storage just to create an instance. In particular, do not create a circular dependency from `items/` → `world/animalTraps.ts` → `items/`.

If the current module boundaries make that awkward, keep the item-instance factory generic and let the trap-specific adapter supply the durability definition.

## 8. Trap placement boundary

Change the placement flow to:

```text
Inventory TrapItemInstance
        ↓ removeInstance(id)
PlacedTrapRecord
        ↓ place
world
```

The busy setup channel must continue to spend the item only when the channel completes, just like the current trap/tent behavior.

Important race/cancellation rule:

- before the channel starts, identify the selected instance ID;
- at completion, re-check that the exact instance still exists;
- remove that exact ID only after all placement checks still pass;
- create the world record using that same ID and durability.

Do not remove a generic `trap_simple` count.

`PlacedTraps.place()` should accept the source instance (or the minimal `{id, kind, durability}` data) instead of manufacturing a fresh durability/ID.

For a new purchase:

`100% → place → 100%`.

For a used trap:

`50% → place → 50%`.

## 9. World trap representation

Keep `PlacedTrapRecord` as the world representation. Do not replace it with `ItemInstance` because the world needs additional state.

The relationship is:

```text
ItemInstance
  id
  kind
  durability

PlacedTrapRecord
  id        ← same identity
  kind
  durability ← same value
  state
  x/z/yaw
  skillAtActivation
  weatherCheckedAtDay
```

When a trap is active, `state` is world-only.

When collected, create an item instance from:

```text
id
kind
current durability
```

Never copy:

```text
state
x/z/yaw
skillAtActivation
weatherCheckedAtDay
```

## 10. Trap lifecycle rules

Keep the existing trap states exactly:

```text
placed → active → placed
                 ↓
               broken
```

Do not introduce `used` as a state or item kind.

Activation is only possible when the instance is represented by a world trap in `placed` state and durability > 0.

A broken trap can be collected but cannot be activated.

The existing trap system remains responsible for capture, weather wear and the state transition to broken. Plan 155 only changes persistence of the item identity/condition across inventory/world boundaries.

### Weather caution

`spendTrapDurability()` currently returns `placed` whenever durability remains. `createPlacedTraps.applyWeather()` therefore changes an active trap to `placed` after weather wear.

Do not accidentally change this behavior while implementing plan 155 unless tests/current design explicitly require it. If the intended lifecycle is that weather keeps an armed trap active, fix that separately and add a focused trap test; do not hide the change inside the inventory-instance work.

## 11. Collect

The collect flow should be:

```text
PlacedTrapRecord
      ↓
TrapItemInstance { id, kind, durability }
      ↓
Inventory.addInstance()
```

Collection is allowed only for non-active traps, as today.

Both normal and broken traps return to inventory.

Capacity must be checked before mutating the world:

```text
if !inventory.canAddInstance(instance)
    keep world trap
    show capacity message
```

Only after successful capacity validation should `PlacedTraps.collect()` remove the world object.

Avoid the current pattern where `collect()` happens first and inventory insertion happens second without a rollback path.

## 12. Broken traps

Broken is a real item instance:

```ts
{
  id,
  kind: 'trap_simple' | 'trap_good',
  durability: 0,
}
```

It can:

- remain in inventory;
- survive save/load;
- be displayed;
- be sold.

It cannot:

- be activated;
- reset durability;
- become a repaired trap.

Broken price should use the dedicated low-value multiplier from the plan. Keep that value in the central trade/pricing layer, not in UI or `ItemInstance`.

## 13. Persistence

Current persistence is versioned and canonical at `SaveDataV17`. Every version is migrated explicitly through `toV10` → … → `toV17`.

Plan 155 should therefore introduce a new save version rather than adding an unversioned field to v17.

Recommended:

```ts
export type SaveItemInstance = {
  id: string
  kind: ItemKind
  durability?: number
}

export type SaveDataV18 = Omit<SaveDataV17, 'version'> & {
  version: 18
  inventoryInstances: SaveItemInstance[]
}
```

`durability` should only be present for instance types that need it. If a generic shape is preferable, keep it explicit and validated rather than using `Record<string, unknown>`.

Then:

```text
SaveDataV17 → toV18 → inventoryInstances: []
```

All older saves therefore keep their count inventory exactly as before and gain an empty instance collection.

Do not reconstruct trap instances from old `inventory.trap_simple` / `trap_good` counts. There is no historical durability/identity to recover.

Update:

- canonical `SaveData` type;
- `isSaveDataV18()`;
- `isSaveDataV17()` remains unchanged;
- `toV18()`;
- `loadSaveData()` chain;
- save snapshot creation;
- save/load tests.

The IndexedDB layer in `saveDb.ts` does not need a schema/database-version change. It already stores the complete `SaveData` object under one key; the application-level save version handles migration.

## 14. Save snapshot ownership

Find the current save construction in the app/composition layer and add:

```text
inventory: inventory.toJSON()
inventoryInstances: inventory.instancesToJSON()
```

Do not serialize the internal Map directly.

On load, construct the `Inventory` with the count inventory and then restore instances through `addInstance()` or a dedicated validated constructor path.

Do not let malformed save data bypass normal instance validation.

## 15. UI architecture

Current inventory UI is split between:

- `src/ui/createInventoryScreen.ts` compatibility facade;
- `src/ui-vue/screens/InventoryScreen.vue`;
- `InventoryScreenItemList.vue`;
- `InventoryScreenItemDetails.vue`;
- `src/ui-vue/mount.ts` / store plumbing.

The existing facade currently passes only count data to Vue. Extend the payload with instance-derived view data rather than passing the `Inventory` object itself.

Recommended view model for a grouped item:

```text
kind
count
condition: uniform | mixed | null
instances: [{ id, durability, conditionPercent }]
```

The UI must never own or mutate the canonical durability state.

### Main inventory list

Continue grouping by `ItemKind`.

For instance-backed traps:

```text
Pułapka prosta ×3
100%  → [100%]
100% + 50% → [mixed usage]
```

`mixed usage` is derived presentation state only.

Do not create a second persisted grouping model.

### Details screen

Show concrete instance breakdown, e.g.:

```text
2× Pułapka 100%
1× Pułapka 50%
```

The UI needs IDs for manual actions, but should not display raw IDs.

## 16. Manual sell

Manual selling must select concrete instance IDs.

Flow:

```text
UI selection
  ↓
instance IDs
  ↓
trade domain validation
  ↓
price resolver per instance
  ↓
remove selected IDs
  ↓
add shells
```

Never convert a selected instance back into `ItemKind + count` before the transaction.

This prevents the 50% vs 100% trap ambiguity.

## 17. Auto-sell

Auto-sell selection belongs in the domain/trade layer, not in Vue.

For instance-backed items:

```text
sort by condition ascending
→ choose N instance IDs
→ calculate their prices
→ transact atomically
```

Tie-breaking should be deterministic. If two instances have identical durability, use stable ID as the secondary ordering key.

Example:

```text
100%, 100%, 50%
Sell 1 → 50%
```

Do not make the UI guess which instance will be sold.

## 18. Trade pricing

Current `tradeCatalog.ts` has central `tradeValue()` / `sellPrice()` based on `ItemKind`.

Do not put price into `ItemInstance`.

Add a central resolver for instance sales, conceptually:

```text
resolveSellPrice(instance, context)
```

The first implementation can use:

```text
condition = durability / maxDurability
usageDiscount = 0.10 + 0.15 * (1 - condition)
price = basePrice * (1 - usageDiscount)
```

For broken:

```text
price = basePrice * BROKEN_SELL_MULTIPLIER
```

Round using the project's existing shell-price convention and clamp to a sensible minimum where required.

Keep all balancing constants in the trade domain/config, not in Vue components.

The resolver should accept a future context without implementing it now:

```text
vendor relationship
season
supply/demand
vendor state
```

Do not implement those modifiers in plan 155.

## 19. Atomic multi-sell

Follow the current trade philosophy: validate everything before mutation.

For a multi-sell transaction:

1. validate all IDs exist;
2. validate every selected instance is sellable;
3. calculate each price;
4. calculate total shell result;
5. verify all preconditions;
6. remove all selected instances;
7. add shells;
8. return result + selected IDs + total.

If one ID is invalid, no instance should be removed.

This is especially important because UI state can become stale between opening the details screen and confirming a sale.

## 20. Weight and UI refresh

Whenever an instance is added/removed, use the existing inventory-change synchronization path (`onInventoryChanged()` and the existing HUD refresh functions).

Do not add a parallel inventory refresh mechanism.

`inventory.totalWeight()` must already include instances, so the existing HUD weight display remains the single source of truth.

## 21. Existing stackable items

Do not migrate:

- wood;
- stone;
- food;
- resources;
- ordinary tools;
- any other count-based item.

A stackable item continues to use:

```text
add(kind, count)
remove(kind, count)
count(kind)
has(kind, count)
```

This is important because `NpcAgent` also uses `Inventory` as a temporary carrier.

No NPC instance behavior is needed in plan 155.

## 22. Suggested implementation order

Implement in this order to keep the work incremental:

1. Add `ItemInstance` / `TrapItemInstance` domain types and ID creation.
2. Extend `Inventory` with instance storage, instance API and combined weight.
3. Add unit tests for instance add/remove/get/count/weight/capacity.
4. Add save v18 + migration + instance serialization tests.
5. Change merchant purchase of trap kinds to create instances.
6. Change trap placement to consume a concrete instance and preserve ID/durability.
7. Change trap collect to return the concrete instance, including broken traps.
8. Add trade pricing for instances.
9. Add manual/auto/multi-sell domain operations.
10. Extend inventory UI/view models for grouped instances and details.
11. Wire manual/auto sell UI to instance IDs.
12. Run technical tests and then browser verification of the full lifecycle.

Avoid mixing unrelated trap lifecycle changes into these commits.

## 23. Tests to add/update

### Inventory

- add one instance;
- reject duplicate ID or define deterministic replacement behavior and test it — preferably reject;
- remove by ID;
- get by ID;
- get by kind;
- count instances by kind;
- total weight includes instances;
- capacity rejects an instance without mutating inventory;
- clear removes instances;
- old count API remains unchanged.

### Trade

- buying `trap_simple` creates one instance;
- buying three creates three IDs;
- new instance has max durability;
- broken instance price is low but non-zero;
- 100/75/50/25% prices follow the central formula;
- manual sell removes the selected ID;
- auto-sell chooses lowest durability first;
- equal durability tie-break is deterministic;
- multi-sell is atomic.

### Trap lifecycle

- place preserves ID;
- place preserves durability;
- collect preserves ID;
- collect preserves durability;
- broken collect creates an inventory instance with durability 0;
- broken instance cannot be activated;
- place/collect/place preserves the same ID;
- world-only fields never enter the inventory instance.

### Persistence

- v17 migrates to v18 with `inventoryInstances: []`;
- current v18 round-trips instances;
- durability round-trips;
- IDs round-trip;
- broken instance round-trips;
- count inventory remains unchanged;
- malformed instance records are rejected by the save validator.

## 24. Browser acceptance path

Use one concrete trap through the complete lifecycle:

1. Buy three simple traps.
2. Verify they are three separate instances.
3. Place one.
4. Activate it.
5. Let it lose durability through a real capture/weather path.
6. Collect it.
7. Verify inventory contains two 100% + one used instance.
8. Open details and verify the mixed condition display.
9. Save.
10. Reload.
11. Verify the used instance keeps the same condition and identity.
12. Place the used instance again.
13. Verify durability does not reset.
14. Break a trap.
15. Collect the broken trap.
16. Verify broken appears in inventory.
17. Sell the specific broken instance.
18. Verify auto-sell chooses the lowest-condition instance.
19. Verify multi-sell removes exactly the selected IDs and pays the correct total.

The browser test should specifically catch the original bug: `50% → collect → place` must remain `50%`.

## 25. Performance / architecture guardrails

Inventory instances are tiny data objects. They must not introduce game-loop work.

Do not:

- scan all instances every frame;
- calculate sell prices every frame;
- rebuild UI grouping every frame;
- create reactive Vue state around the whole `Inventory` object;
- add a worker for inventory/trade;
- introduce a global item-instance manager.

Compute grouping and condition summaries only when inventory UI is opened/refreshed.

Trade calculations happen only during merchant interaction.

## 26. Files likely to change

Expected core files:

- `src/items/Inventory.ts`
- new `src/items/itemInstances.ts` (or equivalent small item-domain module)
- `src/items/trade.ts`
- `src/items/tradeCatalog.ts`
- `src/persistence/saveData.ts`
- `src/persistence/saveData.test.ts`
- `src/app/createApp.ts`
- `src/world/createPlacedTraps.ts`
- possibly `src/world/animalTraps.ts` only for a narrow adapter/type boundary
- `src/ui/createInventoryScreen.ts`
- `src/ui-vue/screens/InventoryScreen.vue`
- `src/ui-vue/screens/InventoryScreenItemList.vue`
- `src/ui-vue/screens/InventoryScreenItemDetails.vue`
- relevant merchant UI/store files
- relevant inventory/trade/trap tests.

Do not modify unrelated NPC inventory behavior or create a new manager.

## 27. Decisions summary

| Topic | Decision |
|---|---|
| Inventory model | Keep counts + separate instances |
| Stackables | Stay count-based |
| Trap identity | Stable `id` across inventory/world/inventory |
| Trap condition | `durability` on instance |
| Trap world state | Remains `PlacedTrapRecord.state` |
| Trap position | World-only |
| Skill snapshot | World-only |
| Weather cursor | World-only |
| Price | Derived, never persisted |
| Broken trap | Collectable instance with durability 0 |
| Repair | Out of scope |
| New ItemKinds | None |
| Persistence | New save version, migrate old saves to empty instances |
| Old saves | Never reconstruct trap instances from counts |
| Manual sell | Concrete instance IDs |
| Auto-sell | Domain-level worst-condition selection |
| Multi-sell | Validate + price first, then atomic mutation |
| UI grouping | Derived by `ItemKind` |
| Mixed condition | Presentation-only derived state |
| Performance | No per-frame instance scans |

## 28. One implementation trap to avoid

The easiest incorrect implementation is to make instances look like counts at the boundaries:

```text
buy → add(kind, 1)
place → remove(kind, 1)
world → new trap
collect → add(kind, 1)
```

That recreates the exact bug this plan exists to remove.

The correct invariant is:

```text
purchase
  → ItemInstance(id=A, durability=100)
  → world trap(id=A, durability=100)
  → world trap(id=A, durability=50)
  → ItemInstance(id=A, durability=50)
  → save/load
  → ItemInstance(id=A, durability=50)
  → world trap(id=A, durability=50)
  → sell(id=A)
```

If an implementation step loses `id` or `durability`, stop there and fix the boundary before continuing.
