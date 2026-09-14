# Implementation notes: world-terrain-031 persistent chunk tile worldgen cache

**Reviewed:** 2026-09-14  
**Plan:** `docs/plans/world-terrain-031-persistent-chunk-tile-worldgen-cache.md`  
**Baseline:** `main` at `adb3fe70ca027f56cbaa27a0e13ee86e297b829c`

## Main recon findings

### 1. The exact cache seam is `ensureLoaded()` before `requestChunkTile()`

Current production path in `src/terrain/chunkManager.ts` is:

```text
ensureLoaded(coord)
→ retainRiverTilesFor(record)
→ riverChannelSegmentsNear(...)
→ paramsFor(coord, riverSegments)
→ requestChunkTile(key, params)
→ rec.tile = tile
→ waitForFinalizeSlot(rec)
→ attachChunkMesh(rec, tile)
→ apply every runtime TerrainModification in-place
→ mesh/water/grass/content
```

The key ownership fact is that `attachChunkMesh()` mutates `tile.heights`, `floorHeights` and `roadTint` in place through `applyModificationToTile()` before mesh generation. Therefore persistent cache integration must happen before `rec.tile` enters finalization.

Do not add a second finalization path. Both persistent hits and worker misses must converge into the existing `rec.tile = runtimeTile → waitForFinalizeSlot(rec)` path.

### 2. `ChunkTileResult` is the right payload boundary

`src/terrain/chunkHeightmapProtocol.ts` already defines the complete deterministic worker result:

```ts
ChunkTileResult = ChunkTileData & {
  vegetation: VegetationPlacement[]
  items: ItemPlacement[]
  environment: EnvironmentPlacement[]
  crops: CropPlacement[]
}
```

The tile worker computes all of these together in `chunkHeightmap.worker.ts` and transfers the eight numeric grid buffers back to the main thread zero-copy:

- `heights`
- `floorHeights`
- `biomes`
- `bodyScale`
- `continentalness`
- `mountainRidge`
- `moistureRegion`
- `roadTint`

Do not invent a second cached terrain representation and do not persist downstream `ChunkMeshData`, grass data or Three.js objects in this plan.

### 3. `paramsFor()` is the canonical fingerprint input

`src/terrain/chunkManager.ts::paramsFor()` already materializes every deterministic input used by the tile worker, including:

- world seed / chunk coordinate / chunk size / resolution;
- full terrain/noise/biome/region config;
- `isHomeChunk` and vegetation species counts;
- regional roads, village paths, clearings and regional smoothing;
- canonical river-carving segments;
- cemetery settlement refs, unclipped cemetery roads and clearings;
- authored expedition ruins.

Use the shared `src/persistence/worldgenFingerprint.ts::worldgenFingerprint()` introduced by world-terrain-030 directly over the exact `ChunkTileParams` object returned by `paramsFor()`.

Do not maintain a hand-picked fingerprint field list. Any new deterministic field added to `ChunkTileParams` should automatically invalidate that chunk's cache.

A change to worker algorithms with unchanged params still requires a `CHUNK_TILE_CACHE_VERSION` bump.

### 4. Warm lookup still has to build `ChunkTileParams`

A cache hit cannot happen before `retainRiverTilesFor()` + `paramsFor()` because their output is part of the fingerprint. Therefore world-terrain-031 skips the expensive tile worker computation but does **not** skip settlement/road/river/cemetery parameter resolution.

Do not broaden this plan into caching `paramsFor()` inputs. Future settlement/road persistent caches can independently reduce that cost.

## Required persistence API extension

### 5. Add direct primary-key lookup to `worldgenCacheDb.ts`

`listCacheRecords()` calls the `by_seed` index and materializes every payload for that seed before filtering. That is acceptable for the existing small namespaces but is unsuitable for chunk tiles.

Add a small generic helper using the existing object-store primary key:

```ts
getCacheRecord<TPayload>(
  seed: number,
  namespace: string,
  version: number,
  subKey: string,
): Promise<CacheRecord<TPayload> | null>
```

Implementation should compute `cacheKey(...)` and call `store.get(key)` directly. It must keep the existing worldgen-cache rule: any IndexedDB error resolves as `null`, never throws into gameplay.

Do not add a second database/store for chunk tiles.

### 6. Add exact-key deletion if needed by namespace-owned eviction

Because the generic `enforceCacheCap()` currently loads every full record through `getAllBySeed()`, do not use it on the chunk-tile namespace once that namespace can contain tens or hundreds of MiB.

