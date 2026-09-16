# Implementation notes: world-030 world-knowledge research main-thread freeze

**Reviewed:** 2026-09-16
**Plan:** `world-030-world-knowledge-research-main-thread-freeze.md`

## Review conclusion

047 correctly made `QuestManager` fire-and-forget. The freeze is `buildWorldKnowledgeWorkerParams()` gathering ~361 settlement defs on Accept before the worker starts. Move that reconstruction into `scanWorldKnowledge`. Do not import current `roadNetwork.ts` IndexedDB adapter into the worker as a live writer.

## 1. Cheap request

`WorldKnowledgeTerrainSnapshot` must drop `roadSegments` / `clearings` / `regional` / `cemetery*`. Keep seed, fbm/region clones, `chunkSize`, `resolution`, `vegetationSpeciesCount`, `homeChunks`, `localSearchRadius`, optional `authoredExpeditionRuins`.

Add `epoch: string` on `WorldKnowledgeWorkerParams` (research fingerprint `seed:worldGeneration`) so a worker that outlives WorldBundle rebuild drops in-memory caches.

`ChunkManager.buildWorldKnowledgeWorkerParams` is a field clone plus authored ruins blob only when `ruins` is in `landmarkKinds`. It must not call `collectSettlementRefsNear`, `settlementDefFor`, `segmentsNear`, or `villageSegmentsNear`.

`createWorldKnowledgeResearch.dispatch` should `recordHitch('PROPS', ms, 'worldKnowledge:prepare')` around `buildParams` only.

## 2. Worker-safe primitives

- `settlementTerrain.ts`: local `clamp`, drop `three`.
- `naturalResources.ts`: local `clamp` + `smoothstep` matching Three.js `MathUtils` Hermite, drop `three`.
- Split IndexedDB from `roadNetwork.ts`: optional persistence hooks (`attachRoadRoutePersistence` / `ingestHydratedRoadRoute`). `storeRoute` remembers only when hooks are attached. `worldBundle.ts` and `roadNetwork.test.ts` attach `createRoadRouteWorldgenCache`. Worker never attaches, never `activate`s.
- Export `clearRoadNetworkMemoryCaches()` (settlement def + minor locations + in-memory `routeCache` + cemetery caches). `clearRoadNetworkCaches()` also invalidates attached persistence.
- Worker epoch change: `clearRoadNetworkMemoryCaches()` then `setSettlementRiverQuery(createRiverQuery(rawParams))`.
- Road context samplers: `sampleHeightAt` / `sampleContinentalnessAt` / `sampleMountainRidgeAt` / `sampleMoistureRegionAt` — the unloaded `readField` fallback. Do not invent a second height function.
- Omit `homeSize` unless `ChunkManager`'s `roadCtx` already has it (it currently does not). Match that unloaded path.

## 3. Per-chunk reconstruction

`chunkParamsForWorldKnowledgeScan(coord, terrain)` must gather like `paramsFor(coord, [])`:

- `villageSegmentsNear(center, chunkSize)` + `segmentsNear(center, chunkSize)` when kinds need corridors (classic or cemetery)
- `fordsNear` / `bridgesNear` at `chunkSize` (paramsFor already does; 047 snapshot omitted them)
- cemetery only if `cemetery` is in the filtered kinds: `collectSettlementRefsNear(..., CEMETERY_SETTLEMENT_GATHER_RADIUS)` and wide `chunkSize * 8` cemetery roads/clearings
- authored ruins blob as provided
- `riverSegments: []`
- `isHomeChunk` from `terrain.homeChunks`

`scanWorldKnowledge` keeps `ringChunkOffsets` order and `resolveUnloadedLandmark`. Return `elapsedMs`.

Do not call `computeChunkTile`.

## 4. describe() / poseFor()

In `worldKnowledgeResolver.ts`: if `x/z` present, use them; else chronicle ruins site; else `approxLandmarkChunkCenter`. Never `findLandmarkNear`. `describe` tests must spy that.

## 5. Pool timings

On worldKnowledge complete (main thread): log queue wait (`startAt - queuedAt`), worker `elapsedMs`, total. Do not `recordHitch` worker duration as a main-thread hitch. Prepare uses `recordHitch`.

Stamp `queuedAt` when enqueueing; `startedAt` when `postMessage`.

## 6. Tests

- `buildWorldKnowledgeWorkerParams` / clone: no `collectSettlementRefsNear` / `segmentsNear` / `findLandmarkNear`.
- classic-only `scanWorldKnowledge` does not call `collectSettlementRefsNear`; cemetery does.
- scan calls `segmentsNear` with per-chunk centers, not a single origin AABB.
- `id/x/z` equals `resolveUnloadedLandmark` over `chunkParamsForWorldKnowledgeScan`.
- `ringChunkOffsets` order unchanged; nearest stops at first hit.
- existing research dedupe/epoch/cancel tests; pool tile/mesh > knowledge > grass.
- `describe()` never calls `findLandmarkNear`.

No wall-clock assertions.

## 7. Order

1. MathUtils + persistence split.
2. Cheap snapshot type + ChunkManager clone + research prepare hitch.
3. Worker reconstruct + epoch clear.
4. describe() fallback.
5. Pool timings + tests.
6. State docs; mark plan `verification needed`.

## JSDoc / preflight

Public scan/param helpers: `@domain world-terrain`. State that main thread must not gather worldgen corridors for research.
