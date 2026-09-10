# Seedvale — Terrain & World Generation

**Purpose:** current-state reference for how the procedural terrain, its streaming/instancing pipeline, and the world-time systems anchored to it (weather/seasons, surface wetness/snow) work today.

**Not:** a rendering/visual-contract log (that's [GRAPHICS.md](../architecture/GRAPHICS.md) — shader/material *why*), the ocean/lake/river domain (that's [WATER.md](../state/water.md)), a plan (that's [plans/](../plans/README.md)), or the whole-codebase snapshot (that's [STATE.md](../STATE.md)).

**Last verified:** 2026-09-08

When this file and the code disagree, the code wins — update this file.

---

## Chunk streaming & terrain generation

- Procedurally chunked terrain (macro continental bias + ridges, hills/valleys, softened detail FBM), generated on a worker pool with load/unload radii and pinned home chunks.
- `ChunkManager.update()` spends one finalize slot per frame on either a terrain mesh or vegetation/environment content (mesh takes priority) so streaming doesn't spike the main thread; `CHUNKS_STARTED_PER_FRAME` caps how many new chunk generations can start per frame (it does not cap finalization).
- GLB prop templates preload when `ChunkManager` is constructed, so template parsing happens off the streaming hot path.
- Shore sand band varies in world space; grass thins into mountain foothills; road corridors are a soft tint + dirt micro-contrast baked onto the terrain mesh (grass soft-fades in a corridor, never a hard bald cut — see [GRAPHICS.md](../architecture/GRAPHICS.md) G9). Near-field surface detail (plan world-terrain-005) — wheel ruts + continuous fine bump/dip roughness — is baked into the same corridor height blend as the pre-existing sparse potholes (`chunkHeightmap.ts`'s `roadCandidate`), independently toggleable via `WorldConfig.terrain.region.roadNetwork.surfaceDetailEnabled`; see [GRAPHICS.md](../architecture/GRAPHICS.md) G18 for why it's baked geometry rather than a shader-only effect.
- `forestDensityAt` (`ChunkManager.sampleForestFactor`) is a single continuous function driving both tree density and fauna habitat — there is no separate forest manager. `forestBiomeAt(forestDensity)` (plan 182) classifies that same continuous reading into `open`/`forest`/`deepForest` (thresholds 0.35/0.72) as one shared discrete world query (`ChunkManager.sampleForestBiome` / `WorldContext.sampleForestBiome`) — not a parallel biome system or a stored per-chunk label.
- Chunk *mesh geometry* data generation (`computeChunkMeshData` — position/normal/color/`aBareGround` arrays) runs in the worker pool, not on the main thread: `ChunkWorkerPool.requestMesh()` dispatches a `'mesh'` job; `ChunkManager.requestChunkMeshData()` serves an in-session `ChunkMeshDataCache` (LRU, byte-budgeted) hit or awaits the worker round-trip, and only then does `buildChunkGeometry()` on the main thread — now just cheap `THREE.BufferGeometry`/`Mesh` assembly from already-computed arrays.

## Terrain shaping stages

`chunkHeightmap.ts`'s `computeChunkTexel()` runs three ordered terrain-modifier stages on the raw procedural texel, each consuming the previous stage's output:

1. `applyRegionalSmoothing()` — broad, weak settlement-driven leveling around a settlement footprint (the mechanism behind "why is the ground near a village suspiciously flat"), applied before anything else.
2. `applyTerrainCorridors()` — sharp road/path/clearing blend, consuming corridor waypoints (`RoadCorridorSegment`) that `settlement/roadNetwork.ts` computes between settlements; emits `roadFalloff` for both the road texture and the river-ford blend below.
3. `applyRiverChannel()` — river channel carving (see [Hydrology / rivers](#hydrology--rivers) below), only ever lowers terrain, consumes stage 2's `roadFalloff` for the ford blend.

## Mountains

- Mountain massifs are shaped in `chunkHeightmap.ts`'s `sampleRawTexel()`, tuned (plan 181) toward wider, continuous massifs with softer foothills and fewer sharp noise-driven peaks/pits — overall mountain coverage/amplitude (`mountainGain`/`heightScale`) is unchanged. Exact tuning constants live in `worldConfig.ts`'s `RegionParams` and are not restated here; see plan 181 for the tuning history.
- Peak/massif height hierarchy (plan 191) is layered on top of the same function: whole-massif amplitude varies with how far the mountain envelope sits past its gate, a handful of dominant peaks per massif get boosted ridge gain (reusing the `mountain` noise handle at a finer frequency) while subordinate ridges stay lower, dominant summits get restrained asymmetric detail (reusing the `hills` handle), and valleys/saddles between ridges deepen via a boosted `hillsTerm`. No new noise handle, worker or config field; `mountainRidge`'s own semantics (connected ridge strength, read by vegetation/rock/biome-color/naturalResources) are unchanged — see the plan's implementation notes for the exact terms/constants.
- Waterfalls are implemented (plan 181, Etap 7 completion, 2026-08-25) as a per-vertex rendering signal on the existing river ribbon — no separate geometry/system. Full shader/rendering parity between rivers and lake/ocean, and hydrology worker offload, remain deliberately deferred ([LOOSE-ENDS](../plans/LOOSE-ENDS.md)).
- Rivers themselves (hydrology, tiling, ribbon geometry, channel carving) are documented in [WATER.md](../state/water.md), not here — they're a water feature, not a terrain-shape one, even though carving does lower the heightmap.

## Vegetation & rocks

- Vegetation and rocks are `InstancedMesh` buckets (`src/render/instancedProps.ts`, chunk-agnostic), batched at **region** granularity (`src/terrain/vegetationRegionBatcher.ts`, plan 143 — `REGION_CHUNKS = 3`, ≈192 m). `ChunkManager` feeds each chunk's placements in on load/unload; the batcher rebuilds only the affected region+kind from the union of its currently-loaded member chunks. Streaming/unload/tree-lifecycle stay chunk-scoped — region granularity is rendering-only. Distance LOD is per-region (max fraction across contributing chunks, "nearest member wins").
- Stage meshes and procedural landmarks stay individual `Object3D`s, not instanced.
- Settlement palisade/bushes/barrels/hay are instanced directly via `instancedProps.ts` with no chunk boundaries, so they were explicitly left out of region batching (plan 143). Harvestable settlement trees stay individual (plan 113).
- Chunk rocks/logs and visible iron/coal/gold deposits use GLB templates with procedural fallbacks.
- Grass (`src/terrain/grass.ts`/`grassPlacement.ts`) is per-chunk, not region-batched. Each grass chunk carries a cheap "filler" bucket (short, few-fin blades, no per-species geometry LOD) alongside the detailed species buckets; `ChunkManager`'s `grassFillerLodFraction`/`grassFillerCoverage` quality knob (plan world-terrain-005, live, no rebuild) controls how far across the grass ring that filler bucket draws — extending visual grass coverage without raising detailed-species instance count.
- Macro meadow colour variation (plan world-terrain-012): `computeChunkGrass()` blends the existing biome-lerped grass tint toward a drier/yellower appearance using one low-frequency, world-space FBM sample per candidate (`grassPlacement.ts`'s `macroMeadowWeightAt()`, own noise salt independent of the species-patch signal), applied before the per-instance HSL jitter. Gated by `WorldConfig.terrain.grass.macroVariationEnabled` (GUI: Grass folder) — `false` skips the sample entirely and reproduces the pre-012 colour path exactly; positions/counts/draw calls are unaffected either way.

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
- Visuals: `world/weatherVisuals.ts` dims sun/ambient/hemi and adjusts fog on top of day/night. `world/weatherParticles.ts` renders rain/snow as GPU-driven `THREE.Points` (per-particle fall/drift computed in a shared shader from a fixed-at-creation attribute + `uTime`; JS only updates a few uniforms) — density follows weather intensity and the `quality.lodScale` graphics preset. The rain/snow shape contract (thin vertical streak vs. full sprite) is [GRAPHICS.md](../architecture/GRAPHICS.md) G13, not restated here.
- Weather → gameplay coupling: the live per-frame `WeatherState` is threaded, once per frame (never recomputed per consumer), from `gameLoop.ts` through `SettlementsManager`/`Settlement.update()` into every `NpcAgent.update()` call, where it competes as the `seekShelter` decision candidate (`ai/weatherPressure.ts` — see [npc.md](./npc.md#decision-architecture)). Separately, `computeRainExposureDays()` (a bounded-lookback derived function over the same weather history) feeds player-garden hydration and sleeping-utility condition decay — two independent lazy consumers of one deterministic weather function, never a second weather simulation.
- `world/clouds.ts` (plan world-terrain-001, cloud variety per plan world-terrain-014) is a bounded/recycled pool (`CLOUD_COUNT = 28`) of `THREE.Sprite` billboards, player-XZ-following, sky-level and independent of `WorldBundle`. Each sprite belongs to a rendering-only `light`/`dense` category (its own texture list + height/scale/drift-speed ranges); `cloudCategoryWeightsFor(weather, season?)` is a pure weighted-selection function used only when a sprite is first assigned or recycled (never a global reassignment on weather change), so a weather transition reads as a gradual population shift. `cloudAppearanceFor(weather, elev)` separately drives coverage (`sprite.visible` threshold) and a shared-material tint/day-night multiply — unaffected by category selection.
- `world/groundFog.ts` (plan world-terrain-014) is a small fixed pool (5) of flattened, mostly-horizontal `PlaneGeometry` cards using `/images/fog/fog-01.png`, sharing the same player-local, `WorldBundle`-independent lifecycle as `clouds.ts`. Object lifetime never changes with weather; only for `weather.type === 'fog'` does `weather.intensity` drive shared-material opacity and the visible-pool fraction. Patches drift within a small area centered on the player and are recycled (new position/scale/rotation, terrain height resampled via a `HeightSampler` callback) only when they leave it — never every frame. Supplements, does not replace, `weatherVisuals.ts`'s global `THREE.Fog`.

## Surface weather effects (wetness/snow)

- Wetness/snow cover (`world/weather.ts`'s `computeSurfaceWeather`, plan 133) are pure, bounded-lookback derived values from `(seed, elapsedDays)` — no per-chunk state, no save field. Rain raises wetness; snow accumulates and melts (temperature-gated) back into wetness.
- Pushed as two uniforms (`uWetness`/`uSnowAmount`) onto the shared terrain `MeshStandardMaterial`, read in-shader against `vBareGround`/`vSlopeUp` and low-frequency noise for puddle/snow breakup. Desert/beach aren't separately distinguished from roads/dirt since `vBareGround` doesn't encode that split.

## Slope movement constraint

- `terrain/slopeConstraint.ts` (plan 183) is a pure, shared finite-difference slope probe that scales down (35°–55°, smoothstep) and then fully removes the **uphill** component of a moving agent's per-frame XZ step; across-slope and downhill movement are never affected. One shared mechanism, called once per moving frame from `PlayerController.update()`, `NpcAgent.steerTo()` and `AnimalAgent.steerToward()` — no navmesh, no new physics.

## Hydrology / rivers

The hydrology simulation, river-tile geometry, and rendering are canonical in [water.md](./water.md) — this domain owns only the terrain-side integration surface:

- River channel carving is stage 3 of [Terrain shaping stages](#terrain-shaping-stages) above (`applyRiverChannel`), consuming stage 2's road `roadFalloff` for the ford blend (`terrain/riverFord.ts`).
- `terrain/riverQuery.ts` exposes an analytical, streaming-independent river-geometry lookup that `settlement/findSettlementSite.ts`/`villagePlanner.ts` consume to hard-reject a settlement site/plot overlapping a live river channel.
- `settlement/roadNetwork.ts`'s corridor waypoints determine where a road crosses a river; the ford itself is emergent terrain deformation, never a separate ford mesh/segment.
- `fauna/createFauna.ts` consumes `ChunkManager.riverShoreDistance` to gate wild spawn and habitat-spawner placement away from river channels.

## World locations

Coarse world-location classification (lakes, mountain peaks, cemeteries, …) consumes this domain's terrain sampling surface (`sampleContinentalnessAt`/`sampleFloorAt`/`sampleHeightAt`/`sampleMountainRidgeAt`) but is a separate, persisted-progression domain, not part of terrain generation — see [world-locations.md](./world-locations.md). Cave interiors are not heightmap features: Cave V2 (`createCaves()`, `src/world/caves/`) is a streamed SDF interior owned by `WorldBundle.caves`, sited by `pickLargeCaveSites()`. Mouth recess carves are `'system'` terrain modifications (replayed every world build, never persisted). Gameplay ground inside a cave is a derived SDF column index (`caveSdfQuery.ts` / `Caves.queryGround`). Wall colliders and third-person camera occupancy use that index's strict occupancy (`caveSdfColliders.ts` / `Caves.occupancyAt`), not the `CaveVolume` proxy — that adapter remains for `definitions()` / location catalog until plan world-terrain-008 Milestone B5. Presentation meshes are extracted off the main thread (dedicated cave worker) and do not gate collider relevance.

## Persistence

Terrain, hydrology, and weather/season are deterministic reconstructions of `(seed, region params / elapsedDays)` — never persisted. The only persisted terrain-adjacent state is a sparse delta over that deterministic base: `SaveData.terrainModifications` (player-caused edits only; system-caused ones like cave carving are filtered out at save and re-derived) and `SaveData.resourceDeposits` (remaining yield per deposit). A separate, disposable persistent worldgen cache (`persistence/worldgenCacheDb.ts`, `(seed, namespace, version, fingerprint) → payload`) is structurally distinct from `SaveData`; its only current namespace is world-location coarse classification (see [world-locations.md](./world-locations.md)) — core terrain/hydrology generation itself has no persistent cache of this kind, only in-session, non-persisted caches (`riverTileCache`, `ChunkMeshDataCache`). See [persistence.md](./persistence.md) for the full classification.

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
src/world/createCaves.ts
src/world/caves/
src/world/weather.ts
src/world/weatherVisuals.ts
src/world/weatherParticles.ts
src/world/clouds.ts
src/world/groundFog.ts
src/config/worldConfig.ts
```

Rivers/hydrology entry points live in [WATER.md](../state/water.md).
