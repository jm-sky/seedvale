# Implementation Notes: Persistent abandoned cemetery worldgen cache

**Reviewed:** 2026-09-12
**Plan:** `world-025-persistent-abandoned-cemetery-worldgen-cache.md`

## Current ownership

Keep the existing boundaries:

- `src/terrain/cemeteryPlacement.ts` owns deterministic abandoned-cemetery placement rules, `chunkPassesAbandonedCemeteryRoll()`, `resolveAbandonedCemeteryAfterRoll()` and `resolveAbandonedCemeteryForChunk()`.
- `src/terrain/chunkManager.ts` owns terrain-aware materialization through `probeAbandonedCemeteryAtChunk()`.
- `src/world/locations/worldLocationCatalog.ts` owns discovery enumeration/querying and is the only cache-consumer integration point needed by this plan.
- `src/persistence/worldgenCacheDb.ts` is the generic disposable `(seed, namespace, version, subKey) -> payload` store.
- `src/world/locations/locationsCoarseCache.ts` is the persistence/lifecycle pattern to reuse: namespace/version/fingerprint, async hydrate, generation guard, debounced writes and bounded cleanup.
- `LocationKnowledge` / `SaveData.map` remain the only player discovery authority.

Do not move cemetery placement into the cache module and do not cache discovery state.

## Verified current world-022 path

`worldLocationCatalog.ts` currently does:

```text
settlementCemeteryCandidates(...)
collectAbandonedChunksToProbe(...)
  → abandonedCemeteryChunkIntersectsKmBand(...)
  → chunkPassesAbandonedCemeteryRoll(...)
  → returns only roll-pass/range-pass chunk coords
appendAbandonedProbes(...) / appendAbandonedProbesAsync(...)
  → probeAbandonedChunk(...)
  → ChunkManager.probeAbandonedCemeteryAtChunk(...)
```

`probeAbandonedChunk()` currently:

1. increments `diagnostics.cemeteryExpensiveProbes`,
2. calls the canonical ChunkManager probe,
3. rejects missing/non-abandoned/duplicate results,
4. applies the exact `(minKm, maxKm]` placement-distance check,
5. increments `cemeteryAbandonedResolved` and appends the `WorldLocation`.

Keep that filtering path shared for cached positives and fresh positives so sync/async parity cannot drift.

`landmarksInRangeAsync()` uses `appendAbandonedProbesAsync()`. Its current progress denominator is `toProbe.length`; it reports after each expensive batch and explicitly finishes at `1`. Cooperative yielding begins above `COOPERATIVE_ABANDONED_PROBE_THRESHOLD = 24` unless tests force `yieldEveryProbes`.

Do not create a separate merchant/NPC resolver.

## Exact probe/cache payload

The public `ChunkManager` contract is currently:

```ts
probeAbandonedCemeteryAtChunk(coord: ChunkCoord):
  { id: string; x: number; z: number } | undefined
```

Internally `resolveAbandonedCemeteryForChunk()` returns a fuller `EnvironmentPlacement`, but `WorldLocationCatalog` consumes only `id/x/z`. Therefore the cache payload should stay minimal:

```ts
type CachedAbandonedCemeteryResult =
  | { status: 'none' }
  | { status: 'found'; id: string; x: number; z: number }
```

Do not persist `cemeterySize`, scale, rotation, variant or presentation data for this catalog cache.

The lookup states must remain distinct:

```text
undefined          = cache miss
status: none       = materialized negative result
status: found      = materialized positive result
```

## New cache module

Add a sibling of `locationsCoarseCache.ts`:

```text
src/world/locations/abandonedCemeteryCache.ts
```

Recommended contract:

```ts
activate(seed: number, fingerprint: string): void
lookup(cx: number, cz: number): CachedAbandonedCemeteryResult | undefined
remember(cx: number, cz: number, result: CachedAbandonedCemeteryResult): void
ready(): Promise<void>
dispose(): void
```

Semantics:

- `lookup()` is synchronous.
- `remember()` updates the session map immediately, before IndexedDB completes.
- `ready()` belongs to the current activation generation and resolves after best-effort hydrate, including empty/failure cases.
- later `activate()` invalidates the older hydrate generation.
- startup never awaits `ready()` globally.

Reuse `cacheKey`, `listCacheRecords`, `putCacheRecords` and `enforceCacheCap` from `worldgenCacheDb.ts`; do not add a store or save field.

Persist only roll-pass chunks. Roll-fail chunks stay uncached because their test is already cheap.

## Catalog integration seam

Keep persistence out of `WorldLocationCatalog` itself. Extend `WorldLocationCatalogDeps` beside the existing `hydrateTile` / `onTileDirty` seams with cache-domain callbacks rather than importing IndexedDB/cache implementation into the catalog.

Useful dependency shape:

```ts
lookupAbandonedCemetery?: (cx: number, cz: number) => CachedAbandonedCemeteryResult | undefined
rememberAbandonedCemetery?: (cx: number, cz: number, result: CachedAbandonedCemeteryResult) => void
awaitAbandonedCemeteryCacheReady?: () => Promise<void>
```

Names can differ, but preserve the existing dependency-injection boundary.

Factor the expensive boundary so both sync and async paths use the same resolver:

