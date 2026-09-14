# Implementation notes: world-terrain-029 persistent road route worldgen cache

**Reviewed:** 2026-09-15  
**Plan:** `docs/plans/world-terrain-029-persistent-road-route-worldgen-cache.md`  
**Baseline:** `main` at `f2ef36ada93e89360e3f877ccbcff9d2d5f50647`

## Current code facts

- `world-terrain-023` is already implemented. `src/settlement/roadNetwork.ts` stores canonical `RoadRoute | null` in module-local `routeCache`; `RoadRoute` contains `points`, `segments`, `kind` and canonical `RoadRiverCrossing[]`.
- Route computation is canonicalized in `routeBetween()` by sorted settlement id. `pairKey()` is order-independent and crossing ids derive from the same route key.
- Minor-location paths use the same cache/search pipeline through `routeToLocation()`. Current persistent identity is `${def.id}:${loc.kind}`; V1 has a single location per supported kind, so do not introduce a parallel route id scheme unless that assumption changes.
- `world-terrain-033` is already implemented. `ford`/`bridge` consumers read crossing records projected from `RoadRoute`; persistence must restore that exact route object and must not reclassify crossings.
- `clearRoadNetworkCaches()` is the existing rebuild/new-world invalidation seam. It currently clears settlement/minor-location/route/cemetery runtime caches.
- The generic disposable store already exists in `src/persistence/worldgenCacheDb.ts`; use `cacheKey()`, `listCacheRecords()`, `putCacheRecords()` and `enforceCacheCap()`. Roads remain derived worldgen data, never `SaveData`.

## Recommended ownership

Keep `routeCache` as the only synchronous authority in `roadNetwork.ts`.

Add a focused sibling adapter, e.g. `src/settlement/roadRouteWorldgenCache.ts`, owning only:

- namespace/version constants (`road-routes`),
- fingerprint creation,
- payload validation,
- async hydrate generation/cancellation,
- dirty batching + bounded persistence.

`roadNetwork.ts` should expose/wire a narrow lifecycle such as activation/deactivation plus `remember` of newly computed routes. Do not move A*, endpoint resolution or route semantics into the persistence adapter.

Hydration must merge into the existing `routeCache` with:

```text
if routeCache already has key -> keep runtime value
else valid hydrated value -> insert
```

This is the important race rule: a route computed while IndexedDB hydration is in flight wins over older persisted data.

## Lifecycle integration

Activate the road cache for every world build/rebuild before the first chunk request can trigger `segmentsNear()` / road resolution. `src/app/worldBundle.ts` is the correct composition boundary; `chunkManager.update(0, 0)` is already the first explicit streamed-chunk kick in `buildWorldSystems()`.

Required ordering:

```text
clear/invalidate old road cache generation
→ compute seed + fingerprint
→ activate best-effort async hydrate
→ normal world build continues synchronously
→ any early route miss computes normally and wins the merge race
```

Do not await hydration in route consumers and do not make `findRoute()`, `routeBetween()` or `segmentsNear()` async.

`clearRoadNetworkCaches()` must also invalidate any in-flight persistent hydrate/flush generation, otherwise a previous seed/config activation can repopulate the freshly cleared runtime map.

## Fingerprint/version boundary

Use `worldgenFingerprint()` from `src/persistence/worldgenFingerprint.ts`.

For runtime-config inputs, reuse the existing canonical terrain conversion:

- `rawSampleParamsFromWorld(config)` — includes terrain sampler inputs, `waterLevel` and full `region` config (including road-network and river/hydrology configuration),
- `HOME_RADIUS` / road settlement `localSearchRadius`,
- `config.settlements.homeSize`.

Those are the current config-driven inputs capable of moving settlement sites/entrances, minor locations or route cost/geometry.

Do **not** duplicate hardcoded algorithm constants into the fingerprint. Treat code-defined routing/crossing/placement behaviour as namespace-versioned algorithm state. Bump `ROAD_ROUTE_CACHE_VERSION` whenever any of these can change output for identical runtime config, including:

- `DEFAULT_ROUTING_OPTIONS`, `MOUNTAIN_COST_WEIGHT`, `ROUTE_WATER_CLEARANCE`, `RIVER_ENVELOPE_PADDING`, meander/smoothing behaviour,
- `roadRiverCrossing.ts` ford/bridge thresholds/costs or crossing geometry,
- settlement entrance/site generation semantics,
- minor-location placement/identity semantics,
- serialized `RoadRoute` / `RoadRiverCrossing` shape.

This is safer than maintaining a second copied constants object that can silently drift from production code.

## Persistent keys and payload

Use the existing runtime route key as the persistent subkey:

- settlement↔settlement: `pairKey(idA, idB)`,
- settlement↔minor location: the exact key currently used by `routeToLocation()`.

Persist `RoadRoute | null`; cached `null` is a real hit and must be distinguishable from an absent record.

Do not persist derived bridge specs, ford projections, signposts or chunk corridor slices. `bridgeSpecOf()` / `bridgesNear()`, `fordsNear()`, `segmentsNear()` and signpost code must keep projecting from the restored canonical route.

IndexedDB data is untrusted. Add cheap structural validation before inserting hydrated data: valid `kind`, finite point/segment numbers, segment/point consistency sufficient for current consumers, valid crossing kind/id/numeric facts, and allow literal `null`. Invalid data is a miss.

## Write path

On a runtime miss:

1. compute through the existing canonical `findRoute()` path;
2. insert into `routeCache` immediately;
3. enqueue the exact result (including `null`) for debounced/batched persistence;
4. flush with `putCacheRecords()` and then `enforceCacheCap()`.

Do not precompute neighbors or settlement pairs to warm IndexedDB. Only persist routes ordinary gameplay/world generation actually requests.

Keep dirty entries generation-scoped. If seed/fingerprint changes before a delayed flush runs, the stale batch must not be written under the new activation identity.

## Important pitfalls

- `routeCache.get(key) === undefined` is the miss sentinel; `null` is a cached failed route. Preserve that distinction through hydration.
- Do not regenerate crossings from cached geometry. The cached `RoadRiverCrossing[]` is part of the canonical result produced by `crossingsForPolyline()` after meander/fallback.
- Do not reverse cached route geometry for B→A. Current consumers already orient from canonical stored geometry through `orientedFrom()` while physical crossing ids stay unchanged.
- `settlementPlanCache` remains the endpoint/layout authority. Persistent roads must not become a fallback settlement-definition source.
- `worldgenCacheDb.listCacheRecords()` loads all records for one seed then filters namespace/version; acceptable for road records, but keep the road namespace record cap bounded.
- Persistence failures must remain invisible to simulation correctness; no retry loop on the gameplay path.

## Tests worth adding

Focus on the cache seam rather than retesting A* policy already covered by road/crossing tests:

- hydrate `RoadRoute` with bridge/ford crossings and reuse it without calling route search;
- cached `null` avoids a second search;
- A→B/B→A share one persisted subkey and crossing ids;
- different seed/fingerprint/version misses;
- changing `homeSize`, local-search radius or terrain/region config changes fingerprint;
- runtime-computed value wins over an in-flight hydrate for the same key;
- stale activation cannot populate/flush after rebuild;
- malformed payload is ignored;
- storage failure falls back to normal route generation;
- eviction only causes recomputation, never different world semantics.

## Files likely touched

- `src/settlement/roadNetwork.ts` — runtime authority + lifecycle hooks/remember calls.
- `src/settlement/roadRouteWorldgenCache.ts` — new persistence adapter/fingerprint/validation.
- `src/app/worldBundle.ts` — activate cache at world lifecycle boundary.
- focused tests beside the new adapter / existing road-network tests.
- after implementation: `docs/state/persistence.md` and `docs/state/terrain-and-world-generation.md`.

No changes should be required in bridge/ford projection or `SaveData`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
