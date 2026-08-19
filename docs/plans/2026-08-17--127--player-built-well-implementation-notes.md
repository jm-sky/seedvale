# Plan 127 — Player-Built Well — Implementation Notes

## Current repository context

Plan 127 should extend existing world/water/placement mechanisms rather than introduce a dedicated well subsystem.

Relevant current concepts:

- `WaterSource` is the existing source model and remains the source-of-truth abstraction for water availability.
- `Household.water` is the household's water reserve; a well must not duplicate this state.
- Player-placed world objects already use a persistent record + runtime mesh pattern. `PlacedTents` and `PlacedTraps` are useful architectural precedents.
- `Inventory` already supports ordinary counts and persistent `ItemInstance` records. Construction must use it rather than a parallel material store.
- `WorldBundle` is the composition point for world runtime state and save/load reconstruction.
- Colliders are shared infrastructure; the well must register there rather than implement its own collision mechanism.
- Existing water gathering/interaction and household logistics should remain the path from source to household reserve.
- Survival needs already have a shared Thirst model; the well should expose an ordinary usable water source to that model.

## State ownership

Use a small persistent record owned with other player-placed world objects:

```text
wellId
x
z
yaw
```

Runtime-only values such as mesh, collider handle and derived `WaterSource` registration should be reconstructed from this record.

Ownership must remain explicit:

```text
PlayerWell record → existence and placement of the player-built object
WaterSource      → usable water-source representation
Household.water  → household water reserve
Thirst           → actor need state
```

Do not put household water quantity on the well.

## Recommended integration shape

Prefer the existing placed-object collection pattern:

```text
initial saved records
        ↓
createPlacedWells(...)
        ↓
spawn mesh
        ↓
placeOnGround
        ↓
register collider
        ↓
register/expose WaterSource
```

The exact module name should follow current repository conventions discovered during implementation. Do not introduce a generic `WellSystem` merely to own this collection.

The collection should expose the same sort of operations already used by other placed objects where needed:

- list runtime entries,
- serialize records,
- place,
- remove/collect if the final design allows removal,
- dispose.

The persistent record must remain serializable without Three.js objects.

## Placement

Reuse existing player placement infrastructure and ground sampling.

Placement must validate against existing world/settlement constraints and register the resulting collider in the shared collider registry. NPC navigation/approach should therefore automatically see the same obstacle rather than requiring well-specific avoidance code.

The interaction point around the well should follow existing collider-rim/approach conventions so the player and NPC can reach the water source without entering the collider core.

## WaterSource integration

First inspect the current `WaterSource` contract and its consumers before adding fields or constructors.

The preferred result is:

```text
player-built well
      ↓
existing WaterSource abstraction
      ↓
existing source discovery / selection
      ↓
existing water interaction
```

If `WaterSource` currently represents only generated/natural sources, extend that abstraction minimally so both natural and player-built sources can be consumed through the same code path.

Do not create:

- `WellWaterSource`,
- `WellSystem`,
- `WellInteractionSystem`,
- a second water-source registry,

unless current code inspection proves an existing abstraction cannot represent the object. Even then, prefer a minimal extension of the existing owner.

## Household water and logistics

The well itself is not a household container.

Water should continue to flow through the existing gathering/logistics model:

```text
WaterSource
  ↓
fetch/gather action
  ↓
carried water / existing delivery representation
  ↓
Household.water
```

The implementation should reuse existing water-gathering actions, source selection, carrying and household deposit mechanisms from the current water distribution/storage work.

Do not add a direct `well.fillHousehold()` API.

## Player thirst

The player should discover and use the well through the existing water interaction / need integration.

Do not add a separate well-only thirst interaction. The distinction should be only in source availability, not in the consumption mechanism.

The exact Thirst consequences remain owned by the existing needs system and current survival-needs plan.

## NPC compatibility

NPC water fetching should not care whether a source is natural or player-built once it is exposed through the existing `WaterSource` contract.

The existing source-selection logic should therefore be extended, if necessary, to include player-built wells.

