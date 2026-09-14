# Plan: River-aware road routing and canonical crossings

**Created:** 2026-09-12
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `roads` `terrain` `water`
**Tags:** `roads` `rivers` `fords` `bridges` `worldgen` `determinism`
**Roadmap:** -
**Model:** Opus, Sonnet

## 1. Goal

Make inter-settlement road routing explicitly aware of canonical river channels so every road↔river crossing is a deliberate, deterministic worldgen decision rather than an accidental consequence of terrain elevation.

Target flow:

```text
road route search
→ river intersection awareness
→ evaluate crossing candidate
→ shallow/small channel = ford
→ deep/wide channel = bridge or reroute
→ canonical crossing record
→ ford terrain/water projection here
→ bridge runtime projection in world-terrain-029
```

The route result becomes the single owner of road↔river crossing semantics. Terrain shaping may project a declared ford, and `world-terrain-029` may project a declared bridge, but neither may independently decide whether a crossing exists or what kind it is.

This plan intentionally stops before bridge visualization/traversal. `world-terrain-029-road-bridge-projection-and-traversal.md` depends on the canonical `bridge` crossing produced here.

## 2. Current state verified in code

### Road routing

`src/settlement/roadNetwork.ts` owns the regional road graph and `findRoute()`.

Current A*:

- uses a coarse `gridStep = 9` world-space grid,
- rejects only cells whose sampled terrain is at/below `waterLevel + ROUTE_WATER_CLEARANCE`,
- prices distance, elevation change and mountain ridge,
- has no river/channel input,
- reconstructs the grid chain, then applies `meanderRoute()`, then `smoothProfile()`,
- caches the resulting `RoadSegment[] | null` by deterministic settlement-pair/location key in module-local `routeCache`.

`roadSegmentsForSettlement()`, `signpostsForSettlement()`, `midpointSignpostsFor()` and `routeToMinorLocation()` all reuse that same cache.

A river narrower than the A* grid can therefore be crossed between two dry nodes without being noticed. A larger channel may also be crossed whenever sampled terrain happens not to trigger the open-water reject.

### Canonical river authority

`src/terrain/riverQuery.ts` already provides the correct analytical seam:

```ts
RiverQuery.segmentsNear(x, z, size): RiverChannelSegment[]
```

It is independent of loaded chunks and is built from the same pure river-tile/channel path used by production river carving/rendering. Do not create a second road-only river representation and do not plan routes against `riverTileCache`, whose lifetime is tied to streamed chunks.

`RiverChannelSegment` already carries endpoint values for:

- `waterHalfWidth`,
- `channelHalfWidth`,
- `waterH`,
- `bedH`,
- centerline endpoints.

These facts can be interpolated at an actual road/river intersection.

### Existing ford behaviour

`src/terrain/riverFord.ts` currently turns any road-corridor × river-channel overlap into a terrain ford:

- full ford through water width `<= 6`,
- fades between `6..9`,
- no ford at `>= 9`,
- target ford water depth `0.12 m`.

`src/terrain/chunkHeightmap.ts` applies road/clearing shaping before river carving. `applyRiverChannel()` currently consumes stage-2 `roadFalloff` and locally calls `fordStrength()` / `fordBedHeight()`.

This terrain maths is useful, but its local overlap test must stop being authoritative. After this plan, ford shaping is only a projection of an explicit canonical crossing.

### Existing ford water-depth mismatch

`docs/plans/LOOSE-ENDS.md` notes that ford terrain raises the carved bed while canonical `RiverChannelSegment.waterH/bedH` remains unchanged. `sampleLocalWater()` consequently reports natural river depth rather than the physically shaped ford depth.

Do not mutate canonical hydrology. Derive an effective ford bed from the canonical crossing wherever terrain/gameplay needs the locally modified bed, while keeping canonical `waterH` unchanged.

## 3. Canonical route result

Replace the cache concept “pair → raw road segments” with a route result carrying route geometry and crossing decisions.

Conceptually:

```ts
type RoadRoute = {
  points: RoutePoint[]
  segments: RoadSegment[]
  crossings: RoadRiverCrossing[]
}

type RoadRiverCrossing = {
  id: string
  kind: 'ford' | 'bridge'
  x: number
  z: number
  angle: number
  waterWidth: number
  channelWidth: number
  waterH: number
  naturalBedH: number
}
```

