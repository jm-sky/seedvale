# Implementation Notes: Persistent abandoned cemetery worldgen cache

**Reviewed:** 2026-09-11
**Plan:** `world-025-persistent-abandoned-cemetery-worldgen-cache.md`

## Current ownership

Keep the existing boundaries:

- `src/terrain/cemeteryPlacement.ts` owns deterministic abandoned-cemetery placement rules and `chunkPassesAbandonedCemeteryRoll`.
- `src/terrain/chunkManager.ts` owns terrain-aware materialization through `probeAbandonedCemeteryAtChunk()`.
- `src/world/locations/worldLocationCatalog.ts` owns discovery enumeration and currently calls the expensive probe after cheap roll/range pruning.
- `src/persistence/worldgenCacheDb.ts` is the generic disposable `(seed, namespace, version, subKey) -> payload` store.
- `src/world/locations/locationsCoarseCache.ts` is the implementation pattern to reuse for namespace/version/fingerprint, async hydrate, session map, debounced writes and bounded cleanup.
- `LocationKnowledge` / `SaveData.map` remain the only player discovery authority.

Do not move cemetery placement into the cache module and do not cache discovery state.

## Existing world-022 flow to preserve

`worldLocationCatalog.ts` already has:

```text
collectAbandonedChunksToProbe(...)
→ cheap annulus/AABB prune
→ chunkPassesAbandonedCemeteryRoll(...)
→ appendAbandonedProbes(...)
→ probeAbandonedCemeteryAtChunk(...)
```

`landmarksInRangeAsync()` yields only around the remaining expensive abandoned probes and is used by merchant/NPC discovery through the existing BusyOverlay path.

Do not create a separate merchant/NPC resolver.

## New cache module

Prefer a sibling of `locationsCoarseCache.ts`, e.g.:

```text
src/world/locations/abandonedCemeteryCache.ts
```

It should own:

```ts
type CachedAbandonedCemeteryResult =
  | { status: 'none' }
  | { status: 'found'; id: string; x: number; z: number }
```

Verify the real `probeAbandonedCemeteryAtChunk()` return shape before finalizing the payload. Add fields only if required by the existing catalog path.

The lookup contract must keep these states distinct:

```text
undefined          = cache miss
status: none       = materialized negative result
status: found      = materialized positive result
```

Do not use `null` for both miss and negative result.

## Recommended runtime contract

Use the same activation-generation protection as `createCoarseCachePersistence`, but expose readiness:

```ts
activate(seed, fingerprint): void
lookup(cx, cz): CachedAbandonedCemeteryResult | undefined
remember(cx, cz, result): void
ready(): Promise<void>
dispose(): void
```

Important semantics:

- `lookup()` is synchronous.
- `remember()` updates the in-memory map immediately and schedules persistence afterward.
- `ready()` belongs to the current activation generation and resolves after best-effort hydrate, including empty/failure cases.
- a later `activate()` must prevent an older hydrate from replacing current session data.

Do not block app/world startup on `ready()`.

## Async discovery integration

This is the key fix for the hydrate race:

- synchronous `landmarksInRange()` must stay fully synchronous and may fall back to canonical probing while hydrate is still running;
- `landmarksInRangeAsync()` should await the current abandoned-cemetery cache `ready()` before deciding which roll-pass chunks still require expensive materialization.

Await readiness only for this expensive async discovery seam, not globally.

After readiness, both sync and async paths should use one shared helper for:

```text
lookup
→ cached positive/negative result
or
→ canonical ChunkManager probe
→ remember positive/negative result
```

This preserves result parity and avoids duplicate cache logic.

## Fingerprint

Create one explicit fingerprint helper in the new cache module.

Verify `ChunkManager.probeAbandonedCemeteryAtChunk()` and the `paramsFor(coord, [])` path. The fingerprint must cover every deterministic input that can alter cemetery placement.

Prefer reusing the complete `RawSampleParams` structure plus any required input outside it (for example chunk size if not already represented) rather than maintaining a manually selected terrain subset.

Namespace version handles algorithm/payload changes; fingerprint handles deterministic input changes. Neither is migrated.

## Persistence behavior

Reuse:

```text
cacheKey
listCacheRecords
putCacheRecords
enforceCacheCap
```

from `worldgenCacheDb.ts`.

Persist only roll-pass materialization results. Do not store roll-fail chunks: the roll is cheap and its low hit rate is what keeps this namespace sparse.

Batch/debounce writes as in `locationsCoarseCache.ts`. Persistence failure must leave the freshly remembered session result usable and only cause recomputation in a later session.

## createApp lifecycle

Wire activation beside the existing coarse-location cache in `src/app/createApp.ts`.

On startup and world rebuild:

```text
activate(seed, fingerprint)
```

On rebuild, both the session map and readiness generation must switch identity before stale async hydrate completion can apply.

Dispose pending timers/resources with the same lifecycle discipline as the coarse cache.

## Progress behavior

`landmarksInRangeAsync()` progress must remain monotonic and finish at `1` with:

- no cached results,
- partial cache hits,
- all eligible chunks cached.

Cached chunks should not be counted as expensive probe work. Avoid introducing a second progress model; adapt the existing world-022 batching/progress calculation.

## Tests worth implementing first

Cache module:

- `undefined` miss vs cached `none` distinction;
- positive and negative hydrate round-trip;
- `remember()` visible immediately before write completion;
- seed/fingerprint/version isolation;
- stale hydrate cannot overwrite newer activation;
- `ready()` resolves on empty store and storage failure.

Catalog:

- cached positive skips `probeAbandonedCemeteryAtChunk()`;
- cached negative skips it too;
- miss probes once and remembers immediately;
- same-session repeat does not probe again;
- async waits for hydrate before probing;
- sync stays synchronous;
- warm vs cold result parity;
- sync vs async parity;
- progress monotonic/final `1`.

No wall-clock tests.

## Documentation discrepancy to update after implementation

`docs/state/world-locations.md` currently says the persistent worldgen cache has one current namespace/consumer (`locations-coarse`). Update that statement after the second namespace exists.

Also check `docs/state/persistence.md` and the short `docs/STATE.md` worldgen-cache description for the same assumption.

## Guardrails

- Cache is optimization only, never source-of-truth dependency.
- No `SaveData` migration.
- No query-result cache keyed by player position/radius.
- No lake/peak caching in this plan.
- No Worker offload.
- No duplicated cemetery placement logic.
- Do not remove world-022 pruning/yielding even when warm cache makes probes rare.
