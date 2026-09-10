# Cave V2 — B4 streaming, lifecycle and performance recon

**Date:** 2026-09-10  
**Plan:** `docs/plans/world-terrain-008-underground-caves-v2.md`  
**Milestone:** B4 — streaming + lifecycle + performance  
**Status:** focused recon complete; no implementation in this document

## Current B4 baseline

Current production Cave V2 already has the important architectural split between persistent world/gameplay spatial truth and streamed presentation. The main B4 problem is that presentation extraction still runs synchronously on the main thread.

Current lifecycle:

```text
pickLargeCaveSites()
    ↓
buildProductionCaveTopology()
    ↓
buildCaveSdfRepresentation()
    ↓
buildCaveSdfColumnIndex()
    ↓
buildCaveSdfColliders()
    ↓
retained CaveRuntime
    │
    ├─ gameplay/world spatial truth
    │    queryGround()
    │    occupancyAt()
    │    queryInterior()
    │
    └─ relevance update
         Caves.update(player.x, player.z)
             ↓ <= 55 m
         activate()
             ↓
         buildSdfCaveMesh() — synchronous
             ↓
         BufferGeometry
         computeVertexNormals()
         THREE.Mesh
         entrance/framing visual
         scene.add()
         collider registration
             ↓ >= 80 m
         deactivate()
             ↓
         removeFromParent()
         disposeObject3D()
         clearColliders()
```

### Ownership and eagerness

| Stage | Creation | Thread | Owner/lifetime |
|---|---|---|---|
| cave site / identity | world creation | main | persistent for `WorldBundle` |
| `CaveTopology` | eager in `createCaves()` | main | persistent `CaveRuntime` |
| `CaveSdfSpatialRepresentation` | eager | main | persistent `CaveRuntime` |
| `CaveSdfColumnIndex` | eager | main | persistent `CaveRuntime` |
| collider data | eager | main | persistent `CaveRuntime` |
| mouth terrain modification | world creation | main | world state |
| SDF render extraction | `activate()` | main | active presentation only |
| `BufferGeometry` / `THREE.Mesh` | `activate()` | main | active presentation only |
| collider registration in `ChunkManager` | `activate()` | main | relevance-scoped |

`createCaves()` therefore currently does more eager work than older design notes may imply: topology, SDF representation, column/query structures and occupancy-derived collider data are built for every generated cave during world creation. Render geometry is not.

The retained runtime contains the authoritative spatial data independently of render activation. Presentation is tracked separately through active scene objects.

Current streaming thresholds in `createCaves.ts`:

```text
ACTIVATE_DISTANCE   = 55 m
DEACTIVATE_DISTANCE = 80 m
CAVE_GRID_CELL      = 500 m
```

This already provides 25 m hysteresis.

`activate()` is idempotent with respect to already-active caves. `deactivate()` removes the scene object, disposes its non-shared GPU geometry/material resources through `disposeObject3D()`, and clears registered colliders. Render geometry is not retained as a cache, so revisiting a cave causes extraction again.

## Performance risks

### Synchronous activation is the primary runtime hitch risk

`activate()` currently performs the expensive presentation path synchronously:

```text
buildSdfCaveMesh()
→ SDF field sampling
→ Surface Nets
→ clipping
→ BufferGeometry attributes/index
→ computeVertexNormals()
→ computeBoundingBox()
→ THREE.Mesh
→ entrance/framing visual
→ scene.add()
```

Historical Milestone A measurements for a representative cave showed approximately:

- topology: ~0.26 ms,
- SDF representation: ~0.07 ms,
- SDF extraction/build: ~112.6 ms median,
- ~3,974 vertices,
- ~7,948 triangles,
- ~191 KB final geometry,
- ~792 KB sampled field temporary memory.

A branch-heavy case was approximately 4,339 vertices / 8,684 triangles.

These are historical spike measurements rather than exact current production timings, but they are sufficient to identify synchronous SDF extraction as incompatible with a smooth frame-time budget.

Current mesh metrics also do not cover the entire activation path. In particular, final `BufferGeometry` construction, normals, bounding data, `THREE.Mesh`, framing and scene registration need production instrumentation before B4 is closed.

