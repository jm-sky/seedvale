# Seedvale — Performance & Rendering Strategy

**Updated:** 2026-09-07
**Status:** active
**Scope:** CPU · GPU · memory · rendering · chunk streaming · scalability

This is the central overview of Seedvale performance. Current code remains the source of truth; historical measurements and research are evidence, not a current implementation checklist.

## Performance model

Keep three problems separate:

- **Sustained frame cost:** draw calls/submissions, geometry, shadows, reflections, post-processing.
- **Frame hitches:** chunk streaming, shader/program first use, synchronous WebGL/driver waits, main-thread stalls.
- **Scalability:** NPC/fauna/settlement size, loaded chunks, memory and unbounded interaction queries.

## Baseline

The September 1 benchmark batch is historical. Representative values were roughly:

| Scenario | FPS | Frame p95 | Render | Water | NPC | Fauna |
|---|---:|---:|---:|---:|---:|---:|
| current | 50.7 | 30.8 ms | 11.9 ms | 3.8 ms | 2.6 ms | 0.5 ms |
| settlement | 48.5 | 31.1 ms | 13.3 ms | 3.8 ms | 2.3 ms | 0.4 ms |
| forest | 81.4 | 16.5 ms | 7.2 ms | 2.9 ms | 0.9 ms | 0.5 ms |
| water | 61.8 | 25.5 ms | 11.6 ms | 2.6 ms | 0.9 ms | 0.5 ms |

Do not treat these as the current baseline after later rendering/streaming changes. Establish a fresh browser baseline before deciding the next major optimization.

## Current implementation state

### Chunk mesh streaming — implemented

`world-terrain-004-chunk-mesh-streaming-geometry-optimization.md` implemented the previously planned worker migration and cache.

Current pipeline:

```text
ChunkManager
  → tile job in existing ChunkWorkerPool
  → main-thread runtime terrain modifications
  → bounded ChunkMeshData cache lookup
      ├─ HIT
      └─ MISS → mesh job in existing worker pool → computeChunkMeshData()
  → buildChunkGeometry()
  → short Three.js geometry / mesh finalization on main thread
```

Important facts:

- `computeChunkMeshData()` in `chunkMeshData.ts` owns the CPU-heavy data-only per-vertex extraction.
- It runs through the existing `chunkWorkerPool.ts` / `chunkHeightmap.worker.ts` worker system; there is no second mesh worker system.
- `buildChunkGeometry.ts` now assembles Three.js objects from computed `ChunkMeshData`; it no longer owns the old terrain/color/normal computation loop.
- `chunkMeshCache.ts` is a bounded runtime byte-budgeted LRU cache of `ChunkMeshData`, not Three.js objects.
- Runtime terrain modifications remain authoritative before the mesh job; request sequence/identity guards prevent stale result attachment.
- Historical `chunk mesh` 51× / avg ~45.5 ms / max ~92.6 ms values describe the pre-implementation baseline, not current behavior.

See [`optymalizacja-chunk-mesh-streaming-geometrii.md`](./optymalizacja-chunk-mesh-streaming-geometrii.md) and the `world-terrain-004` implementation notes.

### Vegetation render batching — implemented

The old `chunk × kind/species` batching bottleneck was addressed by archived plan 143.

`src/terrain/vegetationRegionBatcher.ts` currently uses fixed **3×3 chunk rendering regions** and rebuild-on-change. It batches living trees, bushes, cacti, reeds, ferns, lilies, seaweed and selected environment props while preserving chunk ownership/streaming. LOD and reflection visibility are synchronized per region using conservative member visibility/distance rules.

Therefore **“implement region vegetation batching” is not future work**. Any follow-up must start from fresh measurement of the current region-batched renderer and identify a remaining submission/culling/rebuild bottleneck. Do not create a second batching mechanism or a global vegetation batch without evidence.

### Water mirror — optimized, small follow-up planned

Already implemented:

- one shared 128² mirror,
- capped update cadence,
- water/agents/grass/small-detail layer exclusions,
- outer streaming-ring reflection exclusion,
- no shadow-map update during the mirror pass.

Archived plan 144's first distance/content exclusion produced only a modest draw-call reduction and no clear FPS/WATER improvement. `world-terrain-015-water-reflection-content-budget.md` is intentionally measurement-gated: find one cheap remaining reflection-content win or stop. Do not turn it into a reflection HLOD/parallel visibility system by default.

### Shader/program first-use hitches — still open

A September 1 census observed 773 materials mapping to roughly 72 WebGL programs (73 max). Program creation progressed during streaming and correlated with first-use hitches; the clearest event was 43 → 54 programs with roughly 183 ms post-process render.

No redundant program family has been proven. Do **not** blindly consolidate materials/programs and do not repeat generic `compileAsync()` prewarm experiments. Correct flow:

```text
measure
→ identify a specific variant / first-use cause
→ make one targeted change
→ benchmark
```

See [`audits/2026-09-01--program-census.md`](./audits/2026-09-01--program-census.md).

### Shadows

Controlled updates, NPC/fauna distance filtering, small-prop/item filtering and the plan-145 dirty/budget mechanism exist. Revisit terrain/vegetation shadow participation only if a fresh benchmark identifies shadows as dominant; existing Three.js frustum culling and LOD already cover much of this work.

### Post-processing

Current pipeline is EffectComposer with N8AO, SMAA, Bloom, God Rays and OutputPass. Existing optimizations include half-resolution AO/Bloom and conditional expensive passes. N8AO enable/disable is preset/GUI controlled; do not reintroduce frame-time on/off oscillation.

Potential follow-ups such as cheaper AO/depth reuse or dynamic resolution require measurement first.

### CPU simulation scalability

