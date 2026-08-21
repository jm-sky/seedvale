# Implementation Notes: Natural Mountains & Rivers

**Plan:** [2026-08-21--181--natural-mountains-and-rivers.md](./2026-08-21--181--natural-mountains-and-rivers.md)

**Review basis:** current `main` repository state as of 2026-08-21. Code is authoritative when it differs from the plan.

**Purpose:** repository-specific guidance for implementing 181. The plan is directionally sound, but hydrology has one important architectural constraint: D8 flow direction is local, while true flow accumulation is inherently regional/global. Do not solve that by making `ChunkManager` or `waterBodies.ts` own a second global terrain/geography system.

---

## 1. Current architecture to preserve

The terrain system already has the right primary seam:

```text
world-space analytic terrain
        ↓
sampleFloorAt / sampleHeightAt
        ↓
computeChunkTile()
        ↓
chunk worker protocol / worker pool
        ↓
ChunkManager
        ↓
terrain mesh + vegetation + water
```

`src/terrain/chunkHeightmap.ts` is intentionally worker-safe and contains the deterministic world-space terrain functions. `ChunkManager` is the streaming/lifecycle owner, not a terrain generator. The existing worker pool should remain the execution mechanism for chunk tile generation. The current state explicitly treats `sampleFloorAt()` and the world-space analytic functions as the basis for crack-free chunk seams.

The existing water system is downstream of terrain:

- `src/terrain/waterBodies.ts` detects submerged cells **inside one chunk** and computes lake/ocean body scale.
- `src/world/createWater.ts` creates per-chunk water meshes from terrain height/floor/body-scale textures.
- The water shader already operates in world-space time/coordinates and is suitable for reuse by river water, but `createChunkWater()` is currently specifically a flat water-level surface, not a river-channel renderer.

Do not turn `waterBodies.ts` into the river network. Its current local flood-fill is useful for lakes/ocean classification and should remain that responsibility.

---

## 2. Natural mountains — modify the existing height hierarchy

The current terrain already has independent macro axes for continentalness and mountain regions, plus Worley-based ridge shaping, hills/valleys FBM and local detail. `RegionParams` therefore already contains most of the conceptual inputs described by 181.

The implementation should first tune/reshape the existing combination before introducing another independent terrain generator or noise family.

Target hierarchy:

```text
continentalness
    ↓
land / coast gate
    ↓
mountain-region gate
    ↓
large ridge / massif shape
    ↓
hills + valleys
    ↓
local detail
    ↓
water clamp + existing road/village modifiers
```

Important constraints:

- Keep every terrain field deterministic from `(seed, worldX, worldZ)`.
- Keep noise handles seed-global; never derive noise from chunk coordinates.
- Preserve the existing apron/core approach used to make normals and chunk seams continuous.
- Do not create `MountainSystem`, `GeographyManager` or another terrain sampler.
- Do not make settlement roads, village clearings, vegetation or water responsible for mountain shaping.

The existing Worley ridge is particularly important: its world-space continuity makes it a better basis for broad connected forms than adding many unrelated peaks. Prefer changing its gating/scale/gain/combination and the existing hills field over adding isolated mountain stamps.

### Avoiding sharp peaks

Do not solve sharp peaks simply by globally flattening the mountain contribution. That would remove the desired relief together with the artefacts.

Prefer:

- broader ridge wavelength,
- smoother mountain gate,
- less aggressive ridge exponent/sharpness where necessary,
- stronger medium-scale valley structure,
- restrained high-frequency detail in high-altitude terrain.

The goal is a massif with ridges and valleys, not a collection of cones.

### Existing terrain modifiers

Road and village terrain shaping is deliberately layered after the raw analytic terrain. Keep that separation. Hydrology should use the **ambient geographic terrain**, not terrain already modified by a settlement/road instance, otherwise a road or village could create a fake drainage feature.

This also means the hydrology API should consume a road/village-agnostic sampler or equivalent raw terrain function rather than a chunk's already modified tile.

---

## 3. Hydrology: the main architectural issue

The plan's D8 model is appropriate for a prototype:

