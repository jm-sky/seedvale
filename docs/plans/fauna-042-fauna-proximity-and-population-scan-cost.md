# Plan: Fauna proximity and population scan cost

**Created:** 2026-09-19
**Status:** `verification needed` 🔍 (implemented 2026-09-19 — browser/performance checks are User-owned)

See [implementation notes](./implementation-notes/fauna-042-fauna-proximity-and-population-scan-cost-implementation-notes.md).
**Priority:** medium · **Effort:** M
**Depends on:** ~~fauna-041~~, ~~fauna-028~~, ~~fauna-033~~
**Domain:** `fauna`
**Type:** `optimization`
**Roadmap:** -
**Model:** Grok, Composer

## Implementation status (2026-09-19)

**Implemented + technically verified, including hardening/correctness tests.** Browser/gameplay/performance comparison (including post-implementation cell-size A/B) is User-owned.

- `src/fauna/faunaProximity.ts` — fauna-owned runtime spatial hash (16 m cells, extra neighbour covering). Rebuilt once per `Fauna.update()` from the wild `agents` array. Not a second registry, not persisted.
- `AnimalAgent` sensing/targeting (`nearest`, prey commitment membership, rabid search, carcass search, prey-alert copy, scare-herd, rotting-corpse neighbours) visits covering cells when `AnimalUpdateContext.proximity` is supplied; tests and livestock ticks without it keep the original full-`others` scan.
- `huntableLivestock` remains a separate encounter set and is never inserted into wild buckets.
- `updateSpawners()` keeps fauna-041 membership occupancy (`spawnPointId`). `createFauna()` fills a reusable `Map<spawnPointId, count>` in one O(N) pass when `dayDelta > 0` — no per-frame `filter().map()`, occupancy queried only for spawners that can respawn. Recovery still uses nearby same-kind population.
- `agentCpuDiag` records proximity rebuild ms, spawner bookkeeping ms, and proximity query/candidate counts alongside existing nearest-scan counters.
- Hardening (2026-09-19): brute-force spatial↔scan equivalence; snapshot-semantics regressions; `cellKey()` uniqueness inside `FAUNA_PROXIMITY_CELL_KEY_WORLD_EXTENT`; `nearbyAgentScratch` borrowed-view contract. `coveringCellRange()` still uses `radius + 16 m` — static equivalence passed, but there is no production candidate-count evidence that the extra cell weakens the optimization.

**Not claimed:** a measured FPS win. Do not treat technical checks as browser verification.

## Goal

Remove avoidable whole-population repeated scans and recurring allocations from fauna sensing/population bookkeeping while preserving the single `AnimalAgent.update()` simulation path and gameplay-relevant targeting semantics.

This is a bounded hot-path optimization, not an ecosystem redesign.

## Pre-implementation baseline

Before commit `d44328b`, `createFauna()` passed the complete wild `agents` array as `others` to every agent.

Full-rate sensing/targeting can linearly scan that collection for:

- predator/prey proximity;
- new prey acquisition;
- carcass food discovery;
- rabid/live-target discovery and related threat checks.

The total shape remains O(N²) as the wild population grows. fauna-028 intentionally left sensing/targeting full-rate, while fauna-033 optimizes movement/water/collider cost rather than inter-animal discovery.

Before commit `d44328b`, the managed-spawner path additionally created `filter().map()` population snapshots every update and then filtered them again per spawner.

## Scope

### 1. Establish one fauna-owned local candidate view

At the existing `Fauna` composition boundary, build or maintain the smallest bounded structure needed for local inter-animal queries.

Acceptable shapes include:

- a coarse spatial hash/grid keyed by existing world/chunk-sized coordinates; or
- reused cell buckets/scratch arrays local to `createFauna()`.

Do not introduce a second simulation manager or authoritative animal registry. `AnimalAgent` instances remain the live simulation entities; the proximity structure is derived/runtime-only.

### 2. Preserve query semantics

Existing consumers must retain:

- dead/self exclusion;
- role filters;
- detect/flee/search radii;
- committed-target validation;
- nearest-target correctness and existing eligibility/range rules; exact ordering among otherwise-equivalent/equal-distance candidates is not a gameplay contract;
- explicit `huntableLivestock` composition separate from the wild pool;
- carcass claim/revalidation rules.

A query may inspect extra neighboring cells but must apply the original radius predicate before selection.

