# Implementation Notes: World location landmark lookup main-thread freeze

**Reviewed:** 2026-09-05  
**Plan:** `world-014-world-location-landmark-lookup-main-thread-freeze.md`

## Review conclusion

Recon confirms a concrete main-thread cold path that `world-013` did not remove:

```text
WorldLocationCatalog.cemeteryForSettlement()
→ ChunkManager.findLandmarkNear('cemetery', ...)
→ unloaded chunk
→ paramsFor(coord, [])
→ computeChunkTile(params)
→ computeChunkEnvironment(coord, tile, params, [])
```

The normal streamed-chunk path does **not** do this work synchronously: `ensureLoaded()` sends `paramsFor(...)` through `requestChunkTile()`, and `chunkHeightmap.worker.ts` runs `computeChunkTile()` plus vegetation/items/environment/crops in the worker. The special unloaded fallback inside `findLandmarkNear()` is therefore the architectural exception and the first place to fix.

Do not move `WorldLocationCatalog` wholesale to a worker. The high-value change is to make the unloaded landmark lookup data-only and bounded while preserving exact cemetery placement semantics.

## 1. Exact ownership and call sites

Relevant current files/symbols:

- `src/world/locations/worldLocationCatalog.ts`
  - `cemeteryForSettlement()` — cache miss calls `ChunkManager.findLandmarkNear('cemetery', def.x, def.z, CEMETERY_SEARCH_CHUNK_RADIUS)`.
  - `cemeteryLocationFromChunk()` — `getById(cemetery:...)` calls the same resolver with radius `0`.
  - `cemeteryCandidates()` — nearest settlement candidates, then cemetery lookup; keep its current selection semantics.
  - `cemeteryCache` — caches both found and missing results per `SettlementDef.id`; keep it and clear it through `invalidateScanCache()`.
  - `LocationScanDiagnostics.cemeteryMs` already exists, but it only reports the catalog-level cemetery phase, not why that phase was expensive.
- `src/terrain/chunkManager.ts`
  - public `ChunkManager.findLandmarkNear()` is the shared resolver used by World Locations.
  - its loaded path reads `rec.tile.environment`.
  - its unloaded fallback directly calls `computeChunkTile(paramsFor(coord, []))` and then `computeChunkEnvironment(..., [])` on the main thread.
  - `paramsFor()` is also important: it resolves village roads/clearings/regional smoothing through `villageSegmentsNear()` and combines road-network segments.
- `src/terrain/chunkEnvironment.ts`
  - `computeChunkEnvironment()` owns deterministic procedural environment placement.
  - cemetery placement is the final independent RNG stream (`hashChunk(..., 7) ^ 0x6a18d`).
  - `deriveLandmarkId()`, `rollCemeterySize()`, `cemeteryFitsVillageFringe()` and `cemeteryFootprintClearsRoads()` are already pure/worker-safe pieces to reuse.
- `src/terrain/chunkHeightmap.ts`
  - `computeChunkTile()` materializes full apron grids and applies regional smoothing plus road/clearing shaping.
  - `sampleHeightAt()` / `sampleFloorAt()` are cheap analytic samplers, but intentionally **road/clearing/regional-shaping agnostic**; using them directly is therefore not automatically parity-correct for cemetery placement.
  - `applyRegionalSmoothing()` / `applyTerrainCorridors()` currently contain the shaping rules needed to reproduce the tile values cemetery tests.
- `src/terrain/chunkHeightmap.worker.ts`
  - canonical streamed generation order is `computeChunkTile()` → `computeChunkVegetation()` → `computeChunkEnvironment()` (plus items/crops).
- tests:
  - `src/terrain/chunkEnvironment.test.ts` already covers cemetery fringe/road-footprint helpers, size roll and landmark-id determinism.
  - `src/world/locations/worldLocationCatalog.test.ts` already has a fake `ChunkManager.findLandmarkNear()` and should remain the catalog-level regression suite.

Repository search currently shows production calls to `findLandmarkNear()` from `WorldLocationCatalog`; avoid broadening/refactoring unrelated terrain APIs unless needed for the shared resolver.

## 2. What cemetery placement actually needs

Unlike the other environment families, cemetery resolution does **not** need vegetation, biome weights, moisture, continentalness or the other environment placements.

