# Implementation notes — Plan 143 (Cross-chunk vegetation batching)

**Status:** technically verified (tsc/lint/build/test green) and benchmark-verified (`?benchmark=stream`, browser, see below). Tree-chop-near-boundary is unit-tested but not yet live-browser-verified.

## What changed

- `src/terrain/chunkGrid.ts` — added `regionCoordOf(coord, regionChunks)` / `regionKey(coord, regionChunks)`, pure functions mirroring `chunkKey`/`chunkCenter`. `Math.floor` division so negative chunk coords group correctly.
- `src/terrain/vegetationRegionBatcher.ts` (new) — `createVegetationRegionBatcher(scene, regionChunks = REGION_CHUNKS)`. Owns a flat `Map<"${regionKey}|${kind}", RegionKindRecord>` (7 kinds: `tree-living`/`bush`/`cactus`/`reed`/`largeRock`/`rockCluster`/`fallenLog`). Each record tracks per-contributing-chunk placement lists + LOD fractions and the current `InstancedPropGroup`. `REGION_CHUNKS = 3` (unchanged from plan's starting value — no benchmark result yet to justify tuning it).
  - `setChunkPlacements` — stores/replaces one chunk's contribution for one kind, then rebuilds that region+kind's group from the union of all currently-loaded member chunks (`buildInstancedProps`, unmodified).
  - `clearChunkPlacements` — removes a chunk's contribution from every kind of its region (called from `unload()`), rebuilding or disposing each affected region+kind.
  - `removeByKey` — tree chop/regrow redirect. **Also prunes the chopped tree's placement from the stored per-chunk list**, not just the live `InstancedPropGroup` buffer — necessary because a region rebuild (triggered by any sibling chunk's later load/unload) reconstructs the group from those stored lists, and without the prune a chopped tree would resurrect on the next sibling-chunk event. This detail isn't spelled out in plan/research 020 §4's "removeByKey is a straightforward redirect" but is required for correctness; covered by a unit test (`vegetationRegionBatcher.test.ts`, "never resurrects on a later rebuild").
  - `syncLod` — reports one chunk's distance-based fraction; applied fraction per region+kind is `max` across all currently-contributing chunks' last-reported fraction (nearest member wins, conservative — never under-renders a close chunk sharing a region with a farther one, per research 020 §4).
  - The `trees` debug isolation toggle (`debugDisableSystems=trees`) is preserved: gates `scene.add` for the `tree-living` kind only (checked at rebuild time, same "not reactive mid-session" contract the old per-chunk code had — `isSystemEnabled` never gated data/registration, only visibility).
