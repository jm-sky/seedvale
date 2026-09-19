# Plan: Managed spawner population authority

**Created:** 2026-09-19
**Status:** `done` ✅
**Priority:** high · **Effort:** S
**Depends on:** ~~fauna-018~~
**Domain:** `fauna`
**Type:** `bug`
**Roadmap:** -
**Model:** Composer, Grok

## Goal

Make managed habitat `maxPreyCount` a real logical population cap.

A live animal that belongs to a habitat must keep occupying that habitat's population slot while roaming or taking an allowed trip outside `SPAWNER_RADIUS`. Failed runtime materialization must not be counted as a successful respawn.

This extends the existing `PreySpawner` + `spawnPointId` mechanism. Do not introduce a second population registry.

## Confirmed defect

Current `AnimalSpawner.updateSpawners()` derives occupancy from same-kind live positions within `SPAWNER_RADIUS = 12`.

That is a locality query, not population ownership. Managed animals already have `spawnPointId`, while normal roaming and committed trips may legally move farther than 12 m. A living member can therefore disappear from the cap calculation and cause a replacement to spawn.

The callback also returns `void`; local bookkeeping increments occupancy even when `createFauna()` cannot resolve a valid dry spawn position and creates nothing.

## Scope

### 1. Use habitat membership for replenishment capacity

Reuse existing provenance:

- `AnimalAgent.spawnPointId`;
- `createFauna()`'s existing `animalId → spawnerId` association;
- persistent-slot reservation from fauna-018.

For **ordinary managed replenishment**, occupancy must represent live ordinary animals bound to the spawner, regardless of current distance.

Do not use species-wide counts: two nearby habitats of the same kind must not consume each other's owned slots.

Persistent slots remain reserved through their existing registry contract and must not be double-counted as ordinary live capacity.

### 2. Keep ecological recovery locality separate

`tickSpawnPointRecovery()` intentionally requires nearby same-kind population before `recovering → active`.

Do not replace that recovery/colonization predicate with ownership counting. The bug is the respawn-cap occupancy rule, not the recovery rule.

### 3. Make spawn success explicit

Change the `updateSpawners()` callback contract, or equivalent caller bookkeeping, so a failed candidate/materialization does not:

- increment logical occupancy;
- consume additional catch-up iterations as if an animal existed;
- reset a habitat to "full".

Avoid an unbounded retry loop when terrain prevents spawning. One failed attempt should terminate that spawner's current fill attempt and retry on a later eligible pass.

### 4. Preserve depletion semantics

Death accounting remains exact-once through the existing `animalToSpawner` path.

Do not change:

- `deathsThisCycle`;
- depletion threshold;
- disabled/recovering lifecycle;
- wolf-den scenario pressure;
- persistent occupant tombstones;
- ordinary wild ring spawns, which are not managed habitat population.

## Relevant files / symbols

- `src/fauna/AnimalSpawner.ts::updateSpawners`
- `src/fauna/createFauna.ts::spawnAgent`
- `src/fauna/createFauna.ts::handleAnimalDeath`
- `src/fauna/createFauna.ts` managed initial fill / respawn call
- `src/fauna/persistentOccupants.ts::ordinaryHabitatCapacity`
- `src/fauna/AnimalSpawner.test.ts`
- focused createFauna population tests where practical.

## Tests

Add focused tests proving:

1. a managed animal outside `SPAWNER_RADIUS` but still alive/bound prevents replacement beyond the configured cap;
2. two same-kind spawners count only their own bound animals;
3. death/removal opens exactly one ordinary slot;
4. a persistent reserved slot is not double-counted;
5. failed `onRespawn` does not create phantom occupancy or burn catch-up capacity;
6. successful large-`dayDelta` catch-up can fill multiple genuinely empty slots but never exceed the logical cap;
7. recovery still uses the existing nearby-population condition.

## Guardrails

- no new fauna/population manager;
- no per-animal persistence for ordinary wild fauna;
- no change to habitat placement rules;
- no change to species counts/balance;
- no global scan added outside the existing fauna owner;
- no browser verification by the implementing agent.

## Verification

Run targeted fauna/spawner tests plus typecheck/lint as appropriate. Browser verification is performed by the user: allow managed animals to roam/travel away from a habitat over multiple respawn intervals and confirm population does not exceed configured capacity.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
