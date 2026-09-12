# Plan: Persistent abandoned cemetery worldgen cache

**Created:** 2026-09-11
**Status:** `verification needed` 🔍
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** ~~world-015~~, ~~world-022~~
**Domain:** `world`
**Subdomains:** `places` `simulation`
**Tags:** `worldgen-cache` `locations` `cemetery` `performance`
**Roadmap:** -

## Implementation status

Implemented 2026-09-12 on current `main`. Automated checks are the AI verification set; browser/gameplay verification is left to the user.

- `src/world/locations/abandonedCemeteryCache.ts`: `abandoned-cemeteries` namespace, chunk subkey, positive/negative payload, fingerprint of `RawSampleParams` + `chunkSize`, `activate`/`lookup`/`remember`/`ready`/`dispose`, debounced persist, bounded cap, generation-guarded hydrate merge.
- `src/app/createApp.ts`: activates the cache beside `locations-coarse` on boot and world rebuild; disposes with the coarse cache.
- `src/world/locations/worldLocationCatalog.ts`: shared lookup-or-probe helper; `landmarksInRangeAsync` awaits `ready()` then skips cached roll-pass chunks in the expensive probe loop; sync `landmarksInRange` never waits for IndexedDB.
- Docs: `docs/STATE.md`, `docs/state/world-locations.md`, `docs/state/persistence.md`, `docs/state/terrain-and-world-generation.md`.

## Problem

World-location discovery still performs deterministic abandoned-cemetery materialization repeatedly for the same seed.

`world-015` introduced the shared persistent worldgen cache, but its only current consumer is the `locations-coarse` namespace. That cache stores coarse 16×16 location-classification tiles (`Uint8Array` state + `Float32Array` height). It avoids repeating coarse terrain classification, but it does not persist resolved landmark materialization.

`world-022` substantially reduced abandoned-cemetery discovery work by adding cheap deterministic roll pruning, distance-band/AABB pruning, cooperative async probing for larger queries and progress UI. For the reference seed used during that work, Far discovery fell from roughly 15,876 candidate chunks to about 124 expensive probes.

Those remaining probes still execute deterministic terrain-dependent work:

```text
chunkPassesAbandonedCemeteryRoll(...)
→ ChunkManager.probeAbandonedCemeteryAtChunk(...)
→ paramsFor(...)
→ createLocalTerrainSampler(...)
→ resolveAbandonedCemetery...
```

The same `(seed, chunk)` result may therefore be materialized again in later sessions or later discovery queries even though it is immutable derived world state.

Cooperative yielding prevents one long main-thread block, but does not remove this repeated CPU work.

## Goal

Extend the existing persistent worldgen-cache mechanism so expensive abandoned-cemetery materialization results can be reused across repeated Near / Guard / Far discovery, save reloads, different saves using the same seed and later sessions using the same deterministic world configuration.

The cache remains disposable derived data. Runtime correctness must never depend on it.

## Scope

Add one new seed-scoped worldgen-cache namespace for **resolved abandoned-cemetery chunk results**.

Cache only chunks that passed the existing cheap abandoned-cemetery roll and therefore required actual materialization.

A cached entry represents one deterministic result for a chunk:

```text
(seed, namespace, version, fingerprint, cx, cz)
→ cemetery placement
  or
→ confirmed absence
```

Both positive and negative materialization results are required. A negative entry means the chunk passed the cheap roll, but deterministic terrain/placement validation produced no abandoned cemetery. Without negative caching, the common unsuccessful expensive probe would still repeat.

## Architecture

Reuse the existing persistence boundary:

```text
src/persistence/worldgenCacheDb.ts
```

Do not introduce another IndexedDB store, cache manager or save-data field.

The new namespace should follow the same ownership pattern as:

```text
src/world/locations/locationsCoarseCache.ts
```

The location domain owns namespace name, version, fingerprint, payload shape, hydration, session lookup, dirty/result batching and bounded retention. `worldgenCacheDb.ts` remains generic and unaware of cemetery semantics.

Suggested namespace:

```text
abandoned-cemeteries
```

Exact naming may follow existing local conventions.

## Cache key

Use stable chunk identity, for example:

