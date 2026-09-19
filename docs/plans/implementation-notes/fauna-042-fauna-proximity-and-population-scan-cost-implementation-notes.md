# Implementation notes: fauna-042 — fauna proximity and population scan cost

**Plan:** [fauna-042](../fauna-042-fauna-proximity-and-population-scan-cost.md)
**Recon baseline:** current `main` on 2026-09-19 (fauna-041 already landed)
**Implemented:** 2026-09-19

## Current-code baseline

Dependency `fauna-041` is implemented. Managed-spawner occupancy is logical membership:

- alive ordinary managed animals;
- grouped by `spawnPointId`;
- persistent occupants excluded;
- respawn callback returns explicit success/failure.

Do not reintroduce positional population counting. The remaining cost was inter-animal discovery plus the per-frame `filter().map()` used to build the managed-membership snapshot.

`createFauna()` passed the complete wild `agents` array as `others` to every `AnimalAgent.update()`. Full-rate sensing/targeting scanned that array for predator/prey nearest, rabid discovery, carcass food, prey-alert copies, and scare-herd proximity.

## Implementation

### Runtime spatial hash

`src/fauna/faunaProximity.ts` is a fauna-owned, runtime-only coarse hash (16 m cells). `createFauna()` constructs one index and rebuilds it once per `Fauna.update()` from the wild `agents` array (O(N), reused bucket arrays after warmup).

Cell covering includes one extra neighbouring cell so a target on a cell boundary, or a same-frame step, is still visited. Callers still apply the original radius / role / dead / self predicates. Dead agents stay in the view so carcass search can see them.

`huntableLivestock` is never inserted. Membership for committed-target validation uses `proximity.has()` (the rebuilt wild set), not a radius check and not “present in the local query slice”.

### AnimalAgent consumers

When `AnimalUpdateContext.proximity` is present:

- `nearest()` / prey-alert / scare-herd iterate covering cells;
- rabid search and carcass search receive a reused covering-cell scratch array;
- rotting-corpse neighbour influence uses the same scratch;
- livestock ticks and tests that omit `proximity` keep the original full-`others` scan.

The single `AnimalAgent.update()` path is unchanged. Cadence, camera, and off-screen lifecycle rules are unchanged. Equal-distance nearest ties still use first-seen `d < bestD` within covering-cell visit order (rebuild insertion follows `agents` order).

### Spawner occupancy

`updateSpawners()` keeps fauna-041 membership semantics (`spawnPointId` + `kind`, boolean `onRespawn`). Occupancy is queried only for spawners that can respawn this pass. Production fills a reusable `Map<spawnPointId, count>` in one O(N) pass when `dayDelta > 0` — no per-frame `filter().map()`, no spatial `SPAWNER_RADIUS` cap counting. Recovery still uses nearby same-kind population.

### Diagnostics

`agentCpuDiag` adds:

- `faunaProximityRebuildMs`
- `faunaSpawnerBookkeepingMs`
- `faunaProximityQueries` / `faunaProximityCandidatesVisited`

Existing nearest-scan candidate counts remain the comparison for target discovery.

## Tests

- `faunaProximity.test.ts` — membership, cell boundary, distant exclusion, dead carcass presence, occupancy predicate.
- `AnimalAgent.test.ts` — nearest prey/threat, dead/self exclusion, commitment invalidation, carcass claim, livestock encounter set, cell boundary, off-screen lifecycle, rabid discovery.
- `AnimalSpawner.test.ts` — occupancy callback is not invoked when it cannot affect a spawner; fauna-041 membership tests remain.

## Out of scope (left as-is)

- Herd-leader / mother scans over `currentOthers`.
- NPC `destinationThreatHooks` fauna scans.
- Browser/FPS verification.
