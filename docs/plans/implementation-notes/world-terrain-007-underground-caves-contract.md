# Underground Caves — Architecture / Implementation Contract

**Based on:** plan `world-terrain-007-underground-caves`
**Recon:** 2026-09-03
**Status:** implementation guidance
**Scope:** V1 cave geometry/domain contract
**Purpose:** eliminate architectural decisions during implementation

---

## 1. Current architecture findings

The existing cave implementation is intentionally simple:

- `src/world/largeCaves.ts`
  - deterministic world-scale placement;
  - slope/coast/mountain/road/settlement filtering;
  - `LargeCaveSite` contains only opening position/orientation/length/variant.

- `src/world/createLargeCaves.ts`
  - currently modifies the `ChunkManager` heightmap;
  - creates cave rock presentation immediately;
  - owns cave runtime lifetime.

- `src/world/largeCaveVisual.ts`
  - creates decorative rock framing;
  - does not represent a real underground volume.

- `src/app/worldBundle.ts`
  - already owns `largeCaves` lifecycle;
  - world systems are rebuilt through one mutable `WorldBundle`;
  - cave replacement must preserve this ownership model.

- `src/world/collision.ts`
  - already provides the shared collision system;
  - supports `CircleCollider` and `ObbCollider`;
  - has a spatial bucket index;
  - `ColliderRegistry` supports owner-based replacement/removal;
  - `resolvePosition()` handles entity-circle vs collider primitives.

- `src/player/PlayerController.ts`
  - already separates:
    - `sampleHeight`
    - `sampleFloor`
  - therefore cave ground does NOT require a new player movement architecture;
  - player collision already consumes `collidersNear`.

- `src/fauna/AnimalAgent.ts`
  - already uses the shared movement/collision infrastructure;
  - navigation exists as a bounded local system;
  - cave fauna should receive cave-specific floor/navigation information rather than introduce a second movement system.

- `src/fauna/createFauna.ts`
  - already has cave/thicket/wolf-den spawn concepts;
  - cave integration should extend the existing spawner lifecycle.

### Architectural conclusion

Do NOT introduce:

- `CaveChunkManager`
- `CaveCollisionManager`
- `CavePhysics`
- `CaveNavigationManager`
- cave-specific entity lifecycle
- a second spatial collision registry.

The cave subsystem owns **space definition + cave presentation + cave-specific queries**.

Existing systems remain owners of movement, collision registration, fauna lifecycle and world lifecycle.

---

# 2. Core domain model

The central abstraction is:

```ts
CaveDefinition
```

It is pure world data.

It must:

- not import Three.js;
- not reference `ChunkManager`;
- not reference scene objects;
- not reference runtime entities;
- be deterministic from world seed + stable placement input;
- be sufficient to reconstruct the same cave after rebuild/load.

Recommended shape:

```ts
export type CaveDefinition = {
  caveId: string

  entrance: CaveEntrance

  nodes: readonly CaveNode[]
  tunnels: readonly CaveTunnel[]

  bounds: CaveBounds

  variant: number
}
```

The exact field naming may differ slightly, but the separation is mandatory:

```text
CaveDefinition
    ↓
CaveVolume queries
    ↓
Cave runtime/presentation
```

---

# 3. Stable identity

`caveId` must NOT depend on array index.

It must be deterministic from stable world inputs.

Recommended concept:

```text
cave:<world-seed-derived-placement-key>
```

For example:

```ts
makeCaveId(seed, gridX, gridZ)
```

or equivalent deterministic hashing.

Requirements:

- same seed → same caveId;
- changing cave ordering does not change caveId;
- rebuild does not change caveId;
- save/load does not change caveId.

Do not use:

```ts
cave-${index}
```

---

# 4. Cave spatial representation

V1 should use a **graph of simple analytic primitives**.

Do NOT build a general voxel cave system.

Do NOT use a signed-distance-field terrain system.

Do NOT introduce marching cubes.

