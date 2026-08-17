# Research 015: Streaming-hitch + GL_INVALID_OPERATION — handoff

**Status:** `in progress` (handoff point — written to be a sufficient standalone starting point for a new session/model, so the source chain below does not need to be re-read to get oriented)
**Date:** 2026-08-17
**Why this doc exists:** this thread has run through 5 research docs and a lot of dead ends across one session. Rather than have a new session re-derive all of that from raw docs, this is the consolidated state: what's proven, what's ruled out, what's still open, and exactly what to do next.

---

## TL;DR

Two separate problems, in one investigation thread:

1. **Streaming hitch** (original problem): intermittent, very large frame hitch (up to ~800ms measured) in the water-mirror render path during chunk streaming. **Root cause identified with high confidence.** Currently only *worked around* (`checkShaderErrors=false`, trades away shader error visibility), not fixed. A proper fix (`compileAsync()` prewarming) was attempted through 4 variants — **all 4 made things worse**, two of them severely, and the code has been fully reverted. Not actively being worked right now; needs a decision (accept the workaround, or resume with a narrower repro — see §5). **New trace evidence (§4) casts doubt on whether the workaround is even fully effective — check that before deciding.**

2. **GL_INVALID_OPERATION sampler-mismatch errors** (newly discovered side quest, unrelated to #1): confirmed present on a clean `main` with zero diagnostic code active. Leading hypothesis: `n8ao` package's manual multi-render-target texture handling vs. the three.js 0.180→0.185 upgrade. **User has already bumped `n8ao` 2.0.0→2.0.1 (commit `b4081bf`) — this is UNVERIFIED, and there's a lockfile inconsistency that may mean the bump isn't even installed yet.** This is the most actionable next step (§6).

---

## 1. Streaming hitch — proven mechanism

Chain: [research 011](2026-08-16--011--streaming-hitch-investigation.md) → [review 019](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md) → [research 012](2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md).

```
chunk streaming → new material enters scene → next full-scene render
  → water-mirror pass first-uses a WebGLProgram variant it hasn't used before
  → onFirstUse() calls gl.getProgramInfoLog()/getShaderInfoLog()
    (gated by renderer.debug.checkShaderErrors, default true)
  → synchronous driver/GPU wait, ~545ms measured in one reproduction
  → ~615-732ms Long Task / frame hitch
```

Measured two independent ways: Perfetto trace (`kLinkProgram`-adjacent `gpu_toplevel` waits, main thread + GPU both idle during the wait — a CPU↔GPU sync stall signature, not compute) and Chrome Performance JS-stack sampling (named the exact call: `WebGLRenderer.render → getProgramInfoLog`, ~545ms of a 615ms long task). Controlled A/B: setting `checkShaderErrors=false` made the hitch pattern disappear in the same benchmark. This is why that flag ended up flipped (commit `aaeee34`) — **but it was left in place** rather than reverted after the diagnostic A/B, contradicting research 012's own explicit warning not to keep it as a permanent fix. It's still `false` on `main` today.

Mirror vs. main-canvas render use **different `WebGLProgram` cache-key variants** for the same material (mirror render target → `LinearSRGBColorSpace` + `NoToneMapping`; main canvas → `SRGBColorSpace` + `ACESFilmicToneMapping` — Three.js's program cache reads `renderer.getRenderTarget()` live, non-null vs. null target changes the key). Confirmed identical in `three@0.185.1` source (post-upgrade), not just `0.180.0`.

## 2. `compileAsync()` prewarming — planned, then tried, then reverted

Plan: [research 013](2026-08-16--013--compileasync-prewarming-plan.md). Results: [research 014](2026-08-17--014--compileasync-prewarming-ab-experiment-results.md) — **read 014 in full before touching this again**, it has per-variant benchmark numbers and diagnoses. Summary:

| Variant | What changed | Result vs. no-prewarm baseline (254ms max frame, 45.5 avg FPS) |
|---|---|---|
| v1 naive | full-scene `compileAsync()` every tick, unconditional | 1637ms max, 24.9 avg FPS — worse |
| v2 gated+scoped+queued | only fires on new chunks; scoped to just-finalized roots; accumulates backlog while busy | 9805ms max, 13.6 avg FPS — worse (partly confounded by a heavier benchmark scene that run) |
| v3 capped batch | max 4 roots flushed per tick from the backlog | 9805ms max unchanged, **plus first appearance of `GL_INVALID_OPERATION` sampler-mismatch errors** (147+46 occurrences, correlated with chunk-finalize event counts) |
| v4 layer-filtered | excludes non-mirror-visible roots (e.g. the water mesh itself) from what gets compiled | 4829.8ms max, 3.3 avg FPS, **`WATER` timing category sustained at 209ms/frame average (not spiky)** — qualitatively worse, looks like renderer-state interference not just CPU cost |

All four variants' code (`createRenderer.ts`, `waterMirror.ts`, `createOcean.ts`, `chunkManager.ts`, `gameLoop.ts`) was reverted via `git checkout --` before research 014 was written. **Confirmed nothing from this experiment is on `main`.**

Research 014's open questions, not yet investigated: the exact mechanism behind v3's GL errors and v4's sustained slowdown — both are plausible-but-unconfirmed hypotheses (wasted mirror-variant compiles of layer-irrelevant materials; program-cache interference from interleaving `compileAsync()` with the real `renderMirror()` call in the same tick).

## 3. The `checkShaderErrors=false` tradeoff — still unresolved

Removing it re-exposes the ~615-732ms hitch (proven, §1). Keeping it hides real shader compile/link errors project-wide, indefinitely, for everyone — not just during this investigation. No replacement mitigation exists. This has never been explicitly decided as an accepted tradeoff; it's a side effect of a diagnostic flip that stuck. **Worth a deliberate decision, not another silent default.**

## 4. New trace evidence (2026-08-17): stall still reproduces post-revert, dominant call shifted to `getProgramParameter`

Chrome Performance capture by the user, ~6s task, **bottom-up (inverted) call tree** — root node is the hot function itself, children are its *callers*:

```
(5,988.4 ms total) getProgramParameter
  (5,175.9 ms total) WebGLRenderer.render
    (5,141.1 ms) render — waterMirror.ts:109:5
      gameLoop.ts → monitor.ts → Function call (createApp.ts:1660:16) → _listenCallback (lil-gui.js:245:18)
  (875.8 ms total) render — EffectComposer.js:199:9 (postprocessing addon)
```

(User notes: sometimes an extra frame `renderMirror` — `createOcean.ts:67:5` — appears between `waterMirror.ts:109` and `gameLoop.ts`, i.e. the `WorldOcean.renderMirror()` passthrough; expected, just sometimes collapsed by the profiler.)

**Captured on the current, fully-reverted `main`** — no compileAsync experiment code, `checkShaderErrors=false` as committed. This is new evidence, independent of everything in §1-§2.

What it confirms and what it changes:

- **Same location as research 012**: `waterMirror.ts`'s `render()` → `WebGLRenderer.render()` is still the dominant cost, still specifically the mirror pass, not the main/beauty render (which shows up separately, far smaller, as the `EffectComposer.js` branch — 875.8ms of 5988.4ms total).
- **Different named WebGL call, much larger magnitude**: research 012 named `gl.getProgramInfoLog()` as the ~545ms blocking call, measured with `checkShaderErrors=true`. This trace names `gl.getProgramParameter()` instead, totaling ~6s — roughly 10× larger than anything measured before. Not yet established whether this is the same mechanism at a worse moment (e.g. many more first-use programs at once) or a distinct call in the link-status-check sequence.
- **Open question that actually matters**: if `getProgramParameter` turns out to be called *unconditionally* (not gated by `renderer.debug.checkShaderErrors`) in `three@0.185.1`'s `WebGLProgram.js`, then the `checkShaderErrors=false` workaround (§3) may not be preventing this stall at all — it may only ever have suppressed the smaller `getProgramInfoLog()`-specific case research 012 tested. **This needs a direct read of `WebGLProgram.js`'s current `getProgramParameter` call sites before assuming the workaround does what it's believed to do** — don't assume, check.
- **Unusual trigger path**: the call chain bottoms out at `lil-gui.js:245`'s `_listenCallback` calling into `createApp.ts:1660` as a "Function call" — not the normal chunk-streaming path (`chunkManager.update()` inside a `gameLoop.ts` tick). `lil-gui`'s `_listenCallback` is its live-value-polling mechanism for `.listen()`-bound GUI controllers. This ~6s stall may have coincided with a GUI interaction (e.g. a quality-preset change touching every material's program at once) rather than plain movement/streaming — worth confirming which, since it changes whether this is the same bug as §1 or a distinct, GUI-triggered trigger for the same underlying mechanism.

**Next step, before anything else in §6 or elsewhere:** read `node_modules/three/src/renderers/webgl/WebGLProgram.js` in the installed `0.185.1`, find every `gl.getProgramParameter` call site, and check each one against `renderer.debug.checkShaderErrors` gating. This directly determines whether §3's tradeoff is even doing what's assumed.

## 5. If resuming `compileAsync()` prewarming

Do not restart from v1. Per research 014 §"Recommendation for future work":

1. Build a **minimal isolated repro** (not the full `stream` benchmark) to pin down the v3 GL-error and v4 slowdown mechanisms directly — e.g. a WebGL debug context, or stepping through `WebGLPrograms`/`WebGLTextures` state — before writing any more prewarm code. Aggregate frame-time benchmarking was not precise enough to separate cause from confound across 4 variants; don't repeat that.
2. Reintroduce the `seedvale:water-mirror`/`seedvale:postprocessing` `performance.mark`/`measure` instrumentation (research 011/012 used it, never committed) so mirror-pass duration is directly measurable instead of inferred from aggregate frame time — the `stream` benchmark's scene composition varies up to ~3× between runs (documented in 014 and in the three.js-upgrade implementation notes), which makes aggregate-only comparisons unreliable.
3. Consider the different-angle alternative from 014: reduce/eliminate the mirror-vs-main program-variant divergence itself (the `LinearSRGBColorSpace`/`NoToneMapping` vs `SRGBColorSpace`/`ACESFilmicToneMapping` split, driven by render-target-bound state) rather than trying to hide the cost of compiling a second variant.

## 6. GL_INVALID_OPERATION — open, most actionable thread right now

### Symptom

```
GL_INVALID_OPERATION: glDrawElements: Mismatch between texture format and sampler type (signed/unsigned/float/shadow).
GL_INVALID_OPERATION: glDrawElementsInstanced: Mismatch between texture format and sampler type (signed/unsigned/float/shadow).
GL_INVALID_OPERATION: glDrawArrays: Mismatch between texture format and sampler type (signed/unsigned/float/shadow).
WebGL: too many errors, no more errors will be reported to the console for this context.
```

100+ occurrences per 30s `stream` benchmark run (High quality, pixel ratio 1). **Confirmed present with zero diagnostic/experiment code active and after a hard reset of browser data** — i.e. a real, reproducible, current bug on `main`, discovered incidentally while re-verifying the revert in §2, and *not* caused by the `compileAsync()` experiment.

### Ruled out (with code-level evidence, don't re-check these first)

- **Water `DataTexture`s** (`src/world/createWater.ts:25`, `src/world/waterMaterial.ts:32`) — `RedFormat`+`FloatType` per-chunk textures bind to matching `uniform sampler2D` declarations in the water GLSL. Format/sampler category (float) is consistent.
- **Terrain scorch feature** (`src/terrain/buildChunkGeometry.ts`, commit `f73e493`) — pure per-vertex color blending, no new textures/uniforms.
- **Shadow map** (`renderer.shadowMap.type = PCFShadowMap`, migrated from deprecated `PCFSoftShadowMap` in the three.js upgrade) — no custom `DepthTexture`/`customDepthMaterial`/`customDistanceMaterial`/shadow overrides exist anywhere in `src/`; shadow depth-texture allocation is entirely internal to three.js, untouched by Seedvale code.
- **`src/fauna/harvestedRemains.ts`** (new GLB assets `animal_hide.glb`/`bones_pile.glb`/`large_bone.glb`, commit `f73e493`) — standard `loadGltf`/clone path, no custom textures/shaders. **Also**: these objects only spawn after a player harvests an animal, which does not happen during the `stream` benchmark — they should not even be on screen, further weakening this candidate (confirmed by the user's domain knowledge, not just code reading).

### Leading hypothesis (medium confidence, NOT yet confirmed)

`n8ao` (ambient occlusion pass, `src/render/createPostProcessing.ts`) manually builds a multi-render-target with explicit per-attachment texture format/type overrides:

```js
// node_modules/n8ao/dist/N8AO.js:1785-1801 (configureEffectCompositer)
this.depthDownsampleTarget.textures[0].format = RedFormat;
this.depthDownsampleTarget.textures[0].type = FloatType;
this.depthDownsampleTarget.textures[1].format = RGBAFormat;
this.depthDownsampleTarget.textures[1].type = HalfFloatType;
// N8AO.js:1840
this.transparencyRenderTargetDWTrue.depthTexture = new DepthTexture(this.width, this.height, UnsignedIntType);
```

This is exactly the class of low-level manual MRT/`DepthTexture` setup that silently breaks when three.js's internal MRT attachment handling changes between minor versions. `git log -p -- package.json` confirmed `n8ao` (`^2.0.0` at the time) was **not** touched in commit `9cff7f3` (the three.js `0.180.0→0.185.1` bump) or since — only `three` moved, and `n8ao`'s loose peer dependency (`"three": ">=0.137"`) let it install without any compatibility warning. Error shapes fit: `glDrawArrays` matches N8AO's fullscreen composite/blit quads; the general `glDrawElements[Instanced]` errors fit N8AO's own scene pass (`N8AOPass` renders the scene itself as part of computing AO, see comment at `createPostProcessing.ts:67`).

**One unexplained gap:** error counts loosely tracked chunk-streaming volume across runs, but AO's own draw count should be roughly constant per frame regardless of streaming. Not fully explained by this hypothesis alone — flagged, not resolved.

### Current state — needs verification, not more theorizing

- User bumped `n8ao` `^2.0.0` → `^2.0.1`, committed as `b4081bf` (`chore(deps): update package dependencies and bump n8ao version to 2.0.1`).
- **That commit updated `pnpm-lock.yaml` but not `package-lock.json`** — as of this doc, `package-lock.json` still resolves `node_modules/n8ao` to `2.0.0`. The two lockfiles are out of sync. Depending on which package manager actually manages `node_modules` in this repo, the 2.0.1 bump may or may not actually be installed yet. **Check which lockfile is authoritative (there's a `pnpm-lock.yaml` — is `npm` or `pnpm` the real workflow here? `package-lock.json`'s presence alongside it is itself worth a raised eyebrow) and do a clean reinstall with the right tool before concluding anything about whether 2.0.1 fixes the errors.**
- Not yet done: re-running `?benchmark=stream` after a confirmed-correct n8ao 2.0.1 install, checking the console for `GL_INVALID_OPERATION`.

### Recommended next steps, in order

1. Resolve the lockfile inconsistency, do a clean install, confirm `node_modules/n8ao/package.json` actually says `2.0.1`.
2. Re-run the `stream` benchmark, check console for `GL_INVALID_OPERATION`. If gone: likely fixed, but see step 3 for full confirmation given the unexplained streaming-correlation gap above.
3. If errors persist (or to fully confirm even if they're gone): temporarily disable `N8AOPass` in `src/render/createPostProcessing.ts` and re-benchmark. Errors disappearing with AO off is strong independent confirmation regardless of the version bump's effect.
4. If still unresolved after that: re-open full investigation, but skip the ruled-out candidates above.

## 7. Unrelated parallel work — be aware, don't assume connection

Commit `f86a1f3` (`feat(render): add diagnostic logging for ambient occlusion auto-budgeting`), timestamped minutes before `b4081bf`, adds temporary diagnostic code to **the same file** (`src/render/createPostProcessing.ts`) — pins `N8AOPass` on and logs would-be auto-budget suppress/restore events to debug an unrelated "~20Hz AO tremble" issue (comment: *"Assigning it every frame was a candidate cause of the remaining ~20 Hz tremble"*). This was not made by this session/agent — origin unknown (possibly the user directly, possibly another session). It is **not confirmed to be related** to the GL_INVALID_OPERATION thread, but it touches the exact same AO code path, so: read it before making any AO-related change, and don't assume its diagnostic state (`__aoDiag` global, pinned-on AO) is either permanent or connected to §6.

## 8. Repo state as of this handoff

- `main` at commit `b4081bf`, working tree clean (confirmed via `git status`).
- `checkShaderErrors = false` still set in `src/render/createRenderer.ts` (§3, unresolved — and per §4, possibly not even effective against the `getProgramParameter` stall).
- `three@0.185.1` confirmed installed (`node_modules/three/package.json`).
- No `compileAsync()` experiment code remains anywhere (§2).
- `n8ao` bumped to `^2.0.1` in `package.json`/`pnpm-lock.yaml`, but `package-lock.json` stale at `2.0.0` — installed state unverified (§6).
- AO diagnostic logging (`__aoDiag`, unrelated tremble investigation) present in `createPostProcessing.ts` (§7).

## Full document chain (for deep detail only — not required reading to act on this doc)

- [Research 011](2026-08-16--011--streaming-hitch-investigation.md) — initial traces, hypothesis formation
- [Review 019](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md) — Perfetto trace analysis
- [Research 012](2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md) — named the exact blocking call, controlled A/B
- [Research 013](2026-08-16--013--compileasync-prewarming-plan.md) — prewarm experiment plan
- [Research 014](2026-08-17--014--compileasync-prewarming-ab-experiment-results.md) — 4-variant experiment results (detailed per-variant diagnosis, more than the summary table in §2 above)
- [Plan 136: three.js 0.180→0.185 upgrade](../plans/2026-08-16--136--threejs-180-to-185-upgrade.md) + [implementation notes](../plans/2026-08-16--136--threejs-180-to-185-upgrade-implementation-notes.md) — the upgrade that's implicated in both threads
- [Issue 033: bloom whiteout after three.js 185 upgrade](../issues/2026-08-17--033--bloom-whiteout-threejs-185-upgrade.md) — separate, already-diagnosed issue from the same upgrade (Sky sun-disc brightness × bloom composite formula) — mentioned here only as evidence this upgrade broke more than one thing, not directly related to §1 or §6
