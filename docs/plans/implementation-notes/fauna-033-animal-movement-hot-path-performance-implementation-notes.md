# Implementation notes: fauna-033 — animal movement hot-path performance

**Plan:** [fauna-033](../fauna-033-animal-movement-hot-path-performance.md)
**Recon prepared:** 2026-09-16 · **Implemented:** 2026-09-16

This file combines a pre-implementation recon pass with the actual implementation outcome. The recon (first part) was written before the code changes below and frames the open questions; the "Implemented" section (second part) records what was actually built, including how the recon's "most important correctness trap" was resolved. Where the two disagree, the "Implemented" section is authoritative.

## Recon: baseline and confirmed findings

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

## Recon: exact code ownership

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

## Recon: Phase A instrumentation guidance

Reuse `src/perf/agentCpuDiag.ts` and the existing benchmark/reporting pipeline. Avoid a second long-lived metrics store.

Useful counters/timers named by the recon: fauna movement (behaviour/movement/slope/walkability/movement-tail totals, worst behaviour execution with `animalId`/`kind`/importance); water (`sampleLocalWater` call count/total ms/worst call; pre-fix `riverChannelSegmentsNear` invocation/segment counts, expected to hit zero after Phase B); collision (`ColliderRegistry.query()` calls/returned count, only if addable without changing all consumers).

See "Implemented: Phase A scope" below for what was actually built and why the full list wasn't.

## Recon: Phase B lifecycle decision (the coverage question)

Build cached gameplay segments at the canonical mutation boundary, not lazily inside `sampleLocalWater()` — the chunk already has a natural preparation/finalization lifecycle, and derived segments belong to chunk state, not caller state.

**This was flagged as the most important correctness trap in the planned cache:** the old per-query call centered `riverChannelSegmentsNear` on each queried world point, not the chunk center — "a naïve cache made from one chunk-center query box could omit segments near edges." Resolve the coverage contract explicitly before implementing: determine the spatial extent `sampleLocalWater()` may query, build a cached segment set covering the whole chunk plus the required channel reach/margin (not just one point-sized query), and reuse `riverChannelSegmentsNear()` if it can express that coverage safely.

**Resolved** — see "Implemented: why the coverage question resolves safely" below. Short answer: `riverChannelSegmentsNear()` already expresses whole-rect coverage when called with the chunk's own size/center (this is exactly what `ensureLoaded()` already did for terrain carving); no new helper was needed.

## Recon: water equivalence tests

Do not test only one river center point. Cover dry land, lake/ocean-only, near-center, near-boundary, and a segment whose centerline sits outside the chunk/query core but whose channel reach overlaps it. Compare the cached-query result against the existing on-demand/reference preparation using the same canonical chains and query points; assert the full `LocalWaterSample`, not only `present`.

## Recon: conditional phases D/E/F and non-goals

Phase D (river lookup narrowing), Phase E (collider query allocation), Phase F (cadence) are all gated on a post-Phase-B User benchmark — do not implement speculatively. Non-goals: reducing fauna population, changing behaviour scoring, altering water capability rules or river generation/render geometry, moving fauna to a worker, an ECS rewrite, deeper wild/livestock ownership merging, render optimization. The implementation agent must not open/run browser verification or claim it passed — report exactly what the User should run/collect instead.

---

## Implemented (2026-09-16)

### Where the cost actually was

`ChunkManager.sampleLocalWater(worldX, worldZ)` was recomputing `riverChannelSegmentsNear(rec.riverChains, worldX, worldZ, RIVER_SHORE_QUERY_SIZE)` **on every call** — i.e. on every `AnimalAgent.isWalkable()` invocation, up to 3× per `stepWithSlopeAndCollision()` movement step per moving animal per tick. That function walks every point of every retained `RiverChain` for the chunk and allocates a fresh `RiverChannelSegment[]`, even for chunks with no river at all (empty loop, but still a fresh array + call overhead).

The fix was already half-present: `ensureLoaded()` (same file) already computes the *exact same call* — `riverChannelSegmentsNear(riverChains, x, z, config.chunkSize)`, centered at the chunk's own center with the chunk's own size as the query box — once per chunk load, to feed river carving into `paramsFor()`. That result was a local variable, thrown away after terrain generation. It only needed to be stored on the `ChunkRecord` and read back at query time.

