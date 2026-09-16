# Implementation notes: fauna-033 — Animal movement hot-path performance

**Plan:** `fauna-033-animal-movement-hot-path-performance.md`
**Prepared:** 2026-09-16

## Baseline and confirmed findings

Primary baseline:

`docs/performance/results/2026-09-16--020--benchmark-stream.md`

Observed benchmark state:

- avg frame ~104.9 ms,
- `FAUNA` ~42.9 ms/frame,
- fauna `behaviour` ~37.1 ms/frame,
- 31 wild fauna agents,
- ~20.9 behaviour executions/frame,
- one long frame measured `FAUNA ≈ 1068.3 ms` out of `1119.4 ms` total.

This is not a nearest/prey/threat-search problem. Existing `fauna-028` recon already established that nearest scans are cheap relative to movement. Do not spend implementation time redesigning prey/threat lookup unless new instrumentation contradicts that result.

Relevant historical notes:

`docs/plans/implementation-notes/fauna-028-animal-agent-update-cadence-implementation-notes.md`

They establish the current movement cost shape:

```text
steerToward()
→ stepWithSlopeAndCollision()
  → sampleSlope()                 // several sampleHeight calls
  → up to 3 × isWalkable()
       → sampleLocalWater()
       → collidersNear()
→ tickMovementTail()
  → snapY()
  → resolveWaterTraversal()
```

Per moving animal, the earlier recon approximated the core path at roughly:

- ~5 height samples,
- up to 3 water samples from `isWalkable`,
- up to 3 collider queries,
- plus movement-tail water/height work.

`fauna-028` deliberately throttles behaviour/presentation but keeps sensing/targeting/decision full-rate. Preserve that split unless the conditional cadence phase is explicitly reached after a new browser benchmark.

## Exact code ownership

### `src/fauna/AnimalAgent.ts`

This remains the single shared runtime for wild fauna and livestock. Do not create a second movement/runtime path.

Key symbols:

- `update()` — current cadence gate and behaviour execution owner,
- `steerToward()` — common autonomous movement choke point,
- `isWalkable(x, z)` — calls physical water sampling first, then iterates `collidersNear(x, z)`,
- `tickMovementTail()` — follows behaviour execution with ground/water state reconciliation.

`isWalkable()` semantics are load-bearing: physical water traversal and collider rejection are shared by autonomous movement and mounted movement. Optimization must not introduce an alternate water answer for autonomous fauna.

### `src/terrain/slopeConstraint.ts`

`stepWithSlopeAndCollision()` is shared movement infrastructure. It performs:

1. one slope-constrained desired step,
2. full XZ walkability probe,
3. X-only fallback probe if blocked,
4. Z-only fallback probe if still blocked.

So one movement attempt may call `isWalkable()` three times. Do not fork this helper for fauna.

### `src/terrain/chunkManager.ts`

This is the critical owner for Phase B.

Current `sampleLocalWater(worldX, worldZ)` does conceptually:

```text
worldToChunk
→ chunks.get
→ if rec.riverChains exists:
     riverChannelSegmentsNear(rec.riverChains, worldX, worldZ, RIVER_SHORE_QUERY_SIZE)
→ sampleLocalWaterPure(...)
```

That means gameplay query-time reconstructs a narrowed `RiverChannelSegment[]` repeatedly.

The implementation agent should inspect the actual loaded chunk record type and the exact assignment/finalization sites for:

- `riverChains`,
- river finalize/attach state,
- chunk unload/removal.

Do not invent a parallel cache registry. Add the derived gameplay representation to the existing loaded-chunk-owned state and update it at the same lifecycle boundary as `riverChains`.

Important architectural invariant:

```text
riverChains             = canonical source
river gameplay segments = derived cache only
```

The derived field must never survive canonical state replacement/unload independently.

### `src/terrain/riverNetwork.ts`

`riverChannelSegmentsNear()` loops chains and consecutive chain points, computes flow/width/depth/channel reach, filters against the query box and pushes new `RiverChannelSegment` objects into a new array.

This function is valid preparation logic; the problem is its placement in a per-agent gameplay query hot path.

Do not duplicate its formulas into `chunkManager.ts`.

`riverWaterSampleAt()` then scans the already prepared segment list to find the nearest water edge and interpolate water/bed heights. Leave this alone in the basic fix. Optimize it only if the User's post-Phase-B benchmark still identifies it as material.

### `src/terrain/waterSample.ts`

