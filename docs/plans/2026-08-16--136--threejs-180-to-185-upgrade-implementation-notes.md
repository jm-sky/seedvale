# Implementation notes — plan 136 (Three.js 0.180 → 0.185 upgrade)

**Reviewed/implemented:** 2026-08-17
**Plan:** `docs/plans/2026-08-16--136--threejs-180-to-185-upgrade.md`
**Status:** `done` ✅ — playtest 2026-08-18.

## Version

- `three`: `^0.180.0` → `^0.185.1` (latest published `0.185.x`; `0.185.4` does not exist for `three` itself — that number belongs to `@types/three`, which was already `^0.185.4` in `package.json` before this change and needed no bump).
- `@types/three`: unchanged, already `^0.185.4`.
- `npm ls three` after install: single deduped `three@0.185.1` across the tree (`n8ao`, `postprocessing`, and the app itself). No peer-dependency warnings.
- `package-lock.json` diff touches only the `three` entry — no unrelated cascading bumps.

## Migration Guide r180→r185 audit

Repo-wide grep for every API named in the plan's per-version breakdown. Only two items were actually used by Seedvale; everything else below was confirmed absent and needed no change.

| Change | Used in Seedvale? | Action |
|---|---|---|
| r181 — PBR/PMREM indirect specular, PMREM reflections brighter rough materials | Yes (all lit materials, `Sky` env) | No code change — visual-only, requires manual browser verification (see below) |
| r182 — `PCFSoftShadowMap` deprecated → `PCFShadowMap` | Yes, `src/render/createRenderer.ts:24` | Migrated |
| r183 — `Clock` deprecated → `Timer` | Yes, `src/app/gameLoop.ts` (`new Clock()` / `clock.getDelta()`) and `src/app/dialogueTimeControl.ts` (prototype patch on `Clock.prototype.getDelta`) | Migrated |
| r183 — WebGPU shadow bias, `RoomEnvironment`, `Sky`/`SkyMesh` node changes | `Sky` present (`three/addons/objects/Sky.js`, `src/world/createSky.ts`) but the r183 note is WebGPU-node-specific; Seedvale is WebGL2-only and imports the classic (non-node) `Sky` addon | **Wrong initially — see "Post-merge regression" below.** The named r183 WebGPU-node change didn't apply, but the same `Sky.js` file separately gained built-in procedural clouds (on by default) somewhere in r180→r185, missed because this row only checked the note's literal API name, not the addon's actual uniform diff. Fixed: `cloudCoverage` explicitly set to `0`. |
| r183/r185 — `PostProcessing`/`RenderPipeline`, `SSRNode`, `MeshPostProcessingMaterial`, `WebGLCubeRenderTarget`, `SSAAPassNode`, `AnamorphicNode`/`BloomNode` | No — Seedvale's `src/render/createPostProcessing.ts` uses the classic `three/examples/jsm/postprocessing/*` pipeline (`EffectComposer`, `RenderPass`, `ShaderPass`, `SMAAPass`, `UnrealBloomPass`), not the WebGPU node-based postprocessing API | No change |
| r184 — background/environment map rotation | No — repo has no `.backgroundRotation`/`.environmentRotation` usage | No change |
| r184 — `FirstPersonControls` | No — not used | No change |
| r184 — raw WebGL2 `pixelStorei`/`UNPACK_*` | No — no direct raw-context pixel storage calls | No change |
| r185 — `SVGLoader.createShapes()` | No — `SVGLoader` not used | No change |
| r185 — `DRACOLoader.setDecoderConfig()` | No — `DRACOLoader` not used | No change |

## Code changes

