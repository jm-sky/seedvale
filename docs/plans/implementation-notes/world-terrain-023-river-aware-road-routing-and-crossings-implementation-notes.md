# Implementation notes: world-terrain-023 — river-aware road routing and canonical crossings

## Purpose

These notes capture the focused recon needed to implement `world-terrain-023` without repeating broad repository discovery.

The plan has been split: `world-terrain-023` now owns river-aware routing, canonical crossing semantics and ford projection only. Bridge visualization, streaming, terrain masking and traversal moved to `world-terrain-033-road-bridge-projection-and-traversal.md`.

Current code is authoritative. Re-check touched symbols before editing because nearby terrain/worldgen work may continue to evolve.

## Primary ownership

### Regional roads

`src/settlement/roadNetwork.ts`

Key symbols:

- `RoadNetworkContext`
- `RoutePoint`
- `RoadSegment`
- `findRoute()`
- `meanderRoute()`
- `smoothProfile()`
- `roadSegmentsForSettlement()`
- `segmentsNear()`
- `signpostsForSettlement()`
- `midpointSignpostsFor()`
- `routeToMinorLocation()`
- `clearRoadNetworkCaches()`

Current behaviour:

- `routeCache` is module-local and stores `RoadSegment[] | null` under sorted pair/location identities.
- A* uses `gridStep = 9`, margin `gridStep * 5`, 8-neighbour movement, open-water rejection and continuous mountain/elevation costs.
- River geometry is not part of the search.
- `findRoute()` reconstructs the A* chain, then runs `meanderRoute()`, then `smoothProfile()`.
- Roads, signposts and minor-location routes share the same route cache.

Preserve that single-route-source property when the cache value becomes a richer route result. Do not add a second road graph or bridge planner.

## Canonical analytical river source

`src/terrain/riverQuery.ts`

`RiverQuery.segmentsNear(x, z, size)` is the correct pre-streaming river lookup. It computes through the same pure river-tile/channel path as production river carving/rendering.

Do not use `riverTileCache.ts` for route planning: that cache is reference-counted to loaded chunks and has the wrong lifetime.

### Existing world-scoped registration

`src/settlement/settlementPlanCache.ts` already exposes `setSettlementRiverQuery(query)`. `ChunkManager` currently creates/registers a `createRiverQuery(fallbackParams)` during world construction.

`RoadNetworkContext` is constructed in at least:

- `src/terrain/chunkManager.ts`,
- `src/settlement/SettlementsManager.ts`.

Whichever caller resolves a route first populates `routeCache`; after this plan both contexts must see equivalent canonical river data or caller order becomes worldgen-significant.

Prefer sharing the already world-scoped analytical query or a narrow equivalent callback over independently configuring road hydrology.

## River facts available to routing

`RiverChannelSegment` from the terrain river pipeline carries endpoint values for:

- centerline X/Z,
- `waterHalfWidth`,
- `channelHalfWidth`,
- `waterH`,
- `bedH`.

Interpolate these at the actual crossing point. Do not classify from terrain elevation alone.

## Edge-based river detection

Node tests are insufficient because a 9 m A* step can cross a narrower river while both endpoints remain dry.

Evaluate candidate A* **edges** against canonical river footprints.

For performance:

1. build the existing bounded A* search envelope,
2. issue one square `RiverQuery.segmentsNear()` query large enough to cover it plus channel reach/epsilon,
3. reuse that local segment set during neighbor expansion.

Do not call hydrology generation/query independently for every neighbor.

The geometric test must account for water/channel footprint, not only exact centerline-line intersection; tangent/diagonal cases near a bank must not become naked crossings.

Reuse existing geometry helpers such as `projectOntoSegment` where they fit instead of duplicating projection maths.

## One crossing evaluator

The current `src/terrain/riverFord.ts` is terrain-oriented and locally decides ford strength from arbitrary road overlap + width. That cannot remain the semantic classifier.

Create one pure road↔river evaluator, preferably a focused `roadRiverCrossing.ts` if it keeps ownership clear.

Inputs should be canonical crossing facts plus route kind/approach facts as needed. Outputs must be sufficient for A* to distinguish:

- safe ford,
- bridge candidate,
- unsupported/infeasible crossing.

Ford policy should reuse current production tuning as guidance:

- full ford historically through water width 6 m,
- fades to none by 9 m,
- shaped target water depth is `FORD_WATER_DEPTH = 0.12`.

