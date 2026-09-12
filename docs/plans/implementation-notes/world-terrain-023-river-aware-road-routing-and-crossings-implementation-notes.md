# Implementation notes: world-terrain-023 — river-aware road routing and canonical crossings

## Purpose

These notes capture the focused recon needed to implement `world-terrain-023` without repeating broad repository discovery.

Current code is authoritative. Re-check touched symbols before editing because `world-terrain-010` is still in progress.

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

Important current behaviour:

- `routeCache` is module-local and keyed by sorted pair/location ids.
- A* has `gridStep = 9`, an envelope margin of `gridStep * 5`, 8-neighbour movement, hard rejection only for sampled terrain below `waterLevel + 0.5`, and continuous mountain/elevation costs.
- River geometry is not part of the search today.
- `findRoute()` reconstructs the A* chain, then runs `meanderRoute()`, then `smoothProfile()`.
- All road consumers share the same route cache; preserve this single-route-source property when the cache value becomes richer.

Do not add a second road graph or bridge planner.

## Canonical analytical river source

`src/terrain/riverQuery.ts`

`RiverQuery.segmentsNear(x, z, size)` is the correct pre-streaming lookup. It computes through the same pure river-tile path as production river carving and water rendering.

Do not use `riverTileCache.ts` for route planning: that cache is reference-counted to loaded chunks and has the wrong lifetime.

`createRiverQuery()` internally keeps up to 64 tiles and is deterministic for fixed `RawSampleParams`.

### World-scoped registration already exists

`src/settlement/settlementPlanCache.ts`

- `setSettlementRiverQuery(query)` stores the analytical river query used while resolving settlement defs.
- `ChunkManager` currently creates/registers that query during world construction.

`RoadNetworkContext` is constructed in at least:

- `src/terrain/chunkManager.ts`
- `src/settlement/SettlementsManager.ts`

This matters because whichever caller resolves a route first populates `routeCache`. After this plan both contexts must see equivalent river data; otherwise caller order could become worldgen-significant.

Prefer sharing the already world-scoped analytical query or an equivalent narrow callback over configuring a second road-specific hydrology path.

## River channel facts available to routing

`src/terrain/riverNetwork.ts`

`riverChannelSegmentsNear()` emits `RiverChannelSegment` derived from canonical meandered/smoothed river chains.

At each endpoint the segment carries:

- centerline X/Z,
- `waterHalfWidth`,
- `channelHalfWidth`,
- `waterH`,
- `bedH`.

The values are derived from flow accumulation through:

- `flowFactor()`
- `widthFromAccumulation()`
- `exposedBankFromFlow()`
- `submergedDepthFromFlow()`

Canonical river invariants from the current implementation:

```text
bedY < waterY < bankTopY
waterWidth < channelWidth
```

Use interpolation at the actual road/river intersection. Do not classify from terrain elevation alone.

## Existing ford implementation

`src/terrain/riverFord.ts`

Current constants/behaviour:

- full ford up to water width 6 m,
- smooth fade from 6 to 9 m,
- no ford at 9 m and above,
- `FORD_WATER_DEPTH = 0.12`.

Current functions:

- `fordStrength(roadFalloff, waterWidth)`
- `fordBedHeight(bedH, waterH, ford)`

The width gate currently acts as an implicit crossing decision inside terrain shaping. That is the piece that must stop being authoritative.

Keep the bed-shaping maths, but move ford-vs-bridge policy to one road/river crossing evaluator. Terrain should receive an explicit ford influence from the route result.

Depth must join width in the route classifier so a narrow but deep channel cannot be declared safely fordable just because it fits under the old width threshold.

## Terrain stage ordering

`src/terrain/chunkHeightmap.ts`

Relevant ordering is intentional:

```text
1. regional smoothing
2. road/path/clearing corridor shaping
3. river channel carving
```

`applyRiverChannel()` currently receives the stage-2 road falloff and calls the ford helpers while constructing the channel candidate.

Preserve this ordering.

For fords:

- stage 3 should use an explicit canonical ford crossing influence,
- only declared fords may raise the bed.

For bridges:

- keep the river carve natural beneath the bridge,
- prevent stage-2 road shaping from building a terrain berm across the bridge span; clip/mask the road corridor height effect through the span or split its projection around the span.

Do not introduce runtime terrain deformation.

## Road corridor projection

`roadNetwork.ts::segmentsNear()` converts cached `RoadSegment`s into worker-safe `RoadCorridorSegment[]` using the region road/path half-width, height strength and tint strength.

This is the natural projection seam for terrain work.

Likely implementation shape:

- route result retains semantic crossings,
- nearby-query code projects compact crossing records alongside corridor segments,
- chunk params carry only numeric data needed by the worker,
- `chunkHeightmap.ts` consumes those projections without re-running river classification.

Avoid embedding Three.js/runtime object state in the route result.

## Critical post-processing issue: meander