Current NPC/fauna simulation is not the primary performance target. There are future O(N²)-style proximity/predator-prey pressures. When population scale makes them measurable, prefer one shared coarse spatial-query mechanism rather than parallel NPC/fauna systems.

## Techniques already in use

| Technique | Status |
|---|---|
| Terrain/chunk worker pool | ✅ |
| Chunk mesh data computation in worker | ✅ `world-terrain-004` |
| Bounded chunk mesh-data cache | ✅ `world-terrain-004` |
| Time-sliced / bounded chunk finalization | ✅ |
| `InstancedMesh` | ✅ |
| Region vegetation batching (3×3 chunks) | ✅ plan 143 |
| Grass distance/filler LOD | ✅ |
| Frustum culling / camera layers | ✅ |
| Controlled shadow updates/filtering | ✅ |
| Reflection throttling/layer filtering | ✅ |
| Reflection distant-ring exclusion | ✅ plan 144 |
| Half-resolution AO/Bloom | ✅ |
| Conditional God Rays | ✅ |
| GPU weather particles | ✅ |
| Material program cache keys | ✅ |
| Performance instrumentation / browser tracing | ✅ |

## Candidate work — measurement required

This is not a queue. Re-rank after a fresh benchmark.

| Candidate | Expected value | Rule |
|---|---|---|
| Targeted shader/program first-use fix | potentially high for hitches | identify exact cause first |
| Water reflection content budget | low/medium to medium | `world-terrain-015`; one cheap win or stop |
| More aggressive grass LOD | medium | only if vegetation GPU cost remains material |
| Terrain LOD | medium | benchmark first |
| Cheaper AO / depth reuse | medium/high | profile post-processing first |
| Dynamic resolution | medium | only for demonstrated GPU-bound scenes |
| Static-object matrix cleanup | low/medium | opportunistic |
| HLOD / occlusion culling | high at larger scale | avoid before simpler mechanisms are exhausted |
| Shared NPC/fauna spatial grid | high at large populations | wait for measurable simulation pressure |
| GPU-driven visibility / WebGPU | unknown | not currently justified |

Explicitly **not candidates anymore**:

- chunk mesh worker migration,
- chunk mesh-data cache,
- first implementation of region vegetation batching.

Those already exist in current code.

## Recommended decision order

1. **Measure current code.** Use fresh browser results; do not optimize from the September 1 baseline alone.
2. **Classify the problem:** sustained FPS vs hitch vs scalability.
3. **Prefer the smallest existing-system extension** that removes measured work.
4. **Change one thing and benchmark.** Keep, improve or revert based on evidence.
5. Only then consider broader rendering architecture.

For current known work:

- `world-terrain-015` is a deliberately small, gated water-reflection follow-up.
- Shader/program first-use remains a potentially valuable hitch target but requires focused diagnosis before implementation.
- Vegetation batching needs a fresh post-plan-143 measurement before any follow-up plan is justified.
- Chunk mesh streaming needs a fresh post-`world-terrain-004` benchmark before any further optimization is proposed.

## What we do not want

Avoid complexity for its own sake:

- global vegetation batching,
- a second chunk/mesh worker pipeline,
- a second world visibility system for reflections,
- full WebGPU migration,
- GPU-driven renderer without a measured need,
- temporal rendering by default,
- HLOD before simpler culling/LOD/batching is exhausted,
- NPC/fauna spatial indexing before it becomes measurable,
- broad material consolidation without a proven program variant problem.

Guiding loop:

```text
measure
→ identify dominant cost
→ reuse existing mechanism
→ change one thing
→ benchmark
→ keep / improve / revert
```

## Verification

For significant optimization compare, where relevant:

- FPS and frame p50/p95/max,
- draw calls and triangles,
- render/pass timings,
- water/mirror timing,
- streaming hitch categories/count/avg/max,
- WebGL program count/first-use events,
- loaded chunks / NPC / fauna counts,
- memory/GC indicators where available.

A theoretically faster technique is not a success until the relevant workload improves without unacceptable visual/simulation regression. Browser verification belongs to the user.

## Source documents

Core/current:

- [`docs/STATE.md`](../STATE.md)
- [`docs/architecture/GRAPHICS.md`](../architecture/GRAPHICS.md)
- [`world-terrain-004`](../plans/world-terrain-004-chunk-mesh-streaming-geometry-optimization.md)
- [`world-terrain-004 implementation notes`](../plans/implementation-notes/world-terrain-004-chunk-mesh-streaming-geometry-optimization-implementation-notes.md)
- [`Plan 143 — Cross-chunk vegetation batching`](../plans/archive/2026-08-17--143--cross-chunk-vegetation-batching.md)
- [`Plan 144 — Water reflection GPU optimization`](../plans/archive/2026-08-17--144--water-reflection-gpu-optimization.md)
- [`world-terrain-015 — Water reflection content budget`](../plans/world-terrain-015-water-reflection-content-budget.md)

Research/reviews:

- [`Research 017 — Three.js rendering audit`](../research/2026-08-17--017--threejs-rendering-audit.md)
- [`Research 019 — Rendering optimizations`](../research/2026-08-17--019--rendering-optimizations.md)
- [`Research 020 — Cross-chunk vegetation batching`](../research/2026-08-17--020--cross-chunk-vegetation-batching.md)
- [`Review 012 — Performance bottleneck diagnosis`](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md)
- [`Review 015 — Browser performance benchmark`](../reviews/2026-08-15--015--browser-performance-benchmark.md)
- [`Program/material census`](./audits/2026-09-01--program-census.md)

Historical benchmark results remain under `docs/performance/results/` and `docs/performance/trace-results/`. Treat them as dated evidence, not current-state declarations.
