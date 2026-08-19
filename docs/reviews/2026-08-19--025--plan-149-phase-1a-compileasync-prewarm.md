# Review 025: Plan 149 Phase 1 A — loading-window `compileAsync` prewarm

**Status:** `done`
**Date:** `2026-08-19`
**Runs:** **3** cold `?benchmark=stream` (fresh page load each time)
**Scope:** verify the Phase 1 A loading-window prewarm (`src/render/programPrewarm.ts`) on real GPU. No PointLight budget change, no ChunkManager / worker / mirror / postprocess / material-merge work.

Follows [plan 157](../plans/archive/2026-08-18--157--production-pointlight-budget.md) §12 (production `NUM_POINT_LIGHTS=16`) and [plan 149](../plans/2026-08-17--149--shader-program-first-use-hitch.md) §19.

## Environment

- Cursor IDE browser + CDP, hardware WebGL. GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)` via `WEBGL_debug_renderer_info` — **not** SwiftShader. Same renderer string on all three runs.
- `KHR_parallel_shader_compile`: **available** (`true`).
- `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1`. Reports: `pixelRatio=1`, `quality: High`, `seed=42`, `res=193`.
- Fresh origin `http://localhost:5610/` (unused port so IndexedDB from `:5577` / `:5600` / `:5602` could not leak). Unattended `?benchmark=stream` auto-continues/creates the seed-42 world.
- Tab kept `document.visibilityState === 'visible'` for runs 1–2 (`Page.setWebLifecycleState` + `Emulation.setFocusEmulationEnabled`). Run 3 went `hidden` mid-session.

## What was prewarmed

One-shot, loading-window only:

```text
resyncDayNight + pointLightBudget.sync(camera)
    ↓
buildProgramPrewarmStaging(scene)   // shared geo/mat clones, not added to scene
    ↓
bind 1×1 WebGLRenderTarget          // match composer/mirror program key
    ↓
await renderer.compileAsync(staging, camera, scene)
    ↓
restore RT, drop staging
    ↓
first tick() (still under loading overlay)
    ↓
loadingScreen.hide() / gameplay rAF
```

Not per-chunk, not per-tick, not `compileAsync(liveScene, camera)` as a shortcut.

## Results

Do **not** rank mean FPS. Hitch signal is census `durationMs` on stages with `programDelta > 0`. Run 3 is hitch-starved (75 census frames, tab hidden) — same class as plan 157 stream run 1; use it for the program-axis story, **not** as a RENDER/p95 sample.

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg / min / p1 | 21.2 / 5 / 8 | 46.5 / 9 / 14 | 11.2 / 7 / 7 |
| Frame avg / p95 / **max** (ms) | 47.1 / 93.6 / **199.9** | 21.5 / **49.5** / **111.8** | 89.3 / 124.2 / 143.1 |
| RENDER / WATER (ms) | 33.7 / 4.5 | **14.5 / 2.3** | 35 / 5 |
| Draw calls avg / max | 681 / 1498 | 623 / 1577 | 573 / 1481 |
| Triangles avg | 9 342 858 | 8 599 532 | 7 532 809 |
| Loaded chunks (end) | 68 | 72 | 68 |
| Census frames | 1678 | 2091 | 75 |
| unique cacheKeys / programs | **68 / 68** | **67 / 67** | **65 / 65** |
| `npl` on physical keys | **16 only** | **16 only** | **16 only** |
| `Green` / `MI_WindowGlass` / `Wood` | 5 / 4 / 2 | 5 / 4 / 2 | 5 / 4 / 2 |
| prewarm `compileAsync` (ms) | 223 | 206 | 135 |
| programs after prewarm | 33 | 30 | 33 |
| staging roots / materials | 539 / 525 | 459 / 454 | 558 / 544 |
| `glError` | **0** | **0** | **0** |
| max first-use hitch (`Δ>0`, ms) | 407 (frame 0 post) | 206 (frame 0 post) | 299 (frame 0 post) |
| max hitch after frame 0 (`Δ>0`, ms) | **65** | **99.5** | **69.5** |
| hitch ≥100 / ≥500 (`Δ>0`) | **1 / 0** | **1 / 0** | **1 / 0** |
| frame-0 mirror | 423 ms **Δ0** | 180 ms **Δ0** | 226 ms **Δ0** |
| frame-0 postprocess | 407 ms Δ27 | 206 ms Δ26 | 299 ms Δ26 |

### vs plan 157 §12 (same GPU, budget 16, no prewarm)

Those stream runs were hitch-starved (FPS ~11, census frames 57–90). Compare the **hitch axis**, not RENDER:

- max hitch after frame 0: **353–382 ms → 65–99.5 ms**
- hitch ≥500 ms: **up to 2 → 0**
- hitch ≥100 ms (`Δ>0`): **5–6 → 1** (the one remaining is frame-0 postprocess, behind the loading overlay)
- unique keys: **65–66 → 65–68** (no unjustified growth; residual is Phase C names)
- `npl`: still **16 only**

Healthy runtime sample is run 2: frame p95 **49.5 ms**, RENDER **14.5**, WATER **2.3** — in the same class as plan 157’s night continue (p95 48.6, RENDER 23), not a p95/RENDER regression.

## Visual

- Run 1 HUD `09:55 dzień`, run 3 `11:20 dzień` (continue clock drift, pitfall 6). Home `Osada Brzozowa`.
- Terrain, mixed foliage, settlement props, directional shadows, labels, minimap — present. No black/uninitialized materials, no missing vegetation, water/fog present.

## Interpretation

`compileAsync` successfully linked the stable scene-graph families (**30–33** programs) during loading (`glError = 0`, KHR used). Frame-0 **mirror `programDelta = 0`** confirms those keys are not first-created at gameplay start. Remaining frame-0 `Δ26–27` is shadow depth + EffectComposer (not in the staging set). First draw of the already-linked set can still take ~180–420 ms (`onFirstUse` / `ACTIVE_UNIFORMS`) — that call still runs inside the first `tick()`, which is **before** `loadingScreen.hide()`.

Streaming no longer pays multi-hundred-ms first-use bursts. Do not add another `compileAsync` layer for the leftover 26 composer/depth programs without a separate, small plan.

## Decision

**Keep Phase 1 A.** Plan 149 is not `done` — Phase C (`Green` / `MI_WindowGlass` / `Wood`) remains.
