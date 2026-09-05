# World Terrain 010 — Waterways and Vegetation — Implementation Notes

> Review against current `main` on 2026-09-04. Code is the source of truth over the plan text.

## 1. River profile ownership

The current river path ownership is already correct and should stay intact:

- `src/terrain/riverNetwork.ts` owns deterministic 256 m river tiles, canonical `RiverChain`s, accumulation-derived flow/width/depth and cross-chunk continuity.
- `ChunkManager.ensureLoaded()` retains those chains before tile generation, derives `riverChannelSegmentsNear(...)`, and sends plain numeric segment data through the existing terrain-worker path.
- `src/world/riverGeometry.ts` clips the same chains per chunk for rendering.

Do not add another river path/profile cache or per-chunk random profile state.

The important mismatch is the current `RiverChannelSegment` contract. `aHalfWidth/bHalfWidth` is simultaneously treated as:

- the width used by terrain carving,
- the rendered ribbon half-width (`widthFromAccumulation()/2`),
- the shoreline/gameplay edge in `nearestRiverBankDistance()` / `nearestRiverBankPoint()`,
- the river exclusion edge in `isInsideRiverChannel()`.

That cannot express the plan's required `waterWidth < channelWidth`. Phase 1 should therefore change this shared contract first, rather than tuning carving and rendering independently.

A practical worker-safe segment contract should carry endpoint values sufficient to interpolate at `t`, e.g. bed Y, water Y, water half-width, channel/bank-top half-width and left/right bank reach/profile parameters. Exact field names are less important than keeping one plain-numeric representation consumed by all downstream users.

## 2. Water elevation must not come from rendered terrain sampling

Today `buildRiverRibbonGeometry()` computes:

`sampleTerrainY(centerline) + RIVER_SURFACE_OFFSET`

with `RIVER_SURFACE_OFFSET = 0.2`, while minimum channel depth is only `0.15`. This is the concrete cause of the small-stream failure described by the plan.

After Phase 1, river geometry should read interpolated canonical `waterY` from river/profile data. Keep only a tiny render epsilon if needed for z-fighting. Do not derive physical water depth from `sampleTerrainY()`.

Be careful with the current reason `sampleTerrainY()` was introduced: road/clearing terrain modifiers run before river carving. The replacement profile still has to agree with the final carved terrain. Prefer making the river segment/profile itself sufficient for both carving and ribbon Y rather than reintroducing a second post-hoc terrain interpretation in `createRiverWater.ts`.

## 3. Carving changes belong in the existing Stage 3

`src/terrain/chunkHeightmap.ts` currently applies terrain in this order:

`raw terrain -> regional smoothing -> roads/clearings -> river channel -> final heights`

Keep that order. `applyRiverChannel()` is already the correct integration point.

Current carving uses one symmetric profile:

- flat-ish inner bed (`RIVER_CHANNEL_INNER_FRACTION = 0.5`),
- one interpolated `halfWidth`,
- one interpolated `bankWidth`,
- smoothstep back to ambient terrain,
- lowering only (`Math.min`), never artificial levees.

Extend this function/profile rather than creating a second bank deformation pass. Preserve the lowering-only rule unless browser verification demonstrates a real need to raise terrain; raising would affect roads, clearings and existing terrain invariants much more broadly.

For asymmetric banks, derive left/right signed lateral distance from the segment tangent and interpolate deterministic endpoint profile values. Variation must be world/river-data-derived before chunk clipping so adjacent chunks cannot disagree.

## 4. Shoreline queries need semantic split

`nearestRiverBankDistance()` currently returns distance from the centerline minus `halfWidth`, and its callers treat that as the river edge. Once `waterWidth` and `channelWidth` diverge, keep separate concepts:

- **water edge** — drinking/filling/interactions and submerged-placement tests,
- **channel/bank-top edge** — terrain/vegetation habitat transition where useful.

Update `nearestRiverBankPoint()`, `isInsideRiverChannel()` and their callers deliberately; do not silently change one helper's meaning while retaining the old name/comments.

`ChunkManager` exposes river shoreline helpers to gameplay, so this contract change is broader than rendering even though the plan is `polish`.

## 5. Hydrology continuity and profile variation

