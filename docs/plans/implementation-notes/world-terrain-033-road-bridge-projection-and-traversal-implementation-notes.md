# Implementation notes: world-terrain-033 — road bridge projection and traversal

## Current-code baseline

`world-terrain-023` is already implemented; do not treat its dependency contract as hypothetical.

Canonical ownership is now:

- `src/settlement/roadRiverCrossing.ts` — `RoadRiverCrossing` already contains `id`, `kind`, `x/z`, `angle`, `waterWidth`, `channelWidth`, `waterH`, `naturalBedH`, `crossSin`, `span`; ford/bridge classification stays here.
- `src/settlement/roadNetwork.ts` — `RoadRoute { points, segments, kind, crossings }` is cached in the module-local `routeCache`; `routeBetween()` canonicalizes endpoint order; crossing ids are stable route-owned ids.
- `roadNetwork.fordsNear()` is the closest precedent for bridge projection: it walks the same cached routes, filters canonical crossings, derives plain numeric influence data and performs a bounded world-space query.

Do not add another river query, road↔river intersection pass, bridge classifier or bridge-owned route cache.

## Recommended bridge ownership

Add one focused pure bridge module next to road/crossing semantics, e.g. `src/settlement/roadBridge.ts` (exact name may follow local style).

It should own:

- `RoadBridgeSpec` — plain numeric/string deterministic data only;
- projection from `RoadRiverCrossing(kind === 'bridge')` + route/road tuning into the spec;
- footprint test / point-on-deck query;
- compact terrain-mask projection if the worker shape is bridge-specific.

Keep Three.js mesh creation out of this module. Presentation may live in a small terrain/world presentation module called by `ChunkManager`.

Use the crossing's existing `span` as the canonical road-aligned channel span. Do not recompute it from `channelWidth`; `crossSin`/obliqueness has already been folded into `span` by `roadRiverCrossing.ts`.

## Deck elevation

The plan's wording "derive deck elevation from final road approaches" needs one concrete rule.

`RoadRoute.segments` already carries smoothed route endpoint heights (`RoutePoint.hs`). The crossing anchor is inserted into the final route geometry by `world-terrain-023`, so derive deck Y from that final route profile rather than sampling terrain or water again.

Preferred rule:

- find/interpolate the route profile at the crossing anchor;
- use that road-profile Y as the deck walking surface, subject only to a small deterministic clearance correction if required to stay above `waterH`;
- if clearance correction is needed, apply it consistently to the short bridge approaches/spec, not by changing river hydrology.

This avoids a renderer-time `sampleHeight()` feedback loop: chunk terrain shaping itself depends on the bridge mask.

If the current profile can produce insufficient bridge clearance, keep the fix in bridge-spec derivation or extend the canonical route contract deliberately; do not sample the already-built chunk mesh to choose deck Y.

## `bridgesNear()` should mirror `fordsNear()`

Implement the bounded query in `roadNetwork.ts` using the existing `roadRoutesForSettlement()` / shared `routeCache` path.

Important details:

- only `route.kind === 'road'` can currently contain bridge crossings by construction;
- filter `crossing.kind === 'bridge'`;
- deduplicate by `RoadBridgeSpec.id` because the same inter-settlement route is discoverable while iterating nearby settlement cells from both endpoints;
- use the full oriented bridge footprint for bounds, not only the crossing point;
- return deterministic ordering (sorting by `id` is cheap and removes caller-order sensitivity).

`fordsNear()` currently has no id/dedup requirement because its output is shaping influence; copying it literally for runtime bridge identity would permit duplicate bridge instances.

## Terrain mask: extend `ChunkTileParams`, not raw samplers

`src/terrain/chunkHeightmap.ts` deliberately keeps `roadSegments`, `riverSegments` and `fordProjections` out of `RawSampleParams`; road/hydrology projection is layered only during chunk-tile generation.

Add a worker-safe `bridgeProjections`/`bridgeSpans` field to `ChunkTileParams` and exclude it from `RawSampleParams` in the same way.

The terrain-side bridge footprint should be the same finite oriented rectangle/capsule used by bridge spec traversal, or a deliberately shared pure helper. Do not create slightly different deck, mask and query dimensions in three files.

During stage 2 road shaping:

- when a texel is inside the open bridge span, suppress **road height shaping** for the matching road corridor;
- leave regional/village shaping unchanged;
- leave stage-3 canonical river carve unchanged;
- keep road shaping on the approach margins outside the open span.

Prefer suppressing only the relevant road contribution rather than globally disabling all road shaping at that texel, so an unrelated crossing/overlapping road is not affected.

Road tint over the open span can be suppressed using the same influence if the existing `roadTint` otherwise paints the river/bed beneath the deck.

Because `chunkTileFingerprint(params)` hashes the whole `ChunkTileParams`, adding bridge projection input automatically invalidates affected persistent `chunk-tiles` cache entries. Do not add a bridge-specific cache/version just for this change; verify the new field is actually present in `paramsFor()` before cache lookup/generation.

## Shared ground query: keep cave ownership explicit

Do not replace `ChunkManager.sampleHeight()` globally with bridge-aware height. That function is also a terrain/world sampling primitive used by placement/worldgen code where a bridge deck is not "terrain".

Introduce a narrow movement-ground seam, conceptually:

```ts
sampleSurfaceGround(x, z): number // terrain + generated bridge deck
```

or a small query returning `{ y, kind }` if water/cave integration benefits from knowing the source.

Composition for the player must remain Y-aware:

1. `Caves.queryGround(x, y, z)` first — cave ownership already distinguishes overlapping underground/surface spaces using current Y;
2. if no cave hit, query bridge deck;
3. otherwise terrain `chunkManager.sampleHeight(x, z)`.

Do not use `max(terrain, bridge)` as the cave composition rule.

Bridge deck semantics should come from deterministic bridge specs, not from raycasting the presentation mesh.

## Movement integration: one sampler for vertical snap **and slope checks**

`src/terrain/slopeConstraint.ts::stepWithSlopeAndCollision()` is shared by player, `NpcAgent` and `AnimalAgent`; it estimates slope using the injected `sampleHeight` at ±`SLOPE_SAMPLE_STEP`.

This is the critical traversal integration point. Feeding bridge-aware Y only to final vertical snapping is insufficient: the shared slope probe would still see the river bed/terrain and can remove uphill movement at the bridge approach.

Use the same effective surface-ground sampler for:

- player surface movement slope constraint and surface vertical ground;
- `NpcAgent`'s surface `sampleHeight` path used by `stepWithSlopeAndCollision()` and its Y assignment;
- `AnimalAgent` surface movement, while preserving its existing cave-habitat override (`snapY()` / cave-specific floor and containment).

Do not fork `slopeConstraint.ts` with bridge-special logic; inject the correct sampler.

Where NPC/fauna walkability checks reject water independently of slope, make the water test bridge-aware: a point on a valid bridge deck must not be rejected because canonical river water exists below it.

## Water ownership

`ChunkManager.sampleLocalWater()` must remain canonical/effective water sampling for the river itself; do not change `waterH` or pretend the bridge removes water.

Instead, movement/swimming eligibility should gate water by ground ownership: when the actor is on/over a valid deck footprint at deck Y, water below must not activate swimming/drowning semantics.

Follow existing spatial-context patterns (caves already require Y/context-aware ownership) rather than teaching hydrology that a bridge deletes river water.

## Runtime streaming / presentation

`ChunkManager` is the correct bridge presentation owner because bridges are road-world presentation independent of endpoint settlement streaming.

Use one stable owner rule. Recommended: the chunk containing `(spec.x, spec.z)` owns the runtime bridge instance.

Consequences:

- neighboring chunks may receive the bridge mask because the footprint overlaps them, but only the center chunk creates presentation/colliders;
- bridge id remains `RoadRiverCrossing.id`-derived and does not include chunk id;
- unload of the owner chunk disposes bridge mesh and clears optional colliders;
- reload recreates from the same spec.

If using obstacle colliders for railings/abutments, reuse `ChunkManager.registerColliders(ownerKey, ...)` / `clearColliders(ownerKey)` with an owner key derived from bridge id. The deck itself is never an obstacle collider.

Keep V1 geometry procedural and cheap. A single `Group`/few meshes per nearby bridge is acceptable; do not create a new general structure manager.

## Important distinction: semantic deck vs streamed visual

Loaded actors may approach a bridge while the visual owner chunk is loading/unloading at a boundary. Traversability must therefore query deterministic nearby bridge specs (or a retained bounded bridge-spec index/cache), not `scene` objects or "currently instantiated bridge meshes".

Avoid scanning all routes per actor tick. Suitable options are:

- a small bridge-ground query owned by `ChunkManager` backed by bridge specs retained per loaded/relevant chunk and deduped by id; or
- a bounded `bridgesNear(x,z, smallSize, roadCtx)` lookup with a lightweight local cache/index if profiling shows route iteration is too expensive.

Prefer reusing chunk relevance data already computed for terrain/runtime over performing route discovery separately for every NPC/fauna sample.

## Tests that catch the real failure modes

Prioritize tests for:

- `RoadBridgeSpec` uses canonical crossing `id/span/angle` and final route profile; deterministic deep equality;
- `bridgesNear()` dedups the same pair-route bridge encountered from both settlement cells and returns stable order;
- oriented footprint query agrees between deck-ground and terrain-mask helpers;
- bridge mask suppresses only road height/tint inside the open span while river carve remains unchanged and approaches remain shaped;
- `chunkTileFingerprint()` changes when bridge projection changes (existing generic fingerprint may make this a small assertion, not a new cache test suite);
- the same bridge-aware sampler passed to `sampleSlope()` sees a traversable approach/deck instead of the river bed;
- NPC/fauna water walkability permits deck footprint while still rejecting adjacent river water;
- cave-first player ground composition remains unchanged for cave hits at overlapping X/Z;
- owner chunk unload removes presentation/colliders, neighboring chunk overlap never creates a duplicate.

## Suggested implementation order

1. Pure `RoadBridgeSpec` + footprint/deck query and tests.
2. `roadNetwork.bridgesNear()` with id dedup/stable ordering.
3. `ChunkTileParams` bridge projection and road-height/tint suppression; verify persistent chunk-tile fingerprint behavior.
4. `ChunkManager` relevant-spec retention + owner-chunk presentation/collider lifecycle.
5. Introduce the narrow bridge-aware movement-ground sampler and wire player/NPC/fauna slope + Y paths.
6. Make water/walkability ownership bridge-aware without altering hydrology.
7. Focused integration/streaming tests; update state docs after implementation.

## Model assessment

This is cross-cutting terrain, streaming and three-agent movement work with cave/water ownership constraints. The main risk is not mesh construction but preserving one ground/slope/water contract across existing systems. Use **Opus** for implementation; **Sonnet** is the cheaper fallback with minimal additional risk given these notes and the already-complete `world-terrain-023` contract.

> **Zrób git commit i push do main, rebase jeżeli trzeba**