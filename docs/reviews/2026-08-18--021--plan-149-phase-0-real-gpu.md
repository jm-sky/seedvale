# Review 021: Plan 149 Phase 0 — real-GPU program census

**Status:** `done`
**Date:** `2026-08-18`
**Runs:** **3** cold `?benchmark=stream` (fresh page load each time)
**Scope:** measurement only. No `compileAsync()`, no `checkShaderErrors` change, no material consolidation, no ChunkManager / render-pipeline change.

Cursor embedded browser + CDP, hardware WebGL (not agent-browser / SwiftShader). Confirms the Phase 0 instrumentation in `src/perf/programCensus.ts` against [plan 149](../plans/2026-08-17--149--shader-program-first-use-hitch.md).

## Environment

- Cursor IDE browser (Chromium/Electron 40, `Chrome/144.0.7559.236`). GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Confirmed via `WEBGL_debug_renderer_info` on the Three.js canvas before every run — **not SwiftShader**. Same renderer string on all three runs.
- `KHR_parallel_shader_compile`: **available** (`true`) on all three runs.
- `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1` (same as [review 020](./2026-08-18--020--water-grass-gpu-benchmark.md) / [review 015](./2026-08-15--015--browser-performance-benchmark.md)). Reports: `pixelRatio=1`, `quality: High`, `seed=42`, `res=193`.
- Fresh origin `http://localhost:5584/` (unused port so IndexedDB from `:5577` could not leak). Run 1 = New Game. Runs 2–3 = unattended continue of that same seed-42 save after a **cold page reload** (new WebGL context; program cache cannot survive reload).
- One tab at a time. Scenario: `?benchmark=stream&seed=42&res=193` (30 s sprint). Census auto-enables on `stream` and covers **world creation + settle + session**, not only `monitor.beginSession()`.
- Head commit: `086780a` (Phase 0 instrumentation). No renderer behaviour change.

## Results

`hitches` in the benchmark report is still blind to these frames (grass/chunk-mesh labels only, max 41–65 ms). Census `durationMs` on `mirror-render` / `postprocess-render` is the hitch signal. Do **not** rank mean FPS — it drifted 12.5 → 27 → 45 the same way review 020 run 2 did.

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| FPS avg / min / p1 | 12.5 / 2 / 3 | 27 / 0 / 6 | 45.2 / 1 / 12 |
| Frame avg / p95 / **max** (ms) | 79.7 / 266.7 / **408.8** | 37.0 / 64.7 / **5412.1** | 22.1 / 50.3 / **1557.6** |
| RENDER / WATER (ms) | 37.7 / 10.3 | 20.4 / 11.3 | 15.1 / 2.5 |
| Draw calls avg / max | 646 / 1497 | 798 / 1550 | 616 / 1542 |
| Triangles avg | 7 646 678 | 9 571 957 | 8 628 511 |
| Loaded chunks (end) | 68 | 66 | 75 |
| NPC / fauna | 4 / 23 | 13 / 23 | 21 / 23 |
| Census frames | 97 | 1122 | 2540 |
| **programCount final / max** | **241 / 241** | **225 / 225** | **234 / 234** |
| First-use stage events (`programDelta > 0`) | 22 | 24 | 29 |
| Stage growth total Δ | 243 | 229 | 239 |
| Slowest stage | mirror 5970.5 ms (Δ21, f66) | mirror 4253.6 ms (Δ19, f551) | mirror 1596.4 ms (Δ21, f0) |
| Avg stage ms (Δ=0 / Δ>0) | 9.6 / **553.6** | 9.7 / **780.5** | 7.6 / **294.2** |
| Max stage ms (Δ=0 / Δ>0) | 37.2 / **5970.5** | 73.5 / **4253.6** | 62.1 / **1596.4** |
| Stages ≥100 ms / ≥200 ms | 13 / 9 | 15 / 11 | 14 / 9 |
| Unique materials (last snapshot) | 585 | 632 | 636 |

Run 1 is hitch-starved (97 game frames in the whole lifetime — a 6 s mirror stall ate the clock). Its **report** `frame max` (408.8 ms) therefore **understates** the census hitch (5970 ms), which can fall in settle before `beginSession()`. Runs 2–3 have enough frames to also catch the stall inside the 30 s session (5412 ms and 1557 ms).

## Program census

### Initial burst is bit-stable

