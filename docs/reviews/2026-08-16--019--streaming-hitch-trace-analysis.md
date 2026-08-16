# Review 019: Streaming hitch — Perfetto trace analysis

**Status:** `verification needed`
**Date:** 2026-08-16
**Scope:** Trace-only analysis of `_temp/Trace-20260816T203706.json` (Chrome Performance recording, ~211.9 MB, 32.78s, captured during the `stream` benchmark) via Perfetto Trace Processor (`./trace_processor`, PerfettoSQL). No code changes, no benchmark changes, no new instrumentation.
**Not in scope:** Implementing a fix. The `seedvale:*` `performance.mark`/`measure` calls queried here are pre-existing uncommitted TEMP instrumentation in the working tree (`src/app/gameLoop.ts`, `src/render/createPostProcessing.ts`, `src/terrain/chunkManager.ts`) — not added by this review.
**Tools used:** `./trace_processor query` (PerfettoSQL) only. Source read: `src/render/createPostProcessing.ts` (`render()`), `git diff` of the three TEMP-instrumented files, to confirm what each `seedvale:*` span wraps.

---

## Finding

The trace does not contain an ~800ms slice anywhere (largest single slice of any kind is 249.95ms). It does contain a repeatable, smaller-scale instance of the same failure class: a handful of frames (max 225.17ms `seedvale:tick`) where the main thread goes essentially idle for 70–150ms inside a full-scene render pass — either `bundle.ocean.renderMirror()` (`seedvale:water-mirror`) or `postProcessing.render()`'s `composer.render()` (`seedvale:postprocessing`) — while the GPU process keeps ticking normally in small ~5ms bursts at vsync cadence. That signature (main thread idle, GPU not stalled, no JS/GC to account for the time) is the fingerprint of a synchronous CPU↔GPU round trip, not CPU compute. Every one of these hitches is preceded 13–44ms earlier by a `seedvale:chunk-finalize` slice — the point where newly streamed chunk meshes/materials are `scene.add()`'d. This matches the earlier manual Chrome Performance capture that showed `shaderSource`/`compileShader`/`linkProgram`/`getProgramInfoLog`/`getShaderInfoLog` under `render` near `createPostProcessing.ts` — the classic three.js first-use synchronous shader-compile-and-error-check path, which forces a GPU command-buffer flush and blocks the JS thread until the driver catches up.

## Evidence

Custom `seedvale:*` marks (`performance.mark`/`measure`, present as `legacy_async_process_slice` tracks) give real measured durations, not sampling — used throughout.

**No 800ms slice exists.** Top overall slice by `dur` across all tracks: `PipelineReporter` 249.95ms; top `RunTask` 228.29ms; top `seedvale:tick` 225.17ms; largest frame-to-frame gap between consecutive `seedvale:tick` starts: 241.87ms. 1592 ticks over 32.78s trace.

**Top non-startup hitches decompose almost entirely into one render sub-pass:**

| tick (ms) | dominant sub-span | % of tick | prior `chunk-finalize` |
|---|---|---|---|
| 225.17 | `water-mirror` 149.38ms | 66% | 17.7ms earlier |
| 183.46 | `water-mirror` 126.31ms | 69% | 43.9ms earlier |
| 108.63 | `water-mirror` 71.91ms | 66% | 13.2ms earlier |
| 101.25 | `postprocessing` 94.98ms | 94% (water-mirror only 0.009ms this frame) | 20.5ms earlier |

(A 5th top-5 tick, 182.73ms, is the very first frame in the trace — dominated by `seedvale:streaming` 160.78ms itself, i.e. one-time init cost, not this pattern; excluded above.)

**Main thread is idle during the worst stall.** All main-thread (`track_id=0`) slices during the 149.38ms `water-mirror` window: one `MinorGC` (1.13ms total GC tree) plus a few sub-millisecond `V8.StackGuard`/`V8.HandleInterrupts` checks. No other JS recorded for ~148ms of the 149.38ms window.

**GPU process is not stalled during that same window.** `CrGpuMain` runs `GPUTask` slices of ~5–6ms roughly every ~16.6ms (matching `GpuVSyncThread`'s vsync cadence) throughout — normal ongoing compositor activity, not a GPU-side hang.

**`chunk-finalize`/`chunk-mesh` are cheap in aggregate**, ruling out streaming compute itself as the direct cost: `chunk-finalize` avg 0.36ms (max 160.75ms, one outlier — see caveat below), `chunk-mesh` avg 5.39ms over 89 samples. `git diff src/terrain/chunkManager.ts` confirms `chunk-finalize` wraps `drainFinalizeQueue(...)`, i.e. exactly the step that attaches new meshes/materials to the live scene.

**Code confirmation of what each span wraps** (via `git diff`, both uncommitted TEMP instrumentation):
- `seedvale:water-mirror` = `bundle.ocean.renderMirror(renderer, scene, camera)` (`gameLoop.ts`) — a full extra scene render from the mirrored camera, so it's often the *first* pass in a frame to touch freshly finalized geometry.
- `seedvale:postprocessing` = `composer.render()` inside `createPostProcessing.ts`'s `render()` closure (AO/SMAA/bloom/god-rays/output chain).

This trace has no WebGL-call-level categories (`shaderSource`/`compileShader`/`linkProgram`/`getProgramInfoLog` etc. are entirely absent from `slice.name` in this capture), so the shader-compile mechanism itself is not directly observable here — it is inferred from (a) the main-thread-idle/GPU-not-stalled signature, (b) the earlier manual Chrome Performance capture that did see those exact WebGL calls under `render` near this file, and (c) three.js's documented default of synchronously checking `gl.getShaderInfoLog()`/`gl.getProgramInfoLog()` after linking a new program.

## Relation to streaming

Correlated, not directly caused by streaming's own compute. `chunk-finalize`/`chunk-mesh` finish in single-digit ms (typ.) — streaming itself is cheap in this trace. But finalize is the moment new chunk meshes/materials enter the live scene, and the *next* full-scene render pass pays a one-time synchronous shader-compile stall for any material the GPU hasn't linked yet. So the causal chain is: **streaming → new material enters scene → next render pass compiles/links it synchronously → hitch**, mediated through shader compilation rather than through streaming's CPU work directly (scenario A, but not the naive "chunk mesh build is slow" version of A).

## Confidence

**Medium.** The temporal correlation (13–44ms after `chunk-finalize`, in 4/4 non-startup top hitches) and the "main thread idle + GPU ticking normally" signature are solid, directly measured trace evidence. What's inferred rather than directly measured in *this* trace: (1) the specific shader-compile/link/error-check mechanism — carried over from the earlier manual capture, not re-confirmed here because this trace lacks WebGL-call categories; (2) this run's worst hitch (225.17ms) is well below the previously reported ~798.5ms, so this is at best a partial reproduction of the same failure class, not the full-severity case — the true 800ms outlier may involve a larger compile batch (more new materials at once) or a cold-shader-cache condition not hit in this run.

## Next step

Re-capture with `disabled-by-default-devtools.timeline` (WebGL/GPU call categories) enabled so `shaderSource`/`compileShader`/`linkProgram`/`getProgramInfoLog` appear as real slices inside the `water-mirror`/`postprocessing` window — that upgrades "inferred shader compile" to a directly measured slice and would tell whether `renderer.debug.checkShaderErrors = false` (three.js's synchronous-error-check default) removes the stall.

## Trace queries reference

All queries run via `./trace_processor query -f <file>.sql _temp/Trace-20260816T203706.json`; ad hoc, not saved as a permanent script (per task scope — trace-only, no new tooling).