`coveringCellRange()` must cover every cell that can contain a candidate within the requested radius for the index snapshot, but should not add a full-cell safety margin by default. The current `radius + cellSize` coverage is a conservative implementation from the initial movement-snapshot analysis; it is not considered proven necessary. Keep the rationale documented, then reduce the margin if deterministic brute-force equivalence tests demonstrate that a tighter range preserves the accepted snapshot semantics **and** production candidate counts show the extra cell materially weakens the optimization. A later-updated animal discovering an earlier animal that moved into range during the same fauna pass may still be deferred until the next rebuild; that one-tick discovery difference is explicitly acceptable.

Local discovery and global membership are distinct contracts:

- proximity queries narrow candidates for local sensing/discovery only;
- committed wild-target existence must use wild-pool membership, not presence in the current local query;
- live distance/liveness/business predicates remain authoritative after candidate prefiltering;
- a snapshot-built index may defer discovery of an animal that only becomes newly-near after its bucket was assigned until the next fauna pass.

### 3. Reuse population membership from fauna-041

After fauna-041, do not reconstruct managed-spawner occupancy by allocating a full `filter().map()` positional snapshot every frame.

Use the same fauna-owned membership/provenance bookkeeping or a reusable scratch view.

Spawner timers still advance in world days. Expensive occupancy work should run only when it can affect a spawner, rather than allocating equivalent data every frame for habitats that cannot respawn.

### 4. Keep cadence and off-screen semantics unchanged

Do not freeze distant fauna.

Do not make camera visibility decide whether sensing/lifecycle occurs.

This plan may reduce candidate discovery cost, but must not create different on-screen vs off-screen ecological rules.

### 5. Measure rather than assume

Reuse `agentCpuDiag` where possible. Add only minimal diagnostics needed to compare:

- fauna sensing/targeting time;
- population/spawner bookkeeping time;
- candidate counts;
- allocations only if they can be measured cheaply.

Do not retain heavy profiling-only structures in normal runtime.

## Relevant files / symbols

- `src/fauna/createFauna.ts::Fauna.update`
- `src/fauna/AnimalAgent.ts` nearest/target resolution call sites
- `src/fauna/animalForaging.ts::findCarcassTarget`
- rabid target discovery helper
- `src/fauna/AnimalSpawner.ts::updateSpawners`
- `src/perf/agentCpuDiag.ts`
- focused fauna targeting tests.

## Tests

Add tests proving candidate narrowing preserves:

1. nearest in-range prey selection;
2. nearest threat/flee selection;
3. dead/self exclusion;
4. target commitment invalidation;
5. carcass selection/claims;
6. livestock remains supplied through the explicit encounter set rather than silently merged into wild buckets;
7. same behavior for a target on a spatial-cell boundary;
8. off-screen/distant animals continue normal lifecycle updates;
9. a committed wild target remains valid when it is globally present but absent from the local candidate slice, until ordinary death/range/membership rules invalidate it;
10. rebuild → movement without rebuild cannot make a moved-away target pass the live radius predicate;
11. snapshot lifecycle ordering is covered: all wild-agent updates run before removal, and spawner respawns occur only after the sensing pass;
12. **mandatory correctness gate:** deterministic brute-force equivalence of static spatial queries vs. a full scan across cell boundaries, negative coordinates, query centers near cell edges/corners, and radii below/equal/above cell size; this must pass before tightening `coveringCellRange()` is accepted;
13. spatial cell keys are collision-free across the documented supported cell/world-coordinate range, including negative coordinates, zero crossings, neighbouring cells on either axis and representative large in-range coordinates; the test should validate the arithmetic-packing assumption rather than force a string-key rewrite.

## Performance verification

Use existing diagnostics after implementation. Do not require a pre-implementation benchmark as a gate for the code change.

After correctness is established, compare two practical spatial-cell sizes using the same deterministic/high-fauna scenario. Keep 16 m as one candidate and select the second candidate from the observed real query radii and density profile rather than assuming a winner in the plan. Compare at representative populations (at least 50, 100, 500 and 2000 wild agents) and include one intentionally dense-cluster case to expose worst-case degradation.

Success criteria:

- local target discovery no longer scans the full wild array per animal in the common case;
- no per-frame `filter().map()` chain remains for managed-spawner occupancy;
- candidate-set construction is O(N) or better per fauna pass;
- spatial-query candidate count depends primarily on local density and query radius, not total wild-fauna population, except in intentionally dense worst-case layouts;
- the selected cell size is justified by post-implementation A/B diagnostics rather than intuition alone;
- behavior/correctness tests remain unchanged.

Do not claim a measured FPS win unless the user performs browser verification.

## Guardrails

- no worker;
- no second fauna simulation pipeline;
- no camera-driven simulation culling;
- no new persistence schema;
- no species/gameplay rebalance;
- no unrelated movement refactor;
- no browser verification by the implementing agent.

## Verification

Run targeted fauna tests and technical checks. User performs browser/performance verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
