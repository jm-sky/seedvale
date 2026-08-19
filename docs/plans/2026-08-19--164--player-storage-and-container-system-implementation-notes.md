# Plan 164 — Player Storage & Container System — Implementation Notes

**Reviewed:** 2026-08-19  
**Plan:** `2026-08-19--164--player-storage-and-container-system.md`  
**Status:** implementation notes  
**Source of truth:** current code, tests/build configuration and the completed plan 156 implementation notes.

## 1. Review verdict

Plan 164 is directionally correct, but implementation must be anchored in the existing `Inventory`, `ItemInstance`, world-object lifecycle, persistence and the storage ownership established by plan 156.

The most important rule is:

> **`Container` must become a reusable world/storage concept, not a second inventory system.**

Do not create `ChestSystem`, `StorageInventory`, `ContainerManager`, `PlayerStorageManager` or a second persistence path.

The plan should be implemented by extending existing mechanisms:

```text
Inventory
    ↓
items / ItemInstance

world object lifecycle
    ↓
placed container

Household / SettlementEconomy
    ↓
existing simulation ownership

SaveData
    ↓
persistent container records
```

The physical container is a world-facing object. Its contents are authoritative simulation state, not `Object3D.userData`.

## 2. Current Inventory facts

`src/items/Inventory.ts` is already the generic item carrier used by both the player and `NpcAgent`.

It currently contains two distinct representations:

```ts
counts: Map<ItemKind, number>
instances: Map<string, ItemInstance>
```

`totalWeight()` already accounts for both stack counts and individual `ItemInstance`s. `canAdd()` applies the existing weight limit to stackable items and `canAddInstance()` does the same for instances. `toJSON()` remains count-based while `instancesToJSON()` serializes instance state separately.

Therefore:

- do not create another inventory class for containers;
- do not create `ContainerInventory`;
- reuse `Inventory` for item transfer wherever the contents are ordinary player/NPC items;
- preserve the distinction between count-based items and instance-backed items;
- keep `Inventory.maxWeight` derived rather than persisted.

The current default inventory weight limit is 20 kg, while callers can supply their own limit. Plan 164 should extend the existing player carry model rather than introducing a separate load calculation.

## 3. ItemInstance is already the correct identity mechanism

`src/items/itemInstances.ts` defines:

```ts
export type ItemInstance = {
  id: string
  kind: ItemKind
}
```

and currently uses instance-backed state for traps.

The important implication for containers is:

- do not invent another physical-item identity abstraction;
- if a future container itself needs instance identity, use the same stable item/world identity conventions rather than a `ChestId` parallel system;
- contents that are instance-backed must retain their existing IDs when moved between inventory and container;
- ordinary stackable contents can remain count-based.

Do not turn every item into an `ItemInstance`. The existing split is intentional.

## 4. Container ownership — make this explicit before coding

Plan 156 established the crucial ownership rule:

```text
Household
    ↓
food / wood stock + separate water reserve

SettlementEconomy
    ↓
settlement-wide economic stock

NPC
    ↓
temporary carrying only

physical storage prop
    ↓
presentation of the authoritative state
```

Plan 164 must preserve this rule.

A player-owned container is different from household/settlement stock because its contents are actual item belongings, not a projection of `Household` or `SettlementEconomy`.

The generic abstraction should therefore distinguish:

```text
Item container
    owns Inventory-like contents

Household/settlement storage prop
    represents existing simulation stock
```

Do not merge the two ownership models merely because both are visually called “storage”.

If plan 164 introduces a generic `Container`, its data model should be capable of representing a real item container while still allowing the same concept to be reused later by household/settlement logistics without duplicating storage infrastructure.

## 5. Do not duplicate plan 156 storage

Plan 156 is already implemented and uses physical household/settlement containers as presentation and interaction over existing `Household` / `SettlementEconomy` state.

Therefore plan 164 must **not**:

```text
Household
  ↓
HouseholdStorageInventory
  ↓
Container
```

or:

```text
SettlementEconomy
  ↓
SettlementContainerInventory
  ↓
Container
```

when the existing stock APIs already provide the authoritative quantity.

