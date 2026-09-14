# Implementation notes: world-terrain-030 persistent cave worldgen cache

**Reviewed:** 2026-09-14  
**Plan:** `docs/plans/world-terrain-030-persistent-cave-worldgen-cache.md`  
**Baseline:** `main` at `c88d72142cdd6b93489786a4fc9d07f579d013e8`

## Main recon findings

### 1. `createWorldBundle()` is already async — do not make `Caves` async

The plan's required prehydrate seam fits the existing lifecycle without changing the public `Caves` API.

`src/app/worldBundle.ts` already awaits several build/preload steps before calling synchronous `createCaves()`. The cave call currently happens after `buildSettlementsManager()` has resolved `homeDef` and before quest/container systems consume `caves.definitions()` / `contentAnchors()`.

Implement the IndexedDB read in `createWorldBundle()` immediately before `createCaves()`:

```text
homeDef resolved
→ build cave-cache fingerprint
→ await best-effort cave cache load
→ createCaves(..., hydrated cache input / cache sink)
→ quest/fauna/container consumers continue synchronously
```

Do not make `createCaves()` return a promise and do not make gameplay queries wait on storage. The cache read belongs to the already-async composition root.

Relevant code:

- `src/app/worldBundle.ts::createWorldBundle()`
- `src/world/createCaves.ts::createCaves()`

### 2. `createCaves()` currently computes exactly the expensive data worth caching

Current eager pipeline inside `createCaves()`:

```text
pickLargeCaveSites()
→ assignCaveArchetypes(seed, sites, buildTopology)
   → buildProductionCaveTopology(...)
→ for each accepted cave:
   dungeon: buildDungeonHeightfieldWithPool(...)
   other:   buildCaveHeightfieldRepresentation(...)
→ resolveCaveContentAnchors(...)
→ topologyToCaveDefinition(...)
→ dungeonChambersFromTopology(...)
```

Only presentation is lazy/streamed. `CaveTopology`, retained `CaveHeightfieldRepresentation`, anchors and dungeon-pool contract must exist up front because gameplay and quest systems query them independently of presentation distance.

The existing boot marks `cave.topology` and `cave.heightfield` are the correct before/after performance signals. Preserve them; a warm hit should make these sections mostly reconstruction/validation work rather than generation.

### 3. Persist existing domain types; do not introduce cache-only cave models

The main cache payload types are already structured-clone friendly:

- `src/world/caves/caveTopology.ts::CaveTopology`
  - plain objects/arrays/numbers/strings only;
  - no Three.js values, Maps, Sets or functions.
- `src/world/caves/caveHeightfieldRepresentation.ts::CaveHeightfieldRepresentation`
  - plain metadata + `Float32Array` fields `floorY`, `ceilY`, `surfaceY`, `coreT`;
  - typed arrays should be stored directly through IndexedDB structured clone.
- `src/world/caves/caveContentAnchors.ts::CaveContentAnchor`
  - plain semantic placement records.
- `src/world/caves/caveUndergroundPool.ts::CaveUndergroundPool`
  - plain data; its nested `WaterSource` from `src/world/WaterSource.ts` is also data-only.

Do not serialize:

- `walkSurfaceAt` closures;
- Three.js presentation/material objects;
- streaming controller/queues;
- hysteresis/query state;
- `PointLightBudget` state;
- interior-rock presentation data unless later profiling proves it materially matters.

`CaveDefinition` should remain derived via `topologyToCaveDefinition(topology)`. `DungeonChamber[]` should remain derived via `dungeonChambersFromTopology(topology)` unless profiling later proves that tiny derivation relevant.

### 4. Keep the cache adapter cave-owned; reuse `worldgenCacheDb.ts` unchanged

Create a focused module, preferably:

`src/world/caves/caveWorldgenCache.ts`

It should own:

- namespace/version constants;
- cache record payload types;
- fingerprint creation;
- best-effort load/validation;
- batch writes and bounded cleanup;
- subkeys (`manifest`, `cave:<caveId>`).

Reuse:

- `cacheKey()`
- `listCacheRecords()`
- `putCacheRecords()`
- `enforceCacheCap()`

