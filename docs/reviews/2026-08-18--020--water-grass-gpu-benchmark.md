# Review 020: Real-GPU water × grass optimization benchmark

**Status:** `done`
**Date:** `2026-08-18`
**Runs:** **2** (same protocol, same commits, fresh origins each time)

Cursor embedded browser + CDP, hardware WebGL (not agent-browser / SwiftShader). Sequential comparison of plan 148 S (grass geometry LOD) and plan 144 S (water-mirror outer-ring visibility).

## Environment

- Cursor IDE browser. GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Confirmed via `WEBGL_debug_renderer_info` on the Three.js canvas — not SwiftShader. Same renderer string on both runs.
- `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1` (same as [review 015](./2026-08-15--015--browser-performance-benchmark.md)). Reports: `pixelRatio=1`, `quality: High`.
- New game each origin: `?perf=1&seed=42&res=193`. `seed`/`res` apply on New Game. Run 1 discarded a `:5577` continue (55 chunks / 110k grass) and used `:5580` for HEAD. Run 2 used unused ports `:5581` / `:5582` / `:5583` so IndexedDB from run 1 could not leak.
- One tab at a time. 30 s per scenario via `window.__seedvaleRunBenchmark`. Isolation probes run after each non-`stream` scenario (~8 s extra; 400 ms samples — noisy).
- Git states (incremental, as landed):

| Label | Commit | What |
|---|---|---|
| Baseline | `cfdb83a` | before 148 S and 144 S |
| Grass | `68e1bf4` | 148 S geometry LOD only |
| Grass+water | `c834210` | 148 S + 144 S reflection visibility budget (run 2 served `27c4773`, docs-only on top of `c834210`) |

Run 1 measured `current`, `water`, and `stream`. Run 2 repeated **`current` and `water` only** (`stream` was hitch-dominated in run 1).

## Results

`current` and `water` scene censuses matched across the three builds **in both runs** (same spawn / same `seekWater` hit). Grass instance counts were bit-identical: 315 789 on `current`, 49 906 on `water`.

### Run 1 — `current` (spawn, 61 chunks, 13 NPC, grass 315 789 instances)

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

### Run 2 — `current` (same spawn census)

| Metric | Baseline | Grass | Grass+water |
|---|---:|---:|---:|
| FPS avg / min / p1 | 46.4 / 14 / 19 | 57.1 / 23 / 31 | 22.8 / 11 / 15 |
| Frame avg / p95 / max (ms) | 21.5 / 45.6 / 73.6 | 17.5 / 25.4 / 43.0 | 43.8 / 60.7 / 87.6 |
| RENDER / WATER (ms) | 15.9 / 2.8 | 13.0 / 2.1 | 31.9 / 6.0 |
| Draw calls avg | 1307 | 1300 | 1301 |
| Triangles avg | 9 631 896 | 7 854 058 | 7 522 922 |
| Mirror draw calls avg | 204 | 197 | 204 |
| Grass census tris | 8 537 018 | 4 529 954 | 4 529 954 |

Run 2 FPS/RENDER drifted across cells (46 → 57 → 23). That is host load, not the optimizations — do not rank FPS from run 2. Census and `trianglesAvg` still match run 1.

### Run 1 — `water` (same lake, 62 chunks, 5 NPC, grass 49 906 instances)

| Metric | Baseline | Grass | Grass+water |
|---|---:|---:|---:|
| FPS avg / min / p1 | 116.5 / 44 / 51 | 116.0 / 49 / 61 | 123.3 / 39 / 64 |
| Frame avg / p95 / max (ms) | 8.6 / 14.6 / 22.5 | 8.6 / 13.1 / 20.6 | 8.1 / 12.0 / 25.5 |
| RENDER / WATER (ms) | 5.7 / 1.1 | 5.6 / 1.3 | 5.1 / 1.1 |
| Draw calls avg | 151 | 152 | 147 |
| Triangles avg | 5 453 988 | 4 730 928 | 4 300 300 |
| Mirror draw calls avg | 30 | 30 | 25 |
| Grass census tris | 1 358 196 | 579 618 | 579 618 |

### Run 2 — `water` (same lake census)

