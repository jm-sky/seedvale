# Plan: Persistent road route worldgen cache

**Created:** 2026-09-14
**Status:** `verification needed` 🔍
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** ~~world-terrain-023~~, ~~world-terrain-033~~  
**Domain:** `world-terrain`
**Subdomains:** `roads` `terrain`
**Tags:** `worldgen` `cache` `roads` `routing` `performance`
**Roadmap:** -
**Model:** Opus, Sonnet
**Implemented at:** 2026-09-15 12:33

## Goal

Persist deterministic road-route results so reloads, rebuilds and independent saves using the same seed can reuse expensive A* routing and canonical river-crossing decisions.

The existing `roadNetwork.ts` runtime `routeCache` remains the synchronous authority. Persistent storage only hydrates and extends it.

## Recon

- `src/settlement/roadNetwork.ts` owns `routeCache` and coarse-grid A* (`findRoute`).
- A* repeatedly samples height/ridge, reconstructs a chain, anchors canonical river crossings, meanders unconstrained points and smooths its profile.
- Settlement-pair keys are order-independent through `pairKey(idA, idB)`; `routeBetween()` computes in canonical sorted-id orientation so forward/reverse lookup shares one physical route and crossing ids.
- `roadSegmentsForSettlement()`, signpost consumers and `routeToMinorLocation()` reuse the road-network route path rather than owning separate generators.
- Cache is currently session-only and cleared by `clearRoadNetworkCaches()`.
- `world-terrain-023` is implemented: `routeCache` already stores canonical `RoadRoute | null` with authoritative ford/bridge crossing records.
- `world-terrain-033` is implemented and projects bridge presentation/traversal from those same canonical crossing records.
- Reuse `src/persistence/worldgenCacheDb.ts`; roads remain deterministic reconstruction, not `SaveData`.

## Dependency on world-terrain-023 / 033

Both dependencies are already implemented in the current codebase.

The persistent payload must be the current canonical `RoadRoute | null`, including crossing records. Do not introduce an alternate persistent shape that recomputes or separately stores crossing semantics.

This preserves one authority:

```text
RoadRoute
├─ final geometry
├─ RoadSegment projection
└─ canonical ford/bridge crossings
```

## Cache contract

Add a road-owned adapter near `roadNetwork.ts` (focused sibling module if useful).

Namespace: `road-routes` with explicit version.

Reuse runtime identity where possible:

- settlement↔settlement: stable order-independent pair key;
- settlement↔minor-location: stable settlement id + stable minor-location/path identity established by the current route cache.

Do not key persistent minor routes only by transient object identity.

Payload: current `RoadRoute | null`. Cached `null` is valid and avoids repeated deterministic route failures.

Do not persist signposts, per-chunk clipped corridors, fords or bridges separately; they project from the route result.

## Fingerprint

Fingerprint deterministic inputs that can change route/crossing output:

- raw terrain config used by height/ridge samplers;
- `waterLevel` / relevant region configuration;
- routing options/constants (`gridStep`, elevation/mountain costs, meander/smoothing);
- canonical river/hydrology config;
- ford/bridge classifier and crossing-cost configuration;
- settlement-generation identity that can move endpoints/entrances;
- minor-location identity/config for path routes.

Include stable endpoint facts in key/fingerprint where necessary so moved settlement entrances cannot reuse stale geometry.

Algorithm-only changes require namespace-version bump; cache records are never migrated.

## Integration

Keep `findRoute()`/route consumers synchronous. Async IndexedDB work belongs at the cache lifecycle boundary.

Required lifecycle:

1. activate for current seed + fingerprint;
2. hydrate matching routes into existing `routeCache`;
3. route computed while hydrate is in flight wins over older hydrated data;
4. miss runs the canonical current resolver;
5. fresh result enters runtime cache immediately and is queued for async batch persistence;
6. rebuild/new seed clears session cache and invalidates previous hydrate generation;
7. read/write failure is equivalent to a miss.

Use `putCacheRecords()` and `enforceCacheCap()`. Populate only routes requested by ordinary world/gameplay logic; never scan all settlement pairs to warm cache.

## Current route invariants

Cached routes must preserve exactly the same invariants as fresh routes:

- route result owns crossing semantics;
- final polyline and crossing records agree;
- A→B and B→A share the same physical route/crossing ids;
- ford terrain/water projection and bridge presentation consume cached crossings without reclassification;
- no downstream system decides ford vs bridge independently because data came from persistence.

## Relation to settlements-014

`roadNetwork.ts` continues to resolve endpoints through `settlementPlanCache`. A persistent route is not a substitute source for settlement position/layout.

`settlements-014` is useful but not a hard prerequisite: regenerated settlement definitions can still produce the same fingerprint/route identity.

## Non-goals

- Persisting roads in `SaveData`.
- Precomputing all route pairs.
- Persisting per-chunk road corridor clipping.
- Moving A* to another worker.
- Changing routing/crossing policy defined by `world-terrain-023`.
- Making bridge/ford existence mutable settlement state.

## Tests

Cover:

1. canonical `RoadRoute` round-trip including crossings;
2. cached `null`;
3. A→B/B→A persistent identity symmetry;
4. same seed/fingerprint hit avoids A*;
5. different seed or terrain/river/routing fingerprint misses;
6. endpoint/entrance change cannot reuse stale route;
7. version mismatch misses;
8. hydrated crossings equal fresh route crossings/final polyline;
9. in-flight hydrate cannot overwrite newly computed route;
10. persistence failure falls back to A*;
11. eviction changes only performance.

## Verification

Run:

```text
pnpm test
pnpm typecheck
pnpm build
```

Browser verification is done by the user. Compare the same multi-settlement region cold/warm and verify roads, signposts, fords and bridges are identical.

Technically verified 2026-09-15: focused Vitest on the cache seam, `pnpm test`, `pnpm type-check`, `pnpm build`. Browser/gameplay verification is User.

After implementation update `docs/state/persistence.md` and `docs/state/terrain-and-world-generation.md` (and `water.md` only if its current crossing/cache description becomes stale). Add useful `@domain world-terrain` / `@system worldgen-cache` JSDoc tags.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
