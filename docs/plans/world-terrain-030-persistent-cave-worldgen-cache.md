# Plan: Persistent cave worldgen cache

**Created:** 2026-09-14
**Status:** `verification needed` 🔍
**Type:** optimization
**Priority:** high · **Effort:** L
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `worldgen` `cache` `caves` `heightfield` `performance`
**Roadmap:** -
**Model:** Opus, Sonnet

## Goal

Persist deterministic Cave V2 topology and retained heightfield data so same-seed reloads/rebuilds do not rebuild every cave from terrain samplers. Cache only derived worldgen data; presentation and mutable gameplay state remain runtime-owned.

## Recon

`src/world/createCaves.ts` currently runs on every world build:

```text
pickLargeCaveSites
→ assignCaveArchetypes / buildProductionCaveTopology
→ per accepted cave: build heightfield (or dungeon heightfield+pool)
→ resolveCaveContentAnchors
→ dungeonChambersFromTopology
→ topologyToCaveDefinition
```

All retained `CaveHeightfieldRepresentation`s are built up front because gameplay queries need them; only mesh/presentation is streamed. `createCaves()` already measures `cave.topology` and `cave.heightfield` separately.

`CaveHeightfieldRepresentation` is the existing canonical structured representation (`floorY`, `ceilY`, `surfaceY`, `coreT` typed arrays plus grid metadata). Reuse it; do not create a cache-specific spatial model.

`walkSurfaceAt` is a function closure and must be reconstructed. Three.js objects, presentation queues, query hysteresis, lights and debug state are not cache payload.

Reuse `worldgenCacheDb.ts`; no `SaveData` field/new store.

## Cache shape

Add a cave-owned adapter such as `src/world/caves/caveWorldgenCache.ts`.

Namespace: `caves-v2`, explicit version.

Use two record kinds instead of one monolithic blob:

- `manifest` → accepted ordered `{ archetype, topology }[]`;
- `cave:<caveId>` → `heightfield`, `contentAnchors`, `undergroundPool`, and only other derived data worth persisting.

Derive cheap `CaveDefinition` again via `topologyToCaveDefinition`. `dungeonChambers` may also be recomputed if cheap. Keep `interiorRocks` outside core payload initially because they are presentation-only/debug-enableable.

Structured clone typed arrays directly; do not JSON-convert them.

## Fingerprint

Cover deterministic inputs affecting siting/topology/heightfield:

- base terrain config/samplers;
- water level/coast threshold;
- home radius/footprint assumptions;
- village exclusion configuration;
- road-generation identity because siting uses `roadCorridorsNear`;
- cave heightfield/config recipe inputs.

Algorithm changes to siting, archetype assignment, topology, heightfield, mouth geometry, dungeon pool or cached anchor rules require namespace-version review/bump.

Do not include presentation quality, player/camera state, quest progress or discovery.

## Critical lifecycle

Hydration must happen **before** `createCaves()`. Starting async IndexedDB work inside today's synchronous function would finish after the expensive work and provide no benefit.

Use async `WorldBundle` construction/rebuild:

```text
resolve cave fingerprint
→ await best-effort cache read
→ createCaves(... optional hydrated snapshot/cache sink)
```

Read failure becomes an empty snapshot and normal generation. Gameplay queries never await IndexedDB.

## Cache-hit reconstruction

On hit still:

- recreate `walkSurfaceAt` from `sampleBaseHeight` + cached entrance;
- rebuild ordinary `CaveRuntime` maps/indexes;
- derive `CaveDefinition` normally;
- replay mouth `modifyTerrain(..., 'system')` discs;
- register terrain cutouts from cached heightfield;
- recreate all presentation/material/streaming state.

Do not cache system terrain modifications themselves.

Support partial hits: manifest hit with a missing/invalid per-cave record rebuilds only that cave's derived data. A bad manifest is a full miss. Cache writes are async/batched and never block gameplay.

Validate cached ids/archetypes, typed-array presence, `nx*nz` lengths and matching `caveId`. Invalid payload regenerates; no migrations.

## Non-goals

- Three.js/GPU/presentation persistence.
- Query-hysteresis persistence.
- Cache-specific topology/heightfield types.
- Warming extra caves.
- Changing cave generation.
- Moving cave generation to workers.
- Persisting quest/loot/discovery consequences.

## Tests

Cover manifest and typed-array round-trip, full/partial hits, seed/fingerprint/version misses, malformed-record fallback, cached-vs-fresh definitions/anchors/pools and representative ground/occupancy parity, mouth cutout replay on hit, and persistence failure fallback.

## Verification

Run:

```text
pnpm test
pnpm typecheck
pnpm build
```

Browser verification is done by the user. Compare cold/warm `createCaves` boot marks; verify topology/heightfield work drops materially and natural/adventure/dungeon behaviour remains unchanged.

After implementation update `docs/state/persistence.md` and `docs/state/terrain-and-world-generation.md`. Add useful `@domain world-terrain` / `@system worldgen-cache` JSDoc tags.

## Implementation

Implemented on `main`.

- `src/persistence/worldgenFingerprint.ts` — the shared `stableStringify` /
  `hashString` / `worldgenFingerprint` primitive; `locationsCoarseCache.ts` and
  `abandonedCemeteryCache.ts` now use it instead of their own copies.
- `src/world/caves/caveWorldgenCache.ts` — `caves-v2` namespace/version,
  `manifest` + `cave:<caveId>` payloads, `caveWorldgenFingerprint()`, explicit
  structural validators, `loadCaveWorldgenSnapshot()` and best-effort batched
  `persistCaveWorldgen()` over the unchanged `worldgenCacheDb.ts`.
- `src/world/createCaves.ts` — optional `CreateCavesOptions`
  (`hydratedWorldgen` / `onWorldgenBuilt`); siting + archetype/topology is now
  lazy so a manifest hit skips it, cached and fresh per-cave data converge into
  one runtime-construction block, and a cached dungeon whose pool can no longer
  be built falls back to a full fresh pass.
- `src/app/worldBundle.ts` — resolves the fingerprint and awaits the cache read
  immediately before `createCaves()`; the write is fire-and-forget.
- `src/world/caves/caveWorldgenCache.test.ts` — round trip, typed-array
  preservation, full/partial hits, malformed manifest/heightfield,
  seed/fingerprint/version misses, mouth-cutout replay on hit and storage-failure
  fallback.

`interiorRocks`, `CaveDefinition` and `DungeonChamber[]` are deliberately not
persisted — the first is presentation-only and debug-gated, the other two are
cheap derivations from the cached topology.

`pnpm test`, `npx tsc --noEmit` and `pnpm build` pass. Browser verification
(cold vs warm `cave.topology` / `cave.heightfield` boot marks, natural /
adventure / dungeon behaviour) is the user's.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
