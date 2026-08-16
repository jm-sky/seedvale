# Research 012: Streaming hitch — trace v2 (`kLinkProgram` + `gpu_toplevel` wait evidence)

**Status:** `in progress`
**Date:** 2026-08-16
**Scope:** Trace-only analysis of `_temp/trace_v2.json.gz` (`chrome://tracing`, ~20.4MB, 12.37s, categories: `devtools.timeline`, `devtools.timeline.frame`, `blink.user_timing`, `gpu`, `gpu_cmd_queue`, `gpu.decoder`, `gpu.service`, `disabled-by-default-devtools.timeline`) via Perfetto Trace Processor (`./trace_processor`, PerfettoSQL). Continuation of [research 011](2026-08-16--011--streaming-hitch-investigation.md); source data for [review 019](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md)'s hypothesis.
**Not in scope:** Implementing a fix, modifying Three.js/renderer settings, modifying the benchmark, adding new instrumentation. Trace investigation only.
**Tools used:** `./trace_processor query` (PerfettoSQL) only, ad hoc scratchpad `.sql` files, not saved as permanent tooling.

---

## Why this trace

Trace 2 (review 019, `_temp/Trace-20260816T203706.json`) established the "main thread idle / GPU ticking normally" signature but had no WebGL-call-level categories. Trace 3 (`_temp/trace_trace_tracing_01.json.gz`, analyzed inline in a prior turn, not written up as a separate doc) added `gpu.decoder`/`gpu.service` and found a single 245.975ms `gpu_toplevel` wait adjacent to a `kLinkProgram` dispatch — but lacked `blink.user_timing`, so it couldn't be tied to named `seedvale:*` spans (`chunk-finalize`, `water-mirror`, `postprocessing`). This trace (`trace_v2.json.gz`) was captured with **both** `blink.user_timing` and the GPU/WebGL categories together, closing that gap.

## Finding

The largest hitch in this trace — a 732.166ms `seedvale:tick` — is not GPU-busy time and not CPU compute on either process. **62% of the tick (454.096ms)** is two singular, back-to-back synchronous `WebGL-0x6a0c079ed200` / `gpu_toplevel` waits (218.899ms + 235.197ms), each starting within microseconds of a `kLinkProgram` dispatch. During both waits, Chrome's own tracing shows **zero activity** on both the GPU process's decoder thread (`CrGpuMain`) and the renderer's main thread — a directly measured, not inferred, confirmation of the "synchronous CPU↔GPU/driver block coincident with program linking" signature first hypothesized in review 019 and partially observed in trace 3.

The same wait mechanism (`WebGL-0x6a0c079ed200`/`gpu_toplevel`) also accounts for the trace's other, much smaller (44–48ms) hitches, but there it appears as dozens of small (0.02–7.5ms) accumulated waits rather than 1–2 giant ones — the giant-outlier and routine-hitch cases share a root cause category but differ in scale/clustering.

## Evidence

### Top hitches (measured `slice.dur`, not sampling)

| source | value | id / ts |
|---|---:|---|
| `seedvale:tick` max | 732.166 ms | id 978219, ts 1428180203226000 (≈7.91s into a 12.37s trace — mid-run, not startup) |
| `ThreadControllerImpl::RunTask` max | 734.236 ms | id 978024, wraps the same tick |
| frame-to-frame `seedvale:tick` gap max | 736.145 ms | same event |
| `seedvale:water-mirror` max | 675.159 ms | id 978624 — 92% of the 732ms tick |
| WebGL `gpu_toplevel` wait max | 235.197 ms | id 983287 |
| WebGL `gpu_toplevel` wait 2nd | 218.899 ms | id 981015 |
| next-largest WebGL wait anywhere in trace | 9.843 ms | id 1189096 — 22–24× smaller |

Next 5 `seedvale:tick` values after the outlier: 48.224 / 46.620 / 46.510 / 46.095 / 44.661 ms — a 15× drop from the top hitch, confirming it is a singular outlier, not part of a continuous distribution.

### Reconstruction of the largest hitch

```text
seedvale:chunk-finalize (burst of 6, non-trivial: 0.9-5.5ms each)
  ts ~= 1428179842933000 .. 1428179892626000   (220-360ms before tick)

        v  (220-360ms gap, mostly idle)

seedvale:tick  id=978219
  ts = 1428180203226000, dur = 732.166 ms

        v +4.731ms

seedvale:water-mirror  id=978624
  ts = 1428180207957000, dur = 675.159 ms   (92% of tick)

    rel +7.4..88.1ms:  11 small WebGL waits (0.01-5.1ms) + kLinkProgram (~0.17-0.26ms each)
    rel +81.496ms:  kLinkProgram id=980864, dur=0.212ms
        v (5.6ms later)
    rel +87.305ms:  WebGL-0x6a0c079ed200 id=981015, dur = 218.899 ms  [gl_category=gpu_toplevel]
    rel +88.066ms:  kLinkProgram id=981028, dur=0.032ms (761us into the wait)
        v wait ends at rel +306.204ms
    rel +308..345ms: 6 more small WebGL waits + kLinkProgram bursts
    rel +345.059ms: WebGL-0x6a0c079ed200 id=983287, dur = 235.197 ms  [gl_category=gpu_toplevel]
    rel +345.068ms: kLinkProgram id=983288, dur=0.023ms (9us after wait starts)
        v wait ends at rel +580.256ms
    rel +583..675ms: further small waits + kLinkProgram bursts, tick ends normally

seedvale:postprocessing  id=987615
  ts = 1428180883186000, dur = 48.800 ms   (after water-mirror, unremarkable)
```

Total WebGL wait time inside the water-mirror window (all sizes): 616.21ms = **91.3%** of that sub-span.

