# Research 017: Three.js rendering & performance audit — `three@0.185.1`

**Status:** `in progress` (changes implemented + technically verified; **no browser/performance benchmark run**)
**Date:** 2026-08-17
**Scope:** audit the live Seedvale render stack against official Three.js guidance ([research 016](2026-08-17--016--threejs-source-pack.md) source pack), and implement only the recommendations that are officially documented, valid for the installed `three@0.185.1`, local, low-risk and behaviour/appearance-neutral.
**Context:** [research 015](2026-08-17--015--streaming-hitch-gl-errors-handoff.md) (streaming hitch + `GL_INVALID_OPERATION` handoff).

---

## 1. Summary

Installed version confirmed: `node_modules/three/package.json` → **`0.185.1`**. Every claim below was checked against that installed source tree, not against the current threejs.org docs for a newer release.

**Headline finding (falsifies a standing hypothesis):** the mirror pass and the main scene pass do **not** produce divergent `WebGLProgram` cache-key variants. Both render into a non-null, non-XR render target, so `WebGLPrograms.getParameters()` gives both `toneMapping: NoToneMapping` and `outputColorSpace: workingColorSpace`. The mirror is not a second variant — it is simply the **first pass in the frame**, so it pays the first-use program-link cost of every newly streamed material. See §2.1. This retires "reduce mirror/main program-variant divergence" (research 015 §5 angle-3) as a fix direction *as stated*.

**What was implemented** (4 code changes + 1 CI fix, all appearance- and gameplay-neutral):

| # | Change | Files |
|---|---|---|
| I1 | Restore `renderer.debug.checkShaderErrors` to the Three.js default (`true`) | `src/render/createRenderer.ts` |
| I2 | Dispose the sun's shadow-map render target on app teardown | `src/world/createLights.ts`, `src/app/createApp.ts` |
| I3 | Dispose `RenderPass` alongside the other composer passes | `src/render/createPostProcessing.ts` |
| I4 | Resync `package-lock.json` (`n8ao` 2.0.0 → 2.0.1) — CI was red on `main` | `package-lock.json` |
| I5 | `prefer-const` lint fix blocking the same CI gate (pre-existing, unrelated) | `src/settlement/props.ts` |

**What was audited and found already correct** (no change needed — recorded so it is not re-audited): §3.

**What was deliberately not implemented:** §4 — notably `compileAsync()`/prewarming, N8AO changes, postprocessing reordering, program-variant reduction, and removal of the in-flight AO diagnostic code.

---

## 2. Implemented

### I1 — `renderer.debug.checkShaderErrors` back to the Three.js default

**File:** `src/render/createRenderer.ts:20`

**Problem.** The flag was set to `false` as a streaming-hitch workaround (commit `aaeee34`, research 012). Research 015 §4b then measured that it does not reduce the stall at all — it only moves which WebGL query the profiler charges for the driver's synchronous program-link wait (`LINK_STATUS` → `ACTIVE_UNIFORMS`, ~21.6 s over 288 first-use events in one `stream` run). Meanwhile it suppressed real shader compile/link errors project-wide, indefinitely.

**Verified against installed source.** `node_modules/three/src/renderers/webgl/WebGLProgram.js`, `onFirstUse()` (line 860). The `if ( renderer.debug.checkShaderErrors )` block guards only `getProgramInfoLog()`, two `getShaderInfoLog()` calls, `LINK_STATUS` and `VALIDATE_STATUS`. Immediately after that block, `onFirstUse()` unconditionally constructs `new WebGLUniforms( gl, program )` (→ `getProgramParameter( program, ACTIVE_UNIFORMS )`) and calls `fetchAttributeLocations()` (→ `ACTIVE_ATTRIBUTES`, `WebGLProgram.js:182`). Neither is gateable. So the link wait is paid on first use of a program regardless of the flag.

**Three.js recommendation.** `WebGLRenderer.debug.checkShaderErrors` — enabled by default; the documentation recommends keeping shader error checking on during development, with disabling it framed as a production-only performance trade-off. *(Official Three.js recommendation.)*

**Change.** Removed the assignment so the renderer keeps the library default `true`, and replaced it with a comment recording why the workaround was retired (so it is not silently re-flipped).