Prefer a tiny generic helper such as:

```ts
deleteCacheRecords(keys: readonly string[]): Promise<void>
```

that deletes known primary keys in one transaction. Namespace-specific metadata can then choose victims without scanning/loading every tile payload.

## Cache adapter

Create `src/terrain/chunkTileWorldgenCache.ts`.

Suggested constants/contracts:

```ts
CHUNK_TILE_CACHE_NAMESPACE = 'chunk-tiles'
CHUNK_TILE_CACHE_VERSION = 1
chunkTileSubKey(cx, cz) => `chunk:${cx}:${cz}`
chunkTileFingerprint(params) => worldgenFingerprint(params)
```

The adapter should own:

- direct read + fingerprint check;
- structural validation;
- canonical/runtime ownership split;
- async best-effort write;
- byte-budget metadata / eviction;
- bounded perf counters if they fit existing diagnostics.

Keep `ChunkManager` responsible only for deciding when to ask for a cached tile versus a worker tile.

## Critical ownership decision

### 7. Never pass the same mutable tile object to runtime and deferred persistence

This is the most important correctness rule in the plan.

`putCacheRecords()` does **not** structured-clone the payload at function call time. It first awaits `openSeedvaleDb()`, and only later calls `store.put(record)`. Meanwhile `attachChunkMesh()` may already have mutated the tile in place through player/system modifications.

Therefore this is unsafe:

```ts
void persist(tile)
rec.tile = tile
```

Even if `persist(tile)` is invoked first.

### 8. Preferred ownership model

Treat the worker/cache-read result as the immutable canonical base tile and hand runtime a separate copy before `rec.tile` is assigned.

Conceptually:

```text
canonical tile
├─ fire-and-forget persistence (canonical object is never mutated)
└─ cloneForRuntime()
   → rec.tile
   → runtime TerrainModification mutations
```

On a persistent hit:

```text
IDB structured-clone result = canonical base tile
→ validate
→ cloneForRuntime()
→ rec.tile
```

This gives the same ownership rule on hit and miss.

A focused helper such as `cloneChunkTileForRuntime()` should clone all mutable typed grids. Runtime code currently only reads placement objects/arrays, but do not depend on accidental mutability forever: either clone placement arrays/objects as well or type/document them as immutable and test that no runtime path mutates them. Full `structuredClone()` is the simplest correctness baseline; a specialized clone is acceptable if benchmarking shows it matters.

Do not await the IndexedDB write before chunk finalization just to avoid cloning; persistence must not become chunk-availability latency.

## Payload size and eviction

### 9. Full tile payload is large enough that count-only eviction is inappropriate

The eight grid arrays alone cost:

```text
8 × (resolution + 2)^2 × 4 bytes
```

Approximately:

- resolution 65: ~140 KiB/chunk before placements;
- resolution 193: ~1.16 MiB/chunk before placements.

With `loadRadius = 3`, one 7×7 loaded region is 49 chunks, so resolution 193 is already roughly 57 MiB of numeric grids for a single warm region before placement objects.

Do not copy `locations-coarse`'s `4000 records/seed` policy. That could produce multi-gigabyte cache usage at high terrain resolution.

### 10. Use a namespace-owned byte budget without scanning large payloads

Recommended V1: keep a small metadata manifest record in the same `chunk-tiles` namespace, e.g. `meta`, containing per tile:

```ts
{
  subKey: string
  estimatedBytes: number
  lastAccessedAt: number
}
```

The manifest is small and may be loaded independently through direct lookup. It lets the adapter evict oldest tiles using exact-key deletes without `getAllBySeed()` materializing every tile payload.

A reasonable initial per-seed budget is **128 MiB** for `chunk-tiles`:

- enough for roughly two current 7×7 high-resolution regions;
- still bounded independently of other worldgen namespaces;
- easy to tune later from manual browser measurements.

Treat byte estimates as approximate, not browser-quota accounting. At minimum sum all typed-array `byteLength`s; include a conservative estimate for placement arrays. Exact serialized-byte accounting is not worth a generic quota subsystem.

If implementation chooses a different concrete budget after measuring current payloads, document the measurement and keep the same byte-bounded architecture.

### 11. Access metadata should be batched / cheap

Do not write metadata on every cache hit synchronously. It is sufficient to update an in-memory access map and flush metadata opportunistically/debounced, or treat write time as approximate recency for V1 if implementation remains clearly bounded.

