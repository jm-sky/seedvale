# Implementation notes: world-029 low-cost lighting and film-grade tuning

**Reviewed:** 2026-09-16  
**Plan:** `docs/plans/world-029-low-cost-lighting-and-film-grade-tuning.md`

## Current code facts

- `src/world/dayNight.ts::skyParamsFromTime(timeOfDay)` is the canonical pure day/night presentation resolver.
  - `elev = sin((timeOfDay - 0.25) * 2π)`.
  - `dayFactor = max(0, elev)`.
  - it returns sun/ambient/hemi intensities plus fog and Sky.js parameters.
  - comments document a previous whiteout regression from excessive Rayleigh; do not retune sky scattering as part of this plan unless a lighting change proves it necessary.
- `src/world/createSky.ts`
  - `setParams()` computes `sunPosition` and currently derives a bounded sun-light color from elevation.
  - it also writes light position/intensity, but `app/gameLoop.ts::applyDayNight()` subsequently writes the canonical `p.sunIntensity`; treat the game-loop/dayNight value as intensity authority.
  - color ownership can remain here because it already follows sun position and is reused by the asset browser.
- `src/world/createLights.ts`
  - one `AmbientLight`, one `HemisphereLight`, one shadow-casting `DirectionalLight`.
  - shadow map is intentionally limited to 512/1024; 2048 was rejected as poor ROI.
  - do not touch shadow frustum/map settings in this plan.
- `src/app/gameLoop.ts::applyDayNight()` order is important:
  1. `skyParamsFromTime`,
  2. weather sky overlay,
  3. `sky.setParams(...)`,
  4. weather fog/light overlay + lightning,
  5. write sun/ambient/hemi intensities,
  6. fog + water/grass/ocean day-night uniforms.
  Preserve this ownership/composition order.
- `DAY_NIGHT_APPLY_THRESHOLD = 1 / 2000` already prevents pointless per-frame visual updates. Do not reduce it for smoother color changes; the existing cadence is the performance contract.
- `src/world/weatherVisuals.ts`
  - weather owns multiplicative `lightScale`, fog tint/range and Sky.js turbidity/rayleigh overlay.
  - storm/rain intentionally darken the base light; do not bake weather assumptions into day/night curves.
- `src/render/gradedOutputPass.ts`
  - film grade is already folded into `OutputPass` after tone mapping/output color conversion.
  - current grade is mild: saturation 1.04, contrast 1.03, soft highlight shoulder, tiny red+/blue- shift and Bayer dither.
  - tuning these constants does not justify another pass or LUT texture.
- `src/render/createPostProcessing.ts` must remain structurally unchanged except tests/comments if required; `filmGradeIntensity` already controls the integrated grade.
- `src/tools/assetBrowser/viewer/createViewerScene.ts` reuses `createLights`, `createSky` and `skyParamsFromTime`, so it is the correct lightweight comparison surface as well as the browser game itself.

## Implementation split inside one session

Implement in this order so grade does not hide lighting mistakes:

1. lighting intensity balance,
2. sun color curve,
3. optional ambient/hemi base-color adjustment,
4. film grade last.

Keep each step as a small isolated diff so the User can identify which part caused a visual regression.

## Lighting curve guidance

Do not redesign `skyParamsFromTime()` or add keyframe state. Reuse `elev` / `dayFactor` and simple bounded interpolation/smoothstep.

The safe target is **more separation**, not globally more brightness:

- midday direct light should remain dominant;
- ambient/hemi may be slightly reduced if the scene reads flat;
- dawn/dusk should gain warmth primarily through directional-light color, not a large intensity spike;
- night minima should not be increased merely to expose detail.

Keep output values finite, non-negative and smooth around horizon crossings. A unit test should compare values immediately around representative boundaries rather than asserting subjective colors.

## Sun color ownership

`createSky.ts::applyParams()` already has the needed elevation signal from `sunPosition.y`. Prefer tuning/replacing only the small RGB interpolation there, using module-level reusable `Color` objects or scalar math if needed.

Do not:

- allocate a new `Color` every update,
- add a second day/night color resolver in `gameLoop.ts`,
- make sun color depend on camera/player,
- fold weather tint into sun color; weather remains the overlay layer.

If the final color logic becomes nontrivial, extract one pure helper in `dayNight.ts` or `createSky.ts` and unit-test it; do not create a new lighting manager.

## Ambient / hemisphere colors

Only tune `createLights.ts` base colors if the browser A/B shows that direct-light tuning alone still leaves shade too warm/flat.

Keep the existing light objects and intensity ownership. This is a constant change, not another runtime curve. Avoid making shadows aggressively blue; N8AO, fog and ACES already affect perceived shade.

## Film grade guidance

Touch only the existing block in `GRADED_OUTPUT_FRAGMENT_SHADER`.

Safe levers:

- small saturation adjustment,
- small contrast adjustment,
- modest highlight shoulder,
- tiny channel bias.

Preserve:

- tone mapping and color-space includes/order,
- `filmGradeIntensity` mixing,
- Bayer dither and its amplitude order of magnitude,
- one `OutputPass` only.

Do not add LUT, extra texture sampling, vignette, chromatic aberration, grain animation or another fullscreen pass.

## Tests

`skyParamsFromTime()` is pure and suitable for Node/Vitest. Add focused tests if no current suite covers these outputs:

- midnight/dawn/noon/dusk all return bounded non-negative intensities;
- noon direct-to-indirect ratio remains stronger than at horizon/night;
- values immediately before/after dawn/dusk are continuous within a small tolerance;
- if sun color is extracted to a pure helper: low elevation is warmer than high elevation without channel values leaving `[0,1]`.

Shader tests should be structural, not visual:

- integrated output shader still contains one texture read of `tDiffuse` for the output path and existing grade/dither block;
- no new sampler uniform/pass is introduced.

Do not attempt screenshot/color correctness assertions in Vitest. WebGL shader compilation and visual acceptance remain browser work by the User.

## Browser verification handed to User

Use consistent camera positions and compare:

- clear 06:00, 12:00, 18:00, midnight;
- rain/storm at day and dusk;
- open terrain, forest edge and settlement street/plaza.

Evaluate in this order:

1. lighting only with conservative/default grade,
2. then final grade.

Reject/tune back if any of these appear:

- white/bleached sky or horizon,
- clipped bright surfaces/bloom halos,
- very blue/purple shaded faces,
- night made unreadably dark,
- weather no longer visibly changes light level,
- film grade hides material differences rather than supporting them.

Performance expectation: steady-state GPU cost is unchanged; CPU impact should be below measurement noise because no new update path is introduced.

> **Zrób git commit i push do main, rebase jeżeli trzeba**