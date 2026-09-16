# Implementation Notes: settlements-014 — Persistent settlement definition worldgen cache

**Plan:** `docs/plans/settlements-014-persistent-settlement-definition-worldgen-cache.md`  
**Reviewed:** 2026-09-16  
**Status:** `verification needed` 🔍  
**Source of truth:** current `main` code + docs.

## Current architecture to preserve

- `src/settlement/settlementPlanCache.ts` is the only runtime authority for settlement definitions. `settlementDefFor()` is synchronous and its module-level `defCache: Map<string, SettlementDef | null>` is shared by `SettlementsManager`, `roadNetwork.ts`, `ChunkManager`/cemetery lookup and world-knowledge scan paths.
- A cache miss is more than `generateSettlementDef()`: before generation it resolves progression policy, predecessor naming probes / unique-name state and authored Lost Treasure residents. A persistent hit must therefore enter at the final `SettlementDef | null` seam, not bypass/replace those mechanisms globally.
- `clearSettlementDefCache()` also clears `namingInputCache`, `uniqueNameCache`, river registration, progression policy and authored-resident host memoization. Keep that world-scoped reset behavior.
- `SettlementDef` + nested `VillagePlan` are plain data today. `VillagePlan` explicitly excludes runtime/Three.js agents; current additions from settlements-009/011/012/013 (pasture/plaza/merchant layout/paddock) are deterministic plan data and belong in the cached result automatically. Do not define a reduced DTO unless structured-clone tests prove it necessary.
- `docs/state/persistence.md` classifies settlement generation as deterministic reconstruction and settlement-plan memoization as derived/cache. This feature must stay outside `SaveData`.

## Recommended shape

Add `src/settlement/settlementWorldgenCache.ts` as a sibling of `roadRouteWorldgenCache.ts`.

Prefer the same split already proven by road routes:

```text
settlementPlanCache.ts
  defCache = synchronous authority
  ingestHydratedSettlementDef(cellKey, def|null)
  attachSettlementDefPersistence(adapter|null)
  activateSettlementDefWorldgenCache(seed, fingerprint)
  settlementDefWorldgenCacheReady()

settlementWorldgenCache.ts
  IndexedDB/session identity/version/fingerprint/dirty batching only
```

Do not let `settlementWorldgenCache.ts` become another runtime map that callers query directly. Hydration must merge into `defCache`; generated values must be stored in `defCache` first and only then passed to `remember()`.

### Main-thread boundary

This matters more here than the plan currently states. `clearRoadNetworkMemoryCaches()` calls `clearSettlementDefCache()`, and its documented contract is used by the terrain/world-knowledge worker without touching IndexedDB. `settlementPlanCache.ts` is therefore reachable in worker code.

Follow the road-route pattern:

- the persistent adapter may import `worldgenCacheDb.ts`;
- `settlementPlanCache.ts` should only hold an optional attached adapter/interface;
- attach/activate it from `src/app/worldBundle.ts` on the main thread;
- worker realms simply run with no adapter and retain current deterministic behavior.

Do not import/create IndexedDB persistence implicitly from settlement lookup code.

## Hydration race contract

Use the `roadRouteWorldgenCache.ts` generation-token pattern, not the older replace-map behavior from `locationsCoarseCache.ts`.

Required merge rule:

```ts
function ingestHydratedSettlementDef(key: string, value: SettlementDef | null) {
  if (defCache.has(key)) return
  defCache.set(key, value)
}
```

This preserves a value generated while hydration was in flight. The adapter also needs `invalidate()` (or equivalent generation bump) so `clearRoadNetworkCaches()` / world rebuild cannot let an old async hydrate repopulate freshly-cleared definitions.

`clearRoadNetworkMemoryCaches()` must remain worker-safe and memory-only. Main-thread full clear should additionally invalidate the attached settlement persistent adapter, analogous to `persistentRoutes?.invalidate()` in `clearRoadNetworkCaches()`.

## Activation ordering

`src/app/worldBundle.ts` already creates/attaches/activates the persistent road-route cache using:

- `rawSampleParamsFromWorld(config)`;
- `HOME_RADIUS`;
- `config.settlements.homeSize`.

Settlement persistence should be wired in the same area, before `chunkManager.update(0, 0)` and before any caller can cause the first `settlementDefFor()` lookup.

Unlike road routes, settlement generation is an important boot cost and the home def is predictably requested immediately. If a small namespace-wide hydrate can complete before first home lookup without delaying unrelated startup materially, await `ready()` once. Otherwise correctness is unchanged: an early miss generates synchronously and wins later hydrate merge.

Do not warm/generate cells proactively.

## Fingerprint

Reuse `worldgenFingerprint()` from `src/persistence/worldgenFingerprint.ts`.

Prefer a fingerprint input based on the full terrain/world-generation structure already used by road routes rather than reconstructing individual fields manually:

```ts
worldgenFingerprint({
  params: rawSampleParamsFromWorld(config),
  localSearchRadius: HOME_RADIUS,
  homeSize: config.settlements.homeSize ?? null,
  progression: progressionIdentity,
})
```