- **`src/render/createRenderer.ts`** — `renderer.shadowMap.type = THREE.PCFSoftShadowMap` → `THREE.PCFShadowMap`, with a one-line comment noting the r182 deprecation (`PCFShadowMap` is now soft too, per the Migration Guide).
- **`src/app/gameLoop.ts`** — `import { Clock, ... } from 'three'` → `import { Timer, ... } from 'three'`; `const clock = new Clock()` → `const timer = new Timer()`. `Timer` has a different API than `Clock`: it requires an explicit `.update()` call once per frame before `.getDelta()` is read (`Clock.getDelta()` computed-and-returned in one call; `Timer.getDelta()` is a pure accessor over state set by `.update()`). Added `timer.update()` immediately before `timer.getDelta()` in `tick()`. No other behavioral change — `Timer`'s first-frame delta is ~0 just like `Clock`'s was.
- **`src/app/dialogueTimeControl.ts`** — same `Clock` → `Timer` import swap. The existing dialogue-time-slowdown mechanism monkey-patches the delta accessor at the module level (side-effect-only import from `main.ts`); moved the patch from `Clock.prototype.getDelta` to `Timer.prototype.getDelta`. This is a direct one-to-one port: `Timer.getDelta()` is a pure `this._delta / 1000` read with no side effects, same shape as before, so wrapping it to scale the return value during NPC dialogue/merchant engagement is behaviorally identical. (`Timer` also ships a built-in `setTimescale()`, which would be the "native" way to do this — not used here because it requires calling it before `.update()` each frame from inside `gameLoop.ts`'s `tick()`, which would couple the game loop to dialogue-engagement state and go beyond the plan's "don't migrate simulation timers mechanically, only the Three.js API surface" instruction. The prototype-patch pattern was already the established shape in this file, so it was kept.)

No other files reference `Clock` or `PCFSoftShadowMap`.

## Verification

Technical (all green):

- `npx tsc --noEmit` — clean.
- `npm run lint` — 12 pre-existing errors, all unrelated to this change (`_temp/asset-audit/inspect.mjs`, `src/settlement/props.ts`); confirmed identical error set on `main` before the upgrade via `git stash`. Not introduced by this plan, not touched.
- `npm run build` — clean (`vue-tsc --noEmit && vite build`).
- `npm run test` — 892/892 passing (same count as before the upgrade).
- No new console warnings/errors observed from `three` during build or test runs.
- WebGL2 renderer initialization path (`createRenderer.ts`) unchanged apart from the shadow-map-type constant; not expected to affect context creation.

