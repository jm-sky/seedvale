# Implementation Notes: Underground Caves V2 — B4

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`  
> Recon: `docs/design/caves/05-b4-streaming-lifecycle-performance-recon.md`  
> Date: **2026-09-10**  
> Scope: **Milestone B4 only — streaming + lifecycle + performance**

These notes turn the B4 recon into an implementation contract. Current code is the source of truth. Do not reconstruct B1/B2/B3 architecture from older notes when it conflicts with current main.

## Current production baseline

Persistent cave runtime is already separated from presentation.

Per cave, `createCaves()` eagerly retains:

```text
CaveTopology
CaveSdfSpatialRepresentation
CaveSdfColumnIndex
SDF-derived collider data
```

Gameplay/world queries consume retained spatial truth independently of render activation:

```text
queryGround()
occupancyAt()
queryInterior()
```

Presentation is streamed by distance:

```text
<= 55 m  → activate
>= 80 m  → deactivate
```

Current `activate()` synchronously runs the expensive render extraction path before adding the cave mesh to the scene. Historical SDF extraction is ~112.6 ms on the representative Milestone-A case, so this is the primary B4 hitch risk.

Current `deactivate()` removes and disposes render objects and clears registered colliders. There is no persistent render geometry cache.

## B4 architecture decision

B4 is split into three implementation slices:

```text
B4.1 lifecycle seam + production instrumentation
B4.2 asynchronous SDF extraction
B4.3 disposal / memory / cache closure
```

Do not implement B4.2 or B4.3 while doing B4.1 unless a tiny prerequisite is strictly required.

---

# B4.1 — Lifecycle seam + instrumentation

## Goal

Prepare the existing cave runtime for asynchronous presentation extraction without changing cave generation, SDF shape, gameplay spatial truth, collision behaviour, camera behaviour, water/swimming ownership, entrance behaviour or player movement.

B4.1 should still work with synchronous extraction. Its job is to introduce the correct ownership/lifecycle seam and produce trustworthy measurements.

## Required lifecycle model

Extend the existing `createCaves()` ownership; do not create a new `CaveManager`.

Presentation state should become explicit. Exact type naming is implementation-owned, but semantics must support at least:

```text
inactive
queued / requested
building
active
```

A cave may have persistent gameplay/spatial truth while presentation is absent or building.

Use a per-cave request/generation identity so future async completion can be rejected if the cave was deactivated, rebuilt or disposed before the result is applied.

B4.1 does not need a worker yet, but the lifecycle must not assume that `activate()` completes presentation synchronously.

## Collider registration ownership

Collider **data** remains persistent/derived from retained SDF spatial truth.

Collider registration in `ChunkManager` is relevance-scoped but must not depend on render mesh completion.

Target semantics:

```text
distance <= 55 m
    → cave wanted
    → register already-built colliders immediately
    → request/build presentation if absent

55 m < distance < 80 m
    → retain current relevance/presentation state

distance >= 80 m
    → cave not wanted
    → clear registered colliders
    → detach/dispose presentation
    → invalidate pending presentation generation
