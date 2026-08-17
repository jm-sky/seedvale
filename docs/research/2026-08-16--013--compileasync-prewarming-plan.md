# Research 013: `renderer.compileAsync()` prewarming — minimal A/B experiment plan

**Status:** `planned`
**Date:** 2026-08-16
**Scope:** Diagnostic-only planning for an A/B experiment testing whether `renderer.compileAsync()` (Three.js 0.180.0) can prevent the streaming hitch identified in [research 012](2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md). **No code changes made. No implementation.**

## Related

- [Research 011: Streaming hitch investigation](2026-08-16--011--streaming-hitch-investigation.md)
- [Review 019: Streaming hitch — Perfetto trace analysis](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md)
- [Research 012: trace v2 and `getProgramInfoLog()` root cause](2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md) — names `gl.getProgramInfoLog()` as the ~545ms blocking call, triggered from `WebGLProgram`'s first-use path.

## ⚠️ Discrepancy vs. the task briefing — read first

The task briefing that requested this research states: *"Po przywróceniu: `renderer.debug.checkShaderErrors = true`, problem jest nadal traktowany jako potwierdzony"* — i.e. it assumes the diagnostic `checkShaderErrors = false` flip was reverted back to `true`, and that the hitch is currently reproducible in the live code.

**That is not what the repository currently contains.** `git log` shows:

```text
aaeee34 feat(renderer): disable shader error checking for performance optimization  (2026-08-16 23:10, HEAD)
```

And `src/render/createRenderer.ts:20`:

```ts
renderer.debug.checkShaderErrors = false // Disable shader error checking (docs/research/2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md)
```

This is committed, on `main`, and is the tip of the current branch — not an uncommitted experiment. Research 012 itself explicitly warned against this: *"Do not keep `checkShaderErrors = false` as the final fix yet... it should not be adopted merely as a performance workaround."* That warning was not followed before this commit landed.

**Practical effect on this task:** with the code as it stands today, the specific `gl.getProgramInfoLog()` stall diagnosed in research 012 is already suppressed in the water-mirror path (`onFirstUse()` in `WebGLProgram.js` only calls `getProgramInfoLog()`/`getShaderInfoLog()` when `renderer.debug.checkShaderErrors` is `true` — see `node_modules/three/src/renderers/webgl/WebGLProgram.js:918-930`). So the originally measured 545–732ms hitch should not currently reproduce.

This doesn't make the `compileAsync()` investigation moot — it changes its purpose. Read the rest of this plan as answering: **"if `checkShaderErrors` is restored to `true` (the correct long-term state, since disabling it silently swallows real shader errors project-wide), can `compileAsync()` prewarming keep the hitch from coming back?"** That is consistent with research 012's own recommended next step ("Investigate asynchronous/pre-warmed program compilation" as the follow-up to the diagnostic-only `checkShaderErrors=false` flip). The A/B plan below is written on that basis. Flagging this discrepancy rather than silently proceeding, per the project's truth-hierarchy rule (code over docs/plan when they disagree).

---

## 1. Where a chunk becomes renderable (chunk-finalize)

`src/terrain/chunkManager.ts`:

- `waitForFinalizeSlot()` (`chunkManager.ts:844-850`) enqueues a chunk into `finalizeQueue` with `finalizeStage = 'mesh'`.
- `runFinalize(rec)` (`chunkManager.ts:921-954`) is the actual finalize step, run synchronously (no `await` inside — comment at 919-920 explains this is intentional so GLB-promise continuations can't stampede):
  - `stage === 'mesh'`: calls `attachChunkMesh(rec, tile)` (`chunkManager.ts:988` onward), which ends with `scene.add(mesh)` at **`chunkManager.ts:839`**. This is the exact point terrain/water becomes live in the scene graph and renderable.
  - if the tile also has vegetation/environment/items, the chunk is re-queued with `finalizeStage = 'content'`, and a later drain call runs `attachChunkContent(rec, tile)` (`chunkManager.ts:949`) which attaches trees/rocks/props (not read in full here, but same `scene.add`-style attach pattern).
- `drainFinalizeQueue(limit)` (`chunkManager.ts:958-968`) and `drainFinalizeQueueByBudget(budgetMs)` (`chunkManager.ts:975-983`) are the two drain entry points. `update()` (`chunkManager.ts:1454`) calls `drainFinalizeQueue(CHUNKS_FINALIZED_PER_FRAME)` at **`chunkManager.ts:1460`**.
- `update()` is called from **`src/app/gameLoop.ts:883`**, inside `withCategory(monitor, 'TERRAIN', () => { bundle.chunkManager.update(...) })`, during the tick's simulate phase — **before** `renderStart = performance.now()` (`gameLoop.ts:1003`) and before `bundle.ocean.renderMirror(renderer, scene, camera)` (`gameLoop.ts:1007`).

**Important same-tick fact:** chunk-finalize and the water-mirror render happen in the same synchronous tick, finalize first. There is no existing hook that reports *which* object(s) were newly attached this frame — `update()` returns `void`, and `finalizeQueue`/`runFinalize` don't surface their targets to the caller. Any experiment either needs a small additive hook (mirroring the existing `finalizeQueue` pattern) or must operate on the whole scene rather than a per-chunk delta.

## 2. Renderer lifecycle

- `src/render/createRenderer.ts` constructs a single `THREE.WebGLRenderer` (`createRenderer.ts:11-19`) and returns it. Called once from **`src/app/createApp.ts:194`**: `const renderer = createRenderer(container, config.postProcessing.pixelRatioCap)`.
- The renderer is **not** part of `WorldBundle` (`src/app/worldBundle.ts`) — it's a local in `createApp.ts`, closed over by `gameLoop.ts` (which receives it as a parameter/closure) and passed explicitly into `postProcessing.render()` and `bundle.ocean.renderMirror(renderer, scene, camera)` at each call site.
- `bundle.chunkManager` (`createChunkManager(scene, cfg)`, `worldBundle.ts:116`) does **not** receive `renderer` at all today — only `scene`. So `chunkManager.ts` cannot call `renderer.compileAsync()` itself without a new parameter being threaded in.
- The mirror camera is **not exposed**. `waterMirror.ts`'s `createWaterMirror()` keeps `mirrorCamera` as a closure-local `PerspectiveCamera` (`waterMirror.ts:87`) and the returned `WaterMirror` object only exposes `uniforms`, `setEnabled`, `isEnabled`, `render`, `dispose` (`waterMirror.ts:53-60`) — no accessor for the camera or the render target.
- The mirror render target (`renderTarget`, `waterMirror.ts:81`) is likewise closure-local and not exposed.

**Practical conclusion:** the natural integration point for the experiment is **`gameLoop.ts`**, right after `bundle.chunkManager.update(...)` (line 883) and before `bundle.ocean.renderMirror(...)` (line 1007) — both `renderer` and `scene` are already in scope there. Reaching the mirror-specific render target/camera, however, requires a small accessor addition to `WaterMirror` (see §4) — there's no way around this without exposing something from `waterMirror.ts`, since nothing outside that closure can see the RT or the mirror camera today.

## 3. What `renderer.compileAsync()` actually does in Three.js 0.180.0

Source: `node_modules/three/src/renderers/WebGLRenderer.js:1301-1466`, `node_modules/three/src/renderers/webgl/WebGLProgram.js`, `node_modules/three/src/renderers/webgl/WebGLPrograms.js`.

```ts
this.compileAsync = function (scene, camera, targetScene = null) {
  const materials = this.compile(scene, camera, targetScene)
  return new Promise((resolve) => {
    function checkMaterialsReady() {
      materials.forEach((material) => {
        const program = properties.get(material).currentProgram
        if (program.isReady()) materials.delete(material)
      })
      if (materials.size === 0) { resolve(scene); return }
      setTimeout(checkMaterialsReady, 10)
    }
    if (extensions.get('KHR_parallel_shader_compile') !== null) checkMaterialsReady()
    else setTimeout(checkMaterialsReady, 10)
  })
}
```

Key facts, all confirmed by reading the source directly (not inferred):

1. **`compile()` gathers lights from `targetScene` (or `scene` if no target given) via `traverseVisible`, filtered by `object.layers.test(camera.layers)`** (`WebGLRenderer.js:1312-1344`). Materials, however, are gathered from `scene` via a **plain `scene.traverse()`** (`WebGLRenderer.js:1354`) — **not filtered by camera layers at all**. So `camera` only affects which lights are counted; it does not restrict which materials get compiled.
2. **The JSDoc explicitly documents the intended "add to an existing scene" pattern**: *"If you want to add a 3D object to an existing scene, use the third optional parameter for applying the target scene"* (`WebGLRenderer.js:1291-1294`). I.e. `renderer.compileAsync(newObject, camera, liveScene)` compiles only `newObject`'s materials while still gathering correct lighting from the whole live scene. This is exactly the shape needed for a per-chunk prewarm, once chunk-finalize exposes the newly-attached root (see §1's gap).
3. **`compile()`/`getProgram()` calls `gl.linkProgram()` immediately** when constructing a new `WebGLProgram` (`WebGLProgram.js:916`, inside the module-level program-build code, not deferred) — this is a cheap, non-blocking GPU command submission, same call used by the real render path.
4. **`compile()` never calls `program.getUniforms()`/`getAttributes()`.** Those are the methods that trigger `onFirstUse()` (`WebGLProgram.js:1017-1028`, `1034-1044`), which is where `gl.getProgramInfoLog()`/`gl.getShaderInfoLog()` actually get called (`WebGLProgram.js:918-930`, gated by `renderer.debug.checkShaderErrors`). **This is the crux of the whole investigation:** `compileAsync()` does not itself trigger the expensive call research 012 measured. It only submits the compile+link job and waits (via polling) for the *driver* to report completion. The expensive `getProgramInfoLog()` call still happens later, on the render path's first real use (`getUniformList()` → `materialProperties.currentProgram.getUniforms()` → `WebGLRenderer.js:2149`). What `compileAsync()` can change is whether that later call finds the driver **already done** (cheap, no wait) or **still compiling** (same synchronous multi-hundred-ms stall as today, just possibly shorter if some of the work already happened).
5. **`isReady()` is gated on the `KHR_parallel_shader_compile` extension.** `WebGLProgram.js:1050`: `let programReady = (parameters.rendererExtensionParallelShaderCompile === false)`. Read literally: if the extension is **not** supported, `programReady` starts **`true`** — `isReady()` reports done immediately, without ever having actually waited for real compilation. The code comment confirms this is deliberate: *"if the KHR_parallel_shader_compile extension isn't supported, flag the program as ready immediately. It may cause a stall when it's first used."* **If Chrome/ANGLE on the target machine doesn't expose `KHR_parallel_shader_compile`, `compileAsync()` degrades to firing off `linkProgram()` and resolving on the next tick without any real prewarming guarantee** — the driver may still be mid-compile when the real render calls `getProgramInfoLog()` later, in which case the full stall still happens, just possibly with less remaining work. **This needs to be verified for the actual dev machine/browser before trusting the experiment's result** (`chrome://gpu` → Driver Bug Workarounds / WebGL extension list, or `gl.getExtension('WEBGL_debug_renderer_info')` + `getSupportedExtensions()` in devtools console) — not yet checked as part of this planning pass.
6. **The program cache key's `outputColorSpace`/`toneMapping` are derived from the renderer's *current render target at call time*, not from the `camera` argument.** `WebGLPrograms.js:110`: `const currentRenderTarget = renderer.getRenderTarget();` — read live, synchronously, when `getParameters()` runs inside `compile()`. If `currentRenderTarget !== null` and not XR: `outputColorSpace = LinearSRGBColorSpace` and (`WebGLPrograms.js:165-175`) `toneMapping = NoToneMapping` regardless of `material.toneMapped`. **The mirror camera's identity plays no role in producing the mirror-specific program variant** — this matches research 012's own finding ("camera identity itself is not the cause"). What matters is whether `renderer.setRenderTarget(mirrorRenderTarget)` was called before `compileAsync()`, exactly mirroring what `waterMirror.ts:182` (`renderer.setRenderTarget(renderTarget)`) does before its own `renderer.render(scene, mirrorCamera)` call at `waterMirror.ts:185`.

