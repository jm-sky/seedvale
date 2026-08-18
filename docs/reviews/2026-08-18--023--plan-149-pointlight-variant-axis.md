# Review 023: Plan 149 — PointLight variant-axis experiment

**Status:** `done`
**Date:** `2026-08-18`
**Runs:** **3** cold baseline + **3** cold `?pinPointLights=16` (`?benchmark=stream`, fresh page load each time)
**Scope:** diagnostic experiment only. Dummy `PointLight` pad, intensity 0, debug/URL-gated. No `compileAsync()`, no prewarm, no GLTF consolidation, no shader / ChunkManager / postprocess / water / `checkShaderErrors` change.

Follows [review 022](./2026-08-18--022--plan-149-program-family-dump.md). Plan: [149](../plans/2026-08-17--149--shader-program-first-use-hitch.md).

## Environment

- Cursor IDE browser + CDP, hardware WebGL. GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)` via `WEBGL_debug_renderer_info` before/during runs — **not SwiftShader**. Same renderer string on all six runs.
- `KHR_parallel_shader_compile`: **available** (`true`).
- `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1`. Reports: `pixelRatio=1`, `quality: High`, `seed=42`, `res=193`.
- Fresh origin `http://localhost:5588/` (unused port so IndexedDB from `:5577` / `:5584` / `:5586` could not leak). Unattended `?benchmark=stream` auto-continues/creates the seed-42 world.
- Experiment flag (pinned runs only): `?pinPointLights=16`. Off by default; baseline URLs omit it.
- Working tree on `b387f83` + the pad (`src/perf/pointLightBudget.ts`). Not a production lighting change.

Pad mechanism: extra `THREE.PointLight`s with **intensity 0**, `castShadow=false`, parked at `(0,-1e5,0)`. Three's `WebGLLights.setup` still increments `pointLength` (so `NUM_POINT_LIGHTS` / cacheKey token 36 stays constant) while `uniforms.color * 0` adds nothing to `RE_Direct`. Each frame, before mirror/shadow/beauty, unused dummies are hidden so visible count = `max(real, 16)` until overflow. `overflowMax` on all three pinned runs was **15** — budget 16 covered the observed range.

## Results

Do **not** rank mean FPS. Hitch signal is census stage `durationMs` on `programDelta > 0`. Table values are the **median** of three cold runs; per-run numbers follow.

| Metric | Baseline | Fixed PointLight budget (16) | Delta |
|---|---:|---:|---:|
| unique cacheKeys | 210 | **62** | **−70%** |
| programCount | 205 | **62** | **−70%** |
| first-use events | 210 | **62** | **−70%** |
| first-use stage events (`Δ>0`) | 25 | **9** | **−64%** |
| max first-use hitch (ms) | 3519 | 2309 | −34% (still frame 0) |
| max hitch after frame 0 (ms) | ~1500–4900 | **106–562** | **streaming bursts gone** |
| frame p95 (ms) | 61 | 92 | **+51%** |
| frame max (ms, report) | 1051 | 392 | −63% |
| RENDER (ms) | 18 | 33 | **+80%** |
| WATER (ms) | 3.3 | 4.2 | +27% |
| draw calls avg | 648 | 677 | +4% |
| triangles avg | 8 733 000 | 9 259 000 | +6% |

### Baseline (no pin)

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg | 40.4 | 36.6 | 35.5 |
| Frame avg / p95 / **max** | 24.7 / 58.7 / **726** | 27.3 / 61.0 / **1515** | 28.2 / 67.9 / **1051** |
| RENDER / WATER | 16.4 / 2.8 | 18.0 / 4.0 | 19.1 / 3.3 |
| unique `cacheKey` / programCount | 259 / 256 | 180 / 180 | 210 / 205 |
| first-use events | 261 | 180 | 210 |
| `Green` / `MI_WindowGlass` / `Wood` | 29 / 18 / 9 | 22 / 14 / 8 | 23 / 16 / 8 |
| `numPointLights` values | 2,3,7,8,9,10,15 | 3,8,9,10,13,15 | 2,3,8,9,10,15 |
| hitch events / max hitch | 30 / **4928** ms | 25 / **3519** ms | 23 / **1048** ms |
| Frame 0 first-use | 54 | 53 | 53 |

Matches review 022's band (~180–259 keys, ~6–7 light counts, `Green` ~22–29). Slowest stages still sit on large `programDelta` during the sprint (run 1: postprocess **4928 ms Δ22** at frame 1045).

