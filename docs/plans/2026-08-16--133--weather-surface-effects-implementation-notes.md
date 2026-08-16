# Implementation notes — plan 133 (Weather Surface Effects)

**Reviewed:** 2026-08-16
**Plan:** `docs/plans/2026-08-16--133--weather-surface-effects.md`
**Status:** review complete; feature not implemented

## Review verdict

Plan 133 fits the current architecture, but several details should be tightened before implementation. The strongest direction is correct: extend the existing shared terrain material/shader and the deterministic weather model; do not add per-chunk surface state, puddle objects, snow meshes, or another manager.

The main correction is that `wetness` / `snowAmount` should not be invented as ad-hoc render state. They should be pure derived values from the existing `(seed, elapsedDays)` climate timeline, exposed to the **single shared terrain material** as uniforms. The shader should only perform spatial masking and surface appearance.

The current weather implementation is explicitly deterministic: season/weather are pure functions of `(seed, elapsedDays)`, with 0.3 world-day weather cycles, and no weather save field. `ClimateState` is only a runtime cache and is not persisted. This is the correct foundation to extend.

## Existing mechanisms to reuse

### Terrain material and shader

`src/terrain/buildChunkGeometry.ts` is the correct integration point.

- All chunks use one shared `MeshStandardMaterial`; surface differences are vertex attributes, not per-chunk materials.
- `onBeforeCompile` already injects world-space terrain shading.
- `vWorldPos` is already available in the fragment shader.
- `vBareGround` is already available through `aBareGround`.
- `terrainValueNoise()` already provides cheap procedural world-space value noise with no texture sample.
- `roughnessFactor` is already modified in the terrain shader.
- `uWaterLevel` already exists.
- `customProgramCacheKey()` explicitly keeps the injected terrain program shared across chunks.

Do not create another terrain material, another shader injection layer, another texture mask, or per-chunk uniforms. Add the minimum additional uniforms/code to this existing injection.

`aBareGround` is derived in `buildChunkGeometry()` from road tint, shore/sand band and desert biome weight. This already covers roads, village clearings, beaches/sand and desert as a surface classification mechanism. It should be reused rather than adding a second "surface type" attribute.

### Weather

`src/world/weather.ts` remains the source of truth.

Current facts:

- `WeatherType`: `clear`, `cloudy`, `rain`, `fog`, `snow`.
- `WeatherState` contains `type`, `intensity`, `temperature`, `startedAt`, `endsAt`.
- Weather is deterministic per fixed 0.3-day cycle.
- Temperature is already deterministic from season + weather.
- There is no persisted weather history.

If additional deterministic surface derivation is needed, extend the existing weather module with a **pure helper**, rather than creating `SurfaceWeatherManager` / `WetnessManager` / `SnowManager`. The helper may inspect a bounded number of deterministic weather cycles to derive recent rain/snow influence. It must not own mutable per-chunk state.

### Weather visuals / particles

`src/world/weatherVisuals.ts` already owns weather-driven light/fog. It should remain unchanged unless a tiny shared update hook is needed to push the derived surface uniforms.

`src/world/weatherParticles.ts` is already GPU-driven: fixed particle buffers, shader-driven motion, a few uniform writes and no per-particle CPU loop. Plan 133 must not modify this renderer. Surface effects are complementary to particles, not a reason to rebuild them.

## Recommended derived surface model

The implementation should keep the distinction:

```text
world clock + seed
        ↓
existing deterministic weather
        ↓
pure surface-weather derivation
        ↓
shared terrain uniforms
        ↓
terrain fragment shader
        ↓
spatial masks + albedo/roughness
```

No per-chunk state is required.

### Wetness

Do not make `wetness` equal simply to `weather.type === 'rain'`.

A rain cycle must raise wetness and a subsequent dry period must decay it. Since the weather timeline is deterministic, derive the value from the current `elapsedDays` and recent deterministic cycles.

A practical implementation should use a bounded recent-weather window rather than scanning an unbounded history. The maximum drying window should be a named constant in the existing weather module. A simple linear/smooth decay is sufficient; this is visual presentation, not soil hydrology.

