# Implementation notes: N8AO / post-process cost budget

## Current ownership and seams

- `src/render/createPostProcessing.ts` owns the live `N8AOPass` instance and is the only production seam that should mutate N8AO runtime configuration.
- `src/config/worldConfig.ts` owns persisted/default post-processing config.
- `src/config/qualityProfiles.ts` owns named quality presets and the live knobs that decide whether a config still matches `Low` / `Medium` / `High` instead of becoming `Custom`.
- `src/ui/createDebugGui.ts` already exposes `aoQuality`; do not create a second AO-only debug/preset system.
- `src/perf/isolationProbe.ts` already provides `no-ao`, full post-processing bypass and GPU timestamp separation when available. Reuse it as the baseline diagnostic seam.

## Important current facts

`createPostProcessing.ts` is already materially optimized:

- `N8AOPass` doubles as the scene render pass while AO is enabled; `RenderPass` is only enabled when AO is off. Do not add another scene render pass for comparison/configuration.
- `aoPass.configuration.halfRes = true` already.
- `aoPass.configuration.depthAwareUpsampling = true` already.
- `gammaCorrection = false` because `OutputPass` owns tone/output conversion.
- `autoDetectTransparency` and `configuration.transparencyAware` are driven by `aoTransparencyAware`; current default is `false` because the old transparency-aware path was already measured as extremely expensive.
- `applyFrameBudget()` is intentionally a no-op after the old frame-time AO on/off budget caused visible oscillation/flicker. Do not revive that mechanism.

`qualityProfiles.ts` currently sets:

- `Low`: AO off, `aoQuality: 'Performance'`, pixel-ratio cap 1.0.
- `Medium`: AO on, `aoQuality: 'Performance'`, pixel-ratio cap 1.5.
- `High`: AO on, `aoQuality: 'Performance'`, pixel-ratio cap 2.0.

Therefore **High is not currently expensive because it uses N8AO's `High`/`Ultra` quality mode**. Both Medium and High already use the cheapest named N8AO mode. The main High-vs-Medium post cost difference can also come from the higher compositor pixel count (`pixelRatioCap`), so do not attribute the full High cost to `aoQuality`.

Current defaults in `worldConfig.ts` are `aoRadius = 2`, `aoIntensity = 3`, `aoQuality = 'Performance'`, `aoTransparencyAware = false`.

## Diagnostic strategy

The first implementation step should be a **bounded AO tuning matrix**, not a production quality change.

Reuse `?benchmark=settlement-heavy` as the primary case and `?benchmark=stream` as the secondary case. Keep scene, seed, camera/scenario, quality preset and browser/device pixel ratio fixed between variants.

Minimum comparison:

1. current High baseline,
2. `no-ao` isolation control,
3. current AO with one cheaper internal configuration,
4. current AO with one second cheaper internal configuration only if variant 3 shows a meaningful win without obvious visual loss.

Prefer GPU elapsed from the existing isolation timer when available; retain `RENDER` wall-clock as the stable cross-run metric. Do not infer isolated AO CPU time from `RENDER` alone.

### Minimal temporary tuning seam

Do not add a general profiler. The smallest useful seam is to make the few N8AO parameters under test explicit in `createPostProcessing.ts`, ideally through a tiny pure config resolver/helper that can be unit-tested. The benchmark/debug path may temporarily select a variant, but production should end with at most one additional preset-owned knob/set of resolved values if the measurement justifies it.

If N8AO 2.0.1 exposes the candidate setting only through `configuration`, use that existing API. Do not patch/fork the dependency or reach into private renderer internals.

## Candidate order

Because named `aoQuality` is already `Performance`, inspect the installed N8AO 2.0.1 configuration surface before coding and test candidates in this order:

1. **AO internal resolution scale / half-resolution-related controls** beyond the existing boolean `halfRes`, if the installed API exposes a supported cheaper mode without disabling AO.
2. **Denoise/sample-count controls** used by `Performance` mode, only if publicly configurable after `setQualityMode()`.
3. A small profile-specific AO parameter set for `High`/`Medium` if the cheaper values are visually acceptable.
4. Depth reuse only if N8AO 2.0.1 and the current composer expose a supported, bounded integration. Do not build a parallel depth-prepass pipeline just for this plan.

Do not spend time retesting `transparencyAware = true`; the repository already contains a strong historical measurement showing it adds two extra scene passes and is intentionally off by default.

## Config/preset integration

Only promote a measured AO tuning value into `WorldConfig` / `QualityKnobs` if it must vary by quality profile or be user-adjustable.

If one fixed internal value is clearly better for all AO-enabled profiles, keep it local to `createPostProcessing.ts`; avoid expanding persisted config for no user-visible reason.

If profile-specific values are needed:

- extend `WorldConfig['postProcessing']` and `QualityKnobs` together,
- update `QUALITY_PRESETS`, `knobsFromConfig`, `knobsMatch`, `applyQualityKnobs`, persistence/default fixtures and relevant tests,
- let mismatched values correctly resolve to `Custom`,
- expose a GUI control only if it is useful for actual tuning/user control; do not add debug knobs merely because the field exists.

Do **not** use `pixelRatioCap` as the implementation of this plan. It is a whole-render-chain lever already owned by the quality preset and would confound AO-specific measurement. Keep it fixed during AO comparison.

## Composer / lifecycle guardrails

- Preserve the existing `RenderPass` ↔ `N8AOPass` exclusivity in `syncAoPass()`.
- Preserve `EffectComposer.setSize()` / `setPixelRatio()` ownership; any AO-specific internal target sizing must remain compatible with those resize calls.
- Preserve `gammaCorrection = false` and current pass order unless a separate measurement proves the order itself is the problem.
- `setPassEnabled('ao', false)` must continue to be a valid isolation probe and must restore through `applyConfig()` with no state drift.
- Keep `applyFrameBudget()` a no-op; no frame-time-dependent enable/disable, intensity fade or temporal quality switching in this plan.

## Verification details

Automated:

- focused tests for any new pure AO config/preset resolver,
- existing quality-profile/config persistence tests when those types are extended,
- isolation-probe tests must remain green if its contract is unchanged,
- type-check/lint/test/build per repository workflow.

Manual/browser by user:

- run `?benchmark=settlement-heavy` before/after on the same High preset,
- run `?benchmark=stream` as the second scenario,
- compare `RENDER` avg/p95, FPS/frame p95 and GPU elapsed when available,
- visually inspect contact AO at house foundations/walls, fences, NPC/ground contact, dense grass and object intersections,
- look specifically for half-res upsampling halos, shimmer/flicker during camera movement, missing fine contact shadows and excessive dark halos.

## Implementation order

1. Inspect the actual public N8AO 2.0.1 configuration fields/types available in the installed dependency; do not assume options from another release.
2. Add the smallest bounded variant resolver/diagnostic seam needed for 1–2 cheaper AO configurations.
3. Run automated checks; user performs browser benchmark/visual comparison.
4. Select at most one winning configuration.
5. Only then promote it to fixed runtime config or existing quality presets as required.
6. Remove temporary variant-only plumbing that has no continuing diagnostic value.

## Stop conditions

Stop without a production change if:

- supported N8AO controls beyond current half-res + Performance do not expose a meaningful cheaper configuration,
- improvement is small/noisy compared with run variance,
- visual quality loss is obvious on High,
- the only substantial next step would require a new depth pipeline, dependency fork, temporal reconstruction or dynamic resolution system.

The `no-ao` delta is an upper bound, not a target. High must keep AO enabled under this plan.
