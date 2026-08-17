# Seedvale — Performance & Rendering Strategy

**Updated:** 2026-08-17  
**Status:** active  
**Scope:** CPU · GPU · memory · rendering · chunk streaming · scalability

---

## 1. Purpose

This document is the central overview of Seedvale performance.

It describes:

- confirmed performance bottlenecks,
- techniques already in use,
- techniques not yet implemented,
- recommended optimization order,
- expected impact, effort and risk,
- performance verification rules.

Detailed measurements, experiments and implementation notes remain in `docs/reviews/`, `docs/research/` and `docs/plans/`.

---

# 2. Performance Model

Seedvale has three different performance problems.

### Sustained frame cost

Affects average FPS and frame time.

Main factors:

```text
draw calls
→ scene submissions
→ geometry / triangles
→ shadows
→ reflections
→ post-processing
```

### Frame hitches

Affects frame-time spikes rather than average FPS.

Main factors:

```text
chunk streaming
→ material/program first use
→ shader compilation/linking
→ synchronous WebGL/driver waits
→ main-thread stalls
```

### Scalability

Affects performance as the simulated world grows.

Main factors:

```text
NPC count
fauna count
settlement size
loaded chunks
memory / GPU resources
O(N²) interaction queries
```

These categories should be diagnosed separately.

---

# 3. Current Baseline

The latest representative browser benchmark showed approximately:

| Scenario | FPS | Frame p95 | Render | Water | NPC | Fauna |
|---|---:|---:|---:|---:|---:|---:|
| current | 50.7 | 30.8 ms | 11.9 ms | 3.8 ms | 2.6 ms | 0.5 ms |
| settlement | 48.5 | 31.1 ms | 13.3 ms | 3.8 ms | 2.3 ms | 0.4 ms |
| forest | 81.4 | 16.5 ms | 7.2 ms | 2.9 ms | 0.9 ms | 0.5 ms |
| water | 61.8 | 25.5 ms | 11.6 ms | 2.6 ms | 0.9 ms | 0.5 ms |

These values are a historical baseline. Rendering changes made afterwards require a fresh browser benchmark before being treated as the current baseline.

---

# 4. Confirmed Bottlenecks

## 4.1 Rendering submissions — HIGH

Heavy scenes historically reach roughly 1,300–2,000 draw calls.

Vegetation is a major contributor because many `InstancedMesh` objects contain only a small number of instances.

The key problem is therefore not simply "too many instances":

> **There are too many separate render submissions for the amount of geometry being rendered.**

### Direction

Use larger but still spatially local batches.

Preferred approach:

```text
chunk × species
        ↓
region × species
```

Avoid one global vegetation batch because it would reduce culling effectiveness and complicate streaming.

---

## 4.2 Water mirror — HIGH

Reflection rendering can reproduce a large portion of the scene.

Historical measurements showed:

- hundreds of additional draw calls,
- millions of additional triangles,
- several milliseconds of frame cost,
- substantial FPS improvement when the mirror was disabled.

Already implemented:

- reduced reflection resolution,
- reduced update frequency,
- layer filtering,
- NPC/fauna exclusion,
- grass exclusion,
- other unnecessary object exclusions.

### Remaining direction

Further reflection-specific:

- distance culling,
- LOD,
- simplified representations.

---

## 4.3 Shadows — HIGH

Shadow rendering multiplies scene work because shadow casters are rendered in an additional pass.

Already implemented:

- controlled shadow updates,
- explicit update scheduling,
- one shadow update per frame,
- separation from mirror rendering.

### Remaining direction

Investigate:

- dirty-state shadow updates,
- distance-based shadow caster filtering,
- disabling shadows for small/distant props,
- simplified shadow participation.

---

## 4.4 Post-processing — MEDIUM/HIGH

Current pipeline includes:

```text
RenderPass
→ N8AO
→ SMAA
→ Bloom
→ God Rays
→ OutputPass
```

Already implemented:

- half-resolution AO,
- adaptive AO suppression,
- half-resolution Bloom,
- conditional God Rays,
- controlled post-processing passes.

### Remaining direction

Only after measuring the current configuration:

- cheaper AO architecture,
- depth reuse,
- dynamic resolution,
- temporal techniques if justified.

Do not add temporal rendering simply because it is technically available.

---

## 4.5 Chunk streaming hitches — CRITICAL

Streaming hitches are a separate problem from average FPS.

Investigation identified a major first-use WebGL stall:

```text
chunk becomes visible
→ new material/program is used
→ shader/program work
→ synchronous WebGL/driver wait
→ large main-thread stall
```

A reproduced trace contained a roughly 500+ ms synchronous wait inside the rendering path.