`RiverPoint.elevation` is generated from the hydrology chain and strictly descends; accumulation is also the existing source for `flowFactor()`, width and depth. Reuse those inputs.

Recommended approach for low-frequency bank/width variation:

- derive stable variation from world-space position + world seed and/or stable chain neighbourhood;
- sample at river points/endpoints and interpolate along segments;
- keep amplitudes bounded by flow-scaled base values;
- taper or otherwise guarantee compatibility at river-tile boundaries, following the existing meander continuity strategy in `riverNetwork.ts`.

Do not seed variation from chunk coordinates. A chunk is only a consumer of river data.

## 6. Vegetation generation: extend `computeChunkVegetation()`

The correct generation boundary is `src/terrain/chunkVegetation.ts`. It is already deterministic, worker-safe and receives:

- tile `heights` and `floorHeights`,
- `bodyScale`, continentalness, moisture and biome fields,
- `params.riverSegments`,
- world seed,
- road tint and slope information.

Current reeds are chosen inside the ordinary candidate loop, so they compete with trees/bushes and are too sparse for intentional shoreline patches. Add a second bounded riparian/aquatic candidate pass in this same function (or a small pure helper called by it), then append to the same `VegetationPlacement[]`.

Keep independent fixed budgets for ordinary vegetation and aquatic/riparian candidates. Do not derive candidate count directly from shoreline length or ocean area.

For river habitat use canonical river distances/profile data, not only `height - waterLevel`: mountain streams can sit above global `waterLevel`.

## 7. Lakes and coast: use current tile fields, but do not invent global lake identity

`src/terrain/waterBodies.ts` detects water bodies with a BFS only inside one apron-inclusive chunk. `bodyScale` is useful locally:

- `0` = land,
- `< 0.9` = inland water/lake tuning,
- `1` = ocean.

It is **not** a stable cross-chunk lake ID or global lake-size representation. Lily-pad placement should therefore use local deterministic habitat/depth/patch tests, not persist or compare `WaterBody.id` between chunks.

For coast vs inland water, prefer existing `continentalness` + `oceanMixAt(...)` semantics. For shallow-water depth, use `floorHeights`; `heights` is clamped to `waterLevel` underwater.

## 8. Aquatic placements need explicit vertical anchoring

Current vegetation attachment in `ChunkManager.attachChunkContent()` converts every non-tree vegetation placement to `PropPlacement` with:

`groundY = sampleTileHeight(...)`

where `sampleTileHeight` samples `tile.heights`. Underwater this is the clamped water surface, not the seabed.

That is fine for lily pads but wrong for rooted seaweed. Do not hide this difference inside asset offsets.

Add an explicit placement/attach convention, for example a compact anchor kind:

- terrain/ground -> `tile.heights`,
- floor/seabed -> `tile.floorHeights`,
- water surface -> `waterLevel` or canonical river `waterY`.

Keep it plain data and worker-safe. This will also avoid special-case world-Y logic in the renderer.

## 9. New vegetation kinds touch several existing seams

If lily pads / seaweed / reed clusters become distinct kinds, update all of the existing pipeline coherently:

- `VegetationKind` and `vegetationSpeciesCount` in `chunkHeightmap.ts`,
- placement generation in `chunkVegetation.ts`,
- asset specs in `settlement/propSpecs.ts`,
- template preload/cache and `contentTemplatesReady()` in `chunkManager.ts`,
- `attachChunkContent()` mapping to `PropPlacement`,
- `vegetationRegionBatcher.ts` `VegetationKind`, `ALL_KINDS` and `VEGETATION_KINDS`.

Do not bypass `vegetationRegionBatcher`. It provides the existing 3x3 regional batching, distance density LOD and reflection-layer behaviour.

`buildInstancedProps()` copies `castShadow`/`receiveShadow` from template primitives. The plan requires reeds/lilies/seaweed to cast no shadows by default, so enforce that intentionally in template preparation or with a small per-kind batching option; do not assume instancing disables shadows.

## 10. Reed clusters and asset compatibility

Current `REED_SPECS` contains only `/models/nature/reed_a.glb`. Prefer adding cluster variants to the existing static-prop asset/spec path, with one merged low-poly mesh/material per cluster where possible.

