# Plan: Waterways and Vegetation

**Created:** 2026-09-04
**Status:** `in progress` 🔄
**Type:** polish
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `terrain` `vegetation` `rendering`
**Tags:** `water` `rivers` `streams` `shorelines` `aquatic-vegetation`
**Roadmap:** -

## Implementation status (2026-09-05)

**Implemented + technically verified:** Phases 1, 3, 4, 5, 6, 7.

- **Phase 1 (canonical river cross-section):** `RiverChannelSegment` now carries `bedH`/`waterH`/`waterHalfWidth`/`channelHalfWidth` per endpoint instead of one `halfWidth`/`bankWidth` pair. `exposedBankFromFlow`/`submergedDepthFromFlow` (`riverNetwork.ts`) are two independent flow-scaled budgets, so `bedY < waterY < bankTopY` and `waterWidth < channelWidth` hold unconditionally, including for the smallest stream. `chunkHeightmap.ts`'s `riverChannelCandidate` carves an explicit piecewise cross-section (flat bed → submerged slope → exposed bank → ambient terrain) instead of a single bed height blended by one falloff. River-ribbon Y (`riverGeometry.ts`) now comes from the new pure `canonicalWaterHeight(point)`, not `sampleTerrainY(...) + 0.2` — that flat offset used to *be* a small stream's entire effective depth, which is the root cause of the "blue ribbon over terrain" symptom. `RIVER_SURFACE_OFFSET` is now a `0.02` z-fighting epsilon only. Shoreline queries (`nearestRiverBankDistance`/`Point`/`isInsideRiverChannel`) keep their existing "water edge" contract and gameplay callers unchanged.
- **Phase 3 (natural small streams):** falls out of Phase 1's fix directly — every stream now has a guaranteed-positive exposed bank and submerged depth, so it reads as recessed with a visible bed regardless of flow strength. No separate stream-specific code path was added, per the plan's "keep the existing continuous river-chain representation."
- **Phase 4 (riparian vegetation placement):** `chunkVegetation.ts`'s new `riparianPatches()` is a dedicated, bounded patch pass (mirrors `fernPatches`'s shape) along the river water-edge band and the existing lake "wet shoreline" altitude band, replacing the old in-loop `nearWaterline` reed-probability bump. Produces the water → reed → fern/wet-bush → riparian-tree → open-shoreline transition using **existing** species only (no new riparian tree/bush assets — see below).
- **Phase 6 (lake surface vegetation):** new `VegetationKind: 'lily'` / `LILY_SPECS`, wired through the full existing pipeline (`vegetationRegionBatcher`, `buildInstancedProps`, distance LOD, reflection visibility). `chunkVegetation.ts`'s `lilyPatches()` places bounded, patch-based clusters restricted to shallow inland water (`bodyScale` strictly between 0 and 0.9, i.e. never ocean) and never inside a flowing river channel. Uses the previously-parked `public/models/parked/Lilypad-01.glb`, fit via `preparePropFitMax` (a new `fit` option on `loadPropTemplates`/`loadPropOrFallback`) since it is flat/wide, not tall.
- **Phase 5 (dense reed clusters, 2026-09-05):** `public/models/nature/reed_cluster_a.glb` (a merged multi-stalk mesh) appended as `REED_SPECS[1]`, existing species indices left stable. `riparianPatches()`'s dedicated reed band now biases 65% toward the cluster variant (`REED_CLUSTER_BIAS`) over the single reed — denser-reading reed beds without more placements/instances, per the plan's "fewer cluster instances × more visual plants per cluster."
- **Phase 7 (shallow coastal seaweed, 2026-09-05):** new `VegetationKind: 'seaweed'` / `SEAWEED_SPECS`, using `public/models/nature/seaweed_cluster_a.glb`. `chunkVegetation.ts`'s new `seaweedPatches()` places bounded, patch-based clusters restricted to unambiguously-ocean, shallow water (`bodyScale >= 0.9`, seabed depth from `floorHeights` within `SEAWEED_MAX_DEPTH = 2.0`), never inland lake, never a river channel, never the open ocean floor. Required the anchoring fix implementation notes §8 flagged as a real risk: unlike lily pads (which sit on the water surface, where the existing water-clamped `tile.heights` already gives the right Y), seaweed roots at the seabed, so `attachChunkContent()` now samples `tile.floorHeights` instead of `tile.heights` specifically for the `'seaweed'` kind. Both new cluster GLBs are authored much larger than their in-game fit scale (raw bbox diagonals ~3.6 m and ~0.62 m), which would otherwise trip `loadGltf.ts`'s automatic shadow-casting heuristic — `loadPropOrFallback`/`loadPropTemplates` gained a `noShadow` option (forces `castShadow = false` post-fit) applied to reed/lily/seaweed templates, enforcing the plan's "reeds, lily pads and seaweed cast no shadows by default" hard constraint explicitly rather than relying on bbox-size luck.

