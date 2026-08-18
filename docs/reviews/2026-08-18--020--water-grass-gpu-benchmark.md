# Review 020: Real-GPU water × grass optimization benchmark

**Status:** `done`
**Date:** `2026-08-18`

Cursor embedded browser + CDP, hardware WebGL (not agent-browser / SwiftShader). Sequential comparison of plan 148 S (grass geometry LOD) and plan 144 S (water-mirror outer-ring visibility).

## Environment

- Cursor IDE browser. GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Confirmed via `WEBGL_debug_renderer_info` on the Three.js canvas — not SwiftShader.
- `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1` (same as [review 015](./2026-08-15--015--browser-performance-benchmark.md)). Reports: `pixelRatio=1`, `quality: High`.
- New game each origin: `?perf=1&seed=42&res=193`. `seed`/`res` apply on New Game; a reused `:5577` origin with an existing save produced a non-comparable `current` (55 chunks / 110k grass instances) and was discarded. Valid HEAD runs used a fresh origin (`:5580`).
- One tab at a time. 30 s per scenario via `window.__seedvaleRunBenchmark`. Isolation probes run after each non-`stream` scenario (~8 s extra; 400 ms samples — noisy).
- Git states (incremental, as landed):

| Label | Commit | What |
|---|---|---|
| Baseline | `cfdb83a` | before 148 S and 144 S |
| Grass | `68e1bf4` | 148 S geometry LOD only |
| Grass+water | `c834210` | 148 S + 144 S reflection visibility budget |

## Results

`current` and `water` scene censuses matched across the three builds (same spawn / same `seekWater` hit). `stream` end-of-sprint census did **not** (chunk counts 69 / 69 / 77) — hitch variance; do not treat `stream` FPS as a 144 S win.

### `current` (spawn, 61 chunks, 13 NPC, grass 315 789 instances)

| Metric | Baseline | Grass | Grass+water |
|---|---:|---:|---:|
| FPS avg / min / p1 | 58.9 / 23 / 32 | 58.2 / 21 / 30 | 58.7 / 17 / 33 |
| Frame avg / p95 / max (ms) | 17.0 / 25.6 / 43.7 | 17.2 / 25.8 / 47.5 | 17.0 / 24.8 / 57.2 |
| RENDER / WATER (ms) | 12.7 / 2.0 | 12.9 / 2.2 | 12.9 / 2.1 |
| Draw calls avg | 1307 | 1305 | 1309 |
| Triangles avg | 9 639 457 | 7 886 686 | 7 510 854 |
| Mirror draw calls avg | 207 | 206 | 197 |
| Grass census tris | 8 537 018 | 4 529 954 | 4 529 954 |
| Terrain / vegetation census tris | 4 497 408 / 333 550 | 4 497 408 / 333 550 | 4 497 408 / 333 550 |

Grass instances and draw calls stayed 315 789 / 84. Whole-scene triangle drop from baseline→grass is −1 752 771 in `trianglesAvg` and −4 007 064 in the grass census (identical absolute census delta to the headless run in plan 148 notes).

### `water` (same lake, 62 chunks, 5 NPC, grass 49 906 instances)

| Metric | Baseline | Grass | Grass+water |
|---|---:|---:|---:|
| FPS avg / min / p1 | 116.5 / 44 / 51 | 116.0 / 49 / 61 | 123.3 / 39 / 64 |
| Frame avg / p95 / max (ms) | 8.6 / 14.6 / 22.5 | 8.6 / 13.1 / 20.6 | 8.1 / 12.0 / 25.5 |
| RENDER / WATER (ms) | 5.7 / 1.1 | 5.6 / 1.3 | 5.1 / 1.1 |
| Draw calls avg | 151 | 152 | 147 |
| Triangles avg | 5 453 988 | 4 730 928 | 4 300 300 |
| Mirror draw calls avg | 30 | 30 | 25 |
| Grass census tris | 1 358 196 | 579 618 | 579 618 |

This scenario is GPU-light (~120 FPS). Not a useful stress test for WATER; useful as a matched-scene census.

### `stream` (noisy)

| Metric | Baseline | Grass | Grass+water |
|---|---:|---:|---:|
| FPS avg | 36.6 | 36.5 | 50.1 |
| Frame p95 / max (ms) | 39.4 / 5706 | 42.1 / 6224 | 40.5 / 1653 |
| RENDER / WATER (ms) | 13.1 / 10.0 | 18.9 / 4.4 | 12.5 / 3.5 |
| Mirror draw calls avg | 150 | 146 | 114 |
| Triangles avg | 12 067 535 | 9 462 851 | 8 736 736 |
| Loaded chunks at end | 69 | 69 | 77 |

Max frame is a first-use shader hitch (same class as review 015 / 019), not the optimizations. Grass→HEAD `stream` FPS 36.5→50.1 coincides with a much smaller hitch (6.2 s → 1.7 s) and a different end census — **not** attributed to 144 S.

## Findings

**148 S — grass geometry LOD (baseline → grass)**

- Grass census triangles **−47.0%** on `current` (8.54 M → 4.53 M) and **−57.3%** on `water` (1.36 M → 0.58 M). Instance count and grass draw calls unchanged.
- On real Intel Arc GPU, **FPS / RENDER / frame p95 did not improve** on `current` (58.9→58.2 FPS, RENDER 12.7→12.9 ms, p95 25.6→25.8 ms). Matches the headless SwiftShader result in plan 148 notes, so that was not a software-renderer artifact.
- Isolation `hide-grass` on `current` did not reduce RENDER (400 ms samples; if anything slightly higher). Grass vertex count is not the sustained bottleneck in this spawn scene — RENDER stays ~13 ms with or without the extra 4 M grass triangles.
- Do not start 148 M (density LOD / far shader) from this. The plan's own gate: triangles down without RENDER/FPS movement means stop and look elsewhere.

**144 S — reflection visibility budget (grass → grass+water)**

- Matched `current`: mirror draw calls 206→197 (−4.4%), WATER 2.2→2.1 ms, FPS 58.2→58.7. No meaningful frame-time win. Scene grass/terrain/vegetation census identical, so the delta is the mirror pass.
- Matched `water`: mirror draw calls 30→25 (−17%), WATER 1.1 ms both (1.3 on grass-only). Absolute mirror cost here is tiny.
- Isolation `full` vs `no-reflections` triangle delta on `current` (400 ms): grass-only ~0.82 M, grass+water ~0.42 M — directionally consistent with outer-ring exclusion, but the probe is too short to treat as a precise mirror-triangle meter. The report JSON has `mirrorDrawCallsAvg` only, no `mirrorTrianglesAvg`.
- Predicted 5–15% of *mirror* cost: draw-call drop is at the low end of that band on `current`. It does **not** show up in FPS/WATER at spawn, where WATER is already ~2 ms vs RENDER ~13 ms.
- Visual hard cutoff (shoreline / distant village in the reflection) was **not** checked.

**Stop / next**

- Keep both S changes: mechanical census is clean; no FPS regression on matched `current`/`water`.
- Do **not** start 144 M/L or 148 M from this run.
- Remaining bottleneck on `current` is still RENDER (~13 ms), not grass triangles and not the ~2 ms WATER pass.

## Known limitations

- Single run per cell (no repeats). Deltas of a few FPS or 0.2 ms WATER are noise.
- Cursor embedded browser, not a full window / vsync-capped display.
- `stream` is hitch-dominated; end census drifted on HEAD.
- No visual check of reflection cutoff or grass LOD popping.
- 5577-continue runs discarded; not mixed into the tables.