Exact names may follow existing style. Add only facts needed to preserve crossing semantics and support deterministic downstream projection.

Invariants:

1. one physical intersection of the final route polyline has exactly one crossing record,
2. every crossing record corresponds to a real final-polyline intersection,
3. all consumers reuse that record,
4. no terrain/renderer/runtime stage reclassifies `ford` vs `bridge`,
5. crossing identity is stable from deterministic route/river identity, never runtime object identity or caller/iteration order.

`routeCache` should cache this richer result (or `null`) under the existing order-independent pair/location keys. Existing route/signpost/minor-location consumers continue reading geometry from the same cache and must not launch independent route searches.

The canonical `kind = 'bridge'` record is the explicit dependency contract consumed by `world-terrain-029`; this plan does not instantiate it.

## 4. Feed canonical river data into routing

Extend `RoadNetworkContext` with access to the existing analytical river query, directly or through a narrow `segmentsNear` callback.

The same world-scoped river source used by settlement placement must be available to every `RoadNetworkContext` constructor, currently including `src/terrain/chunkManager.ts` and `src/settlement/SettlementsManager.ts`.

Whichever caller resolves a cached route first must see equivalent hydrology; caller order cannot become worldgen-significant.

Prefer sharing the already world-scoped analytical query or an equivalent narrowly injected function. Do not configure an unrelated road-specific hydrology implementation.

## 5. Edge-based river detection in A*

River detection must be **edge-based**, not node-based.

A 9 m A* step can leap across a narrow river while both endpoints are dry. For every candidate A* edge, detect intersection/proximity against canonical river water/channel footprint.

For performance, query canonical river segments once for the bounded route-search envelope and evaluate neighbor edges against that local set. Do not regenerate/query full hydrology per neighbor expansion.

For an edge that does not cross a river footprint, preserve the existing distance + mountain + elevation cost.

For a crossing edge:

1. resolve the actual crossing point against canonical river geometry,
2. interpolate water/channel width, `waterH` and natural `bedH`,
3. classify the candidate once as `ford` or `bridge`, or reject it when no supported crossing is feasible,
4. add deterministic infrastructure cost to the A* edge.

Use continuous cost components where useful so the router can compare nearby crossing locations, but the final infrastructure kind remains discrete.

## 6. One canonical crossing evaluator

Create one pure road↔river crossing evaluator, preferably a focused sibling such as `roadRiverCrossing.ts` if that keeps ownership clearer than `riverFord.ts`.

It must use canonical channel facts, at minimum:

- water width,
- water depth (`waterH - bedH`),
- channel width / approach geometry where needed for bridge feasibility.

Initial policy should reuse production ford tuning rather than invent unrelated thresholds:

- small and shallow channel → ford-capable,
- narrow but deep channel must not become a ford,
- wide/deep channel → bridge candidate,
- excessive/unsupported bridge geometry → reject edge and force reroute/failure.

Move ford-vs-bridge policy out of `riverFord.ts`; that module should retain/provide ford shaping maths but consume an already-declared ford influence.

Bridge feasibility/cost belongs here because A* must compare bridge vs detour/ford before `world-terrain-029` exists. Bridge **presentation and traversal** do not.

Keep V1 deterministic and static. Do not add seasonal/current/weather-dependent crossing availability.

## 7. Crossing-aware route post-processing

`findRoute()` currently applies `meanderRoute()` after A*. This can move the final polyline away from the crossing A* actually priced or create an unpriced new intersection.

Fix this explicitly:

1. detect/cost crossings during A* edge evaluation,
2. reconstruct selected edges,
3. materialize exact crossing anchors into route geometry,
4. lock the crossing anchor and, if necessary, immediate approach points against lateral meander,
5. meander unconstrained points,
6. validate final river intersections against the canonical crossing set,
7. deterministically reject/re-route if the final intersection set is not bijective,
8. run elevation/profile smoothing only after X/Z topology is fixed.

Acceptance invariant:

> Every canonical-river intersection of the final road polyline has exactly one `RoadRiverCrossing`, and every crossing record corresponds to a real final-polyline intersection.