```text
chunk:<cx>:<cz>
```

under the existing generic key:

```text
(seed, namespace, version, subKey)
```

Do not key by player position, discovery query origin, Near/Guard/Far range, save slot or player knowledge state. Those are consumers of deterministic landmark state, not inputs to landmark generation.

## Cached payload and lookup states

Persist only the minimum deterministic result required to reconstruct the existing catalog result.

Use three distinct lookup states so cache miss cannot be confused with a cached negative result:

```ts
type CachedAbandonedCemeteryResult =
  | { status: 'none' }
  | {
      status: 'found'
      id: string
      x: number
      z: number
      // additional deterministic placement fields only if the canonical
      // resolver contract requires them
    }

// lookup(...) result:
undefined                  // no cached result → materialize
{ status: 'none' }         // materialized and confirmed absent
{ status: 'found', ... }   // materialized and found
```

Before implementation, verify the exact return contracts of `ChunkManager.probeAbandonedCemeteryAtChunk()` and `resolveAbandonedCemeteryForChunk()` and store no more than is needed by the existing catalog path.

Do not persist presentation-only or player-owned state. In particular, do not persist discovery/knowledge, navigation targets, generated display names if already derived from id + seed, quest state, mutable cemetery interaction state, chunk meshes or terrain.

## Fingerprint ownership

The new cache module owns one explicit fingerprint helper, for example:

```ts
abandonedCemeteryFingerprint(rawSampleParams, chunkSize)
```

The exact signature should match the real deterministic inputs used by `probeAbandonedCemeteryAtChunk()` after recon.

The fingerprint must cover every deterministic world/terrain input capable of changing abandoned-cemetery placement. Prefer reusing an existing complete deterministic parameter structure such as `RawSampleParams` plus any placement input outside it rather than maintaining a fragile hand-picked subset.

Changes to the cached payload or placement algorithm must bump the namespace version. A fingerprint/version mismatch is a cache miss, never a migration.

## Runtime cache contract

Create a location-domain cache abstraction following the lifecycle style of `createCoarseCachePersistence`.

Its contract should distinguish synchronous session lookup from asynchronous hydrate readiness:

```ts
type AbandonedCemeteryCache = {
  activate(seed: number, fingerprint: string): void
  lookup(cx: number, cz: number): CachedAbandonedCemeteryResult | undefined
  remember(cx: number, cz: number, result: CachedAbandonedCemeteryResult): void
  ready(): Promise<void>
  dispose(): void
}
```

Names may follow local conventions, but preserve these semantics.

`lookup()` must be synchronous. `remember()` must update the session-local map immediately before persistence finishes.

`ready()` resolves when the current activation's best-effort IndexedDB hydrate has completed, whether with data or as an empty/failure fallback. A later `activate()` must invalidate the previous readiness generation so stale data cannot leak across seed/fingerprint changes.

## Hydration and hitch avoidance

Do not make global application startup depend on IndexedDB cache availability.

Keep the existing non-blocking boot behavior:

- activation starts hydrate asynchronously,
- cache failure never breaks world construction,
- synchronous callers may fall back to canonical generation when the cache is not hydrated.

However, `landmarksInRangeAsync()` already exists specifically for potentially expensive discovery. Before it begins expensive abandoned-cemetery materialization, it should await the cache's `ready()` promise for the current world identity.

This avoids the current hydrate race where Far discovery can start dozens of expensive deterministic probes while the same cached results are still loading from IndexedDB.

The synchronous `landmarksInRange()` reference path must remain synchronous and must never wait for IndexedDB. If hydration is incomplete there, it falls back to canonical generation exactly as today.

## Runtime integration

Keep the existing canonical discovery flow:

```text
WorldLocationCatalog
→ collectAbandonedChunksToProbe(...)
→ appendAbandonedProbes(...)
→ ChunkManager.probeAbandonedCemeteryAtChunk(...)
```

Do not create a second landmark resolver for merchant maps, NPC dialogue or map UI.

Insert cache reuse at the expensive materialization boundary:

```text
cheap roll
→ range/AABB prune
→ eligible chunk
→ session/persistent cached result?
    yes → reuse positive/negative result
    no  → canonical ChunkManager probe
          → remember result immediately
          → persist asynchronously
```

