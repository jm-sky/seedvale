# Implementation Notes: Distance-Based Terrain Detail LOD

**Plan:** `docs/plans/world-terrain-005-distance-based-terrain-detail-lod.md`

## Pre-flight findings

### Grass

- `src/terrain/distanceLod.ts`'s `densityLodFraction`/`grassFillerLodFraction`/`grassGeometryLodTier` already implement a near/mid/far model for the *detailed* species buckets (`tri`/`grain`/`herb`): density fraction + geometry (fin-segment) LOD both taper with distance across `effectiveGrassRadius`.
- The **filler** bucket (`grassPlacement.ts`'s `FILLER_*` constants, `grass.ts`'s `FILLER_FINS`) is already a separate, always-generated, cheap 2-fin `InstancedMesh` per chunk — candidates are rolled every chunk regardless of distance, only `setLodFraction`'s `fillerFraction` argument decided whether they draw. The old `grassFillerLodFraction(dist, lodScale)` hardcoded `dist <= 1` (player's chunk + immediate ring only, issue 023).
- Because filler instances already exist for every grass chunk, extending "how far filler draws" needed **zero new placement/candidate generation** — purely a distance-LOD-curve change plus a live quality knob. No new species, no new geometry, no chunk rebuild.
- Chosen shape: `grassFillerLodFraction(dist, radius, lodScale)` — linear falloff to 0 at `radius`. `ChunkManager` derives `radius = 1 + grassFillerCoverage * (effectiveGrassRadius - 1)`, so `grassFillerCoverage = 0` reproduces the original near-only radius and `1` extends filler across the whole grass ring. `grassFillerCoverage` lives in `WorldConfig.quality` (live, part of `QualityKnobs`/presets), wired through `ChunkManager.setGrassFillerCoverage` the same way `setLodScale` already re-syncs already-loaded chunks — no `onTerrainChange` rebuild.

### Road

- `src/terrain/chunkHeightmap.ts`'s `roadCandidate()` (called from `applyTerrainCorridors()`, itself part of the worker-run `computeChunkTile`) **already bakes real vertex-height deformation** into road corridors: edge wobble (`edgeWobbleAmplitude/Scale`) and sparse potholes (`potholeDepth/Threshold`), both driven by one seeded `roadDetail` noise handle sampled in world space — already seam-safe across chunk boundaries via the existing apron mechanism, and already scaled by each segment's own `heightStrength` so paths stay flatter than roads.
- This is the single, existing "road height adjustment" stage in the height pipeline (`base terrain height → applyTerrainCorridors → final vertex`, `chunkMeshData.ts`'s `positionY` reads straight off the resulting `floorHeights`). There is no separate render-only road mesh and no second source of road height.
- Decision (plan §1 "modyfikować rzeczywistą terrain geometry, czy pozostać wyłącznie render-detail?"): **extend the existing baked-geometry mechanism**, not a shader-only distance-faded displacement. Reasons:
  - Reuses 100% of the existing pipeline (one noise handle, one seam-safe apron-sampled function) instead of adding a new per-vertex attribute (`ChunkMeshData` → worker protocol → `buildChunkGeometry.ts` → vertex shader), a second `applyTerrainCorridors`-shaped computation, and camera-distance shader logic.
  - At the target magnitude (a few cm — comparable to the existing `potholeDepth` default of 0.12), the detail is naturally imperceptible past normal camera distance anyway (perspective/pixel size), which is exactly the "far stays cheap" half of the near/far contract the plan asks for — no explicit LOD/fade mechanism was needed to get it.
  - Consequences for gameplay/navigation/placement are the same *category* already accepted by the shipped pothole feature (small height perturbation baked into the same field `slopeConstraint`/footstep/placement/pathing already read) — not a new risk surface.
- New `RoadNetworkParams` fields (`chunkHeightmap.ts`), all under one `surfaceDetailEnabled` toggle:
  - `rutDepth`/`rutOffsetFraction`/`rutWidthFraction` — two symmetric wheel-rut grooves. Ruts are symmetric around the centerline, so a single Gaussian dip centered on the existing **unsigned** lateral `dist` (no signed-offset math, no `segment.ts` change) already produces two grooves, one per side.
  - `microBumpStrength`/`microBumpScale` — continuous signed noise (not sparsely gated like potholes) for general unevenness ("grudki"), own noise-domain offset so it doesn't correlate with the pothole term.
  - All scaled by the same `falloff × heightStrength` the pothole term already uses — paths inherit "nearly flat" for free, no special-casing.
- Config merge: `RoadNetworkParams` is merged as a flat spread (`{ ...defaultRoadNetwork, ...r.roadNetwork }` in `worldConfig.ts`), so new fields need no explicit migration code — an old persisted config just falls back to the new defaults.
- Test fixtures: ~10 test files each declare a full `RoadNetworkParams` object literal (not `Partial`) — this is the established pattern (potholes etc. are also non-optional), so all of them got the six new fields added rather than making the new fields optional on the type.

## What was *not* built

- No new `RoadMesh`/second geometry system, no terrain-resolution increase, no new worker/protocol/vertex-attribute plumbing, no new grass species or per-species geometry LOD tier for filler (it deliberately stays the single cheap near-only shape — only its *draw distance* changed).
- No Vue "Świat → Grafika" screen changes — consistent with the existing precedent that grass density/radius, detail-normal and every road-network knob are debug-GUI-only (lil-gui), not exposed in the player-facing Vue settings screen.

## Verification focus (user, per plan §7)

- Grass: baseline vs `grassFillerCoverage` at a few values (0 / 0.35 / 0.6 / 1), near camera and along a road at distance, watching triangle/instance count and draw calls (filler geometry itself never changes — only its LOD reach — so triangle-count delta should track `fillerFrac` directly).
- Road: baseline (`surfaceDetailEnabled=false`) vs on, at a few `rutDepth`/`microBumpStrength` values, close-up on a road segment; confirm no seams at chunk boundaries and that paths (`pathHeightStrength`) stay visibly flatter than roads.
- Combined on/off matrix per plan §7.

**Zrób git commit i push do main, rebase jeżeli trzeba**