Keep species indices stable where existing generated vegetation depends on them: append variants rather than reordering existing entries.

If a reed cluster visually represents several stalks, increase visual density via the asset before increasing placement count. The regional batcher already reduces draw calls, but triangle/alpha cost still scales with geometry.

## 11. Reflection/render cost

Regional vegetation currently inherits reflection visibility through `vegetationRegionBatcher.syncReflectionVisibility()` and render layers. Aquatic foliage should use the same mechanism unless a measured reason justifies being reflection-skipped entirely.

For very small lily/seaweed/reed clusters, skipping mirror participation may be cheaper and visually acceptable, but make that a deliberate per-kind decision and verify with the existing WATER/VEGETATION perf counters rather than adding another reflection path.

Do not add water render targets/passes; existing river water is a separate lightweight material and lake/ocean water already share the current mirror architecture.

## 12. Tests worth adding/updating

Extend the existing focused tests instead of creating broad integration fixtures:

- `src/terrain/riverNetwork.test.ts`: profile determinism, `bedY < waterY < bankTopY`, `waterWidth < channelWidth`, bounded variation and seam-compatible endpoint data.
- `src/terrain/chunkHeightmap.test.ts`: carving consumes the new profile and preserves lowering-only behaviour / adjacent-edge equality.
- vegetation tests: fixed candidate/placement upper bounds, determinism, no river-water placements outside allowed habitat, no seaweed outside shallow ocean, no lily pads on dry land / ocean by default.

Keep the existing river-chain continuity and terminal-receiver tests as regression coverage; do not replace them with profile-only tests.

## 13. Suggested implementation sequence

1. Refactor `RiverChannelSegment` into the canonical cross-section contract and update pure river tests.
2. Update `applyRiverChannel()` plus water-edge/channel-edge queries.
3. Update river ribbon geometry to use canonical water width/Y; remove `0.2` as physical depth.
4. Add low-frequency asymmetric profile variation only after the base profile works.
5. Add the bounded riparian/aquatic placement pass.
6. Extend kinds/templates/anchoring/batching for reed clusters, lilies and seaweed.
7. Tune assets/densities and only then consider shader polish.

This order keeps the highest-risk shared data-contract change separate from asset/density tuning and makes regressions easier to localize.

## Update

Added `public/models/nature/reed_cluster_a.glb` and `public/models/nature/seaweed_cluster_a.glb`

## Update 2 (2026-09-05) — Phases 5/7 wired using the assets above

Both GLBs are authored well above in-game scale (raw bbox diagonal ~3.6 m for
the reed cluster, ~0.62 m for the seaweed cluster) — both exceed
`loadGltf.ts`'s `SMALL_MESH_SHADOW_THRESHOLD` (0.5 m) at native scale, so
relying on that heuristic alone would have given them shadows the plan
explicitly forbids. Added an explicit `noShadow` option to
`loadPropOrFallback`/`loadPropTemplates` (forces `castShadow = false` on every
mesh after fit) instead, applied to reed/lily/seaweed templates in
`chunkManager.ts`.

Seaweed needed the anchor-kind concern from §8 addressed for real (lily
pads didn't, since the water-clamped `tile.heights` already equals the water
surface underwater). `attachChunkContent()`'s per-kind vegetation loop now
special-cases `'seaweed'` to sample `tile.floorHeights` (true bathymetry)
instead of `tile.heights` for `groundY` — no new anchor-kind enum was needed,
just a per-kind sampler choice at the one call site that builds
`PropPlacement.groundY`.

Reed cluster went in as `REED_SPECS[1]`, picked with a 65% bias in
`riparianPatches()`'s existing reed band (`REED_CLUSTER_BIAS`) rather than a
uniform species roll — the plan's "prefer cluster instances over increasing
individual placement count" is a deliberate weighting decision, not something
that falls out of just adding a second spec entry.

Seaweed's ocean-vs-lake gate reuses `bodyScale`'s existing saturate-to-1 vs
cap-at-0.85 behavior (`computeBodyScale`) rather than importing
`waterBodies.ts`'s `oceanMixAt`/`OCEAN_BODY_SCALE_DISCARD` into
`chunkVegetation.ts` — `bodyScale >= 0.9` already cleanly separates the two,
so no new cross-module dependency was needed.