But width alone is insufficient: depth must prevent a narrow/deep channel from becoming a ford.

Bridge feasibility/cost stays in `023` because routing must know whether a crossing may be selected. Bridge runtime projection does not.

Keep all thresholds/cost policy near this evaluator rather than scattering them through A*, terrain and rendering.

## Crossing cost policy

Preserve the existing base A* cost for non-river steps:

```text
step distance
+ mountain ridge cost
+ elevation delta cost
```

A crossing edge adds deterministic infrastructure cost.

Expected ranking:

- narrow/shallow ford = low/moderate cost,
- increasingly marginal ford = higher cost,
- bridge = significantly more expensive than a good ford,
- excessive/unsupported bridge span/geometry = hard reject.

This lets a nearby natural ford beat an unnecessary bridge without making every small stream cause a huge detour.

The bridge cost is only a routing semantic here; do not instantiate bridge geometry in `023`.

## Canonical route result

Replace `routeCache`'s raw segment payload with one road-owned result carrying geometry and crossing records, conceptually:

```ts
type RoadRoute = {
  points: RoutePoint[]
  segments: RoadSegment[]
  crossings: RoadRiverCrossing[]
}
```

Each crossing needs stable semantic data, not runtime presentation state:

- stable id,
- kind `ford | bridge`,
- world X/Z,
- road direction/yaw,
- canonical water width,
- canonical channel width,
- canonical water height,
- natural bed height,
- bridge-feasibility facts only if needed downstream and already used by routing.

Do not store `THREE.Object3D`, chunk ownership, colliders or bridge runtime handles in this result.

`world-terrain-033` consumes `kind = 'bridge'` from this same record. If 029 later needs another deterministic semantic fact, extend this contract rather than letting it rediscover crossings.

## Symmetry / route cache

`pairKey(idA, idB)` is order-independent while current cache orientation depends on whichever side resolved first. Existing consumers compensate by checking endpoint distance.

When crossing identity is added:

- physical crossing id must not depend on A→B vs B→A lookup,
- crossing ordinal must not reverse into a different id,
- cache population order must not change route/crossing semantics.

Canonicalizing computation orientation by sorted endpoint identity is a reasonable option, but verify it does not alter current entrance selection semantics before adopting it.

## Critical post-processing issue: meander

Current route order is:

```text
A* grid chain
→ meanderRoute()
→ smoothProfile()
```

A river-aware A* alone is insufficient because `meanderRoute()` changes interior X/Z after crossing costs were chosen.

Recommended implementation order for selected route geometry:

1. detect/cost crossings during A* edge evaluation,
2. reconstruct selected edges,
3. resolve selected crossings exactly and insert stable crossing anchors,
4. lock crossing anchors and, if necessary, immediate approach points against lateral meander,
5. meander only unconstrained points,
6. run final canonical-river intersection validation,
7. reject/re-route deterministically if final intersections do not bijectively match crossing records,
8. run `smoothProfile()` after X/Z topology is fixed.

Do not rely on the small meander amplitude as a correctness argument; it is comparable to narrow stream/bank widths.

## Minor-location path rule

`routeToMinorLocation()` uses the same route search/cache as inter-settlement roads, but produces `kind = 'path'` segments.

The plan now resolves the V1 policy explicitly:

- `road`: may use `ford` or `bridge`,
- `path`: safe ford only; a bridge-required edge is rejected so routing detours or fails.

Pass route kind into the canonical evaluator/cost policy where necessary. Do not fork a separate path-river algorithm.

## Existing ford implementation to reuse

`src/terrain/riverFord.ts`

Current functions:

- `fordStrength(roadFalloff, waterWidth)`,
- `fordBedHeight(bedH, waterH, ford)`.

After `023`, arbitrary road overlap must no longer decide whether a ford exists.

Keep/rework the bed profile maths so it consumes an explicit canonical ford influence. Width/depth classification belongs to the crossing evaluator.

`FORD_WATER_DEPTH` remains useful as the shaped-depth target unless implementation evidence justifies changing it.

## Terrain stage ordering

`src/terrain/chunkHeightmap.ts` intentionally applies:

```text
1. regional smoothing
2. road/path/clearing shaping
3. river channel carving
```

`riverChannelCandidate()` currently receives stage-2 `roadFalloff` and calls `fordStrength()` / `fordBedHeight()`.

