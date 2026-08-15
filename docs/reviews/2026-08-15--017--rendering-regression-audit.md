# Review 017: Rendering regression audit — black frames (mobile) / grass flicker (desktop)

**Status:** `done`
**Date:** 2026-08-15
**Scope:** Regression audit only (no fixes implemented). Investigates whether recent graphics-optimization commits (`0c318b0`, `e25cce9`, `080fd3f`, `14ee5c7`, `7a90408`) caused two reported symptoms: full-screen grass color flicker on desktop, and 1–3s full-black 3D frames on mobile (UI still responsive, `contextLost: false`, `gl error: NONE`).
**Not in scope:** Implementing a fix, browser/DevTools verification, disabling N8AO/grass/WaterMirror, changing DPR or schedulers.
**Tools used:** `git show`/`git diff` on the 5 commits, static reading of `src/terrain/chunkManager.ts`, `src/settlement/SettlementsManager.ts`, `src/settlement/props.ts`, `src/settlement/frameYield.ts`, `src/render/aoBudget.ts`, `src/render/createPostProcessing.ts`, `src/app/gameLoop.ts`, `src/world/weatherParticles.ts`. No browser/Playwright session.
**Evidence tags:** all findings below are `[STATIC ANALYSIS]` — read from current code, not measured in-browser this session.

---

## Timeline

| Commit | Time | Change | Rendering impact | Suspicion |
|---|---|---|---|---|
| `0c318b0` | Aug 14 22:13 | Spreads `buildAndAttachMesh` across frames via `finalizeQueue` (1/frame). Adds an idle-catch-up: if the game loop hasn't ticked in `GAME_LOOP_IDLE_MS` (48ms), `waitForChunks` calls `drainFinalizeQueue(Number.POSITIVE_INFINITY)` — unbounded. | Escape hatch that can synchronously drain the *entire* finalize queue in one tick. | High |
| `080fd3f` | Aug 15 07:57 | N8AO auto-suppress toggles the AO pass on/off every frame based on the *previous* frame's render cost. Settlement prop placement (palisade/bush/barrel/hay) switched from per-item `await yieldProp()` to one synchronous `buildInstancedProps()` call. | (a) Full-screen post-process toggle, scene-wide, one frame. (b) Removes the cooperative-yield mechanism sitting right downstream of `waitForChunks`. | High |
| `7a90408` | Aug 15 11:51 | Weather/season rework to pure functions of (seed, elapsedDays); no renderer-state changes. | Low — logic/state only. | Low |
| `e25cce9` | Aug 15 13:03 | Splits chunk finalize into mesh/content stages, preloads GLB templates at construction, makes `runFinalize` fully synchronous — removes the `await Promise.all([...templates])` that previously existed inside the finalize continuation. | Fixes the GLB-promise stampede it targeted, but also removes the only yield point that existed inside `drainFinalizeQueue`'s work — so `0c318b0`'s idle-drain becomes a genuinely unbroken synchronous burst with no interleaving at all. | High (compounds `0c318b0`) |
| `14ee5c7` | Aug 15 14:56 | CPU particles → GPU `ShaderMaterial` for rain/snow. Self-contained shader/material, `depthWrite:false`, own uniforms. | Low — isolated subsystem. | Low |

Note: true chronological order (`0c318b0 → 080fd3f → 7a90408 → e25cce9 → 14ee5c7`) differs from the investigation-priority order the audit was run in. All five commits are present at HEAD; the finding below concerns the interaction of three of them (`0c318b0`, `e25cce9`, `080fd3f`), all still active in current code.

---

## Most likely regression

Two separate, both confirmed-in-current-code, regressions — one per symptom.

### A) Mobile black frames (1–3s): synchronous settlement-discovery stampede

Exact path, all still present at HEAD:

```
player enters a new settlement's loadRadius
  → SettlementsManager.ensureLoaded(def)                          [SettlementsManager.ts:289]
  → waitForChunks(chunksNear(def.x, def.z, chunkSize))             9 chunks (3×3), [SettlementsManager.ts:295]
  → chunkManager.waitForChunks(coords)                             [chunkManager.ts:1385]
       loops: race(pending, resolved) → check `performance.now() - lastUpdateAt > 48ms`
       → if idle: drainFinalizeQueue(Number.POSITIVE_INFINITY)     [chunkManager.ts:1391-1392]
       → runFinalize(rec) is now fully synchronous (no await, since e25cce9)
       → runs attachChunkMesh + attachChunkContent back-to-back for every queued job, zero yields
  → .then(() => createSettlement(...))                             [SettlementsManager.ts:296]
  → buildSettlementProps → plantEntrancePalisade / hay / barrels / bush clusters
       now use buildInstancedProps() synchronously (080fd3f), replacing the
       `await yieldProp()` / `await yieldStake()` gate that used to hand a frame
       back to the browser every 4 props (createPropYieldGate, PROPS_PER_YIELD=4)
```

Three commits stack on this single path:
- `0c318b0` (`chunkManager.ts:531,1385-1394`) introduces the `GAME_LOOP_IDLE_MS`-gated unbounded drain, intended for "init has no game loop yet," but armed by any caller of `waitForChunks`, including mid-gameplay settlement discovery.
- `e25cce9` (`chunkManager.ts:855-901`) removes the one `await` that used to exist inside the finalize continuation (the shared GLB-template promise), making `runFinalize` fully synchronous. Correct fix for the GLB stampede it targeted, but it also removed the only yield point the idle-drain path had.
- `080fd3f` (`src/settlement/props.ts`, palisade/barrel/hay/bush blocks) removes the `createPropYieldGate` cooperative-yield loop (`src/settlement/frameYield.ts`, originally an "issue 027" fix) for exactly the props built right after `waitForChunks` resolves.

