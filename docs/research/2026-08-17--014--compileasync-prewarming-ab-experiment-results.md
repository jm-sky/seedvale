# Research 014: `renderer.compileAsync()` mirror prewarming — A/B experiment results

**Status:** `confirmed` (negative result)
**Date:** 2026-08-17
**Scope:** Implemented and benchmarked the diagnostic `compileAsync()` prewarm experiment planned in [research 013](2026-08-16--013--compileasync-prewarming-plan.md), through four increasingly refined variants, on `three@0.185.1`. All four variants regressed performance relative to no prewarm; the two most refined variants also showed signs of destabilizing renderer state. **All diagnostic code has been reverted — nothing from this experiment is on `main` or in the working tree.**

## Context

Continues [research 011](2026-08-16--011--streaming-hitch-investigation.md) → [review 019](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md) → [research 012](2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md) (names `gl.getProgramInfoLog()` as the ~545ms blocking call in the water-mirror render path) → [research 013](2026-08-16--013--compileasync-prewarming-plan.md) (plans this experiment, flags that `checkShaderErrors=false`, commit `aaeee34`, was already silently masking the hitch on `main`).

Before this experiment, `three` was upgraded `0.180.0` → `0.185.1` (plan [136](../plans/archive/2026-08-16--136--threejs-180-to-185-upgrade.md)). Re-read of `compileAsync()`/`WebGLProgram.js`/`WebGLPrograms.js` in the installed `0.185.1` source confirmed the mechanics research 013 documented for `0.180.0` are unchanged line-for-line: `onFirstUse()` still gates `getProgramInfoLog()`/`getShaderInfoLog()` behind `renderer.debug.checkShaderErrors`, `compile()` never calls `getUniforms()`/`getAttributes()` itself, and the program cache key still reads `renderer.getRenderTarget()` live at call time.

## Precondition: `checkShaderErrors` restored to `true`

`src/render/createRenderer.ts` had `renderer.debug.checkShaderErrors = false` committed (`aaeee34`). This was reverted to the Three.js default (`true`) for the duration of testing, per research 013's explicit warning that testing with it `false` would suppress the very hitch the experiment is trying to measure. **This revert was itself reverted along with everything else at the end of the experiment** — `main` still has `checkShaderErrors = false` as it did before this experiment started. That original tradeoff (perf vs. shader error visibility) is unresolved and out of this experiment's scope to decide.

## Baseline (no prewarm, `checkShaderErrors=true`)

30s `stream` benchmark, High quality, pixel ratio 1:

```
avg FPS: 45.5    max frame: 254.4 ms    p95: 35.8 ms
```

No `water-mirror`-specific hitch instrumentation exists in the current tree (the `seedvale:*` marks from research 011/012 were never committed), so this baseline could not be directly compared against research 012's originally-measured 615–732ms mirror-specific long tasks — only aggregate frame-time metrics were available throughout this experiment. This is a real evidence gap, noted but not closed here.

## v1 — naive: unconditional full-scene prewarm every tick

**Implementation:** `WaterMirror.prewarm(renderer, scene)` — binds the mirror render target, calls `renderer.compileAsync(scene, mirrorCamera)` (whole scene), restores the target. Called from `gameLoop.ts` right after `chunkManager.update()`, guarded only against overlapping calls (fires again as soon as the previous one resolves — effectively every tick, since resolution is a single `setTimeout(10)` round trip).

**Result:**

```
avg FPS: 24.9 (vs. 45.5 baseline)    max frame: 1637.4 ms (vs. 254.4 ms)    p1 FPS: 10
```

**Diagnosis:** `compile()`'s synchronous portion — a full `scene.traverse()` gathering every material in the world (400+ meshes in the settlement alone) — ran on nearly every tick, unwrapped by any timing category, silently stealing main-thread time between other systems. This is exactly the "over-compilation"/"CPU cost" risk research 013 flagged as theoretical (§6); it turned out to dominate.

## v2 — gated + scoped, with an accumulating queue

