# Implementation Notes: World Generation & Placement Correctness

## Review result

The plan is still relevant, but the current code already implements a large part of its intended groundwork. Do not reimplement plan 173/181/189-style terrain-aware placement or river carving.

The remaining work is primarily corrective:
- river terminal/receiver correctness,
- explicit river-channel exclusion for vegetation/grass where the current height clamp is not sufficient,
- footprint-aware cemetery vs. road rejection,
- better grounding of remaining terrain-bound landmarks,
- higher-altitude vegetation continuity using the existing biome/altitude/ridge model.

## Current architecture to reuse

- src/terrain/chunkHeightmap.ts: computeChunkTile() is authoritative. Order is regional smoothing → road/path/clearing modifiers → river carving → final heights clamp / floorHeights.
- heights is intentionally clamped to waterLevel; floorHeights is the real terrain/bathymetry.
- ChunkTileParams.riverSegments already carries canonical river-carving data into generation.
- src/terrain/riverNetwork.ts: canonical river tiles are 256 m core, 384 m halo, 8 m D8 cells. computeRiverTile() is deterministic and independent of chunk load order. RiverChannelSegment is the same path used for carving and river rendering.
- src/terrain/hydrology.ts: D8 flow, accumulation and terminal flags. HydrologyFlag.OCEAN_OUTLET already exists.
- src/terrain/chunkVegetation.ts: shared forestDensityAt()/biomeWeightsAt() plus altitude, ridge, slope and road constraints; worker-safe and deterministic.
- src/terrain/grassPlacement.ts: same terrain constraints; worker-safe.
- src/terrain/biomeRegions.ts: forestDensityAt() is the shared continuous vegetation/habitat signal. Do not add another mountain-flora biome.
- src/terrain/chunkEnvironment.ts: owns deterministic environment placement. roadSegments, clearings and regional are already available through ChunkTileParams.
- src/settlement/roadNetwork.ts: RoadCorridorSegment is the authoritative road/path geometry. Use segment distance + actual halfWidth; do not infer road presence only from roadTint.
- src/settlement/decorProps.ts + src/settlement/propUtils.ts: TerrainPlacementContext, sampleLocalTerrain() and applyTerrainTilt() already solve per-element terrain adaptation.
- src/terrain/chunkManager.ts: runtime adapter; it already passes terrain context to stone-circle/cemetery creation.

## Important discrepancies / likely remaining bugs

### 1. River endpoints are still not receiver-safe

hydrology.ts distinguishes SINK, BOUNDARY_EXIT and OCEAN_OUTLET. However riverNetwork.ts::buildChains() currently terminates a chain at SINK or BOUNDARY_EXIT. OCEAN_OUTLET is not used to distinguish a valid terminal from a dry-land exit.

This is the most important hydrology gap relative to the plan.

A valid river terminal should have a receiver consistent with the existing model: ocean outlet is valid; a continuation into another river tile/network is valid; an inland-water receiver is valid only if supported by the current model; a dry-land sink or unexplained boundary exit must not be presented as a finished river.

Do not solve this with a global hydrology graph or persistent world river state. Preserve the fixed-tile architecture and deterministic generation.

Be careful with tile boundaries: chain points are deliberately kept inside the owning tile core. Do not reintroduce cross-tile ownership just to make an endpoint longer. Prefer validating the downstream side using the existing halo/D8 data while keeping ownership unchanged.

Add regression coverage for ocean outlet, dry boundary exit, dry sink, a river crossing a tile boundary, and deterministic (seed,tile) results.

### 2. Vegetation currently relies mostly on the heights clamp for water rejection

computeChunkTile() stores heights = max(floorH, waterLevel), so river-carved terrain below the waterline becomes exactly waterLevel to vegetation/grass. This already rejects most normal grass/trees.

For the explicit plan requirement, use the already-passed params.riverSegments and canonical segment geometry to reject candidates that fall inside the actual river channel. The bank should remain eligible as dry land.

Prefer one shared geometric predicate rather than duplicating point-to-segment/width interpolation in trees and grass. Keep it worker-safe and deterministic. No runtime river lookup or ChunkManager dependency.

Extend tests so a synthetic RiverChannelSegment proves channel interior rejection, bank/outside eligibility, and deterministic output.

### 3. Cemetery-vs-road check is currently point-based, not footprint-based