**Not implemented:**

- **Phase 2 (variable/asymmetric bank profiles):** left as symmetric (no per-side left/right divergence, no low-frequency width/bank-margin noise). The canonical cross-section from Phase 1 is a prerequisite this builds on cleanly later; adding it now would have required doubling the segment's carving fields (signed lateral distance, independent left/right profiles) on top of an already-large data-contract change in one pass.
- **Phase 8 (riparian trees/bushes):** `riparianPatches()` reuses existing tree/bush/fern species (habitat-weighted via the existing `pickTreeSpecies`/`envGrowthFactor`), per the plan's explicit "reuse existing species initially" allowance. No dedicated willow/alder/wet-shrub assets were added.
- **Phase 9 (water material polish):** not evaluated — geometry/vegetation changes should be browser-verified first, per the plan's own suggested order.

**Browser/gameplay-verified:** not yet — the player performs this per the plan's own verification section.

### Divergences from implementation notes

- The implementation notes suggested a possible new "anchor kind" (terrain/floor/water-surface) for aquatic placement vertical attachment (§8). This was not needed: `tile.heights` is already clamped to `waterLevel` underwater, so the existing `sampleTileHeight` → `groundY` path in `attachChunkContent` already anchors lily pads to the water surface correctly with no changes.
- Shoreline query semantics (`nearestRiverBankDistance` etc.) were **not** split into separate "water edge" vs "channel/bank-top edge" public functions as the notes discussed (§4). The existing water-edge contract already matches what gameplay (drinking/filling/interactables) needs; `channelHalfWidth` (the new bank-top concept) is used internally by carving and by `riparianPatches()`'s own distance math, without a new public query surface. This kept the gameplay-facing contract change-free.

---

## Goal

Improve the visual coherence and natural appearance of rivers, streams, lakes and coastal water without introducing a meaningful runtime performance regression.

The work should primarily improve:

- river and stream channel geometry,
- the relationship between bank, water surface and river bed,
- shoreline variation,
- visual treatment of small streams,
- riparian vegetation around rivers and lakes,
- denser but efficiently rendered reeds,
- aquatic vegetation such as lily pads and shallow-water seaweed.

The intended environmental transition is:

    ordinary terrain
    → riparian trees / bushes
    → wet-bank vegetation
    → exposed bank
    → water edge
    → shallow-water vegetation
    → deeper water

Water should read as part of the terrain rather than as a blue surface placed on top of it.

## Current State

River hydrology already owns canonical river chains and derives river width, flow strength and channel depth from flow accumulation. Terrain carving and river rendering intentionally use the same river chains, keeping the physical channel and rendered water aligned.

Current channel carving provides flow-scaled width and depth plus a bank transition, but the profile is largely regular and symmetric. River water geometry currently derives its Y from rendered carved terrain and adds `RIVER_SURFACE_OFFSET = 0.2`, while minimum channel depth is approximately `0.15 m`. For the smallest streams this can make the water reach or exceed the surrounding pre-carve terrain height, contributing to the blue-ribbon effect.

Vegetation generation is already deterministic, worker-safe and chunk-generated. Rendering already uses `THREE.InstancedMesh`, shared prop templates, regional 3×3 chunk batching and distance-based density LOD through `InstancedMesh.count`. Reeds participate in this pipeline, but shoreline reeds currently compete with ordinary vegetation candidates and only one reed template is available.

## Design Principles

### One canonical river cross-section