### Multiple caves can become relevant in one update

Production generation attempts multiple caves and uses minimum cave separation around 90 m. Since activation radius is 55 m, relevance regions can overlap. `Caves.update()` currently has no presentation extraction queue, concurrency limit, nearest-first scheduling or per-frame generation budget.

Therefore more than one synchronous `activate()` can theoretically execute in one tick/frame.

### Boot work

World boot does not generate cave render meshes, which is correct. It does synchronously build topology, SDF representation, column index and collider data for all caves.

The potentially material eager costs are `buildCaveSdfColumnIndex()` and `buildCaveSdfColliders()`: both repeatedly sample the SDF, including boundary/crossing refinement.

There are no sufficiently granular production timings for these individual stages yet. Current boot instrumentation is too coarse to justify moving them to a worker as part of B4 without measurement first.

## Gameplay/world truth vs presentation

The following must remain available independently of render activation:

- cave identity and world location,
- topology,
- SDF-derived spatial truth,
- column/ground query structures,
- occupancy / `queryInterior`,
- collider description/data,
- future discovery, persistence, quest and simulation references.

Current production already follows this principle for the core spatial queries:

```text
queryGround()    → column index
occupancyAt()    → SDF-derived occupancy
queryInterior()  → spatial representation/occupancy semantics
```

They do not require the render mesh to be active.

Presentation-only state includes:

- sampled/extracted render geometry,
- `BufferGeometry`,
- render material instances/resources,
- `THREE.Mesh` / presentation group,
- scene registration,
- entrance/framing render objects.

NPC/fauna cave use should continue to consume topology/spatial/query truth or a cheaper semantic projection of it, never the presentation mesh.

## Existing mechanisms to reuse

### Terrain chunk streaming

`ChunkManager` / terrain worker infrastructure already demonstrates the useful semantics for B4:

- async worker jobs,
- request IDs,
- queued/in-flight work,
- relevance/prioritisation,
- limits on work started/finalised per frame,
- stale-result handling,
- unload while work is pending,
- streaming hitch instrumentation.

This is the pattern to reuse conceptually. Cave extraction should not automatically consume the terrain worker pool if long cave jobs could starve terrain streaming.

### `SettlementsManager`

Settlement runtime provides a particularly relevant lifecycle pattern:

- authoritative state is independent from loaded scene state,
- loading is idempotent,
- pending state is recorded before async work,
- completion checks whether the result is still wanted,
- stale completed results are disposed,
- unload does not destroy authoritative simulation state.

Caves can extend their existing `Caves.update()` / `activate()` ownership in the same direction. A separate monolithic `CaveManager` is not required.

## Worker decision

**Decision: YES for SDF render extraction, but not for the entire cave runtime.**

Reasons:

- historical extraction is roughly 100+ ms and CPU-heavy,
- extraction is deterministic,
- topology/SDF parameters can be represented as serializable data,
- output can be transferable typed arrays,
- worker/main communication volume is reasonable compared with the avoided main-thread work,
- Three.js objects should remain main-thread owned.

Do not attempt to transfer the current `CaveSdfSpatialRepresentation` object directly because it contains executable sampling behaviour. Reconstruct the deterministic SDF representation in the worker from serializable topology/configuration.

Minimal direction:

```text
MAIN
CaveTopology
+ serializable SDF/extraction config
+ caveId / requestId
        ↓
CAVE EXTRACTION WORKER
rebuild deterministic SDF representation
sample SDF grid
Surface Nets extraction
        ↓
transferable typed arrays
positions: Float32Array
indices: Uint32Array
+ extraction metrics
        ↓
MAIN
world-dependent clipping/finalisation as required
BufferGeometry
normals/bounds
THREE.Mesh
scene registration
```

A current complication is that production mesh building performs clipping against `analyticSurfaceHeight`, which is world/main-owned behaviour rather than a trivially serializable worker input. Therefore the first worker seam should focus on the expensive SDF sampling + Surface Nets portion rather than mechanically moving all of `buildSdfCaveMesh()`.

