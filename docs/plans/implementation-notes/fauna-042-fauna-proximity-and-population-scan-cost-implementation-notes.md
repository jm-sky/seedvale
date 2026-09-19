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

## Post-implementation hardening review

Before treating `fauna-042` as fully verified, review the implementation against these additional checks. These are correctness/performance guardrails, not a request to redesign the architecture.

### 1. Cell covering cost

`faunaProximity.ts::coveringCellRange()` currently expands every query by one full cell:

```ts
const cover = radius + FAUNA_PROXIMITY_CELL_SIZE
```

With `FAUNA_PROXIMITY_CELL_SIZE = 16`, this is intentionally conservative but can substantially increase the number of buckets visited for common 10–20 m queries.

Verify with diagnostics whether the extra-cell margin materially weakens candidate reduction. If so, prefer the smallest safe covering rule:
- exact cells intersecting `x/z ± radius`; or
- only a bounded movement margin justified by maximum same-pass displacement.

A one-tick difference in which otherwise-equivalent animal is discovered first is acceptable. Do not add sorting or stable-order reconstruction solely to preserve old equal-distance ordering.

### 2. Brute-force equivalence test

Add a deterministic property-style test for `FaunaProximityIndex`:

- generate a few hundred deterministic agent positions;
- include negative coordinates and points exactly on/around cell boundaries;
- query many centers/radii;
- compare the exact-radius-filtered spatial result against a brute-force scan of the same wild pool.

The invariant is set equivalence for candidates geometrically inside the requested radius. Result ordering is explicitly not part of the contract.

This test should cover radii below, equal to, and above the 16 m cell size.

### 3. Numeric cell-key safety

`cellKey(cx, cz)` packs two signed coordinates into one number using `CELL_KEY_STRIDE`.

Add focused tests proving no collisions for the real supported world-coordinate range, including:
- negative X/Z;
- cells around zero;
- large positive/negative coordinates near the intended playable-world bound;
- neighbouring cells differing only on one axis.

If the supported world range cannot be expressed as a clear invariant, prefer an unambiguous key representation rather than relying on an undocumented numeric range assumption.

### 4. Snapshot semantics

The index is rebuilt once before the wild-agent update loop. Agent movement during that pass does not update bucket membership until the next fauna pass.

Keep this behaviour deliberately; do not incrementally mutate the grid during each `AnimalAgent.update()` unless profiling proves it necessary.

Add/retain a test or explicit invariant showing that:
- a moved agent may be discovered from its previous bucket for the remainder of the current pass;
- exact distance checks still reject it when no longer in range;
- new proximity becomes visible on the next rebuild.

This bounded one-pass lag is accepted for discovery and is preferable to mutation-during-iteration complexity.

### 5. Spawn/death membership timing

A respawn inserted after the proximity rebuild is expected to enter the proximity index on the next fauna pass. Death does not remove an agent from the current index because carcass queries need dead agents.

Document/test both behaviours so future cleanup code does not accidentally remove corpses from the index or force mid-pass rebuilds.

### 6. Scratch-buffer reentrancy

`AnimalAgent.nearbyOthers()` uses shared scratch storage for narrowed candidate arrays.

Verify every consumer of that returned array before future reuse:
- no consumer retains it beyond the immediate synchronous operation;
- no nested call can invoke `nearbyOthers()` and overwrite the same scratch while the outer consumer is still iterating;
- tests should cover nested-query behaviour if such a call chain exists.

If this invariant cannot be made obvious from current call sites, use caller-owned/reentrant scratch storage rather than relying on one shared mutable array.

### 7. Remaining full-pool scans

`currentOthers` remains intentionally available for herd/mother behaviour. Before closing verification, inventory its remaining read sites and classify them as:
- global-membership semantics that must remain full-pool;
- bounded proximity queries that should use the index;
- low-frequency work intentionally left out of scope.

Do not mechanically migrate `pickHerdLeader()` if leadership is defined over the whole herd rather than nearby animals.

### Review success criteria

The implementation is ready to remain as-is when:
- brute-force equivalence proves no in-radius wild candidate is lost;
- cell-key uniqueness is covered for the supported map range;
- no scratch-buffer reentrancy hazard exists;
- snapshot/spawn/death timing is explicit and tested;
- diagnostics show proximity queries inspect materially fewer candidates than the full wild pool in a high-fauna scenario.

Browser/performance verification remains User-owned.