computeChunkEnvironment() rejects a cemetery when sample(tile.roadTint, wx, wz) exceeds ROAD_TINT_REJECT. That only tests the cemetery center; the grave grid can still extend across a road.

Use params.roadSegments as the source for this check. Reuse existing segment-distance math.

The check should account for the actual cemetery footprint: derive horizontal extent from cemeteryGraveLayout(size, scale), add deterministic grave-jitter/clearance margin, then reject when that footprint intersects a road/path corridor plus an explicit safety margin.

Keep this in chunkEnvironment.ts and generation-time. Do not introduce collision geometry or another road representation. Retain cemeteryFitsVillageFringe() as the village-fringe rule.

### 4. Stone circles are already terrain-aware; other landmark roots are not

createStoneCircle() and createCemetery() already sample each element's terrain and apply bounded tilt. Their tests cover this.

createMonolith() and createSmallRuins() still use generic placeOnGround(). On an accepted slope this grounds only the root/base point, so larger footprints can visibly float or intersect.

Reuse TerrainPlacementContext + applyTerrainTilt() for these remaining terrain-bound landmark types. Keep the tilt bounded and do not attempt full mesh conforming.

The existing slope rejection in chunkEnvironment.ts remains the coarse placement constraint; terrain orientation is visual adaptation after acceptance, not a replacement for the gate.

### 5. Grave spacing is still quite tight

cemeteryGraveLayout() currently uses roughly 1 m row/column spacing with small deterministic jitter. The plan's larger, more natural spacing should be addressed here, not by scattering graves in createCemetery().

world/hiddenFinds.ts reuses cemeteryGraveLayout(), so keep it as the single source of truth. Preserve deterministic ordering and SM/MD/LG layouts.

Increase base spacing first; keep per-grave jitter modest enough to avoid overlaps.

## Mountain vegetation

The current model already has forestDensityAt(), biomeWeightsAt(), altitude, mountainRidge, grass treeline/fade and terrain rock/snow colouring.

Current hard limits are conservative: tree treeline is about 0.6 altitude fraction, grass about 0.5, with additional ridge rejection/fade. If the browser issue is sparse vegetation high on mountain slopes, tune these existing constraints rather than adding a mountain-flora system.

Prefer a continuous transition: extend useful vegetation farther upslope where biome/forest suitability still supports it, retain strong-ridge rejection / rock takeover, and do not restore lowland grass where the height/biome model intentionally excludes it.

Do not make forestBiomeAt() the placement gate; it is a coarse classification. forestDensityAt() is the continuous control.

Tests should verify the intended trend/constraint, not freeze arbitrary per-seed placement counts.

## Determinism / streaming

Preserve world-space noise for shared fields, seeded RNG streams, chunk ownership, identical regeneration results and worker compatibility.

Do not use Math.random() in generation/placement. propUtils.cloneProp() still uses Math.random(), but affected environment paths already provide explicit seeded rotations; do not expand scope into unrelated utility cleanup.

For river continuity, preserve ChunkManager's retainRiverTilesFor()/per-tile lifecycle. Do not introduce a global retained river graph.

## Suggested implementation order

1. Fix/validate river terminal semantics and add hydrology/network regression tests.
2. Add the shared river-channel placement predicate and wire it into tree + grass generation.
3. Make cemetery road rejection footprint-aware using roadSegments and cemeteryGraveLayout().
4. Extend terrain-aware root placement/tilt to monolith + ruins.
5. Increase cemetery spacing through the shared layout function; verify hidden-find derivation still follows it.
6. Tune high-altitude vegetation using the existing continuous constraints and add non-brittle regression tests.

## Verification focus

Automated: river terminal/continuity tests; vegetation/grass channel exclusion; cemetery footprint-vs-road tests; terrain-aware landmark placement tests; cemetery layout determinism/spacing tests; existing full technical checks.

Browser: inspect a seed with several rivers and follow each to its visible terminal; inspect river tile seams; inspect river banks for grass/tree intrusions; inspect cemetery edges against roads including larger cemeteries; inspect stone circles/ruins/monoliths on slopes; inspect mountain slopes from lowland through the upper vegetation band.

The browser check remains necessary because several targets are visual placement correctness, not just numeric invariants.

**Zrób git commit i push do main, rebase jeżeli trzeba**