### Important conclusion

Disabling shader error checking did **not** solve the problem. It only moved the synchronization point.

`compileAsync()` experiments also did not produce a usable solution.

### Remaining direction

Investigate:

1. number of generated WebGL programs,
2. material/shader variant proliferation,
3. opportunities for material consolidation,
4. safe program warm-up outside the latency-critical streaming path.

The goal is not to hide the stall but to prevent first-use compilation from happening when a chunk becomes visible.

---

## 4.6 CPU simulation scalability — LOW CURRENT / HIGH FUTURE

NPC and fauna simulation are currently relatively cheap.

However, there are unbounded `O(N²)` patterns:

- fauna predator/prey checks,
- NPC proximity/relationship checks.

They are not currently worth optimizing.

### Future direction

Introduce a shared coarse spatial index/grid when population size makes global scans measurable.

This should serve both NPCs and fauna rather than creating separate spatial-query systems.

---

# 5. Techniques Already in Use

| Technique | Status |
|---|---|
| Web Workers for terrain generation | ✅ |
| Chunk streaming | ✅ |
| Time-sliced chunk finalization | ✅ |
| `InstancedMesh` | ✅ |
| Shared GLTF GPU resources | ✅ |
| Grass instancing | ✅ |
| Grass distance LOD | ✅ |
| Frustum culling | ✅ |
| Camera layers | ✅ |
| Controlled shadow updates | ✅ |
| Reflection throttling | ✅ |
| Reflection layer filtering | ✅ |
| Half-resolution AO | ✅ |
| Adaptive AO suppression | ✅ |
| Half-resolution Bloom | ✅ |
| Conditional God Rays | ✅ |
| GPU-driven weather particles | ✅ |
| Material program cache keys | ✅ |
| Resource disposal | ✅ |
| Performance instrumentation | ✅ |
| Browser performance tracing | ✅ |

---

# 6. Techniques Not Yet Implemented

| Technique | Expected value | Priority |
|---|---|---|
| Region vegetation batching | High | P1 |
| Program/material consolidation | High | P1 |
| Safe shader/program pre-warming | High for hitches | P1 |
| Shadow caster distance filtering | Medium/High | P1 |
| Dirty-state shadow updates | Medium | P1 |
| Reflection LOD/culling | Medium/High | P2 |
| More aggressive grass LOD | Medium | P2 |
| Terrain LOD | Medium | P2 |
| Cheaper AO architecture | Medium/High | P2 |
| Dynamic resolution | Medium | P2 |
| Static-object matrix optimization | Low/Medium | P3 |
| HLOD | High at large scale | P3 |
| Occlusion culling | Potentially High | P3 |
| Shared spatial grid NPC/fauna | High at large populations | P3 |
| GPU-driven visibility | Potentially High | P4 |
| WebGPU/compute migration | Unknown | P4 |

---

# 7. Optimization Matrix

| Optimization | CPU | GPU | Memory | Effort | Risk | Expected impact |
|---|---|---|---|---|---|---|
| Program/material consolidation | 🟢 | 🔴 | 🟢 | M | M | Very High hitch reduction |
| Safe shader pre-warming | 🟠 | 🔴 | 🟢 | M/L | M | Very High hitch reduction |
| Region vegetation batching | 🟠 | 🔴 | 🟢 | L | M | High |
| Shadow budget | 🟢 | 🔴 | 🟢 | S/M | M | Medium/High |
| Reflection LOD/culling | 🟢 | 🔴 | 🟢 | M | M | Medium/High |
| Grass LOD | 🟢 | 🔴 | 🟢 | M | M | Medium |
| Terrain LOD | 🟢 | 🔴 | 🟠 | M | M | Medium |
| AO optimization | 🟢 | 🔴 | 🟠 | M/L | M/H | Medium/High |
| CPU/GC cleanup | 🔴 | 🟢 | 🟠 | S/M | L | Low/Medium |
| NPC/fauna spatial grid | 🔴 | — | 🟢 | M | M | High at scale |
| HLOD | 🟠 | 🔴 | 🟠 | L/XL | H | High at scale |
| GPU-driven rendering | 🔴 | 🔴 | 🟠 | XL | H | Unknown |
| WebGPU migration | 🟠 | 🔴 | 🟠 | XL | H | Unknown |

Legend:

- 🔴 = potentially significant
- 🟠 = relevant
- 🟢 = currently minor

---

# 8. Recommended Implementation Order

## P0 — Measure

Before major optimization:

- establish fresh browser baseline,
- measure frame p50/p95/max,
- measure draw calls,
- measure triangles,
- measure render-pass timings,
- measure streaming stalls,
- measure WebGL program count,
- measure JS/GPU memory where possible.