```text
eligible roll-pass chunk
→ lookup cached result
  → found: run existing positive filtering/appending path, no ChunkManager probe
  → none: no result, no ChunkManager probe
  → miss: ChunkManager probe once
          → remember found/none immediately
          → run existing positive filtering/appending path
```

Only a real canonical probe increments `cemeteryExpensiveProbes`. A cached positive may still increment `cemeteryAbandonedResolved` when it is actually accepted into this query, matching the current meaning of that counter.

## Async hydration and progress

`landmarksInRangeAsync()` should await the current cache activation's `ready()` **before resolving roll-pass chunks into cache hits vs misses**. Do not add this wait to synchronous `landmarksInRange()`.

After hydration:

- consume cached positives/negatives synchronously,
- collect only cache misses for `appendAbandonedProbesAsync()` / cooperative probing,
- keep the current expensive-probe scheduler for those misses,
- if there are zero misses, report progress `1` and return without yielding/probing.

The existing async progress denominator is the expensive `toProbe` list. Preserve that meaning: after cache resolution it should represent actual misses requiring canonical materialization, not cache hits. This keeps progress monotonic and prevents warm-cache hits from pretending to be expensive probe work.

## Fingerprint: important current-code detail

Do not fingerprint only a hand-picked terrain subset.

`probeAbandonedCemeteryAtChunk()` currently materializes through:

```text
paramsFor(coord, [])
→ createLocalTerrainSampler(coord, params)
→ resolveAbandonedCemeteryForChunk(coord, params, terrain)
```

`paramsFor()` is not just raw height noise: it also derives local road/village context and `cemeterySettlements`. `resolveAbandonedCemeteryForChunk()` uses:

- `params.seed` and `params.chunkSize` for RNG/placement,
- terrain/road sampling via the local sampler and `validateCemeteryPhysical()`,
- `params.cemeterySettlements` via `isTooNearAnySettlement()`.

Therefore `locationsCoarseFingerprint(rawSampleParams)` cannot simply be reused as-is and described as complete for cemetery materialization.

Recommended split:

- fingerprint stable world/config inputs available at activation (`RawSampleParams` plus any relevant global placement/settlement-generation configuration not contained there),
- namespace version explicitly invalidates cache when cemetery placement, settlement-placement/nearby-settlement semantics, or the cached payload algorithm changes.

Do **not** try to put per-chunk `cemeterySettlements` or road arrays into the top-level fingerprint: they are derived from the same seed/config and would defeat one seed-level activation. Instead treat changes to those derivation algorithms as namespace-version invalidation.

## createApp lifecycle

`src/app/createApp.ts` currently owns `coarseCachePersistence`, passes its sync seams into `createWorldLocationCatalog()`, and calls:

```ts
coarseCachePersistence.activate(
  config.seed,
  locationsCoarseFingerprint(rawSampleParamsFromWorld(config)),
)
```

both on initial construction and world rebuild. Wire the abandoned-cemetery cache beside that lifecycle:

- construct once with the catalog,
- pass lookup/remember/readiness callbacks through `WorldLocationCatalogDeps`,
- activate for initial seed/config,
- reactivate on rebuild before stale hydrate completion can apply,
- dispose with the same app lifecycle discipline.

Do not make cache activation part of `SaveData` restore semantics; it is seed-derived disposable data.

## Tests worth implementing first

Cache module:

- `undefined` miss vs cached `none`;
- positive and negative hydrate round-trip;
- negative chunk coordinates in subkeys;
- `remember()` visible immediately before write completion;
- seed/fingerprint/version isolation;
- activation clears prior in-memory identity;
- stale hydrate cannot overwrite newer activation;
- `ready()` resolves on hit, empty store and storage failure;
- bounded cleanup.

Catalog:

- cached positive skips `probeAbandonedCemeteryAtChunk()` and still passes existing distance/dedup filtering;
- cached negative skips the probe;
- miss probes once and remembers `found` or `none` immediately;
- same-session repeat does not probe again;
- async waits for hydrate before classifying misses;
- sync remains synchronous and can probe while hydrate is incomplete;
- all-cache-hit async path performs zero expensive probes and finishes progress at `1`;
- partial-hit progress is monotonic and based on remaining expensive misses;
- warm/cold and sync/async result parity;
- cache use never mutates `LocationKnowledge`.

No wall-clock assertions.

## Documentation after implementation

Current `docs/STATE.md` (verified 2026-09-12) already describes abandoned wilderness cemeteries as deterministic bounded-chunk-probe world locations and does **not** claim that `locations-coarse` is the only cache namespace. Do not edit it merely to announce an optimization unless its short current-state description materially becomes inaccurate.

`docs/state/world-locations.md` / `docs/state/persistence.md` should be checked after implementation for statements that `locations-coarse` is the only worldgen-cache namespace; update only those statements once the second namespace actually exists.

## Guardrails

- Cache is optimization only, never source-of-truth dependency.
- No `SaveData` migration.
- No query-result cache keyed by player position/radius.
- No lake/peak caching in this plan.
- No Worker offload.
- No duplicated cemetery placement logic.
- Keep `collectAbandonedChunksToProbe()` cheap roll/range pruning unchanged.
- Keep `probeAbandonedChunk()`'s distance/dedup semantics shared for cache and fresh results.
- Do not remove world-022 cooperative yielding even when warm cache makes probes rare.