Do NOT generate arbitrary polygonal dungeon geometry.

The cave is:

```text
entrance
   │
   ▼
 tunnel
   │
   ▼
 chamber
   │
   ├── optional short branch
   │
   ▼
 dead end / final chamber
```

This is enough to create a convincing walk-in cave while keeping:

- floor queries cheap;
- collision deterministic;
- geometry generation simple;
- later branching possible.

---

# 5. CaveNode

A node represents a local cave space.

Recommended conceptual contract:

```ts
export type CaveNode = {
  id: string

  center: {
    x: number
    y: number
    z: number
  }

  radius: number

  floorY: number
  ceilingY: number
}
```

For V1, a spherical/elliptical horizontal chamber approximation is sufficient.

The important property is:

```text
horizontal footprint + vertical interval
```

rather than arbitrary mesh geometry.

A chamber answers:

```text
is point inside horizontal footprint?
is y between floor and ceiling?
```

---

# 6. CaveTunnel

A tunnel is a segment between two points with a varying radius.

Recommended conceptual contract:

```ts
export type CaveTunnel = {
  id: string

  from: string
  to: string

  radius: number

  floorStartY: number
  floorEndY: number

  ceilingHeight: number
}
```

The implementation may derive floor/ceiling from endpoints rather than store all of these values explicitly.

The important invariant is:

```text
tunnel = swept corridor between two cave nodes
```

not:

```text
tunnel = baked mesh
```

The mesh is derived from this data.

---

# 7. Entrance

The entrance is the only normal surface ↔ cave connection.

Recommended contract:

```ts
export type CaveEntrance = {
  x: number
  y: number
  z: number

  yaw: number

  width: number
  height: number
}
```

Entrance orientation follows the existing `LargeCaveSite.yaw` convention.

Existing helpers:

```ts
tunnelDirection()
openingDirection()
```

can be reused during migration.

The entrance must be located on the sloped surface selected by the existing placement algorithm.

---

# 8. CaveBounds

Every cave needs a cheap world-space bounds representation.

Recommended:

```ts
export type CaveBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}
```

This is primarily for:

- streaming;
- candidate lookup;
- cheap early rejection;
- debugging.

It is NOT the collision volume itself.

Important:

```text
bounds = broad phase
volume primitives = narrow phase
```

Do not register the whole cave as one collider using `bounds`.

That would incorrectly block walkable interior space.

---

# 9. CaveVolume

`CaveVolume` is the main runtime query abstraction.

It may wrap a `CaveDefinition`, but it must remain Three.js-independent if possible.

Required queries:

```ts
sampleFloor(x: number, z: number): number | null

sampleCeiling(x: number, z: number): number | null

contains(x: number, y: number, z: number): boolean

distanceToInteriorBoundary(x: number, y: number, z: number): number

bounds(): CaveBounds
```

Optional useful query:

```ts
containsHorizontal(x: number, z: number): boolean
```

### Meaning of `null`

`sampleFloor()` returns `null` when `(x,z)` does not belong to the cave.

It must NOT silently fall back to surface terrain.

The caller chooses the fallback:

```ts
const caveFloor = cave.sampleFloor(x, z)

if (caveFloor !== null) {
    // cave
} else {
    // surface
}
```

---

# 10. Floor selection

Floor height is determined analytically from cave geometry.

For a tunnel:

```text
t = projection(pointXZ onto tunnel segment)
floorY = lerp(floorStartY, floorEndY, t)
```

For a chamber:

```text
floorY = chamber.floorY
```

At junctions, the lowest valid connected cave floor should win.

Do NOT sample the surface heightmap to obtain cave floor.

The surface heightmap remains the surface.

---

# 11. Ceiling

The cave ceiling is part of the cave volume.

V1 can use:

```text
ceilingY = floorY + ceilingHeight
```

for tunnels and a fixed/parameterized chamber ceiling.

It does not need physically accurate rock topology.

The key gameplay invariant is:

```text
floorY < playerY < ceilingY
```

inside the cave.

This gives us:

- real enclosed space;
- darkness;
- ceiling collision;
- no accidental escape through the surface.

---

# 12. Surface/cave separation

This is one of the most important invariants.

The surface terrain remains authoritative for:

```text
surface height
surface vegetation
surface navigation
surface fauna
surface collision
```

The cave is an additional volume below it.

Therefore:

```text
surface
──────────────────────────────
       terrain remains here

       cave ceiling
       ┌───────────┐
       │           │
       │   cave    │
       │           │
       └───────────┘
```

There must NOT be a global hole through the surface.

Only the entrance creates a surface/cave transition.

This means the current `ChunkManager.modifyTerrain()` carving approach is not the long-term representation of the cave.

It may be retained temporarily during migration if necessary, but must not remain authoritative.

---

# 13. Ground provider

The existing player architecture already contains:

```ts
sampleHeight
sampleFloor
```

Use that seam.

Do not add:

```ts
sampleCaveHeight()
```

to the player.

Instead provide a world-level resolver:

```ts
sampleFloor(x, z):
    if active cave contains horizontal point:
        return cave.sampleFloor(x, z)
    return chunkManager.sampleHeight(x, z)
```

The player continues to consume one floor sampler.

This is important because it keeps player movement unaware of how the world is partitioned.

---

# 14. Cave membership

Do NOT determine cave membership solely from `x/z`.

The same `(x,z)` can represent:

```text
surface
cave below surface
```

Therefore:

```ts
contains(x, y, z)
```

must include Y.

Example:

```text
        surface
──────────●──────────
          │
          │ same x/z
          │
       cave ceiling
       ┌───────────┐
       │     ●     │  ← cave
       └───────────┘
```

This prevents surface entities from accidentally switching to cave movement simply because they are above a cave.

---

# 15. Player transition

V1 does not need a teleport or scene transition.

The cave is part of the same world coordinate system.

The player simply walks:

```text
surface
   ↓
entrance
   ↓
cave volume
```

The only state that needs to change is the result of world queries:

```text
surface floor → cave floor
surface ceiling → cave ceiling
surface presentation → cave presentation
```

No second world.

No loading screen.

No separate scene.

---

# 16. Collision contract

Reuse:

```text
src/world/collision.ts
```

The existing registry is already owner-based:

```ts
setColliders(ownerKey, colliders)
clearColliders(ownerKey)
query(x, z)
```

Caves should register their boundary constraints through this same registry.

However:

## Do NOT register the cave interior as a solid collider.

The player must be allowed to move inside it.

The collision geometry represents:

```text
walls
entrance rim / blocked exterior
possibly ceiling/floor constraints through vertical movement
```

not the interior volume itself.

---

# 17. Cave wall primitives

The exact primitive can be implementation-specific, but V1 should prefer existing primitives.

Recommended representation:

```text
tunnel side wall → OBB/segment-like approximation
chamber wall     → circle
```

If a tunnel requires a better primitive, extend `collision.ts` only when necessary.

Do NOT create:

```ts
CaveCollisionRegistry
```

The shared collision registry remains authoritative.

---

# 18. Important collision limitation

The existing collision registry buckets colliders by:

```ts
floor(x / cellSize)
floor(z / cellSize)
```

and `query()` returns the 3×3 neighborhood.

Therefore a long cave-wall collider cannot be represented as one large primitive whose center is far away from parts of the wall.

Otherwise:

```text
        wall
────────────────────────
          ↑
       collider center

query(player here)
        ↓

    not necessarily
    same 3×3 bucket
```

and collision can disappear.

Therefore cave walls must either:

1. be split into sufficiently small primitives, or
2. cause the shared registry broad-phase to be extended to account for collider extents.

Prefer **splitting cave walls into bounded primitives** for V1 unless recon during implementation proves that the registry extension is cleaner.

Do not build a second spatial index.

---

# 19. Ceiling collision

