# Implementation notes: fauna-042 — fauna proximity and population scan cost

**Plan:** [fauna-042](../fauna-042-fauna-proximity-and-population-scan-cost.md)  
**Recon baseline:** current `main` on 2026-09-19, after commit `d44328b`  
**Current state:** implementation landed; remaining work is verification/hardening, not a second spatial-system implementation

## Current-code reality

`fauna-042` is already implemented on `main`.

The implementation introduced:

- `src/fauna/faunaProximity.ts::createFaunaProximityIndex()`;
- one fauna-owned `FaunaProximityIndex` instance in `createFauna()`;
- one `proximity.rebuild(agents)` before the wild-agent update loop;
- proximity-aware reads in `AnimalAgent`;
- reusable managed-spawner occupancy counts in `createFauna()`;
- proximity/spawner diagnostics in `agentCpuDiag`.

Do not recreate the plan from scratch or introduce another registry/grid.

The remaining implementation work, if any, should be limited to defects or hardening findings from the checks below.

## Ownership and lifecycle boundaries

### Wild fauna authority

`src/fauna/createFauna.ts` remains authoritative for the live wild `agents` array.

`FaunaProximityIndex` is only a derived runtime accelerator:

- rebuilt from `agents`;
- not persisted;
- not an entity owner;
- not a second fauna registry;
- not shared with livestock/NPCs.

Keep this ownership boundary.

### AnimalAgent

`AnimalAgent` remains the single simulation entity and owns:

- target commitment;
- behaviour/decision state;
- corpse state;
- movement/lifecycle.

It may consume the read-only proximity contract, but must not know about hash buckets or cell keys.

### Livestock

`AnimalUpdateContext.huntableLivestock` remains a separate caller-composed encounter set.

Do not insert livestock into the wild proximity index. Wild-pool membership and livestock encounter membership have different ownership/lifecycle semantics.

### Managed spawners

After `fauna-041`, managed capacity is logical membership by `spawnPointId`, not distance from the spawner.

Current production ownership is correct:

- `createFauna()` fills reusable `boundOccupancyCounts: Map<spawnPointId,count>`;
- `AnimalSpawner.updateSpawners()` consumes a `SpawnerBoundCount` callback;
- persistent occupants stay excluded from ordinary occupancy and are represented separately through reserved slots.

Do not reintroduce positional occupancy counting for respawn capacity.

## Exact implementation seams

### `src/fauna/faunaProximity.ts`

Relevant symbols:

- `FAUNA_PROXIMITY_CELL_SIZE`
- `FaunaProximityIndex`
- `createFaunaProximityIndex()`
- `cellCoord()`
- `cellKey()`
- `coveringCellRange()`
- `forEachNear()`
- `countNear()`
- `has()`

The index currently uses 16 m cells and reuses bucket arrays through `idleBuckets`.

`has(agent)` is global wild-pool membership for the current rebuild. It is not a proximity query.

### `src/fauna/createFauna.ts`

The index is rebuilt once before the wild-agent loop:

```
proximity.rebuild(agents)
for (const a of agents) {
  a.update({ ..., others: agents, proximity, ... })
}
```

Keep this one-rebuild-per-pass shape unless profiling proves it insufficient.

Spawner occupancy is rebuilt only when `dayDelta > 0`; successful respawns increment the same reusable count map immediately so a large time skip cannot overfill capacity in one pass.

### `src/fauna/AnimalAgent.ts`

Relevant symbols/fields:

- `AnimalUpdateContext.proximity`
- `tickProximity`
- `forEachNearby()`
- `nearbyOthers()`
- `isWildPoolMember()`
- `nearest()`
- `resolvePreyTarget()`
- module-level `nearbyAgentScratch`
- `currentOthers` / `pickFollowTarget()`

Important distinction:

- local candidate discovery uses proximity queries;
- committed-target existence uses global membership (`proximity.has()` when present);
- `currentOthers` still intentionally serves herd/mother semantics.

Do not make “present in local query result” mean “still exists in fauna”.

### `src/fauna/animalForaging.ts`

`FOOD_SEARCH_RADIUS` is exported so `AnimalAgent` can bound carcass candidate collection before calling the existing food-selection logic.

The proximity layer must only narrow the candidate set. It must not replace carcass eligibility, value/score, claim or revalidation logic.

### `src/fauna/AnimalSpawner.ts`

`updateSpawners()` supports both the old snapshot form and `SpawnerBoundCount`.

Production uses the count callback. Keep the array form only for compatibility/tests unless a separate cleanup plan removes it.

## Resolved architectural decisions

### Keep the grid fauna-local

Do not extract a generic `world/spatialGrid.ts` in this plan.

There is still only one real consumer. Extract a shared primitive only when another domain (for example NPC proximity) has a concrete, measured need and the contracts genuinely align.

### Snapshot semantics are intentional

The spatial index is rebuilt once at the start of the wild-fauna pass.

Animals may move after their bucket was assigned. Do not incrementally mutate buckets during each `AnimalAgent.update()`.

Consequences accepted by design:

- exact distance checks use the live position, so stale bucket membership may produce extra candidates but should not create an out-of-range target;
- a newly-near agent can become discoverable on the next rebuild;
- a respawn created after the rebuild enters the index on the next fauna pass;
- dead agents remain indexed because carcass discovery needs them.

This bounded one-pass lag is preferred over mutation-during-iteration complexity.

### Candidate ordering is not a required contract

User explicitly accepts minimal behavioural differences such as equal-distance deer being visited in a different order.

Do not sort candidates or reconstruct original `agents` order solely for tie preservation.

The required contract is semantic eligibility/range correctness, not exact legacy iteration order.

### No cadence/camera changes

Do not combine this optimization with:

- camera culling;
- off-screen freezing;
- worker migration;
- sensing cadence changes;
- species rebalance.

Those belong to separate plans.

## Hardening checks before closing verification

### 1. Covering-range overfetch

Current `coveringCellRange()` uses:

```ts
const cover = radius + FAUNA_PROXIMITY_CELL_SIZE
```

This is safe but may visit substantially more cells than necessary.

Use existing diagnostics to determine whether the extra full-cell margin weakens the optimization materially.

If it does, prefer the smallest correct rule:

- cells intersecting `x/z ± radius`; or
- a small explicit movement margin justified by same-pass displacement.

Do not optimize this by assumption; compare candidate counts first.

### 2. Brute-force equivalence test

Add a deterministic property-style test in `src/fauna/faunaProximity.test.ts`.

Build a few hundred deterministic agents/positions and compare:

```
spatial query
+ exact distance predicate
```

against:

```
full agents scan
+ the same exact distance predicate
```

Test multiple centers/radii including:

- radius below 16 m;
- radius exactly 16 m;
- radius above 16 m;
- negative coordinates;
- points on both sides of a cell boundary;
- points exactly on/just inside/just outside the requested radius.

Compare candidate sets, not result order.

### 3. Numeric cell-key uniqueness

`cellKey(cx, cz)` uses numeric packing with `CELL_KEY_STRIDE = 1 << 20`.

Add focused tests for the supported world range:

- negative X/Z;
- cells around zero;
- neighbouring cells on either axis;
- large positive/negative cell coordinates inside the intended playable bound.

If the intended coordinate bound cannot be stated confidently, replace the packed numeric key with an unambiguous representation instead of relying on an undocumented range assumption.

### 4. Scratch-buffer reentrancy

`nearbyAgentScratch` is module-level and reused by `nearbyOthers()`.

Current call sites are synchronous and sequential, but verify that no consumer:

- retains the returned array;
- calls another `nearbyOthers()` before finishing its own iteration;
- passes the array into code that may synchronously re-enter the same helper.

If a nested call exists or is introduced, move to caller-owned/reentrant scratch storage rather than copying arrays per query.

### 5. Remaining `currentOthers` scans

Inventory remaining reads of `currentOthers`.

Current known intentional cases:

- juvenile mother lookup via `currentOthers.find(...motherId...)`;
- herd leader selection via `pickHerdLeader(this.currentOthers, herdId)`.

Do not mechanically spatialize these.

Mother lookup is identity/membership-oriented, and herd leadership is defined over the herd rather than “nearest local herd member”. Only change them if a separate profiling result shows material cost and a semantic-preserving data structure is clear.

## Diagnostics to reuse

Do not add another profiler.

Use existing `agentCpuDiag` fields:

- `nearestCandidatesChecked`;
- `faunaProximityRebuildMs`;
- `faunaSpawnerBookkeepingMs`;
- `faunaProximityQueries`;
- `faunaProximityCandidatesVisited`;
- overall fauna agent update timing.

The useful scaling signal is candidate reduction, not just raw query-call count.

## Implementation order for remaining hardening

1. Add brute-force equivalence coverage for `FaunaProximityIndex`.
2. Add numeric cell-key boundary/uniqueness tests.
3. Audit `nearbyAgentScratch` consumers for reentrancy/retention.
4. Run targeted tests and technical checks.
5. Compare proximity candidate counts in the existing high-fauna diagnostic scenario.
6. Only if diagnostics justify it, tighten `coveringCellRange()`.
7. Re-run equivalence tests after any covering-range change.

Do not refactor `AnimalAgent`, spawner ownership or NPC proximity while doing this.

## Verification

Technical verification belongs to the implementation agent:

- focused `faunaProximity` tests;
- focused `AnimalAgent` targeting/carcass/rabid tests;
- `AnimalSpawner` tests;
- typecheck/lint/build/full tests according to the repository's normal implementation workflow.

Manual browser/performance verification remains User-owned.

Browser verification should confirm:

- nearest predator/prey behaviour still looks normal;
- carcass discovery still works;
- livestock hunting still goes through the explicit encounter set;
- distant/off-screen fauna still lives and decides;
- high-fauna diagnostics show fewer candidate visits than a full-pool scan.

Do not claim an FPS improvement without that browser comparison.

## Model assessment

Keep source-plan metadata as:

`**Model:** Grok, Composer`

The main implementation touched shared `AnimalAgent` targeting semantics and membership/ownership boundaries, so Grok remains the safer primary model. Composer is a reasonable lower-risk fallback now that the architecture and hardening seams are explicit.