`sampleLocalWater(...)` is the canonical pure physical answer and should stay so.

It resolves:

- river water first when a point lies inside a river channel,
- otherwise lake/ocean using clamped/floor height and global water level,
- ford floor shaping when applicable.

Do not move river-vs-lake classification into fauna or `ChunkManager` query callers.

### `src/world/collision.ts`

`createColliderRegistry(...).query(x, z)` currently:

- creates a new `Collider[]`,
- checks the 3×3 surrounding bucket cells,
- appends bucket contents with `push(...bucket)`,
- returns the new array.

This is a plausible secondary allocation source but is **not yet proven** as a meaningful part of the current 37 ms/frame fauna behaviour cost. Keep it unchanged in Phase B unless instrumentation proves otherwise.

### `src/fauna/animalUpdateCadence.ts`

Current behaviour intervals:

- `immediate`: `0`,
- `active`: `1/30 s`,
- `routine`: `1/12 s`,
- per-agent phase may shorten interval,
- movement interval is additionally capped by `MAX_THROTTLED_STEP_M / walkSpeed`.

`isCadenceDue()` is simply:

```ts
intervalSec <= 0 || accumulatedSec >= intervalSec
```

Therefore a slow frame with `dt` above an interval makes that gate due. At the benchmark's ~105 ms average, both 1/30 and 1/12 intervals can be due on successive frames.

This is a credible feedback-loop mechanism, but do **not** alter it during the basic fix. The cadence implementation has multiple correctness invariants documented in fauna-028 notes: accumulated movement time, immediate reactions, sticky movement presentation state, deterministic phase spreading and bounded movement quantum. A cadence change deserves its own measured decision after Phase B.

## Phase A instrumentation guidance

Reuse `src/perf/agentCpuDiag.ts` and the existing benchmark/reporting pipeline.

Avoid a second long-lived metrics store. Existing `PerfMonitor` / agent CPU structures already establish the project's performance-diagnostics pattern.

Useful counters/timers:

### Fauna movement

- behaviour total,
- movement/steering total,
- slope constraint/sample total,
- walkability total,
- movement tail total,
- worst behaviour execution with `animalId`, `kind`, importance.

Do not add a timer around every trivial math operation if the timer itself becomes material. Prefer coarse nested spans sufficient to distinguish water vs collision vs slope.

### Water

At the `ChunkManager.sampleLocalWater` boundary record:

- call count,
- total query ms,
- worst call ms.

At current on-demand segment preparation record before Phase B:

- `riverChannelSegmentsNear` invocation count,
- candidate chain-point/segment count where cheaply available,
- produced segment count,
- preparation ms.

After Phase B, the gameplay-query invocation count of `riverChannelSegmentsNear` should be zero by construction.

Do not instrument the separate streaming/terrain preparation path in a way that confuses it with gameplay water-query calls; the report should distinguish these owners.

### Collision

Record `ColliderRegistry.query()` calls/returned collider count only if the diagnostic seam can be added without changing all consumers or allocating debug objects. Detailed collider optimization is conditional.

## Phase B lifecycle decision

The implementing agent must locate the exact places where `riverChains` are created/assigned and cleared.

Build cached gameplay segments at the canonical mutation boundary, not lazily inside `sampleLocalWater()`.

Why not lazy query cache:

- it leaves first-use hitch potential inside the fauna frame,
- it makes invalidation more subtle,
- the chunk already has a natural preparation/finalization lifecycle,
- derived segments belong to chunk state, not caller state.

The cache may use the existing `RIVER_SHORE_QUERY_SIZE` semantics if that preserves the exact old query answer for arbitrary points within the chunk. Verify this carefully: the previous call centered `riverChannelSegmentsNear` on each queried world point, not necessarily the chunk center. A naïve cache made from one chunk-center query box could omit segments near edges.

Therefore before implementing, resolve the coverage contract explicitly:

1. Determine the spatial extent within which `ChunkManager.sampleLocalWater()` may query a chunk record.
2. Build a cached segment set covering the **whole chunk plus the same required channel reach/margin**, not merely one old point-sized query centered at chunk center.
3. Reuse `riverChannelSegmentsNear()` if it can express that coverage safely; otherwise add a general pure helper in `riverNetwork.ts` that prepares segments overlapping a supplied world rect and make `riverChannelSegmentsNear()` delegate to it.
4. Keep one implementation of the hydrology→`RiverChannelSegment` formulas.

This coverage issue is the most important correctness trap in the planned cache.