### Pinned (`?pinPointLights=16`)

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg | 27.9 | 20.3 | 21.3 |
| Frame avg / p95 / **max** | 35.8 / 89.7 / **269** | 49.2 / 100.8 / **578** | 46.8 / 91.7 / **392** |
| RENDER / WATER | 23.9 / 3.8 | 33.5 / 5.2 | 32.5 / 4.2 |
| unique `cacheKey` / programCount | **62 / 62** | **62 / 62** | **62 / 62** |
| first-use events | 62 | 62 | 62 |
| `Green` / `MI_WindowGlass` / `Wood` | 5 / 4 / 1 | 5 / 4 / 2 | 5 / 4 / 2 |
| `numPointLights` values | **16 only** | **16 only** | **16 only** |
| hitch events / after frame 0 | 9 / 7 | 9 / 7 | 9 / 7 |
| max hitch / max after frame 0 | 4092 / 562 | 2310 / 526 | 532 / **106** |
| Frame 0 first-use | 53 | 52 | 52 |
| pad `overflowMax` | 15 | 15 | 15 |

Program count is **bit-stable at 62** across three cold reloads. Physical/depth cacheKeys carry `numPointLights=16` and no other light-count values.

Leftover named copies (run 3) are the **instancing / boolean-mask axis** from review 022, not lights: `Wood` 2 (mask `8388608` vs `8388609`), `MI_WindowGlass` 4 (two mask fields), `Green` 5 (all foliage-wind, all `npl=16`). Depth programs dropped with the light axis (~48–53 → **11**). ShaderMaterials stay ~22 (postprocess/sky/water/grass — frame 0 set).

## Visual

Screenshots after stream, baseline and pinned, same seed/settlement (`Osada Brzozowa`):

- Terrain, grass, mixed foliage, settlement props, directional shadows, bloom/fog — present on both.
- Dummy lights are not visible (intensity 0, no mesh, far below the world).
- No black/uninitialized materials, no flicker in the captured frames, no obvious night/day or water-reflection break (daytime sprint, ~08:00–09:00).
- `gl.getError()` **1282** (`GL_INVALID_OPERATION`) once after drain on both conditions — same leftover as review 021, **not attributed** to the pad.

Visual correctness of the pad is acceptable for this experiment. The pad is **not** visually free in the sense of “zero render cost”: shaders always loop 16 point lights.

## Trade-off (why this pad is not the shippable fix)

The census/hitch hypothesis holds. The **naive dummy pad is not a success as a runtime change**:

1. **Steady-state frame cost rose.** Median RENDER 18 → 33 ms, frame p95 61 → 92 ms. Two contributors, not separated in this experiment:
   - inherent: every `MeshStandardMaterial` fragment loop is `NUM_POINT_LIGHTS=16` even when only 2 real lights are nearby;
   - diagnostic-only: per-frame `scene.traverseVisible` to recount real lights.
2. **Frame 0 first-use hitch remains** (0.5–4.1 s, Δ20+32). Pinning stops *new keys during streaming*; it does not make the initial ~52 programs free. That cost is now front-loaded (and still paid on cold reload).
3. **Instancing leftover** is real but smaller (`Green` 5, glass 4, wood 2).

Do not ship `?pinPointLights` as the fix. Do not treat the RENDER/p95 regression as “hitch solved.”

## Wniosek

**PASS** — the hypothesis is confirmed.

Stabilising `NUM_POINT_LIGHTS` **does** collapse unique programs (~210 → **62**, −70%) and removes the streaming first-use bursts (Δ19–26 / 1–5 s during the sprint → Δ1–2 / ~100–560 ms after frame 0). `Green`/`Wood`/`MI_WindowGlass` drop from tens of keys to a handful of instancing/mask copies. The live light-count set is a single value (`16`) on every pinned run.

It is **not** a complete hitch fix: frame 0 still compiles ~52 programs, and a dummy pad that forces a 16-light shader loop (plus a scene traverse) **hurts** normal frame time. That is a trade-off to design around in the real implementation, not a reason to discard the axis.

**FAIL is rejected:** the PointLight variant axis *is* the dominant source of the extra ~150 streaming programs.

## Next step (not implemented here)

A **separate plan** to constrain the PointLight variant axis for real, without this diagnostic pad:

1. Keep `NUM_POINT_LIGHTS` constant with a **cheap** counter (increment on add / hide / unload — no full-scene traverse).
2. Sweep a small budget curve (e.g. 8 / 12 / 16) on the same `stream` protocol: census + RENDER/p95. Do not freeze 16 from this one experiment.
3. Intensity-0 padding is acceptable *if* the shader-loop cost at the chosen N is measured and accepted; otherwise cap/cull real lights (visual contract) instead of padding.
4. After the light axis is gone, leftover instancing duplicates are a smaller B; loading-time `compileAsync` (A) is only in scope once `dumpProgramFirstUse()` plateaus near the frame-0 set with few new keys.

Do **not** revive per-chunk / per-tick / full-scene `compileAsync()`. Do not merge GLTF materials globally. Leave `?pinPointLights` as an opt-in diagnostic until that plan lands (or delete the pad if the follow-up takes a different mechanism).
