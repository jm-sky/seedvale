# Seedvale — Terrain & World Generation

**Purpose:** current-state reference for how the procedural terrain, its streaming/instancing pipeline, and the world-time systems anchored to it (weather/seasons, surface wetness/snow) work today.

**Not:** a rendering/visual-contract log (that's [GRAPHICS.md](../architecture/GRAPHICS.md) — shader/material *why*), the ocean/lake/river domain (that's [WATER.md](../state/water.md)), a plan (that's [plans/](../plans/README.md)), or the whole-codebase snapshot (that's [STATE.md](../STATE.md)).

**Last verified:** 2026-08-22

When this file and the code disagree, the code wins — update this file.

---

## Chunk streaming & terrain generation

- Procedurally chunked terrain (macro continental bias + ridges, hills/valleys, softened detail FBM), generated on a worker pool with load/unload radii and pinned home chunks.
- `ChunkManager.update()` spends one finalize slot per frame on either a terrain mesh or vegetation/environment content (mesh takes priority) so streaming doesn't spike the main thread; `CHUNKS_STARTED_PER_FRAME` caps how many new chunk generations can start per frame (it does not cap finalization).
- GLB prop templates preload when `ChunkManager` is constructed, so template parsing happens off the streaming hot path.
- Shore sand band varies in world space; grass thins into mountain foothills; road corridors are a soft tint + dirt micro-contrast baked onto the terrain mesh (grass soft-fades in a corridor, never a hard bald cut — see [GRAPHICS.md](../architecture/GRAPHICS.md) G9).
- `forestDensityAt` (`ChunkManager.sampleForestFactor`) is a single continuous function driving both tree density and fauna habitat — there is no separate forest manager. `forestBiomeAt(forestDensity)` (plan 182) classifies that same continuous reading into `open`/`forest`/`deepForest` (thresholds 0.35/0.72) as one shared discrete world query (`ChunkManager.sampleForestBiome` / `WorldContext.sampleForestBiome`) — not a parallel biome system or a stored per-chunk label.

## Mountains

- Mountain massifs are shaped in `chunkHeightmap.ts`'s `sampleRawTexel()`, tuned (plan 181) toward wider, continuous massifs with softer foothills and fewer sharp noise-driven peaks/pits — overall mountain coverage/amplitude (`mountainGain`/`heightScale`) is unchanged. Exact tuning constants live in `worldConfig.ts`'s `RegionParams` and are not restated here; see plan 181 for the tuning history.
- Waterfalls and full shader/rendering parity between rivers and lake/ocean are not implemented yet ([LOOSE-ENDS](../plans/LOOSE-ENDS.md)).
- Rivers themselves (hydrology, tiling, ribbon geometry, channel carving) are documented in [WATER.md](../state/water.md), not here — they're a water feature, not a terrain-shape one, even though carving does lower the heightmap.

## Vegetation & rocks

- Vegetation and rocks are `InstancedMesh` buckets (`src/render/instancedProps.ts`, chunk-agnostic), batched at **region** granularity (`src/terrain/vegetationRegionBatcher.ts`, plan 143 — `REGION_CHUNKS = 3`, ≈192 m). `ChunkManager` feeds each chunk's placements in on load/unload; the batcher rebuilds only the affected region+kind from the union of its currently-loaded member chunks. Streaming/unload/tree-lifecycle stay chunk-scoped — region granularity is rendering-only. Distance LOD is per-region (max fraction across contributing chunks, "nearest member wins").
- Stage meshes and procedural landmarks stay individual `Object3D`s, not instanced.
- Settlement palisade/bushes/barrels/hay are instanced directly via `instancedProps.ts` with no chunk boundaries, so they were explicitly left out of region batching (plan 143). Harvestable settlement trees stay individual (plan 113).
- Chunk rocks/logs and visible iron/coal/gold deposits use GLB templates with procedural fallbacks.

## Trees