Existing player vertical movement should remain authoritative.

Cave support must provide:

```ts
floorY
ceilingY
```

Then movement clamps:

```text
player feet >= floorY
player head <= ceilingY
```

Given:

```ts
PLAYER_HEIGHT = 1.8
```

the effective maximum player root Y should account for player height.

Do not solve ceiling collision by adding a huge horizontal collider.

---

# 20. Camera constraint

Camera collision must not use the cave bounds as a solid wall.

The camera should continue using the existing camera-boom logic.

If the player is inside the cave:

```text
camera remains inside cave
```

and must not be allowed to pass through cave walls or the ceiling.

The implementation should reuse existing player/camera collision semantics wherever possible.

Do not introduce a cave-specific camera system.

---

# 21. Generator V1

Reuse the existing placement logic from:

```text
src/world/largeCaves.ts
```

It already provides:

- deterministic seeded placement;
- slope preference;
- coast exclusion;
- mountain-ridge filtering;
- road exclusion;
- settlement exclusion;
- minimum cave separation.

Do not throw this away.

Migration should conceptually be:

```text
LargeCaveSite
    ↓
CaveGenerator
    ↓
CaveDefinition
```

The current placement constraints become inputs to the new generator.

---

# 22. Cave layout V1

Generate:

```text
Entrance
   │
Tunnel
   │
Chamber
   │
short branch OR continuation
   │
Dead-end chamber
```

Recommended limits:

```text
1 entrance
1–2 chambers
1 main tunnel
0–1 short branch
```

The generator must remain bounded.

No recursive dungeon generation.

No arbitrary graph growth.

No unbounded retry loops.

---

# 23. Determinism

For the same:

```text
seed
world parameters
placement coordinate
```

the generator must produce exactly the same:

```text
caveId
entrance
nodes
tunnels
bounds
variant
```

Avoid runtime random calls.

Use the existing deterministic seeded random mechanism.

Do not depend on:

- object iteration order;
- loaded chunks;
- entity order;
- runtime frame count;
- player position.

---

# 24. Streaming

Cave definitions can be generated globally or indexed cheaply.

Heavy runtime presentation must be streamed.

Use:

```text
player position
    ↓
world/grid candidate lookup
    ↓
bounds/distance check
    ↓
activate cave presentation
    ↓
register cave colliders
```

Do not scan every cave every frame.

Do not create all cave meshes at world creation.

---

# 25. Cave spatial index

V1 does not need a sophisticated new spatial structure.

Because cave count is expected to remain small, use a deterministic world-grid index.

Conceptually:

```ts
Map<GridKey, CaveDefinition[]>
```

or reuse an existing world/chunk coordinate helper if appropriate.

The index should answer:

```text
which caves can possibly be relevant to this player position?
```

Then `CaveBounds` performs the exact cheap rejection.

---

# 26. Runtime ownership

Recommended:

```ts
type Caves = {
    definitions(): readonly CaveDefinition[]
    update(observerX: number, observerZ: number): void
    active(): readonly CaveRuntime[]
    sampleFloor(x, z): number | null
    sampleCeiling(x, z): number | null
    contains(x, y, z): boolean
    dispose(): void
}
```

Exact API may differ.

The important ownership is:

```text
WorldBundle
    owns Caves

Caves
    owns cave runtime/presentation

CaveDefinition
    owns no runtime resources

ChunkManager
    owns surface terrain

collision.ts
    owns collision registry

PlayerController
    owns player movement
```

---

# 27. WorldBundle integration

Current `WorldBundle` already has:

```ts
largeCaves: LargeCaves
```

The migration should become:

```ts
caves: Caves
```

or another equivalent final name.

Lifecycle must remain:

```text
createWorldBundle()
    ↓
createCaves()

rebuildWorldBundle()
    ↓
dispose old caves
    ↓
create new caves

disposeWorldBundle()
    ↓
dispose caves
```

Do not let cave runtime survive a world rebuild.