## Water equivalence tests

Do not test only one river center point.

Use representative samples covering:

- dry land with no river chains,
- lake/ocean-only water,
- point inside a river near chunk center,
- river close to a chunk boundary,
- segment whose centerline points lie outside the chunk/query core but whose channel reach overlaps it,
- ford influence,
- unload/reload/rebuild lifecycle.

The preferred regression shape is to compare the cached-query result against the existing on-demand/reference preparation using the same canonical chains and query points. Assert the full `LocalWaterSample`, not only `present`.

If floating interpolation requires tolerance, use the project's existing approximate assertion convention rather than weakening semantic coverage.

## Performance-report caveat

The existing benchmark report can contain an old summary such as "largest labelled hitch does not explain frame" while `[Seedvale Long Frame Attribution]` now directly assigns a long frame to a category such as `FAUNA`.

If Phase A touches report formatting, make the recommendation consume the newer long-frame attribution rather than only the legacy hitch list. Do not broaden this into unrelated report cleanup.

## Conditional Phase D — river lookup

Only after the User supplies a post-Phase-B benchmark.

If `riverWaterSampleAt()` remains material, prefer a chunk-local candidate reduction derived from the same cached segments. Avoid:

- global river spatial ownership,
- per-animal caches,
- persistent indexes for data that exists only while chunks are loaded.

Any index must preserve deterministic nearest-edge selection and interpolation semantics.

## Conditional Phase E — colliders

Only after measurement.

`ColliderRegistry` is already a spatial grid; do not replace it with another index. The possible win is removing result-array copying/allocation, not redesigning collision.

If changing the query API, inspect all consumers first. A visitor/early-exit API may be especially useful for `AnimalAgent.isWalkable()` because it only needs to know whether any active collider contains the point, but do not create fauna-only registry behavior if a generic predicate/visitor belongs in `collision.ts`.

## Conditional Phase F — cadence

Only after the User supplies a benchmark showing slow-frame gate collapse remains relevant.

Before editing, reread `fauna-028` implementation notes. Preserve:

- decision remains current enough for immediate branch classification,
- combat/threat/player coupling/swimming are never delayed,
- `tickLife()` gets real frame time,
- movement debt is not silently discarded,
- movement step remains geometrically bounded,
- deterministic per-agent phase spreading,
- no camera-visibility dependency.

Do not solve the problem by running multiple accumulated movement steps in one frame; that can recreate the same hitch as explicit catch-up work.

## Implementation boundaries / non-goals

Do not:

- reduce fauna population as the fix,
- change animal behaviour scoring,
- alter water capability rules,
- alter river generation or render geometry,
- move fauna simulation to a worker,
- build an ECS,
- merge wild fauna and settlement livestock ownership further than already shared through `AnimalAgent`,
- optimize render in this plan,
- implement conditional D/E/F just because they are documented.

## Verification ownership

### Agent/LLM

Allowed and expected:

- unit tests,
- typecheck,
- build,
- static/code-level verification,
- preparing benchmark telemetry/output paths.

### User only

The User alone performs:

- browser verification,
- `?benchmark=stream`,
- gameplay observation of water traversal,
- visual/stuck movement checks.

**The implementation agent must not open/run browser verification and must not claim browser verification passed.**

When implementation is ready, report exactly what the User should run/collect instead.

## Suggested implementation sequence

1. Read current `AnimalAgent`, `chunkManager`, `riverNetwork`, `waterSample`, `agentCpuDiag` and fauna-028 notes.
2. Add bounded Phase A diagnostics.
3. Add/adjust tests around the current reference water query before replacing it.
4. Resolve full-chunk cached-segment coverage, especially edge-overlap semantics.
5. Add chunk-owned derived river gameplay segments at the `riverChains` lifecycle boundary.
6. Switch `ChunkManager.sampleLocalWater()` to the cached representation.
7. Run automated tests/typecheck/build.
8. Stop. Give the User exact browser benchmark/manual verification instructions.
9. Treat D/E/F as follow-up work only after the User supplies measurements.

## Documentation after implementation

If Phase B changes the runtime ownership contract, update the relevant current-state docs, especially `docs/state/water.md` and, only where fauna consumption wording changes materially, `docs/state/fauna.md`.

Implementation history/details belong here, not in current-state docs.

Do not run `pnpm docs:sync`; repository workflow owns generated documentation updates.

> **Zrób git commit i push do main, rebase jeżeli trzeba**