No generic storage quota manager is required.

## Validation

### 12. Validate before assigning a hit to runtime

For current `params.resolution`, expected grid length is:

```ts
const expected = (params.resolution + 2) ** 2
```

Require all eight grids to be `Float32Array` of exactly `expected` length.

Also require arrays for:

- `vegetation`
- `items`
- `environment`
- `crops`

Reject malformed payloads as ordinary misses. Do not migrate cache payloads.

Where cheap, validate minimal placement shape/identity fields used by runtime, but do not duplicate every domain's full validator inside the cache adapter.

A fingerprint mismatch is a miss even when structural validation passes.

## `ChunkManager` integration order

### 13. Replace only the tile acquisition section of `ensureLoaded()`

Current code builds river context before requesting the worker. Keep that lifecycle because `rec.riverTiles`/`rec.riverChains` ownership is also used later by `attachChunkMesh()` and balanced by `unload()`.

Target flow:

```text
record created + inserted into chunks
→ retainRiverTilesFor(record)
→ riverSegments
→ const params = paramsFor(coord, riverSegments)
→ const fingerprint = chunkTileFingerprint(params)
→ await direct persistent lookup
   ├─ valid hit
   │   → clone canonical hit for runtime
   └─ miss
       → requestChunkTile(key, params)
       → keep worker result canonical/immutable
       → schedule persistence
       → clone canonical result for runtime
→ re-check current ChunkRecord identity
→ rec.tile = runtimeTile
→ waitForFinalizeSlot(rec)
```

### 14. Preserve cancellation / stale-result semantics

Today `unload()` cancels an in-flight tile worker when `record.state === 'generating'`. A persistent lookup cannot be cancelled by `cancelChunkTile()`, so after every awaited cache read and after a worker result, verify:

```ts
chunks.get(key) === record
```

before attaching/scheduling finalization.

Do not let a late IndexedDB hit from an unloaded or rebuilt world assign to a replacement record with the same chunk key.

The namespace adapter itself should remain world-independent; `ChunkManager` owns record identity/lifecycle checks.

### 15. Worker cancellation still matters on misses

Only call `requestChunkTile()` after the persistent lookup is known to be a miss. This avoids starting worker work that a slightly-later cache read would discard.

On unload during the cache read, skip worker generation entirely after the identity check.

## Runtime modifications and other systems

### 16. Player/system terrain modifications remain exactly where they are

`attachChunkMesh()` must continue replaying `config.modifications` onto the runtime clone. This includes:

- persisted player dig/scorch/prepare deltas;
- deterministic system modifications replayed by world build (e.g. cave mouth carve).

Do not include any modification list in the persistent tile payload.

### 17. Cave terrain cutouts are downstream mesh state

`registerTerrainCutouts()` / `buildChunkGeometry(...cutouts...)` operate downstream from `ChunkTileResult` and remain outside the cache. A cached base tile must remesh with current cutouts exactly as a fresh tile does.

### 18. Lifecycle overrides stay downstream

Keep these outside the cache and applied/materialized through existing runtime ownership:

- collected item IDs;
- planted trees/crops;
- tree lifecycle growth/chop/regrowth;
- removed crops;
- resource depletion;
- player constructions;
- any other save-specific state.

Same-seed saves may share only worker-generated deterministic base placements.

### 19. `ChunkMeshDataCache` remains separate

`src/terrain/chunkMeshCache.ts` caches mesh-worker output after runtime modifications have been applied to a live tile. It is a session-local 64 MiB LRU and has different invalidation/ownership semantics.

Do not merge persistent tile caching into `ChunkMeshDataCache`, and do not persist its `ChunkMeshData` in this plan.

## Performance guardrails

### 20. The cache must save more than it costs

Cold miss now adds:

- one IndexedDB primary-key read;
- one runtime clone of the canonical tile;
- one async IndexedDB write/structured clone.

Warm hit adds:

- one IndexedDB primary-key read;
- one runtime clone;
- no tile worker job.

Keep instrumentation around these stages so manual verification can compare:

- cache lookup ms;
- hit / miss / invalid counts;
- worker tile jobs avoided;
- optional runtime-clone ms;
- approximate bytes read/written.

Do not log per chunk in production; expose bounded counters through existing debug/perf diagnostics where practical.