Do not accept “meander is only a few metres” as a correctness shortcut.

## 8. Ford projection and terrain shaping

Change ford terrain logic from:

```text
roadFalloff > 0 + small river overlap
→ terrain locally invents ford
```

into:

```text
canonical RoadRiverCrossing(kind = ford)
→ explicit worker-safe ford influence
→ existing ford bed-profile maths
```

The chunk/worker path receives compact numeric ford projection data only for relevant chunks, analogous to `RoadCorridorSegment[]` / `RiverChannelSegment[]`.

`applyRiverChannel()` may raise the effective bed only inside an explicit ford influence. Incidental road×river overlap without a declared ford must leave the canonical channel natural.

Preserve the current terrain stage order; do not add runtime terrain deformation.

## 9. Effective ford bed and local water

Keep canonical `RiverChannelSegment.waterH` / natural `bedH` as hydrological geometry.

Centralize one pure helper that derives the effective shaped ford bed from canonical river facts plus explicit ford influence.

Use the same helper in:

- terrain carving,
- `ChunkManager.sampleLocalWater()` or its river-water subpath when the sampled point lies inside a declared ford.

This makes gameplay water depth agree with the actual shaped terrain while keeping hydrology road-independent.

Do not modify water height and do not create a second water surface.

## 10. Bridge handoff to world-terrain-029

This plan owns only the semantic bridge decision needed by routing.

For `kind = 'bridge'`, guarantee a stable crossing record with enough canonical facts for `world-terrain-029` to derive the visual/traversal spec without re-running river intersection/classification.

Explicitly out of scope here:

- bridge mesh/GLB/procedural presentation,
- bridge deck ground/collision handling,
- streamed bridge runtime lifecycle,
- bridge-span road-terrain masking,
- runtime chunk dedup/ownership.

Those belong to `world-terrain-029-road-bridge-projection-and-traversal.md`.

Do not add temporary renderer-only bridge logic in this plan.

## 11. Reroute policy

A bridge candidate is not automatically accepted just because a bridge is possible.

A* must compare:

- cheap small/shallow ford,
- bridge infrastructure cost,
- ordinary distance/elevation/mountain cost,
- bounded alternative crossings/detours.

Expected semantic outcomes:

- small/shallow stream on a good route → `ford`,
- nearby better ford beats expensive bridge,
- major but bridge-feasible river with no reasonable ford → `bridge`,
- excessive/unsupported crossing → edge rejected, forcing reroute or route failure.

No global bridge planner is needed.

## 12. Settlement roads vs minor-location paths

Use the same crossing evaluator for all `findRoute()` callers, but make route kind an explicit policy input where infrastructure differs.

V1 rule:

- inter-settlement `road` may choose `ford` or `bridge`,
- settlement→minor-location `path` may use a safe ford only; a bridge-required edge is rejected so the path reroutes or fails.

This avoids silently materializing full road bridges for minor paths and avoids creating bridge tiers. Do not fork a second path-river classifier.

## 13. Determinism and persistence

Crossing decisions remain procedural worldgen state.

- pure function of seed, endpoints, routing config, terrain samplers and canonical river geometry,
- no bridge/ford `SaveData` list,
- no uncontrolled RNG,
- preserve order-independent route-cache identity,
- A→B and B→A reuse/produce the same physical crossing ids,
- `clearRoadNetworkCaches()` clears route/crossing caches on world rebuild/new seed.

If a persistent worldgen-cache namespace stores affected regional route output by implementation time, update only its existing relevant fingerprint/version. Do not add persistence merely for this plan.

## 14. Tests

### Route/crossing topology

Extend `src/settlement/roadNetwork.test.ts` or focused crossing tests:

1. sub-grid river crossing is detected even with dry A* endpoints,
2. shallow/narrow channel yields exactly one `ford`,
3. nearby good ford beats a more expensive bridge location,
4. large/deep river yields `bridge`, reroute or `null` — never naked road,
5. excessive bridge span/geometry rejects the edge,
6. final meandered polyline has the same canonical crossing topology,
7. A→B / B→A share physical crossings and stable ids,
8. repeated identical generation is deeply equal,
9. cache clear prevents seed/config leakage,
10. minor-location `path` never emits a bridge crossing.

