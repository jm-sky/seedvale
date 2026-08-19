# Plan 104 — Underground Caves — Implementation Notes

> Review of `docs/plans/2026-08-14--104--underground-caves.md` against the current codebase. These notes do not change the plan; they make its implementation constraints and code-level integration points explicit for an AI agent.

## 1. Review verdict

The plan's main architectural decision is still sound: **separate cave interior geometry + analytical `CaveVolume` collision/navigation, while keeping the surface terrain as the existing heightfield**.

The most important implementation rule is:

```text
surface terrain / chunks
        │
        ├── existing heightfield + worker generation
        │
        └── cave mouth clearing/ramp only

CaveVolume
        ├── deterministic graph
        ├── interior mesh
        ├── floor sampler
        ├── interior collision
        └── future cave navigation
```

Do not turn the cave into a second terrain system. Do not try to tunnel through `ChunkTileResult` or `modifyTerrain`.

The current code confirms that the existing `LargeCaves` implementation is still the old trench model. `src/world/createLargeCaves.ts` repeatedly calls `modifyTerrain()` along the tunnel and then places rock visuals; it does not create an interior mesh or cave collision. `src/world/largeCaves.ts` still uses the old random ring (`130–620 m`), fixed count and slope test. This is exactly the family that Plan 104 should replace rather than extend indefinitely.

## 2. Current integration points

### Terrain / chunk generation

Relevant files:

```text
src/terrain/chunkManager.ts
src/terrain/chunkHeightmap.ts
src/terrain/chunkWorkerPool.ts
src/terrain/buildChunkGeometry.ts
src/terrain/chunkHeightmapProtocol.ts
```

The terrain worker owns the authoritative generated heightfield. `ChunkManager.paramsFor()` currently builds worker input from road/village data and passes `clearings` into `ChunkTileParams`.

`ClearingSegment` is therefore the correct seam for cave mouths. It is plain numeric, worker-safe data:

```ts
type ClearingSegment = {
  x: number
  z: number
  radius: number
  targetH: number
  heightStrength: number
  tintStrength: number
  innerFraction?: number
}
```

Do not make the worker know about `CaveVolume`, Three.js meshes, `Object3D`, colliders or settlement objects.

The worker should only receive the minimal mouth/ramp terrain input necessary to keep the surface generation coherent.

### Chunk streaming

`ChunkManager` remains the terrain streaming boundary. Chunks are generated asynchronously and finalized through a one-slot-per-frame finalize queue. This is important for cave implementation because cave mesh creation must **not** accidentally become another synchronous per-chunk workload.

A `CaveVolume` is a world landmark, not a chunk. Its identity and graph should not be serialized into every chunk.

Use the same principle as settlements:

```text
world-scale deterministic generator
        ↓
landmark registry / WorldBundle
        ↓
stream presentation by distance
```

Do not create a `CaveChunkManager`.

## 3. `WorldBundle` ownership

`src/app/worldBundle.ts` currently owns `largeCaves: LargeCaves` and constructs it after the terrain, settlements, fauna and other world systems have been initialized.

Plan 104 should replace that ownership with the new cave system, rather than adding:

```ts
largeCaves: LargeCaves
caveVolumes: CaveVolumes
```

The old `LargeCaves` API can disappear when the new implementation replaces it.

Preferred conceptual shape:

```ts
type CaveWorld = {
  volumes(): readonly CaveVolume[]
  update(playerX: number, playerZ: number): void
  dispose(): void
}
```

The exact API may differ after implementation audit. The important part is that the bundle owns one cave subsystem and the subsystem owns deterministic cave definitions plus their streamed presentation.

Do not make `CaveVolume` itself responsible for global scene streaming, save management or player state.

## 4. Deterministic cave identity

The plan's `(gx, gz, index)` identity is important because the generator must be independent of discovery order.

Use a deterministic cell hash:

```text
seed + gx + gz + candidate index
        ↓
position / archetype / dimensions / orientation
```

Do not use:

```ts
Math.random()
array.length
currentlyLoadedCaves.length
```

for identity or generated layout.

The same world seed must produce the same cave IDs whether the player starts at the origin, travels directly to a cave, or streams the region in later.

For the first implementation, keep the generated graph entirely pure and testable without Three.js.

## 5. Cave grid must be independent of chunk grid

The existing terrain chunks are 64 m-scale streaming units, while the plan's cave grid is approximately 500 m.

Do not generate a cave candidate for every terrain chunk.

Correct:

```text
CAVE_GRID_STEP = 500 m
        ↓
world cell candidate
        ↓
siting against terrain samplers
        ↓
0 or 1 deterministic CaveVolume
```

Then use chunk/streaming queries only to determine when the already-defined cave needs to be presented.

This prevents cave density from accidentally scaling with terrain resolution or chunk size.

## 6. Siting: reuse terrain samplers, but keep the generator pure

`ChunkManager` already exposes the samplers needed by the current large-cave implementation:

```text
sampleHeight
sampleBaseHeight
sampleContinentalness
sampleMountainRidge
waterLevel
roadCorridorsNear
```

`isCoastalPlacement()` and `measureSlope()` are also existing reusable mechanisms.

The new cave generator should receive sampler functions as dependencies, just like `pickLargeCaveSites()` does today.

Do not import `ChunkManager` into the pure cave layout module if avoidable.

Preferred separation:

```text
caveGenerator.ts
    pure deterministic layout + siting rules

createCaves.ts / caveWorld.ts
    ChunkManager integration + scene + streaming
```

This makes Phase 0 measurable without creating Three.js objects.

## 7. Phase 0 must measure the actual current terrain

Do not implement the mesh first and tune siting afterwards.

The critical unknown is not cave geometry; it is whether the current terrain actually provides enough locations satisfying:

```text
slope
+ mountain/lowland classification
+ cave depth / overburden
+ water clearance
+ settlement clearance
+ road clearance
+ coast clearance
```

The current `largeCaves.ts` has `MOUNTAIN_RIDGE_MAX = 0.55`, which deliberately rejects strong mountain ridges. Plan 104 reverses this logic for large mountain caves. Do not blindly copy the existing threshold.

The spike should report at least:

```text
candidate cells
mountain candidates
lowland candidates
accepted after overburden test
accepted after water test
accepted after settlement/road/coast exclusion
mean nearest-cave distance
```

Prefer a deterministic report over a visual-only judgement.

## 8. Overburden is the real cave-siting constraint

The surface terrain remains a heightfield. The cave roof is a separate mesh. Therefore the mesh can only look convincing if enough terrain exists above it.

For each prospective cave edge, sample the surface along the projected corridor and compare it with the intended roof height.

Conceptually:

```text
surfaceHeight(x,z)
        -
roofHeight(x,z)
        = overburden
```

Reject or regenerate candidates where the minimum overburden is below a safety margin.

Do not validate only the mouth. A cave can have a valid entrance and then visibly break through the surface 15 m later.

For v1, use conservative margins. It is better to reject a few caves than to generate visible roof holes.

## 9. Cave graph should be pure data

Recommended minimum model:

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

type CaveVolume = {
  id: string
  seed: number
  nodes: CaveNode[]
  edges: CaveEdge[]
  bounds: { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }
}
```

Do not store Three.js objects in this model.

`CaveVolume` should be serializable/debuggable as plain data and usable by:

```text
sampleFloor()
contains()
nearestMouth()
collision queries
navigation queries
mesh generation
```

This is the central architectural seam for L1 → L2.

## 10. `sampleFloor()` semantics

The plan correctly treats the floor as separate from wall collision.

For an edge, interpolate floor Y along the edge's centerline. For a chamber, use its node floor height.

The implementation must define behaviour outside the volume explicitly:

```text
sampleFloor(x,z)
    → valid cave floor when inside/near cave
    → undefined/null/sentinel outside
```

Do not return surface `sampleHeight()` from the cave module. The caller should decide which ground provider is active.

Also keep `sampleFloor()` free from Three.js and raycasting.

## 11. `contains()` must be conservative

The player should enter the cave only after crossing the mouth and entering the analytical volume.

Avoid using mesh raycasts to decide whether the player is inside.

For v1 capsule-like corridor:

```text
nearest point on edge centerline
        ↓
XZ distance <= corridor radius
        ↓