```text
height(x,z)
    ↓
8 neighbours
    ↓
steepest lower neighbour
    ↓
flow direction
```

The difficult part is `flow accumulation`.

A value at `(x,z)` depends on all upstream cells that eventually drain into it. Therefore a strictly local implementation such as “calculate D8 inside the currently loaded chunk” cannot produce correct accumulation at chunk boundaries.

Do **not** implement accumulation as:

- a field stored on `ChunkManager`,
- a global persistent heightmap,
- a `waterBodies` extension that happens to keep the whole world,
- state that depends on which chunks are currently loaded.

Instead, use a deterministic **on-demand hydrology analysis region** with a sufficiently large halo and an explicit boundary policy. The first prototype can be a diagnostic/offline-style analyser rather than a runtime renderer.

A good progression is:

```text
analytic terrain sampler
        ↓
fixed-size hydrology tile/region + halo
        ↓
D8 direction
        ↓
ordered accumulation
        ↓
source / stream classification
        ↓
network segments
```

The hydrology region is a computational workspace, not a second world representation. It may be allocated in a worker, used, converted into compact river-network data, then discarded or kept in a bounded cache.

### Important: boundary correctness

A finite analysis window has to distinguish:

- drainage that reaches the sea/lake,
- drainage that leaves the analysis window and therefore continues outside it,
- closed/internal depressions.

Do not treat every window edge as a river outlet. That produces artificial rivers terminating on arbitrary chunk/region borders.

For the first prototype, prefer a fixed analysis margin and mark paths that hit the outer halo as `incomplete`. Only classify a stream as a candidate final source→outlet path when its downstream result is resolved inside the analysis domain or reaches a known sea/lake condition.

If this proves too expensive for interactive use, keep the diagnostic prototype separate and make the final runtime river resolver more sparse/path-oriented rather than forcing full-world accumulation every frame.

---

## 4. D8 implementation details

Use a fixed neighbour ordering. Determinism matters when two neighbours have equal/near-equal height.

Recommended direction data:

```ts
const D8 = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
]
```

The exact ordering can differ, but it must be stable.

Do not select a neighbour merely because it is lower. Select the steepest descent using distance-aware slope:

```text
(height - neighbourHeight) / neighbourDistance
```

For equal heights / flat areas, use a deterministic tie-break or mark the cell unresolved. Avoid randomly choosing a direction.

### Depressions / flats

Naive D8 produces sinks in local minima. Do not immediately add complex hydraulic simulation.

For the prototype, diagnose and count sinks. Then decide whether the terrain generation itself should be changed to reduce pathological closed depressions or whether a deterministic depression-resolution step is justified.

A small amount of enclosed drainage can be valid if it terminates in a lake. Randomly carving every sink is not.

---

## 5. Flow accumulation

For a D8 graph, each cell has at most one downstream successor. This makes accumulation straightforward once directions are known.

Conceptually:

```text
initial accumulation[cell] = 1

process cells from high → low / downstream order
    accumulation[downstream] += accumulation[cell]
```

Avoid recursive DFS over the terrain grid; use iterative arrays/queues to avoid call-stack issues.

The implementation should keep numeric arrays typed and compact (`Float32Array`/`Int32Array`/`Uint8Array` as appropriate). Do not create `{x,z}` objects for every hydrology cell.

For a diagnostic prototype, retain enough metadata to visualize:

- elevation,
- slope,
- downstream direction,
- accumulation,
- source candidates,
- stream threshold,
- unresolved/out-of-window cells.

This diagnostic representation should not become persistent save data.

---

## 6. Sources and stream classification

Do not generate sources randomly.

Candidate source cells should be derived from terrain and drainage, for example:

- sufficiently high elevation,
- non-trivial local slope,
- accumulation above a small threshold,
- no immediate lake/ocean classification,
- deterministic spacing / local-maximum rule to prevent dozens of adjacent source points.

Stream classification should be based primarily on accumulation, optionally combined with slope and distance from source.

A useful conceptual classification is:

```text
small accumulation → creek / stream
medium accumulation → river
large accumulation → major river
```

