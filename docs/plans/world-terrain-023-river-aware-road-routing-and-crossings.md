# Plan: River-aware road routing and canonical crossings

**Created:** 2026-09-12
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `roads` `terrain` `water`
**Tags:** `roads` `rivers` `fords` `bridges` `worldgen` `determinism`
**Roadmap:** -
**Model:** Opus, Sonnet

## 1. Goal

Make inter-settlement road routing explicitly aware of canonical river channels so a road crossing is a deliberate, deterministic worldgen decision rather than an accidental consequence of terrain elevation.

Target flow:

```text
road route search
→ river intersection awareness
→ evaluate crossing candidate
→ shallow/small channel = ford
→ deep/wide channel = bridge or reroute
→ one canonical crossing decision
→ terrain/world structures generated from that decision
```

The route result must become the single owner of road↔river crossing semantics. Terrain shaping, water-depth queries and bridge presentation may project that decision, but must not independently decide whether a crossing is a ford or bridge.

## 2. Current state verified in code

### Road routing

`src/settlement/roadNetwork.ts` owns the regional road graph and `findRoute()`.

Current A*:

- uses a coarse `gridStep = 9` world-space grid,
- rejects only cells whose sampled terrain is at/below `waterLevel + ROUTE_WATER_CLEARANCE`,
- prices distance, elevation change and mountain ridge,
- has no river/channel input,
- reconstructs the grid chain, then applies `meanderRoute()`, then `smoothProfile()`,
- caches the resulting `RoadSegment[] | null` by deterministic settlement-pair key in module-local `routeCache`.

`roadSegmentsForSettlement()`, `signpostsForSettlement()`, `midpointSignpostsFor()` and `routeToMinorLocation()` all reuse that same cache.

This means a river narrower than the A* grid can be crossed between two dry nodes without ever being noticed. A wide channel can also be crossed whenever its natural terrain/elevation samples happen not to trip the open-water reject.

### River authority available before chunk streaming

`src/terrain/riverQuery.ts` already provides the correct analytical seam for this work:

```ts
RiverQuery.segmentsNear(x, z, size): RiverChannelSegment[]
```

It is independent of loaded chunks and is built from the same pure `computeRiverTile()` + `riverChannelSegmentsNear()` path used by production river geometry/carving. Do not create a second approximate road-only river representation.

`RiverChannelSegment` already carries endpoint values for:

- `waterHalfWidth`,
- `channelHalfWidth`,
- `waterH`,
- `bedH`,
- centerline endpoints.

Interpolating those values at a road/river intersection is enough to classify a crossing candidate using the canonical channel geometry.

### Existing ford behaviour

`src/terrain/riverFord.ts` currently turns any road-corridor × river-channel overlap into a terrain ford during river carving:

- full ford through water width `<= 6`,
- fades between `6..9`,
- no ford at `>= 9`,
- target ford water depth `0.12 m`.

`src/terrain/chunkHeightmap.ts` applies road/clearing shaping first and river carving afterwards. `applyRiverChannel()` consumes the stage-2 `roadFalloff` and calls `fordStrength()` / `fordBedHeight()`.

This is useful terrain-shaping machinery, but it currently **decides locally from overlap**. After this plan it must become a projection of an already-declared route crossing, not an independent crossing classifier.

### Existing mismatch to resolve here

`docs/plans/LOOSE-ENDS.md` correctly notes that ford terrain raises the carved bed while canonical `RiverChannelSegment.waterH/bedH` remains unchanged. `sampleLocalWater` can therefore report the original natural channel depth at a ford.

Do not mutate hydrology to make the natural channel pretend the ford is part of the river. Instead derive the **effective ford bed** from the canonical road crossing decision wherever terrain/water gameplay needs the locally modified bed. `waterH` remains canonical river water height.

### Bridges / structures

There is no existing generic mutable “world structure” system that should own deterministic road bridges:

- `SettlementStructureStateRegistry` is settlement-owned mutable building condition/repair state,
- `WorldGeneratedContainers` is container-specific,
- settlement runtime groups/signposts are not an appropriate authority for a road that must exist independently of whether either endpoint settlement is currently streamed.

Therefore bridge **semantics belong to the deterministic road worldgen result**. Bridge presentation/collision should be a streamed world projection of that result, preferably through existing chunk/world prop + collider mechanisms. Do not persist bridge existence separately in V1.

## 3. Canonical route result

Replace the cache concept “pair → raw road segments” with a route result that can carry both geometry and crossing decisions.

Introduce a small road-owned result shape in `src/settlement/roadNetwork.ts` or a focused sibling module if separation materially improves clarity, for example conceptually:

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
  effectiveBedH: number
  span: number
}
```

Exact field names may follow existing style, but the contract must satisfy these invariants:

1. one deterministic route edge has one deterministic crossing record per physical river crossing,
2. all consumers reuse that record,
3. no renderer/chunk stage reclassifies ford vs bridge,
4. crossing identity is stable from seed + ordered route/river geometry, not runtime object identity or iteration order.

`routeCache` should cache this result (or `null`) under the existing order-independent pair/location keys. Signposts and NPC minor-location routes continue to read the same route geometry; they must not trigger independent route/crossing searches.

## 4. Feed canonical river data into routing

Extend `RoadNetworkContext` with access to the existing analytical river query, directly (`RiverQuery`) or through the narrow `segmentsNear` function it exposes.

Do **not** query streamed chunk river state or `riverTileCache`; routing must remain valid before chunks are loaded.

The same world-scoped analytical river source used by settlement placement must be made available to every `RoadNetworkContext` constructor (`chunkManager.ts` and `SettlementsManager.ts`) so whichever caller resolves a cached route first gets identical input.

Avoid two independently configured river-query implementations. Multiple cache wrappers over the same pure `computeRiverTile` data are acceptable only if they are guaranteed to use identical `RawSampleParams`; prefer passing/reusing the already world-scoped query where practical.

## 5. River-aware A* edge evaluation

River detection must be **edge-based**, not node-based.

A 9 m A* step can jump across a narrow river while both endpoint nodes are dry. For every candidate A* edge, detect intersections/proximity against canonical `RiverChannelSegment`s intersecting the route-search region.

Prefer one bounded river query for the A* search envelope (the existing route bounding box + routing margin, converted to the square query accepted by `RiverQuery`) and evaluate edges against that local segment set. Do not call full hydrology generation independently for every neighbor expansion.

For a candidate edge that does not cross the river water/channel footprint, keep the existing distance + mountain + elevation cost unchanged.

For a candidate edge that crosses a river:

1. resolve the exact/closest crossing point on the road step and river segment,
2. interpolate `waterHalfWidth`, `channelHalfWidth`, `waterH` and `bedH` at that point,
3. classify the candidate once as ford-capable or bridge-required,
4. add the corresponding deterministic crossing cost to the A* edge.

Crossing cost must be high enough that the router can prefer a nearby natural ford or reasonable detour, but not so high that it makes a huge detour around a small/shallow stream.

Use a continuous cost where useful (width/depth/approach grade), but the final infrastructure kind is discrete: `ford` or `bridge`.

## 6. Canonical crossing classifier

Create one pure crossing evaluator shared by routing and downstream projection code. It may live next to `riverFord.ts` if the ownership remains clearly “road × river semantics”, or in a new focused `roadRiverCrossing.ts` if that avoids making terrain-shaping helpers own route policy.

The evaluator must use canonical channel facts, at minimum:

- water width,
- water depth (`waterH - bedH`),
- optionally channel width / approach geometry where needed.

Initial policy should reuse the existing ford tuning rather than invent unrelated thresholds:

- small, shallow channels are ford candidates,
- channels near/above the current no-ford width require a bridge or reroute,
- depth must prevent a narrow-but-deep channel from being incorrectly declared a ford.

The existing `6..9 m` width tuning is guidance from the production ford implementation, not permission to keep two classifiers. After this plan, any width/depth thresholds must live in the canonical crossing evaluator and `riverFord.ts` must consume its result/projection.

Keep V1 deterministic and static. Do not include weather/current/seasonal discharge in crossing classification unless a canonical hydrology contract for that already exists.

## 7. Preserve crossing geometry through route post-processing

`findRoute()` currently applies `meanderRoute()` after A*. This can move the final polyline away from the river intersection the A* edge actually priced, or create an unpriced new intersection.

Fix this explicitly.

When a selected A* edge crosses a river:

- materialize a stable crossing anchor in the reconstructed route,
- preserve that anchor through meandering,
- suppress/limit meander on immediately adjacent points where necessary so the road approaches the same crossing,
- then run final river-intersection validation against the post-meander polyline.

`smoothProfile()` changes elevation targets only and may remain after crossing geometry is fixed, but bridge deck elevation must not be inferred solely from the smoothed road terrain profile.

Acceptance invariant:

> every river intersection of the final road polyline is represented by exactly one canonical `RoadRiverCrossing`, and every crossing record corresponds to a real final-polyline intersection.

If post-processing cannot satisfy that invariant for a route, fail/re-route deterministically rather than silently generating an unowned crossing.

## 8. Ford projection and terrain shaping

Change the existing ford terrain logic from:

```text
roadFalloff > 0 + small river here
→ locally decide to raise river bed
```

into:

```text
canonical route crossing(kind = ford)
→ ford influence near that crossing
→ raise effective bed using existing ford profile maths
```

The chunk/worker data path must receive compact numeric crossing projection data for relevant chunks. Keep it worker-safe and bounded, analogous to `RoadCorridorSegment[]` / `RiverChannelSegment[]`.

`applyRiverChannel()` should only call the ford bed shaping for an explicit ford crossing influence. An incidental road corridor overlap with an undeclared river crossing must not manufacture a ford.

The road corridor itself remains stage 2 and river carving remains stage 3. Reuse this ordering; do not add a runtime terrain-deformation path.

## 9. Resolve ford terrain vs water-depth mismatch

Include the existing loose end in this plan because the new crossing result gives the missing authority needed to fix it cleanly.

Keep `RiverChannelSegment.waterH` / natural `bedH` as hydrological geometry. Add/reuse one pure helper that derives the effective bed for an explicit ford crossing from:

```text
natural bedH + canonical waterH + crossing influence
```

Use that same helper for:

- terrain carving,
- `ChunkManager.sampleLocalWater()` (or its river-water subpath) when sampling inside a declared ford.

This makes physical depth agree with the actual shaped terrain without contaminating canonical hydrology with road infrastructure.

Do not modify water height at a ford and do not create a second water surface.

## 10. Bridge projection

For `kind = 'bridge'`, the route crossing record is the source of truth for bridge placement.

V1 bridge requirements:

- deterministic stable id,
- position/yaw from the road/river intersection,
- span derived from canonical channel/water width plus bounded bank clearance,
- deck elevation derived from the road approaches and river/channel clearance,
- streamed visual representation,
- collision/walkable surface sufficient for the player/NPC movement mechanisms that already consume world colliders/ground.

Do not store bridge state in `SettlementStructureStateRegistry` and do not make `SettlementsManager` the semantic owner.

Expose bridge specs from the road-worldgen layer (for example a `roadStructuresNear()`/`bridgesNear()` query alongside `segmentsNear()`) and let `ChunkManager`/existing world-content attachment mechanisms instantiate/remove the runtime representation with chunk lifecycle.

Avoid double instantiation at chunk boundaries with the same stable-id/dedup pattern used by other deterministic world props. The exact runtime placement module can follow the closest existing chunk-attached prop/collider pattern found during implementation preflight.

### Road terrain under a bridge

A bridge must not become a terrain berm across the river.

The road terrain-corridor projection should be clipped/masked across the bridge span (or equivalent) so:

- approach roads still shape terrain,
- the canonical river channel remains carved beneath the bridge,
- the bridge deck, not raised terrain, provides the crossing surface.

Road tint inside open water may be suppressed with the same bridge-span projection, but this is presentation cleanup, not crossing semantics.

## 11. Reroute policy

A bridge-required crossing is not automatically accepted just because a bridge is possible.

A* should compare:

- cost of a small ford,
- cost of bridge construction/infrastructure,
- ordinary distance/elevation/mountain costs,
- alternative crossings/detours within its bounded search area.

Expected outcomes:

- small/shallow channel on an otherwise good route → ford,
- nearby better ford versus expensive bridge → route to ford,
- major river with no reasonable ford but direct connection remains valuable → bridge,
- unreasonable crossing geometry or excessive bridge span → edge rejected, forcing reroute or route failure.

Keep policy local and bounded; do not add a global bridge planner.

## 12. Settlement connections and minor paths

The same routing/crossing evaluator should serve all callers of `findRoute()`.

Inter-settlement `road` routes may produce both fords and bridges.

Settlement→minor-location `path` routes should not silently get full bridge infrastructure unless explicitly allowed by the same policy. For V1 choose and document one deterministic rule during implementation:

- either `path` can only ford and otherwise reroutes/fails,
- or it can request a smaller bridge tier through the same crossing type.

Do not create a separate path-river classifier. Prefer the smallest rule consistent with current dock/path gameplay; no new bridge subtype is required unless the existing geometry actually needs it.

## 13. Determinism and persistence

This remains procedural worldgen state.

- Crossing decisions are pure functions of world seed, settlement/minor-location endpoints, routing config, terrain samplers and canonical river geometry.
- Do not persist generated bridge/ford existence in `SaveData` in V1.
- Do not use uncontrolled randomness or iteration-order-dependent tie-breaking.
- Keep the existing order-independent settlement-pair route cache behaviour.
- Forward and reverse resolution of the same pair must reuse/produce exactly the same route and crossing ids.
- World rebuild/new seed must clear route/crossing caches through `clearRoadNetworkCaches()`.

No save-version migration is expected unless implementation introduces mutable bridge state, which is explicitly out of scope.

If any persistent worldgen cache namespace currently stores output affected by regional road routes, bump only that namespace fingerprint/version. Recon found the production route cache to be in-memory; verify this again at implementation time because `world-015` may evolve.

## 14. Tests

Add focused automated coverage before browser verification.

### Route/crossing topology tests

In/near `src/settlement/roadNetwork.test.ts` (create if absent or extend the existing routing tests):

1. **Sub-grid crossing detection** — a river narrower than `gridStep` between two dry A* nodes is still detected.
2. **Small river chooses ford** — short route across shallow/narrow channel records exactly one `ford` and does not make an extreme detour.
3. **Good ford beats bridge** — when a modest detour reaches a clearly cheaper ford, route uses it instead of bridging a wider section.
4. **Large/deep river never becomes naked road** — final route either records `bridge`, reroutes, or returns `null`; it must never cross with no crossing record.
5. **Bridge span rejection** — a channel beyond configured bridge feasibility forces reroute/failure.
6. **Meander invariant** — final meandered polyline has exactly the same declared crossing set as the route result.
7. **Symmetry/cache** — resolving A→B and B→A yields/reuses the same physical crossings and stable ids.
8. **Determinism** — repeated runs with identical seed/context are deeply equal.
9. **Different seeds/config** — no accidental module-cache leakage after `clearRoadNetworkCaches()`.

### Terrain/water integration tests

Extend `src/terrain/chunkHeightmap.test.ts`, `riverFord.test.ts` and/or focused new tests:

1. road × small river **without** explicit ford crossing no longer raises the bed,
2. explicit ford crossing raises the bed with the existing bounded profile,
3. `waterH` remains unchanged at a ford,
4. effective water depth reported by local-water sampling matches the shaped ford bed,
5. bridge span leaves canonical river carving intact beneath the deck,
6. ford/bridge projection is identical on both sides of a chunk boundary.

### Bridge worldgen/runtime tests

Test pure bridge-spec derivation independently of Three.js where possible:

- stable id/position/yaw/span from a known crossing,
- bridge appears in each relevant spatial query exactly once after dedup,
- unrelated chunks/routes produce no bridge spec.

Do not claim browser verification from unit tests.

## 15. Performance constraints

Routing is one-time and cached, but hydrology extraction is not free.

- Query river geometry once per bounded route-search envelope where practical, not once per A* neighbor.
- Keep crossing evaluation over a bounded local segment set; add a simple spatial shortlist only if profiling/tests show the segment count warrants it.
- Do not add per-frame road-river intersection work.
- Bridge/ford lookup during chunk generation must be bounded by nearby route/crossing specs.
- No worker migration is required merely for this feature; routing currently owns main-thread settlement/worldgen dependencies and is cached.

## 16. Files / systems expected to change

Primary:

- `src/settlement/roadNetwork.ts` — route result, river-aware A*, route cache, crossing anchors, nearby crossing/bridge projections.
- `src/terrain/riverQuery.ts` — likely no semantic change; reuse as analytical source, possibly expose only a narrow integration helper if required.
- `src/terrain/riverFord.ts` — make ford maths consume canonical crossing policy/influence rather than independently classify arbitrary overlaps.
- `src/terrain/chunkHeightmap.ts` — explicit ford projection, bridge-span road shaping mask.
- `src/terrain/chunkManager.ts` — provide river query to road context; near-chunk crossing/bridge data; effective ford water sampling; bridge runtime projection/lifecycle integration.
- `src/settlement/SettlementsManager.ts` / composition call-site — ensure its `RoadNetworkContext` uses the same world river-query contract so first cache resolver cannot differ.

Likely supporting/tests:

- focused new `src/settlement/roadRiverCrossing.ts` only if it cleanly centralizes the pure classifier and geometry helpers,
- existing world prop/collider helper chosen during implementation preflight for bridge runtime representation,
- routing/terrain/water tests described above,
- `docs/state/water.md` and `docs/state/terrain-and-world-generation.md` after implementation.

Do not modify unrelated settlement structure condition/persistence systems.

## 17. Non-goals

- player-built bridges,
- bridge damage/repair/decay,
- bridge construction economy,
- bridge quests,
- seasonal flooding or dynamic ford availability,
- global road-network optimization,
- a generic all-purpose world-structure registry,
- renderer-only exceptions that hide invalid topology.

## 18. Acceptance criteria

- A final generated road cannot intersect canonical river water without exactly one declared crossing decision.
- Small/shallow crossings can become fords and terrain/water sampling agree on their effective shallow bed.
- Large/deep crossings become deterministic bridges or force rerouting/failure.
- A road cannot cross a large river merely because elevation cost allowed it.
- A reasonable nearby ford can beat an unnecessary long detour or bridge through the A* cost model.
- Bridge placement is derived from the same crossing decision used by routing, not independently detected by rendering.
- River hydrology remains canonical and unmodified by roads; road infrastructure is an overlay on that geometry.
- Route/crossing output is deterministic across repeated generation, caller order and chunk streaming order.
- No save migration is required for V1.

## 19. Verification

Technical verification after implementation:

```text
npx tsc --noEmit
pnpm run test -- roadNetwork
pnpm run test -- riverFord
pnpm run test -- chunkHeightmap
pnpm run lint:fix
```

Use the repository's actual targeted test command syntax if it differs; do not broaden to unrelated suites unless failures require it.

Manual/browser verification is performed by the user. Verify at minimum:

- a small stream crossing visibly forms a usable ford,
- a large river crossing visibly has a bridge or the road reroutes,
- no road/tint/terrain berm passes naked through a large channel,
- bridge approaches join the road without cliffs or floating deck,
- river remains visibly continuous beneath a bridge,
- player/NPC traversal uses the resulting crossing surface.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