Y within floor/ceiling envelope
```

The Y test matters. A player standing above the cave on the surface must not suddenly switch to the cave floor provider merely because their X/Z happens to be above the tunnel.

This is also why the cave's descent and overburden are important.

## 12. Collision: extend 097, do not replace it

`src/world/collision.ts` currently supports only outward circle resolution:

```ts
Collider = { x, z, radius }
resolvePosition(...)
```

The registry already supports owner-scoped replacement/removal and is used by `ChunkManager` and settlements.

Plan 104 should extend this mechanism with an **interior constraint**, not add a second collision registry.

The current registry's cell query is based on a single point and 3×3 neighbouring buckets. This is sufficient for normal small colliders but is not automatically sufficient for a long analytical cave primitive.

Therefore, if `InteriorCapsule` is registered as one logical collider, make sure the spatial registration covers the cells intersected by the capsule/bounds rather than only the midpoint. Otherwise a player near one end can fail to receive the cave wall constraint.

This is a concrete implementation detail that should not be missed.

## 13. Interior collision semantics

The existing `resolvePosition()` pushes entities **out** of solid circles. Cave walls require the inverse operation: keep the entity **inside** the analytical volume.

Do not implement this by negating random vectors or by repeatedly pushing against sampled wall circles.

For a corridor:

```text
project entity XZ onto edge segment
        ↓
radial distance from centerline
        ↓
if distance > allowedRadius
    move inward to boundary
```

The allowed radius should account for entity radius.

For a chamber:

```text
distance from chamber center
    <= chamberRadius - entityRadius
```

At a junction, resolve against the union of the connected corridor/chamber primitives. Do not force the entity into one arbitrary edge merely because it is the nearest edge.

For v1 there is only one edge, so keep the implementation minimal but shape the API so L2 can use multiple primitives.

## 14. Collision ordering

Preserve the existing solid collider path.

Conceptually:

```text
movement proposal
    ↓
solid-out collision
    ↓
if inside CaveVolume
    ↓
interior-in collision
    ↓
vertical ground/floor resolution
```

Do not let a tree/rock collider outside the cave pull the player through the cave wall, and do not let cave interior correction ignore a valid solid collider.

The exact order may need adjustment after browser testing, but the two collision domains must remain explicit.

## 15. ChunkManager collider ownership

Current chunk colliders are keyed by chunk key and rebuilt with `rebuildColliders()` after content attachment. Settlements use independent owner keys through the same registry.

Cave walls should use:

```text
cave:<stable-cave-id>
```

Do not register cave walls under the terrain chunk key. A cave can cross chunk boundaries and its lifecycle is not identical to a single terrain chunk.

On cave presentation unload:

```text
clearColliders(`cave:${cave.id}`)
```

On load/activation:

```text
register / setColliders(`cave:${cave.id}`, ...)
```

The owner key must be stable across streaming.

## 16. Cave mesh generation

Use the graph as the source of truth and generate a separate interior `BufferGeometry`.

For v1, a tube along one edge is enough.

Recommended pipeline:

```text
CaveEdge
  ↓
centerline frames
  ↓
ring vertices
  ↓
side quads / triangles
  ↓
end closure where needed
  ↓
merged BufferGeometry
```

Do not create one `Mesh` per ring or one `Mesh` per metre.

The resulting cave volume should ideally be one render object per cave, especially because the world may eventually contain multiple streamed caves.

The mesh should have enough radial segments to avoid an obviously polygonal interior but remain cheap. This is a landmark, not a terrain replacement.

## 17. Surface/roof seam

The mesh must extend **into** the surface rock rather than terminate exactly at the opening plane.

The plan's 0.5–1 m overlap is a good starting point.

The visual goal is:

```text
surface terrain ───────┐
                       │\
                       │ cave roof
                       │  \
                       └───\
```

rather than:

```text
surface ───────| mesh starts exactly here
```

Exact coplanar joins are likely to produce cracks/z-fighting and expose the heightfield behind the interior.

Do not attempt to solve the seam with a post-hoc rock prop before the analytical geometry is correct.

## 18. Surface clearing and vegetation

This is one of the most important current-code integration details.

The current terrain worker uses `roadTint`/clearing information to suppress vegetation. `modifyTerrain()` happens after worker generation, so the existing large caves do not participate in the worker's vegetation exclusion pipeline.

For the new cave mouth:

```text
CaveGenerator
    ↓
ClearingSegment[]
    ↓
ChunkManager.paramsFor()
    ↓
chunk worker
    ↓