Do not hard-code world-space widths independently of accumulation. Width should be a bounded function of flow so a river grows downstream.

---

## 7. River network representation

Do not make every rendered vertex the authoritative river state.

The authoritative runtime representation should be compact network data, e.g. deterministic segments/points containing:

- world position,
- downstream connection,
- accumulation/flow value,
- local width,
- source/outlet classification,
- optional waterfall marker.

Rendering can then derive geometry from those points for the currently loaded chunk.

This preserves the plan's intended direction:

```text
world geography
      ↓
hydrology
      ↓
chunk query
      ↓
river geometry
```

It also avoids requiring a persistent global heightfield or global Three.js object graph.

---

## 8. Cross-chunk continuity

This is the most important runtime rendering requirement.

Never generate a river independently from each chunk. A chunk must query the same deterministic network and clip/instantiate the relevant river segments.

At a chunk boundary:

- the same world-space points must be returned from either side,
- segment interpolation must use world coordinates,
- width/flow must be identical,
- water shader phase must remain world-space,
- no per-chunk random meander offset may be introduced.

Avoid using the chunk seed or local coordinates as an input to river shape.

If geometry is split at a chunk edge, both halves must come from the same source segment rather than independently sampling the path.

---

## 9. Meandering

Meandering must be a post-process over a valid drainage path, as the plan states.

Do not use noise to draw a pretty spline first and then call it a river.

A safe approach is:

```text
D8 path
  ↓
remove redundant points
  ↓
smooth / resample by arc length
  ↓
small deterministic lateral offset
  ↓
re-check against terrain / downstream monotonicity
```

Keep lateral displacement bounded by channel width and local terrain scale. Large offsets can move the visual river away from the drainage path and even make it appear to flow uphill.

Use world-space deterministic noise or a stable segment/path hash. Never use `Math.random()`.

---

## 10. River channel and terrain interaction

For V1, keep the plan's decision: **do not modify `sampleFloorAt()` for rivers**.

This is important because the existing terrain sampler is used for many systems beyond rendering: movement/height queries, settlement placement, route finding and other world logic. Making river geometry feed back into the base sampler would create circular dependencies and potentially change gameplay terrain unexpectedly.

For the first river renderer:

- place the water surface slightly above the sampled river-bed/terrain surface,
- clip/shape the channel visually where possible,
- ensure the surface follows the sampled terrain longitudinally,
- avoid z-fighting with the terrain.

If convincing banks cannot be achieved without actual terrain carving, spin that into a later plan rather than silently coupling it into 181.

---

## 11. Water rendering integration

`src/world/createWater.ts` currently creates a flat `PlaneGeometry` at `waterLevel` and feeds the existing water material with height/floor/body-scale textures. That implementation is correct for the current lake/ocean model but is not a drop-in river renderer.

Do not force rivers into `createChunkWater()` by pretending every river is another `waterLevel` lake.

Prefer a small, separate geometry path that **reuses** the existing water material/shader functionality where practical. It should share:

- water time progression,
- day/night handling,
- mirror/render layer conventions,
- world-space flow coordinates,
- disposal/lifecycle conventions.

But it may need a distinct lightweight material variant or geometry representation if the current shader assumes a horizontal plane.

Before adding a new shader, inspect the current water material and determine whether its world-space wave/flow parameters can support a river surface. Avoid duplicating the complete water shading stack.

---

## 12. Lakes and ocean relationship

The current `detectWaterBodies()` is a local flood-fill over submerged terrain cells. It is not suitable for determining the global river network and should remain local.

For river outlets:

- ocean can be detected from existing continentalness/ocean classification,
- inland lake targets should use existing water-body semantics where available,
- do not require all neighbouring chunks to be loaded to decide whether a river reaches the ocean,
- do not assume a water-body `id` is globally stable: the current IDs are generated per chunk detection.

If a globally stable lake identity becomes necessary for river topology, that is a separate architectural extension; do not fake it by reusing the current local `bodyId`.

---

## 13. Worker usage

The existing terrain worker pool is already optimized for numeric chunk generation and has a real communication/finalization pipeline. Do not automatically move the entire hydrology system there.