Instead:

```text
Household / SettlementEconomy
             ↓
       existing storage prop
             ↓
          generic UI
```

The generic container interaction UI may be shared, but ownership and mutation rules remain those of the underlying simulation system.

## 6. Container should be a small domain model

Keep the first `Container` abstraction deliberately small.

Conceptually it needs:

```text
id
kind
capacity
baseWeight
contents
placed/unplaced state
position when placed
```

But do not blindly persist all of these fields.

Derived data should remain derived from the container definition:

```text
containerKind
    ↓
ContainerDef
    ├── capacity
    ├── baseWeight
    ├── cost
    └── visual/model data
```

Runtime/save state should contain only what cannot be reconstructed:

```text
containerId
containerKind
contents
placed state
position/yaw if required
```

This follows the existing `PlacedTrapRecord` pattern: world records persist state, while definitions remain centralized.

## 7. Container contents should reuse Inventory semantics

The strongest reuse option is to let the generic container own the same item concepts already understood by `Inventory`, rather than defining another `StoredItem` representation.

However, do not automatically embed a full player `Inventory` object if that creates irrelevant semantics such as player carry weight or `HeldTool` coupling.

Prefer a narrow shared contents abstraction only if the current implementation needs it, backed by the same primitives:

```text
counts
instances
weight calculation
add/remove
serialization
```

The key requirement is **one item representation**, not necessarily one class instance.

Do not create a second `ContainerItemInstance` type.

If a small refactor is required to share item-content logic between `Inventory` and `Container`, keep it domain-level and dependency-light. Avoid a large generic inventory framework.

## 8. Weight vs size — keep the two axes independent

`ItemDef` currently contains `weight`, and `Inventory.totalWeight()` derives mass from `ITEM_DEFS[kind].weight`.

Plan 164 adds `ItemSize` as a second property. This should be added to `ItemDef`, not maintained in a separate unrelated item-size table unless the current item architecture makes that clearly preferable.

Recommended direction:

```ts
export type ItemSize = 'XS' | 'SM' | 'MD' | 'LG' | 'XL'

export type ItemDef = {
  ...
  weight: number
  size: ItemSize
}
```

Then:

```text
weight → carried mass
size   → container/item capacity usage
```

Do not derive size from weight. The plan explicitly requires independence, and current item definitions already contain enough semantic information to assign size deliberately.

Review the complete `ItemKind` list before assigning final values. Do not classify only weapons and tools and leave resources/food undefined.

## 9. Capacity should be a scalar, not Tetris

The plan explicitly excludes physical packing.

Use an abstract capacity unit, for example:

```text
XS = 1
SM = 2
MD = 3
LG = 4
XL = 6
```

The exact values should be chosen from the actual catalogue, then used consistently by inventory/container capacity checks.

Do not add:

- coordinates for individual items;
- rotations;
- rectangular footprints;
- slot grids;
- packing algorithms.

Capacity should answer one question:

> Can this item be stored here?

It should not simulate how the item is physically arranged.

## 10. Inventory capacity must not replace weight capacity

The current `Inventory` uses weight as its existing carry constraint.

Plan 164 asks for an additional `ItemSize`-based limitation.

Therefore the final player inventory check should conceptually be:

```text
weight capacity OK
AND
size capacity OK
```

Do not reinterpret `Inventory.maxWeight` as a size capacity.

A small, heavy item should fail only the weight rule if it exceeds weight capacity. A large, light item should fail the size rule if it exceeds available item capacity.

This distinction must also be preserved for containers.

## 11. Stacks need one explicit rule

Existing `Inventory` counts stackable items by `ItemKind`.

For capacity:

```text
stack quantity × item size
```

is the simplest consistent interpretation.

Do not make one stack occupy the same size as one physical item.

For example, if `stone` is `SM`:

```text
10 stone → 10 × SM capacity
```

unless the implementation discovers an existing stack-size abstraction that already defines a different semantic rule.

Keep the rule centralized so player inventory and containers cannot disagree.

## 12. Item instances inside containers

Instance-backed items, such as traps, must preserve identity and state when transferred.