A small cave-presentation worker/client owned by the existing cave runtime is preferable to a new global manager. It should reuse the request/pending/stale-result protocol patterns already present in terrain streaming.

## Recommended B4 architecture

Target ownership:

```text
WORLD / GAMEPLAY — persistent
────────────────────────────────
CaveSite / caveId
        ↓
CaveTopology
        ↓
CaveSdfSpatialRepresentation
        ↓
CaveSdfColumnIndex
        ├─ queryGround
        ├─ occupancyAt
        ├─ queryInterior
        └─ collider data

        │ independent of presentation
        ▼

PRESENTATION — relevance streamed
─────────────────────────────────
distance/relevance
        ↓
requested / queued / loading
        ↓
worker extraction
        ↓
raw transferable arrays
        ↓
main-thread Three.js finalisation
        ↓
active scene object
```

Collider data remains persistent. Collider registration near the player must no longer wait for render mesh extraction once extraction becomes asynchronous.

Recommended relevance semantics retain the existing measured/design-integrated thresholds rather than inventing new numbers:

```text
distance <= 55 m:
    wanted = true
    register already-built colliders immediately
    request/enqueue presentation if absent

55 m < distance < 80 m:
    retain current presentation/relevance state

distance >= 80 m:
    wanted = false
    detach/dispose presentation
    clear registered colliders
    invalidate pending presentation result
```

Initial extraction concurrency should be conservative: one cave extraction in flight, with queued caves ordered by current relevance/distance. Cave extraction is infrequent, expensive CPU work and should not compete aggressively with terrain/world simulation.

### Cache/disposal

Do not introduce an unlimited geometry cache in the first B4 implementation.

After deactivation:

```text
scene object removed
BufferGeometry disposed
raw extraction arrays released
world/spatial CaveRuntime retained
```

Re-entry may regenerate asynchronously. If production measurements later show repeated extraction to be a real issue, a bounded byte-budget/LRU cache can be considered as a separate measured optimisation.

Also verify the lifecycle of the shared cave material during implementation so deactivation does not accidentally cause unnecessary shader/material churn.

## Proposed B4 slices

### B4.1 — lifecycle seam + production instrumentation

Before adding a worker:

- separate collider relevance from presentation completion,
- introduce explicit presentation lifecycle such as `inactive | queued | building | active`,
- make request/generation identity explicit so stale completion can be rejected,
- preserve existing 55/80 m hysteresis,
- add granular production timings for:
  - topology,
  - SDF representation,
  - column index,
  - colliders,
  - field sampling,
  - Surface Nets,
  - clipping,
  - `BufferGeometry`,
  - normals/bounds,
  - framing,
  - total activation,
- improve temporary/final byte accounting.

No topology, SDF shape, gameplay ground or collision behaviour changes belong in this slice.

### B4.2 — asynchronous SDF extraction

- introduce cave extraction worker/client,
- move expensive SDF grid sampling + Surface Nets off main,
- transfer typed arrays,
- keep Three.js finalisation on main,
- max one extraction in flight initially,
- nearest/relevance-first queue,
- duplicate activation coalescing,
- generation/request token,
- stale/deactivated/disposed result rejection,
- no synchronous heavy extraction fallback on the frame path.

### B4.3 — disposal/cache/performance closure

- validate material/geometry disposal,
- add active/queued/in-flight and memory counters,
- verify repeated visits do not grow retained render memory,
- consider bounded cache only if measurements justify it,
- record final production timings and B4 conclusions.

Do not move eager column index/collider construction to workers until B4.1 instrumentation demonstrates that their boot cost warrants it.

## Tests / instrumentation

Targeted automated coverage should include:

1. duplicate activation of one cave creates one presentation job,
2. activate → deactivate → completion does not add stale presentation to the scene,
3. activate → deactivate → activate rejects the old generation result,
4. world/caves dispose during an in-flight job prevents later scene mutation,
5. multiple nearby caves obey extraction concurrency and relevance ordering,
6. 55/80 m hysteresis prevents boundary thrashing,
7. deactivated caves still answer `queryGround`, occupancy and `queryInterior`,
8. collider relevance is available independently of mesh readiness,
9. worker extraction remains deterministic for identical topology/config,
10. repeated activate/deactivate returns retained render geometry/memory to baseline.