Recommended split:

### Prototype

Run a deterministic hydrology analyser over a fixed test region. This can be a worker if the sampled grid becomes large enough to block the browser, but the first goal is algorithm quality, not parallelism.

### Runtime

If profiling shows that generating hydrology regions is expensive, move only the numeric analysis into a worker and transfer compact typed arrays/network data back.

Do not transfer Three.js objects, materials or geometry through the worker boundary.

Do not add a second worker pool. Reuse the existing worker infrastructure if it fits the request/response lifetime model; otherwise keep the hydrology worker protocol small and justified by measured cost.

---

## 14. Suggested implementation seams

Likely files to touch:

| File | Guidance |
|---|---|
| `src/terrain/chunkHeightmap.ts` | Tune/improve mountain combination; keep analytic sampler deterministic and worker-safe. |
| `src/config/worldConfig.ts` | Add only genuinely new terrain parameters; preserve config/save compatibility. |
| `src/terrain/fbm.ts` | Reuse existing FBM; do not create another implementation. |
| `src/terrain/worleyNoise.ts` | Reuse existing ridge field. Changes only if mountain tuning proves the current field insufficient. |
| `src/terrain/chunkManager.ts` | Add only the facade/query/lifecycle seam needed for river geometry. Do not make it own global hydrology. |
| `src/terrain/chunkWorkerPool.ts` / protocol / worker | Extend only if profiling justifies worker-side hydrology. |
| `src/terrain/waterBodies.ts` | Keep local lake/ocean detection. Do not turn it into global river state. |
| `src/world/createWater.ts` | Reuse lifecycle/material conventions; river geometry may need a separate creator. |
| `src/world/waterMaterial.ts` | Inspect before adding new river shader code; reuse existing water uniforms/animation where possible. |
| new `src/terrain/hydrology*.ts` | Appropriate place for pure numeric D8/accumulation logic, provided it stays independent from Three.js and `ChunkManager`. |
| new river geometry module | Keep geometry/rendering separate from hydrology data. |

A small pure module such as `src/terrain/hydrology.ts` is preferable to putting D8 arrays and traversal logic into `chunkManager.ts` or `chunkHeightmap.ts`.

---

## 15. Diagnostics before final geometry

The plan's prototype stage should be taken seriously. Do not implement river meshes first.

The diagnostic output should make it possible to inspect at least:

1. elevation,
2. mountain ridge field,
3. D8 direction,
4. slope,
5. accumulation heatmap,
6. source candidates,
7. stream/river threshold,
8. unresolved boundary paths,
9. outlets.

Test at least several seeds and include mountain-heavy and coast-heavy areas. A single attractive seed is not evidence that the algorithm is correct.

The diagnostic tool can be simple: numeric dumps, an Observatory/debug overlay, or a temporary debug renderer. It should not become a permanent gameplay system unless it is independently useful.

---

## 16. Performance traps

The biggest risks are not the D8 arithmetic itself but accidental scale and allocation.

Avoid:

- allocating objects for every grid cell,
- recursive traversal,
- recalculating the same analytic sample repeatedly for each downstream query,
- running a large hydrology analysis once per loaded chunk,
- generating final river geometry for off-screen chunks,
- keeping an unbounded cache of hydrology regions,
- adding a global heightmap merely to make accumulation convenient.

The runtime target should be closer to:

```text
hydrology/network = deterministic numeric data
river geometry = streamed consumer
```

rather than:

```text
loaded chunks = authoritative hydrology state
```

Profile before deciding whether worker execution is needed.

---

## 17. Interactions to verify after mountain changes

Changing terrain height distribution affects more than visuals. Recheck:

- settlement site selection,
- road/path routing and road terrain smoothing,
- biome classification and vegetation density,
- fauna habitat/spawn placement,
- grass/rock/tree placement,
- water-body detection,
- player/NPC terrain height queries,
- mountain/coastal biome transitions.

Do not add special-case compensation to these systems unless a real regression is demonstrated. They should consume the improved terrain through their existing samplers.