**Why this is considered safe.** It restores a Three.js default rather than introducing a custom configuration; it changes no material, render target, pass order or uniform; the evidence in research 015 §4b is that the underlying first-use stall is unchanged either way. **It is not claimed to be performance-neutral** — the flag re-adds three synchronous info-log queries per first-used program. Those queries run *after* the driver wait has already been forced by the first query in the sequence, so they should be cheap (`ACTIVE_ATTRIBUTES`, the second query on the same program, measured 0.8 ms total across the same 288 events), but this is inference from research 015's numbers, not a measurement of this configuration. **Chosen deliberately by the user over a `import.meta.env.DEV` split.** Re-measure in the benchmark stage.

### I2 — dispose the directional light's shadow map on teardown

**Files:** `src/world/createLights.ts`, `src/app/createApp.ts`

**Problem.** `createApp()`'s teardown disposed the renderer, composer, world bundle, sky, particles and player, but never the lights. `WorldLights` had no `dispose()` at all, so `sun.shadow.map` — a 512²/1024² depth render target — was never freed.

**Verified against installed source.** `node_modules/three/src/renderers/WebGLRenderer.js`, `this.dispose = function ()`: it disposes `background`, `renderLists`, `renderStates`, `properties`, `environments`, `objects`, `bindingStates`, `uniformsGroups`, `programCache` and `xr`. **`shadowMap` is not in that list**, so `renderer.dispose()` does not free a light's shadow render target. `DirectionalLight.dispose()` (`src/lights/DirectionalLight.js:81`) calls `super.dispose()` then `this.shadow.dispose()`, and `LightShadow.dispose()` (`src/lights/LightShadow.js:267`) frees `map` and (VSM-only) `mapPass`.

**Three.js recommendation.** "How to dispose of objects" — the application owns the lifetime of GPU resources it creates; render targets must be disposed explicitly. *(Official Three.js recommendation.)*

**Change.** Added `WorldLights.dispose()` (calls `sun.dispose()`, then detaches sun/target/hemi/ambient from the scene) and called it from `createApp()`'s teardown, next to `postProcessing.dispose()`.

**Why this is considered safe.** It only runs on full app teardown, after the last frame. It uses the official `DirectionalLight.dispose()` API rather than reaching into internals. The existing `setShadowMapSize()` live-resize path (which already disposes `shadow.map` and nulls it) is untouched. Note that `createApp()`'s returned `dispose()` is currently not called by `src/main.ts` — this closes the gap for tests and for any future "return to start screen" flow rather than fixing a leak that reproduces today.

### I3 — dispose `RenderPass` with the rest of the composer chain

**File:** `src/render/createPostProcessing.ts`

**Problem.** `dispose()` disposed `aoPass`, `smaaPass`, `bloomPass`, `godRaysPass`, `outputPass` and `composer`, but not `renderPass`.

**Verified against installed source.** `EffectComposer.dispose()` (`EffectComposer.js:354`) frees only `renderTarget1`, `renderTarget2` and `copyPass` — passes added to the chain are the caller's responsibility. `RenderPass` in r185 owns no GPU resources and inherits `Pass.dispose()` (`Pass.js:100`), a no-op, so this is a completeness/consistency fix, **not** a leak fix today.

**Three.js recommendation.** "How to dispose of objects" — post-processing resources must be disposed by the application. *(Official Three.js recommendation.)*

**Why this is considered safe.** Calling a documented no-op on teardown cannot change behaviour, and it keeps the dispose list exhaustive if `RenderPass` gains resources upstream.

### I4 — resync `package-lock.json` (CI was failing on `main`)

**File:** `package-lock.json`

**Problem.** Research 015 §6 flagged a lockfile inconsistency as unverified. Resolved here:

- `node_modules/n8ao/package.json` → **`2.0.1`** (installed).
- `package.json` → `"n8ao": "^2.0.1"`; `pnpm-lock.yaml` → `n8ao@2.0.1`.
- `package-lock.json` → **stale at `2.0.0`**, and its root dependency snapshot still said `^2.0.0`.

`.github/workflows/ci.yml` runs `npm ci`, which hard-fails when `package.json` and `package-lock.json` disagree. **CI has been red on `main` since at least commit `3c09f8b`** — verified via `gh run view 32020997671 --log-failed`:

```text
npm error `npm ci` can only install packages when your package.json and package-lock.json … are in sync.
npm error Invalid: lock file's n8ao@2.0.0 does not satisfy n8ao@2.0.1
```

