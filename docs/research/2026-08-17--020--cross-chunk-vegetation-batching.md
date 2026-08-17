# Research 020: cross-chunk vegetation batching

**Status:** `planned` (analysis only — no code changed)
**Date:** 2026-08-17
**Context:** [019 §4.3](2026-08-17--019--rendering-optimizations.md) (identifies the bottleneck, flags it out of scope) · [017](2026-08-17--017--threejs-rendering-audit.md) · [018](2026-08-17--018--stream-isolation-probes.md)
**Follow-up plan:** [143](../plans/2026-08-17--143--cross-chunk-vegetation-batching.md)

Research-only per user request — no implementation in this pass. Answers the
architectural question research 019 §4.3 raised and left open: whether
vegetation `InstancedMesh`es can be batched across chunk boundaries without
breaking chunk streaming, unload, frustum culling, or per-instance
transforms/lifecycle.

---

## 1. Current state

### 1.1 Where `InstancedMesh` is built

`buildInstancedProps()` (`src/render/instancedProps.ts:129`) takes a
`templates` array (species → prepared GLB root), a flat `placements` array,
and a `name`. It flattens each template into `PropPrimitive`s (one per mesh
in the GLB), then for every placement:

1. Computes the placement's world matrix (`instanceWorldMatrix`).
2. For every primitive of that placement's species, looks up (or creates) a
   `Bucket` keyed by `` `${speciesIndex}:${primitiveIndex}` ``.
3. Writes the instance's matrix into that bucket's `THREE.InstancedMesh` via
   `setMatrixAt`.

Each bucket becomes exactly one `InstancedMesh`, sized (`count`) to exactly
how many placements of that species were in *this one call's* `placements`
array — no slack capacity. All buckets are wrapped in one `THREE.Group`
(`InstancedPropGroup`) with `dispose()` / `setLodFraction()` / `removeByKey()`.

**Crucially, `buildInstancedProps` itself is chunk-agnostic** — it has no
notion of "chunk" at all. The fragmentation is entirely a consequence of how
its caller invokes it.

### 1.2 Where it's called from

`chunkManager.ts`'s `attachChunkContent()` (called once per chunk, once that
chunk's tile is `ready` and GLB templates are loaded) calls
`buildInstancedProps` **once per chunk, once per prop kind**, using only that
one chunk's placements:

- `chunk-vegetation-tree-living` — living trees (`rec.treeInstances`)
- `chunk-vegetation-bush` / `-cactus` / `-reed` — one call each, only if that
  chunk has placements of that kind (`rec.vegetationInstances[]`)
- `chunk-environment-largeRock` / `-rockCluster` / `-fallenLog` — same
  pattern (`rec.environmentInstances[]`)

So the real, effective batching key is **`(chunk, kind, species, primitive)`**,
not just `(species, primitive)` as the plan's premise states — kind is folded
in via separate calls, but the net effect is identical: chunk boundaries
fragment every batch.

Each resulting `InstancedPropGroup` is stored on the owning `ChunkRecord`
(`vegetationInstances?`, `treeInstances?`, `environmentInstances?`) and
`scene.add()`-ed individually.

### 1.3 Chunk lifecycle touchpoints

- **Load**: `ensureLoaded()` → worker computes `ChunkTileResult` (pure,
  deterministic from `seed` + chunk coord — `tile.vegetation` /
  `tile.environment` are plain placement arrays, already resident on
  `ChunkRecord.tile` for the chunk's whole loaded lifetime, reused by
  `modifyTerrain`/`scorchTerrain` for re-application). `attachChunkContent()`
  runs once, as the `'content'` finalize stage (throttled to
  `CHUNKS_FINALIZED_PER_FRAME = 1` job per frame, `attachChunkMesh` runs first
  and separately as the `'mesh'` stage).
- **Distance LOD**: `syncInstancedLodForRecord()` calls `setLodFraction()` on
  every `InstancedPropGroup` belonging to one chunk, using that chunk's own
  Chebyshev distance to the player (`vegetationLodForDistance`). This narrows
  `mesh.count` to a prefix of the instance buffer — cheap (no reallocation),
  correct only because placements are fed in seeded-random spatial order, so
  any prefix is an unbiased spatial subsample (comment in
  `instancedProps.ts:34-41`).