Preserve the ordering, but replace implicit overlap authority with explicit ford projection data.

The worker-safe projection should be analogous to `RoadCorridorSegment[]` / `RiverChannelSegment[]`: compact numeric data relevant to this chunk only.

Do **not** add bridge-span masking here in `023`; that belongs to `world-terrain-033` once canonical bridge records exist.

## Road corridor projection seam

`roadNetwork.ts::segmentsNear()` already turns cached routes into worker-safe `RoadCorridorSegment[]` using road/path widths and strengths.

Use the same general pattern for nearby canonical ford influences:

- route result retains crossing semantics,
- bounded main-thread query projects compact ford data,
- chunk params carry only numeric worker-safe values,
- `chunkHeightmap.ts` consumes projection without re-running classification.

Avoid Three.js/runtime objects in terrain worker payloads.

## Effective ford water depth

Current mismatch:

- terrain ford raises the carved bed,
- canonical `RiverChannelSegment.bedH` remains natural,
- `src/terrain/waterSample.ts::sampleLocalWater()` reports canonical `waterH - bedH`.

Do not mutate river hydrology.

Centralize an effective-bed helper and use the same calculation in:

- `chunkHeightmap.ts` ford shaping,
- `ChunkManager.sampleLocalWater()` or its river-water helper when the point lies within a declared ford influence.

Canonical `waterH` stays unchanged.

This fixes gameplay/terrain agreement without making river generation depend on roads.

## ChunkManager integration

`src/terrain/chunkManager.ts` already:

- constructs `fallbackParams`,
- calls `setSettlementRiverQuery(createRiverQuery(fallbackParams))`,
- constructs the main `roadCtx`,
- calls `segmentsNear()` while building `ChunkTileParams`,
- owns `sampleLocalWater()` wiring.

Important implementation detail: retain/reuse the analytical river query when wiring `roadCtx`; do not create one query for settlement placement and an unrelated differently configured query for roads.

`paramsFor()` is the natural place to add nearby ford projection data for the worker.

`sampleLocalWater()` is the natural runtime seam for applying the same effective ford bed to physical water queries.

No bridge mesh/collider/ground work belongs here in `023`.

## SettlementsManager integration

`src/settlement/SettlementsManager.ts` also constructs/uses `RoadNetworkContext` for road/signpost behaviour.

Because `routeCache` is shared module state, this context must receive the same canonical river contract as the `ChunkManager` context. Otherwise the first caller to resolve a route could change cached worldgen output.

Do not make `SettlementsManager` own crossing state; it only needs equivalent route-query inputs.

## Persistence / worldgen cache

Current regional route cache is in-memory and cleared by `clearRoadNetworkCaches()`.

No `SaveData` field owns roads/fords/bridges.

Expected V1 persistence action: none.

Before finishing implementation, re-check whether persistent worldgen caching now stores regional road output. If so, update only the existing relevant namespace fingerprint/version because route output for the same seed changes after river-aware routing. Do not add a bridge/ford persistence list.

## Tests to create/extend

### Routing / crossing geometry

Prefer synthetic height/mountain samplers plus a deterministic fake/narrow river query where possible rather than expensive full-world generation for every unit test.

Required cases:

- 9 m edge crosses a <9 m river with dry endpoints and is still detected,
- narrow/shallow crossing yields one `ford`,
- nearby good ford beats a more expensive bridge location,
- wide/deep crossing yields `bridge`, reroute or `null`, never naked road,
- unsupported/excessive bridge geometry is rejected,
- meander cannot create/remove an undeclared crossing,
- A↔B cache symmetry/stable crossing ids,
- identical inputs repeat deeply equal,
- cache clear prevents seed/config leakage,
- minor-location path never emits `bridge`.

### Terrain / water

- arbitrary road×river overlap without explicit ford no longer alters bed,
- declared ford raises bed using bounded profile,
- canonical water height remains unchanged,
- `sampleLocalWater` effective depth matches shaped ford bed,
- ford projection is seam-safe across chunk boundaries.

Do not add bridge visual/traversal/mask tests here; they are `world-terrain-033` scope.

## Suggested implementation order

1. Add pure edge-intersection/crossing evaluator + focused tests.
2. Extend route result/cache and feed canonical river query into every road context.
3. Add edge-aware river costs/feasibility to A* with explicit route kind.
4. Materialize crossing anchors through meander + final topology validation.
5. Project explicit ford records into chunk terrain and remove implicit-overlap classification.
6. Fix effective ford bed in local-water sampling.
7. Add determinism/integration tests and update state docs.