The canonical `ChunkManager` / cemetery-placement logic remains the source of deterministic truth on misses.

## Interaction with `world-022`

Preserve all `world-022` behavior:

- cheap roll pruning,
- annulus/AABB range pruning,
- `landmarksInRange()` reference behavior,
- `landmarksInRangeAsync()`,
- cooperative yielding,
- progress callbacks,
- BusyOverlay integration.

Cached chunks count as already-resolved work and must not require `probeAbandonedCemeteryAtChunk()`.

Progress in the async path must remain monotonic and end at `1` regardless of cache-hit ratio. Sync and async APIs must keep result parity.

## Existing mechanisms/files to reuse

Primary files:

```text
src/persistence/worldgenCacheDb.ts
src/world/locations/locationsCoarseCache.ts
src/world/locations/worldLocationCatalog.ts
src/terrain/chunkManager.ts
src/terrain/cemeteryPlacement.ts
src/app/createApp.ts
```

Relevant existing symbols/contracts:

```text
CacheRecord
cacheKey
listCacheRecords
putCacheRecords
enforceCacheCap

createCoarseCachePersistence
locationsCoarseFingerprint

WorldLocationCatalog.landmarksInRange
WorldLocationCatalog.landmarksInRangeAsync
collectAbandonedChunksToProbe
appendAbandonedProbes

ChunkManager.probeAbandonedCemeteryAtChunk

chunkPassesAbandonedCemeteryRoll
resolveAbandonedCemeteryForChunk
```

Verify exact current names/signatures before implementation.

## Ownership

State ownership must remain:

```text
terrain/cemeteryPlacement
    owns deterministic cemetery placement rules

ChunkManager
    owns terrain-aware cemetery materialization

WorldLocationCatalog
    owns location enumeration/querying

worldgen cache namespace
    owns disposable persisted derived result

LocationKnowledge / SaveData.map
    owns player discovery state
```

Do not blur deterministic world state with player knowledge. A cemetery existing in the seed cache must never automatically reveal it to the player.

## Cache retention

Use the existing bounded-cache mechanism rather than unbounded IndexedDB growth.

Choose a per-seed namespace cap large enough to cover normal explored/discovered regions without constant churn.

The cap should count only expensive roll-pass materialization results, not every chunk in the world.

Do not persist roll-fail chunks: the deterministic roll is intentionally cheap and the low eligibility rate naturally bounds cache growth.

## Non-goals

Do not in this plan:

- persist all `WorldLocation[]`,
- create a cache keyed by discovery query/radius,
- cache Near/Guard/Far result sets,
- persist lake connected components,
- persist mountain peaks,
- persist settlement locations,
- persist caves,
- add a general-purpose landmark database,
- change cemetery placement rules,
- change discovery probabilities,
- change player knowledge persistence,
- move world-location generation to a Web Worker,
- remove `world-022` cooperative yielding,
- introduce new diagnostics solely for this optimization.

Lake/peak caching should become a separate future plan only if concrete evidence shows it is needed.

## Implementation outline

### 1. Define abandoned-cemetery cache contract

Add a location-domain cache module following `locationsCoarseCache.ts`.

Define namespace, version, fingerprint, chunk subkey, positive/negative payload, activation lifecycle, readiness promise, synchronous lookup, immediate session insertion, debounced persistence and bounded cleanup.

### 2. Wire lifecycle in `createApp.ts`

Activate the cache using the current seed and abandoned-cemetery fingerprint alongside the existing coarse-location cache.

On world rebuild:

- invalidate session state,
- activate against the new seed/fingerprint,
- invalidate previous readiness generation,
- never leak cached records between world identities.

Dispose timers/resources using the same lifecycle discipline as the existing cache.

### 3. Integrate with abandoned probing

In the existing `WorldLocationCatalog` abandoned-cemetery path:

```text
cheap eligibility
→ cache lookup
→ canonical probe only on cache miss
→ cache positive/negative result immediately
```

Do not bypass `ChunkManager` on misses. Do not duplicate cemetery placement logic in the cache module.

