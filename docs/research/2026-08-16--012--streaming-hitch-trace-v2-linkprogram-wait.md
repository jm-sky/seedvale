# Research 012: Streaming hitch — trace v2 and `getProgramInfoLog()` root cause

**Status:** `confirmed`  
**Date:** 2026-08-16  
**Scope:** Trace investigation plus Chrome Performance JS stack capture and controlled A/B experiment.  
**Conclusion:** The investigated giant streaming hitches are caused by synchronous Three.js shader/program error checking on first use, specifically `gl.getProgramInfoLog()`, during the water-mirror render path.

## Context

Continuation of [research 011](2026-08-16--011--streaming-hitch-investigation.md) and [review 019](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md).

The original Perfetto trace established a strong `kLinkProgram` + `gpu_toplevel` synchronous wait signature but could not name the exact WebGL API call. A Chrome Performance capture with high-frequency JS stack sampling closed that gap.

## Final finding

A reproduced large hitch was measured by Chrome Performance as a `Long task` of approximately **615 ms**. Bottom-up attribution showed:

```text
~545 ms (88%)  WebGLRenderingContext.getProgramInfoLog
    └── ~85% WebGLRenderer.render
        └── waterMirror.ts:109
            └── createOcean.ts:67
                └── createApp.ts:1622
                    └── Animation frame
```

The call tree independently showed:

```text
~558 ms WebGLRenderer.render
    └── ~85% getProgramInfoLog
```

This is the missing named call site from the earlier Perfetto investigation.

## Full causal mechanism

```text
chunk streaming / newly visible materials
        ↓
water mirror render
        ↓
renderer.render(scene, mirrorCamera)
        ↓
new WebGLProgram variant / first use
        ↓
WebGLProgram.getUniforms() / onFirstUse()
        ↓
gl.getProgramInfoLog()
        ↓
synchronous driver / GPU wait
        ↓
~545 ms blocked Main Thread
        ↓
~615 ms Long Task / frame hitch
```

The earlier Perfetto trace independently showed the same mechanism at the GPU boundary:

- largest `seedvale:tick`: **732.166 ms**;
- `seedvale:water-mirror`: **675.159 ms**;
- two dominant `gpu_toplevel` waits: **218.899 ms + 235.197 ms**;
- each wait started within microseconds of a `kLinkProgram` dispatch;
- no GPU decoder or renderer-main activity occurred during the two giant wait windows.

The trace therefore identifies the synchronous WebGL/driver stall, while Chrome Performance identifies the exact JS/WebGL API call that triggers it.

## Why `getProgramInfoLog()` is called

Seedvale currently uses **Three.js 0.180.0** (`npm ls three`). In that version, `WebGLProgram` performs first-use uniform initialization. When `cachedUniforms` is undefined and `renderer.debug.checkShaderErrors` is enabled, the first-use path calls `gl.getProgramInfoLog()`.

Important details established by source inspection:

- `renderer.debug.checkShaderErrors` defaults to **`true`** in Three.js 0.180.0.
- Seedvale does not explicitly configure `renderer.debug.checkShaderErrors`.
- The relevant first-use path is in `node_modules/three/src/renderers/webgl/WebGLProgram.js`.
- `program.getUniforms()` is reached from `WebGLRenderer.setProgram()` during rendering.
- `getUniforms()` is called on every set-program path, but the expensive first-use block is entered only when the program's cached uniforms are not initialized.

Therefore this is not simply “`gl.linkProgram()` takes 500 ms”. `linkProgram` dispatch itself is short; the long cost is the synchronous round-trip exposed by `getProgramInfoLog()` when the driver still has work pending.

## Why the water mirror is the trigger

The relevant Seedvale path is:

```text
waterMirror.ts:109
    renderer.render(scene, mirrorCamera)

createOcean.ts:67
    waterMirror.render(renderer, scene, camera)
```

The mirror render uses a render target. In Three.js' program cache parameters, **tone mapping** and **output color space** participate in the WebGLProgram cache key.

Seedvale's mirror render and main canvas render therefore use different program variants:

- mirror render target → `LinearSRGBColorSpace`, and no canvas tone mapping;
- main canvas → normally `SRGBColorSpace` and Seedvale's `ACESFilmicToneMapping`.