**Change.** `npm install --package-lock-only --ignore-scripts` — regenerates the lockfile without touching `node_modules`. Diff is +70/−4: the `n8ao` entry moves to 2.0.1, plus npm now records some already-bundled optional `@tailwindcss/oxide-wasm32-wasi` transitive entries. Verified with `npm ci --dry-run --ignore-scripts` (resolves cleanly) and by re-checking that `node_modules/n8ao` is still `2.0.1`.

**Why this is considered safe.** `--package-lock-only` does not modify `node_modules`; the local dev environment (pnpm-managed) is unchanged. It restores the repository's own verification gate.

**Note on repo hygiene (not fixed here):** `package.json` declares `packageManager: pnpm@11.20.0` and a `pnpm-lock.yaml` exists, but CI uses `npm ci` against `package-lock.json`. Two lockfiles for one repo will drift again. Picking one is a repo-workflow decision, not a rendering change — see §4.

### I5 — `prefer-const` lint error blocking the same gate

**File:** `src/settlement/props.ts:1655`

Pre-existing and unrelated to this audit (introduced in commit `3516a81`), but `npm run lint` fails on it, so CI would still have been red after I4. `meshBaseScale` is written once and only read at line 1717 — `let` → `const`, behaviour-identical. Called out explicitly because it is outside the audit's scope.

---

## 3. Audited, already correct — do not re-audit

These were checked against the installed r185 source and official guidance and needed no change. Recorded so the next session does not repeat the work.

### 3.1 Program cache keys: mirror vs. main — **no variant divergence**

`WebGLPrograms.getParameters()` (`WebGLPrograms.js`) derives exactly two render-target-dependent parameters:

```js
// line 176-184
let toneMapping = NoToneMapping;
if ( material.toneMapped ) {
  if ( currentRenderTarget === null || currentRenderTarget.isXRRenderTarget === true ) {
    toneMapping = renderer.toneMapping;
  }
}
// line 212
outputColorSpace: ( currentRenderTarget === null )
  ? renderer.outputColorSpace
  : ( currentRenderTarget.isXRRenderTarget === true
      ? currentRenderTarget.texture.colorSpace
      : ColorManagement.workingColorSpace ),
```

Seedvale renders the scene **twice per frame, both times into a non-null non-XR render target**:

- water mirror → its own 128² `WebGLRenderTarget` (`src/world/waterMirror.ts:182`);
- beauty pass → `EffectComposer`'s `renderTarget1/2` via `N8AOPass`/`RenderPass` (`OutputPass` is last, so the scene passes are never `renderToScreen`).

Both therefore resolve to `NoToneMapping` + `workingColorSpace`. **They share the same program variant.** Research 015 §1's "mirror → LinearSRGB/NoToneMapping vs. main canvas → SRGB/ACESFilmic" is correct only for a hypothetical direct-to-canvas render, which Seedvale does not do.

The mirror's dominance in the traces is explained by **ordering**, not variants: `src/app/gameLoop.ts:995` calls `bundle.ocean.renderMirror(...)` before `postProcessing.render()` at line 1004. Whichever pass draws a freshly streamed material first absorbs its one-time link wait; the mirror is first. This is consistent with research 015 §4b's observation that the postprocessing chain (`createPostProcessing.ts:270`) also produced an individually-flagged slow first-use call.

*(Seedvale-specific inference, derived from directly-quoted installed r185 source.)*

### 3.2 `onBeforeCompile` + `customProgramCacheKey`

Both `onBeforeCompile` sites declare an explicit `customProgramCacheKey`:

- `src/terrain/buildChunkGeometry.ts:365` — `'chunk-terrain-surface-detail-v5'` / `'chunk-terrain-surface-v5'`. Correct: everything that varies per chunk (`waterLevel`, detail tiling, wetness/snow) is passed as a **uniform**, not baked into the injected source, so `detailOn` is genuinely the only source-level axis.
- `src/world/foliageWind.ts:100` — composes with any previous key.

Three.js documents that the default cache key ignores `onBeforeCompile` unless `customProgramCacheKey` is overridden. Both the "too many variants" and the more dangerous "two behaviourally different materials collapsing onto one program" failure modes are avoided. *(Official Three.js recommendation — already satisfied.)*

### 3.3 Postprocessing pass order

Chain: `RenderPass`(fallback) → `N8AOPass` → `SMAAPass` → `UnrealBloomPass` → god rays `ShaderPass` → graded `OutputPass`.