Do not introduce an independent visual river profile. Hydrology / river-network data remains the source of truth for river path, flow strength and the canonical cross-section consumed by terrain carving, water rendering, vegetation placement and shoreline gameplay queries.

The cross-section must distinguish at least:

- natural/reference terrain,
- bank top / channel extent,
- water edge / water width,
- water-surface elevation,
- submerged slope,
- bed elevation.

Maintain the core invariants:

    bedY < waterY < bankTopY
    waterWidth < channelWidth

`water width` and `channel width` must not be treated as the same concept. The exposed channel between water edge and bank top is intentional space for readable bank geometry and shoreline vegetation.

### Streams remain continuous

A valid 10–15 metre stream must remain visibly continuous. Do not simulate small streams by randomly removing water sections. Reduce their visual dominance through narrower and varying width, recessed water, visible shallow bed, irregular banks and subtler shading.

### Generation-time complexity over per-frame complexity

Prefer deterministic generation-time calculations over runtime simulation. Do not add per-frame bank, vegetation or water-placement calculations.

### Extend existing vegetation mechanisms

Do not introduce a parallel river/aquatic vegetation manager. Extend the existing chunk vegetation placement and instanced rendering pipeline.

## Phase 1 — Canonical River Cross-Section

Replace the current conceptual relationship:

    river water Y = carved terrain Y + large visual offset

with an explicit canonical river cross-section.

Extend river/channel data as necessary so each segment can derive or expose compact, worker-safe data for:

- reference/natural terrain elevation,
- bank/channel extent,
- water-surface elevation,
- water half-width,
- bed elevation,
- bank/submerged profile.

`RIVER_SURFACE_OFFSET` may remain only as a small rendering epsilon if required to avoid z-fighting. It must not represent river water depth.

Water elevation must remain continuous downstream and across chunk boundaries.

Initial tuning guidance for exposed bank above water:

| Flow scale | Initial range |
|---|---:|
| small stream | ~0.15–0.30 m |
| medium stream | ~0.20–0.40 m |
| river | ~0.30–0.60 m |
| major river | ~0.40–0.80 m |

These are visual tuning ranges, not hard river classes or acceptance thresholds. Browser verification should determine final values.

Update terrain carving, river ribbon geometry and shoreline queries to consume compatible canonical cross-section data rather than deriving conflicting interpretations.

## Phase 2 — Variable River Bank Profiles

Make river banks less uniform while preserving deterministic chunk continuity.

Support low-frequency variation in at least:

- bank transition width,
- bank steepness/profile,
- water width,
- left/right bank character.

Variation should create coherent stretches of river rather than change every metre. Some sections should expose a clearly visible bank or small escarpment of roughly `0.5 m` where appropriate, while others should transition gently into surrounding terrain.

Left and right banks should not necessarily share identical profiles. Derive variation from canonical river/world-space data; never generate independent random bank profiles per chunk.

Curvature-aware behaviour such as steeper outer bends and gentler inner bends is optional polish. Add it only if it fits cleanly into the canonical river representation without materially increasing complexity.

## Phase 3 — Natural Small Streams

Keep the existing continuous river-chain representation.

Small streams should have:

- continuous visible water,
- narrow water surface,
- bounded low-frequency width variation,
- recessed water below surrounding terrain,
- readable exposed banks,
- visible shallow bed where transparency permits,
- less visually dominant water shading.

Do not allow width variation to reach zero for an existing valid stream. Avoid high-frequency lateral noise that makes streams jagged.

Shader adjustments should follow geometry corrections rather than hide incorrect channel geometry.

### Blue-line acceptance criterion

From normal gameplay viewing distances, a small stream must read as a recessed watercourse with visible banks rather than a blue ribbon laid over terrain, while remaining continuously visible along its valid hydrological path.

## Phase 4 — Riparian Vegetation Placement

Add a dedicated riparian/aquatic placement pass inside the existing chunk vegetation generation pipeline, following the existing dedicated patch-generation pattern rather than only increasing `reed` probability in the ordinary vegetation candidate loop.

Reuse existing:

- river channel/cross-section data,
- shoreline/water information,
- biome weights and moisture,
- world seed and world-space noise,
- vegetation placement types.

Produce coherent patches rather than uniform rings.

