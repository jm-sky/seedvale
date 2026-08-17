# Implementation notes — plan 136 (Three.js 0.180 → 0.185 upgrade)

**Reviewed/implemented:** 2026-08-17
**Plan:** `docs/plans/2026-08-16--136--threejs-180-to-185-upgrade.md`
**Status:** implemented + technically verified (tsc/test/build green); no browser/visual/perf verification yet.

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
| r183 — WebGPU shadow bias, `RoomEnvironment`, `Sky`/`SkyMesh` node changes | `Sky` present (`three/addons/objects/Sky.js`, `src/world/createSky.ts`) but the r183 note is WebGPU-node-specific; Seedvale is WebGL2-only and imports the classic (non-node) `Sky` addon | No change |
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

## Suggestions / follow-ups

1. **Browser verification is the actual gate for this plan**, not the technical checks above. Ask the user to run `npm run dev` and walk the plan's visual-verification checklist (§"Weryfikacja wizualna"), especially: grass/terrain roughness and brightness (r181 PMREM/indirect-specular change — this is the change most likely to visibly shift lighting), shadow softness after `PCFShadowMap` (should look the same or softer, not harder), and the existing "periodic grass brightness change" issue mentioned in the plan (upgrade is explicitly *not* a fix for it — confirm it's neither better nor worse for the wrong reason).
2. **Run the `stream` benchmark** (see `docs/plans/2026-08-14--112--chunk-streaming-hitch-optimization.md` / `2026-08-15--119--chunk-streaming-performance.md` for the existing `?benchmark=stream` workflow) before and after, to catch any perf regression/improvement from the PBR/shadow changes, per the plan's "Performance / benchmark" section.
3. **`Timer.setTimescale()` exists natively** now (see `dialogueTimeControl.ts` note above). If `gameLoop.ts` ever grows a legitimate need for a first-class simulation timescale (not just dialogue slowdown), that's the built-in mechanism to reach for instead of another prototype patch — but this is not something to do opportunistically as part of this plan.
4. **Pre-existing lint errors** (`_temp/asset-audit/inspect.mjs`, `src/settlement/props.ts:1655`) are unrelated debt, confirmed present on `main` before this change. Not fixed here (out of scope for this plan) but worth a quick cleanup pass since they're trivial (`prefer-const`, unused var, import order, missing `node:` env for a script file).

> **Zrób git commit i push do main, rebase jeżeli trzeba**
