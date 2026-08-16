# Research 011: Streaming hitch investigation

**Status:** `in progress`
**Date:** 2026-08-16
**Scope:** Performance investigation of the intermittent large frame hitch observed during the `stream` benchmark, with focus on chunk streaming, rendering, WebGL/GPU synchronization and shader compilation.

## Problem

Seedvale periodically produces a very large frame hitch while chunk streaming.

The original benchmark showed:

- `stream` frame max: **~798.5 ms**
- `chunk-mesh` max: **~52 ms**
- `chunk-mesh` average: **~38.8 ms** in the earlier benchmark context
- `chunk-finalize` is normally very cheap
- the hitch is therefore not explained by terrain/chunk mesh CPU generation alone

The goal is to identify the actual synchronous cost causing the hitch before implementing an optimization.

## Trace 1 — Chrome Performance

File:

`_temp/Trace-20260816T191510.json`

Size: ~157 MB.

This trace was recorded from Chrome Performance without `Include resource content`.

Manual inspection showed a long Main Thread path:

```text
Animation frame fired
→ Function call
→ tick
→ gameLoop.ts
→ withCategory
```

A particularly important call tree was:

```text
(anonymous) ~190.8 ms
└─ render — createPostProcessing.ts:768
   ├─ getProgramInfoLog
   ├─ getShaderInfoLog
   ├─ shaderSource
   ├─ drawElements
   └─ ...
```

This was the first strong indication that the hitch could involve first-use shader compilation/linking and WebGL synchronization rather than chunk generation itself.

## Trace 2 — Perfetto analysis

File:

`_temp/Trace-20260816T203706.json`

Size: ~203 MB on disk.

Review:

`docs/reviews/2026-08-16--019--streaming-hitch-trace-analysis.md`

Tool:

`./trace_processor` + PerfettoSQL.

The trace loaded successfully but had legacy V8 CPU profiling errors:

- `legacy_v8_cpu_profile_invalid_callsite: 449`
- `legacy_v8_cpu_profile_invalid_sample: 258846`
- 5 overlapping complete slices moved to an overflow track

Therefore CPU sampling is incomplete and must not be treated as definitive. The analysis instead relied on measured `slice.dur` values and the custom `seedvale:*` performance spans.

### Main findings from Review 019

The trace did **not** contain the previously observed ~800 ms slice. Largest values were:

- largest slice: **249.95 ms** (`PipelineReporter`)
- largest `RunTask`: **228.29 ms**
- largest `seedvale:tick`: **225.17 ms**
- largest frame-to-frame `seedvale:tick` gap: **241.87 ms**

Nevertheless, it reproduced the same failure class at lower severity.

Four major non-startup hitches showed:

| tick | dominant render sub-pass | prior `chunk-finalize` |
|---:|---:|---:|
| 225.17 ms | `water-mirror` 149.38 ms | 17.7 ms earlier |
| 183.46 ms | `water-mirror` 126.31 ms | 43.9 ms earlier |
| 108.63 ms | `water-mirror` 71.91 ms | 13.2 ms earlier |
| 101.25 ms | `postprocessing` 94.98 ms | 20.5 ms earlier |

During the worst ~149 ms `water-mirror` stall, the Main Thread was essentially idle: only ~1.13 ms MinorGC plus sub-ms V8 interrupt/stack checks were present.

The GPU process continued normal ~5–6 ms work at roughly vsync cadence instead of showing a GPU-side hang.

This combination strongly suggests a **synchronous CPU↔GPU round trip / driver wait**, rather than expensive JS computation or a GPU task running for the entire stall.

`chunk-finalize` and `chunk-mesh` are generally cheap. `chunk-finalize` wraps `drainFinalizeQueue(...)`, which is the point where newly streamed chunk meshes/materials are attached to the live scene.

The measured sequence is therefore consistent with:

```text
chunk streaming
    ↓
chunk-finalize
    ↓
new mesh/material enters live scene
    ↓
next full-scene render
    ↓
first-use shader/material work
    ↓
synchronous CPU↔GPU wait
    ↓
large frame hitch
```

### Important limitation

Trace 2 did **not** contain WebGL-call-level slices such as `shaderSource`, `compileShader`, `linkProgram`, `getProgramInfoLog` or `getShaderInfoLog`.

Therefore the specific shader-compilation mechanism was **inferred**, not directly measured in that trace.

The inference is based on:

1. the Main Thread idle / GPU-active signature,
2. the earlier manual Chrome Performance trace that did show those WebGL calls,
3. the fact that new materials enter the scene immediately before the render stall.

Review 019 therefore assigned **medium confidence**.

## Relevant code locations already identified

- `src/app/gameLoop.ts`
  - `seedvale:water-mirror` wraps `bundle.ocean.renderMirror(renderer, scene, camera)`.
  - This is a full extra scene render and can be the first render pass touching newly finalized geometry.