For one candidate chunk the cemetery block currently needs:

1. deterministic RNG stream to derive:
   - `cemeterySize`,
   - candidate `wx/wz`,
   - `cemeteryScale`,
   - final chance roll,
   - on success: `rotationY` and `variant`;
2. terrain height at candidate position;
3. `roadTint` at candidate position;
4. slope from heights at `wx ± SLOPE_SAMPLE_STEP` and `wz ± SLOPE_SAMPLE_STEP`;
5. `params.regional` + `params.clearings` for `cemeteryFitsVillageFringe()`;
6. `params.roadSegments` for `cemeteryFootprintClearsRoads()`;
7. seed/chunk coordinates for `deriveLandmarkId()`.

This is the useful seam: cemetery lookup needs a handful of local terrain evaluations plus existing placement metadata, not an entire `(resolution + 2)²` `ChunkTileData`, vegetation/items/crops, or all other environment candidate families.

## 3. Recommended extraction boundary

Prefer extracting the **cemetery candidate resolver itself** from `computeChunkEnvironment()` into a pure worker-safe helper, rather than copying its RNG sequence and gates into `ChunkManager` or `WorldLocationCatalog`.

A suitable shape is conceptually:

```ts
resolveCemeteryPlacement(coord, params, terrainSampler): EnvironmentPlacement | null
```

where the sampler exposes only the values the cemetery block needs (height / road tint, or one small sampled-terrain record). The exact type/name can follow local conventions.

Then:

- `computeChunkEnvironment()` calls that helper using its existing `ChunkTileData` + `sampleApronGrid` view;
- unloaded `findLandmarkNear('cemetery', ...)` calls the same helper using a lightweight terrain evaluator;
- loaded `findLandmarkNear()` may continue reading `rec.tile.environment`; there is no reason to recompute a loaded result.

This keeps one RNG/gating/identity implementation and makes parity testable directly.

Do **not** extract all environment generation just to solve cemetery lookup. Monolith/stoneCircle/smallRuins are not on this World Location cold path today.

## 4. The important parity trap: analytic terrain alone is insufficient

Do not implement the unloaded sampler as only:

```text
sampleHeightAt(wx, wz)
```

`ChunkTileParams.roadSegments`, `clearings` and `regional` are deliberately excluded from `RawSampleParams`. `computeChunkTile()` applies village regional smoothing and road/clearing shaping afterward, and cemetery acceptance reads the resulting `tile.heights` and `tile.roadTint`.

That means a direct raw analytic sample can disagree exactly at the important gates:

- `h > waterLevel + 0.3`,
- `roadTint <= ROAD_TINT_REJECT`,
- `slope <= SLOPE_REJECT_LANDMARK`.

The lightweight path must reuse/extract the same terrain-shaping math needed for those local samples. Do not create a second approximate road/clearing test in `chunkEnvironment.ts`.

### Grid interpolation also matters

`computeChunkEnvironment()` currently reads `ChunkTileData` through `sampleApronGrid()`, so arbitrary cemetery positions are bilinear interpolation of nearby apron texels, not direct evaluation of the analytic terrain function at the candidate point.

For strict parity, the safest lightweight approach is to evaluate only the small set of apron-grid texels required by the cemetery samples and interpolate them with the existing apron-grid weighting/sampling rules, rather than evaluating candidate positions with a subtly different continuous formula.

A good extraction from `chunkHeightmap.ts` would therefore be a small pure per-texel/final-terrain evaluation seam reused by both `computeChunkTile()` and the lightweight lookup. Keep it worker-safe and data-only. Do not allocate full typed-array grids in the lookup.

## 5. `paramsFor()` is part of the correctness contract

Do not bypass `ChunkManager.paramsFor()` by rebuilding village/road inputs in `WorldLocationCatalog`.

`paramsFor()` currently resolves:

- `villageSegmentsNear(...)`,
- inter-settlement `segmentsNear(...)`,
- `village.paths`,
- `village.clearings`,
- `village.regional`,
- terrain config / seed / home-chunk flag.

These inputs affect cemetery acceptance. Keep their ownership in/under `ChunkManager`; expose a lower resolver there if necessary rather than teaching `WorldLocationCatalog` terrain-generation internals.