| Metric | Baseline | Grass | Grass+water |
|---|---:|---:|---:|
| FPS avg / min / p1 | 56.1 / 19 / 26 | 47.3 / 20 / 22 | 55.7 / 22 / 26 |
| Frame avg / p95 / max (ms) | 17.8 / 31.9 / 51.7 | 21.1 / 37.5 / 50.3 | 18.0 / 32.3 / 46.0 |
| RENDER / WATER (ms) | 12.5 / 2.5 | 14.5 / 2.9 | 12.6 / 2.3 |
| Draw calls avg | 140 | 138 | 133 |
| Triangles avg | 4 989 379 | 4 156 015 | 3 777 045 |
| Mirror draw calls avg | 29 | 30 | 23 |
| Grass census tris | 1 358 196 | 579 618 | 579 618 |

This scenario is GPU-light when the machine is quiet (~120 FPS in run 1). Run 2 sat ~50 FPS; still not a WATER stress test. Census is the stable signal.

### Run 1 — `stream` (noisy; not repeated)

| Metric | Baseline | Grass | Grass+water |
|---|---:|---:|---:|
| FPS avg | 36.6 | 36.5 | 50.1 |
| Frame p95 / max (ms) | 39.4 / 5706 | 42.1 / 6224 | 40.5 / 1653 |
| RENDER / WATER (ms) | 13.1 / 10.0 | 18.9 / 4.4 | 12.5 / 3.5 |
| Mirror draw calls avg | 150 | 146 | 114 |
| Triangles avg | 12 067 535 | 9 462 851 | 8 736 736 |
| Loaded chunks at end | 69 | 69 | 77 |

Max frame is a first-use shader hitch (same class as review 015 / 019), not the optimizations. Grass→HEAD `stream` FPS 36.5→50.1 coincides with a much smaller hitch (6.2 s → 1.7 s) and a different end census — **not** attributed to 144 S. Not repeated in run 2.

## Findings

**148 S — grass geometry LOD (baseline → grass) — confirmed twice**

- Grass census triangles **−47.0%** on `current` (8.54 M → 4.53 M) and **−57.3%** on `water` (1.36 M → 0.58 M) in **both** runs. Instance count and grass draw calls unchanged (84 / 315 789 on `current`; 24 / 49 906 on `water`).
- `trianglesAvg` on `current` is stable across runs: 9.64 M → 7.89 M (run 1) and 9.63 M → 7.85 M (run 2).
- Run 1 FPS/RENDER on `current` did not improve (58.9→58.2 FPS, RENDER 12.7→12.9 ms). Run 2 FPS cannot be used for that comparison (load drift). The mechanical result is confirmed; a FPS win is still not shown.
- Do not start 148 M (density LOD / far shader) from this. The plan's own gate: triangles down without RENDER/FPS movement means stop and look elsewhere.

**144 S — reflection visibility budget (grass → grass+water)**

- Census on `current`/`water` identical between grass and grass+water in both runs — the code change is mirror-only.
- Mirror draw calls on `current`: run 1 206→197 (−4%); run 2 197→204 (no drop). That −4% did **not** replicate.
- Mirror draw calls on `water`: run 1 30→25; run 2 30→23. Small drop replicated on the lake scene; absolute cost is tiny.
- Run 1 WATER/FPS on matched `current` was flat (2.2→2.1 ms, 58.2→58.7). Run 2 FPS unusable for this delta.
- Predicted 5–15% of *mirror* cost is at best a small lake-scene draw-call dip. It does not show up as a frame-time win. Visual hard cutoff still unchecked.

**Stop / next**

- Keep both S changes: grass census is clean twice; no demonstrated FPS regression on the quiet run 1 `current`/`water`.
- Do **not** start 144 M/L or 148 M from these runs.
- Remaining bottleneck on a quiet `current` is still RENDER (~13 ms), not grass triangles and not the ~2 ms WATER pass.

## Known limitations

- Two runs on `current`/`water`. Run 2 absolute FPS/RENDER drifted (host load) — census is the repeated signal, not FPS ranking.
- `stream` measured once; hitch-dominated; end census drifted on HEAD.
- Cursor embedded browser, not a full window / vsync-capped display.
- No visual check of reflection cutoff or grass LOD popping.
- 5577-continue runs discarded; not mixed into the tables.