### Answering the task's key question directly

> Czy `renderer.compileAsync(scene, mirrorCamera)` faktycznie może przygotować ten sam wariant WebGLProgram, który później jest używany przez `waterMirror.render()`?

**Not as written.** `compileAsync(scene, mirrorCamera)` alone, called with whatever render target happens to be currently bound (almost certainly `null`/the default framebuffer, since it'd run from `gameLoop.ts` outside any render pass), would compile the **main-canvas variant** (`SRGBColorSpace` + `ACESFilmicToneMapping`), not the mirror variant. The `mirrorCamera` argument by itself changes nothing about the program variant produced — only the render-target state does. To actually prewarm the mirror-specific `WebGLProgram`, the call needs to be:

```ts
renderer.setRenderTarget(mirrorRenderTarget) // same RT waterMirror.ts:182 uses
await renderer.compileAsync(newlyFinalizedRoot, mirrorCamera, scene)
renderer.setRenderTarget(previousTarget)      // restore, same as waterMirror.ts:188
```

`mirrorCamera` here is still useful for correct light-layer filtering (mirror camera is layer-0-only; using the main camera would gather lights that don't apply to layer-1/2 objects the mirror never sees — though in practice most lights are layer-0 anyway, so this is a minor correctness detail, not the load-bearing part).

## 4. Mirror render path — what's missing to prewarm it correctly

`src/world/waterMirror.ts` and `src/world/createOcean.ts` confirm the pattern above: `waterMirror.ts:177-188` does exactly `setRenderTarget(renderTarget) → render(scene, mirrorCamera) → setRenderTarget(previous)`, bracketed with `xr.enabled = false` / `shadowMap.autoUpdate = false` toggles that don't affect the program cache key.

To replicate this for a `compileAsync()` prewarm, `WaterMirror`'s returned object needs **two small additive accessors** it doesn't currently have (`waterMirror.ts:53-60`):

- a way to get `mirrorCamera` (or expose a `prewarm(renderer, objectOrScene, targetScene?)` method on `WaterMirror` itself that internally does the `setRenderTarget`/`compileAsync`/restore dance — arguably cleaner, since it keeps the RT and camera fully encapsulated and mirrors the shape of `render()` right next to it).
- the render target itself (only needed if not wrapped in a `WaterMirror`-owned method).

This is a small, additive, in-place change to an existing module — not a new system — consistent with the project's "extend existing couplings" principle.

**One non-obvious finding worth flagging for the eventual real fix (not needed for the diagnostic-only experiment, but useful context):** `src/render/createPostProcessing.ts:65-108` builds an `EffectComposer` chain where the actual scene-drawing pass (`RenderPass` at `createPostProcessing.ts:72-74`, or `N8AOPass` at `createPostProcessing.ts:76-83` when AO is on) writes into the composer's own internal `WebGLRenderTarget` (`writeBuffer`/`readBuffer`), **not** the default framebuffer — only the final `outputPass` (`createPostProcessing.ts:107-108`) targets the screen. That means the main-canvas scene-render pass **also** runs with `currentRenderTarget !== null`, i.e. it also gets `LinearSRGBColorSpace` + `NoToneMapping` in its cache key — **the same combination as the mirror pass**. If that reading is correct, the `postprocessing` hitch (review 019's 4th top hitch, 94.98ms) and the `water-mirror` hitch are likely hitting the **same** `WebGLProgram` cache-key variant, not two independent ones. That would mean a single successful mirror-target prewarm could incidentally also cover the main scene-render pass's variant — worth confirming with the benchmark (see §7) rather than assuming.

## 5. Minimal A/B change

Given §1's gap (no per-frame "what got attached" signal) and §3's finding that `compile()`'s early-out (`WebGLRenderer.js:2074`, `materialProperties.currentProgram === program`) makes repeat calls over already-known materials cheap, the **smallest** version that needs zero `chunkManager.ts` plumbing is:

1. Add `prewarm(renderer, scene)` to `WaterMirror`'s returned object (`waterMirror.ts`), doing:
   ```ts
   prewarm(renderer, scene) {
     if (!enabled || disposed) return Promise.resolve()
     const previousTarget = renderer.getRenderTarget()
     renderer.setRenderTarget(renderTarget)
     const p = renderer.compileAsync(scene, mirrorCamera)
     renderer.setRenderTarget(previousTarget)
     return p
   }
   ```
   (Full `scene` as the first arg, not a `targetScene` split — the scoped-to-new-chunk version is a follow-on optimization, not needed to test the core hypothesis.)
2. In `gameLoop.ts`, immediately after `bundle.chunkManager.update(...)` (line 883) and gated so it only fires when something was actually finalized this tick (or, simplest, once per tick if not currently "compiling" — see §6 for why overlap must be avoided) and only when `bundle.ocean.isEnabled()`-equivalent is true, call:
   ```ts
   if (!compiling) {
     compiling = true
     void bundle.ocean.prewarmMirror(renderer, scene).finally(() => { compiling = false })
   }
   ```
   (`WorldOcean` needs a one-line passthrough to `waterMirror.prewarm`, same shape as `renderMirror`.)
3. Temporarily flip `renderer.debug.checkShaderErrors` back to `true` in `createRenderer.ts` for the duration of the experiment (reverting `aaeee34`'s line) — otherwise the hitch this experiment is testing for is already suppressed and the A/B has nothing to measure (see the discrepancy note above).
4. Add lightweight timing marks around both the prewarm call and `bundle.ocean.renderMirror(...)` (reintroducing something like the `seedvale:*` marks research 011/012 used — currently absent from the working tree, per `git status`/grep) so the benchmark run in §7 can attribute time correctly.

Everything here is temporary/diagnostic, reversible, and touches only `waterMirror.ts` (additive method), `createOcean.ts` (one passthrough), `gameLoop.ts` (call site), and `createRenderer.ts` (revert one line for the duration of the test) — no new files, no new manager/service.

## 6. Not blocking the tick

- `void renderer.compileAsync(...).then(...)` **must not be awaited** inside the synchronous tick — `gameLoop.ts`'s tick function drives `bundle.ocean.renderMirror(...)` and `postProcessing.render()` synchronously moments later in the *same* call; an `await` there would suspend the rest of that frame's rendering until the promise resolves (which, per §3, takes at least one `setTimeout(10)` round-trip even in the best case), not "block" in the GPU-stall sense but still restructure frame timing in a way that's easy to get subtly wrong (e.g. a frame where render never happens because the tick function returned early awaiting a promise that resolves after the next `requestAnimationFrame` has already fired).
- A **same-tick win is not actually possible.** `chunkManager.update()` (which finalizes) and `bundle.ocean.renderMirror(...)` run back-to-back in the same synchronous tick (`gameLoop.ts:883` then `:1007`). Even a perfectly non-blocking `compileAsync()` call inserted between them cannot finish compiling before the mirror render several lines later in the same synchronous JS turn — `compileAsync()`'s fastest path still needs at least one `setTimeout(10, …)` macrotask hop to resolve. So the benefit, if any, can only show up **on a later tick**: prewarm kicked off this frame, resolves 1+ frames later, and *that* pays off only if the same material's first real mirror-visible render happens on a frame after the prewarm resolves. Per review 019's measured data, `chunk-finalize` precedes the hitch-carrying tick by only 13–44ms (often the very next tick) — that's a tight window. **This is a real risk to the hypothesis, not just an implementation detail — flagged explicitly in §8 "Expected result."**
- Must guard against **overlapping `compileAsync()` calls**: firing a new one every tick while a previous one is still polling would pile up concurrent `setTimeout` chains and repeated full-`scene.traverse()` calls. The `compiling` boolean guard in §5 step 2 is the minimum needed; a real implementation would likely want to batch multiple ticks' worth of new chunks into one `compileAsync()` call rather than firing on every tick a chunk finalizes.
- The experiment should **not** call `compileAsync()` synchronously right inside `runFinalize()`/`attachChunkMesh()` in `chunkManager.ts` — that function runs inside the same synchronous drain loop budget (`CHUNKS_FINALIZED_PER_FRAME` / `FINALIZE_DRAIN_BUDGET_MS`, `chunkManager.ts:958-983`) that's deliberately kept cheap per frame; even a non-blocking `compileAsync()` call's synchronous portion (`compile()`'s full scene traversal + light gathering, `WebGLRenderer.js:1312-1386`) is real CPU work that would compete with that budget.

## 7. Scope of the experiment (explicitly excluded, per the task)

Not proposed here: whole-scene prewarm every frame, per-chunk `compileAsync()` without batching, a new global "shader manager," render-pipeline restructuring, a Three.js upgrade, material changes, or keeping `checkShaderErrors = false` as the answer. The change in §5 is temporary/diagnostic and should be reverted (or turned into a real batched implementation) after the A/B, not left as-is.

---

## Finding

`compileAsync()` in Three.js 0.180.0 can plausibly prevent the water-mirror hitch, but only **conditionally**: it depends on (a) `KHR_parallel_shader_compile` actually being supported by the browser/driver on the target machine (unverified — see §3.5), and (b) there being enough lead time between when a chunk's mesh/material is prewarmed and when it's first drawn by the mirror pass, which per the existing trace data (13–44ms gap, same-or-next tick) may be too tight for `compileAsync()`'s `setTimeout`-driven polling to reliably finish first (see §6). It is not a guaranteed fix; it's a genuinely open experiment.

Separately and unconditionally true regardless of `compileAsync()`: **the repository currently has `renderer.debug.checkShaderErrors = false` committed to `main`** (commit `aaeee34`), contradicting the task briefing's premise that it was reverted to `true`. This must be resolved with the user before any experiment result can be interpreted.

## Exact integration point

`src/app/gameLoop.ts`, between `bundle.chunkManager.update(...)` (line 883) and `bundle.ocean.renderMirror(renderer, scene, camera)` (line 1007) — both `renderer` and `scene` are already in scope there, unlike inside `chunkManager.ts` (which has neither `renderer` nor mirror internals) or inside `waterMirror.ts` (which has the mirror internals but isn't currently called from the finalize path). Requires one additive method on `WaterMirror` (`waterMirror.ts`) to reach the mirror camera/render target, and one passthrough on `WorldOcean` (`createOcean.ts`).

## Mirror variant

Yes, achievable, but only by setting `renderer.setRenderTarget(mirrorRenderTarget)` **before** calling `compileAsync()` — the mirror camera argument itself does not affect which `WebGLProgram` variant gets produced (§3.6). The render target's non-null state is what drives `LinearSRGBColorSpace` + `NoToneMapping` into the cache key, matching what `waterMirror.render()` produces at `waterMirror.ts:182-188`.

## Minimal A/B change

See §5 in full: one additive `prewarm()` method on `WaterMirror`, one passthrough on `WorldOcean`, one guarded call site in `gameLoop.ts` right after chunk-finalize, and a temporary revert of `createRenderer.ts:20`'s `checkShaderErrors = false` for the duration of the test (needed to have a hitch to measure at all).

## Risks

- **`KHR_parallel_shader_compile` may not be supported** on the dev machine's browser/driver — unverified in this pass. If absent, `compileAsync()` degrades to a near-immediate resolve without real prewarming guarantee (§3.5), and the experiment would show no improvement for a reason unrelated to the underlying hypothesis.
- **Lead-time risk**: chunk-finalize and the mirror render of that same chunk can be the same or the very next tick (§6) — `compileAsync()`'s minimum `setTimeout(10)` round-trip may not consistently beat that window, especially under load when the event loop is already busy.
- **Wrong-variant risk if the render-target bracket is forgotten** — compiling with the default (`null`) target produces the main-canvas variant, not the mirror one, and would silently fail to help while looking like a no-op result.
- **Over-compilation**: `compile()`'s material gathering is not camera-layer-filtered (§3.1) — passing the full `scene` compiles every material reachable in the tree, including ones the mirror camera's layer mask (`layers.set(0)`) would never actually draw (water/agent-layer materials). Wasted work, though bounded by the early-out for already-cached materials.
- **Repeated concurrent calls**: firing `compileAsync()` on every tick that has new chunks, without the `compiling` guard, would stack `setTimeout` polling chains and repeat full-scene traversals.
- **CPU cost inside the finalize budget** if mistakenly placed inside `chunkManager.ts`'s drain loop rather than `gameLoop.ts` (§6, last bullet) — `compile()`'s synchronous scene traversal is real work competing with the deliberately-small per-frame finalize budget.
- **Interaction with the postprocessing pass is unverified, not assumed**: §4's finding that the main scene-render pass likely shares the mirror's non-null-target program variant is a plausible reading of the source, not yet confirmed by a benchmark — treat it as a thing to check, not a guarantee that fixing the mirror hitch also fixes the `postprocessing` hitch.

## Benchmark

Run the same `stream` benchmark scenario (`src/perf/benchmarkScenarios.ts` / `src/perf/benchmark.ts`) used in research 011/012, at the same settings (High quality, pixel ratio 1, 30s), three times:

1. **Baseline A** — current `main` as-is (`checkShaderErrors = false`): confirms whether the original hitch is in fact currently absent, per the discrepancy note above.
2. **Baseline B** — `checkShaderErrors` reverted to `true`, no prewarm: should reproduce research 012's hitch pattern (this is the actual apples-to-apples baseline for the experiment).
3. **Experiment** — `checkShaderErrors = true` + the §5 prewarm wired in.

Compare, per run: max frame time, count/size of hitches ≥8ms (using whatever threshold the benchmark harness already reports, per research 012's "Hitches (>= 8 ms)" output), and — if the temporary `seedvale:*`-style marks from §5 step 4 are reinstated — the specific `water-mirror` and `postprocessing` sub-span durations and their relationship to the nearest prior `chunk-finalize`. FPS (avg/p95) as a secondary signal only; it's not sensitive enough on its own to detect a handful of large hitches in a 30s run.

## Expected result

If the hypothesis holds and lead time is sufficient: Experiment run shows `water-mirror` sub-span durations collapsing to normal (single-digit ms) even with `checkShaderErrors = true`, matching Baseline A's absence-of-hitch outcome but with error checking intact. If lead time is the limiting factor (§6's risk): Experiment run may show a *smaller* hitch than Baseline B (partial credit — driver had a head start) rather than a fully eliminated one, or the hitch may simply move to whichever later tick actually first renders that chunk in the mirror if that's later than the finalize tick. If `KHR_parallel_shader_compile` is unsupported: Experiment run should look statistically indistinguishable from Baseline B.

## Recommendation

Worth running — it's a bounded, reversible, few-line experiment that directly tests research 012's own proposed next step, and the source-level analysis above (§3) already surfaces two concrete failure modes (extension support, lead time) to watch for rather than treating a positive or negative result as unexplained. But **first resolve the discrepancy**: confirm with the user whether `checkShaderErrors = false` (commit `aaeee34`) was an intentional permanent decision or should be reverted — the experiment is meaningless without deciding that first, since it's the toggle that determines whether there's a hitch to measure at all.