Correct:

```text
Inventory
  trap instance id=A durability=50
        ↓
Container
  trap instance id=A durability=50
```

Incorrect:

```text
Inventory
  trap instance A
        ↓
Container
  trap_simple ×1
```

The second form destroys instance state and would break the work already done in plan 155.

Container transfer should therefore support both:

```text
count item transfer
instance item transfer
```

without converting one representation into the other.

## 13. Purchased empty container

The first concrete container is a box purchased from the merchant.

Current trade code already assumes ordinary purchases can call `inventory.add(kind, 1)`, while instance-backed kinds require instance creation.

Do not make the merchant UI directly construct a world chest.

The clean boundary is:

```text
Merchant transaction
    ↓
create/purchase container item
    ↓
player Inventory
    ↓
player places it
    ↓
world Container record
```

The merchant transaction should remain an item/economy operation. Placement should remain a world operation.

If the box is not yet an `ItemKind`, do not force it into the ordinary stackable item catalogue merely to make the transaction work. First inspect the existing placement-item patterns (`tent`, traps, etc.) and use the closest existing lifecycle.

The important requirement is that buying an empty box creates a persistent, individually identifiable physical container once placed.

## 14. Placed container lifecycle

Use the existing placed-world-object pattern.

`PlacedTrapRecord` is a useful architectural reference:

```text
plain persisted record
        ↓
world runtime/scene object
        ↓
collect/remove
```

A container should follow the same separation:

```text
ContainerRecord
    ↓
createPlacedContainers / existing world creation path
    ↓
Three.js Object3D
```

Do not store authoritative contents in the `Object3D`.

When streamed out:

```text
ContainerRecord remains
Object3D disappears
```

When streamed in:

```text
ContainerRecord
    ↓
rebuild Object3D
```

This is especially important because plan 164 explicitly requires world persistence and streaming compatibility.

## 15. Picking up a container

Picking up a container is not a special “carry chest” system.

Treat it as a state transition of the same container record:

```text
placed container
    ↓
remove from placed-world representation
    ↓
unplaced/carried container state
```

Its contents remain attached to the same container identity.

The player carry load becomes:

```text
player item load
+
container base weight
+
container contents weight
```

Do not copy the contents into player inventory when the player picks up the container. That would:

- lose container identity;
- bypass container capacity;
- make it impossible to preserve the exact container as one object;
- create unnecessary transfer complexity.

The carried container should therefore be represented as a carried object/state, not as dozens of newly-added inventory items.

## 16. Player encumbrance should reuse current weight calculation

The existing inventory already provides `totalWeight()` and has a default 20 kg capacity.

Plan 164 should extend the player's load calculation rather than introducing `PlayerCarrySystem`.

Conceptually:

```text
inventory.totalWeight()
+
carried container totalWeight()
+
other existing carried equipment if applicable
```

Then apply the encumbrance function.

The exact speed curve should be smooth around the 10% and 30% thresholds. Avoid a discontinuous rule such as:

```text
10.00% = normal
10.01% = 50%
```

Prefer a continuous interpolation across the overload band.

At more than 30% overload, movement is blocked as specified by the plan.

Do not duplicate weight computation in UI and movement code. Have one authoritative load calculation and expose derived state to UI/movement.

## 17. HeldTool compatibility

`HeldTool` is a separate single-slot player state and should remain so.

Do not turn it into container contents and do not replace it with the new size system.

When extending `Inventory`, preserve the existing relationship:

```text
Inventory
    = stored/carryable items

HeldTool
    = current selected tool slot
```

Only share common item-definition data where appropriate.

## 18. Generic container interaction UI

The UI should be a generic `Container` interaction, not `Chest` UI.

The plan is correct to use the existing trader UI as a visual/interaction reference because that screen already handles two-sided item transfer concepts.

Reuse existing Vue components/store patterns where possible.

Target model:

```text
Container side
    items / capacity / weight

Player side
    items / capacity / weight
```

The UI should request transfer operations from the domain/application layer. It should not mutate `Inventory` maps directly.

Do not create a second item rendering model if the existing inventory/trade view models can be extended.