After the first rendered frame, program count is **53** on every run:

| Run | Frame 0 mirror | Frame 0 postprocess | Programs after frame 0 |
|---|---|---|---:|
| 1 | 0→20 (629 ms) | 20→53 (550 ms) | 53 |
| 2 | 0→21 (1132 ms) | 21→53 (741 ms) | 53 |
| 3 | 0→21 (1596 ms) | 21→53 (1142 ms) | 53 |

That first pair of stages is already a multi-hundred-ms (run 3: **1.6 s + 1.1 s**) first-use hitch on real GPU.

### Growth is family-first-use, not per-chunk

- Chunk **mesh** attach is always **1 terrain material** (`rootMaterialCount: [1]` on every run). Terrain stays one shared family, as `docs/STATE.md` says.
- Chunk **content** attach: 0–9 materials per chunk (avg ~3.2–3.6), buckets `items` + some `environment`. Vegetation/grass are **not** in the per-chunk attach (region batcher — already documented in the Phase 0 notes).
- Program count does **not** tick +1 per chunk. It stays flat for hundreds of frames, then jumps in bursts of 5–32 when a new family is first drawn (run 3: 93 programs from frame ~251 to ~611, then 93→137 around frame 652–662, later 173→234 around 1102–1141).
- After the last burst the count **plateaus**: run 2 held 225 for 439 remaining frames; run 3 held 234 for 1399 remaining frames. Run 1 never had leftover frames to show a plateau (hitch-starved).

### Which pass pays

Both passes grow the program cache. Totals of `programDelta > 0`:

| Run | mirror events / Δ | postprocess events / Δ | Slowest hitch |
|---|---|---|---|
| 1 | 7 / 92 | 15 / 151 | mirror 5970 ms |
| 2 | 7 / 84 | 17 / 145 | mirror 4254 ms |
| 3 | 8 / 80 | 21 / 159 | mirror 1596 ms |

Consistent with [research 018](../research/2026-08-17--018--stream-isolation-probes.md): the mirror is often **first in line**, not the only place a first-use wait can land. Postprocess absorbs the rest (and sometimes the biggest remaining stall in the same frame — run 1 frame 66: mirror 5970 ms Δ21, then postprocess 1241 ms Δ15).

### Duration ↔ programDelta

Replicated on all three runs:

- `programDelta = 0`: typical stage 8–10 ms, max 37–74 ms.
- `programDelta > 0`: typical stage 294–780 ms, max 1.6–6.0 s.
- Every stage ≥200 ms in all three runs had `programDelta ≥ 1`. The reverse is not always true (a Δ=1 can be 10–180 ms), but **large Δ and large duration travel together**.

### Materials vs programs

Last scene snapshot (run 3; runs 2–3 match closely):

| Bucket | Unique materials |
|---|---:|
| terrain | 1 |
| grass | 1 |
| vegetation | 3 |
| water | 29 |
| environment | 13 |
| items | 101 |
| settlement | 104 |
| npc | 49 |
| fauna | 43 |
| other | 292 |
| **total** | **636** |
| types | MeshStandardMaterial 604, ShaderMaterial 31, MeshBasicMaterial 1 |

~230 programs vs ~600 material UUIDs: many materials share a program variant. UUID count is **not** program count. The `other` bucket (~292) is the largest UUID pile; this census does not name those objects.

## Root-cause evidence

**Yes — the real-GPU data confirm the first-use WebGLProgram hitch hypothesis.**

1. Cold reload, hardware GPU, three repeats: multi-hundred-ms to multi-second stalls still happen.
2. Those stalls sit on `mirror-render` and/or `postprocess-render`, i.e. the first `WebGLRenderer.render()` that first-uses new programs.
3. Stage duration jumps by 1–2 orders of magnitude exactly when `renderer.info.programs.length` grows.
4. Chunk mesh CPU (`hitches` “chunk mesh” max 41–65 ms) does **not** explain 1.5–6 s frames.
5. After families have been first-used, later chunk attaches on already-seen programs do not recreate the stall (plateau + Δ=0 stages stay ~8–10 ms).

This is the same mechanism as [research 012](../research/2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md) (`kLinkProgram` + first-use query wait), now with a production census on the current Three.js 0.185.1 path (`checkShaderErrors` still default `true`). Magnitude is real-GPU, not SwiftShader.

