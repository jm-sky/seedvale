# Plan: Seasonal ground and grass appearance

**Created:** 2026-09-04
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `terrain` `vegetation` `rendering`
**Tags:** `seasons` `snow` `grass` `shader`
**Roadmap:** -

## Goal

Make the ground and grass visibly follow the world climate so seasonal change is readable directly from the landscape, while reusing the existing deterministic season/weather and surface snow mechanisms.

The effect should be continuous rather than a hard palette swap at season boundaries:

- spring — fresher, more saturated vegetation and damp/earthy ground,
- summer — mature green vegetation and relatively warm/dry ground,
- autumn — progressively yellow/brown vegetation and cooler/darker earth,
- winter — muted/dormant vegetation and cold ground,
- accumulated snow — progressively covers/tints both ground and grass independently of the base seasonal palette.

## Current state / recon

The required world-state mechanisms already exist and should remain authoritative:

- `src/world/weather.ts`
  - `Season`, `getSeason()` and `getSeasonProgress()` derive the current season from `elapsedDays`.
  - `computeClimate()` exposes the current `WorldClimateState`.
  - `computeSurfaceWeather()` derives global `wetness` and `snowAmount` (`0..1`) from deterministic bounded weather history.
- Terrain already receives surface-weather presentation through shared material uniforms (`uWetness` / `uSnowAmount`) and applies snow/wetness without storing per-chunk weather state.
- `src/terrain/grass.ts` owns the shared grass rendering/material pipeline and currently has day/night visual updates, but seasonal/snow appearance is not part of its public visual state.
- Grass remains per-chunk rendering data, so climate changes must update shared material/uniform state rather than rebuild placements or regenerate chunks.

This plan extends those mechanisms. It must not introduce a second season clock, per-chunk snow state, a parallel vegetation-season system, or climate-driven geometry regeneration.

## Scope

### 1. Shared seasonal appearance derivation

Add a small pure presentation-layer derivation that converts existing climate state into continuous visual parameters suitable for terrain and vegetation.

It should:

- use the existing `Season` + `seasonProgress`,
- interpolate toward the next season instead of switching colors abruptly,
- expose only rendering-oriented values (for example ground/vegetation tint factors or compact palette inputs),
- remain deterministic for a given world time,
- avoid becoming gameplay-authoritative climate state.

Prefer one shared seasonal appearance representation consumed by terrain and grass rather than separate hard-coded season tables in both renderers.

### 2. Seasonal ground coloration

Extend the existing terrain material/shader path so terrain coloration responds to the shared seasonal appearance.

Requirements:

- preserve existing biome, road, sand/coast, mountain and terrain-detail coloration rather than replacing it with a flat season color,
- apply seasonal tint as a controlled modulation of the existing result,
- keep wetness and snow effects composable with the seasonal base,
- avoid obvious color discontinuities at chunk boundaries,
- do not rebuild terrain geometry when the season progresses.

The seasonal effect should be strongest where the surface visually represents soil/vegetated ground and restrained where existing material identity should dominate (for example rock, sand or road surfaces), using existing terrain signals where practical rather than introducing a new biome mask solely for this feature.

### 3. Seasonal grass coloration

Extend `src/terrain/grass.ts` so all grass buckets, including near-field filler, consume the same seasonal vegetation appearance.

Requirements:

- preserve existing species variation instead of forcing every blade to one exact color,
- spring/summer/autumn/winter should modulate the species' existing base colors,
- changes should update through shared uniforms/material state and not through per-instance CPU writes,
- day/night lighting behaviour must continue to compose with seasonal coloration.

### 4. Snow on grass

Feed the existing `computeSurfaceWeather().snowAmount` into grass presentation.

Snow should progressively desaturate/lighten exposed grass as coverage increases. It does not need physical snow geometry or per-blade accumulation.

The same global snow amount used by terrain should drive the grass effect so ground and vegetation cannot visually disagree about whether snow is present.

### 5. Runtime wiring

At the existing world/render update boundary, derive the visual state once and push it to terrain and grass.

Prefer APIs shaped around visual state updates (for example `setClimateAppearance(...)`) over individual calls scattered across the game loop.

No renderer should independently call `computeClimate()` or maintain its own season progress.

### 6. Debug tuning

Where the existing lil-gui climate/weather controls already allow forcing season/weather, ensure they remain useful for quickly comparing:

- all four seasonal palettes,
- transitions near season boundaries,
- `snowAmount` from none to heavy coverage,
- snow combined with each seasonal base appearance.

Do not add a permanent second climate-control UI solely for this plan.

## Constraints / architecture

- Existing `world/weather.ts` remains the single source of truth for season/weather/surface snow.
- Seasonal appearance is presentation state, not persisted simulation state.
- Do not add per-chunk seasonal state or per-instance grass color updates.
- Do not regenerate terrain, vegetation placement or grass geometry as seasons change.
- Keep GPU work bounded to a few shared uniforms / simple shader operations; no additional draw calls should be required for the base implementation.
- Preserve deterministic time-skip/save-load behaviour: visual state must be derivable immediately from current world time.
- Reuse existing shader/material hooks and terrain masks where possible instead of adding a parallel material system.
- Important new public/architectural functions should receive concise JSDoc where useful for preflight discovery, using `@domain world-terrain` where appropriate.

## Non-goals

- Snow depth geometry, footprints, tracks or deformable snow.
- Snow accumulation per chunk/object/blade.
- Seasonal replacement/removal/regrowth of grass geometry.
- Tree leaf color/leaf loss or seasonal tree models.
- Crop growth changes, forage availability or other gameplay consequences of seasons.
- Seasonal animal/NPC behaviour.
- New weather generation or temperature simulation.
- Full biome/material redesign.

These can build on the same climate state later without expanding this rendering-focused plan.

## Suggested implementation shape

Keep ownership approximately:

```text
world/weather.ts
  existing authoritative climate + surface weather
            │
            ▼
seasonal appearance derivation (pure rendering state)
            │
       ┌────┴────┐
       ▼         ▼
terrain       grass
shader        shared material uniforms
```

Exact file placement should follow the current material/shader ownership found during implementation recon; do not move unrelated rendering code merely to match this diagram.

## Verification

### Automated

- Typecheck/build passes.
- Add focused unit tests for any new pure seasonal interpolation helper:
  - deterministic output,
  - expected season endpoints,
  - continuity across season boundaries,
  - bounded output values.
- Existing weather/surface-weather tests continue to pass unchanged unless an API is intentionally extended.

### Browser / manual

Player verifies in browser using existing climate/weather debug controls:

1. Ground and grass are clearly distinguishable across spring, summer, autumn and winter.
2. Transition around every season boundary is smooth; no one-frame/full-palette jump is visible.
3. Snow progressively affects both terrain and grass and they remain visually coherent.
4. Existing wet-ground appearance still reads correctly after rain and snowmelt.
5. Roads, beaches/sand, rocks/mountain surfaces and biome variation retain their identity instead of becoming uniformly tinted.
6. Near/far grass and filler grass do not visibly switch to inconsistent seasonal colors as LOD changes.
7. Chunk streaming/reload does not reset or mismatch seasonal appearance.
8. No noticeable new frame hitch or chunk-generation cost appears while season/snow values change.

## Follow-up opportunities

Once this shared appearance path exists, separate future plans can reuse it for tree foliage/leaf loss, crops, snow on props/roofs, ecosystem forage pressure or other seasonal consequences. Those systems should consume the authoritative climate rather than extending this plan into a general seasonal gameplay rewrite.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