roadTint / vegetation exclusion
```

Do not add a separate `if (nearCave)` check to grass, trees, rocks and environment placement. That would duplicate the world-generation exclusion mechanism.

Only the **surface mouth** needs clearing. Never feed the entire underground corridor into terrain clearing data.

## 19. Mouth ramp

The mouth should read as a transition from surface terrain into the cave.

Prefer a narrow `ClearingSegment` with an appropriate `targetH`/`heightStrength` over a long sequence of `modifyTerrain()` calls.

If the existing clearing contract cannot express the required slope/ramp, add the smallest generic extension to that contract rather than creating a cave-specific terrain mutation path.

Do not use `modifyTerrain()` for the entire tunnel. That recreates the exact architectural problem Plan 104 is intended to remove.

## 20. Existing `modifyTerrain()` remains valid for other systems

Do not remove `modifyTerrain()` globally just because caves stop using it.

It is still used for domain-specific local terrain changes such as existing fauna/settlement interactions.

Plan 104 should only remove the old large-cave tunnel carving once the new cave mouth/world-generation path replaces it.

## 21. Replacing `LargeCaves`

The migration should be explicit:

```text
OLD
largeCaves.ts
createLargeCaves.ts
largeCaveVisual.ts

        ↓ replace

NEW
cave generator / siting
CaveVolume model
cave mesh
cave world/streaming integration
```

Do not leave both systems active “temporarily” in the same world unless a controlled development flag is genuinely required for debugging.

If a compatibility period is needed, make it explicit and temporary; do not let two cave families silently double density.

## 22. Large-cave visual reuse

`src/world/largeCaveVisual.ts` contains useful rock framing logic, but it should be treated as a visual asset/helper, not as the cave geometry model.

Reuse individual rock/entrance ideas where useful, but do not make `CaveVolume` depend on the visual module.

Dependency direction should remain:

```text
CaveVolume / generator
        ↓
visual builder
```

not:

```text
visual builder
        ↓
CaveVolume
```

## 23. Lighting and darkness

The repository already has `PlayerTorch`, so the cave should use the existing player light instead of adding a special cave torch system.

Do not globally lower scene ambient lighting when the player enters a cave.

Prefer cave-local visual treatment:

```text
cave mesh material / vertex colour
fog or local visual override
existing PlayerTorch
```

The cave should become dark because it is dark geometry, not because the entire world suddenly becomes nighttime.

Any fog/post-processing override must be scoped and reversible when leaving the cave.

## 24. Camera collision

The current camera boom has no collision.

For v1, a simple cave-only raycast clamp is acceptable because the cave is a small number of landmark meshes.

Do not introduce `three-mesh-bvh` merely for this feature.

Keep the first implementation deliberately small:

```text
camera target → boom direction
        ↓
Raycaster against active cave mesh
        ↓
shorten boom if wall is hit
```

A fixed minimum distance fallback is acceptable if raycasting proves unnecessary for the first browser milestone.

Do not raycast the entire world every frame.

## 25. Player ground-provider swap

`PlayerController` already has replaceable:

```text
sampleHeight
sampleFloor
waterLevel
collidersNear
```

through `setGround()`.

This is the correct seam for cave floors.

The implementation should switch providers based on the analytical cave state, not mesh raycasts.

Conceptually:

```text
surface:
  sampleHeight = chunkManager.sampleHeight
  sampleFloor  = chunkManager.sampleFloor
  waterLevel   = world water level

inside cave:
  sampleHeight / sampleFloor = cave-aware provider
  waterLevel = cave-specific value
```

Be careful with the naming: if `sampleHeight` and `sampleFloor` have subtly different semantics in the current player code, preserve those semantics rather than blindly assigning both to the same function.

## 26. Ground-provider transition must be hysteretic

Avoid switching providers exactly on a single boundary condition.

Otherwise the player can oscillate between:

```text
surface floor
cave floor
surface floor
cave floor
```

at the mouth.

Use the stable analytical volume + mouth state to define enter/exit conditions, with a small tolerance.

On exit, restore the original `ChunkManager` providers, not freshly created wrapper closures that accumulate over time.

## 27. Vertical motion / falling

Plan 097 already added gravity/jumping to `PlayerController`. Cave implementation must cooperate with it rather than introducing cave-specific vertical physics.

The cave floor is simply another ground provider.

Important cases:

```text
enter mouth while descending
jump inside cave
walk off a small edge if L2 later introduces one
exit cave onto surface
```

For v1, avoid creating artificial cave ledges. Keep the floor continuous so gravity remains simple.

## 28. Animals: do not solve in Phase 2

The current `AnimalAgent` derives Y from `sampleHeight`. Therefore a future cave animal cannot simply walk into a `CaveVolume` without changes.

However, this should remain out of the minimal v1 foundation unless Phase 4 is being implemented.

When Phase 4 starts:

```text
AnimalAgent
    ↓
world ground provider
    ↓
CaveVolume.sampleFloor when inside cave
```

Do not create a cave-only animal controller.

## 29. Cave navigation

The cave graph should become the future navigation representation.

For L2:

```text
CaveNode
  ↕