Mobile is more exposed because `requestAnimationFrame` gaps >48ms are far more common there (background/foreground app switches, notification overlays, thermal throttling, slower CPU making a single frame already exceed 48ms) — exactly what arms the idle-drain branch. Once armed, up to 9 chunks × 2 finalize stages plus settlement prop construction run in one unbroken JS turn. UI staying responsive during the black period is consistent with the UI being a separate DOM/Vue overlay not gated on this rAF-driven WebGL frame.

### B) Desktop grass flicker: N8AO auto-suppress full-screen toggle

`src/render/createPostProcessing.ts:117-140` + `src/render/aoBudget.ts` (both from `080fd3f`):

```
gameLoop: applyFrameBudget(lastRenderMs)     — uses PREVIOUS frame's render cost
  → shouldSuppressAo(prevSuppressed, renderMs):
       renderMs >= 15ms  → suppress AO (aoPass.enabled=false, renderPass.enabled=true)
       renderMs <= 10ms  → restore AO
       else              → keep previous state (hysteresis band)
  → syncAoPass() flips aoPass.enabled / renderPass.enabled for THIS frame
```

Toggling between the N8AO pass and the plain `renderPass` is a full-screen, one-frame change to ambient-occlusion shading across the entire visible scene, grass included — a whole-frame post-process swap, not per-chunk. It fires whenever the previous frame's render cost crosses the 15ms/10ms band, correlated with the same chunk-finalize / vegetation-instancing / settlement-construction bursts identified in (A) — the commit's own message says it targets heavy frames near settlements/streaming. Matches the desktop symptom: a full, scene-wide, momentary shading change, not one localized chunk.

### Bonus finding: triangle-count provenance

`src/app/gameLoop.ts:894-921` — `renderer.info.reset()` fires once per frame, before both `bundle.ocean.renderMirror(...)` and `postProcessing.render()`. The reported `tris 5308409 / calls 1847` is cumulative across the mirror pass + shadow pass + beauty pass, not beauty-only — `mirrorTriangles`/`mirrorDrawCalls` are captured separately after the mirror call but never subtracted from the final HUD numbers.

---

## Evidence

- `src/terrain/chunkManager.ts:1385-1396` — unbounded idle drain in `waitForChunks`
- `src/terrain/chunkManager.ts:848-901` — `runFinalize`/`drainFinalizeQueue`, no `await` left after `e25cce9`
- `src/settlement/SettlementsManager.ts:51-57,295-296` — 9-chunk block, `waitForChunks` → immediate `createSettlement`
- `src/settlement/props.ts` (palisade ~828-855, barrels ~2250-2262) — `buildInstancedProps(...)` replacing per-item `cloneProp` + `await yieldStake()/yieldProp()`
- `src/settlement/frameYield.ts` — `createPropYieldGate`, the now-bypassed rAF-yield-every-4-props (originally an "issue 027" fix)
- `src/render/aoBudget.ts` — `shouldSuppressAo` hysteresis (15ms suppress / 10ms restore)
- `src/render/createPostProcessing.ts:117-140` — `applyFrameBudget`/`syncAoPass` flipping `aoPass.enabled`/`renderPass.enabled` per frame
- `src/app/gameLoop.ts:894-921` — confirms HUD triangle/draw-call counts are mirror+shadow+beauty combined, not beauty-only

## Ruled out

- `14ee5c7` (GPU weather shader) — self-contained `ShaderMaterial`/`THREE.Points`, `depthWrite:false`, own uniforms (`uTime`, `uSize`, `uSizeScale`); doesn't touch renderer/render-target/global material state. Not a plausible cause of scene-wide grass flicker or black frames.
- `7a90408` (season/weather rework) — pure data/state rework (`ClimateState`, `getSeason`), no rendering-pipeline or renderer-state changes.
- WebGL context loss / GPU driver crash — contradicted by the user's own debug capture (`contextLost false`, `gl error NONE`); consistent with a main-thread stall, not a GPU-side failure.
- Shadow-map/WaterMirror render-layer wiring (`AGENT_RENDER_LAYER` in `080fd3f`) — traced fully: camera, shadow camera, and NPC/fauna meshes are all consistently assigned/enabled; no layer-mismatch bug found.

## Next experiment

1. **Confirm the settlement-discovery stampede**: in the browser, walk toward an unvisited settlement while watching hitch telemetry (`recordHitch`, STREAMING/VEGETATION/PROPS categories) — expect a single multi-hundred-ms-to-multi-second spike coinciding with `waitForChunks` resolving, specifically when a prior frame gap (tab blur, GC pause) exceeds 48ms right before that resolution. On mobile, backgrounding the tab briefly right as a new settlement comes into range should reliably reproduce the black screen.
2. **Confirm the AO-toggle flicker**: log `aoSuppressed` transitions (or watch `aoPass.enabled` in the debug GUI) against `lastRenderMs` while streaming chunks or approaching a settlement on desktop — expect suppress/restore toggles to correlate exactly with the visible grass color flicker, and expect the flicker to disappear if the AO pass is pinned (observation only — do not implement the pin as part of this experiment).

## No fix yet

No code was changed as part of this review. Two independent, high-confidence code paths were identified — the idle-drain stampede (`chunkManager.ts` → `SettlementsManager.ts` → `props.ts`) and the AO auto-suppress toggle (`createPostProcessing.ts`/`aoBudget.ts`) — but the next-experiment steps above should confirm causation in-browser before any fix is attempted.