**Implementation:** `chunkManager.update()` changed to return `readonly Object3D[]` — every `scene.add()` site in `attachChunkMesh`/`attachChunkContent`/`buildPlacementGroup` now also records the newly attached root into a per-call scratch array. `WaterMirror.prewarm(renderer, roots, scene)` changed to take those specific roots and compile each one separately (`compileAsync(root, mirrorCamera, scene)`, `scene` only as `targetScene` for lighting). `gameLoop.ts` only fires a prewarm when something was actually finalized, and — to avoid dropping coverage during a busy streaming burst — accumulates roots arriving while a previous batch is in flight into `pendingPrewarmRoots`, flushing the whole backlog as one batch once free.

**Result:**

```
avg FPS: 13.6    max frame: 9805.4 ms
```

(This specific run's scene was also ~3× heavier than prior runs — 19.35M avg triangles vs. ~6.39M baseline, 171,627 grass instances vs. 4,200 — a known confound of the `stream` benchmark's non-deterministic path, documented previously in the three.js-upgrade implementation notes. Not fully separable from the prewarm's own cost in this data.)

**Diagnosis:** the accumulate-while-busy design has a footgun — a large backlog gets flushed as one synchronous batch (`Promise.all(roots.map(root => renderer.compileAsync(...)))` still runs `compile()` synchronously per root before any promise settles), so a busy tick can turn into one arbitrarily large synchronous block. This inverted the intent: avoiding dropped coverage under load made the worst case *worse* specifically under the load conditions (streaming bursts, dense scenes) where it matters most.

## v3 — capped batch size (max 4 roots/flush)

**Implementation:** added `PREWARM_MAX_ROOTS_PER_BATCH = 4`; each flush takes at most 4 roots off the front of the queue via `.splice(0, 4)`, leaving the rest for subsequent ticks instead of flushing the whole backlog at once.

**Result:**

```
avg FPS: 33.4    max frame: 9805.4 ms (unchanged from v2's peak)
```

Also, for the first time, **console GL errors appeared**:

```
x147  GL_INVALID_OPERATION: glDrawElements: Mismatch between texture format and sampler type (signed/unsigned/float/shadow).
x46   GL_INVALID_OPERATION: glDrawElementsInstanced: Mismatch between texture format and sampler type (signed/unsigned/float/shadow).
```

(Plus an expected, unrelated `Program Info Log` gradient-instruction warning — that one is simply `checkShaderErrors=true` doing its job on a pre-existing shader, not a new issue.)

**Diagnosis:** the GL error counts (147 + 46) tracked closely with `STREAMING: 46` critical spikes / `chunk mesh n=46` hitches that same run — i.e., correlated with chunk-finalize events, exactly what the prewarm hooks into. Leading hypothesis at the time: `prewarm()` was compiling the mirror-target program-cache-key variant for *every* newly finalized root, including the water mesh itself (`WATER_RENDER_LAYER`), which the mirror camera (`layers.set(0)`) never actually draws — `compile()`'s material-gathering `scene.traverse()` is confirmed (by source read) to **not** be camera-layer-filtered, so this waste is real. Capping batch size did not fix the max-frame regression, confirming batch size alone wasn't the (or the only) driver.

## v4 — layer-filtered (mirror-visible roots only)

**Implementation:** `WaterMirror.prewarm()` added `roots.filter((root) => root.layers.test(mirrorCamera.layers))` before compiling — excluding water-layer and any non-layer-0 roots, so only what the mirror camera would actually render gets compiled. Batch cap and gating from v3 kept unchanged.

**Result:**

```
avg FPS: 3.3 (vs. 13.6 in v3, 45.5 baseline)
max frame: 4829.8 ms
WATER system category: 209.4 ms average PER FRAME, sustained across the whole 30s run
```

**Diagnosis:** this is qualitatively different from v1–v3. The `WATER` timing category wraps the *real* `bundle.ocean.renderMirror(...)` call, not the diagnostic prewarm (which is fire-and-forget and untimed). A 209ms **average**, not occasional spikes, means the real mirror render itself was consistently slow for the entire run — not an intermittent first-use compile stall. No mechanical bug was found in the added code (the filter runs before any GL state change, and the render-target bind/restore ordering is unchanged from v3), but the working hypothesis is that interleaving `compileAsync()` calls against the mirror render target with the real `renderMirror()` call later in the same tick may be corrupting per-material program-cache bookkeeping (`materialProperties.currentProgram`) in a way that forces the real mirror pass onto a slow relink/re-resolve path on every draw. **This was not verified against the three.js source** — the experiment was stopped before that investigation, per the decision below.

## Decision to stop

Four consecutive designs — naive, gated+scoped+queued, capped-batch, layer-filtered — each performed **worse** than the one before, never better than the no-prewarm baseline (254ms max frame) at any point. The final variant produced a sustained, severe regression (3.3 avg FPS, 209ms/frame average water cost) plus real `GL_INVALID_OPERATION` draw-call errors in the variant before it. This consistent, worsening trend — rather than a single bad result — was the basis for stopping instead of proposing a fifth variant. Continuing to iterate against the live dev server risked chasing a moving target without a verified mechanism.

## What this does and doesn't prove

**Shown:**
- `compileAsync()` prewarming, in every scoping/gating/batching shape tried here, made `stream` benchmark frame times worse than doing nothing, sometimes by an order of magnitude.
- The naive full-scene-every-tick cost (v1) is real and matches research 013's own predicted risk.
- `compile()`'s material-gathering traversal is not camera-layer-filtered — confirmed directly from `three@0.185.1` source, independent of the benchmark results.
- The most targeted variant (v4) correlates with a severe, sustained (not spiky) real-mirror-render slowdown, suggestive of renderer-state interference rather than pure CPU cost.

**Not shown / open:**
- No `water-mirror`-specific timing marks existed in the working tree during this experiment, so none of the four variants could be directly checked against research 012's original ~615–732ms mirror-hitch measurement — only aggregate frame-time/FPS metrics were available.
- The exact mechanism behind v3's `GL_INVALID_OPERATION` errors and v4's sustained `WATER` slowdown was not isolated. Both are plausible-but-unverified hypotheses (mirror-variant compile of layer-irrelevant materials for v3; program-cache interference for v4), not confirmed root causes.
- Whether a *correctly*-implemented prewarm (e.g., avoiding whatever state interaction v4 triggered) could still work is genuinely unknown — this experiment ruled out four specific implementations, not the general approach.

## State of the repository

All diagnostic changes (`createRenderer.ts`, `waterMirror.ts`, `createOcean.ts`, `chunkManager.ts`, `gameLoop.ts`) were reverted via `git checkout --` before this document was written. Nothing from this experiment was ever committed. `main`/working tree match the pre-experiment state exactly, including `checkShaderErrors = false` (`aaeee34`) still in place — the original, not-yet-resolved tradeoff research 013 flagged.

## Recommendation for future work

1. **Do not resume `compileAsync()`-based mirror prewarming without first isolating the v3/v4 anomalies in a minimal repro** — a dedicated small scene, not the full `stream` benchmark, so GL-error and renderer-state questions can be answered directly (e.g. via `EXT_disjoint_timer_query`, a WebGL debug context, or stepping through `WebGLPrograms`/`WebGLTextures` state) rather than inferred from aggregate frame timing.
2. **Reintroduce the `seedvale:water-mirror`/`seedvale:postprocessing` timing marks** (research 011/012's instrumentation, never committed) before any further mirror-hitch work — comparing aggregate frame time across benchmark runs with ~3× scene-composition variance (documented in this doc and in the three.js-upgrade notes) is too noisy to draw conclusions from alone.
3. **Consider a different angle entirely**: rather than prewarming a second program variant, investigate whether the mirror pass's program-cache-key divergence from the main pass (`LinearSRGBColorSpace`/`NoToneMapping` vs. `SRGBColorSpace`/`ACESFilmicToneMapping`, driven by the non-null render target) can be avoided or reduced — e.g. sharing one variant across both passes — which would remove the need for a second compile pass rather than trying to hide its cost.
4. **The `checkShaderErrors=false` tradeoff remains open.** It suppresses the original ~545ms `getProgramInfoLog()` hitch but also suppresses real shader error visibility project-wide (research 012's own caveat). No replacement mitigation was found in this experiment.

## Related

- [Research 011](2026-08-16--011--streaming-hitch-investigation.md) · [Review 019](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md) · [Research 012](2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md) · [Research 013](2026-08-16--013--compileasync-prewarming-plan.md) (the plan this experiment executed)
- [Plan 136: three.js 0.180→0.185 upgrade](../plans/archive/2026-08-16--136--threejs-180-to-185-upgrade.md) — the `stream` benchmark's documented run-to-run variance