Useful production metrics:

```text
BOOT
cave.topology
cave.sdfRepresentation
cave.columnIndex
cave.colliders

STREAMING
cave.queueWait
cave.workerRepresentation
cave.workerSampling
cave.workerSurfaceNets
cave.mainClip
cave.bufferGeometry
cave.normals
cave.sceneFinalize

MEMORY / STATE
rawBytes
geometryBytes
temporaryBytes
activeCaves
queuedJobs
inFlightJobs
```

## Failure modes and required semantics

| Failure mode | Required behaviour |
|---|---|
| player reaches cave before mesh is ready | gameplay queries and collision remain valid; presentation may temporarily pop in |
| async result returns after deactivation | reject result and release transferred buffers/resources |
| world dispose during worker job | invalidate generation; no later scene mutation |
| two activates for same cave | coalesce to one queued/in-flight job |
| rapid activation boundary crossing | existing 55/80 hysteresis prevents churn |
| several nearby caves | bounded concurrency; nearest/relevant cave first |
| old result returns after reactivation | request/generation token rejects it |
| many caves visited over time | no unbounded render geometry retention |
| render mesh absent | gameplay spatial truth remains available |
| teleport to another cave | immediately update collider relevance, reprioritise/cancel queued work, reject obsolete completion |

For an already-running worker extraction, cooperative cancellation is not initially necessary. It can finish and have its stale result discarded. Queued jobs should be cheap to remove/reprioritise.

## Risks / guardrails

B4 must not:

- change cave topology/generation quality,
- change SDF shape,
- change B2 gameplay ground ownership,
- change B3 collision behaviour,
- change camera, swimming/water ownership, entrance geometry or player movement,
- restore `CaveVolume` as gameplay truth,
- make gameplay queries depend on presentation activation,
- introduce global voxel terrain,
- introduce a monolithic `CaveManager`,
- mechanically move unrelated cave work into workers.

World/simulation truth must remain independent from player/camera presentation relevance, and presentation-owned state must not become authoritative in a way that blocks future multiplayer/server simulation.

## Implementation handoff for Grok

```text
Implement Cave V2 B4 incrementally on current main.

Start with B4.1 only.

Primary files:
- src/world/createCaves.ts
- src/world/caves/sdfCaveMesh.ts
- src/world/caves/caveSdfField.ts
- src/world/caves/caveSdfQuery.ts
- src/world/caves/caveSdfColliders.ts

Patterns to inspect/reuse:
- terrain ChunkManager / worker pool / worker protocol
- SettlementsManager async loaded-vs-authoritative lifecycle

Preserve persistent CaveRuntime:
topology + SDF representation + column index + collider data.

Separate presentation lifecycle from gameplay/world truth.
Keep current 55 m activation / 80 m deactivation hysteresis.

B4.1:
- explicit presentation pending/active lifecycle
- collider registration independent of render mesh completion
- production timing/memory instrumentation
- stale-generation token seam
- no topology/SDF/collision behaviour changes

B4.2 after measurements:
- move SDF grid sampling + Surface Nets extraction to a Web Worker
- max 1 cave extraction in flight initially
- relevance/distance-first queue
- transferable typed-array output
- THREE.BufferGeometry/Mesh stays on main
- discard stale/deactivated/disposed results

Do not create CaveManager.
Do not use CaveVolume as gameplay truth.
Do not change B2/B3 behaviour.
No browser/Playwright verification.
Do not run pnpm docs:sync.
```

## Recon conclusion

The current Cave V2 data architecture does not need a broad redesign for B4. Persistent gameplay/spatial truth is already separated from render activation. The immediate architectural defect is synchronous SDF presentation extraction inside `activate()` plus the absence of an explicit queued/loading/stale-result lifecycle.

Recommended sequence:

```text
B4.1 lifecycle seam + measurements
→ B4.2 dedicated asynchronous extraction
→ B4.3 disposal/memory/performance closure
```