CaveEdge
  ↕
CaveNode
```

An animal path should traverse graph edges, not move in a straight line from A to B through solid rock.

Do not add a general-purpose navmesh library for the first cave milestone.

## 30. Content and persistence

The plan's content requirement should reuse existing systems.

For treasure, use an existing item kind and the existing pickup/collected-item persistence. Do not introduce a cave-specific chest inventory just to place one reward.

For cave state:

```text
caveId
looted / cleared flags
```

is preferable to persisting generated geometry.

The geometry remains deterministic from:

```text
world seed + cave id
```

Save only state that represents player/world consequences.

## 31. Cave state and streaming are different concerns

A cave may be unloaded visually while remaining part of the deterministic world.

Therefore:

```text
CaveVolume definition = persistent deterministic world definition
Cave mesh/colliders    = streamed presentation/interaction state
Loot state             = persistent consequence
```

Do not delete a cave definition because its mesh is out of range.

## 32. Streaming distance

Use cave-to-player distance with hysteresis, similar to settlement/chunk streaming.

Do not use exact chunk membership as the cave lifecycle trigger.

Recommended conceptual states:

```text
far
  → no mesh/colliders

load threshold
  → build mesh/register cave presentation

unload threshold
  → remove mesh/clear colliders
```

The unload threshold should be larger than the load threshold to avoid thrashing.

## 33. Cross-chunk cave mouths

The mouth and clearing can overlap multiple terrain chunks. This is expected.

Because the worker uses apron sampling and world-space clearing inputs, the same `ClearingSegment` must be supplied to every affected chunk.

Do not clip the clearing to a single chunk manually.

Similarly, the cave mesh must remain a world-space object independent of chunk mesh ownership.

## 34. Avoid duplicate terrain sampling

The cave generator may need many surface samples for the Phase 0 spike and siting.

Do not call expensive chunk/worker generation repeatedly for the same candidate.

For deterministic siting:

```text
candidate
  ↓
small bounded sample set
  ↓
accept/reject
```

Cache only within the generation operation if useful. Do not introduce a global terrain cache unless profiling proves it necessary.

The existing `ChunkManager` field samplers should remain the source of truth.

## 35. Mesh generation should not run on the worker by default

The cave mesh is a relatively small landmark mesh and depends on Three.js geometry creation.

Do not move it to a Web Worker mechanically.

First implement:

```text
pure graph generation / geometry data
        ↓