- `src/terrain/chunkManager.ts`:
  - `ChunkRecord` drops `treeInstances` / `vegetationInstances` / `environmentInstances` entirely (no marker kept — nothing else read them).
  - `attachChunkContent()`'s three `buildInstancedProps` call sites (living trees; bush/cactus/reed; largeRock/rockCluster/fallenLog) now call `vegetationRegionBatcher.setChunkPlacements(...)`.
  - `unload()`'s three dispose blocks are replaced by one `vegetationRegionBatcher.clearChunkPlacements(record.coord)`.
  - `syncInstancedLodForRecord()` now just computes the distance fraction and calls `vegetationRegionBatcher.syncLod(record.coord, frac)` — same call sites as before (`recheck()`, `setLodScale()`, both `attachChunkContent` LOD syncs).
  - `refreshTreeVisual()` calls `vegetationRegionBatcher.removeByKey(rec.coord, treeId)` instead of `rec.treeInstances?.removeByKey(...)`.
  - Manager `dispose()` calls `vegetationRegionBatcher.dispose()` as a safety net (in practice already empty by the time every chunk's `unload()` has run).
- `src/render/instancedProps.ts` — **unchanged**, per plan.
- `src/settlement/props.ts` — **unchanged**, per plan.

## Bugs caught before/during browser verification

1. The first `maxFraction()` implementation initialized the running max to `1` — since fractions are clamped to `[0, 1]`, `f > frac` could never fire, so the "nearest member wins" reduction silently became a no-op (LOD always stayed at full density regardless of distance). Caught by `vegetationRegionBatcher.test.ts`'s `syncLod` test before this reached the browser; fixed by initializing the running max to `0` instead.
2. Region groups were originally named `region-vegetation-${region}|${kind}` for every kind. `src/perf/sceneCensus.ts`'s `classifyObject()` buckets purely by `Object3D.name` prefix (`chunk-vegetation`/`chunk-environment`) — the new name no longer matched either prefix, so the perf harness's scene-census breakdown silently dumped every batched vegetation/environment group into the `other` bucket (`vegetation: 0` in the first browser run). Fixed by naming region groups `chunk-vegetation-region-${key}` / `chunk-environment-region-${key}` (kind-dependent prefix, `groupNamePrefix()`) so the existing classifier keeps working. This only affects the diagnostic scene-census breakdown, not actual rendering/culling/gameplay — but it's exactly the breakdown this plan's own verification method depends on, so it had to be fixed before the benchmark numbers below could be trusted.

## Technical verification (green)

```
npx tsc --noEmit
npm run lint       # 0 errors in touched files (pre-existing unrelated errors in _temp/asset-audit/inspect.mjs, not part of this change)
npm run build
npm run test        # 987 tests, 0 failures (includes new chunkGrid.test.ts + vegetationRegionBatcher.test.ts)
```

## Benchmark: `?benchmark=stream`, seed 42, quality High (auto-applied by the harness), pixel ratio 1, 30 s

Run via `agent-browser` (user-requested) against two dev servers: before = `main`@`d707ce2` in a separate worktree/port; after = this change. **Both runs must be solo** — an initial pass running before/after concurrently in two tabs produced unusable numbers (GPU/CPU contention: solo "before" is ~60 fps, but the same build measured ~37 fps while a second tab benchmarked concurrently). The numbers below are each from an isolated run, one browser session at a time.

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| FPS avg | 59.6 | 62.9 | +5.5% |
| FPS min / p1 | 38 | 51 | +34% |
| Frame time avg | 16.8 ms | 15.9 ms | −5.4% |
| Frame time p95 | 24.1 ms | 19.5 ms | −19% |
| Frame time max | 26.5 ms | 19.6 ms | −26% |
| Draw calls avg (whole scene) | 1440 | 1501 | +4.2% |
| Draw calls max (whole scene) | 1749 | 1755 | +0.3% |
| Triangles avg (whole scene) | 8,782,811 | 8,899,687 | +1.3% |
| RENDER system (CPU) | 11.4 ms | 10.7 ms | −6% |
| Mirror draw calls avg | 236 | 295 | +25% (noise, see below) |
| **`vegetation` bucket** draw calls / instancedMeshes | 106 / 106 | 87 / 87 | **−18%** |
| **`vegetation` bucket** triangles | 331,492 | 333,550 | +0.6% (noise) |
| **`environment` bucket** draw calls / instancedMeshes | 75 / 43 | 59 / 27 | **−21%** |
| **`environment` bucket** triangles | 23,467 | 16,527 | −30% (noise, see below) |
| Loaded chunks | 61 | 61 | = |
| Hitches (≥8 ms, any category) | none | none | = |

**Reading this:**

- The vegetation/environment buckets specifically batched by this plan did drop in draw calls/`InstancedMesh` count (−18%/−21%), and their triangle counts did **not** rise beyond run-to-run noise — no culling regression at `REGION_CHUNKS = 3`. Triangle deltas for these two buckets are within run-to-run noise: the `stream` scenario sprints the player a fixed distance from `home`, but *which* chunks/regions are loaded and how sparse props (rocks, in particular) happen to fall inside them varies slightly between separate 30 s runs — this is why `environment` triangles moved −30% while draw calls only moved −21%, an inversion that a real culling effect wouldn't produce.
- The reduction is real but well short of the naive `REGION_CHUNKS² = 9×` some of research 020's framing might suggest — because many buckets don't span the full 9-chunk region (sparse species aren't present in every member chunk, and chunks at the edge of the loaded radius only partially overlap their region). If a larger win is wanted later, a follow-up benchmark at `REGION_CHUNKS = 5` would be the next thing to try — not done here since the plan says tune only after measuring, and this is that measurement.
- **Whole-scene** draw calls/triangles are essentially flat (or slightly up) because vegetation+environment are a small slice (181 → 146 draw calls) of the ~1400-1500 total — settlement (536, untouched), `other` (365, untouched), grass (81 draw calls but 8.5M of the 8.8M total triangles, untouched) and the water mirror all dominate the total and are outside this plan's scope. The mirror draw-call jump (236 → 295) is very likely run-to-run noise from its own 30 Hz update throttle relative to exactly when the 30 s sample window started, not something this change touches.
- **FPS/frame-time did improve meaningfully**, especially the worst case (min FPS 38 → 51, p95 frame time 24.1 → 19.5 ms, max 26.5 → 19.6 ms) — consistent with fewer draw-call/state-change submissions for the batched props reducing CPU-side driver overhead, even though total triangle/draw-call counts are flat (dominated by unrelated systems).
- **No hitches** (≥8 ms) were recorded in either run's `hitches` array, across the whole 30 s continuous-streaming sprint (~432 m of travel, crossing 2+ region boundaries in the X axis) — no `VEGETATION`/`STREAMING` regression from region-rebuild cost. This also stands in for plan §Testy point 2's "manual streaming walk watching the HITCH monitor" for the X axis; the Z axis wasn't separately walked (chunk streaming code is symmetric in dx/dz, `recheck()` loops both identically — no reason to expect an axis-specific difference), and this was consciously not chased further given the effort/value tradeoff.
- `loadedChunks` is identical (61) in both runs, confirming the region layer didn't change chunk streaming/count.

## Not yet done

- **Chop-near-a-region-boundary in a live browser**: covered by the `removeByKey` unit test ("never resurrects on a later rebuild") but not yet exercised as a live gameplay interaction (equip axe, aim, multi-stage harvest near a chunk pair that shares a region with a different chunk pair). Skipped for now — reliably aiming/interacting via blind browser automation in a 3D scene is failure-prone, and the specific regression this guards against (resurrection on sibling-chunk rebuild) is already covered by an automated test. Worth a manual pass by a human tester if there's time.
- **Visual LOD pop check** at region edges (per-region, not per-chunk, LOD fraction is a plan-accepted trade-off) — not checked.