Do not retain references to an old `ChunkManager`.

---

# 28. Migration from existing large caves

Existing:

```text
largeCaves.ts
createLargeCaves.ts
largeCaveVisual.ts
```

should not be duplicated indefinitely.

Migration sequence:

```text
existing placement logic
        ↓
CaveGenerator
        ↓
CaveDefinition
        ↓
CaveRuntime
```

After the new system is authoritative:

```text
largeCaves.ts
createLargeCaves.ts
largeCaveVisual.ts
```

should be removed or reduced to helpers that still have a clear ownership reason.

Do not maintain:

```text
old cave system
+
new cave system
```

as two authoritative mechanisms.

---

# 29. Fauna boundary

Fauna remains owned by:

```text
PreySpawner
AnimalAgent
createFauna.ts
```

Caves only provide spatial information.

A cave animal should receive:

```text
cave floor
cave bounds
cave movement/navigation constraint
```

It should NOT get:

```text
CaveAnimalAgent
CaveSpawnerManager
CaveFaunaSystem
```

Existing cave/thicket/wolf-den spawner concepts should be migrated to reference a cave definition/ID where appropriate.

---

# 30. Navigation boundary

The repository already has bounded local navigation.

Do not build a cave-specific global navigation system.

For V1, cave navigation can use the analytic cave geometry:

```text
cave graph
    +
walkable floor
    +
existing local navigation
```

If existing A* cannot represent the cave cleanly, introduce the smallest adapter/query necessary.

Do not create a second pathfinding engine.

---

# 31. Presentation geometry

The mesh is a derivative of `CaveDefinition`.

Recommended:

```text
CaveDefinition
      ↓
procedural cave mesh
      ↓
Three.js Object3D
```

The mesh must NOT be queried to determine:

- floor height;
- containment;
- collision;
- cave identity.

This keeps gameplay deterministic and cheap.

---

# 32. Mesh strategy

V1 should use procedural geometry based on:

```text
tunnel centerline
tunnel radius
chamber footprint
floor
ceiling
```

A practical implementation is:

```text
tunnel:
    rings along centerline
    inner surface
    floor/ceiling deformation

chamber:
    low-resolution radial/elliptical shell
```

Do not pursue visually perfect geology.

The first goal is:

```text
convincing enclosed playable space
```

not:

```text
general cave geometry generator
```

---

# 33. Lighting

The cave must be physically visually enclosed.

Do not fake the entire cave using a dark decal.

The cave mesh must occlude daylight sufficiently.

V1 can use existing scene lighting plus local cave darkness/material treatment.

Torches/lights should remain existing world objects.

Do not create:

```ts
CaveLightingSystem
```

for V1.

---

# 34. Performance invariants

Cave generation must be cheap enough to run during world creation.

Heavy mesh construction is allowed only for active/nearby caves.

Do not:

```text
generate all cave meshes
register all cave colliders
update all caves every frame
```

Preferred:

```text
all definitions:
    cheap

nearby cave:
    runtime mesh

active cave:
    collision + queries

remote cave:
    definition only
```

---

# 35. Important non-goals

Do not implement in this architecture pass:

- voxel caves;
- marching cubes;
- destructible cave walls;
- cave mining;
- dynamic cave collapse;
- procedural dungeon framework;
- multiplayer cave synchronization;
- cave-specific physics;
- cave-specific inventory;
- cave-specific quest system;
- cave-specific fauna manager;
- cave-specific persistence framework.

---

# 36. Persistence boundary

Cave geometry is derived:

```text
seed + world parameters
```

Therefore do NOT persist:

- mesh;
- tunnel vertices;
- chamber geometry;
- collider geometry;
- bounds;
- streaming state.

Only persist future gameplay state that cannot be derived, for example:

```text
discovered cave
cleared cave
looted cave
```

Those fields should be introduced only when gameplay actually needs them.

Do not add cave persistence merely because the system exists.

---