main-thread BufferGeometry construction
```

Only consider a worker if profiling shows cave generation creates a meaningful frame hitch at realistic cave counts.

## 36. Performance constraints

Seedvale already has evidence that main-thread terrain/chunk mesh finalization can cause visible hitches. Cave implementation must not reintroduce a synchronous world-generation spike.

Avoid:

- generating all caves at world startup;
- creating hundreds of cave meshes because the global grid is scanned eagerly;
- one Object3D per tube segment;
- per-frame cave mesh rebuilds;
- per-frame raycasting against every cave in the world;
- per-frame collision checks against unloaded caves;
- duplicate vegetation exclusion paths.

A good target is:

```text
many deterministic definitions
few nearby active meshes
one analytical query for the current cave
small collider primitive set
```

## 37. Testing strategy

### Pure cave generator tests

Test:

```text
same seed + same cell → same candidate
same seed + different cell → deterministic different result
stable cave id
no duplicate cave ids
edge endpoints are valid
v1 has exactly one edge
edge descends in intended direction
bounds contain all nodes/edges
```

### Siting tests

Test:

```text
reject coast
reject road
reject settlement overlap
reject insufficient slope
reject insufficient overburden
reject water conflict
accept valid sloped site
```

Use small fake samplers. Do not require Three.js.

### CaveVolume tests

Test:

```text
contains centerline point
reject outside corridor
sampleFloor interpolation
nearestMouth
corridor radius handling
chamber containment when L2 is added
```

### Collision tests

Test both directions independently:

```text
solid circle → point pushed out
interior capsule → point pulled in
point already inside → unchanged
point outside → projected onto interior boundary
entity radius respected
```

Also test a cave primitive crossing multiple spatial buckets.

## 38. Browser verification gate

Phase 3 is a hard stop.

The agent should not continue to L2/content after merely passing TypeScript/Vitest tests.

The browser test must specifically inspect:

```text
1. approach to mouth
2. surface → cave floor transition
3. no visible roof/terrain seam
4. player remains inside tunnel
5. camera does not clip through wall
6. torch visibly matters
7. darkness remains local to cave
8. no vegetation covering mouth
9. cave density looks plausible
10. terrain/chunk streaming remains stable
11. N8AO/godrays/fog do not create obvious artefacts
12. exiting cave restores surface ground correctly
```

Do not use headless Chrome as a substitute for this visual gate.

## 39. Debug instrumentation worth adding temporarily

For development, a small debug mode is useful:

```text
cave id
node/edge centers
mouth position
surface Y
floor Y
minimum overburden
current contains() result
active cave id
```

Prefer existing debug/observatory mechanisms if available rather than adding a permanent HUD.

Remove or gate expensive debug geometry before completion.

## 40. Suggested implementation order for the AI agent

### Step 1 — audit only

Read the concrete current implementations of:

```text
src/world/createLargeCaves.ts
src/world/largeCaves.ts
src/world/largeCaveVisual.ts
src/app/worldBundle.ts
src/terrain/chunkManager.ts
src/terrain/chunkHeightmap.ts
src/terrain/chunkHeightmap.worker.ts
src/terrain/buildChunkGeometry.ts
src/world/collision.ts
src/player/PlayerController.ts
src/player/PlayerTorch.ts
src/settlement/roadNetwork.ts
src/settlement/villageClearing.ts
```

Also inspect the current tests around chunk heightmaps/collisions.

Stop broad exploration once the exact integration seams are confirmed.

### Step 2 — Phase 0 spike

Implement only the deterministic siting measurement. Do not create cave meshes.

Produce numbers for the current seed and tune the nominal probabilities/thresholds only if the measured acceptance rate requires it.

### Step 3 — pure `CaveVolume`

Implement the graph, `contains`, `sampleFloor`, `nearestMouth` and deterministic IDs with unit tests.

No Three.js dependency in the core model.

### Step 4 — replace large-cave siting

Switch the world-scale cave registry from the old `pickLargeCaveSites()` model to the cave grid.

At this stage, it is acceptable to expose only the v1 single-edge definition.

### Step 5 — integrate mouth with terrain worker

Thread `ClearingSegment[]` through the existing `paramsFor()` → worker path.

Verify vegetation exclusion before touching cave mesh polish.

### Step 6 — build v1 interior mesh

Create one merged mesh per active cave. Overlap it into the surface enough to prevent seam leaks.

### Step 7 — integrate collision + floor

Extend the existing collision system and `PlayerController.setGround()` seam.

Do not create a second registry or physics system.

### Step 8 — camera + lighting

Add the smallest cave-specific camera clamp and local darkness/fog treatment.

### Step 9 — browser gate

Stop and wait for the user's visual approval before L2/content.

### Step 10 — L2/content

Only after the gate:

```text
2–4 edges
1 chamber
wolf / cave fauna
existing item treasure
persistent cave flags
cave navigation
```

## 41. Things the implementing agent must not do

Do not:

- modify the plan itself while implementing the notes;
- continue the old `modifyTerrain()` tunnel approach;
- create a `CaveChunkManager`;
- create a second collision registry;
- use mesh/BVH collision as the authoritative cave collision;
- use raycasts to decide cave membership;
- create an `InteriorVolume` abstraction for generic interiors;
- introduce runtime CSG;
- introduce voxel terrain;
- create a portal/scene interior that disconnects the cave from the world simulation;
- generate caves once globally around `(0,0)`;
- use non-deterministic cave IDs;
- add a cave-specific vegetation exclusion system;
- add a cave-specific physics system;
- add a cave-specific animal controller;
- add a cave-specific item/chest inventory for one reward;
- run all cave mesh generation eagerly at startup;
- put cave presentation state into terrain chunks;
- persist generated cave geometry.

## 42. Final implementation invariants

The implementation is on the right architectural track if all of these remain true:

```text
World seed + cave cell
    → stable CaveVolume

CaveVolume
    → mesh
    → floor
    → collision
    → future nav

Terrain worker
    → knows only about the cave mouth/clearing input

ChunkManager
    → remains terrain streaming owner

WorldBundle
    → owns one cave subsystem

ColliderRegistry
    → remains the single world collision registry

PlayerController
    → switches existing ground providers

PlayerTorch
    → remains the actual portable cave light

Save
    → stores consequences, not generated geometry

Remote cave
    → exists logically without an active mesh
```

The strongest success criterion is not “there is a tunnel mesh”. It is that the cave behaves as another deterministic world landmark while reusing the existing terrain, streaming, collision and player seams instead of creating parallel infrastructure.