- **Single-instance removal**: `refreshTreeVisual()` (tree chop/regrow) calls
  `rec.treeInstances.removeByKey(treeId)` — swap-remove: last instance in
  every bucket moves into the freed slot, `instanceMatrix.needsUpdate = true`.
  Only living trees carry a `key` (`treeId`); bush/cactus/reed/rocks never do
  and can never be individually removed.
- **Unload**: `unload()` calls `.dispose()` on `rec.treeInstances`, every
  entry of `rec.vegetationInstances`, every entry of
  `rec.environmentInstances`. `dispose()` removes the `Group` from the scene
  and calls `InstancedMesh.dispose()` on each bucket mesh (frees only the
  per-instance matrix buffer — geometry/material are shared/cached elsewhere,
  `loadGltf.ts`'s `sharedGpu`, never disposed here).

### 1.4 Templates are already shared

GLB templates are memoized once per species array at module scope
(`memoTemplates` in `chunkManager.ts`), independent of any chunk. Geometry
and material are shared GPU resources across every chunk's `InstancedMesh`
today (`_flattenCache` in `instancedProps.ts` is keyed by template root
identity). **Batching does not change GPU memory usage** — only the number of
draw calls / `InstancedMesh` objects.

### 1.5 A structurally separate case: settlement props

`src/settlement/props.ts` also calls `buildInstancedProps` (palisade posts,
barrels, troughs, hay, bushes) — but the settlement is a fixed footprint,
built once as a whole and disposed as a whole
(`disposeSettlementGroup`/`disposeObject3D`), not streamed per chunk. It
already gets full "cross-chunk" batching for free, because there are no
chunk boundaries in its build call. It has the mirror-image bottleneck from
research 019 §4.3 ("585 meshes, only 92 of them instanced") — most of its
meshes are one-off decorative `Object3D`s, not an instancing/batching
problem. **Out of scope here** — no chunk lifecycle interaction to design
around.

---

## 2. Bottleneck

309/311 of the InstancedMesh population in research 019's census comes from
streamed terrain chunks (settlement's 92 instanced meshes are separate).
With `chunkSize = 64`, `loadRadius = 3` (default config,
`src/config/worldConfig.ts:151-154`), up to 7×7 = 49 chunks are loaded at
once (up to 9×9 = 81 before `unloadRadius = 4` hysteresis evicts the excess).
Each loaded chunk independently produces up to 7 kinds × (species count ×
primitive count) `InstancedMesh`es, most holding a handful of instances —
worse for sparse species (e.g. one `largeRock` per chunk) than for dense ones
(many trees per forest chunk). Averaged: **709 instances / 311 meshes ≈ 2.3
instances per draw call** — batching buys almost nothing at this population,
because the batch boundary (chunk) is far smaller than the population that
could share a draw call (species across the whole loaded world).

---

## 3. Options

| | Current (per-chunk) | Full cross-chunk (global) | Region / chunk-group | Hybrid (region, rebuild-on-change) |
|---|---|---|---|---|
| **Draw calls** | Worst — 311 for 709 instances | Best — theoretical minimum, one `InstancedMesh` per `(species, primitive)` for the whole world | Good — reduces by ~region-area² | Same as region |
| **CPU (build)** | Cheapest per event — O(one chunk's placements) | Cheapest steady-state, but O(all loaded chunks) on **every** chunk load/unload if rebuilt naively | O(region's placements) per event — bounded, independent of total loaded chunk count | Same, explicit design goal |
| **GPU (vertex)** | Best — tight per-chunk bounding sphere lets whole chunks get frustum-culled before any instance reaches the vertex shader | Worst — one bounding sphere spanning the whole loaded area is almost always in view when the player is anywhere near the middle, so *every* instance in that mesh runs through the vertex shader every frame regardless of visibility (Three.js/WebGL only culls whole objects, never individual instances within one `InstancedMesh`) | Balanced — bounding sphere sized to the region footprint (e.g. 3×3 chunks ≈ 192 m), still lets out-of-view regions be culled as a unit | Same as region |
| **Memory** | No difference (geometry/material already shared) | No difference | No difference | No difference |
| **GC** | Frequent small allocations (new `InstancedMesh` + matrix buffer per chunk-kind-species) | Fewest allocations steady-state, but any rebuild reallocates the full-world buffer | Few allocations, bounded to region size | Same |
| **Load/unload cost** | O(1) — `dispose()` one small `InstancedMesh` per kind | O(all loaded chunks) if the whole thing rebuilds on every load/unload — this is the operation that happens most often in the game (`recheck()` runs on ~16 m player movement) | O(region's chunks) — much smaller, still bounded | Same, plus explicit exclusion of any live slot-allocation/free-list bookkeeping |
| **Frustum culling** | Free and effective at chunk granularity | Effectively defeated for any region that could plausibly contain the player | Preserved at region granularity, tunable via region size | Same |
| **Code complexity** | Already built, well-understood, small (per-chunk group, no cross-chunk state) | Highest — needs a live instance→chunk index or slot allocator to support partial removal without a full-world rebuild, or a full-world rebuild path that must fit inside the existing 1-content-job-per-frame finalize budget | Moderate — new region-keyed map, but reuses `buildInstancedProps`/`InstancedPropGroup` unchanged; no new per-instance bookkeeping | Same, deliberately the *simplest* region variant (rebuild the region wholesale from its member chunks' already-cached placement lists, no persistent instance slot table) |
| **Streaming compatibility** | Trivially compatible (this is what exists today) | Requires either a full-world rebuild on every single chunk boundary crossing (likely violates the existing `FINALIZE_DRAIN_BUDGET_MS = 8 ms` / 1-job-per-frame streaming budget — see [performance-and-workers.md](../architecture/performance-and-workers.md)) or a much more complex slot-allocation scheme | Compatible — rebuild cost bounded by region size, decoupled from total loaded-chunk count or world size | Compatible, same as region |

**Global batching is rejected**: it trades the current culling-driven GPU win
for a CPU/GPU cost that scales with total loaded-chunk count, and the load/
unload path (the single most frequent event in the whole streaming system)
would either need a full-world rebuild or a nontrivial slot-allocator — both
disproportionate to the win at this population size, and both risk the
existing per-frame streaming budget (`docs/architecture/performance-and-workers.md`).

---

## 4. Recommended approach: region-based batching, rebuild-on-change

Group chunks into fixed-size, world-space-aligned **regions** — e.g. 3×3
chunks (`REGION_CHUNKS = 3`, ≈ 192 m per side, tunable). A region's key is a
pure function of chunk coord: `floor(cx / REGION_CHUNKS)`,
`floor(cz / REGION_CHUNKS)`. This is a new, purely rendering-side grouping —
it does **not** become a new streaming/lifecycle unit. Terrain mesh, water,
grass, colliders, items, and tree-lifecycle registration all stay exactly as
chunk-scoped as they are today; only the *vegetation/environment instanced
rendering batch* moves from chunk granularity to region granularity. This
directly answers the "is chunk = rendering-responsibility boundary" question
(§10 below): no — decouple them, but keep the new boundary just as
data-parallel-friendly (region membership is embarrassingly parallel, same as
chunk streaming today).

**Why this wins over global**: `tile.vegetation` / `tile.environment` are
already fully resident on `ChunkRecord.tile` for every currently-loaded
chunk (needed for `modifyTerrain`/`scorchTerrain` re-application and
`getNearbyLandmarks`) — no new storage is required to rebuild a region's
batch from scratch. "Rebuild-on-change" means: on any chunk's content
finalize or unload, only the **owning region** is touched — concatenate the
placement arrays of that region's currently-loaded member chunks (already in
memory) for each affected kind, and call the existing, unmodified
`buildInstancedProps()` once per (region, kind) to replace that region's
`InstancedPropGroup` (dispose old, assign new). No changes needed inside
`render/instancedProps.ts` at all.

This bounds rebuild cost to `region_chunks² × per-chunk-placement-density` —
a constant, independent of total loaded-chunk count or world size (§10:
scales). It avoids a persistent instance→chunk index or a slot
allocator/free-list (§5 in the prompt) — those add real complexity
(`removeByKey`'s current `indexOf` scan is O(n) per key, fine at
chunk-scale, but would need to become a `Map<key, index>` at region scale
regardless of approach — a small, low-risk change worth making either way).

**Trade-offs accepted, explicitly**:

- **Distance LOD granularity drops from per-chunk to per-region.** A region's
  `setLodFraction()` must use one shared fraction (recommend: derived from
  the *nearest* member chunk's distance, i.e. conservative — never
  under-renders a close chunk sharing a region with a far one). At
  `REGION_CHUNKS = 3` the maximum distance spread within one region is small
  relative to the LOD curve's full range (`loadRadius`-scaled), so the
  fidelity loss should be minor — this is a design simplification, not
  free, and needs the visual check called out in §7.
- **`refreshTreeVisual()`'s `removeByKey` call site moves** from
  `rec.treeInstances` (chunk-scoped) to the owning region's living-tree
  group — a straightforward redirect (region lookup by the tree's chunk
  coord), not a behavior change; `removeByKey`'s swap-remove logic itself is
  unaffected by merging (keys are globally unique `treeId`s already).
- **Region rebuild is triggered by both load and unload**, not just load —
  unload must still shrink the region's batch (drop the unloading chunk's
  contribution and rebuild), otherwise stale vegetation would render past
  its chunk's lifetime.

---

## 5. Implementation plan (files, functions, order)

No changes needed in `src/render/instancedProps.ts` — it stays chunk-agnostic
exactly as it is; region batching is entirely a caller-side (`chunkManager.ts`)
grouping decision.

1. **`src/terrain/chunkGrid.ts`** (or a new small module,
   `src/terrain/vegetationRegion.ts`, to avoid growing `chunkManager.ts`
   further — it is already 1738 lines): add `regionKey(coord, regionChunks)`
   and `regionCoordOf(coord, regionChunks)` pure helpers, mirroring the
   existing `chunkKey`/`chunkCenter` pattern. Unit-testable in isolation
   (same style as `chunkGrid.test.ts` if one exists, or
   `chunkManager.test.ts`).
2. **New module `src/terrain/vegetationRegionBatcher.ts`**: owns a
   `Map<regionKey, RegionRecord>` where `RegionRecord` holds, per kind
   (`'tree-living' | 'bush' | 'cactus' | 'reed' | 'largeRock' | 'rockCluster'
   | 'fallenLog'`), a `Map<chunkKey, PropPlacement[]>` (this chunk's
   contribution) and the current `InstancedPropGroup | undefined`. Exposes:
   - `setChunkPlacements(regionKey, chunkKey, kind, templates, placements)` —
     stores the chunk's placements, then rebuilds that region+kind's
     `InstancedPropGroup` from the union of all member chunks' stored
     placements (dispose old group first).
   - `clearChunkPlacements(chunkKey)` — removes this chunk's contribution
     from every kind of its owning region, rebuilding each affected
     region+kind (or disposing the group if the region+kind becomes empty).
   - `removeByKey(chunkKey or regionKey, key)` — redirect for
     `refreshTreeVisual`.
   - `setLodFraction(regionKey, kind, fraction)` / a `syncAll(playerChunk)`
     helper mirroring `syncInstancedLodForRecord`.
   - `dispose()` — full teardown (world rebuild / manager dispose).
3. **`src/terrain/chunkManager.ts`** changes:
   - `attachChunkContent()`: replace the three `buildInstancedProps` call
     sites for living trees, bush/cactus/reed, and largeRock/rockCluster/
     fallenLog with `vegetationRegionBatcher.setChunkPlacements(...)` calls.
     `ChunkRecord` drops `treeInstances`/`vegetationInstances`/
     `environmentInstances` (or keeps them only as a `chunkKey` marker for
     bookkeeping — TBD during implementation, whichever keeps `unload()`
     simplest).
   - `unload()`: replace the three dispose blocks with one
     `vegetationRegionBatcher.clearChunkPlacements(record.key)` call.
   - `syncInstancedLodForRecord()` → becomes region-driven; called from
     `recheck()`/`setLodScale()` same as today, but iterating regions (or
     kept as a per-chunk call that resolves to "nearest distance wins" inside
     the batcher — implementation detail, either is fine as long as the
     "nearest member chunk wins" rule from §4 holds).
   - `refreshTreeVisual()`: redirect its `removeByKey` call through the
     batcher (resolve region from `rec.coord`).
4. **Docs**: update [ARCHITECTURE.md](../ARCHITECTURE.md) / `STATE.md` if
   this changes the "important code entry points" list (add
   `vegetationRegionBatcher.ts`), per repo convention.

**Suggested order**: (1) region-key helpers + unit tests → (2) batcher module
+ unit tests (pure logic: given chunk placement sets, assert correct
concatenation/removal, no Three.js/scene dependency needed for the placement
bookkeeping half) → (3) wire into `chunkManager.ts` load/unload/LOD/
`refreshTreeVisual` → (4) technical checks → (5) benchmark (§7) → (6) docs.

---

## 6. Risks

- **Streaming budget regression**: a region rebuild is strictly more
  expensive than today's single-chunk build (it re-touches every member
  chunk's placements, not just the newly-loaded one). If `REGION_CHUNKS` is
  picked too large, a single chunk load/unload event could exceed the
  existing `FINALIZE_DRAIN_BUDGET_MS = 8 ms` soft budget or make the
  1-content-job-per-frame throttle (`CHUNKS_FINALIZED_PER_FRAME`) too coarse
  a unit of work. Mitigate by keeping `REGION_CHUNKS` small (start at 3) and
  measuring (§7) rather than assuming.
- **Frustum culling regression**: if `REGION_CHUNKS` is too large, the
  per-region bounding sphere approaches "always in view," reintroducing (at
  smaller scale) the same GPU-vertex-cost problem the "global" option has.
  Directly measurable via the existing scene-census benchmark's triangle
  count (§7) — no separate instrumentation needed.
- **LOD fidelity**: per-region (not per-chunk) LOD fraction may make
  vegetation density pop more visibly at region boundaries than today's
  smoother per-chunk gradient, especially if `REGION_CHUNKS` is large. Needs
  a manual visual check (browser verification, not just the benchmark).
- **`refreshTreeVisual` correctness**: must be re-verified end-to-end (chop →
  stump → regrow) since its `removeByKey` target changes from a chunk-local
  group to a region-shared one; a bug here would misremove the wrong tree's
  instance from a *different* chunk sharing the same region.
- **Chunk-unload correctness**: the region batch must never retain a
  just-unloaded chunk's placements (stale vegetation rendering past its
  chunk's lifetime) — `clearChunkPlacements` must run synchronously inside
  `unload()`, not deferred.
- **Home/pinned chunks**: `config.homeChunks` are loaded once and never
  unloaded (`record.pinned`) — confirm they still correctly join/contribute
  to their region's batch on first load (should be automatic, since
  `setChunkPlacements` doesn't distinguish pinned from streamed chunks, but
  worth an explicit test case since home chunks may be geometrically distant
  from the player's currently-loaded region set).
- **Settlement (`src/settlement/props.ts`) must stay untouched** — it has its
  own, already-cross-chunk-free `buildInstancedProps` usage; nothing in this
  plan should route settlement placements through the new region batcher.

---

## 7. Verification

Per the "no unnecessary benchmarks" instruction, this needs at most **one**
existing tool run twice (before/after), plus one manual streaming walk:

1. **`?benchmark=stream` scene census, seed 42, quality High, pixel ratio 1,
   30 s** (the exact tool research 018/019 already use) — rerun once before
   and once after implementation. A single run already reports draw calls,
   triangle count, and frame time together, which covers three of this
   plan's concerns at once:
   - Vegetation mesh count / draw calls should drop roughly in proportion to
     `REGION_CHUNKS²` (sparser species will drop less — expected).
   - Triangle count **must not rise** — a rise would mean frustum culling
     regressed (over-large region bounding spheres pushing off-screen
     instances through the vertex shader). This is the single most
     important number to watch.
   - Frame time avg/p95 should improve or hold; a regression here with a
     lower draw-call count would point at the culling trade-off outweighing
     the draw-call win, i.e. `REGION_CHUNKS` picked too large.
2. **Manual streaming walk** (browser verification, not a new benchmark
   harness): walk briskly across several region boundaries in both axes,
   watching the existing HITCH monitor overlay for `VEGETATION`/`STREAMING`
   category spikes during chunk load/unload — confirms region rebuild cost
   stays within the existing per-frame budget in the worst case (continuous
   boundary-crossing), and gives a qualitative check on LOD pop at region
   edges (§6).
3. **Unit tests** (no benchmark needed): region-key helpers, and the
   batcher's placement-set bookkeeping (add chunk → union grows; remove
   chunk → union shrinks to exactly the remaining chunks' placements;
   `removeByKey` redirects correctly) — pure logic, same style as
   `chunkManager.test.ts`/`instancedProps.test.ts`.

No new instrumentation, no repository-wide profiling, no synthetic
stress-test world needed — the existing `?benchmark=stream` harness and HITCH
monitor already answer every question this plan raises.