`RawSampleParams` already carries terrain, `waterLevel`, `heightScale`, `region` and river/hydrology configuration. This is safer than separately listing selected config fields and silently missing a future terrain input.

### Progression identity

`resolveSettlementProgressionPolicy()` returns an object containing a `minimumFor()` function, so do **not** fingerprint the policy object directly.

Serialize only its deterministic data:

```ts
{
  homeSize: policy?.homeSize ?? null,
  near: policy?.near ?? null,
  far: policy?.far ?? null,
}
```

or expose a small data-only helper/type from `settlementProgression.ts` and derive `minimumFor()` from it.

The progression target selection itself uses terrain/site/river probes, so it must be resolved against the same registered `RiverQuery` that `settlementDefFor()` will use. A persistent read must never occur under a fingerprint computed before canonical river registration is known.

Algorithm-only changes that can alter `SettlementDef`/`VillagePlan` for identical fingerprint inputs require `SETTLEMENT_DEF_CACHE_VERSION` bump. This includes settlement site/layout, naming, profession/family generation, settlement character, pasture/plaza/merchant/paddock generation and authored-resident placement logic.

## Payload validation

IndexedDB data is disposable but untrusted/stale. Add a cheap structural validator before hydration rather than blindly inserting `unknown` into `defCache`.

Validation does not need to duplicate every nested type. At minimum verify:

- literal `null` is valid;
- object has matching string `id`, integer `gx/gz`, finite `x/y/z`, valid `size`, arrays for `families`, and object `plan`;
- `plan.identity.id` / `plan.identity.cell` agree with the outer definition/cell;
- `plan.identity.name` and outer `name` agree.

Invalid payload = miss. Do not migrate old cache rows.

A structured-clone round-trip test should cover a real generated `SettlementDef` from current code, not a hand-built minimal fixture, so nested pasture/plaza/merchant/paddock structures are exercised.

## Naming and authored-resident interaction

A hydrated final `SettlementDef` legitimately skips the expensive predecessor-name probes and authored-host generation for that cell. However those memoized helper caches can still be needed later when a non-hydrated neighboring cell is generated.

Do not attempt to reconstruct `namingInputCache`, `uniqueNameCache`, elder/archaeologist/specialist host memoization from a hydrated def. They are derived helper caches and may populate lazily as today.

Important consequence: persistent defs must have been generated with the same algorithm/version and progression/world inputs, otherwise later fresh cells could disagree. Version/fingerprint invalidation is the protection; avoid ad-hoc reconciliation between hydrated and fresh defs.

## Writes and eviction

Reuse:

- `cacheKey()`;
- `listCacheRecords()`;
- `putCacheRecords()`;
- `enforceCacheCap()`.

Namespace: `settlement-definitions`; subkey should be `cell:<gx>:<gz>` rather than the runtime `gx_gz` form, with one explicit conversion seam.

Keep cached `null` as a real hit. `undefined`/absence is the only miss.

Use debounced batched writes like `roadRouteWorldgenCache.ts`. Capture seed/fingerprint/generation at flush start; after `await putCacheRecords()` do not run cap cleanup for a stale generation.

A count cap is sufficient; payloads are small relative to `chunk-tiles`. Pick a bounded explored-region-scale limit rather than a theoretical whole-world grid. Eviction must affect performance only.

`lastAccessedAt` is currently write-time/LRU-ish, not refreshed on every cache hit in the small cache namespaces. Keep that convention unless there is a concrete reason to add read-touch writes.

## Tests worth adding

Prefer focused tests around the adapter plus existing settlement fixtures:

- real generated `SettlementDef` structured-clone / IndexedDB round-trip, including current `VillagePlan` optional structures;
- `null` persists and hydrates as a hit;
- same seed/fingerprint/version hydrates and prevents generator call;
- fingerprint, seed and version mismatches are misses;
- malformed payload is ignored;
- runtime generation during in-flight hydrate wins;
- invalidate/rebuild prevents stale hydrate from re-entering `defCache`;
- progression identity (`near`/`far` target change) changes fingerprint;
- worker/no-adapter path remains fully synchronous and does not require IndexedDB.

For generator-call assertions, add a narrow test seam/injected callback if necessary; do not restructure `settlementGenerator.ts` just for spying.

## Dependencies / current code discrepancy

The plan lists `settlements-012` and `settlements-013` as unfinished dependencies, but both are already implemented on current `main` and are in `verification needed`. Their deterministic worldgen additions are therefore part of the payload/version baseline for this cache implementation.

Because `SettlementDef` has continued to gain generation-time data, land this cache only after confirming no concurrently merging plan changes its payload/algorithm without either landing first or coordinating the initial cache version.

## Suggested implementation order

1. Add adapter + validator + fingerprint/version tests.
2. Add optional attach/activate/ready/ingest seams to `settlementPlanCache.ts`; keep `defCache` authoritative.
3. Route freshly generated `SettlementDef | null` through `remember()` after `defCache.set()`.
4. Wire create/attach/activate/invalidate/dispose in the same main-thread lifecycle area as road-route persistence.
5. Add race/rebuild/integration tests.
6. Update `docs/state/persistence.md` and `docs/state/settlements.md` to list the new namespace and derived-cache ownership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