## 19. Mobile/touch

Do not implement a separate mobile container system.

The same transfer operation should work for:

```text
desktop click
mobile tap
```

The existing responsive inventory/trade interaction patterns should be reused.

Keep the transfer API independent of pointer/mouse events so desktop and touch invoke the same operation.

## 20. Atomic transfers

Every transfer must have a conservation invariant.

For player → container:

```text
player decreases N
container increases N
```

For container → player:

```text
container decreases N
player increases N
```

If the destination cannot accept the full transfer:

```text
source remains unchanged
```

or the operation explicitly transfers the accepted amount only.

Never:

```text
remove first
then discover capacity
```

without rollback.

For instance-backed items, move the same instance ID rather than reconstructing it.

## 21. Persistence architecture

Current persistence is application-level versioned `SaveData`, with canonical version 19 and `inventoryInstances` already represented explicitly.

Plan 164 should add container state through the same versioned `SaveData` chain.

Do not introduce:

```text
containerSave.json
container IndexedDB store
container localStorage key
```

unless the existing persistence architecture genuinely requires it.

Recommended shape is conceptually:

```ts
type SaveContainer = {
  id: string
  kind: ContainerKind
  x: number
  z: number
  yaw?: number
  placed: boolean
  contents: ...
}
```

Persist only state that cannot be derived from the container definition.

`capacity`, `baseWeight`, model information and price should remain derived from `ContainerKind` / definitions.

## 22. Container contents persistence

Do not serialize a runtime `Inventory` object directly.

Use the same separation already established for player inventory:

```text
counts → JSON count map
instances → separate instance rows
```

The exact representation may be a nested container payload if that is cleaner for the current `SaveData` shape, but it must preserve the existing `ItemInstance` semantics.

On load:

```text
validate save data
    ↓
construct container state
    ↓
restore counts
    ↓
restore instances
    ↓
rebuild world object
```

Malformed or duplicated instance IDs must not create duplicated physical items.

## 23. Streaming and persistence are separate concerns

Do not confuse:

```text
stream-out/in
```

with:

```text
save/load
```

The container must survive both.

Streaming should remove/recreate the visual/runtime object while retaining simulation state.

Save/load should serialize that state into `SaveData`.

The world bundle should not become the authoritative owner of container contents merely because it controls streaming.

## 24. Interaction with plan 156 storage

Plan 156's household/settlement storage is already tied to simulation registries and rebuilt from them.

Plan 164 should reuse its physical placement/interactable patterns and, where possible, its generic UI presentation.

But do not convert the plan 156 containers into player-owned item containers.

There are two valid states:

```text
Household/Settlement storage
    authoritative stock in simulation

Player-owned Container
    authoritative item contents in container state
```

The shared layer should be the world/container interaction mechanism, not the ownership model.

## 25. Future NPC/logistics compatibility

The generic API should not be player-only.

A future NPC should be able to use the same container concept:

```text
NPC
 ↓
open/access container
 ↓
transfer item
```

But do not implement NPC container manipulation in plan 164 unless required by the acceptance criteria.

The important design constraint is that the API should not contain player-specific assumptions such as:

```ts
moveFromPlayerInventoryToChest()
```

Prefer generic operations:

```text
transfer(source, destination, item)
```

or narrowly scoped container/item operations that can later be called by NPC logistics.

## 26. Avoid premature container variants

The plan correctly defers:

```text
Small Chest
Medium Chest
Large Chest
Barrel
Crate
Sack
```

Implement only the first purchased box/chest required for the acceptance criteria.

The future variation should be data-driven:

```text
ContainerKind
    ↓
ContainerDef
```

rather than subclasses with duplicated behavior:

```text
ChestSystem
BarrelSystem
CrateSystem
SackSystem
```

## 27. Recommended implementation order

### Phase 1 — audit existing mechanisms

Inspect only the concrete paths needed for implementation:

1. `Inventory` and current item-instance API.
2. `ItemDef` / complete `ItemKind` catalogue.
3. current merchant purchase transaction.
4. tent/trap placement lifecycle.
5. placed-world-object persistence and streaming.
6. plan 156 household/settlement storage implementation.
7. current interaction and trader UI.
8. player movement/load calculation.
9. `SaveData` version/migration chain.