The camera identity itself is **not** the cause, and the oblique projection matrix modification does not use Three.js user clipping planes and therefore does not create a program-cache variant by itself.

This means a material can require a separate WebGLProgram variant for the mirror pass and hit its expensive first use there. Newly streamed materials make this especially relevant because their variants may not have been used before.

## Controlled A/B experiment

A temporary diagnostic change was made:

```ts
renderer.debug.checkShaderErrors = false
```

No other rendering or streaming changes were made.

The same `stream` benchmark was then run for 30 seconds at High quality, pixel ratio 1.

### Result

```text
Critical spikes: (none)
Hitches (>= 8 ms): (none)
```

The benchmark reported:

```text
avg FPS:       17.9
avg frame:     55.9 ms
p95 frame:     42.9 ms
max frame:     6110.5 ms
```

The reported `max frame: 6110.5 ms` conflicts with the benchmark's own `Critical spikes: (none)` and `Hitches: (none)` classification and should be treated as a benchmark measurement anomaly until independently explained. It does not resemble the previously observed 600–800 ms `getProgramInfoLog()` hitch pattern.

The key A/B observation is that the previously reproducible long-task hitch pattern disappeared when shader error checking was disabled.

## What this proves

Combined evidence now provides high-confidence causal evidence for the investigated hitch mechanism:

1. Perfetto measured the giant synchronous WebGL waits next to `kLinkProgram`.
2. Chrome Performance named the blocking JS/WebGL call as `getProgramInfoLog()`.
3. The call occurs specifically inside `WebGLRenderer.render()` from the water-mirror render path.
4. The call consumes roughly **545 ms** of a reproduced **615 ms** long task.
5. Disabling `renderer.debug.checkShaderErrors` removes the observed hitch pattern in the same stream benchmark.

This is substantially stronger than the earlier “shader/link stall” hypothesis.

## What is still not proven

The exact upstream reason for each individual new WebGLProgram is not fully instrumented with a material/program identifier. The strongest explanation is the combination of newly used streamed materials and separate mirror/main program variants caused by render-target output color space and tone mapping.

The benchmark A/B does **not** prove that disabling shader checks is an acceptable production fix. It proves that this synchronous diagnostic path is responsible for the observed hitch.

## Next work

### 1. Do not keep `checkShaderErrors = false` as the final fix yet

It is a diagnostic switch that removes shader error checking. It may be acceptable for a production build only after deliberately deciding what shader diagnostics are required, but it should not be adopted merely as a performance workaround.

### 2. Investigate asynchronous/pre-warmed program compilation

Three.js 0.180.0 provides `renderer.compileAsync()` and `KHR_parallel_shader_compile` support. Investigate whether Seedvale can pre-warm the relevant mirror/main program variants before they enter the latency-sensitive render path.

The goal is:

```text
new streamed material
    ↓
prepare required program variants asynchronously
    ↓
program ready
    ↓
mirror/main render
    ↓
no multi-hundred-ms first-use stall
```

The implementation must avoid moving the same cost into another visible frame or blocking chunk finalization.

### 3. Evaluate Three.js upgrade separately

Seedvale currently declares `"three": "^0.180.0"` and `npm ls three` confirms **0.180.0** is installed. A newer release is available (0.185.1 at the time of investigation).

An upgrade is worth testing because renderer/WebGL behavior may have changed, but it must be treated as a separate A/B experiment. Do not assume the upgrade alone fixes the root cause.

Recommended order:

1. reproduce baseline;
2. test Three.js 0.185.1 with no Seedvale rendering changes;
3. compare hitch count and maximum long tasks;
4. if needed, test `compileAsync()`/program prewarming;
5. only then decide whether any permanent `checkShaderErrors` change is justified.

## Verification status

- **Trace evidence:** verified.
- **Named JS/WebGL call site:** verified with Chrome Performance.
- **A/B causal experiment:** verified for the diagnostic path.
- **Final production fix:** not implemented.
- **Three.js upgrade:** not implemented.

## Related

- [Research 011: Streaming hitch investigation](2026-08-16--011--streaming-hitch-investigation.md)
- [Review 019: Streaming hitch — Perfetto trace analysis](../reviews/2026-08-16--019--streaming-hitch-trace-analysis.md)
