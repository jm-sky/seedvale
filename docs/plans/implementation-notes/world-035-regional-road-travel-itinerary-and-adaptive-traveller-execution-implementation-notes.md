# Implementation Notes: world-035 — Regional road travel itinerary and adaptive traveller execution

**Plan:** `docs/plans/world-035-regional-road-travel-itinerary-and-adaptive-traveller-execution.md`  
**Reviewed:** 2026-09-19  
**Status:** `planned` 📋

## Verified seams

- `src/settlement/roadNetwork.ts` owns canonical `RoadRoute` geometry, road/path kinds, crossing semantics and route cache.
- `neighborsFor()` already exposes deterministic nearby settlement candidates.
- `routeToMinorLocation()` already shares the road cache/policy for settlement→minor-location paths.
- `findRoute()` is intentionally one-time/cached coarse A*; do not call it from detailed traveller ticks.
- `src/ai/npcTravel.ts` owns one authoritative off-screen execution/arrival lifecycle. Purpose-backed travel waits for `observeNpcTravelArrival()`.
- Merchant 038 already uses that generic continuity; do not introduce a second merchant ETA.

## Implementation decision

Create one entity-neutral regional itinerary resolver near road ownership. It may reference stable endpoint identities and route keys, but not `NpcAgent`, PlayerController or live AnimalAgent objects.

Detailed consumers may flatten only the current leg's route points into a transient cursor. Do not persist the full polyline.

## Cost guardrails

- graph resolve only at start/replan;
- route geometry comes from existing cache;
- no per-frame graph work;
- no worker unless profiling later proves graph composition itself material;
- off-screen travel stays aggregated via `NpcTravelContinuity`.

## Integration order

1. endpoint + itinerary types;
2. bounded deterministic multi-edge resolver;
3. pure tests/call-count tests;
4. consumer seam for `ui-input-025`;
5. consumer seam for `settlements-npcs-051`.

Do not move player or merchant movement ownership into this module.