# 37. Recommended implementation order

This order is intentional.

## Step A — pure domain

Implement:

```text
CaveDefinition
CaveNode
CaveTunnel
CaveEntrance
CaveBounds
```

plus deterministic generator.

Tests first.

No Three.js.

No collision.

No player.

---

## Step B — volume queries

Implement:

```text
sampleFloor()
sampleCeiling()
contains()
bounds()
```

Tests:

```text
point inside tunnel
point outside tunnel
point inside chamber
point above ceiling
point below floor
surface point above cave
```

This establishes the most important gameplay contract.

---

## Step C — presentation

Generate a playable procedural mesh from the same definition.

At this stage:

```text
no fauna
no persistence
no loot
```

Only:

```text
surface → entrance → cave → exit/dead end
```

---

## Step D — player ground

Connect the existing:

```text
sampleFloor
```

seam.

Player movement should remain unaware of cave implementation.

Verify:

```text
surface floor
→ entrance
→ cave floor
→ return surface
```

---

## Step E — shared collision

Register cave wall constraints through existing:

```text
ColliderRegistry
```

Verify:

```text
wall blocks player
interior remains walkable
entrance remains passable
ceiling cannot be crossed
surface remains separate
```

---

## Step F — streaming

Only after geometry + movement are correct.

Activate/deactivate presentation using:

```text
world/grid candidates
+
bounds/distance
```

Use hysteresis if needed.

---

## Step G — fauna

Only after player movement and cave volume are stable.

Reuse:

```text
PreySpawner
AnimalAgent
existing navigation
```

---

## Step H — persistence / loot

Last.

Add only actual nondeterministic gameplay state.

---

# 38. Tests that provide the highest ROI

The most valuable tests are pure geometry tests.

### Generator

```text
same seed → identical definitions
different seed → different placement/layout
cave IDs stable
all bounds contain cave geometry
entrance belongs to cave
```

### Volume

```text
tunnel interior → contains=true
tunnel exterior → contains=false
chamber interior → contains=true
above ceiling → contains=false
below floor → contains=false
surface above tunnel → contains=false
```

### Floor

```text
tunnel interpolation is deterministic
chamber floor is stable
outside cave returns null
```

### Bounds

```text
all cave primitives lie within bounds
nearby cave candidate cannot be rejected incorrectly
```

These tests are much more valuable than trying to unit-test Three.js meshes.

---

# 39. Final architectural rule

The central rule for implementation is:

```text
CaveDefinition is the truth.

Mesh is derived.
Collision is derived.
Streaming state is derived.
Floor queries are derived.
Fauna navigation is derived.
Persistence stores only non-derived gameplay state.
```

And:

```text
Surface and cave share the same world coordinates.

Surface terrain remains surface terrain.

The cave is an additional enclosed volume below it.
```

The implementation should therefore optimize for:

```text
simple deterministic geometry
+
cheap analytic queries
+
reuse of existing systems
```

rather than creating a sophisticated general-purpose cave engine.

---

# 40. Recon-based recommendation

The existing repository is already prepared unusually well for this approach:

```text
PlayerController
    sampleHeight + sampleFloor
             ↓
        cave adapter

collision.ts
    shared ColliderRegistry
             ↓
        cave walls

AnimalAgent
    existing navigation/movement
             ↓
        cave floor adapter

WorldBundle
    existing rebuild/dispose lifecycle
             ↓
        Caves ownership

largeCaves.ts
    existing deterministic placement
             ↓
        CaveGenerator input
```

Therefore the highest-risk architectural decision is no longer
"how do we integrate caves into Seedvale?"

It is:

> **What is the smallest analytic cave volume representation that can drive floor,
> ceiling, containment, mesh and wall collision consistently?**

This contract deliberately answers that question with:

> **bounded graph + analytic tunnel/chamber primitives.**

Do not replace this with a more sophisticated geometry system unless implementation evidence proves that V1 cannot satisfy the acceptance criteria.