Do not begin by designing a new storage architecture.

### Phase 2 — item size

Add `ItemSize` to the existing item definition model and classify every existing `ItemKind`.

Then add the minimal capacity calculation required by `Inventory`.

### Phase 3 — generic container domain

Create the smallest reusable container definition/state API possible.

Prove that it can hold:

- stackable items;
- instance-backed items;
- weight;
- size capacity.

### Phase 4 — purchased container

Connect merchant purchase to the existing economy/trade transaction and produce one empty container instance.

### Phase 5 — placed container

Use the existing placed-world-object lifecycle to place, stream and collect the container.

### Phase 6 — transfer UI

Reuse trader/inventory UI patterns for generic two-sided transfer, including touch.

### Phase 7 — carrying / encumbrance

Integrate container mass with the existing player load/movement path. Keep one authoritative load calculation.

### Phase 8 — persistence

Add container state to the existing versioned `SaveData` migration chain and test round-trip.

### Phase 9 — browser verification

Verify the complete lifecycle rather than individual rendering pieces.

## 28. Important edge cases

### Full container

```text
container nearly full
→ transfer exceeds capacity
→ operation rejected
→ source unchanged
```

### Heavy item

```text
size fits
weight does not
→ destination/container accepts by size only if its rules permit it
→ player load still increases by weight
```

Do not let container size silently replace item weight.

### Large light item

```text
weight fits
size does not
→ transfer rejected
```

### Instance-backed item

```text
trap id=A durability=50%
→ transfer
→ id=A durability=50%
```

### Pick up container

```text
placed container
→ carried container
→ contents unchanged
→ container identity unchanged
```

### Stream-out

```text
container visual removed
→ state retained
→ stream-in
→ same contents/identity restored
```

### Save/load

```text
container contents modified
→ save
→ load
→ same contents
```

### Failed placement

If placement is cancelled or invalid, the purchased/selected container must not disappear from the player's ownership state.

## 29. Performance guidance

Containers should be passive state most of the time.

Avoid:

- per-frame scans of all container contents;
- rebuilding container UI every frame;
- global storage managers ticking every container;
- workers for simple capacity/weight calculations;
- duplicating item state between UI, Object3D and persistence.

Use event-shaped updates:

```text
open container
→ read current state

transfer
→ mutate state
→ refresh affected UI
```

Streaming should rebuild only containers entering the active world area.

## 30. Verification priorities

### Item model

- every `ItemKind` has `ItemSize`;
- `ItemSize` is independent from `weight`;
- stack semantics remain unchanged;
- `ItemInstance` state remains intact.

### Inventory

- weight capacity still works;
- size capacity works;
- `HeldTool` remains compatible;
- NPC inventory remains usable for temporary carrying.

### Container

- empty container can be purchased;
- it has stable identity;
- it can be placed;
- it can be opened;
- items move in both directions;
- size capacity is respected;
- contents weight is included in total mass.

### Carrying

- empty container can be picked up;
- non-empty container can be picked up;
- its contents remain attached to it;
- total container mass affects player encumbrance;
- overload speed is smooth;
- >30% overload blocks movement.

### Persistence

- container survives save/load;
- contents survive save/load;
- instance IDs and state survive save/load;
- placed/unplaced state survives;
- streaming does not duplicate or delete contents.

### Compatibility

- plan 156 household/settlement storage still works;
- no second household/settlement inventory appears;
- no `ChestSystem` or `StorageManager` is introduced;
- future NPC access remains possible through generic container operations.

## 31. Final implementation rule

When the agent encounters a choice between:

```text
reuse existing Inventory / ItemInstance / placed-object / SaveData / plan-156 storage mechanism
```

and:

```text
create a new parallel abstraction
```

choose the existing mechanism unless there is concrete code evidence that it cannot support the requirement.

If a new abstraction is genuinely necessary, keep it narrow, document its ownership and make it reusable by player, NPC and future logistics rather than making it player-specific.