- `src/render/createPostProcessing.ts`
  - `seedvale:postprocessing` wraps `composer.render()`.
  - Earlier Chrome Performance evidence pointed at `render` around line 768.
- `src/terrain/chunkManager.ts`
  - `seedvale:chunk-finalize` wraps `drainFinalizeQueue(...)`.

The `seedvale:*` performance instrumentation used in Review 019 was pre-existing temporary working-tree instrumentation, not added by the review itself.

## Trace 3 — targeted chrome://tracing capture

A smaller trace was then recorded using `chrome://tracing` with these categories enabled:

```text
devtools.timeline
devtools.timeline.frame
gpu
gpu_cmd_queue
gpu.decoder
gpu.service
```

Saved as:

`_temp/trace_trace_tracing_01.json.gz`

Size: **25 MB compressed** (~25.81 MB reported by Trace Processor).

Trace Processor successfully loaded it:

```text
Trace loaded: 25.81 MB in 2.68s
```

Health issues were minimal:

- `flow_no_enclosing_slice: 1`
- `misplaced_end_event: 1`

These are isolated events and should not block analysis unless they overlap the hitch being investigated.

### Current state

Trace 3 was analyzed inline (not written up as a separate doc): it found a single 245.975ms `gpu_toplevel` wait adjacent to a `kLinkProgram` dispatch, with the GPU decoder silent throughout — but the capture lacked `blink.user_timing`, so it couldn't be tied to named `seedvale:*` spans.

A follow-up trace (`trace_v2.json.gz`, captured with both `blink.user_timing` and the GPU/WebGL categories together) closed that gap — see **[research 012](2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md)**: a 732ms hitch decomposes into two singular `kLinkProgram`-adjacent `gpu_toplevel` waits (454ms combined) with the GPU process and main thread both completely idle during them, directly measured. Confidence raised to medium-high. The exact WebGL call inside the wait is still not nameable from any trace captured so far — see 012's "Next experiment" for the proposed JS-stack-sampling capture.

## Current hypothesis

### Strongest hypothesis

The hitch is triggered by chunk streaming but caused by **first-use render work for newly introduced materials**, likely involving synchronous shader compilation/linking and/or WebGL CPU↔GPU synchronization.

The likely sequence is:

```text
stream chunk
    ↓
chunk-finalize / scene.add()
    ↓
new material/program becomes visible to renderer
    ↓
water mirror or post-processing performs a full-scene render
    ↓
shader/program first-use work and synchronous WebGL/driver interaction
    ↓
Main Thread waits
    ↓
frame hitch
```

### What is NOT currently supported

There is no evidence that the normal chunk mesh generation itself is responsible for the 100–800 ms hitch.

Do not start by optimizing:

- terrain mesh generation,
- chunk worker CPU work,
- chunk mesh construction,
- generic chunk streaming throughput.

The observed expensive region is after finalization, during rendering.

## Next diagnostic step

Analyze:

`_temp/trace_trace_tracing_01.json.gz`

with:

`./trace_processor` + PerfettoSQL.

Focus on the largest Main Thread hitch and the same timestamp on:

- `gpu`
- `gpu_cmd_queue`
- `gpu.decoder`
- `gpu.service`
- `devtools.timeline`
- `devtools.timeline.frame`

Look specifically for evidence of:

- `shaderSource`
- `compileShader`
- `linkProgram`
- `getProgramInfoLog`
- `getShaderInfoLog`
- `drawElements`
- `drawArrays`
- GPU command submission/decoding
- synchronization/wait events
- `water-mirror`
- `postprocessing`
- `chunk-finalize`

The key question is:

> Does the targeted trace directly show the render of newly finalized chunks causing a shader/WebGL/GPU synchronization stall?

If yes, the next investigation should compare the stall with Three.js shader error checking / first-use program compilation behavior before making an implementation change.

If no, keep the hypothesis open and use the trace to identify the actual measured wait.

## Useful commands

Check trace size:

```bash
ls -lh _temp/*trace*
```

Analyze the targeted trace:

```bash
./trace_processor _temp/trace_trace_tracing_01.json.gz
```

The previous large trace was analyzed with PerfettoSQL using `./trace_processor query`.

## Evidence hierarchy

For this investigation, prefer evidence in this order:

1. measured Perfetto slice durations (`slice.dur`),
2. explicit WebGL/GPU trace events,
3. explicit `performance.mark`/`measure` spans,
4. CPU sampling/call trees,
5. inferred behavior from Three.js/source code.

The V8 CPU samples in Trace 2 were known to be partially malformed, so sampling alone is insufficient evidence.

## Related review

`docs/reviews/2026-08-16--019--streaming-hitch-trace-analysis.md`

Review 019 is the source of the current hypothesis and should be read before continuing this investigation.
