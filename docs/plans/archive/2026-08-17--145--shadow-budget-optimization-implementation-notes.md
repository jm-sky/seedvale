# Implementation notes — Plan 145 (Shadow budget optimization)

**Status:** R1 + R2 implemented and technically verified (tsc/lint/build/test green). No browser/benchmark verification yet — see "Not yet done".

## What changed

### R2 — size threshold for procedural item pickup fallbacks

- `src/assets/loadGltf.ts` — `SMALL_MESH_SHADOW_THRESHOLD` (0.5 m bbox diagonal) exported instead of module-local, so `items.ts` can reuse the exact same value instead of duplicating it.
- `src/items/items.ts` — `createItemMesh()` split into a thin exported wrapper + an internal `buildProceduralItemMesh()` (the old function body, unchanged, including its now-provisional inline `castShadow = true` assignments — see below). The wrapper:
  1. Returns a GLB clone unchanged when one exists (`cloneItemGlb`) — those meshes already carry a correct per-submesh `castShadow` from `loadGltf.ts`'s own threshold; this path is untouched.
  2. Otherwise builds the procedural fallback, computes its whole-object bbox diagonal (`Box3.setFromObject`, mirroring `loadGltf.ts`'s per-mesh approach but over the assembled group), and sets `castShadow = diagonal >= SMALL_MESH_SHADOW_THRESHOLD` on every mesh in the tree — overriding the inline `true` defaults.

**Deliberately not touched:** the ~40 inline `xxx.castShadow = true` lines inside `buildProceduralItemMesh`'s branches. They're now provisional (overridden by the wrapper's post-process), documented as such in the function's docstring, rather than mechanically stripped — removing them would have been a 40-line, purely-cosmetic diff across every branch with no behavior change, against the plan's "keep the change scoped" guidance.

**Measured effect (from the plan's own analysis, not re-verified here):** small pickups (`stone`/`shell`/`branch`/`mushroom`/`flower`/`cone`/`tomato`/`coal`/`iron`/`gold`/`hide`/`cheese`/`dried_meat`/`coin`/`knife`/`waterskin_*`) drop below the threshold and lose `castShadow`; longer tools (`axe`/`pickaxe`/`shovel`/`pitchfork`/`sickle`/`spear`/`wooden_torch`/`trap_*`) stay above it via their handle/shaft length and keep casting, matching the plan's own per-item size reasoning. `blanket` (0.515 m diagonal) stays just above the threshold; `tent` (0.477 m) drops just below it — both single-digit-cm borderline cases of the same threshold every other small-prop convention in the codebase already accepts (`createReed`/`createRockCluster`/GLB props).

This affects `ItemSpawner`-pool pickups (`createItemSpawners.ts`) and player-dropped items (`createDroppedItems.ts`); chunk-generated world pickups (`rec.items` in `chunkManager.ts`) already didn't cast shadows before this change (an unrelated side effect of research 019's `REFLECTION_SKIPPED_LAYER` reassignment, noted in the plan's analysis, not touched here).

### R1 — pull-based, fail-open shadow-map update budget

- `src/ai/NpcAgent.ts` / `src/fauna/AnimalAgent.ts` — `NPC_SHADOW_DISTANCE` / `FAUNA_SHADOW_DISTANCE` (both `36`) exported instead of module-local, so the new budget module can reuse the exact radii NPC/AnimalAgent already use for their own per-agent `castShadow` toggling. No behavior change to the existing per-agent toggling itself.
- `src/render/shadowBudget.ts` (new) — pure, dependency-free module in the same style as `waterMirror.ts`'s `shouldRenderMirror` / `render/aoBudget.ts`'s `shouldSuppressAo`:
  - `shouldUpdateShadowMap(state, playerX, playerZ, hasNearbyShadowCaster)` — dirty if: the stale-frame safety net (`SHADOW_DIRTY_MAX_STALE_FRAMES = 10`) has been reached, OR `hasNearbyShadowCaster` is `true` (fail-open — any agent in shadow-casting range is assumed to be moving, not tracked for actual per-frame displacement), OR the player moved beyond `SHADOW_DIRTY_PLAYER_EPS_M = 0.05` m since the last shadow update.
  - `recordShadowBudgetFrame(state, playerX, playerZ, updated)` — rebaselines position/resets the stale counter on an update, otherwise increments it.
  - `anyWithinRadius(originX, originZ, items, radius, positionOf)` — generic, allocation-free proximity scan (no array copy, takes a position-extractor callback instead of requiring `{x,z}`-shaped copies of live agent lists).
  - `src/render/shadowBudget.test.ts` (new, 10 tests) — covers all four functions in isolation, no WebGL/scene required.
- `src/app/gameLoop.ts`:
  - `shadowBudgetState` (module-scoped, created once via `createShadowBudgetState`) and a local `hasNearbyShadowCaster(playerX, playerZ)` closure (loops loaded settlements' `.npcs` then `bundle.fauna.getAgents()`, short-circuiting on first match — same allocation-free shape as the existing P4'/P5' per-frame scans) are declared once at `createGameLoop()`'s top level, not per-frame.
  - The render section's `renderer.shadowMap.needsUpdate = true` (previously unconditional every frame) is now gated: `shouldUpdateShadowMap(...)` decides, `renderer.shadowMap.needsUpdate = true` is only set when it returns `true`, and `recordShadowBudgetFrame(...)` updates the budget state either way. Confirmed against the installed `three@0.185.1` source (`node_modules/three/src/renderers/webgl/WebGLShadowMap.js:369`) that `WebGLShadowMap.render()` resets `needsUpdate = false` itself after consuming it, and early-returns doing zero work when `autoUpdate === false && needsUpdate === false` (line 95) — so *not* setting `needsUpdate = true` this frame is a genuine no-op skip of the whole shadow pass, not a missed flag that would need manual clearing.

**Deliberately not implemented (per the plan's own "Rekomendacja wdrożenia"):** the explicit dirty-hooks for chunk load/unload, `refreshTreeVisual`, and `scorchTerrain` (plan R1 point 3's "only add if the visual test shows a real problem"). Only the pull-based tiers (1)+(2)+(3, the periodic safety net) are implemented, exactly as the plan's implementation-order step 3 specifies.

## Technical verification (green)

```
npx tsc --noEmit
npx eslint src/         # 0 errors (pre-existing unrelated errors remain in untracked _temp/asset-audit/inspect.mjs, not part of src/ or this change)
npm run build            # vue-tsc + vite build, succeeds
npm run test              # 120 files, 997 tests, 0 failures (10 new in shadowBudget.test.ts)
```

## Not yet done

- **No browser verification.** All 7 points of the plan's §Visual verification (shadow popping, chunk boundaries, NPC/fauna near a populated settlement, tree-chop-while-stationary, terrain self-shadow toggle interaction, water mirror, vegetation LOD transitions) and the R2 point (small pickups at low sun angle) are unverified — CLAUDE.md: do not treat a passing build as proof of correct visual Three.js behavior.
- **No performance benchmark.** The plan calls for `?benchmark=stream`/`settlement`/`current`/`forest` before/after, plus the existing `no-shadows` isolation probe as an upper-bound reference, with R2 and R1 measured in separate passes. None of this has been run. Both changes landed as separate commits (see below) specifically so a before/after benchmark could still bisect their individual effect if run later, even though they weren't benchmarked between commits in this session.
- **Decision gate from the plan's step 4** (if `current`/`settlement` show no measurable gain, that's an expected/documented outcome, not a failure) has not been evaluated — no benchmark has been run yet to check either way.
- Per the plan's step 5, explicit dirty-hooks (tree chop / chunk attach / chunk unload / terrain scorch) are intentionally not added — only add them if the browser visual test (point 4) shows a real problem.