Recommended shape:

- active rain: wetness rises toward a rain/intensity-dependent target;
- immediately after rain: retain high wetness;
- dry/cloudy/fog: decay gradually;
- clear for longer than the drying window: 0;
- snow should not automatically count as rain, but snow melt can feed the same wet-ground visual path.

Avoid requiring a new persisted `lastRain` field. If an implementation needs a "last rain" timestamp internally, derive it from `(seed, elapsedDays)` rather than storing it in `SaveData`.

The uniform is global/shared, not per chunk. Updating one or a few material uniforms is cheap and does not interact with chunk streaming.

### Snow amount

`snowAmount` should likewise be deterministic and global.

Do not simulate snow depth per chunk. Derive a bounded visual coverage factor from deterministic snow weather duration/intensity plus melt conditions.

The useful state is effectively:

```text
snow accumulation → retained cover → temperature/time driven melt
```

not a physical snow-volume simulation.

A practical model can accumulate coverage while deterministic snow cycles continue, then reduce it after snow ends according to `temperatureFor(...)`. Keep the result clamped to `[0,1]`.

Important: a shader-only snow layer can cover the terrain surface, but it **cannot cover separate grass blade geometry** unless `src/terrain/grass.ts` is also modified. Plan 133 currently says the existing terrain shader should be the integration point and explicitly avoids unrelated systems. Therefore the implementation should define "grass partially covered" as **snow visible through/between grass over the terrain**, unless the plan is deliberately expanded to modify the grass shader. Do not silently add that expansion.

## Terrain shader spatial masks

### Puddle mask

The proposed world-space noise approach is appropriate, but `vBareGround` alone is insufficient for puddles: it does not encode slope.

Use existing geometry normals / slope information in the fragment shader. The vertex path already computes slope while building geometry, but there is no slope varying today. Prefer the cheapest available fragment-space normal/up relationship rather than adding a new per-vertex attribute if the resulting normal is suitable for the mask.

The puddle mask should be approximately:

```text
wetness
× bare/acceptable surface mask
× flatness mask
× world-space noise threshold
× exclusions
```

Use one or two existing `terrainValueNoise()` evaluations at a scale large enough to read as irregular patches, not fine grain. Do not add a new noise texture.

### Surface classes

Recommended behaviour:

- roads / village clearings: allowed, with moderate puddle strength;
- exposed dirt: allowed;
- short/low vegetation: optional weak contribution only if it looks useful;
- beaches: mostly wet-sand response, not obvious inland puddles;
- desert: strongly suppress puddles; rain can still produce a short-lived dark/wet response;
- steep slopes: suppress puddles strongly;
- underwater terrain: suppress completely;
- existing water meshes: never try to overlay puddles on water.

`aBareGround` already contains road, shore and desert information. Reuse it, but add explicit exclusions/modulation instead of assuming every bare surface should become a puddle.

### Wet ground appearance

The current terrain material starts at roughness `0.92` and already modifies roughness through `MACRO_ROUGHNESS_CHUNK`. Wetness should reduce roughness modestly and darken albedo. It should not introduce a physically expensive reflection system.

Do not add screen-space reflections, cube maps, planar reflections, additional normal maps or another render pass for puddles. A small specular response from the existing `MeshStandardMaterial` is enough.

The effect should remain recognisable primarily through darker albedo + lower roughness. "Reflection" should be a consequence of existing lighting, not a new reflection feature.

## Snow shader appearance

Snow should be a blend of the existing terrain albedo toward a snow colour/value, modulated by:

- `snowAmount` global uniform;
- surface flatness;
- existing `vBareGround` / biome information where useful;
- a low-amplitude world-space noise mask for natural breakup.

Flat terrain should receive more cover; steep terrain should receive less.

Do not use displacement. Do not alter chunk geometry when weather changes. This is especially important because `buildChunkGeometry()` is one of the known main-thread costs in chunk streaming.

A simple slope factor such as a smoothstep over `normal.y` is preferable to adding CPU-generated snow attributes to every vertex.

## Melting → wet ground