For rivers and streams, habitat weighting should support a transition such as:

    water
    → reeds / wet plants
    → ferns / wet shrubs
    → riparian trees
    → ordinary vegetation

For lakes, support reeds/cattails, wet bushes, appropriate ferns, riparian trees and shallow-water lily patches. Long sections of relatively open shoreline must remain possible.

## Phase 5 — Dense Reed Clusters

Increase visual reed density without proportionally increasing instance count.

Prefer small static reed-cluster assets over large numbers of individual placements. Suggested initial variants:

    reed_cluster_a — ~3–4 stalks
    reed_cluster_b — ~5–6 stalks
    reed_cluster_c — ~7–9 stalks

Each cluster should preferably be one merged low-poly mesh with one shared material where practical, static, non-interactive and collider-free.

Render clusters through the existing vegetation placement → `buildInstancedProps()` → `InstancedMesh` → `vegetationRegionBatcher` → density-LOD path. Do not use cloned `Object3D` instances for dense reeds.

## Phase 6 — Lake Surface Vegetation

Add lightweight lily-pad clusters for suitable inland water.

Placement should be:

- limited to suitable lake/inland water,
- biased toward shallow shoreline areas,
- patch-based,
- deterministic,
- explicitly bounded per chunk.

Use a few low-poly cluster variants rather than large numbers of individual leaves where practical. Do not distribute lily pads uniformly across lakes or place them in fast-flowing river sections by default.

## Phase 7 — Shallow Coastal Vegetation

Add lightweight seaweed clusters only to suitable shallow coastal water:

    coastline
    → shallow submerged floor
    → habitat/depth test
    → deterministic patch mask
    → seaweed clusters

Do not populate the general ocean floor. Seaweed outside the visually relevant shallow coastal zone provides little value and unnecessarily increases geometry.

Reuse static instancing and bounded placement budgets.

## Phase 8 — Riparian Trees and Bushes

Improve the vegetation identity of rivers and lakes.

Reuse existing tree, bush and fern species initially where appropriate. Add dedicated riparian assets only where they materially improve visual identity.

Candidate additions:

- 1–2 willow/alder-like tree variants,
- one wet-shrub variant.

Prefer expressing riparian suitability as species/habitat weighting rather than creating separate rendering or simulation systems. This should leave a natural path toward future ecosystem work where habitat preferences can become meaningful simulation data.

## Phase 9 — Optional Water Material Polish

After channel geometry and vegetation are implemented, evaluate whether water materials still need adjustment.

Potential inexpensive changes include:

- shallow/deep colour contrast,
- low-flow transparency,
- river-bed visibility,
- subtle shoreline colouring,
- small-stream Fresnel/specular reduction.

Do not add additional reflection passes, render targets, higher-frequency planar reflections, screen-space water effects or CPU water simulation.

## Performance Budget

Performance is a hard constraint. Target no meaningful FPS regression in a representative gameplay scene.

### Hard constraints

- no new per-frame river or vegetation simulation,
- no new water render passes,
- no new water render targets,
- no runtime terrain deformation,
- bounded riparian/aquatic placements per chunk,
- aquatic props use existing instancing/batching where compatible,
- no colliders or individual ticks for decorative aquatic vegetation,
- reeds, lily pads and seaweed cast no shadows by default,
- reuse existing distance density LOD,
- reuse existing reflection-distance/render-layer mechanisms where applicable.

### Placement and geometry budgets

Dedicated riparian/aquatic passes must have explicit bounded candidate/placement budgets. Shoreline length and ocean area must not produce unbounded instance growth.

Prefer:

    fewer cluster instances × more visual plants per cluster

rather than many individual plant instances.

Small aquatic vegetation may use more aggressive density reduction than trees and large bushes.

Instancing reduces draw calls but does not make geometry free. Cluster assets should remain low-poly, minimize material count and avoid excessive alpha overdraw.

### Performance verification

Compare representative scenes before and after implementation using existing performance tooling where available. Check at least:

- frame timing / FPS behaviour,
- draw calls,
- triangle count,
- visible/active instance counts,
- reflection participation where relevant.

Do not set an arbitrary percentage threshold if browser measurements are too noisy; investigate any consistent measurable regression and reduce density/geometry or reflection/shadow participation before adding runtime complexity.

