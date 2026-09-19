# Plan: Regional road travel itinerary and adaptive traveller execution

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** none
**Domain:** `world`
**Subdomains:** `simulation` `places`
**Tags:** `travel` `roads` `itinerary` `adaptive-simulation`
**Roadmap:** `quests-travelling-merchant-journeys.md`
**Model:** Sonnet, Composer

## Goal

Wydzielić wspólny, entity-neutral kontrakt regionalnej podróży po istniejących drogach i ścieżkach, używany przez Player Autopilot, Travelling Merchant, courierów i przyszłe caravans.

System ma rozdzielić:

```text
regional route commitment
→ ordered canonical road/path legs
→ detailed execution near/important
OR
→ existing off-screen continuity when remote
```

bez tworzenia drugiego road graphu, drugiego pathfindera ani per-frame globalnego travel managera.

## Current architecture to preserve

Aktualny `main` już ma:

- `src/settlement/roadNetwork.ts` jako canonical owner `RoadRoute`, `RoadSegment`, `neighborsFor()`, `routeToMinorLocation()` i cache route geometry;
- `findRoute()` jako kosztowny, ale cached/local A* dla pojedynczego edge;
- `src/ai/npcTravel.ts` jako generic off-screen `NpcTravelContinuity`, z `beginOffscreenNpcTravel()`, checkpointami, reification i idempotent arrival observation;
- merchant lifecycle oparty na tym samym generic travel;
- bounded local navigation dla detailed locomotion;
- żadnego publicznego multi-edge itinerary pomiędzy dowolnymi znanymi endpoints.

## 1. Shared regional itinerary

Dodać mały plain-data contract, conceptually:

```ts
type RegionalTravelLeg = {
  kind: 'road' | 'path'
  from: RegionalTravelEndpoint
  to: RegionalTravelEndpoint
  routeKey: string
}

type RegionalTravelItinerary = {
  from: RegionalTravelEndpoint
  to: RegionalTravelEndpoint
  legs: readonly RegionalTravelLeg[]
}
```

Exact endpoint identity ma reuse stable settlement/minor-location/world-location IDs już istniejące w kodzie.

Nie persistować całej `RoadRoute.points` w traveller state.

## 2. Graph composition

Resolver ma komponować istniejące canonical road/path edges:

```text
endpoint
→ nearest/canonical road entry
→ road A→B
→ road B→C
→ path C→location
→ endpoint
```

Wymagania:

- deterministic;
- bounded graph search;
- używa `neighborsFor()` i istniejących route resolvers/cache;
- failed edge pozostaje niedostępny;
- nie przelicza river/crossing semantics;
- nie tworzy player/NPC-specific graphu;
- koszt V1 = długość istniejących route legs.

Nie dodawać jeszcze danger/weather/economy weighting.

## 3. Detailed versus off-screen execution

Itinerary opisuje **dokąd po drogach**, ale nie zastępuje ownership ruchu.

Detailed consumer:

```text
current route leg
→ small waypoint cursor
→ existing local locomotion/pathfinding
→ next waypoint
```

Remote consumer:

```text
same route commitment
→ existing NpcTravelContinuity/off-screen checkpoint
→ no simulation of every waypoint/frame
```

Po reification detailed consumer może wznowić z logicznie właściwego miejsca/legu bez teleportowania do domu lub początku trasy.

Nie dodawać drugiego ETA clock obok `NpcTravelContinuity.execution`.

## 4. Performance contract

To jest twardy guardrail.

Zakazane:

```text
every traveller × every frame × regional graph search
every traveller × every frame × full road geometry scan
every traveller × every frame × full fauna scan
```

Docelowy koszt:

```text
journey start / justified replan
→ one bounded regional graph resolve
→ cached RoadRoute reuse

detailed tick
→ O(1) current waypoint/segment advance
→ existing local movement only

remote
→ existing low-frequency NpcTravel checkpoint
```

Replan tylko przy realnej invalidation/route change, nie przy zwykłym local stuck.

## 5. Itinerary caching

Preferować mały derived cache keyed by stable endpoints + world identity/road-network epoch, jeżeli profiling/recon potwierdzi wartość.

Nie kopiować `roadNetwork.ts` route cache.

Cache itinerary nie jest authoritative state i może zostać wyczyszczony przy WorldBundle/world-network invalidation.

## 6. Dynamic route policy seam

Resolver może przyjąć opcjonalny cheap edge-policy/cost callback, ale V1 nie musi go aktywnie używać.

Cel przyszły:

```text
canonical road geometry
+ known persistent route problem/safety consequence
→ edge policy
→ choose another existing road route if justified
```

Policy nie może modyfikować geometry i nie może wykonywać globalnych threat scans.

## 7. Consumer boundaries

### Player Autopilot

`ui-input-025` konsumuje itinerary i odpowiada wyłącznie za Player/mount input orchestration.

### Travelling Merchant

`settlements-npcs-051` konsumuje itinerary dla detailed road-following party, zachowując generic off-screen continuity.

### Future travellers

Courier/caravan/expedition mogą później korzystać z tych samych legów bez kopiowania graph logic.

## 8. Lifecycle

WorldBundle rebuild / New Game / world identity change:

- derived itinerary cache invalid;
- żadnych stale runtime refs;
- persisted NPC journey zachowuje semantic destination/purpose;
- itinerary można deterministycznie resolve ponownie.

## 9. Suggested implementation surface

Preferować mały moduł adjacent do road ownership, np. `src/world/regionalTravelItinerary.ts` lub przy `src/settlement/roadNetwork.ts`, zależnie od finalnego import direction.

Likely reuse:

- `src/settlement/roadNetwork.ts`;
- `src/settlement/settlementPlanCache.ts`;
- istniejące stable world/minor-location identities;
- `src/ai/npcTravel.ts` tylko dla integration contract, nie przez importowanie NPC semantics do resolvera.

## 10. Verification

Automated:

- multi-edge route uses only canonical existing road/path edges;
- deterministic for same world/endpoints;
- failed edge is never silently crossed;
- route geometry/crossing decisions are reused, not recomputed differently;
- no per-frame graph search API is required by execution;
- itinerary invalidates with world/road epoch;
- off-screen NPC travel keeps one authoritative ETA/arrival path;
- reification can resume a logical leg without resetting journey.

Performance regression test/diagnostic should assert bounded resolver call counts for repeated detailed ticks.

Browser/manual verification belongs to the User.

## Non-goals

- global navmesh;
- danger-aware A* over raw terrain;
- dynamic weather route costs;
- full trade-route economy;
- per-frame regional replanning;
- simulating remote travellers waypoint-by-waypoint;
- new worker pipeline solely for travel;
- duplicate road/crossing cache;
- merchant/player-specific route graph.

Add JSDoc with `@domain world` to important public contracts.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