The desired visual sequence is valid, but it should be understood as **one derived rendering state**, not five simulation states:

```text
snow cover ↓
      └── melt contribution → wetness ↑
```

When temperature is below freezing, melting should be strongly suppressed. Near/above freezing, snow coverage can decrease over the configured melt duration. The existing `WeatherState.temperature` is sufficient; do not introduce another temperature system.

The implementation should avoid a discontinuity when snow reaches zero: residual melt contribution should feed the same wetness curve until it decays.

## Chunk streaming impact

The feature should have effectively zero chunk-streaming CPU impact.

`buildChunkGeometry()` currently performs a per-vertex loop, including height sampling, normals, biome/region sampling, colour and `aBareGround`. Plan 119 identifies this mesh build as a significant source of streaming hitches. Therefore weather surface state must **not** cause chunks to rebuild when weather changes.

Required invariant:

- weather change → uniform update only;
- chunk load → normal existing geometry build only;
- chunk unload → normal geometry disposal only;
- no weather-driven geometry rebuild;
- no new per-chunk arrays for wetness/snow;
- no new chunk lifecycle stage;
- no extra draw calls.

Because the terrain material is shared, a weather change should affect all currently loaded chunks automatically, including chunks loaded later. This is an important reason not to bake wetness/snow into vertex colours.

## Shader / GPU cost

The current terrain shader already performs multiple world-space value-noise evaluations for macro colour, meadow variation, dirt grain, roughness, plus optional normal-map work. Plan 133 should therefore be conservative about adding noise.

Recommended budget:

- reuse `terrainValueNoise()`;
- prefer one low-frequency puddle noise and one low-frequency snow breakup noise;
- avoid extra octave stacks / FBM for these effects;
- avoid texture samples for masks;
- avoid loops in the fragment shader;
- avoid branches based on weather type where a scalar uniform can select/blend the effect;
- keep all new masks based on values already available in the shader where possible.

The shader program remains shared through `customProgramCacheKey()`. If new uniforms/code are added, update the cache-key version intentionally so Three.js cannot reuse an incompatible program.

The real performance risk is fragment cost over every visible terrain fragment, not chunk count. The effect should therefore be benchmarked at the existing terrain-heavy scenarios and on a lower-quality device/preset.

## CPU / uniform update strategy

Do not add per-frame/per-chunk surface state.

A small number of shared uniform writes per frame is acceptable if needed, but preferable is to update the surface uniforms only when their deterministic source values change materially. The existing weather system already follows this philosophy: weather is cached and replaced at cycle boundaries rather than recomputed every frame.

A good implementation should make the CPU work approximately:

```text
pure surface derivation: O(number of recent weather cycles)
shared uniform writes: O(1)
per chunk state: O(0)
per particle state: O(0)
```

Do not make the shader independently reconstruct a long weather history from `seed` every fragment. That would move a cheap CPU derivation into an extremely expensive fragment operation.

## Edge cases

### Water / lakes / ocean

Water is a separate existing rendering system. Puddles must not compete visually with it.

- suppress puddles at/below the water level;
- retain the existing near-water wet-sand behaviour already injected by `WET_SAND_CHUNK`;
- do not modify `createWater.ts` / water shaders as part of this plan;
- do not create a puddle layer over water.

### Beaches

`aBareGround` intentionally identifies the shore/sand band. Use it for sand tiling and wet-sand response, but avoid making the entire beach look like a collection of puddles after every rain. Prefer stronger wet darkening and a low puddle probability.

### Roads and clearings

Roads and village clearings already contribute to `roadTint` and therefore `aBareGround`. They are good puddle candidates because they are relatively exposed. Do not add another road mask.

### Steep slopes

Both puddles and snow need slope suppression, but with different strengths. Snow can remain visible on moderate slopes while puddles should disappear earlier.

### Desert

Desert is already represented in biome weights and `aBareGround`. Do not exclude all desert wetness: a short darkening after rain can be visually valuable. Suppress persistent puddle coverage strongly.

### Season transition / snow

Weather can jump across season boundaries because it is directly derived from `elapsedDays`. The surface derivation must handle a large time skip/reload without replaying every weather cycle and without creating a transient wrong state.