`findRoute()` currently does:

```text
A* grid chain
→ meanderRoute()
→ smoothProfile()
```

A river-aware A* alone is insufficient because `meanderRoute()` moves interior X/Z positions after the crossing cost was chosen.

The implementation must preserve crossing topology across this step.

Recommended concrete order:

1. During A* edge evaluation, detect/cost river crossings.
2. Reconstruct selected edges.
3. Re-resolve the selected edge crossings exactly and insert stable crossing anchors into the route geometry.
4. Mark crossing anchors (and, if needed, immediately adjacent approach points) as locked against lateral meander.
5. Meander only unconstrained points.
6. Run final intersection validation against canonical river segments.
7. Reject/re-route deterministically if final intersections do not bijectively match the declared crossing records.
8. Run `smoothProfile()` after the X/Z crossing geometry is fixed.

Do not rely on “meander amplitude is only 2 m” as a correctness argument; narrow streams and bank widths are of the same order.

## Edge-based river detection

Node tests are insufficient because `gridStep = 9` can leap over a river while both nodes remain dry.

Evaluate each candidate A* edge against river segments.

For performance, fetch canonical river segments once for the route-search envelope rather than calling `RiverQuery.segmentsNear()` for every A* neighbor expansion.

`RiverQuery` accepts a square centered query. Build a square covering the existing A* rectangle plus enough channel reach/epsilon to avoid dropping a segment whose water/channel footprint touches an edge near the query boundary.

Then perform a local geometric test for each A* edge.

The test must reason about the river **water/channel footprint**, not just exact centerline-line intersection; diagonal/tangent cases near the water edge should not slip through.

Use existing math helpers such as `projectOntoSegment` where suitable rather than duplicating segment projection maths.

## Crossing cost policy

Keep the existing A* base cost intact for non-river steps:

```text
step distance
+ mountain ridge multiplier
+ elevation delta cost
```

A crossing edge adds a deterministic infrastructure cost.

The cost should be continuous enough to rank candidate locations:

- narrower/shallower ford cheaper,
- wider/deeper ford candidate more expensive,
- bridge significantly more expensive than a good ford,
- excessive bridge span infeasible/hard reject.

Do not let a small stream become an enormous detour just because “river = big constant penalty”.

Do not let a bridge be free enough that A* ignores nearby fords.

Keep tuning constants near the canonical crossing evaluator, not scattered between routing and terrain code.

## Canonical crossing result

Use one road-owned result object, not separate ford and bridge discovery passes.

A useful shape is conceptually:

```ts
type RoadRoute = {
  points: RoutePoint[]
  segments: RoadSegment[]
  crossings: RoadRiverCrossing[]
}
```

Each crossing needs enough stable data to project terrain and bridge specs without asking “what kind is this?” again.

Recommended facts:

- stable id,
- route key / ordinal if useful for debugging,
- kind `ford | bridge`,
- world X/Z,
- road direction/yaw,
- canonical water/channel widths,
- water height,
- natural bed height,
- effective ford bed or parameters to derive it,
- bridge span/approach extent when kind is bridge.

Do not store derived Three.js meshes/colliders in the cache.

Crossing ids should be constructed from deterministic route identity + deterministic crossing ordinal/river geometry, never from array insertion order that can vary with query/cache order.

## Symmetry / route cache

`pairKey(idA, idB)` is order-independent and the first resolver currently fixes the cached route orientation.

Existing consumers already orient cached route points as needed by comparing endpoint distance (for example midpoint signposts).

When adding crossing ids/orientation:

- keep physical crossing identity independent of whether A or B asked first,
- be careful that crossing ordinal does not reverse into a different id when the route is traversed backward,
- canonicalize orientation/order when creating the cached route result.

A simple option is to always compute/cache the route in sorted-id endpoint order and reverse only for consumers that need caller-relative traversal. Verify that this does not alter existing entrance selection semantics before adopting it.

## Fords: effective water depth

Current loose-end mismatch:

- terrain bed is raised by ford shaping,
- canonical `RiverChannelSegment.bedH` remains the natural bed,
- local water sampling can therefore report a deeper water column than the terrain actually has.

Do **not** mutate canonical river hydrology.

Instead centralize an effective-bed helper and use it both in:

- `chunkHeightmap.ts` ford carving,
- `ChunkManager.sampleLocalWater()` (or the helper it delegates to) whenever `(x,z)` lies inside a declared ford influence.

Keep canonical `waterH` unchanged.

This resolves the loose end without making the river network depend on roads.

## Bridges: ownership and lifecycle

No suitable generic mutable structure owner was found.

Do not use:

- `SettlementStructureStateRegistry` — settlement-building condition/repair state,
- `WorldGeneratedContainers` — container-specific,
- `SettlementsManager` as semantic owner — bridges must exist independently of endpoint settlement streaming.

Bridge semantics stay in the deterministic road route result.