### 4. Resolve async hydrate race

At the start of the expensive abandoned-cemetery phase in `landmarksInRangeAsync()`, await the current cache activation's `ready()` promise before deciding which eligible chunks still require canonical probing.

Do not add this wait to `landmarksInRange()`.

### 5. Preserve sync/async parity

Both APIs must consume the same cache lookup/materialization helper. Only scheduling/yield behavior may differ.

### 6. Persist asynchronously

Writes must never block gameplay, should batch/debounce, should swallow storage failures according to existing worldgen-cache semantics and must update in-memory state before IndexedDB persistence.

### 7. Documentation

Update current-state documentation so it no longer claims `locations-coarse` is the only worldgen-cache namespace.

Relevant docs:

```text
docs/state/world-locations.md
docs/state/persistence.md
docs/STATE.md
```

Only update statements affected by the implementation.

Add JSDoc with `@domain world` / `@system worldgen-cache` to important new architectural/public functions where useful for preflight/code-map discovery.

## Tests

### Cache module

Add focused tests for:

- positive result round-trip,
- negative result round-trip,
- distinction between `undefined` miss and cached `{ status: 'none' }`,
- seed isolation,
- fingerprint mismatch = miss,
- namespace-version isolation,
- chunk-key stability including negative coordinates,
- activation clears stale in-memory identity,
- `ready()` resolves for hit, empty store and persistence failure,
- stale hydrate generation cannot overwrite a later activation,
- `remember()` is immediately visible before persistence completes,
- bounded cleanup behavior if owned by the module.

### WorldLocationCatalog integration

Verify:

1. Cached positive abandoned cemetery produces the same `WorldLocation` and does not call `probeAbandonedCemeteryAtChunk()`.
2. Cached negative result produces no cemetery and does not call the expensive probe.
3. Cache miss calls the existing canonical probe exactly once and immediately remembers the result.
4. Repeated same-session query does not probe the same eligible chunk again.
5. Warm persisted cache reused after activation does not probe previously materialized roll-pass chunks.
6. `landmarksInRangeAsync()` waits for current cache hydration before scheduling expensive abandoned probes.
7. `landmarksInRange()` stays synchronous and does not await hydration.
8. Sync/async return identical location sets.
9. Near → Far and Far → Near remain deterministic.
10. Cached existence does not modify `LocationKnowledge`.
11. Old seed/fingerprint results cannot leak after world rebuild.
12. Progress remains monotonic and ends at `1` with zero, partial or full cache hits.

Do not add wall-clock assertions.

## Acceptance criteria

- After full cache hydration, repeating Far discovery performs **zero** `probeAbandonedCemeteryAtChunk()` calls for every roll-pass chunk that was previously materialized and persisted.
- Cold-cache and warm-cache discovery return the same abandoned-cemetery set for the same seed/configuration/query.
- A cached negative result prevents re-running the corresponding expensive terrain probe.
- Same-session repeated discovery reuses freshly materialized results even before IndexedDB persistence finishes.
- `landmarksInRangeAsync()` does not race expensive cemetery generation against an in-flight cache hydrate for the current activation.
- `landmarksInRange()` remains fully synchronous and correctness-independent from cache readiness.
- Another save using the same seed can reuse the derived cache without inheriting discovery state.
- Cache misses produce exactly the same deterministic results as before.
- World-location sync and async APIs remain equivalent.
- `world-022` pruning and cooperative scheduling remain intact.
- Cache failure/deletion only causes recomputation, never incorrect world state.
- No new save migration is required.
- No player discovery state moves into the seed cache.
- Existing automated tests plus new focused tests pass.
- Browser verification is left to the user.

## Verification

AI:

```text
pnpm test
pnpm typecheck
pnpm build
```

Use narrower relevant tests first where available, then repository-standard verification required by the current scripts/configuration.

Do not perform browser verification.

Manual verification by user:

- buy/reveal Far map on a seed with an already-populated abandoned-cemetery cache,
- repeat discovery / reload save and check that cemetery-generation hitch does not recur,
- verify revealed locations remain identical,
- clear disposable seed cache and confirm regeneration occurs without losing save/discovery progress.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