This also avoids a new dependency from the world-location domain into settlement road-generation details.

## 6. River discrepancy already exists — do not accidentally hide it

There is a pre-existing parity caveat worth handling explicitly during implementation:

- normal `ensureLoaded()` resolves nearby river chains and passes real `riverSegments` into `paramsFor()` before worker tile generation;
- the current unloaded `findLandmarkNear()` fallback calls `paramsFor(coord, [])`, explicitly skipping river carving.

Therefore the old unloaded fallback is **already not guaranteed to match** the eventually streamed tile where a river crosses the cemetery candidate area.

Do not preserve this discrepancy blindly just because it is current behavior. At minimum add a focused parity test/decision around it. The plan's contract is physical-landmark parity, so the implementation should either:

1. provide the same river-aware terrain input to the lightweight resolver when required, or
2. make cemetery placement intentionally depend on a shared pre-river terrain basis in both lookup and streamed environment generation, if that can be done without changing existing cemetery results unexpectedly.

Choose based on the smallest change that preserves current gameplay data and avoids expensive hydrology work on the purchase path. If exact river-aware resolution would itself recreate a large synchronous cost, do not smuggle that cost back into the lightweight path; document the tradeoff and keep the implementation bounded.

## 7. Diagnostics: instrument the exception, not the whole terrain stack

`WorldLocationCatalog` already records cumulative `cemeteryMs`. Extend diagnostics only enough to prove the cold-path change.

Useful counters can live at the `ChunkManager.findLandmarkNear()` boundary (or an injectable/test seam) and distinguish:

- inspected chunk count,
- loaded environment hits,
- unloaded lightweight resolutions,
- legacy/full-tile fallbacks (target: zero for cemetery lookup after implementation),
- optional cumulative lookup time.

Do not add per-sample logging or global logging in `chunkHeightmap.ts`. No console spam in normal play.

If exposing diagnostics publicly would bloat `ChunkManager`, a test-only/injected observer around the resolver is preferable to a general profiling subsystem.

## 8. Tests that give real confidence

### `chunkEnvironment.test.ts`

Add parity tests around the extracted cemetery resolver:

- same seeded params + same terrain view → same `EnvironmentPlacement` as the cemetery produced by `computeChunkEnvironment()`;
- parity includes `id`, `x/z`, `scale`, `rotationY`, `variant`, `cemeterySize` and absence (`null`);
- cover acceptance and rejection near water/road/slope/fringe boundaries where a sampling mismatch would matter;
- keep existing `deriveLandmarkId`, size-roll, fringe and footprint tests.

### Lightweight terrain sampler tests

If `chunkHeightmap.ts` gains a per-texel/local-sampling seam, compare its local height/tint values with the corresponding values from a full `computeChunkTile()` for deterministic chunks/points, including a village road/clearing case. This is more valuable than timing assertions.

### `worldLocationCatalog.test.ts`

Keep catalog tests focused on catalog semantics:

- cemetery cache caches both hit and miss;
- invalidation forces a fresh lookup;
- Near/Guard/Far query order stays deterministic;
- `getById(cemetery:...)` still resolves through the authoritative landmark resolver.

### `ChunkManager` lookup test

Add a focused test at the new resolver seam proving an unloaded cemetery lookup does not call/require full `computeChunkTile()` and that a loaded chunk still reuses `rec.tile.environment` where practical. Prefer dependency injection/pure helper tests over constructing a full Three.js `ChunkManager` if the latter would make the test brittle.

No wall-clock thresholds in Vitest.

## 9. Suggested implementation order

1. Add the narrow diagnostics/test seam needed to confirm the current unloaded fallback count.
2. Extract cemetery RNG/gating/placement into one pure resolver used by `computeChunkEnvironment()`; prove no behavior change with tests.
3. Extract/reuse the minimal final-terrain local sampling needed for exact height/slope/roadTint parity without full tile allocation.
4. Wire unloaded `findLandmarkNear('cemetery', ...)` to that lightweight resolver while keeping loaded-tile reuse.
5. Resolve/test the river-input discrepancy explicitly.
6. Extend `WorldLocationCatalog` regression tests for cache/invalidation/query-order behavior.
7. Run automated checks. Leave browser Performance trace and gameplay verification to the user.

## 10. Things not to do