### Why the coverage question resolves safely

`riverChannelSegmentsNear(chains, qx, qz, size)` includes a segment iff that segment's own reach-expanded AABB (channel half-width + bank margin around its two endpoints) overlaps the box `[qx±size/2, qz±size/2]` — deliberately generous "so a segment whose points sit just outside the chunk but whose bank still overlaps it is not dropped" (existing comment on the function).

The old per-query call used a **narrow** box (`RIVER_SHORE_QUERY_SIZE = 32`) centered on the *exact query point*. The new cached value uses a **wide** box (`config.chunkSize`) centered on the *chunk center* — exactly the chunk's own rect. For any query point actually inside that chunk (guaranteed: `sampleLocalWater` looks up `rec` via `worldToChunk(worldX, worldZ)`), the wide box is not a subset of the narrow box — but it doesn't need to be. The only thing that matters: **every segment that could make `riverWaterSampleAt` return `distanceToWaterEdge < 0` for a point inside the chunk must already be included in the wide box's result.**

Proof: if a point `p` inside the chunk rect is inside some segment's channel, then `p` lies within that segment's own reach-expanded AABB by construction (the reach is defined as the max channel half-width along the segment) — and since `p` is also inside the chunk rect, the segment's AABB and the chunk rect share at least the point `p`, so they overlap, so the segment is included in the cached (wide) list. The exact positive-distance ("how far to the nearest bank") number can differ between the two queries when the point is dry — that number is never read outside the `< 0` check in `sampleLocalWater()` (`waterSample.ts`), so it doesn't matter. `riverWaterSampleAt` always does a full linear scan and picks the true minimum, so passing it a superset of the relevant segments never changes which segment "wins" when the point is actually inside a channel.

This is the exact property `waterSample.test.ts`'s new regression test pins — it compares full `LocalWaterSample` output, not raw segment lists, because raw dry-side distances are allowed to differ (see "Regression coverage" below for the test failure this caught).

No new pure helper was added to `riverNetwork.ts`: `riverChannelSegmentsNear()` already expresses whole-rect coverage when called with the chunk's own center/size — that's precisely what `ensureLoaded()` already did for a different purpose (terrain carving), so reusing that one result satisfied the recon's "keep one implementation of the hydrology→`RiverChannelSegment` formulas" requirement for free. **Do not** shrink the cached box to `RIVER_SHORE_QUERY_SIZE` to "match old behavior more closely" — that would reintroduce a per-query-shaped cache that can't be shared across all query points in the chunk, defeating the point of caching it once.

### What changed