The current terrain already feeds vegetation through `continentalness`, `mountainRidge`, moisture and height-related eligibility, so large changes in mountain coverage can materially change forest/rock/fauna distribution.

---

## 18. Architectural decisions for the implementation agent

1. **No `MountainSystem`.** Mountains remain part of the existing analytic terrain function.
2. **No `RiverManager` owning a global terrain map.** If a runtime coordinator is needed, it should resolve/cache compact river-network regions, not own another terrain representation.
3. **No global persistent heightfield.** Hydrology uses sampled analytic terrain and bounded computational workspaces.
4. **Hydrology is deterministic and player-independent.** It cannot depend on loaded chunks, camera position or player presence.
5. **Roads/village clearings do not define geography.** Hydrology samples ambient terrain.
6. **D8 is a prototype, not an architectural promise.** Keep the hydrology API independent of the specific drainage algorithm so D8 can later be replaced/refined.
7. **Network data is authoritative for rivers; geometry is derived.** Chunk rendering consumes network segments.
8. **Existing water rendering is reused, not duplicated wholesale.** Add only the minimum river-specific geometry/material path required.
9. **No save-state dependency in V1.** Geography is a pure consequence of world seed + terrain parameters.
10. **Do not let river rendering modify gameplay terrain in V1.** Channel carving is a later extension if needed.

---

## 19. Recommended implementation order

The plan's stages should be kept, with one refinement:

```text
A. Mountain tuning
   ↓
B. Pure hydrology prototype
   ↓
C. Multi-seed diagnostic evaluation
   ↓
D. Decide D8 vs improved drainage model
   ↓
E. Compact deterministic river network
   ↓
F. Cross-chunk query/continuity
   ↓
G. Minimal river geometry
   ↓
H. Water shader/material integration
   ↓
I. waterfalls + meanders + LOD/performance polish
```

Do not start E–I until B/C produce a believable drainage network.

---

## 20. Verification checklist

### Mountains

- Same seed produces identical terrain after reload.
- Terrain remains continuous across chunk borders.
- Large mountain masses persist over many chunks.
- Valleys form between major ridges.
- Passes/low saddles occur naturally.
- Sharp isolated peaks and deep artificial pits are reduced rather than merely hidden by rendering.
- Settlement/road/vegetation systems still consume the same terrain API.

### Hydrology

- D8 direction is deterministic.
- Slope uses diagonal distance correctly.
- Ties/flats have deterministic handling.
- Accumulation is independent of loaded-chunk order.
- Boundary/out-of-window paths are not falsely treated as outlets.
- Sources are terrain/drainage-derived, not random.
- Small streams merge into larger flows.
- Flow generally decreases in elevation downstream, apart from explicitly modelled waterfalls.
- Several seeds produce plausible networks.

### Rivers

- River segments match at chunk boundaries.
- Width follows flow and stays bounded.
- Meanders do not violate the drainage direction.
- Rivers reach sea/lake targets without artificial chunk-edge termination.
- Water surface follows terrain closely enough to avoid visible floating/sinking.
- Existing lakes/ocean continue to render correctly.
- River rendering does not create a second persistent world-state system.

### Performance

- No full-world hydrology generation at startup.
- No per-frame full-network rebuild.
- No unbounded cache growth.
- No per-cell object allocations in hot numeric loops.
- Worker use is justified by measured cost.
- River geometry is streamed/LOD-aware.
- Browser verification confirms the visual result and does not introduce a significant terrain/water frame-time regression.

---

## 21. Final guidance

The strongest part of plan 181 is the decision to make rivers a consequence of geography rather than decorative splines. Preserve that principle.

The main thing to avoid is interpreting “use `sampleFloorAt()` and no global heightfield” as “run complete flow accumulation independently for every chunk.” That combination cannot produce globally coherent accumulation without either repeated overlapping analysis or some compact regional hydrology representation.

Keep the separation explicit:

```text
analytic terrain = source of truth
hydrology = deterministic derived analysis
river network = compact derived data
chunk = rendering/lifecycle consumer
water = visual representation
```

That architecture fits the existing Seedvale terrain/worker/streaming design and leaves room to replace D8 later without rewriting the rendering layer.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