- Do not put cemetery placement logic into `WorldLocationCatalog`.
- Do not duplicate the cemetery RNG stream/constants/gates.
- Do not replace tile-aware sampling with raw `sampleHeightAt()` without parity tests.
- Do not generate vegetation/items/crops/other environment families for a cemetery lookup.
- Do not enqueue/load/pin remote chunks merely to answer the query.
- Do not make merchant purchase async as a workaround for avoidable CPU work.
- Do not add a new worker protocol unless measurement after the lightweight path still justifies it.
- Do not change `MAX_CEMETERY_SETTLEMENTS_SEARCHED`, `CEMETERY_SEARCH_CHUNK_RADIUS`, map ranges or discovery weighting in this fix.
- Do not move the `minKm` filter ahead of the current settlement selection; `world-013` intentionally preserved old Far Map semantics here.

## 11. JSDoc / preflight discoverability

If a shared cemetery resolver or local final-terrain sampler is exported, document why it exists and its parity contract with full streamed chunk generation. Add `@domain world` / `@domain world-terrain` where useful for preflight discovery, matching the owning layer rather than the caller.

The key invariant to state in code is:

> unloaded landmark lookup and normal streamed environment generation must consume the same deterministic placement rules and terrain semantics without requiring full chunk materialization on the main thread.

## Implemented (2026-09-05)

Implemented following the recommended extraction boundary (§3) and the suggested implementation order (§9) closely — see the plan's "Implementation status" section for the full file-by-file summary.

Deviations/clarifications versus the review above:

- §3's `resolveCemeteryPlacement(coord, params, terrainSampler)` shape landed almost verbatim; the sampler interface is named `CemeteryTerrainSampler` (`heightAt`/`roadTintAt`) and lives in `chunkEnvironment.ts` next to the resolver.
- §4's "small pure per-texel/final-terrain evaluation seam reused by both `computeChunkTile()` and the lightweight lookup" landed as `computeChunkTexel()` (module-private to `chunkHeightmap.ts`) — the exact former loop body of `computeChunkTile()`, now called once per grid texel there and on-demand (cached per texel index) by the new `createLocalTerrainSampler()`. Grid interpolation reuses the existing `apronGridWeights`/bilinear math exactly (no second continuous formula), addressing the "parity trap" directly.
- §5 (`paramsFor()` ownership) — unchanged: `ChunkManager.findLandmarkNear()`'s unloaded branch still calls `paramsFor(coord, [])` itself and passes the resulting `ChunkTileParams` down; `WorldLocationCatalog` and the new resolver never rebuild village/road inputs themselves.
- §6 (river discrepancy) — resolved by **keeping** the existing `paramsFor(coord, [])` behavior for the unloaded fallback (option matching "smallest change that preserves current gameplay data... without smuggling hydrology cost back onto the purchase path") and documenting it explicitly in `resolveUnloadedLandmark`'s JSDoc as a pre-existing, deliberately unchanged tradeoff, not something newly introduced or newly hidden.
- §7 diagnostics — implemented via the existing `getMonitor().recordHitch('PROPS', ms, label)` mechanism (already used elsewhere in `chunkManager.ts`) rather than a new counters object on `ChunkManager` or `WorldLocationCatalog`. Distinguishes loaded / unloaded-lightweight-cemetery / unloaded-full-fallback / miss by label; zero cost when the perf monitor is disabled.
- §8 tests — added in `chunkHeightmap.test.ts`, `chunkEnvironment.test.ts`, and `chunkManager.test.ts` per the outline; the `ChunkManager` lookup test uses the new pure `resolveUnloadedLandmark()` export with `vi.spyOn` on `computeChunkTile` (dependency-injection-free, no full Three.js `ChunkManager` needed) rather than an injected observer.
- Monolith/stoneCircle/smallRuins were **not** touched — `findLandmarkNear()`'s unloaded fallback for those kinds still calls `computeChunkTile()` + `computeChunkEnvironment()` in full, exactly as before, per the plan's explicit scope boundary.
- Browser Performance-trace verification (real merchant Near Map purchase, Guard/Far Map regression) was **not** performed in this pass — left to the user, per the plan's "Performance verification" section. Plan is marked `verification needed`, not `done`, until that manual step happens.