from `src/persistence/worldgenCacheDb.ts`.

Do not add a new IndexedDB store, `SaveData` field, migration chain or cave-specific persistence database.

### 5. One manifest + one record per accepted cave is the correct granularity

Recommended payloads:

```ts
type CaveManifestPayload = {
  accepted: readonly {
    archetype: CaveArchetype
    topology: CaveTopology
  }[]
}

type CaveDerivedPayload = {
  caveId: string
  heightfield: CaveHeightfieldRepresentation
  contentAnchors: readonly CaveContentAnchor[]
  undergroundPool: CaveUndergroundPool | null
}
```

Subkeys:

```text
manifest
cave:<caveId>
```

Why this split matters:

- a valid manifest skips site picking + archetype/topology generation;
- a single corrupt/missing heightfield does not invalidate every cave;
- writes can regenerate only the missing cave record;
- `caveId` gives a stable integrity cross-check between topology and derived record.

Do not put all heightfields into one large world blob.

### 6. Manifest ordering is semantically relevant

`assignCaveArchetypes()` owns guarantee/fallback ordering (home adventure, dungeon guarantee, per-site rolls). Preserve the accepted list order exactly in the manifest.

On a manifest hit, do not rerun `pickLargeCaveSites()` or `assignCaveArchetypes()` merely to "verify" it — that destroys most of the intended win. Correctness is guarded by namespace version + fingerprint + structural validation.

A malformed manifest is a full manifest miss and should run the normal fresh pipeline.

### 7. Cache-hit reconstruction must rebuild closures and runtime-owned indexes

For every cached topology recreate:

```ts
const walkSurfaceAt = (x, z) =>
  chunkManager.sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
```

Then rebuild the normal `CaveRuntime` shape from cached domain data:

- `archetype`
- `topology`
- `definition = topologyToCaveDefinition(topology)`
- `heightfield`
- reconstructed `walkSurfaceAt`
- cached `contentAnchors`
- `interiorRocks` freshly resolved only when the debug/system toggle enables them
- `dungeonChambers = dungeonChambersFromTopology(topology)`
- cached `undergroundPool`

After that, the existing code should continue unchanged:

- mouth `modifyTerrain(..., 'system')` replay;
- terrain-cutout registration;
- spatial grid construction;
- materials/presentation/streaming setup;
- public `Caves` query methods.

The cached path and fresh path should converge into the same runtime-construction block rather than maintaining two implementations.

### 8. Partial-hit behaviour should be per cave, not all-or-nothing

Load algorithm:

1. filter `caves-v2` records by current version + fingerprint;
2. validate `manifest`;
3. if manifest is valid, build a lookup of `cave:<caveId>` records;
4. for each manifest entry:
   - valid derived payload → reuse;
   - missing/invalid derived payload → rebuild only that cave from cached topology and `walkSurfaceAt`;
5. batch-write newly rebuilt cave records.

Important dungeon case: if a cached dungeon topology is valid but its derived record is missing, use the existing `buildDungeonHeightfieldWithPool(topology, walkSurfaceAt)` path. If that unexpectedly returns `null`, treat this as stale/incompatible cache data and fall back to a full fresh cave generation pass rather than silently dropping that cave and changing world identity.

Likewise, a non-dungeon missing record rebuilds with `buildCaveHeightfieldRepresentation()` and `resolveCaveContentAnchors()`.

### 9. Structural validation must be explicit and cheap

Do not trust IndexedDB payload shape just because TypeScript says it is typed.

At minimum validate:

#### Manifest

- payload is object with `accepted` array;
- each archetype is a known `CaveArchetype`;
- each topology has non-empty stable `caveId`;
- topology `seed` matches current world seed;
- entrance/nodes/segments/features are arrays/data with finite numeric coordinates where consumed;
- cave ids are unique.

#### Heightfield

- `heightfield.caveId === topology.caveId`;
- `heightfield.seed === topology.seed`;
- `nx`/`nz` positive integers;
- `nx * nz` matches all four typed-array lengths;
- `floorY`, `ceilY`, `surfaceY`, `coreT` are `Float32Array`;
- `cellSize`, origin/bounds/minClearance are finite and sane;
- cached entrance identity/coordinates agree with topology entrance.

