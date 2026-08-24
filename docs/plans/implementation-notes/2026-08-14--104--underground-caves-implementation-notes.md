# Plan 104 — Underground Caves — Implementation Notes

> Review against the current repository. These notes make the plan implementation-oriented; repository code is the source of truth over `--updated-review.md`.

## 1. Architecture

The target is a cave interior system integrated into the existing world, not a second terrain/simulation stack.

```text
CaveGenerator
    ↓ deterministic
CaveDefinition
    ↓
CaveWorld / WorldBundle member
    ├─ streamed cave presentation
    ├─ floor / containment queries
    └─ cave collision integration

existing systems
    ├─ ChunkManager → surface terrain / streaming boundary
    ├─ collision.ts → collision ownership
    ├─ PreySpawner / AnimalAgent → fauna lifecycle
    ├─ ItemKind / ItemInstance → items
    └─ SaveData → persistent sparse state
```

`CaveDefinition` must be plain deterministic data. It must not own Three.js objects, `ChunkManager`, save state, inventory or runtime entities.

## 2. Current LargeCaves migration

Current code still has `largeCaves.ts`, `createLargeCaves.ts` and `largeCaveVisual.ts`. `createLargeCaves()` selects sites, calls `ChunkManager.modifyTerrain()` repeatedly along the tunnel and immediately attaches rock visuals. This is the old trench model.

Replace it rather than running a second cave system alongside it:

```text
old:
LargeCaveSite → modifyTerrain tunnel → rock visual

new:
CaveDefinition → cave volume/floor → streamed interior mesh → mouth framing
```

`WorldBundle` currently owns `largeCaves`. The new system should replace that member with one cave subsystem.

## 3. World lifecycle

Caves have the same lifetime as the current `WorldBundle`.

```text
createWorldBundle()
  → create caves

rebuildWorldBundle()
  → dispose old caves
  → rebuild world-dependent systems
  → create caves

disposeWorldBundle()
  → dispose caves
```

Never retain an old `ChunkManager`, `WorldContext`, scene objects or colliders after rebuild. Cave runtime state must be disposable and reconstructible from the current world definition.

## 4. Deterministic identity and grid

Use a world-scale cave grid independent from the terrain chunk grid (target approximately 500 m cells, subject to existing plan calibration).

Candidate generation must be independent of chunk load order.

Use deterministic inputs such as:

```text
seed + cave grid coordinate + candidate index
```

for layout and stable `caveId`.

Never use array order, load order, runtime object IDs or `Math.random()` for identity/layout.

A cave may cross multiple terrain chunks. It is not a chunk-owned landmark.

## 5. CaveDefinition contract

Minimum conceptual data:

```ts
type CaveDefinition = {
  id: string
  entrance: ...
  bounds: ...
  layout: ...
}
```

Required pure queries:

```text
contains(x, y, z)
sampleFloor(x, z)
```

Optional ceiling/wall queries are acceptable if useful for movement/collision.

`sampleFloor()` must not fall back to surface `sampleHeight()`. Outside-volume behaviour must be explicit (`undefined`/sentinel).

`contains()` must include Y/vertical envelope so a surface entity directly above a tunnel does not switch to cave ground merely because its X/Z overlaps the cave.

## 6. Generator and placement

Reuse existing world samplers rather than duplicating terrain logic. Current `ChunkManager` exposes relevant samplers such as:

```text
sampleHeight
sampleBaseHeight
sampleContinentalness
sampleMountainRidge
sampleMoistureRegion
waterLevel
roadCorridorsNear
```

Existing settlement/road/coast mechanisms should be reused where ownership fits.

Keep the pure generator dependent on sampler functions, not directly on `ChunkManager`, so the generator remains deterministic and testable without Three.js.

### Candidate constraints

Account for:

- water/coast;
- overburden;
- slope / mountain signal;
- settlement exclusion;
- road corridors;
- minimum spacing/density.

Do not blindly copy the old `MOUNTAIN_RIDGE_MAX = 0.55`; verify current sampler semantics and calibrate from actual terrain.