### Ford terrain/water integration

Extend `src/terrain/chunkHeightmap.test.ts`, `riverFord.test.ts` and/or focused tests:

1. arbitrary road×river overlap without explicit ford no longer raises bed,
2. explicit ford influence raises bed using the bounded ford profile,
3. canonical `waterH` remains unchanged,
4. local-water depth uses the same effective ford bed as terrain,
5. ford projection is seam-safe across chunk boundaries.

Bridge runtime/terrain-mask tests belong to `world-terrain-029`, not this plan.

## 15. Performance constraints

- Query hydrology once per bounded route-search envelope where practical, not per A* neighbor.
- Keep edge evaluation over a bounded local river-segment set.
- Add a local spatial shortlist only if tests/profiling justify it.
- No per-frame road↔river intersection work.
- Ford lookup during chunk generation must be bounded by nearby canonical crossing projections.
- No worker migration merely for routing; the route search is one-time/cached and currently owns main-thread settlement/worldgen dependencies.

## 16. Files / systems expected to change

Primary:

- `src/settlement/roadNetwork.ts` — richer route result/cache, river-aware A*, route-kind policy, crossing anchors and nearby ford projection.
- focused `src/settlement/roadRiverCrossing.ts` or equivalent if useful — pure intersection/classifier/cost helpers.
- `src/terrain/riverQuery.ts` — likely no semantic change; reuse as analytical source.
- `src/terrain/riverFord.ts` — retain ford profile/effective-bed maths but stop independently deciding crossing kind from arbitrary overlap.
- `src/terrain/chunkHeightmap.ts` — explicit ford influence only; no bridge runtime/mask in this plan.
- `src/terrain/chunkManager.ts` — provide the same analytical river source to road routing and supply ford influence to local-water sampling/terrain params.
- `src/settlement/SettlementsManager.ts` / composition call-sites — ensure all `RoadNetworkContext`s use equivalent canonical river input.

Do not modify settlement structure persistence or implement bridge visuals/traversal here.

Add JSDoc for important new architectural/public crossing functions/types where it improves preflight discovery; use `@domain world-terrain` where appropriate.

## 17. Non-goals

- bridge visualization, streaming, collision or walkable deck — `world-terrain-029`,
- bridge terrain-span masking — `world-terrain-029`,
- player-built bridges,
- bridge damage/repair/decay,
- bridge construction economy,
- bridge quests,
- seasonal/dynamic river discharge,
- global road-network optimization,
- a generic world-structure registry,
- renderer-only exceptions hiding invalid route topology.

## 18. Acceptance criteria

- A final generated road cannot intersect canonical river water without exactly one declared crossing record.
- Small/shallow crossings can become explicit fords.
- Ford-shaped terrain and local water sampling agree on effective shallow depth while canonical hydrology remains unchanged.
- Large/deep bridge-feasible crossings become canonical `bridge` records or the route selects another crossing.
- Unsupported/excessive crossings reroute or fail rather than producing naked road.
- A reasonable nearby ford can beat a bridge through the same A* cost model.
- Final crossing topology survives route meandering/post-processing exactly.
- Minor-location paths never silently request a full bridge in V1.
- Route/crossing output is deterministic across repeated generation, caller order and chunk streaming order.
- The bridge record is sufficient for `world-terrain-029` to project runtime infrastructure without reclassification.
- No save migration is required.

## 19. Verification

Technical verification after implementation:

```text
npx tsc --noEmit
pnpm run test -- roadNetwork
pnpm run test -- riverFord
pnpm run test -- chunkHeightmap
pnpm run lint:fix
```

Use the repository's actual targeted test syntax if it differs; do not broaden to unrelated suites unless failures require it.

Manual/browser verification is performed by the user. For this plan verify at minimum:

- a small stream road crossing produces a visible/usable ford,
- an undeclared incidental road×river overlap does not create a ford,
- local water depth at the ford agrees with shaped terrain,
- a large/deep river no longer gets a naked crossing; until `world-terrain-029` is implemented, a canonical `bridge` decision is allowed to have no bridge presentation yet.

Bridge visual/traversal verification belongs to `world-terrain-029`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**