## Visual verification

Screenshots during settle (run 1), after stream (runs 1–2), and mid-sprint on a shore (run 3):

- Terrain, grass, vegetation, settlement props, water with visible reflection, bloom/fog postprocessing — all present.
- No black/uninitialized materials, no flicker, no obvious streaming holes in the captured frames.
- `gl.getError()` after each run returned **1282 (`GL_INVALID_OPERATION`)** once (drain). No matching visual artifact. **Not attributed** — could be pre-existing, a leftover from the session, or from the diagnostic `getExtension`/`getParameter` path. Not treated as a Phase 0 blocker.

## Co wiemy

- First-use hitch **still occurs on this Intel Arc 140V**, cold reload, High / pixelRatio 1 / 1068×906.
- Streaming introduces a **bounded** program set: **~225–241** by the end of 30 s `stream`, not thousands and not +1 per chunk.
- The **first 53 programs are identical** across three cold runs.
- Later growth is **bursty family first-use**, then a plateau.
- Terrain (1), grass (1), vegetation (3) are already shared.
- Hitch cost is paid by **mirror and/or postprocess**, whichever first-uses the new programs.
- `KHR_parallel_shader_compile` is present in this browser; Seedvale still does not call `compileAsync()`.
- Benchmark `hitches[]` remains the wrong tool for this stall class (research 018).

## Czego nadal nie wiemy

- Program **cacheKey / name** breakdown — Phase 0 did not record `renderer.info.programs[i].cacheKey`, so we cannot list the 230 families or prove a staging mesh would produce the same keys (plan open question 7).
- How many of the later ~170 programs are **mirror-vs-beauty variants** of the same material vs genuinely new materials vs postprocess passes (AO/SMAA/bloom/output).
- What the `other` ~292 unique materials actually are, and whether they are unnecessary clones.
- Whether item/settlement/NPC GLTF materials are shared by URL cache as `loadGltf.ts` suggests, or cloned per instance (UUID count is high; program count is not).
- Whether `GL_INVALID_OPERATION` (1282) is pre-existing.
- Exact driver wait call on this 0.185.1 path (`getProgramInfoLog` vs `ACTIVE_UNIFORMS`) — not re-traced here; research 012/014 already covered that.

## Recommendation

**A — loading-time program prewarm**, scoped, not a return to per-chunk / per-tick / full-scene `compileAsync()`.

Why A rather than B or C:

- Growth is **family first-use + plateau**, which is exactly the shape A is meant to absorb (prepare the family before gameplay streaming).
- The initial **53** is a stable, repeatable set; terrain/grass/vegetation are already shared templates.
- B (consolidation) is **not** disproven — 600 material UUIDs, especially `other` 292, may still be worth shrinking in Phase 2 — but program count is already bounded (~230), so consolidation is not the blocker that must land before any hitch relief.
- C (isolated repro) is unnecessary for the hitch itself: three cold hardware runs already reproduce it. An isolated repro would only be needed if staging prewarm **cannot** match program keys (open question 7).

Phase 1 constraints from the plan still apply: do not call `compileAsync()` from `ChunkManager.update()`, not per chunk, not every tick, not on the live full scene as a hammer. Prewarm during the loading window, covering the same renderer/render-target state that first-use actually hits (mirror target **and** composer).

If a follow-up dump of `cacheKey` shows that staging cannot reproduce a family that still hitch-stalls, **stop and do that isolated repro before widening A**. Do not re-run the four failed compileAsync variants from research 014.

## Phase 0 status

**Phase 0 can be closed.** The two gating questions are answered on real GPU:

1. The hitch is **a bounded set of first-use program families** (initial 53 + later bursts to ~230), not a small handful of one-off shaders and not unbounded per-chunk variant spam.
2. Streamed **terrain/grass/vegetation** families are shared and prewarmable from existing materials. The remaining families are stable enough to *attempt* loading-time prewarm, but **cacheKey coverage is not proven**.

**Next step (still no hitch fix in that step):** dump `renderer.info.programs` `cacheKey`/`name` from one cold `stream` run (read-only) so Phase 1 A has an explicit family list and can match staging state. Then implement Phase 1 A as a single loading-window prewarm of that list.

No extra architecture analysis is required before that dump. Do not start Phase 1 A from this review alone if the implementer cannot name the program keys being warmed.