```

Keep the existing `55 m / 80 m` thresholds unless production evidence clearly requires changing them. Threshold tuning is not part of B4.1.

## Instrumentation

Add production timings granular enough to answer where cave cost actually occurs.

World-build / boot measurements:

```text
cave.topology
cave.sdfRepresentation
cave.columnIndex
cave.colliders
```

Presentation build measurements:

```text
cave.sdfSampling
cave.surfaceNets
cave.clipping
cave.bufferGeometry
cave.normalsBounds
cave.framing
cave.activationTotal
```

Also retain/report where practical:

```text
vertices
triangles
raw/final geometry bytes
peak/estimated temporary bytes
collider count / proxy size
```

Reuse existing Seedvale timing/hitch instrumentation conventions rather than creating an unrelated metrics framework. Cave activation work belongs to streaming/performance diagnostics.

Current `CaveSpikeMetrics.meshBuildMs` is insufficient as the only production measurement because main-thread BufferGeometry creation, normal/bounds calculation, framing and scene finalisation also matter.

## Material/disposal check

Verify the ownership of the cave material used by active cave meshes.

`disposeObject3D()` disposes geometry and non-`sharedGpu` materials. If the cave material is intentionally shared across cave presentations, ensure its lifecycle is explicit and repeated cave deactivation does not incorrectly dispose a shared resource or cause unnecessary re-creation/re-upload churn.

Do not introduce a general material-management refactor.

## B4.1 automated tests

Add focused tests around lifecycle behaviour where the current architecture permits it:

1. requesting/activating the same cave twice does not duplicate presentation work/state;
2. deactivation clears relevance-scoped collider registration without destroying retained gameplay spatial truth;
3. a deactivated cave still answers `queryGround`, occupancy and `queryInterior`;
4. 55/80 hysteresis does not thrash activation state at one boundary;
5. generation/request identity is invalidated on deactivate/dispose;
6. disposal leaves no active presentation entries/collider registrations owned by the cave runtime.

If direct scene/ChunkManager testing would force broad test scaffolding, test the extracted lifecycle policy/state seam instead. Do not redesign runtime just to make tests easy.

## B4.1 acceptance

B4.1 is complete when:

- persistent cave/gameplay truth remains independent of render presentation;
- collider registration no longer structurally depends on synchronous mesh completion;
- presentation has an explicit pending/building lifecycle suitable for async B4.2;
- stale-generation/request identity exists;
- granular production timings exist for boot and presentation stages;
- current 55/80 hysteresis is preserved;
- technical tests/checks pass;
- no B2/B3 gameplay behaviour was intentionally changed.

Browser verification is performed by the Player, not the implementation agent.

---

# B4.2 — Asynchronous SDF extraction

Start only after B4.1 metrics/lifecycle are in place.

## Worker boundary

Use a dedicated cave extraction worker/client, reusing terrain worker protocol semantics but not mechanically sharing the terrain worker pool.

Initial worker input:

```text
caveId / requestId
serializable CaveTopology
serializable SDF/extraction configuration
```

Worker performs the CPU-heavy pure part:

```text
rebuild deterministic SDF representation
→ sample SDF field/grid
→ Surface Nets extraction
```

Return transferable typed arrays and metrics:

```text
Float32Array positions
Uint32Array indices
metrics
```

Keep Three.js construction/finalisation on main:

```text
world-dependent clipping/finalisation where required
BufferGeometry
normals/bounds
Mesh/material/group
scene registration
```

`CaveSdfSpatialRepresentation` itself contains executable sampling behaviour and is not a transfer object. Rebuild it deterministically in the worker from serializable topology/config rather than introducing duplicate SDF algorithms.

Current production clipping depends on `analyticSurfaceHeight`; inspect the exact current seam before implementation. Do not serialize arbitrary world functions or duplicate terrain truth in the worker.

## Scheduling

Initial policy:

- max **1** cave extraction in flight;
- queue additional wanted caves;
- nearest/currently most relevant cave first;
- duplicate request for the same cave coalesces;
- deactivation removes queued work where possible;
- already-running worker work may finish but its result is discarded if stale;
- teleport/relevance change reprioritises queued work;
- world dispose terminates the worker/client and invalidates all generations.

No synchronous heavy extraction fallback should remain on the hot streaming update path once B4.2 is enabled.

## B4.2 required tests

- same cave requested twice → one queued/in-flight job;
- activate → deactivate → old worker result → no scene mutation;
- activate → deactivate → activate → old generation cannot override new;
- dispose during in-flight work → completion ignored;
- two nearby caves → max one extraction in flight and deterministic/relevance ordering;
- identical topology/config → deterministic extraction signature.

---

# B4.3 — Disposal, memory and cache closure

Start after B4.2 is stable.

Validate:

- repeated activation/deactivation releases render geometry;
- transferred raw arrays are not retained accidentally;
- worker/pending state is released on world rebuild/dispose;
- material lifecycle is correct;
- active/queued/in-flight counters return to expected baseline;
- many visited caves do not create unbounded memory growth.

Initial cache policy: **no persistent geometry cache**.

If measured repeated revisits show extraction cost remains materially harmful, consider only a bounded byte-budget/LRU cache. Do not add an unlimited cave geometry cache.

---

## Primary files

Expected primary implementation surface:

```text
src/world/createCaves.ts
src/world/caves/sdfCaveMesh.ts
src/world/caves/caveSdfField.ts
src/world/caves/caveSdfQuery.ts
src/world/caves/caveSdfColliders.ts
```

Patterns to inspect/reuse:

```text
src/terrain/chunkWorkerPool.ts
src/terrain/chunkHeightmapProtocol.ts
src/terrain/chunkManager.ts
src/settlement/SettlementsManager.ts
src/assets/loadGltf.ts          // disposal helper semantics
```

Do not assume line numbers from older notes are current.

## Guardrails

Do not:

- change production topology/generation quality;
- change SDF shape or representation semantics;
- change B2 ground/query ownership;
- change B3 collision/camera behaviour;
- change swimming/water ownership or entrance/player movement fixes;
- restore `CaveVolume` as gameplay truth;
- make gameplay/world truth depend on presentation state;
- create global voxel terrain;
- create a monolithic `CaveManager`;
- workerize unrelated work without measurement;
- refactor unrelated systems;
- run browser/Playwright/gameplay verification as the agent;
- run `pnpm docs:sync`.

Future multiplayer/server simulation must not depend on camera/player presentation activation state.

## Technical verification

Run the relevant repository checks after implementation, following current scripts/configuration. At minimum use the cave-targeted tests plus TypeScript/lint/build checks required by current project guidance.

Browser/manual verification remains Player-owned.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
