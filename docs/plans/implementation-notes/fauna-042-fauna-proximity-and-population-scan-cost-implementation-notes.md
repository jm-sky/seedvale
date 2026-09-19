# Implementation notes: fauna-042 — fauna proximity and population scan cost

**Plan:** [fauna-042](../fauna-042-fauna-proximity-and-population-scan-cost.md)  
**Recon baseline:** reviewed against `main` at `3e34c058` on 2026-09-19; current code still wins if `main` advances  
**Current state:** implementation landed; hardening/correctness tests landed 2026-09-19. Remaining User-owned work is browser/performance comparison (including cell-size A/B), not a second spatial-system implementation

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

The implementation is architecturally in place. Correctness hardening tests now lock the accepted snapshot/`cellKey`/scratch contracts. Remaining User-owned work is browser/performance comparison, not a second spatial system.

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
- `FAUNA_PROXIMITY_CELL_KEY_STRIDE`
- `FAUNA_PROXIMITY_CELL_KEY_WORLD_EXTENT`
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

Correctness contract:

- the index is a candidate-discovery snapshot, not simulation authority;
- exact distance/liveness/business predicates read live agent state after the prefilter, so stale bucket membership may produce extra candidates but must not make a moved-away/out-of-range target valid;
- committed wild-target existence is validated with global snapshot membership (`proximity.has()`), never by "was returned by this local query";
- an animal that only moves into range after its bucket was assigned may be discovered on the next rebuild; this bounded one-pass discovery lag is accepted;
- a respawn created after the sensing pass enters the index on the next fauna pass;
- dead agents remain indexed because carcass discovery needs them.

Current `Fauna.update()` lifecycle ordering is also load-bearing:

```
proximity.rebuild(agents)
→ all current wild agents update
→ readyToRemove() agents are tombstoned/disposed and agents is replaced
→ managed-spawner bookkeeping / respawns / recovery
```

Therefore no physical removal or respawn mutates the wild pool while the current proximity snapshot is serving the agent-update loop. A target may die during an earlier agent's update, but later consumers read that same object's live `health.dead`/corpse state.

Do not incrementally mutate buckets during each `AnimalAgent.update()`. The bounded snapshot semantics are preferred over mutation-during-iteration complexity.

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

## Hardening checks (completed 2026-09-19)

These were the remaining correctness/hardening items after the spatial index landed. They do not change the architecture.

### 1. Covering-range overfetch — left unchanged

`coveringCellRange()` still uses:

```ts
const cover = radius + FAUNA_PROXIMITY_CELL_SIZE
```

The extra 16 m is a deliberately conservative same-pass movement margin, not an accidental off-by-one. It reduces the chance that a candidate whose live position moved across a bucket boundary during the sequential fauna pass is omitted from a later query.

Without an explicit upper bound on displacement between `rebuild()` and a particular query, `+16 m` is **not** a formal guarantee that every newly-near candidate is discoverable in the same pass. The accepted architectural contract remains that newly-near discovery may lag until the next rebuild, while live radius predicates prevent stale candidates from becoming false positives.

Static brute-force equivalence now passes with the current conservative cover. That is necessary but not sufficient to tighten: there is still no production `agentCpuDiag` candidate-count evidence that the extra cell materially weakens the optimization. Do not remove `+16 m` until that evidence exists and the one-pass discovery lag is an explicit accepted substitute.

### 2. Brute-force equivalence test — added

`src/fauna/faunaProximity.test.ts` compares spatial query + exact distance predicate against a full-pool scan with the same predicate (`hypot < r` and `hypot <= r`). Coverage includes radii `< 16`, `== 16`, `> 16`, negatives, cell edges/corners, both sides of a cell boundary, exact/just-inside/just-outside radius points, and a few hundred deterministic positions. Candidate *sets* are compared, not order.

### 3. Numeric cell-key uniqueness — documented and tested

`cellKey(cx, cz) = cx * FAUNA_PROXIMITY_CELL_KEY_STRIDE + cz` with `STRIDE = 1 << 20`.

Collision-free for cell coordinates `cx, cz ∈ [-524288, 524287]`, i.e. world X/Z in `[-8_388_608, 8_388_608)` metres (~±8389 km) — `FAUNA_PROXIMITY_CELL_KEY_WORLD_EXTENT`. Packed keys stay exact IEEE-754 integers in this range. A wrapping collision exists *outside* the range (`cellKey(0, STRIDE) === cellKey(1, 0)`); the key stays numeric.

### 4. Scratch-buffer reentrancy — current callers are safe

Audited `nearbyOthers()` / `nearbyAgentScratch` call sites:

- `advanceCorpseDecay` → `advanceAnimalCorpse` (synchronous iteration, no re-entry);
- `updateRabid` → `pickRabidTarget` (synchronous scan, no re-entry);
- `pursueNeeds` → `findFoodTarget` / `findCarcassTarget` (synchronous scan + `claimAsFood`, no re-entry).

No caller retains the array or nests another `nearbyOthers()` while iterating. JSDoc now states the borrowed-view contract. No extra scratch buffers.

### 5. Remaining `currentOthers` scans — still intentional

Still the only full-pool identity/herd reads:

- juvenile mother lookup via `currentOthers.find(...motherId...)`;
- herd leader selection via `pickHerdLeader(this.currentOthers, herdId)`.

Not spatialized.

### Snapshot pass order — regression-tested, not incrementally bucketed

Accepted one-rebuild-per-pass semantics are locked by tests:

- a target that walks out of radius after `rebuild()` may still appear in the spatial prefilter, but the live distance predicate rejects it;
- a target that walks into radius is not required this pass and is found after the next rebuild;
- committed wild prey uses `proximity.has()`, not local-query membership;
- a later agent in the same pass observes live `health.dead` / carcass state;
- physical removal and managed-spawner respawn run after the wild-agent loop (`createFauna.update`).

Do not change this to incremental bucket updates.

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

Completed in this order: brute-force equivalence, `cellKey` uniqueness, scratch-buffer audit, snapshot-semantics tests, targeted/technical checks. `coveringCellRange()` was **not** tightened — see hardening check 1.

Do not refactor `AnimalAgent`, spawner ownership or NPC proximity while doing follow-up work.

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