- Species are picked at spawn time (`chunkVegetation.ts`) by a weighted lottery over `envGrowthFactor`/`TREE_SPECIES_PREFS` — the same function that drives lifecycle growth rate, not a separate placement heuristic. Biome, altitude/ridge and a coastal-proximity axis bias species toward habitat; `clumpNoise` dominates the roll so a stand tends to repeat one species.
- Forest-floor undergrowth (`VegetationKind: 'fern'`, own instanced bucket) seeds sparse clusters in dense forest/swamp with a nearby-pine bonus, never a hard requirement.
- Harvested trees' final `stump` stage prefers a GLB stump model over the procedural fallback (mandatory fallback if the GLB fails to load).
- `TreeLifecycle` (`src/world/treeLifecycle.ts`) owns growth/multi-stage-chop/regrowth via sparse per-tree overrides + lazy growth computed from `elapsedDays` — not a per-tree ticking simulation. Player seed planting (plan 126, see [player-systems.md](./player-systems.md)) anchors a new tree into this same lifecycle rather than creating a second one.
- The *derived* stage is always correct for any `elapsedDays`, but an already-loaded chunk's mesh only re-syncs to a newly-derived stage on a chop event or a chunk reload — there is no periodic re-walk of loaded chunks' tree/crop meshes to catch up visually as time passes off-screen. Accepted as-is (visual lag only, no data/correctness impact); revisit only if a concrete case makes the lag noticeable to players.
- Procedural sizeClass/living-age rolls (`chunkVegetation.ts`) skew toward `large`/`old` as `forestDensity` climbs toward the deepForest range (plan 182) — an exponent applied to the roll input, not a change to `rollSizeClass`'s/`rollLivingAge`'s own global weights, so open/weak-forest land keeps the original unbiased distribution. `meadowNoise` (the same field driving flower patches) also softly thins tree-acceptance density inside dense/deep forest, forming irregular clearings without a new noise field. `chunkEnvironment.ts`'s `fallenLog` chance now scales with `forestDensityAt`, not the coarse `biomeWeightsAt(...).forest` remainder.

## Weather & seasons

- `Season`/`WeatherState` (`world/weather.ts`, plan 040) are **deterministic pure functions** of `(worldSeed, elapsedDays)` — no runtime history, no save field. Any `elapsedDays` (including after a time-skip or reload) re-derives the same result:
  - `getSeason`/`getSeasonProgress` — fixed-length seasons (`DAYS_PER_SEASON`).
  - `computeWeather` — per-season weighted odds, hashed per fixed-length weather "cycle" (`WEATHER_CYCLE_DAYS`).
  - `computeClimate` composes both into `WorldClimateState`.
- `ClimateState`/`tickClimate` is a small mutable runtime cache around those pure functions (mirrors `DayNightState`'s shape): it only recomputes `weather` when `elapsedDays` crosses into a new cycle, plus a debug-only `forced` override (lil-gui) that is never persisted.
- Visuals: `world/weatherVisuals.ts` dims sun/ambient/hemi and adjusts fog on top of day/night. `world/weatherParticles.ts` renders rain/snow as GPU-driven `THREE.Points` (per-particle fall/drift computed in a shared shader from a fixed-at-creation attribute + `uTime`; JS only updates a few uniforms) — density follows weather intensity and the `quality.lodScale` graphics preset. The rain/snow shape contract (thin vertical streak vs. full sprite) is [GRAPHICS.md](../architecture/GRAPHICS.md) G13, not restated here. Weather → NPC/fauna/resource coupling is not implemented.

## Surface weather effects (wetness/snow)

- Wetness/snow cover (`world/weather.ts`'s `computeSurfaceWeather`, plan 133) are pure, bounded-lookback derived values from `(seed, elapsedDays)` — no per-chunk state, no save field. Rain raises wetness; snow accumulates and melts (temperature-gated) back into wetness.
- Pushed as two uniforms (`uWetness`/`uSnowAmount`) onto the shared terrain `MeshStandardMaterial`, read in-shader against `vBareGround`/`vSlopeUp` and low-frequency noise for puddle/snow breakup. Desert/beach aren't separately distinguished from roads/dirt since `vBareGround` doesn't encode that split.

## Slope movement constraint

- `terrain/slopeConstraint.ts` (plan 183) is a pure, shared finite-difference slope probe that scales down (35°–55°, smoothstep) and then fully removes the **uphill** component of a moving agent's per-frame XZ step; across-slope and downhill movement are never affected. One shared mechanism, called once per moving frame from `PlayerController.update()`, `NpcAgent.steerTo()` and `AnimalAgent.steerToward()` — no navmesh, no new physics.

## Entry points

```text
src/terrain/chunkManager.ts
src/terrain/chunkHeightmap.ts
src/terrain/chunkEnvironment.ts
src/terrain/chunkVegetation.ts
src/terrain/vegetationRegionBatcher.ts
src/terrain/slopeConstraint.ts
src/render/instancedProps.ts
src/world/treeLifecycle.ts
src/world/weather.ts
src/world/weatherVisuals.ts
src/world/weatherParticles.ts
src/config/worldConfig.ts
```

Rivers/hydrology entry points live in [WATER.md](../state/water.md).
