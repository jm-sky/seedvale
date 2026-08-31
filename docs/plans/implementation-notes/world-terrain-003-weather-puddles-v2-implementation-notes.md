# Implementation notes — world-terrain-003 (Weather puddles V2)

**Reviewed:** 2026-08-31  
**Plan:** `docs/plans/world-terrain-003-weather-puddles-v2.md`  
**Status:** implementation recon complete

## Review verdict

The plan is correctly scoped as a small visual follow-up to plan 133. It should modify the existing shared terrain shader only; no new world/weather state, chunk state, geometry, pass, texture or manager is justified.

One important correction to the implementation wording: `MeshStandardMaterial` already supplies the specular response. The implementation should primarily make the puddle material read through **roughness + albedo contrast** and only use existing material properties/lighting; do not introduce a separate specular mechanism.

## Exact implementation surface

### `src/terrain/buildChunkGeometry.ts`

Primary file and owner of the effect.

Relevant symbols:

- `TerrainWeatherUniforms`
- `createTerrainMaterial()`
- `getTerrainNormalMap()`
- `MACRO_NOISE_FUNCS`
- `WET_SAND_CHUNK`
- `WEATHER_SURFACE_COLOR_CHUNK`
- `WEATHER_SURFACE_ROUGHNESS_CHUNK`
- `applyTerrainSurfaceShader()`
- `buildChunkGeometry()`
- `bareGroundWeight()`
- attributes/varyings used by the weather shader: `aBareGround`, `vBareGround`, `vWorldPos`, `vSlopeUp`

Current puddle implementation inside `WEATHER_SURFACE_COLOR_CHUNK`:

- `aboveWater` suppresses the effect near/below the water level;
- `flatUp = clamp(vSlopeUp, 0, 1)`;
- `puddleNoise` combines `terrainValueNoise(vWorldPos.xz * 0.02)` and `* 0.05`;
- `puddleThreshold` moves from 0.88 to 0.42 as `uWetness` rises;
- `puddleShape` uses `smoothstep`;
- `puddleFlat` uses `smoothstep(0.72, 0.95, flatUp)`;
- `puddleBare` derives from `vBareGround`;
- final `puddleAmt` is the product of shape, flatness, bare-ground, above-water and `uWetness`.

Current visual outputs:

- `diffuseColor.rgb *= 1.0 - puddleAmt * 0.4`;
- `roughnessFactor -= puddleAmt * 0.28`.

The V2 change therefore belongs directly around these existing calculations. Do not create a second puddle mask elsewhere.

### Terrain surface classification

`buildChunkGeometry()` creates the existing `aBareGround` attribute once per chunk vertex.

`bareGroundWeight()` combines:

- `roadTint`,
- shore/sand band,
- `biomeWeights.desert`,
- scorch amount.

This is an existing intentionally broad surface signal. V2 should reuse it. Creating a new per-vertex surface attribute would increase geometry memory/build cost and contradict the established architecture.

### Shader program lifecycle

`createTerrainMaterial()` creates one `MeshStandardMaterial` and attaches `weatherUniforms`.

`applyTerrainSurfaceShader()` injects the shader through `onBeforeCompile` and assigns `customProgramCacheKey()`.

The current cache-key versions are:

- `chunk-terrain-surface-detail-v5`
- `chunk-terrain-surface-v5`

The material is shared by chunks. A shader-source change must keep the explicit cache-key strategy and bump the version when necessary so Three.js cannot reuse an incompatible compiled program.

### `src/terrain/chunkManager.ts`

`ChunkManager.setWeatherSurface(wetness, snowAmount)` owns the runtime bridge to the shared terrain material.

Its contract is intentionally tiny: mutate the shared weather uniform values in place. It does not update chunk records or rebuild meshes.

V2 should not change this lifecycle or add puddle-specific chunk operations.

### `src/world/weather.ts`

`computeSurfaceWeather(seed, elapsedDays)` is the existing pure source of `wetness` and `snowAmount`.

Relevant constants include:

- `WEATHER_CYCLE_DAYS`
- `WETNESS_DRY_WINDOW_DAYS`
- `WETNESS_RISE_DAYS`
- `SNOW_ACCUMULATE_WINDOW_DAYS`
- `SNOW_MELT_WINDOW_DAYS`

V2 is shader-only, so this module should not need modification.

### `src/app/gameLoop.ts`

The existing loop derives surface weather after `tickClimate()` and sends the two values through:

`computeSurfaceWeather() → chunkManager.setWeatherSurface()`

This is already the correct integration point. V2 should not add a second update path.

## Existing mechanisms to reuse