- `src/terrain/chunkManager.ts`
  - `ChunkRecord` gained `riverGameplaySegments?: RiverChannelSegment[]`.
  - `ensureLoaded()` now stores its existing `riverSegments` local into `record.riverGameplaySegments` right after computing it (no new computation).
  - `sampleLocalWater()` reads `rec?.riverGameplaySegments ?? []` instead of calling `riverChannelSegmentsNear()`.
  - `riverShoreDistance()` / `riverShorePoint()` / `riverWaterContext()` are **unchanged** — they scan every loaded chunk (not just the query point's own chunk) for shoreline/fishing interaction, are not per-agent movement calls, and aren't named as hot-path targets by the plan.
- `src/fauna/AnimalAgent.ts`
  - `isWalkable()` times its `sampleLocalWater()` call and its `collidersNear()` call separately, routed through two new `agentCpuDiag` counters. This is the single call site every movement mode funnels through (`stepWithSlopeAndCollision`'s `isWalkable` callback, plus `pickPointNear`'s wander-point scoring), so instrumenting it once covers all of them without touching the shared `slopeConstraint.ts`.
- `src/perf/agentCpuDiag.ts`
  - New fields/methods: `addFaunaWaterSampleMs(ms)`, `addFaunaColliderQueryMs(ms, returned)`, each routed to `fauna*`/`livestock*` totals via the same depth-flag owner rule `addSectionMs` already uses (a call outside both `beginFaunaAgentUpdates`/`enterLivestockAgentUpdates` scopes — e.g. settlement rats — is silently dropped, matching the existing "neither" convention documented at the top of the file). `*WorstMs` fields track the single slowest call this session (not an average); `reset()` already zeroes them for free via `Object.assign(totals, emptyTotals())`.
  - `AgentCpuReport`/`buildAgentCpuReport`/`formatAgentCpuReport` gained matching `waterSample*`/`colliderQuery*` fields under both `npc.livestock*` and `fauna.*`, printed under a new `movement hot-path (plan fauna-033)` block in the `[Seedvale Agent CPU]` text report.

### Implemented: Phase A scope

The recon's full instrumentation list (behaviour/movement/slope/walkability/movement-tail totals, plus a worst-`update()`-call tracker with `animalId`/`kind`/importance) was scoped down to just the two items the plan's own problem statement names as prime suspects: `sampleLocalWater` and `ColliderRegistry.query()` (via `collidersNear`). Implemented: calls/frame, ms/frame, worst call, colliders-returned/frame, for both. **Not implemented:**

- A separate `slope` timer — `sampleSlope()` runs inside the shared `stepWithSlopeAndCollision()`/`slopeConstraint.ts`, also used by `PlayerController`/`NpcAgent`; instrumenting it means either touching shared movement code with fauna-specific diagnostics plumbing, or accepting a diagnostic that can't be cleanly attributed. It's a handful of `sampleHeight` calls, cheap by construction, and was never named as a suspect.
- A separate `movementTail` timer — `tickMovementTail()` (`snapY()` + `resolveWaterTraversal()`) is deliberately still counted inside `faunaLifePresentationMs`/`livestockLifePresentationMs`; `fauna-028`'s implementation notes explicitly flag this as load-bearing for before/after benchmark comparability ("Do not 'tidy' it into the behaviour span without re-baselining"). Adding a second, overlapping timer alongside it risked the two drifting for no measurement benefit.
- The "worst single `AnimalAgent.update()` call, with `animalId`/`kind`/resolved importance" tracker — `update()` has early-return paths before the diagnostics-relevant work runs, so a clean single wrapper would need either restructuring the function or duplicating the diag call at each return site. Phase C's actual comparison table only asks for aggregate `ms/frame` and call-count numbers, not a per-agent worst-offender readout, so this was deferred rather than risking a refactor of a 400+ line method for a nice-to-have.

If the User's Phase C benchmark run still can't attribute a lingering cost after this fix, revisit these three before reaching for Phase D/E/F.

### Regression coverage

`src/terrain/waterSample.test.ts` — new `describe('sampleLocalWater with chunk-rect cached segments vs. the old per-query segments (plan fauna-033)')`: builds one river chain, computes segments both the new way (whole-chunk-rect, once) and the old way (narrow box, per query point) for five representative points (near both edges, center, two dry corners), and asserts `sampleLocalWater(...)` returns the identical `LocalWaterSample` either way. An earlier version of this test asserted raw `riverWaterSampleAt` equality instead of `LocalWaterSample` equality and failed at a dry corner point (cached: `distanceToWaterEdge: 22.5`; old narrow query: `null`, i.e. zero candidate segments) — expected per the coverage proof above, since that value is never read once it's confirmed non-negative. Corrected to compare the actual gameplay contract instead, per the recon's own "assert the full `LocalWaterSample`, not only `present`" guidance.

`src/perf/agentCpuDiag.test.ts` — new tests for `addFaunaWaterSampleMs`/`addFaunaColliderQueryMs`: fauna-vs-livestock channel routing, worst-call tracking, and the disabled-monitor no-op path.

### Measured effect

Not benchmarked in-session — browser `?benchmark=stream` verification against `docs/performance/results/2026-09-16--020--benchmark-stream.md` is explicitly reserved for the User (plan Phase C). Structurally guaranteed by the code change: `riverChannelSegmentsNear` calls from `sampleLocalWater()`'s gameplay path are now zero (the call site was deleted, not just reduced), for every chunk regardless of river presence.

### Documentation

No `docs/state/water.md` / `docs/state/fauna.md` update: `sampleLocalWater()`'s external contract, ownership and the fauna consumption seam are unchanged — this is an internal caching optimization, not a runtime-ownership or semantics change.