---

## P1 — Remove major unnecessary work

### 1. Program/material investigation

Determine why many shader/program variants are created and identify consolidation opportunities.

### 2. Streaming hitch solution

Design safe pre-warming or another mechanism that prevents first-use shader work from blocking chunk visibility.

### 3. Region vegetation batching

Implement region-level batching without destroying spatial culling.

### 4. Shadow budget

Reduce unnecessary shadow participation and updates.

---

## P2 — Reduce expensive rendering passes

- reflection LOD/culling,
- grass LOD,
- terrain LOD,
- AO optimization,
- dynamic resolution if benchmarks justify it.

---

## P3 — Scalability

Only when measurements justify it:

- HLOD,
- occlusion culling,
- shared NPC/fauna spatial grid,
- deeper memory/GC optimization.

---

## P4 — Advanced rendering

Only after WebGL2 optimization is exhausted:

- GPU-driven visibility,
- compute-based approaches,
- WebGPU prototypes.

A WebGPU migration is **not currently justified by the known bottlenecks**.

---

# 9. What We Do Not Want

Do not introduce complexity simply because a technique is technically possible.

Currently avoid:

- full WebGPU migration,
- global vegetation batching,
- GPU-driven renderer,
- temporal rendering without measured need,
- HLOD before simpler LOD/batching is exhausted,
- NPC/fauna spatial indexing before it becomes measurable,
- large rendering rewrites without benchmark evidence.

Prefer:

```text
measure
→ identify dominant cost
→ change one thing
→ benchmark
→ keep / improve / revert
```

---

# 10. Performance Verification

Every significant optimization must be evaluated against a reproducible browser benchmark.

At minimum compare:

```text
FPS
frame p50
frame p95
frame max
draw calls
triangles
loaded chunks
NPC count
fauna count
render time
water/mirror time
streaming time
JS heap / GC where available
GPU memory indicators where available
```

A change is not considered successful because the code is cleaner or the technique is theoretically faster.

It is successful when the measured workload improves without unacceptable visual or simulation regressions.

---

# 11. Guiding Principle

Seedvale should optimize by **removing unnecessary work before adding more advanced technology**.

Preferred progression:

```text
reuse
→ batch
→ cull
→ LOD
→ reduce expensive passes
→ time-slice
→ measure again
→ only then consider GPU-driven / WebGPU techniques
```

The renderer should remain understandable, scalable and compatible with the game's hybrid/off-screen simulation model.

---

# 12. Source Documents

### Core

- [`docs/STATE.md`](../STATE.md)
- [`Plan 113 — Rendering Performance & GPU Scaling`](../plans/2026-08-14--113--rendering-performance-gpu-scaling.md)

### Performance reviews

- [`Review 005 — Performance, architecture and assets`](../reviews/2026-08-12--005--performance-architecture-and-assets.md)
- [`Review 012 — Performance bottleneck diagnosis`](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md)
- [`Review 013 — Architecture and performance audit`](../reviews/2026-08-15--013--architecture-and-performance-audit.md)
- [`Review 015 — Browser performance benchmark`](../reviews/2026-08-15--015--browser-performance-benchmark.md)
- [`Review 016 — GPU-fix runtime verification`](../reviews/2026-08-15--016--gpu-fix-runtime-verification.md)

### Rendering research

- [`Research 017 — Three.js rendering audit`](../research/2026-08-17--017--threejs-rendering-audit.md)
- [`Research 019 — Rendering optimizations`](../research/2026-08-17--019--rendering-optimizations.md)
- [`Research 020 — Cross-chunk vegetation batching`](../research/2026-08-17--020--cross-chunk-vegetation-batching.md)

### Streaming

- [`Plan 119 — Chunk streaming performance`](../plans/2026-08-15--119--chunk-streaming-performance.md)
- [`Research 011 — Streaming hitch investigation`](../research/2026-08-16--011--streaming-hitch-investigation.md)
- [`Research 012 — LinkProgram / getProgramInfoLog wait`](../research/2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md)
- [`Research 018 — Stream isolation probes`](../research/2026-08-17--018--stream-isolation-probes.md)

### Vegetation

- [`Research 004 — Grass generation`](../research/2026-08-07--004--grass-generation.md)
- [`Plan 143 — Cross-chunk vegetation batching`](../plans/2026-08-17--143--cross-chunk-vegetation-batching.md)

### Related

- [`Plan 136 — Three.js 0.180 → 0.185 upgrade`](../plans/2026-08-16--136--threejs-180-to-185-upgrade.md)