### GPU decoder and main thread during the two giant waits

Both `[87.305ms, 306.204ms]` and `[345.059ms, 580.256ms]` (relative to water-mirror start) were queried directly for *any* slice on `CrGpuMain` (GPU process) and *any* slice on the renderer's main thread: **zero rows in both processes, both windows.** No draw calls, no texture/buffer ops, no decoder commands, no JS, no GC — 454ms of measured silence on both sides of the wait. Bucketed `GPUTask` activity in 25ms buckets across the full 675ms water-mirror window confirms the same: buckets 0–3 and 23–26 (start/end, ~vsync-normal) are active; buckets 4–11 and 14–22 (exactly the two wait windows) are completely empty.

Across the entire 675ms `water-mirror` span, main-thread activity totals ~2.7ms (two `MinorGC` events, 0.99ms + 1.68ms).

### Shader/program events

`kLinkProgram` is present (~72+ occurrences, 0.02–0.28ms dispatch each) and clusters tightly around both giant waits (761µs after wait #1 starts; 9µs after wait #2 starts). `kShaderSource`, `kCompileShader`, `kGetProgramInfoLog`, `kGetShaderInfoLog`, `kGetProgramiv`, `kGetShaderiv` are **absent** from `gpu.decoder`/`gpu.service` in this trace — same gap as trace 3. `kLinkProgram` measures command dispatch/decode only (sub-millisecond), not the underlying driver compile/link work; the actual cost is captured separately as the `WebGL-0x.../gpu_toplevel` wait, which is Blink's own instrumentation for "the calling JS thread is synchronously blocked on a GPU round trip." 404,782 `kDrawElements` + 162,137 `kDrawElementsInstancedANGLE` exist trace-wide, but zero inside either giant-wait window.

### Comparison across top hitches

| tick_ms | dominant sub-pass | prior chunk-finalize | wait pattern |
|---:|---|---|---|
| 732.166 | water-mirror 675.159 (92%) | trivial (0.008ms, 16.9ms gap) — but 6 non-trivial finalizes 220–360ms earlier | 2 giant singular waits (218.9 + 235.2ms), GPU/MT fully idle |
| 48.224 | postprocessing 18.388 | — | many small waits |
| 46.620 | postprocessing 20.017 | 51.7ms gap, 7.513ms (largest routine finalize in trace) | many small waits |
| 46.510 | water-mirror 26.349 (57%) | 19.9ms gap | many small waits (top 7.482ms) |
| 46.095 | postprocessing 29.688 | 39.5ms gap | many small waits |
| 44.661 | postprocessing 37.748 (85%) | 21.9ms gap | many small waits (top 6.450ms) |

### Alternative explanations checked and ruled out for the giant waits

- CPU compute / GC — ruled out, main thread near-idle throughout.
- Large `chunk-finalize` itself — ruled out, finalize slices are 0.9–5.5ms and complete 220–360ms before the stall starts.
- Texture/buffer upload, draw calls — ruled out for the two giant windows specifically (zero decoder events of any kind during them).
- Many small WebGL sync calls — this *is* the mechanism for the other 44–48ms hitches, but not for the giant one (dominated by two singular waits, not accumulation).

## Relation to streaming

`chunk-finalize -> kLinkProgram -> WebGL wait -> hitch` appears in the same trace, but as a looser sequence than a tight single-event chain. A burst of 6 non-trivial chunk-finalize/chunk-mesh events (220–360ms before the hitch) is denser/larger than the near-zero finalize preceding the routine 44–48ms hitches, which is circumstantial support for "a bigger batch of newly streamed materials produces a bigger link-wait stall later." But no trace event carries a shared identifier tying that specific finalize batch to the specific `kLinkProgram` calls bracketing the two giant waits — the link is temporal, not proven by a shared key.

## Confidence

**Medium-high.** Up from review 019's "medium." This trace adds, for the first time, directly measured GPU-decoder-side silence and named `kLinkProgram` events tightly bracketing the exact class of massive synchronous wait, reproduced as the top-2 outliers trace-wide by a 22×+ margin over the next-largest wait, with the same wait-type recurring at smaller scale across the other top hitches. Not "high": no trace event names the specific WebGL call actually blocking inside the `WebGL-0x...` wait (compile vs. link vs. status-getter vs. other), and the finalize-burst-to-wait causal link is inferential (timing only).

## Remaining uncertainty

1. Which exact WebGL API call the `WebGL-0x6a0c079ed200` wait wraps — not nameable from this trace's categories (no `kCompileShader`/`getProgramInfoLog`/`getShaderInfoLog` present).
2. Whether the finalize burst 220–360ms earlier is causally responsible for these specific two waits, versus some other material becoming newly visible in the mirror's reflected view for the first time (different camera than main view).
3. Why this run produced two back-to-back giant waits in one tick, versus trace 3's single ~246ms wait — possibly a larger/denser material batch, possibly a first-time-visible-in-mirror vs. first-time-visible-in-main-camera timing difference.

## Next experiment

Capture a Chrome Performance profile (not `chrome://tracing`) with JS stack sampling enabled at high frequency around a reproduced hitch, so the call stack *inside* the `WebGL-0x...` wait's triggering JS call is captured by name (e.g. `WebGLRenderingContext.getProgramInfoLog`, `WebGLProgram.checkErrors`). That is the one piece needed to convert "inferred shader-compile/link stall" into a named, indisputable call site before touching `renderer.debug.checkShaderErrors` or any other code.

## Related

- [Research 011: Streaming hitch investigation](2026-08-16--011--streaming-hitch-investigation.md) — prior traces, current hypothesis this doc tests.
- [Review 019: Streaming hitch — Perfetto trace analysis](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md) — origin of the shader-compile/link hypothesis.