### Overburden

For each prospective tunnel/chamber corridor, sample surface height against intended roof height:

```text
surfaceHeight(x,z) - roofHeight(x,z) = overburden
```

Reject candidates where the minimum safety margin is insufficient. Checking only the mouth is not enough; the roof must not break through farther inside.

## 7. Phase 0 spike

Before mesh generation, run cheap deterministic measurements on several seeds:

```text
candidate cells
mountain candidates
lowland candidates
accepted after overburden
accepted after water/coast
accepted after settlement exclusion
accepted after road exclusion
mean nearest-cave distance
```

No Three.js geometry is needed for this phase.

## 8. Cave graph

Keep the graph pure data. A useful minimum is:

```ts
type CaveNode = {
  id: string
  kind: 'mouth' | 'junction' | 'chamber' | 'dead-end'
  pos: { x: number, y: number, z: number }
  radius: number
  height: number
}

type CaveEdge = {
  id: string
  from: string
  to: string
  radius: number
  height: number
}
```

V1 can be:

```text
entrance → tunnel → 1–2 chambers → dead end / small branch
```

Do not turn Plan 104 into a complete dungeon generator. Keep the data extensible for future junctions/branches.

## 9. ChunkManager and terrain boundary

`ChunkManager` remains responsible for surface terrain and chunk streaming. Do not create `CaveChunkManager`.

The terrain worker remains the authoritative surface heightfield. It must not know about `CaveVolume`, Three.js meshes or runtime colliders.

The existing worker-safe `ClearingSegment` seam is appropriate for the **surface mouth/ramp**. Do not pass the underground corridor into terrain clearing.

Conceptually:

```text
CaveGenerator
  ↓ mouth ClearingSegment
ChunkManager.paramsFor()
  ↓
terrain worker
```

The old `modifyTerrain()` tunnel carving must be removed from the new cave implementation. Only a local entrance/ramp may alter surface terrain.

If `ClearingSegment` cannot express the required ramp, make the smallest generic extension to that existing contract instead of creating cave-specific terrain mutation.

## 10. Surface vs cave semantics

This distinction must remain explicit:

```text
surface entity above cave → surface sampleHeight
entity inside cave          → CaveVolume.sampleFloor
```

Player/f auna ground selection needs an explicit cave transition/binding. Do not globally test every entity against every cave each update.

This also means a cave must not be treated as a replacement terrain heightfield.

## 11. Cave presentation and streaming

Cave definitions can exist independently of loaded chunks. Heavy cave meshes should be activated only when needed.

Avoid:

```text
for every frame:
  for every cave:
    distance test
```

Use deterministic cave-grid lookup to narrow candidates first.

Presentation should be disposable:

```text
CaveDefinition survives streaming
CaveRuntime presentation can be destroyed/recreated
```

Prefer one merged interior mesh/object per active cave rather than many small meshes.

The cave mesh must overlap the surrounding rock/surface near the mouth enough to avoid visible cracks/z-fighting. The exact overlap is an implementation calibration value, not a hard architectural constant.

## 12. Collision integration

Extend `src/world/collision.ts`; do not create a second collision registry.

The current registry is based on simple circle colliders and spatial buckets. It is suitable for existing surface objects but a long cave constraint cannot safely be represented only by its midpoint.

Required properties:

- wall constraints cover their full spatial extent;
- movement stays inside the valid cave volume;
- stable owner key supports streaming/rebuild removal;
- existing outward solid collision remains valid;
- no mesh/BVH is required for ordinary movement collision.

Use an analytical interior constraint (`InteriorCapsule`, segments, chamber bounds or equivalent) as an implementation detail, not as a mandatory plan-level API.

If a cave constraint spans several spatial buckets, extend the existing spatial coverage/query rather than adding another collision system.

Suggested ownership:

```text
cave:<stable-cave-id>
```

Do not register cave walls under terrain chunk keys because caves can cross chunk boundaries and have a different lifecycle.