For runtime projection, choose the closest existing chunk-attached deterministic world prop/collider pattern during implementation preflight. `ChunkManager` is the correct lifecycle boundary to inspect first because it already:

- requests nearby road corridors for chunk generation,
- owns terrain/chunk attachment/removal,
- owns world collider integration used by player/world movement.

A bridge query should be spatial (`bridgesNear` / `roadStructuresNear`) and return stable numeric specs from the route result. Runtime rendering can then dedup by stable id when a bridge overlaps chunk boundaries.

Do not make bridge existence depend on camera/player presence.

## Bridge geometry constraints

V1 bridge can be visually simple, but topology must be real.

At minimum derive:

- center = canonical crossing point,
- yaw = road direction through crossing,
- span = channel/water width + bounded bank/abutment clearance,
- deck Y = approach-road profile high enough to stay above canonical water with clearance,
- width = compatible with road corridor width,
- collider/walkable deck aligned to the visual deck.

Do not flatten the river to make the bridge walkable.

If existing NPC movement samples only terrain Y and ignores bridge colliders/ground surfaces on long-range paths, treat that as a concrete integration point to solve in this plan rather than adding an invisible terrain causeway. Check current movement ground/collider seams during implementation preflight.

## Minor-location paths

`routeToMinorLocation()` uses the same route cache and `findRoute()` as inter-settlement roads, with `kind = 'path'` only applied when segments are produced.

Therefore crossing policy should know the route kind at or before classification if road/path policy differs.

Prefer V1 rule:

- `road`: ford or bridge,
- `path`: ford if safe, otherwise reroute/fail,

unless current dock/path generation proves a small bridge is necessary. This avoids introducing bridge tiers now while still keeping one classifier/evaluator.

If implemented, pass route kind into the evaluator; do not fork a second path-river algorithm.

## Persistence and worldgen cache

Current regional route cache is in-memory only and cleared by `clearRoadNetworkCaches()`.

No SaveData field owns roads/fords/bridges.

Expected V1 persistence action: none.

Before implementation finishes, re-check `world-015` persistent worldgen-cache code for any namespace that now stores settlement/road route output. If none, do not add one and do not bump `CURRENT_SAVE_VERSION`.

If such a cache has appeared, bump only its relevant namespace/fingerprint because route output changes for identical seeds after river-aware routing.

## Tests to create/extend

### `roadNetwork` / crossing geometry

Cover with synthetic samplers + a deterministic fake/narrow `RiverQuery` where possible; do not depend on expensive full-world generation for every unit test.

Required cases:

- 9 m step crossing a <9 m river with dry endpoints,
- ford chosen for narrow/shallow crossing,
- nearby ford preferred over wide bridge,
- wide/deep crossing yields bridge or reroute/null, never naked road,
- infeasible bridge span rejected,
- meander cannot create/remove undeclared crossing,
- route A↔B cache symmetry,
- same seed/context repeated equality,
- cache clear prevents seed leakage.

### terrain / water

- arbitrary road/rive overlap without explicit `ford` no longer alters bed,
- declared ford raises bed with bounded `FORD_WATER_DEPTH`,
- water height unchanged,
- local water effective depth matches shaped bed,
- bridge keeps natural river carve beneath span,
- chunk-boundary projection continuity.

### bridge specs

Keep spec derivation pure and test without Three.js where possible:

- stable id,
- stable position/yaw/span,
- spatial query/dedup around chunk boundaries.

## Documentation after implementation

Update the documents that own current state:

- `docs/state/water.md`
- `docs/state/terrain-and-world-generation.md`
- `docs/STATE.md` only if its short summary needs the new road-crossing capability
- plan status + implementation notes findings if implementation diverges

Remove the two covered entries from `docs/plans/LOOSE-ENDS.md` once the implementation actually fixes them; the plan itself may remove/mark them as planned only if repository convention treats a dedicated plan as sufficient.

Do not duplicate detailed crossing rules into multiple state docs.

## Suggested implementation order

1. Add pure crossing geometry/classifier + tests.
2. Extend route result/cache and feed `RiverQuery` into every road context.
3. Add edge-aware river cost to A*.
4. Lock/materialize crossing anchors through meander + final invariant validation.
5. Project explicit ford records into chunk terrain; remove implicit overlap classification.
6. Fix effective ford bed in local water sampling.
7. Add bridge spec derivation and chunk/world runtime projection + collider/walkability.
8. Mask road terrain shaping through bridge spans.
9. Add integration/topology tests and update state docs.

This order keeps the semantic owner stable before adding presentation.

## Guardrails

- No renderer-only bridge/ford classification.
- No second river representation.
- No per-frame intersection checks.
- No separate bridge planner.
- No settlement-owned bridge state.
- No SaveData bridge list in V1.
- No fake terrain causeway under a bridge.
- No uncontrolled RNG.
- No caller-order-dependent route result.
- Preserve existing road/signpost/minor-location consumers through the same route cache.