This completes the semantic dependency required by `world-terrain-033` without mixing runtime bridge work back into this plan.

## Documentation after implementation

Update the current-state docs that actually own changed behaviour, likely:

- `docs/state/water.md`,
- `docs/state/terrain-and-world-generation.md`,
- `docs/STATE.md` only if its short summary needs the capability.

Once the implementation truly resolves the corresponding `LOOSE-ENDS.md` entries, remove them according to that file's convention. The bridge-presentation part remains covered by planned `world-terrain-033` until implemented.

Do not duplicate detailed crossing policy across multiple state documents.

## Implementation outcome (2026-09-14)

Implemented as planned. Decisions worth recording for `world-terrain-033`:

- **Crossing authority** is `src/settlement/roadRiverCrossing.ts`: `riverHitsOnEdge()` (edge × water-footprint, with a closest-approach fallback for tangent/near-bank passes), `evaluateRoadRiverCrossing(facts, routeKind)` and `crossingsForPolyline()`. All ford/bridge thresholds and costs live there.
- **Records are derived from the final polyline**, not from the A* chain. A* prices/rejects edges; `findRoute` then inserts exact crossing anchors, locks them plus their approach points against meander, and re-derives `RoadRiverCrossing[]` from the finished geometry. If meander changed the crossing topology, the route deterministically falls back to the anchor-exact (un-meandered) geometry. That is what makes the bijection invariant hold by construction rather than by tolerance.
- **Traversal merging**: two hits belong to one physical crossing exactly when the road between them never leaves the water (`insideWater` midpoint test). This covers both the anchor split and a river wider than the 9 m grid step. The record is anchored at the traversal's midpoint and classified against the widest water it meets.
- **River source** is the existing world-scoped registration: `settlementPlanCache.ts` gained `worldRiverQuery()` next to `setSettlementRiverQuery()`. No `RoadNetworkContext` field was added, so `ChunkManager`'s and `SettlementsManager`'s contexts cannot disagree. Hydrology is queried **once per route** for the whole search envelope.
- **Route orientation is canonicalized** (sorted settlement id first) inside the new `routeBetween()` helper, which also replaced the three duplicated `findRoute` call sites. Crossing ids are `${routeKey}#${ordinal}`.
- **`RoadRoute`** (`points` / `segments` / `kind` / `crossings`) is what `routeCache` now stores. `world-terrain-033` should read `kind === 'bridge'` records from here; `span`, `crossSin`, `angle`, `waterWidth`, `channelWidth`, `waterH` and `naturalBedH` are already on the record.
- **Ford projection**: `roadNetwork.fordsNear()` → `ChunkTileParams.fordProjections` (`FordProjection` = oriented ellipse; `riverFord.ts` keeps only `fordInfluenceAt` / `fordBedHeight` / `FORD_WATER_DEPTH`). `ChunkRecord.fordProjections` carries the same data into `sampleLocalWater()`, so no hot-path route resolution happens. Bridges are deliberately not projected anywhere yet.
- **Worldgen caches**: `CHUNK_TILE_CACHE_VERSION` and `ABANDONED_CEMETERY_VERSION` bumped to 2 (road geometry and ford shaping change for an unchanged seed). No `SaveData` change, no migration.
- `yawToward` moved to `math/segment.ts` (re-exported from `roadNetwork.ts`) so the crossing module could use the same convention without a circular import; `directionFromYaw` is its inverse, used to build ford projections.
- A road crossing a river wider than one A* step is priced on each crossing edge, so a wide bridge is somewhat over-priced. Deterministic, and it only strengthens the intended "prefer a reasonable ford" bias.

## Guardrails

- No second river representation.
- No node-only river detection.
- No renderer/terrain reclassification of ford vs bridge.
- No per-frame road↔river intersection checks.
- No global bridge planner.
- No SaveData bridge/ford list.
- No uncontrolled RNG or caller-order-dependent crossing ids.
- Preserve the shared route cache for roads/signposts/minor-location routes.
- `path` is ford-only in V1; do not introduce path bridge tiers.
- No bridge mesh, streamed runtime, deck ground/collider or bridge-span terrain mask in `023`; those are `world-terrain-033`.