## Asset Work

Current assets provide generic trees/bushes/ferns and one reed variant but not enough variation for the intended aquatic environments.

Expected small asset additions:

- reed cluster variants,
- lily-pad cluster variants,
- seaweed cluster variants,
- optionally 1–2 riparian trees,
- optionally one wet shrub.

Prefer deriving clusters from existing compatible assets where possible. Keep materials shared between variants where practical.

## Architecture Constraints

Do not introduce:

- a `RiverVegetationManager`,
- an `AquaticVegetationManager`,
- a second hydrology representation,
- duplicated shoreline state,
- player-relative water generation,
- per-frame vegetation placement,
- independent per-chunk river randomness.

Important existing integration points include:

- `src/terrain/riverNetwork.ts` — canonical river/hydrology-derived data,
- `src/terrain/chunkHeightmap.ts` — channel terrain carving,
- `src/world/riverGeometry.ts` — rendered river ribbon,
- `src/world/createRiverWater.ts` / `src/world/riverWaterMaterial.ts` — river presentation,
- `src/terrain/chunkVegetation.ts` — deterministic vegetation placement,
- `src/render/instancedProps.ts` — static prop instancing,
- `src/terrain/vegetationRegionBatcher.ts` — regional batching and density LOD,
- existing water-body/shoreline data for lake/coastal placement.

Important architectural/public functions or types introduced or materially changed by this plan should receive concise JSDoc where useful for AI preflight discovery, using `@domain world-terrain` where appropriate.

## Non-goals

This plan does not implement:

- physical water-flow simulation,
- dynamic erosion or sediment transport,
- seasonal water-level changes,
- flooding or dynamic river rerouting,
- aquatic plant lifecycle,
- underwater ecosystem simulation,
- fish behaviour,
- player harvesting of aquatic vegetation,
- additional reflection/refraction architecture.

These may build on the resulting habitat/profile data later.

## Verification

### Automated

Run the relevant existing tests and build/type-check commands for changed terrain, river and vegetation code. Add focused tests for new pure/deterministic cross-section/profile helpers where practical, especially seam continuity and invariants.

Verify that:

- `bedY < waterY < bankTopY` for normal generated flowing-water profiles,
- `waterWidth < channelWidth`,
- cross-section/profile values remain deterministic,
- adjacent chunks agree on shared river data,
- valid stream geometry remains continuous,
- aquatic/riparian placement budgets are bounded and deterministic.

### Manual browser verification

The player performs final visual verification in the browser.

Check representative examples of:

- a small stream,
- a larger river,
- gentle and steep bank sections,
- a lake with open shoreline and vegetation patches,
- dense reed patches,
- lily pads,
- shallow coastal seaweed,
- transitions between chunks,
- near/mid/far vegetation LOD.

Confirm specifically that small streams no longer read as blue lines laid over terrain and that added vegetation does not create obvious uniform rings or carpets.

Compare representative performance counters before/after and tune density/asset complexity if necessary.

## Suggested Implementation Order

1. Define the canonical river cross-section and invariants.
2. Update terrain carving, river water elevation and shoreline queries to consume it.
3. Add deterministic variable/asymmetric bank profiles.
4. Tune small-stream geometry and presentation.
5. ~~Perform browser verification of river/channel behaviour.~~ (User does this)
6. Add dedicated riparian/aquatic vegetation placement.
7. Add efficient reed clusters and tune density/LOD.
8. Add riparian tree/bush habitat weighting and assets where needed.
9. Add lily-pad and shallow coastal seaweed clusters.
10. ~~Perform browser and performance verification.~~ (User does this)
11. Apply optional cheap water-material polish only if still needed.

## Implementation Notes

Use: `docs/plans/implementation-notes/world-terrain-010-waterways-and-vegetation-implementation-notes.md`

Record implementation-relevant findings from the current codebase, especially canonical river-data ownership, cross-chunk continuity, vegetation placement/batching integration points, performance constraints and asset/template reuse. Do not duplicate this plan.

Check also: `public/models/parked/README.md` for parked models (lily)

> **Zrób git commit i push do main, rebase jeżeli trzeba**
