# Research 018: `?benchmark=stream` isolation probes — sustained RENDER + max frame

**Status:** `in progress` (measured; conclusions are single-run, see §6)
**Date:** 2026-08-17
**Goal:** attribute (a) the sustained ~20–30 ms `RENDER` cost and (b) the very large max frame times in the `stream` benchmark.
**Context:** [research 015](2026-08-17--015--streaming-hitch-gl-errors-handoff.md), [research 017](2026-08-17--017--threejs-rendering-audit.md).

---

## 1. Method

Four full 30 s `?benchmark=stream` runs, **one page reload each** (a warm `WebGLProgram` cache from a previous run in the same tab would mask the first-use link stalls that dominate max frame time). Quality `High`, pixel ratio 1, seed 42, identical scenario, all four verified from the report header.

Toggles reused the existing `IsolationHost` contract (`src/perf/isolationProbe.ts`) via a temporary URL hook — that module's own probes are 400 ms and are skipped for `stream` (`benchmark.ts:150`), so they could not answer this. The hook was reverted after the runs; nothing from it remains in the tree.

| Probe | What is off | What is still on |
|---|---|---|
| `baseline` | — | — |
| `mirror-off` | `waterMirror.setEnabled(false)` — mirror pass is a no-op | water still drawn, without reflections |
| `post-off` | AO, bloom, SMAA, god rays, film grade | `RenderPass` + `OutputPass` (composer must still draw the scene and tone-map once) |
| `water-off` | `camera.layers.disable(WATER_RENDER_LAYER)` — ocean **and** chunk water | mirror pass still runs |

**All four runs measured a pinned-on N8AO pass** — the AO diagnostic (research 017 §4 F5) was still live. It was removed immediately after these runs, so §5 applies.

---

## 2. Results

| | baseline | mirror-off | post-off | water-off |
|---|---|---|---|---|
| FPS avg | 23.3 | **31.8** | 24.9 | 21.1 |
| FPS min | 3 | 3 | 3 | 1 |
| FPS p1 | 10 | 14 | 15 | 13 |
| frame avg (ms) | 43.0 | **31.5** | 40.2 | 47.3 |
| frame p95 (ms) | 69.8 | **45.0** | 52.5 | 60.7 |
| frame max (ms) | 390.8 | 324.5 | 364.4 | **913.4** |
| draw calls avg | 2298 | **1424** | 2285 | 2354 |
| draw calls max | 2903 | 1832 | 2894 | 2887 |
| triangles avg | 18.81 M | **9.83 M** | 18.61 M | 19.28 M |
| mirror draws avg | 858 | **0** | 889 | 926 |
| `RENDER` (ms) | 28.7 | 27.9 | **23.4** | 31.8 |
| `WATER` (ms) | 10.5 | **— (<0.05)** | 12.6 | 11.8 |
| critical spikes | GRASS 3, STREAMING 1 | GRASS 2 | GRASS 5, STREAMING 4 | (none) |
| hitches | grass gen ×3 (max 12.8), chunk mesh ×1 (8.6) | grass gen ×2 (max 8.8) | grass gen ×5 (max 12.3), chunk mesh ×4 (max 11.8) | (none) |
| loaded chunks | 68 | 72 | 75 | 68 |

Derived — main pass draw calls (`total − mirror`): **1440 / 1424 / 1396 / 1428**. Essentially constant across all four.

---

## 3. Finding 1 — the water mirror is ~a quarter of the frame, and it is not fill rate

`WATER` also wraps `chunkManager.tickWater()` and `ocean.update()` (`gameLoop.ts:940,943`), but `mirror-off` drops the entire category below the 0.05 ms report threshold — so those two are negligible and **`WATER` ≈ the mirror pass**.

Turning the mirror off:

- `WATER` 10.5 ms → 0
- frame avg 43.0 → 31.5 ms (−11.5 ms, −27 %)
- p95 69.8 → 45.0 ms (−36 %)
- draw calls 2298 → 1424 (−874, −38 %)
- triangles 18.81 M → 9.83 M (−48 %)
- `RENDER` 28.7 → 27.9 ms (unchanged — confirming the two categories don't overlap)

**The mirror renders into a 128×128 target** (`WATER_MIRROR_SIZE`), i.e. 16 384 pixels, throttled to 30 Hz. A cost of 10.5 ms there cannot be fragment/fill work. It is **CPU scene submission plus vertex processing**: ~860 draw calls and ~9 M triangles — roughly the same triangle load as the full-resolution main pass, despite skipping the water and agent layers.

The mechanism is visible in `waterMirror.ts`: the mirror camera copies the main camera's projection and sets `mirrorCamera.far = camera.far`, so the reflection pass draws the world to full view distance at full geometric detail, with no LOD reduction and no reduced far plane. Resolution is the one thing that was tuned down; everything that actually costs is untouched.

*(Seedvale-specific inference, high confidence — the effect is large and every derived quantity moves coherently.)*

## 4. Finding 2 — max frame is untouched by every probe

| probe | max frame |
|---|---|
| baseline | 390.8 ms |
| mirror-off | 324.5 ms |
| post-off | 364.4 ms |
| water-off | 913.4 ms |

No toggle removes it. Critically, **`mirror-off` still shows a 324 ms frame with the mirror pass entirely disabled.** That is direct experimental confirmation of [research 017 §3.1](2026-08-17--017--threejs-rendering-audit.md): the mirror and the beauty pass share one `WebGLProgram` cache-key variant, and the mirror is expensive in the traces only because it runs *first* in the frame. Remove it and the composer pass becomes first in line and absorbs the same first-use, driver-side program-link wait.

**The `hitches` list cannot see these frames.** `withCategory()` (`monitor.ts`) only accumulates time — it never calls `recordHitch()`, which fires solely at explicitly instrumented sites (grass generation, chunk mesh/water, chunk unload) above an 8 ms threshold. So the largest hitch ever reported here is 12.8 ms while the frame timer records 913 ms. `water-off`'s `"hitches": []` is not evidence of a smooth run — it is the run with the worst max frame.

This is an instrumentation gap, and it is why every attempt so far to attribute the hitch from report data alone has failed. Research 015 §5 step 2 already recommended committing `performance.mark`/`measure` instrumentation around the mirror and composer calls; these probes make that a prerequisite, not an option.

## 5. Finding 3 — postprocessing effects are a minority of `RENDER`

`post-off` (AO + bloom + SMAA + god rays + film grade all disabled) moves `RENDER` 28.7 → 23.4 ms, i.e. **all five effect passes together cost ~5.3 ms**. The remaining ~23 ms of `RENDER` is main-pass scene submission plus the shadow pass — with main-pass draw calls at ~1400 in every probe.

Frame avg only improved 43.0 → 40.2 ms because `WATER` rose 10.5 → 12.6 ms in that run (more loaded chunks: 75 vs 68), partly offsetting the gain.

**Caveat that outranks the number itself:** AO was pinned on for all four runs. With the auto-budget restored (`AO_SUPPRESS_MS = 15`, and `renderMs` was 23–32 ms throughout), N8AO would have been suppressed for most of this benchmark. The 5.3 ms figure is therefore an *AO-always-on* worst case, and `baseline` is not the shipping configuration. **These numbers need re-measuring.**

## 6. Finding 4 — water geometry is not a measurable cost; `water-off` is uninterpretable

`water-off` came out **worse** than baseline on every sustained metric: frame avg 47.3 vs 43.0, `RENDER` 31.8 vs 28.7, FPS 21.1 vs 23.3, draw calls 2354 vs 2298 — despite an identical scene census in 8 of 10 buckets and the same 68 loaded chunks.

Main-pass draw calls fell only 1440 → 1428 (−12), because most of the 45 chunk-water meshes in the census are outside the frustum at any moment. So the probe removed ~12 draws and the run got slower — the effect is smaller than the noise.

**Conclusions:** (a) water *geometry* is not a significant renderer cost — the water cost is the mirror, not the surface; (b) run-to-run variance in this benchmark is on the order of several ms of frame time, so the 913 ms max must not be read as caused by disabling water.

## 7. Confidence

| Finding | Confidence | Why |
|---|---|---|
| Mirror ≈ 10.5 ms, 37 % of draws, 48 % of triangles | **High** | Large effect, all derived quantities move coherently, mechanism visible in source |
| Max frame survives every probe; not the mirror per se | **High** | 324 ms with the mirror fully off is unambiguous |
| `hitches` structurally blind to these frames | **High** | Read directly from `monitor.ts` |
| Effect passes ≈ 5.3 ms of `RENDER` | **Medium** | Single run, confounded by differing chunk counts and by pinned-on AO |
| Water geometry negligible | **Medium** | Inverted result, but consistent with the −12 draw calls |

Single 30 s runs, no repeats. Loaded chunks varied 68–75 and vegetation meshes 311–409 between probes, so differences under ~3 ms of frame time are not resolvable here.

## 8. Follow-ups (nothing implemented)

1. **Re-run all four probes** now that the AO diagnostic is removed and the auto-budget is live again. The baseline above is not the shipping configuration.
2. **Commit `performance.mark`/`measure` instrumentation** around `renderMirror()` and `composer.render()`, or make `withCategory` record a hitch when a category's own span exceeds the threshold. Without this the dominant frames stay unattributed (§4).
3. **Mirror pass cost reduction** — the highest-value sustained target found (~10.5 ms, 860 draws, 9 M tris at 128²). Candidate levers, all needing a benchmark and a plan: a reduced `mirrorCamera.far`, an aggressive LOD/distance cull for the reflection pass, or restricting which buckets are mirror-visible. **Not attempted here.**
4. Repeat each probe ≥3× before trusting any difference under ~3 ms (§7).