If high-resolution clone/IDB costs erase the worker saving, do not solve it by moving gameplay state into the cache. The follow-up optimization would be ownership/copy mechanics, not changing the cache boundary.

## Tests with highest value

Add focused unit/integration tests for:

1. direct `getCacheRecord()` primary-key lookup; no namespace-wide `getAll` dependency;
2. `chunkTileFingerprint(params)` changes for roads, rivers, clearings, cemetery inputs, authored ruins and global terrain/resolution changes;
3. all eight typed arrays + placements survive IndexedDB round-trip;
4. malformed grid type/length becomes a miss;
5. worker-miss canonical tile remains unchanged after runtime clone is modified with `applyModificationToTile()`;
6. persistent-hit canonical tile remains unchanged after runtime clone mutation;
7. cache hit avoids `requestChunkTile()` and enters the same finalize pipeline;
8. cache miss performs exactly one worker generation and schedules best-effort persistence;
9. IndexedDB failure falls back to worker generation;
10. unload while cache read is in flight does not start a worker or attach a tile;
11. unload/reload cannot let a stale cache/worker result attach to the replacement `ChunkRecord`;
12. player dig/scorch/prepare is replayed identically over cached and fresh base tiles;
13. cave/system terrain modifications and terrain cutouts remain downstream and equivalent;
14. lifecycle overrides (`collectedItemIds`, removed/planted crops, tree lifecycle) behave identically on cached/fresh tiles;
15. byte-budget metadata evicts exact old tile keys without calling `listCacheRecords()` / loading all tile payloads;
16. Clear cache / deleted cache returns cleanly to worker generation.

Prefer testing the cache adapter separately from Three.js-heavy `ChunkManager` tests where possible; add one narrow `ensureLoaded()` integration seam test if dependency injection already makes it practical. Do not introduce broad mocking architecture only for this plan.

## Files / symbols with highest implementation value

- `src/terrain/chunkManager.ts`
  - `paramsFor()`
  - `ensureLoaded()`
  - `attachChunkMesh()`
  - `applyModificationToTile()`
  - `unload()`
- `src/terrain/chunkHeightmapProtocol.ts`
  - `ChunkTileResult`
- `src/terrain/chunkHeightmap.worker.ts`
  - canonical tile + placement generation and transfer ownership
- `src/terrain/chunkHeightmap.ts`
  - `ChunkTileParams`
  - `ChunkTileData`
- `src/persistence/worldgenCacheDb.ts`
  - add direct read / exact-key deletion; do not use `listCacheRecords()` for tiles
- `src/persistence/worldgenFingerprint.ts`
  - reuse `worldgenFingerprint()`
- `src/terrain/chunkMeshCache.ts`
  - separate downstream cache; do not merge
- `src/persistence/db.ts`
  - inspect only if implementation chooses an index/schema change; recommended metadata-manifest design does not require one

## Implementation order

1. Add generic direct-read and exact-key-delete seams to `worldgenCacheDb.ts` with tests.
2. Implement `chunkTileWorldgenCache.ts`: key/fingerprint/validation/runtime clone/metadata budget.
3. Integrate acquisition into `ChunkManager.ensureLoaded()` without touching finalization code.
4. Add ownership/mutation regression tests before tuning eviction.
5. Add byte-budget eviction metadata and focused tests.
6. Add bounded instrumentation.
7. Update `docs/state/persistence.md` and `docs/state/terrain-and-world-generation.md`.
8. Run automated verification; leave browser traversal/perf comparison to the user.

## Architectural guardrails

- Persistent tile cache is disposable derived data, never world truth.
- One worker `ChunkTileResult` contract remains canonical.
- No cache warming / pre-generation.
- No worker replacement.
- No persistent grass or `ChunkMeshData` in this plan.
- No player/system modifications in cache payload.
- No namespace-wide hydrate/read for chunk tiles.
- No multi-GB count-based cap copied from small-record namespaces.
- Cache failure must never prevent chunk generation.
- Add JSDoc `@domain world-terrain` / `@system worldgen-cache` on the new adapter and important public persistence seams.

## Verification

Automated:

```text
pnpm test
npx tsc --noEmit
pnpm build
```

Manual browser verification is the user's responsibility. Compare the same traversal cold vs warm at at least one normal resolution and one high resolution. Confirm fewer `'tile'` worker jobs, identical terrain/roads/rivers/cemeteries/items/crops/vegetation, save-local digging/building, and clean fallback after clearing the seed cache.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
