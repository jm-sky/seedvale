# Plan: Fauna proximity and population scan cost

**Created:** 2026-09-19
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** fauna-041, ~~fauna-028~~, ~~fauna-033~~
**Domain:** `fauna`
**Type:** `optimization`
**Roadmap:** -
**Model:** Grok, Composer

## Goal

Remove avoidable whole-population repeated scans and recurring allocations from fauna sensing/population bookkeeping while preserving the single `AnimalAgent.update()` simulation path and exact current targeting semantics.

This is a bounded hot-path optimization, not an ecosystem redesign.

## Confirmed current cost

`createFauna()` passes the complete wild `agents` array as `others` to every agent.

Full-rate sensing/targeting can linearly scan that collection for:

- predator/prey proximity;
- new prey acquisition;
- carcass food discovery;
- rabid/live-target discovery and related threat checks.

The total shape remains O(N²) as the wild population grows. fauna-028 intentionally left sensing/targeting full-rate, while fauna-033 optimizes movement/water/collider cost rather than inter-animal discovery.

The managed-spawner path additionally creates `filter().map()` population snapshots every update and then filters them again per spawner.

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
- stable tie behavior where currently defined;
- explicit `huntableLivestock` composition separate from the wild pool;
- carcass claim/revalidation rules.

A query may inspect extra neighboring cells but must apply the original radius predicate before selection.

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
8. off-screen/distant animals continue normal lifecycle updates.

## Performance verification

Use existing diagnostics with a high-fauna scenario before/after.

Success criteria:

- local target discovery no longer scans the full wild array per animal in the common case;
- no per-frame `filter().map()` chain remains for managed-spawner occupancy;
- candidate-set construction is O(N) or better per fauna pass;
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