This is especially important because plan 040 explicitly guarantees direct re-derivation after time-skip/save-load.

### Forced weather debug override

`ClimateState.forced` is debug-only and not persisted. Surface visuals should follow the effective `climate.weather` value while the override is active. Returning to `auto` must immediately restore deterministic surface derivation, just as it restores deterministic weather.

Do not persist the debug override or surface state.

## Plan corrections recommended before implementation

1. Explicitly state that `wetness` and `snowAmount` are **global derived render inputs**, not per-chunk state.
2. State that the pure derivation belongs with the existing weather/climate code, not in a new surface manager.
3. Clarify that a bounded recent-cycle lookup is allowed for deriving recent rain/snow influence, while no history is persisted.
4. Replace the implication that `vBareGround` itself provides puddle flatness; slope must be derived separately in the shader.
5. Clarify that puddles are a modulation of terrain shading, not separate objects.
6. Clarify that terrain-shader-only snow cannot coat separate grass blade geometry. Keep grass-blade snow out of this plan unless deliberately expanded.
7. Add explicit water-level suppression and desert/beach modulation to the puddle requirements.
8. Require the existing shared material/program cache-key strategy to remain intact.
9. Add a shader-cost verification criterion: compare terrain fragment cost in clear/rain/snow, not only FPS.
10. Add verification for large elapsed-time jumps and save/load determinism, because this is a key architectural property of plan 040.

## Suggested implementation values

These are starting points, not final visual tuning:

- wetness drying window: roughly **0.5–1.0 world day**;
- rain accumulation target: intensity-weighted, reaching a strong wet state within roughly one rain cycle rather than requiring hours of rain;
- puddle threshold: use a low-frequency noise mask with broad patches, not high-frequency dirt noise;
- puddle flatness: strongly favour surfaces near horizontal; suppress before snow's slope threshold;
- puddle roughness reduction: modest, approximately **0.15–0.30** from the current material response rather than forcing near-zero roughness;
- snow coverage: allow full visual coverage on flat exposed terrain after sustained snow, but keep noise/slope modulation subtle;
- snow melt: noticeably slower than one weather cycle so snow survives a short `snow → clear` transition;
- all derived values clamped to `[0,1]`.

The exact values must be validated visually; the codebase currently provides no measured calibration for wetness/snow because these effects do not exist yet.

## Verification

Technical:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Tests should cover the pure surface derivation if it is added to `weather.ts`:

- same `(seed, elapsedDays)` → same wetness/snow values;
- different elapsed times across rain/clear/snow cycles → expected monotonic accumulation/decay;
- large time skip → direct correct result, no replay dependency;
- save/load-equivalent reconstruction → same result;
- forced weather → visual inputs follow override and return to deterministic values after `auto`.

Browser/manual verification remains required for visual correctness. Use the existing weather debug override rather than waiting for natural weather.

Check at minimum:

- rain on grass, exposed dirt, road, clearing and beach;
- rain on steep terrain;
- rain in desert;
- rain → clear → dry;
- snow on flat/moderate/steep terrain;
- snow → clear → melting → wet → dry;
- season boundary and a large time skip;
- chunk streaming while rain/snow is active;
- newly streamed chunks matching already-loaded chunks without a rebuild;
- no WebGL/shader errors;
- low-quality/LOD preset.

Performance verification should use the existing performance/debug workflow. Do not create a second benchmark system just for plan 133. Compare clear vs rain vs snow and record terrain/GPU frame-time impact where the existing instrumentation allows it. Plan 040's weather benchmark is still open, so do not describe weather performance as previously benchmarked.

## Bottom line

Proceed with the existing architecture, but keep plan 133 explicitly as a **shared terrain-shader visual effect driven by deterministic weather-derived uniforms**. The feature should add no persistent state, no per-chunk updates, no geometry rebuilds, no puddle/snow objects and no new rendering pass. The main implementation risk is unnecessary fragment-shader complexity; the main architectural risk is accidentally turning deterministic weather history into mutable surface state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