Interior collision is conceptually the inverse of existing solid-out resolution:

```text
movement proposal
  → existing solid-out collision
  → cave containment/interior correction when inside cave
  → cave floor/vertical resolution
```

At junctions, resolve against the union of connected primitives rather than arbitrarily selecting one nearest edge.

## 13. Fauna

Reuse the existing `PreySpawner` / `AnimalAgent` lifecycle and saved spawn-point state. Current world construction already passes saved spawn-point state into `buildFauna()`, and world rebuild snapshots spawn-point state before disposing fauna.

Do not create:

```text
CaveFaunaManager
CaveSpawnState
CaveWolfLifecycle
```

Use:

```text
CaveDefinition → physical space/floor
PreySpawner    → spawn lifecycle
AnimalAgent    → runtime animal
```

Cave-bound fauna needs an explicit cave floor/navigation source. Surface fauna above a cave remains surface fauna.

Existing stable wolf-den identity/quest contracts remain unchanged.

## 14. Persistence

Extend the current versioned `SaveData` and its migration chain. Do not create a cave save system.

Persist only sparse state that cannot be regenerated from the seed, such as:

```text
caveId + discovered/cleared/looted progression
```

where gameplay actually requires it.

Spawn-point lifecycle and item-instance state remain owned by their existing persistence mechanisms.

Do not persist:

```text
procedural layout
mesh
colliders
streaming state
runtime animal transforms
```

## 15. Items / loot / placement

Reuse `ItemKind`, `ItemInstance` and existing placement/drop/persistence mechanisms. Do not create cave-specific inventory or item identity.

Container integration is optional and must not become a new Plan 104 subsystem.

If dropped items can exist inside caves, ground resolution must distinguish cave floor from surface `sampleHeight`.

## 16. Existing vegetation/placement pipeline

Do not add separate `nearCave` checks to grass, trees, rocks and environment placement.

Use the existing surface clearing/placement pipeline for the mouth. This keeps cave entrance exclusion aligned with the same worker-safe terrain mechanisms already used elsewhere.

The underground corridor itself must not be represented as a surface clearing.

## 17. Tests

At minimum:

### `caveVolume.test.ts`

- inside/outside containment;
- Y envelope;
- floor sampling;
- boundary behaviour.

### `caveGenerator.test.ts`

- same seed → same IDs/layout;
- stable ID independent of discovery/load order;
- water/coast/settlement/road constraints;
- overburden rejection;
- cave-grid independence from chunk grid.

Integration coverage where practical:

- world rebuild/dispose leaves no stale cave runtime;
- surface entity above cave still uses surface ground;
- cave fauna retains spawn-point identity/state;
- cave collision owner is removable/rebuildable.

## 18. Browser verification

Visual/movement correctness requires browser verification.

Check:

1. entrance is on a plausible slope;
2. walking over the cave does not expose an underground hole;
3. surface vegetation above the tunnel remains surface vegetation;
4. entrance transition works in both directions;
5. interior lighting reads as underground;
6. wall/ceiling collision works;
7. player cannot emerge through the surface;
8. cave presentation streams/recreates without stale objects;
9. save/reload reproduces deterministic geometry;
10. cave fauna uses cave floor while surface fauna above remains surface;
11. chamber/branch is navigable;
12. world rebuild does not retain old cave objects/colliders.

Report separately: implemented / technically verified / browser-verified.

## 19. Scope guard

Do not expand Plan 104 into:

- complete dungeon generation;
- multiplayer synchronization;
- a new collision engine;
- a new fauna lifecycle;
- a new inventory/container architecture;
- a world-wide navigation rewrite.

Prefer extending existing mechanisms when ownership still fits.

## 20. Implementation order

```text
1. CaveDefinition + deterministic ID
2. generator + Phase 0 spike
3. WorldBundle lifecycle
4. cave presentation / streaming
5. cave floor + player ground provider
6. collision integration
7. fauna integration
8. persistence / loot integration
9. technical verification
10. browser verification
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
