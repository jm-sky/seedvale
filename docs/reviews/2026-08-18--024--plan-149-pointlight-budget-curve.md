# Review 024: Plan 149 — PointLight budget 8 / 12 / 16 (cheap pin)

**Status:** `done`
**Date:** `2026-08-18`
**Runs:** **3** cold baseline + **3** cold `?pinPointLights=8` + **3** cold `12` + **3** cold `16` (`?benchmark=stream`, fresh page load each time)
**Scope:** diagnostic budget-curve experiment only. Opt-in dummy pad + overflow cull, URL-gated. No `compileAsync()`, no prewarm, no shader / material / ChunkManager / water / postprocess change. **No commit.**

Follows [review 023](./2026-08-18--023--plan-149-pointlight-variant-axis.md). Plan: [149](../plans/2026-08-18--157--shader-program-first-use-hitch.md).

## Environment

- Cursor IDE browser + CDP, hardware WebGL. GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)` via `WEBGL_debug_renderer_info` before/during runs — **not SwiftShader**. Same renderer string on all twelve runs.
- `KHR_parallel_shader_compile`: **available** (`true`).
- `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1`. Reports: `pixelRatio=1`, `quality: High`, `seed=42`, `res=193`.
- Fresh origin **per variant** so IndexedDB / in-game clock from another condition cannot leak:
  - baseline `:5590`
  - budget 8 `:5591`
  - budget 12 `:5592`
  - budget 16 `:5593`
- Unattended `?benchmark=stream` auto-continues/creates the seed-42 world. Runs 2–3 of a variant continue that variant's own save after a **cold page reload** (new WebGL context).
- Experiment flag: `?pinPointLights=8|12|16`. Off by default.

## Cheap pin (what changed vs review 023)

Three.js `NUM_POINT_LIGHTS` is `WebGLLights.setup` `pointLength`: one increment per **visible** `PointLight` collected by `projectObject`. There is no scene-level light list to reuse. House lamps / village torches keep `Object3D.visible === true` even at `intensity === 0`, so streaming a settlement still grows the count.

Review 023 padded with intensity-0 dummies but recounted every frame with `scene.traverseVisible()`. That second full-scene walk was mixed into RENDER/p95.

This experiment:

1. **Add/remove registry** of real `PointLight`s (`Object3D.prototype.add`/`remove` only while the pad is alive; restored on `dispose`). `sync()` walks **that set** (~11–23 lights) and parent-visibility, **not** the whole scene.
2. **Pad** with intensity-0 dummies so visible count = budget when under.
3. **Overflow cull** (dimmest first, then furthest from camera) so the count cannot rise above the budget — required for 8/12, because observed real counts go to **15–21**.

Measured `syncMs`: **0.0–0.2 ms**. The 023 traverse is gone.

This is still opt-in diagnostics in `src/perf/pointLightBudget.ts`. Not a lighting manager. Not a shippable lighting model.

## Results

Do **not** rank mean FPS. Hitch signal is census stage `durationMs` on `programDelta > 0`. Table values are the **median** of three cold runs. `frame p50` is **not** in `PerfReportJson`; the column is `frameTime.avg`.

| Metric | Baseline | Budget 8 | Budget 12 | Budget 16 |
|---|---:|---:|---:|---:|
| unique cacheKeys | 227 | **62** | **62** | **62** |
| programs | 220 | **62** | **62** | **62** |
| first-use events | 227 | **62** | **62** | **62** |
| max first-use hitch (ms) | 1242 | 280 | 844 | 411 |
| hitch ≥100ms | 10 | **2** | **2** | **3** |
| hitch ≥500ms | 1 | **0** | 1 | **0** |
| frame avg (ms) | 23 | 34 | 48 | 37 |
| frame p95 (ms) | 49 | 72 | 100 | 77 |
| frame max (ms, report) | 389 | **103** | 126 | 245 |
| RENDER (ms) | 14 | 22 | 22 | 26 |
| WATER (ms) | 3.2 | 3.2 | 3.0 | 3.4 |
| draw calls avg | 624 | 626 | 853 | 636 |
| triangles avg | 8 574 000 | 7 246 000 | 7 694 000 | 8 858 000 |

Budget 12 run 1 was hitch-starved (FPS 7.3, frame-0 mirror **4847 ms**, RENDER 70) — the same class as [review 021](./2026-08-18--021--plan-149-phase-0-real-gpu.md) run 1. It pulls the 12 median p95/max-hitch up. Runs 2–3 of 12 are 88 / 74 ms max-after-frame-0 and RENDER 21.5 / 15.4.

### Baseline (no pin)

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg | 54.3 | 44.3 | 30.2 |
| Frame avg / p95 / **max** | 18.4 / 40.4 / **343** | 22.6 / 49.2 / **1297** | 33.1 / 82.4 / **389** |
| RENDER / WATER | 12.4 / 2.2 | 14.2 / 3.7 | 23.1 / 3.2 |
| unique `cacheKey` / programCount | 227 / 220 | 219 / 214 | 294 / 289 |
| `Green` / `MI_WindowGlass` / `Wood` | 26 / 18 / 9 | 25 / 16 / 10 | 33 / 22 / 12 |
| `numPointLights` (physical) | 0,3,8,9,10,13,15 | 2,3,8,10,11,14,16 | 2,3,8,9,10,11,16,17 |
| hitch events / max hitch | 32 / **391** | 26 / **1242** | 31 / **11682** |
| max hitch after frame 0 | 329 | **1242** | **11682** |
| Frame 0 first-use | 54 | 54 | 52 |

Streaming bursts remain: run 2 mirror **1242 ms Δ7** at frame 1218; run 3 postprocess **11682 ms Δ27** at frame 859. Report `frameTime.max` can understate the census stage (run 3: report 389 vs census 11682) — same mismatch class as review 021.

### Budget 8 (`?pinPointLights=8`, origin `:5591`)

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg | 29.2 | 36.9 | 17.6 |
| Frame avg / p95 / **max** | 34.3 / 71.9 / **130** | 27.1 / 69.7 / **93** | 56.8 / 91.6 / **103** |
| RENDER / WATER | 24.2 / 3.2 | 12.8 / 2.0 | 21.9 / 3.6 |
| unique `cacheKey` / programCount | **63 / 63** | **62 / 62** | **62 / 62** |
| `Green` / `MI_WindowGlass` / `Wood` | 5 / 4 / 2 | 5 / 4 / 2 | 5 / 4 / 2 |
| `numPointLights` | **8 only** | **8 only** | **8 only** |
| hitch / after frame 0 | 9 / 7 | 9 / 7 | 8 / 6 |
| max hitch / max after frame 0 | 420 / 119 | 266 / 46 | 280 / 61 |
| pad `overflowMax` / culled | 15 / 7 | 15 / 7 | 21 / 13 |
| `syncMs` | 0.1 | 0.0 | 0.0 |

Program count is bit-stable at **62–63**. Overflow **always** fires (real visible lights 15–21). Streaming Δ19–27 bursts are gone; leftover after frame 0 is Δ1–2 / 46–119 ms (instancing/mask).

### Budget 12 (`?pinPointLights=12`, origin `:5592`)

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg | 7.3 | 20.8 | 32.2 |
| Frame avg / p95 / **max** | 137.6 / 368.6 / **545** | 48.2 / 100.3 / **126** | 31.0 / 63.8 / **86** |
| RENDER / WATER | 70.2 / 14.3 | 21.5 / 3.0 | 15.4 / 2.1 |
| unique `cacheKey` / programCount | **63 / 63** | **62 / 62** | **62 / 62** |
| `Green` / `MI_WindowGlass` / `Wood` | 5 / 4 / 2 | 5 / 4 / 2 | 5 / 4 / 2 |
| `numPointLights` | **12 only** | **12 only** | **12 only** |
| hitch / after frame 0 | 9 / 7 | 8 / 6 | 8 / 6 |
| max hitch / max after frame 0 | 4847 / 534 | 844 / 88 | 307 / 74 |
| pad `overflowMax` / culled | 16 / 4 | 21 / 9 | 21 / 9 |

Same 62-program plateau. Overflow still fires. Run 1 is not a runtime-cost sample.

### Budget 16 (`?pinPointLights=16`, origin `:5593`) — cheap-counter control vs 023

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg | 43.0 | 23.5 | 27.4 |
| Frame avg / p95 / **max** | 23.3 / 55.6 / **248** | 42.5 / 88.8 / **157** | 36.6 / 76.8 / **245** |
| RENDER / WATER | 16.1 / 2.3 | 30.4 / 4.0 | 25.9 / 3.4 |
| unique `cacheKey` / programCount | **63 / 63** | **62 / 62** | **62 / 62** |
| `Green` / `MI_WindowGlass` / `Wood` | 5 / 4 / 2 | 5 / 4 / 2 | 5 / 4 / 1 |
| `numPointLights` | **16 only** | **16 only** | **16 only** |
| hitch / after frame 0 | 8 / 6 | 8 / 6 | 9 / 7 |
| max hitch / max after frame 0 | 543 / 64 | 411 / 127 | 402 / 122 |
| pad `overflowMax` / culled | **15 / 0** | **15 / 0** | **15 / 0** |

On this morning `stream` protocol, budget 16 **never overflowed** (same 15 as review 023). Depth programs drop to **11** (run 3 `byType`); ShaderMaterials stay ~22 (frame-0 post/sky/water/grass). Leftover named copies are the instancing/mask axis (`Green` 5, glass 4, wood 1–2), all `npl=16`.

## Cheap pin vs review 023 traverse pad

| | 023 dummy pad (16, traverse) | This cheap pad (16, registry) |
|---|---:|---:|
| unique keys | 62 | 62 |
| streaming bursts | gone | gone |
| `sync` cost | full `traverseVisible` / frame | **0.0–0.2 ms** |
| median RENDER | **33** | **26** (run 1 **16.1**, near this session's baseline 14) |
| median frame p95 | **92** | **77** |

Most of the 023 RENDER/p95 regression was the diagnostic traverse, not the 16-light shader loop. The loop is still real (every `MeshStandardMaterial` iterates `NUM_POINT_LIGHTS` even when nearby lamps are intensity 0), but it is **not** a +15 ms tax once counting is cheap. 8 vs 12 vs 16 RENDER sits inside host noise (±10 ms); **8 does not buy a cheaper frame than 16** in this data.

## Visual

Daytime screenshots after stream, same seed/settlement (`Osada Brzozowa`), ~09:00–10:20:

- Terrain, grass, mixed foliage, settlement props, directional shadows, bloom/fog — present on baseline / 8 / 12 / 16.
- No black/uninitialized materials, no flicker, no new shader errors in the captured frames.
- `gl.getError()` **1282** (`GL_INVALID_OPERATION`) once after drain on every condition — same leftover as reviews 021–023, **not attributed** to the pad.

**Overflow visual (not optional):**

- Budget **8** and **12** always cull real lights on this protocol (`overflowMax` 15–21). By day most of those objects are intensity-0 house lamps, so the daytime screenshot does **not** show missing glow.
- A continue of budget 8 after in-game clock reached **22:47 / noc** was very dark, with no obvious village point lighting. That is a **real night regression** for budget 8 (9 of 17 lights culled).
- Budget **16** did not cull on the morning `stream` runs. Later-day/night counts of **21** (seen on the 8/12 origins as time advanced) mean 16 is **not** a guaranteed cap for a full day/night cycle.

Water/reflection: stream path stays in the home settlement; no dedicated lake screenshot this session. WATER ms is flat across variants (2–4 ms; 12 run 1 excluded). No WATER regression attributed to the pin.

## Trade-off table

| Budget | Program reduction | Runtime cost | Visual impact | Overall |
|---|---:|---|---|---|
| 8 | −73% (227→62) | hitch win; RENDER/p95 **not** better than 16 | **culls 7–13 lights**; night too dark | reject |
| 12 | −73% (227→62) | same hitch win; RENDER noisy, not cheaper than 16 | **culls 4–9 lights** | reject |
| 16 | −73% (227→62) | streaming bursts gone; RENDER near baseline once traverse is gone; p95 still a bit worse | morning stream **no cull**; night/day-cycle may exceed 16 | **best of the curve** |

## Decision

**C — Budget 16** is the only budget on this curve that keeps visual lighting on the `stream` protocol **and** collapses the variant axis.

**A (8) and B (12) are rejected:** they do not reduce RENDER versus 16, and they hide real lights.

**Do not ship the pad.** It remains `?pinPointLights` diagnostics. Frame 0 still compiles ~52 programs (0.3–0.8 s typical, occasionally multi-second). Leftover instancing/mask (`Green` 5 / glass 4 / wood 2, Δ1–3 / ~50–130 ms after frame 0) is the next axis — not solved here.

**D (no fixed budget)** is the right answer **for production today**. **C** is the right answer **for the next implementation plan**.

## Next step (not implemented here)

A **separate plan** to constrain the PointLight axis for real:

1. Keep `NUM_POINT_LIGHTS` constant with this cheap add/remove counter (no full-scene traverse).
2. Default budget **16** for the current morning-stream light set; measure night / multi-settlement overflow (this session saw 21) before freezing the number.
3. Intensity-0 padding is acceptable at 16 **if** the follow-up re-checks RENDER on a quiet machine; do not bring back `traverseVisible`.
4. After the light axis is gone: leftover instancing/mask, then a stable program set, then loading-window `compileAsync` (plan 149 Phase 1 A).

Do **not** revive per-chunk / per-tick / full-scene `compileAsync()`. Do not merge GLTF materials globally. Leave `?pinPointLights` opt-in until that plan lands.