The existing household water flow remains responsible for delivery and reserve updates.

## Inventory and construction

Use `Inventory` for construction materials.

Current `Inventory` supports:

- ordinary item counts,
- item instances,
- weight limits,
- persistence through existing save data.

Do not introduce a well-specific resource inventory.

If the construction recipe needs ordinary materials, consume them through existing inventory operations. If a future recipe needs item instances, use the existing instance lifecycle introduced by the inventory/item-instance work.

Plan 164's future `ItemSize`/Container system is not a prerequisite for Plan 127.

## Persistence / WorldBundle

Add the well record to the same persistent world-object flow used by other player-placed objects.

Required round-trip:

```text
player placement
 → runtime record
 → save data
 → load
 → WorldBundle reconstruction
 → runtime record
 → mesh/collider/WaterSource
```

Do not persist derived Three.js state, collider objects or duplicated water reserves.

If SaveData versioning requires a new version, follow the current repository's save migration/versioning convention rather than inventing a well-specific migration layer.

The loaded collection must be passed into world construction exactly once so a `WorldBundle` rebuild cannot create duplicate wells.

Streaming/rebuild must use the same persistent record as the authoritative state; loading a chunk must not create a second independent well state.

## Settlement infrastructure

Do not turn a player-built well into a generated settlement landmark.

It is a world infrastructure object that can become relevant to settlement/household logistics through the existing source and storage mechanisms.

If settlement infrastructure already exposes a common source/infrastructure registry, integrate there rather than adding a parallel well registry.

## Colliders

Use the existing collider registry and lifecycle:

```text
spawn well → register collider
remove/dispose well → unregister collider
```

The collider must be recreated from the persistent record on load.

NPC collision/approach code should continue using the shared collider registry. No `if (well)` branches should be necessary solely for collision avoidance.

## Suggested implementation sequence

1. Inspect current `WaterSource` type and all consumers.
2. Identify the current owner/flow for player-placed persistent objects in `WorldBundle`/save data.
3. Add the minimal `PlacedWell` persistent record and collection following the existing pattern.
4. Add placement using existing player placement and ground sampling.
5. Add shared collider registration.
6. Expose each player-built well through the existing `WaterSource` mechanism.
7. Extend source discovery/selection only where required.
8. Reuse existing water fetching and `Household.water` delivery.
9. Connect player thirst through existing water interaction/needs mechanisms.
10. Add save/load round-trip and WorldBundle reconstruction.
11. Verify no duplicate state or new parallel well manager was introduced.

## Verification focus

### State

- only the placed-well record owns well existence/placement,
- household water is not duplicated on the well,
- `WaterSource` remains the common source abstraction.

### Placement

- placement follows existing rules,
- height/rotation are restored,
- collider exists after placement and load,
- removal/disposal cleans up runtime resources.

### Water

- player-built wells appear in existing source discovery,
- existing water interaction works,
- NPC water fetching can select the well where appropriate,
- household water increases through the existing delivery path,
- player Thirst can use the source through the existing mechanism.

### Persistence

- save/load preserves `wellId`, position and rotation,
- WorldBundle reconstruction creates exactly one runtime well per record,
- derived mesh/collider/source state is rebuilt,
- no household water or other derived state is duplicated.

### Architecture

- no `WellSystem`,
- no parallel `WellWaterSource`,
- no well-specific save system,
- no well-specific collider system,
- no direct well → household-water mutation bypassing existing water logistics.

## Dependencies / related plans

Relevant existing work should be reused where implemented, especially the water distribution and household/storage logistics mechanisms and the inventory item-instance lifecycle.

Plans 164 (player storage/container system) and 165 (vigor/hunger/thirst/rest) are currently `planned`, so Plan 127 must not depend on their future implementation. It should remain compatible with their intended shared mechanisms.

## Final implementation constraint

Keep the implementation narrow. The goal is a persistent player-built water source integrated into the existing world, water, placement, inventory and needs systems — not a new subsystem for wells.