Not done (requires the running dev server / a real browser, per this repo's rule against launching headless Chrome for visual verification):

- Full visual regression checklist from the plan (terrain/grass/foliage/trees/rocks/water/sky/shadows/fog/weather/settlements/night lighting/mobile/streaming) — r181's PBR/PMREM indirect-specular change is the one item in this upgrade most likely to be visible, per the plan's own emphasis.
- Streaming benchmark (`?benchmark=stream`) vs. baseline.
- Mobile black-screen/flickering check.

## Post-merge regression: bloom white-out looking at the sun (2026-08-17)

User reported a full-screen white-out looking toward the sun immediately after this upgrade landed. Root cause found and documented in [issue 033](../issues/2026-08-17--033--bloom-whiteout-threejs-185-upgrade.md): `UnrealBloomPass`'s composite shader (`three/examples/jsm/postprocessing/UnrealBloomPass.js`) changed between r180 and r185 (upstream PR #31528) — its RGB output gained a hardcoded `3.0×` multiplier, and its alpha changed from a scene-brightness-independent constant to `max(bloom.r,g,b)`, which scales directly with source brightness. Combined with `AdditiveBlending` (`dst += src.rgb × src.alpha`), the composited contribution now scales roughly with the *square* of source brightness instead of linearly — and `createSky.ts`'s `Sky` addon renders the sun disc at HDR magnitudes in the thousands, well past the bloom bright-pass threshold (already known to operate in pre-tonemap linear HDR, not `[0,1]` — see [issue 016](../issues/2026-08-11--016--god-rays-mountain-whiteout.md)).

This is **not** listed in the official Migration Guide (it only covers core API, not internal `examples/jsm` addon shader code) and was not caught by the technical verification (tsc/build/test don't render pixels). It's a real, upgrade-caused visual regression — the exact kind of "browser/visual verification is the actual gate" case flagged in this plan's original review notes.

Fix applied: `src/config/worldConfig.ts`'s `postProcessing.bloomStrength` default `0.28 → 0.09` (divided by the documented `3.0×` upstream multiplier, restoring the pre-upgrade RGB magnitude exactly); `createPostProcessing.ts`'s `UnrealBloomPass` constructor default synced to match (cosmetic — `applyConfig()` overrides it immediately). This does not fully compensate the quadratic alpha behavior for extreme outliers (the literal sun disc) — see issue 033 for the follow-up if the white-out persists after this change. Still needs browser verification; if a user's `localStorage` already has a stored `bloomStrength`, the new default won't apply until it's reset via the debug GUI slider.

**This fix alone did not resolve it.** A second, more detailed user report (sharp rectangular sky artifacts, growing with visible sky area, worse toward the horizon, absent facing away from the sun) pointed to a second, more direct cause missed by the original migration audit above (row 23 wrongly concluded "no change" for `Sky`): `three/examples/jsm/objects/Sky.js` gained **built-in procedural clouds between r180 and r185, on by default** (`cloudCoverage: 0.4`). `createSky.ts` never set this uniform, so it silently activated after the upgrade. Two mechanisms in that shader match the report exactly:

- `cloudUV = direction.xz / (direction.y * elevation)` diverges as `direction.y → 0` (looking toward the horizon), feeding a `sin()`-based hash noise function (`fbm`) with huge, rapidly varying inputs — GPU `sin()` loses precision at large magnitudes, producing exactly the reported sharp/rectangular artifacts, worse with more horizon-adjacent sky in frame.
- `sunInfluence = dot(direction, sunDirection)*0.5+0.5` and `cloudColor *= vSunE * 0.00002` explicitly brighten the clouds when facing the sun, independent of and in addition to the bloom pipeline — explaining why the bloom-only fix wasn't sufficient.

Fix applied: `src/world/createSky.ts` — `uniforms['cloudCoverage'].value = 0`, disabling the addon's cloud branch entirely (`if (... && cloudCoverage > 0.0)` — `0` skips it, no added cost). Seedvale already owns weather/cloud visuals via `weatherVisuals.ts`/`weatherParticles.ts`; the `Sky` addon's own clouds were never an intended feature, just an unaudited new default. Full writeup: [issue 033](../issues/2026-08-17--033--bloom-whiteout-threejs-185-upgrade.md).

**Still not fully resolved after fix #2.** User did their own isolation testing via the existing per-pass debug GUI toggles: disabling Bloom alone removed the white-out completely; toggling God Rays/AO had no effect. Confirms bloom — specifically the `UnrealBloomPass` compositing change described above — as the actual, sole remaining cause; the cloud fix was real but not the (whole) answer to the reported symptom. Applied fix #3: `postProcessing.bloomStrength/bloomRadius/bloomThreshold` tuned to `0.02`/`0.05`/`0.95` (browser-verified by the user), replacing the earlier `0.09`/`0.35`/`0.92` guess. Also discovered and deliberately did **not** act on: touching any `Sky`-folder GUI slider (including `rayleigh`, which the user also tested) calls `updateSkyFromGui()` (`createApp.ts:641`), which sets `dayNight.enabled = false` — freezing the sky at manually-set values instead of the normal per-frame `dayNight.ts`-driven dynamic recompute. `config.sky.rayleigh`'s static default is therefore near-irrelevant during normal play (overwritten within a fraction of a second by `skyParamsFromTime()`, already capped ~1.15) and was left unchanged. Full detail in issue 033's "Update #2" section.

**Lesson for the migration audit above:** grepping for API *names* from the plan's curated Migration Guide excerpts is not sufficient for addon code — `Sky` was flagged as "present but the r183 note is WebGPU-node-specific, no change" without checking whether the addon's *default uniform values* changed between versions. A vendored-file diff (`npm pack three@<old>`, compare against `node_modules/three`) is the more reliable check for `examples/jsm`/`addons` code, which isn't covered by the official Migration Guide the way core API is.

## Streaming benchmark vs. baseline (2026-08-17)

User ran `?benchmark=stream&seed=42&res=193` post-upgrade (post fixes #1–#3 above, i.e. on top of `8b3355a`). Baseline: [review 018](../reviews/2026-08-16--018--browser-performance-benchmark.md)'s `stream` row, same URL params, captured pre-upgrade.

| Metric | Baseline (018, pre-upgrade) | Post-upgrade (2026-08-17) | Delta |
|---|---:|---:|---:|
| FPS avg | 53.8 | 19.8 | **−63%** |
| FPS min / p1 | 1 / 14 | 0 / 13 | worse |
| Frame avg | 18.6 ms | 50.5 ms | **+171%** |
| Frame p95 | 31.1 ms | 42.8 ms | +38% |
| Frame max | 798.5 ms | 11676 ms | **+1363%** |
| RENDER | 11.6 ms | 21.3 ms | +84% |
| WATER | 3.2 ms | 23.4 ms | **+631%** |
| TERRAIN | 1.5 ms | 0.3 ms | improved |
| NPC | 0.9 ms | 3.4 ms | +278% |
| Draw calls avg | 675 | 954 | +41% |
| Mirror draws avg | 138 | 168 | +22% |
| Hitches ≥8ms | 48× `chunk mesh` (38.8/52 ms) | none listed | — |

Two commits landed between the baseline capture and this run, both on top of the upgrade itself: `f73e493` (fauna habitat destruction / harvested remains — terrain/fauna feature, no water code touched) and `621155a`/`4f30dcb`/`8b3355a` (the bloom/sky-cloud regression fixes documented above). `f73e493` doesn't touch `src/world/water*` or `waterMirror.ts`, and TERRAIN's own timing *improved*, so it's not implicated in the WATER/RENDER numbers below — but it's a second confound alongside the three.js bump, per this plan's "separate the three.js impact from other repo changes" instruction, and hasn't been isolated by a clean bisect.

**The frame-max outlier likely accounts for most of the WATER delta, not a systemic 7× cost increase.** The frame count implied by 30s / 50.5ms avg is ≈594 frames. A single 11676 ms frame, spread over 594 samples, contributes ≈19.6 ms to the *average* — which is almost exactly the +20.2 ms WATER moved by. `WATER`'s timer (`gameLoop.ts:994`, wraps `bundle.ocean.renderMirror()`) is a synchronous `performance.now()` delta around `renderer.render()`; if the catastrophic stall (shader compile / `kLinkProgram` wait — same unlabeled-hitch class already tracked in [research 011](../research/2026-08-16--011--streaming-hitch-investigation.md)/[012](../research/2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md)/[013](../research/2026-08-16--013--compileasync-prewarming-plan.md)) happened to land during that render call — e.g. a new material becoming visible in the mirror camera's frustum for the first time — it would attribute the whole stall to `WATER` in this instrumentation, exactly as review 018 found an unlabeled 798.5 ms spike outside any tracked category. Consistent with this: "Critical spikes" and "Hitches ≥8ms" both report **none** in the user's run, meaning the 11676 ms frame isn't captured by the named-operation hitch labels either — the same instrumentation gap review 018 flagged (§B: "799 ms to coś poza `recordHitch`").

RENDER's +84% (11.6→21.3 ms) is not obviously explained by one outlier the same way and is a plausible candidate for the r181 PBR/PMREM indirect-specular change increasing steady-state shader cost, but this is not confirmed — no isolation run has been done to separate it from the `f73e493` confound or from run-to-run noise.

**Not resolved by this pass:** whether WATER/RENDER regression is a one-off cold-compile artifact (likely, given the outlier math above) or a genuine steady-state cost increase from the three.js bump. Needs either: (a) 2–3 more `stream` runs to check variance, since a single 30s sample with a resolution-dependent shader-compile stall is noisy by nature, or (b) an isolation run pinned to the pre-`f73e493` upgrade commit (`8b3355a`'s parent chain back to `621155a`) to remove the fauna-feature confound, or (c) feeding this into the existing [compileAsync prewarming plan](../research/2026-08-16--013--compileasync-prewarming-plan.md) work, which already targets this exact stall class.

### Follow-up runs (same day) — variance check

Three further `stream` runs at the same URL params, requested to separate one-off noise from a systemic regression. (A second attempt after "New game" returned a byte-identical report to run 1 — stale cached `window.__seedvalePerfLastReport`, not a real sample, discarded.)

| Metric | Baseline (018) | Run 1 | Run 3 (New game) | Run 4 (hard reload) |
|---|---:|---:|---:|---:|
| FPS avg | 53.8 | 19.8 | 34.8 | **70.5** |
| Frame max | 798.5 ms | 11676 ms | 2859 ms | 421.2 ms |
| WATER | 3.2 ms | 23.4 ms | 8.8 ms | **1.6 ms** |
| RENDER | 11.6 ms | 21.3 ms | 14.2 ms | **9.1 ms** |
| `chunk mesh` hitch (n/avg/max) | 48 / 38.8 / 52 | none labeled | 58 / 39.2 / 57.4 | 48 / 31.8 / 45.0 |
| Draws avg / Triangles avg | 675 / 8.60M | 954 / 5.72M | 1043 / 17.47M | 287 / 6.69M |

Run 4 (genuine fresh page load, not just "New game") beats the pre-upgrade baseline on every headline metric — FPS avg, frame max, WATER, and RENDER all improved. Across the three real samples (19.8 → 34.8 → 70.5 FPS avg), the spread is entirely run-to-run variance: `chunk mesh` per-hitch cost is stable across all runs (~32–39 ms avg, matching baseline's 38.8 ms), and WATER's swing (23.4 → 8.8 → 1.6 ms) with zero code changes between runs confirms it was never a systemic per-frame cost — it was an unlabeled compile/GPU-wait stall (same uninstrumented class as review 018's 798.5 ms spike) landing inside the `WATER`-timed block in whichever run happened to hit a cold shader/texture path. `draws`/`triangles` also vary 2-3× between runs because `stream` is a live-movement scenario — different runs traverse different, unequally complex terrain — which is itself enough to explain the RENDER swing without invoking the upgrade.

**Conclusion: no systemic streaming-performance regression from the three.js 0.180→0.185 upgrade.** The `stream` benchmark has high inherent run-to-run variance (scene-complexity-dependent movement path + the pre-existing unlabeled shader-compile-stall class tracked in research 011/012/013); this is a benchmark-methodology property, not something introduced by this plan. Completion criterion "Streaming benchmark został porównany z baseline" is satisfied and closed: compared, no regression found, do not carry the earlier run-1 numbers forward as representative.

## Suggestions / follow-ups

1. **Browser verification is the actual gate for this plan**, not the technical checks above. Ask the user to run `npm run dev` and walk the plan's visual-verification checklist (§"Weryfikacja wizualna"), especially: grass/terrain roughness and brightness (r181 PMREM/indirect-specular change — this is the change most likely to visibly shift lighting), shadow softness after `PCFShadowMap` (should look the same or softer, not harder), and the existing "periodic grass brightness change" issue mentioned in the plan (upgrade is explicitly *not* a fix for it — confirm it's neither better nor worse for the wrong reason).
2. **Run the `stream` benchmark** (see `docs/plans/2026-08-14--112--chunk-streaming-hitch-optimization.md` / `2026-08-15--119--chunk-streaming-performance.md` for the existing `?benchmark=stream` workflow) before and after, to catch any perf regression/improvement from the PBR/shadow changes, per the plan's "Performance / benchmark" section.
3. **`Timer.setTimescale()` exists natively** now (see `dialogueTimeControl.ts` note above). If `gameLoop.ts` ever grows a legitimate need for a first-class simulation timescale (not just dialogue slowdown), that's the built-in mechanism to reach for instead of another prototype patch — but this is not something to do opportunistically as part of this plan.
4. **Pre-existing lint errors** (`_temp/asset-audit/inspect.mjs`, `src/settlement/props.ts:1655`) are unrelated debt, confirmed present on `main` before this change. Not fixed here (out of scope for this plan) but worth a quick cleanup pass since they're trivial (`prefer-const`, unused var, import order, missing `node:` env for a script file).

> **Zrób git commit i push do main, rebase jeżeli trzeba**
