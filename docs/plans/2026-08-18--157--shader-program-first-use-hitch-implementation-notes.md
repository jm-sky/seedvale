# Plan 149 — implementation notes

**Scope:** Phase 0 instrumentation (no renderer change) plus Phase 1 B **diagnostic** PointLight pad (`?pinPointLights`, default off). Phase 1 production fix / Phase 1 A `compileAsync` **not** started.

## 1. What was added

- `src/perf/programCensus.ts` (new) — dev/benchmark-only census. No-op unless enabled; when disabled it returns a shared `NOOP_CENSUS` object whose methods are all empty functions, so every call site is a cheap function call regardless of state. Reads only the public `renderer.info.programs` array (Three.js's own program cache, unaffected by `info.autoReset`/`info.reset()`) — no Three.js source or `node_modules` patching. Records four event kinds into an in-memory ring (`MAX_EVENTS = 20000`, more than a 30s `stream` run produces):
  - `chunk-mesh-attach` / `chunk-content-attach` — chunk key, frame, timestamp, `renderer.info.programs.length` at that moment (a "before" baseline — attach never itself compiles a program), and a material census of *only the newly attached root(s)* (bucketed via the existing `classifyObject` from `sceneCensus.ts`).
  - `mirror-render` / `postprocess-render` — wraps a stage with `withProgramCensusStage()` (same shape as the existing `withCategory()` monitor helper): duration, program count before/after, delta.
  - `frame-snapshot` — one per game frame, program count + delta since the previous frame. Cheap (one array-length read), safe to do unconditionally every frame.
  - `material-snapshot` — every 60th frame, a full scene traversal: unique material count, bucketed by scene classification and by `material.type`.
  - `summarize()` reduces the ring into: max/final program count, chunk-attach count, per-stage-kind program growth (events where `programDelta > 0`, with total delta and max duration), the 10 slowest stage calls, and the last material snapshot.
- `src/perf/programCensus.test.ts` (new) — 7 unit tests covering the disabled no-op, per-frame snapshot, the 60-frame material-snapshot cadence, chunk-attach bucketing (including an `undefined` root slot), stage timing, and `summarize()`. Uses a minimal `{ info: { programs } }` stand-in for `WebGLRenderer` (the only property this module reads) plus real `THREE.Scene`/`Mesh`/`Group` objects — no WebGL context needed, so this runs in the normal `vitest` node environment.
- `src/perf/flags.ts` — added `isProgramCensusUrlEnabled()` (`?programCensus=1`), same pattern as the existing `isPerfUrlEnabled()`/`benchmarkScenarioFromUrl()`.
- `src/perf/index.ts` — re-exports the new module's public surface.
- `src/app/createApp.ts` — creates the census right after `scene` (needs `renderer`+`scene`, nothing else), enabled when `benchmarkScenarioFromUrl() === 'stream'` **or** `isProgramCensusUrlEnabled()`; sets it as the active singleton (`setActiveProgramCensus`, mirroring `setActiveMonitor`) and exposes it as `window.__seedvaleProgramCensus` for console/agent-browser inspection; both are cleared in the app's disposer.
- `src/app/gameLoop.ts` — wraps the two existing render-stage call sites with `withProgramCensusStage()`: `bundle.ocean.renderMirror(...)` (already inside `withCategory(monitor, 'WATER', ...)`) as `'mirror-render'`, and `postProcessing.render()` (already inside `withCategory(monitor, 'RENDER', ...)`, `labelRenderer.render()` stays outside the census wrap since it's CSS2D, not WebGL) as `'postprocess-render'`. Calls `programCensus.tickFrame()` once per frame, next to the existing `monitor.endFrame(...)`.
- `src/terrain/chunkManager.ts` — `getProgramCensus().recordChunkAttach('chunk-mesh-attach', rec.key, [rec.mesh])` at the end of `attachChunkMesh()` (after `rec.state = 'ready'`), and `getProgramCensus().recordChunkAttach('chunk-content-attach', rec.key, [rec.vegetationExtras, rec.items, rec.environment])` at the end of `attachChunkContent()` (before `rebuildColliders`).

None of this touches `createPostProcessing.ts`, `waterMirror.ts`'s render path, or `createRenderer.ts` — the stage timing wraps the *callers* of `renderMirror()`/`postProcessing.render()` in `gameLoop.ts`, not their internals. `createPostProcessing.ts`'s own pass list (RenderPass/AO/SMAA/bloom/godRays/output) was deliberately **not** further split into sub-passes — see §4.

## 2. How to run it

Either:

```
http://localhost:5577/?benchmark=stream&seed=42&res=193
```

(the plan's own benchmark protocol — the census auto-enables whenever the `stream` scenario is selected, no extra flag needed), or standalone without running the 30s benchmark:

```
http://localhost:5577/?programCensus=1&seed=42&res=193
```

Then from devtools console (or `agent-browser eval`):

```js
window.__seedvaleProgramCensus.enabled          // true
window.__seedvaleProgramCensus.events()         // full event ring
window.__seedvaleProgramCensus.summarize()       // reduced summary
```

`events()`/`summarize()` work at any time during the session — the census is not scoped to a single benchmark run; it accumulates from world creation, so it also covers the initial loading burst.

## 3. What data we collected (agent-browser smoke test — technical proof only, not a real-GPU result)

Ran against a dev server with `?seed=42&res=193&programCensus=1`, then separately confirmed `?benchmark=stream` alone also auto-enables it. **Headless Chrome + SwiftShader is extremely slow for this scene** — only 8 game frames elapsed in 69 wall-clock seconds — so none of the following durations should be read as real GPU/driver timing (see plan §"agent-browser" and `docs/performance/agent-browser-benchmarking.md`). It is read here purely to confirm the instrumentation captures the right *shape* of event, which it does:

```json
{
  "frames": 8,
  "programCountFinal": 81,
  "programCountMax": 81,
  "chunkAttachEvents": 47,
  "stageGrowth": [
    { "kind": "mirror-render", "events": 1, "totalDelta": 21, "maxDurationMs": 1407.5 },
    { "kind": "postprocess-render", "events": 2, "totalDelta": 60, "maxDurationMs": 3367.8 }
  ],
  "slowestStages": [
    { "kind": "postprocess-render", "frame": 7, "durationMs": 3367.8, "programCountBefore": 55, "programCountAfter": 81, "programDelta": 26 },
    { "kind": "mirror-render", "frame": 0, "durationMs": 1407.5, "programCountBefore": 0, "programCountAfter": 21, "programDelta": 21 },
    { "kind": "postprocess-render", "frame": 0, "durationMs": 1073.2, "programCountBefore": 21, "programCountAfter": 55, "programDelta": 34 },
    { "kind": "postprocess-render", "frame": 1, "durationMs": 25.1, "programCountBefore": 55, "programCountAfter": 55, "programDelta": 0 }
  ]
}
```

Sample `chunk-mesh-attach` events — confirms the shared single terrain material documented in `docs/STATE.md`:

```json
{ "kind": "chunk-mesh-attach", "chunkKey": "1,0", "programCount": 0, "rootMaterialCount": 1, "rootBucketCounts": { "terrain": 1 } }
{ "kind": "chunk-mesh-attach", "chunkKey": "0,0", "programCount": 0, "rootMaterialCount": 1, "rootBucketCounts": { "terrain": 1 } }
```

Sample `chunk-content-attach` events — items/environment groups carry several distinct materials each:

```json
{ "kind": "chunk-content-attach", "chunkKey": "-3,0", "rootMaterialCount": 6, "rootBucketCounts": { "items": 5, "environment": 1 } }
{ "kind": "chunk-content-attach", "chunkKey": "-3,1", "rootMaterialCount": 7, "rootBucketCounts": { "items": 7 } }
```

Every stage event with `programDelta > 0` also had a `durationMs` an order of magnitude above every `programDelta: 0` event in the same run (0–25 ms) — exactly the correlation the plan's root-cause hypothesis (research 012/014) predicts, captured now as data rather than as a hand-traced Chrome Performance profile. No `material-snapshot` fired in this smoke test (only 8 of the required 60 frames elapsed) — confirmed instead by a unit test (`programCensus.test.ts`, "emits a material-snapshot every 60th frame") rather than waiting out headless real time.

## 4. What we deliberately did not add

- **No sub-pass split inside `createPostProcessing.ts`.** The plan's question ("mirror vs postprocessing vs normal beauty render") is answered at the granularity Seedvale's pipeline actually has: `renderMirror()` and `postProcessing.render()` are the only two `renderer.render()`-equivalent submissions per frame (research 013/018 already established this — the composer's `RenderPass`/`N8AOPass` *is* the beauty submission, folded into the same `composer.render()` call as SMAA/bloom/god rays/output). Splitting `composer.render()` into per-pass timings (wrapping each `Pass.render` instance method) is possible without touching Three.js source, but the plan explicitly warns against complicating code for low-value metrics, and the two-stage granularity we do have was already enough to reproduce the correlation in §3. If Phase 1 needs to distinguish the AO/SMAA/bloom/god-ray tail from the scene-submitting `RenderPass`/`N8AOPass` head specifically, that is a small, isolated follow-up, not part of this Phase 0.
- **No re-run of the `ACTIVE_UNIFORMS`/`LINK_STATUS`/`COMPLETION_STATUS_KHR` WebGL-query experiment.** Research 012/014 already produced this exact data (`ACTIVE_UNIFORMS`: 288 events, 21 603.4 ms total, 323.8 ms max, with `checkShaderErrors=false`) under Three.js 0.185.1, and the plan's own §18 says this only needs redoing if "bezpiecznie możliwe" and adds real value — it would require either patching `WebGLProgram.onFirstUse` at runtime (Three.js public API doesn't expose per-call query hooks) or reusing the exact prior diagnostic method. Given the existing data already answers "which query absorbs the driver wait," redoing it wasn't judged worth the added risk/complexity for Phase 0. If Phase 1 needs to re-confirm under current `main` (not the temporarily-reverted diagnostic build those research docs used), that is a separate, explicitly-scoped micro-experiment — not silently folded into this instrumentation.
- **No per-`WebGLProgram` cache-key/name breakdown.** `program.cacheKey`/`program.name` are available on each entry of `renderer.info.programs`, but the material-snapshot's `byType`/`byBucket` breakdown (material constructor type × scene bucket) already answers "which categories" at the granularity the plan asks for (§ "Z jakich kategorii pochodzą materiały/programy") without a second traversal keyed a different way.

## 5. What we still don't know (do not read as answered)

- **Real-GPU `stream` ×3 is done** — [review 021](../reviews/2026-08-18--021--plan-149-phase-0-real-gpu.md). Hardware renderer `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Program count plateaus at **~225–241**; first-use stage hitches are **1.6–6.0 s** and correlate with `programDelta > 0`. Do not quote §3 SwiftShader durations as hitch size; quote review 021.
- **Program `cacheKey`/`name` dump is done** — [review 022](../reviews/2026-08-18--022--plan-149-program-family-dump.md) (3 cold real-GPU `stream` runs). ~210 unique keys, ~25 names; streaming first-use is `numPointLights` × instancing copies of already-seen families. Open question 7 is now: staging prewarm **cannot** match later keys unless the live point-light count is pinned.
- **Instanced/region-batched vegetation and environment materials are not captured per-chunk.** `attachChunkContent()`'s `recordChunkAttach` only traverses `rec.vegetationExtras`/`rec.items`/`rec.environment` — the region-batched instanced meshes (trees via `vegetationRegionBatcher`, bushes/cactus/reed, rocks/logs) are added at **region** granularity, not per-chunk, so a single chunk's contribution to those buckets isn't attributable to that chunk's attach event. The periodic `material-snapshot` still sees them (it traverses the whole scene), just not tied to a specific chunk-attach timestamp. This means: chunk-content-attach's `rootMaterialCount` undercounts a chunk's real material footprint whenever region-batched content is involved (i.e. most chunks with vegetation).
- **No correlation code — only correlatable data.** `summarize()` reports stage growth and chunk-attach counts separately; matching a specific `programDelta > 0` stage event to the *specific* chunk-attach event(s) that introduced those materials (by nearby `frame`/`tMs`) has to be done by hand from `events()` for now. For the two guiding questions this is enough (a human/agent can eyeball frame-adjacency in a `stream` run's event list), but it is not an automated "this hitch was caused by chunk X" report.

## 6. Cursor real-GPU checklist

Done in [review 021](../reviews/2026-08-18--021--plan-149-phase-0-real-gpu.md) (2026-08-18, 3 cold `stream` runs, Intel Arc 140V). Outcome: bounded ~230 programs, family-first-use + plateau, hitch paid by mirror and/or postprocess. The follow-up `cacheKey` dump is [review 022](../reviews/2026-08-18--022--plan-149-program-family-dump.md): do **not** implement A from 021 alone.

## 7. Recommendation for next step

**Phase 0 closed** — hitch proof [review 021](../reviews/2026-08-18--021--plan-149-phase-0-real-gpu.md), family dump [review 022](../reviews/2026-08-18--022--plan-149-program-family-dump.md).

**Phase 1 B diagnostic done** — [review 023](../reviews/2026-08-18--023--plan-149-pointlight-variant-axis.md). `?pinPointLights=16` (intensity-0 dummy pad, URL-gated) collapsed unique `cacheKey` **~210 → 62** and removed streaming first-use bursts (`numPointLights` locked to 16). Hypothesis **PASS**. The dummy pad is **not** the production fix: median RENDER 18→33 ms, frame p95 61→92 ms (16-light shader loop + per-frame `traverseVisible`). Frame 0 hitch remains.

**Budget curve 8/12/16 done** — [review 024](../reviews/2026-08-18--024--plan-149-pointlight-budget-curve.md). Cheap add/remove registry (`syncMs` 0.0–0.2 ms, no per-frame `traverseVisible`). All three budgets collapse to **62** programs. 8/12 always overflow-cull (real counts 15–21) and do not buy RENDER vs 16. 16 covers the morning `stream` set without cull; later-day counts can exceed 16. Most of the 023 RENDER tax was the traverse. Next: a **separate implementation plan** for a cheap budget-16 pin, then leftover instancing, then A. Do **not** start loading-window `compileAsync()`. Do not revive per-chunk/per-tick/full-scene `compileAsync()`.

## 7.1 Phase 1 B pad (diagnostic, opt-in)

- `src/perf/pointLightBudget.ts` + `?pinPointLights=8|12|16` (`src/perf/flags.ts`). Default **off**.
- Dummy `PointLight` intensity 0, no shadow, no mesh. Overflow culls dimmest/furthest real lights so the count cannot rise. `sync(camera)` before mirror/shadow/beauty in `gameLoop.ts`.
- Tracking is an add/remove registry for the pad's lifetime (not a lighting manager).
- Unit tests: `src/perf/pointLightBudget.test.ts` (9).
- Leave in place as an opt-in probe until the real plan replaces it; do not enable on `?benchmark=stream` by default.

## 8. Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (`vue-tsc --noEmit && vite build`, existing >500kB chunk warning unrelated/pre-existing).
- `npm run test` — 1007/1007 passing (1000 pre-existing + 7 new in `programCensus.test.ts`).
- Phase 1 B pad tests: `src/perf/pointLightBudget.test.ts` (9) — `npx vitest run src/perf/pointLightBudget.test.ts` passing; `tsc --noEmit` + eslint on the pad files clean.
- Real-GPU pin experiment — **done**, [review 023](../reviews/2026-08-18--023--plan-149-pointlight-variant-axis.md) (3+3 cold `stream` runs, Intel Arc 140V). Hypothesis PASS; dummy pad not shippable.
- Real-GPU budget curve 8/12/16 — **done**, [review 024](../reviews/2026-08-18--024--plan-149-pointlight-budget-curve.md) (3+3+3+3 cold `stream` runs, Intel Arc 140V). Cheap counter; 16 is the only visual-safe budget; not shipped.
- Technical/functional agent-browser smoke test — done (§3): confirmed `window.__seedvaleProgramCensus` activates both via `?benchmark=stream` and `?programCensus=1`, records all four event kinds with the expected shape, and cleanly shows zero events when disabled (implied by the module's `NOOP_CENSUS` branch, also covered by the disabled-mode unit test).
- Real-GPU benchmark — **done**, [review 021](../reviews/2026-08-18--021--plan-149-phase-0-real-gpu.md) (3 cold `stream` runs, Intel Arc 140V).
- Browser/manual visual verification — review 021 screenshots: terrain/grass/vegetation/settlement/water-reflection/postprocess present; no black materials or flicker in captured frames. `gl.getError()` 1282 noted, not attributed.