- Shared terrain `MeshStandardMaterial`.
- Existing `onBeforeCompile` injection.
- Existing `terrainValueNoise()`.
- Existing `vWorldPos`.
- Existing `vBareGround` / `aBareGround`.
- Existing `vSlopeUp` flatness signal.
- Existing `uWaterLevel`.
- Existing `uWetness`.
- Existing `roughnessFactor` modification.
- Existing Three.js `MeshStandardMaterial` lighting/specular response.
- Existing shader cache-key/version mechanism.
- Existing weather debug override through `ClimateState.forced`.

No new rendering primitive is required.

## Ownership and lifecycle boundaries

`weather.ts` owns deterministic temporal derivation.

`gameLoop.ts` owns feeding the current derived values into the world runtime.

`ChunkManager` owns the shared terrain material instance and exposes the uniform update seam.

`buildChunkGeometry.ts` owns spatial terrain appearance and the fragment-shader implementation.

The shader owns only **spatial presentation**. It must not reconstruct weather history, mutate state, or perform persistence.

Weather changes therefore have this lifecycle:

`elapsedDays → computeSurfaceWeather → shared uniforms → existing terrain shader`

No chunk regeneration occurs.

## Integration constraints

1. Keep `uWetness` and `uSnowAmount` shared uniforms.
2. Do not bake weather into vertex colors.
3. Do not add per-chunk wetness/puddle arrays.
4. Do not rebuild chunk geometry when weather changes.
5. Do not add puddle meshes, decals or draw calls.
6. Do not add another texture for puddle masks.
7. Do not modify water rendering for this plan.
8. Do not modify `weatherParticles.ts`.
9. Reuse `vSlopeUp`; do not add another slope attribute.
10. Keep puddles suppressed by `aboveWater`.
11. Keep the existing `vBareGround` classification rather than introducing a second surface taxonomy.
12. Keep fragment work bounded: no loops, FBM stack or expensive reflection calculation.

## Architectural pitfall: puddle vs wet ground

The current shader has two distinct concepts:

```text
wetGroundAmt → broad wet/dark surface
puddleAmt    → localized water-like surface
```

V2 should preserve that distinction.

Do not simply increase the existing `wetGroundAmt` or globally darken the terrain. That would make the whole terrain wetter without improving puddle readability.

Likewise, do not make the puddle effect so broad that it replaces the wet-ground layer.

## Architectural pitfall: specular

The plan's phrase "wyraźniejszy specular response" should be interpreted through the existing `MeshStandardMaterial`.

The current base material is:

- roughness `0.92`,
- metalness `0.04`.

Reducing roughness for the puddle already increases the existing lighting highlight. Avoid adding a custom specular model or reflection implementation unless browser verification proves the existing response insufficient.

## Architectural pitfall: noise cost

The terrain fragment shader already performs multiple `terrainValueNoise()` calls for macro colour, meadow variation, dirt grain and roughness.

The current puddle mask already has two low-frequency noise evaluations.

V2 should preferably reshape/reuse these calculations rather than stacking additional noise octaves. The visual problem is currently insufficient contrast, not lack of procedural complexity.

## Useful implementation order

1. Inspect the current `WEATHER_SURFACE_COLOR_CHUNK` and `WEATHER_SURFACE_ROUGHNESS_CHUNK` in the target branch.
2. Establish the desired puddle mask ranges using the existing two-noise mask.
3. Separate the localized puddle response into edge/center only if this can be done without another noise evaluation.
4. Tune albedo contrast and roughness using the existing `MeshStandardMaterial` response.
5. Keep `wetGroundAmt` unchanged unless browser comparison shows that the transition needs coordination.
6. Keep `aboveWater`, `puddleFlat`, `puddleBare` and `uWetness` as the existing gating chain.
7. Bump the explicit terrain shader cache key if the injected source changes.
8. Run typecheck/build/tests.
9. Browser-test with forced rain at several wetness levels before changing more shader logic.
10. Only after visual verification consider parameter tuning; do not introduce new systems to solve a visibility problem.

## Important current limitation

The existing `vBareGround` signal deliberately folds roads, shore/sand and desert into one broad scalar. Therefore V2 cannot reliably express:

```text
road       → many puddles
beach      → mostly wet sand
desert     → rare/short-lived puddles
```

as three independent rules without introducing more surface information.

Do not solve this inside V2 by inventing another heuristic from unrelated shader values. If browser verification shows that beach/desert puddles are wrong, record it as a follow-up requiring a deliberate surface-classification decision.

## Verification implications

The existing plan's browser matrix is appropriate, with emphasis on:

- medium/high `uWetness`;
- typical gameplay camera distance;
- flat roads/clearings;
- flat exposed terrain;
- moderate and steep slopes;
- beach/desert as known broad-class cases;
- rain → clear drying transition.

The key visual test is not whether the terrain becomes darker. It is whether the localized patches are immediately readable as **thin water sitting on the ground**.

Performance verification should focus on terrain fragment cost. Since no new draw calls/chunk work should be introduced, a regression would most likely come from additional fragment-shader instructions/noise evaluations.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