`SMAAPass`'s own r185 jsdoc (`SMAAPass.js:14-16`): *"Unlike `FXAAPass`, `SMAAPass` operates in `linear-srgb` so this pass must be executed before `OutputPass`."* Satisfied. Tone mapping and output color-space conversion happen exactly once, in the final pass (`createGradedOutputPass()` keeps `OutputPass.render()`'s define-rebuild logic intact), and `aoPass.configuration.gammaCorrection = false` avoids double-correcting. This matches the official post-processing model. *(Official Three.js recommendation — already satisfied.)*

### 3.4 Render targets & color management

- Mirror RT (`waterMirror.ts:81`): defaults (`RGBAFormat` / `UnsignedByteType` / `depthBuffer: true` / `stencilBuffer: false`) with mipmaps off and linear filters. The scene writes linear values into it (§3.1) and the water shader samples it as linear (`colorSpace` left at the r152+ default `NoColorSpace`). Consistent — **not** changed, per the brief's rule against touching render-target semantics for performance.
- `EffectComposer`'s internal targets are `HalfFloatType` (`EffectComposer.js:69`) — the correct HDR working buffer for a tone-mapped chain.
- No `TextureLoader` anywhere in `src/`. All textures are either procedural `DataTexture`s (`createWater.ts`, `terrainDetailNormalMap.ts`, `waterMaterial.ts`'s 1×1 fallback) or GLTF-loaded (GLTFLoader assigns color spaces itself). The detail normal map is correctly left at `NoColorSpace`; no color texture is mis-tagged.
- Composer/renderer pixel-ratio sync: `new EffectComposer(renderer)` reads `renderer.getPixelRatio()` and `renderer.getSize()` (logical) in its constructor, and `addPass()` immediately re-calls `pass.setSize(width * pixelRatio, …)`, so the CSS-pixel sizes passed to the `N8AOPass`/`UnrealBloomPass` constructors in `createPostProcessing.ts` are overwritten with the correct effective size. `applyLiveGraphics()` keeps both in step afterwards. No bug.

### 3.5 Resource lifecycle / disposal

Checked against the official disposal manual. Already handled, with the reasoning documented in-code:

- `disposeObject3D()` (`src/assets/loadGltf.ts`) skips `userData.sharedGpu` resources shared with the GLTF cache, and calls `InstancedMesh.dispose()` for the `instanceMatrix` buffer that geometry/material disposal does not free.
- `tintPropMaterials()` (`src/settlement/props.ts:206`) clears `sharedGpu` on its clones, so tinted copies are freed — the exact trap that `Material.copy()`'s userData clone would otherwise set.
- Chunk unload (`chunkManager.ts:1285`) frees mesh, water (incl. its three `DataTexture`s), grass, tree/vegetation/environment instanced buckets and item groups.
- `rebuildWorldBundle`/`disposeWorldBundle` dispose all ten systems; `ocean.dispose()` owns the shared mirror RT, and a fresh `WaterMirror` is built per rebuild.
- `grass.ts:472`, `instancedProps.ts` — `InstancedMesh.dispose()` used correctly.
- The terrain detail normal map is a lazy module-level singleton (`buildChunkGeometry.ts:109`), intentionally app-lifetime, so `terrainMaterial.dispose()` not freeing it is correct rather than a leak.

The only gaps found were I2 and I3.

### 3.6 Instancing / culling / draw calls

`InstancedMesh` frustum culling in r185 goes through `Frustum.intersectsObject()`, which prefers `object.boundingSphere` (auto-computed once, then cached and **not** refreshed when `instanceMatrix` changes). Both instanced systems call `computeBoundingSphere()` after filling matrices (`instancedProps.ts:187`, `grass.ts:440`) with a comment explaining why. `instancedProps.ts:219`'s swap-with-last removal leaves the cached sphere conservatively large, which is safe for culling. LOD via `mesh.count`, per-chunk buckets, shadow-cast thresholding by mesh size (`loadGltf.ts`), `renderer.info.autoReset = false` with an explicit per-frame `reset()` (`gameLoop.ts:993`), and the once-per-frame manual shadow update (`shadowMap.autoUpdate = false` + `needsUpdate = true` after the mirror) are all sound. Nothing to change without a benchmark.

---

## 4. Not implemented / follow-up

Each of these is plausible but fails at least one of the brief's gates (needs a benchmark, an experiment, an architecture change, or confirmation of behaviour).

| # | Item | Why deferred |
|---|---|---|
| F1 | **Program-variant reduction (mirror vs. main)** | **Retired as stated.** §3.1 proves they already share a variant. Any future work here must start from "why are there ~288 distinct programs at all" (per-GLB material diversity, shadow-depth variants), not from mirror/main divergence. Needs a `renderer.info.programs` inventory first. |
| F2 | **`compileAsync()` / prewarming** | Officially the mechanism for moving first-use compile/link off the critical path (backed by `KHR_parallel_shader_compile`; `COMPLETION_STATUS_KHR` is reachable only via `compileAsync()`'s polling loop, `WebGLProgram.js:998`). But research 014 tried four variants and **all four regressed**, two severely, one introducing `GL_INVALID_OPERATION`. Explicitly excluded by the brief. Resume only per research 015 §5: minimal isolated repro first, plus committed `performance.mark` instrumentation for the mirror pass. |
| F3 | **Reordering the mirror pass relative to the beauty pass** | §3.1 suggests the mirror is expensive largely because it is *first*. Moving it after the composer would relocate the cost, not remove it, and changes reflection latency by a frame. Behaviour-affecting and unmeasured. |
| F4 | **`GL_INVALID_OPERATION` sampler mismatch (N8AO hypothesis)** | Untouched by design. `n8ao@2.0.1` is now confirmed installed (§I4), which resolves research 015 §6 step 1 — but step 2 (re-run the `stream` benchmark and check the console) and step 3 (disable `N8AOPass` as an independent control) are browser work and were not done here. |
| F5 | ~~**AO diagnostic code in `createPostProcessing.ts`**~~ — **resolved 2026-08-17**, after this audit | Was an active deviation from intended behaviour: `__aoDiag` on `globalThis`, N8AO pinned on, plan 113's heavy-frame auto-suppress not actually applied (`applyFrameBudget` only logged). The underlying ~20 Hz tremble (grass flicker) was fixed separately, so the diagnostic was removed and the auto-budget restored — with every `syncAoPass()` now gated on a real state change, so `aoPass.enabled` is no longer written every frame (the original tremble suspect). **All benchmark numbers taken before this removal measured a pinned-on AO pass** — see [research 018](2026-08-17--018--stream-isolation-probes.md). |
| F6 | **Static-object matrix updates** (`matrixAutoUpdate = false` for chunk meshes/props) | An officially documented optimization ("How to update things"), and Seedvale has thousands of never-moving chunk objects. But it is a correctness footgun (a missed `updateMatrix()` strands an object at the origin) across streaming, dig-rebuild and harvest paths. Needs a scoped plan + benchmark, not an audit-time edit. |
| F7 | **Half-res `UnrealBloomPass` via monkey-patched `setSize`** | Works and is deliberate (`createPostProcessing.ts:96`), but overriding an addon method is fragile across three.js upgrades. A `postprocessing`-library `BloomEffect` (already a dependency) or a subclass would be sturdier. Behaviour-neutral refactor, still a refactor. |
| F8 | **Two lockfiles for one repo** | `packageManager: pnpm@11.20.0` + `pnpm-lock.yaml`, but CI runs `npm ci` against `package-lock.json`. I4 resyncs them today; they will drift again. Pick one (either switch CI to pnpm, or drop `pnpm-lock.yaml`). Repo-workflow decision. |
| F9 | **`mirrorCamera.projectionMatrixInverse` is never refreshed** after `waterMirror.ts` mutates `projectionMatrix` for the oblique clip plane | Currently harmless: in r185 the WebGL renderer only reads `projectionMatrixInverse` in XR code paths (`WebXRManager.js`), and nothing in Seedvale raycasts/unprojects through the mirror camera. Flagged so it is not a surprise if a future effect (e.g. a depth-reconstruction pass on the mirror target) starts reading it. |

---

## 5. Known limitations

- **Nothing here has been benchmarked.** No `?benchmark=stream` run, no frame-time or FPS comparison, no `renderer.info` capture before/after.
- **The streaming hitch is not fixed and is not claimed to be fixed.** No change in this audit targets it. §3.1 removes one hypothesis about its mechanism; it does not remove the mechanism, which remains synchronous driver-side program-link completion on first use of a `WebGLProgram`.
- **I1 may change measured timings.** It restores three synchronous info-log queries per first-used program. Reasoned to be cheap (§2/I1) but not measured. If a benchmark shows a regression against the `checkShaderErrors=false` baseline, that is new information, not a contradiction of research 015 §4b.
- **`GL_INVALID_OPERATION` is untouched** and presumably still reproduces.
- ~~The AO diagnostic code is still active (F5)~~ — removed later the same day; see F5.
- Verification split:
  - **Implemented:** I1–I5.
  - **Technically verified:** `npx tsc --noEmit` (clean), `npx eslint src/` (clean), `npm run build` (`vue-tsc` + `vite build`, succeeds), `npm run test` (114 files / 910 tests pass), `npm ci --dry-run` (lockfile resolves).
  - **Browser / performance verified:** **none.** No visual check, no frame-time measurement, no console-error check.

---

## 6. Sources

Evidence levels per research 016's rules.

**Official Three.js recommendation**

- `WebGLRenderer` docs — `debug.checkShaderErrors`, `compile()`/`compileAsync()`, `outputColorSpace`, `toneMapping`, `info`: <https://threejs.org/docs/pages/WebGLRenderer.html> → I1, F2.
- Color Management manual — linear-sRGB working space, output conversion at end of pipeline: <https://threejs.org/manual/en/color-management.html> → §3.4.
- Post Processing manual + `OutputPass` docs — chain model, final tone mapping/color-space conversion: <https://threejs.org/manual/en/post-processing.html>, <https://threejs.org/docs/pages/OutputPass.html> → §3.3.
- "How to dispose of objects" — application owns GPU resource lifetime: <https://threejs.org/manual/en/how-to-dispose-of-objects.html> → I2, I3, §3.5.
- `Material.onBeforeCompile` / `Material.customProgramCacheKey` docs → §3.2.
- "How to update things" — `matrixAutoUpdate` for static objects → F6.

**Installed-source verification (`three@0.185.1`, primary evidence for every version-specific claim)**

- `src/renderers/webgl/WebGLPrograms.js` — `getParameters()` lines 121, 176–184, 212; cache-key assembly lines 428/441/484 → §3.1, §3.2.
- `src/renderers/webgl/WebGLProgram.js` — `onFirstUse()` line 860, `fetchAttributeLocations()` line 182, `isReady()`/`COMPLETION_STATUS_KHR` line 998 → I1, F2.
- `src/renderers/WebGLRenderer.js` — `dispose()` body (no `shadowMap`) → I2.
- `src/lights/DirectionalLight.js:81`, `src/lights/LightShadow.js:267` → I2.
- `examples/jsm/postprocessing/EffectComposer.js` — constructor lines 62–75, `addPass` 152/165, `setSize`/`setPixelRatio` 319–350, `dispose()` 354 → I3, §3.4.
- `examples/jsm/postprocessing/SMAAPass.js:14-16` (jsdoc), `Pass.js:100` → §3.3, I3.
- `src/math/Frustum.js` — `intersectsObject()` `boundingSphere` preference → §3.6.

**Maintainer guidance**

- Three.js issue #16321 — `KHR_parallel_shader_compile` implementation and browser/driver synchronization behaviour: <https://github.com/mrdoob/three.js/issues/16321> → F2 background only. No workaround from that thread was adopted.

**Community workaround**

- None adopted. The Discourse threads in research 016 §8 (texture format vs. sampler type, `DepthTexture`/`sampler2DShadow`) were read as background for F4 and produced no change.

**Seedvale-specific inference**

- §3.1's ordering explanation (mirror runs first, therefore absorbs first-use link cost) — derived from `gameLoop.ts:995` vs. `:1004` plus the quoted `WebGLPrograms` source. Consistent with research 015 §4/§4b's traces, but not independently measured here.
- I1's "the extra info-log queries should be cheap" reasoning — extrapolated from research 015 §4b's `ACTIVE_ATTRIBUTES` figure (0.8 ms / 288 events). Inference, not measurement.

---

## 7. Next step

Run the browser/performance stage as a separate task:

1. `?benchmark=stream` on current `main`, capture frame time / FPS / `renderer.info`, and compare against research 014's `254 ms max / 45.5 avg FPS` no-prewarm baseline — primarily to check I1 did not regress anything.
2. Check the console for `GL_INVALID_OPERATION` now that `n8ao@2.0.1` is confirmed installed (research 015 §6 step 2), then the AO-off control (step 3).
3. Decide F5 (revert the AO diagnostic) before trusting any AO-related measurement.