#### Anchors/pool

- every anchor `caveId` matches the owning cave;
- anchor roles are members of `CAVE_CONTENT_ANCHOR_ROLES`;
- ids are unique within the cave;
- dungeon pool, if present, has matching `caveId` and finite numeric geometry;
- non-dungeon caves must not reuse a cached dungeon pool.

Invalid record = miss. Never throw into world creation because of disposable cache corruption.

### 10. Fingerprint: use full world terrain params plus cave-specific generation inputs

`rawSampleParamsFromWorld(config)` is already the canonical conversion from `WorldConfig` to deterministic raw terrain sampler inputs and is already imported/used by `worldBundle.ts`.

Use it as the terrain component of the cave fingerprint instead of manually copying selected terrain fields.

The fingerprint also needs inputs that are not inside `RawSampleParams` but affect cave identity/result:

- effective home footprint radius passed to `createCaves()` (`villageSizeConfig(homeDef.size).footprintRadius`);
- `config.terrain.region.coastThreshold` (already inside region today, but harmless to include explicitly only if the helper contract is clearer without duplication);
- cave-generation algorithm/version identity handled primarily through namespace version;
- road/village exclusion behaviour that affects `pickLargeCaveSites()`.

Important current-code observation: cave siting calls `chunkManager.roadCorridorsNear()`. Those roads are deterministic but are not part of `RawSampleParams`. Do not build an enormous fingerprint by enumerating all road geometry. Instead treat changes to road-generation semantics used by cave siting as a required `CAVES_V2_VERSION` bump. Document this beside the version constant.

Likewise, topology recipe constants, archetype assignment rules, mouth geometry, heightfield config, dungeon-pool rules and content-anchor algorithms should invalidate through the cave namespace version. The fingerprint should capture runtime configuration inputs; the version captures code/algorithm identity.

### 11. Do not copy the fingerprint helper a third time

Current code already has near-identical private `stableStringify()` + `hashString()` implementations in:

- `locationsCoarseCache.ts`
- `abandonedCemeteryCache.ts`

For this plan, extract the generic stable fingerprint primitive to a small persistence/shared helper (for example `src/persistence/worldgenFingerprint.ts`) and have the new cave adapter use it. If the implementation can safely update the two existing callers without broad refactoring, point them at the helper too; otherwise at minimum do not add a third duplicated implementation.

This is directly in scope because namespace fingerprints are the core correctness guard of the persistent worldgen cache.

### 12. Cache reads may block world construction; cache writes should not

A warm cache only helps if the read completes before generation, so awaiting the initial `listCacheRecords()` in `createWorldBundle()` is intentional.

Writes should be best-effort and must not extend the critical path after fresh generation. `putCacheRecords()` already swallows persistence failures; schedule the batch without making cave availability depend on it.

There are only about the accepted world cave count worth of records, so no debounce machinery like coarse location tiles is needed. One manifest + generated/missing cave records can be one bounded batch.

Use `enforceCacheCap()` with a small, generous per-seed namespace cap sufficient for manifest + all accepted caves plus a little stale-version/fingerprint churn. The exact cap can be close to tens of records, not thousands.

### 13. Be careful with `lastAccessedAt`

`listCacheRecords()` does not update access timestamps. Existing worldgen caches currently use `lastAccessedAt` mainly for write-time cleanup.

Do not add per-load write transactions merely to refresh timestamps unless necessary. The cave cache is tiny and version/fingerprint misses are harmless. Prefer keeping the hot-path read simple; newly written/rebuilt records receive `Date.now()`.

### 14. Existing tests provide useful parity fixtures — reuse them

High-value existing test surfaces include:

- `src/world/createCaves.archetype.test.ts`
- `src/world/createCaves.contentAnchors.test.ts`
- cave heightfield query/representation tests
- dungeon pool tests
- cave topology/archetype tests

Add focused cache tests rather than duplicating broad cave tests.

Recommended new tests around `caveWorldgenCache.ts` / integration seam:

1. typed-array IndexedDB/adapter round-trip preserves `Float32Array` types and values;
2. wrong fingerprint/version is ignored;
3. malformed manifest triggers full fresh path;
4. manifest hit + one missing cave record rebuilds only that cave;
5. malformed heightfield dimensions regenerate only that cave;
6. fresh vs cached path produces equal `definitions()` and `contentAnchors()`;
7. dungeon pool parity on cached vs fresh path;
8. representative `queryGround` / `occupancyAt` values match fresh generation;
9. cached path still calls system mouth modifications and terrain-cutout registration;
10. storage read/write failure leaves normal generation fully functional.

Prefer dependency injection into the cache adapter for storage functions in unit tests over requiring real browser IndexedDB in every cave test.

### 15. Preserve direct `createCaves()` tests and debug callers

Several tests call `createCaves(scene, fakeChunkManager(), ...)` directly and expect a synchronous `Caves` result.

Do not force all those callers through IndexedDB.

The smallest compatible API is an optional final options argument, conceptually:

```ts
type CreateCavesOptions = {
  hydratedWorldgen?: CaveWorldgenSnapshot | null
  onWorldgenBuilt?: (snapshot: CaveWorldgenSnapshot) => void
}
```

Exact names may differ, but keep default behaviour identical: no options means fully fresh synchronous generation as today.

Alternatively pass a narrow pre-resolved cache object with synchronous lookup methods. Do not pass persistence APIs/IndexedDB handles into `createCaves()`.

### 16. The cache sink should receive immutable snapshots, not live mutable runtime objects

Most cave worldgen structures are treated as immutable after creation, but the persistence boundary should still be explicit.

Build cache payloads from the generated canonical data at the moment generation completes. Do not hand the persistence module maps, runtime closures, materials or the mutable `v2ByCaveId` container.

IndexedDB structured clone happens at `store.put()`, but the cache adapter should expose plain payloads so ownership remains obvious.

### 17. Do not accidentally persist quest/content state

`contentAnchors` are safe because they are deterministic world definitions. The objects later materialized at those anchors are not.

Do not cache:

- quest reservation/claim state;
- `WorldGeneratedContainers` state;
- whether a chest has been opened/looted;
- persistent fauna occupants;
- discovery/navigation state;
- adventure content policy outcome if it belongs to a separate deterministic consumer and is not part of `createCaves()`'s retained canonical runtime.

The existing world-bundle code should keep resolving those systems from the reconstructed `Caves` API exactly as before.

### 18. Documentation updates after implementation

Update current-state docs, not just the plan:

- `docs/state/persistence.md`
  - worldgen cache namespace list is currently exactly two namespaces and will become stale;
  - state that cave topology/heightfields remain deterministic reconstruction with optional disposable persistent acceleration.
- `docs/state/terrain-and-world-generation.md`
  - cave retained worldgen can now hydrate from persistent cache;
  - presentation still streams normally;
  - core terrain/hydrology semantics remain unchanged.

Do not describe the cave cache as gameplay persistence or as an authority over cave identity.

## Suggested implementation order

1. Extract/reuse stable worldgen fingerprint helper.
2. Add `caveWorldgenCache.ts` payloads, version/fingerprint and validators.
3. Add best-effort preload/read in `createWorldBundle()` after `homeDef` is known and before `createCaves()`.
4. Add optional pre-resolved cache seam to synchronous `createCaves()`.
5. Refactor `createCaves()` so cached/fresh data converge before ordinary runtime construction.
6. Implement per-cave fallback and async batch write of generated records.
7. Add focused cache/integration parity tests.
8. Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
9. Update state docs.

## Guardrails

- Cache failure must never make world creation fail.
- Do not change cave placement, topology, archetype guarantees or content-anchor rules as part of this optimization.
- Do not create a second cave representation.
- Do not cache Three.js/runtime presentation state.
- Do not make `Caves` methods async.
- Do not migrate cache records; version/fingerprint mismatch means miss.
- Do not use loaded-chunk state to validate/rebuild cave identity; retain deterministic analytic sampler behaviour.
- Keep mouth system terrain modifications replayed every `WorldBundle` build; they remain derived system effects, not cached mutable terrain state.
- Add/retain useful JSDoc with `@domain world-terrain` and `@system worldgen-cache` on architectural cache seams.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
