# Implementation notes: fauna-041 managed spawner population authority

**Plan:** `docs/plans/fauna-041-managed-spawner-population-authority.md`  
**Recon baseline:** current `main` on 2026-09-19

## Current ownership and relevant state

- `src/fauna/createFauna.ts` owns the live wild-fauna agent collection and managed-spawner runtime composition.
- `src/fauna/AnimalSpawner.ts::updateSpawners()` owns only respawn timer/cap bookkeeping. It does not create agents itself.
- Managed membership already exists on the animal via `AnimalAgent.spawnPointId`.
- `createFauna()` also already keeps `animalToSpawner: Map<animalId, spawnerId>` for exact-once death accounting.
- Persistent habitat slots are separate from ordinary managed population and are already reserved through `PersistentOccupantRegistry.slotCountsByHabitatId()` + `ordinaryHabitatCapacity()`.

Do not create a second population registry.

## Confirmed current bug shape

`updateSpawners()` receives an array of ordinary live animal positions and derives occupancy by:

- same kind,
- within `SPAWNER_RADIUS`.

That means a living managed animal stops counting against its habitat cap after roaming/travelling outside the radius, even though it still has `spawnPointId === spawner.id`.

The second bug is the respawn callback contract:

- `onRespawn(spawner)` returns `void`;
- `updateSpawners()` increments its local `nearby` count regardless of whether the caller actually materialized an animal;
- `createFauna()` can legitimately fail to resolve a dry spawn position and simply return.

So failed materialization can be counted as successful occupancy.

## Recommended contract change

Change `updateSpawners()` away from positional occupancy for the replenishment cap.

Prefer a narrow input such as a per-spawner ordinary live count:

- `ReadonlyMap<string, number>`, keyed by stable `PreySpawner.id`;

or an equivalent callback:

- `ordinaryLiveCountFor(spawnerId)`.

The count must represent:

- alive,
- ordinary/non-persistent,
- managed animals,
- whose `spawnPointId` equals that spawner id,
- regardless of current position.

The existing `animalToSpawner` map already represents the same ownership relationship for ordinary managed animals, but it is death-accounting oriented. The simplest implementation may derive counts from live `agents` by `spawnPointId` once per spawner update pass rather than introduce another long-lived index.

Keep the count derivation inside `createFauna()`; `AnimalSpawner.ts` should remain ignorant of `AnimalAgent`.

## Persistent slots

Continue using:

`ordinaryHabitatCapacity(effectiveMaxPreyCount(spawner), reservedPersistentSlots)`.

Persistent slots are already reserved independently of whether that persistent occupant is currently alive nearby, away, a corpse, or tombstoned.

Therefore the ordinary live membership count passed to `updateSpawners()` must exclude persistent occupants, otherwise reserved slots will be double-counted.

The existing check:

`occupantRegistry.hasPersistentAnimalId(a.animalId)`

is the correct discriminator to reuse.

## Spawn-success semantics

Change the respawn callback to return explicit success, e.g. `boolean`.

The caller in `createFauna()` should return:

- `false` when `resolveWildFaunaSpawnPosition(...)` produces no position;
- `true` only after `spawnAgent(..., spawner.id)` succeeds and the new agent is added to `agents` / scene.

Inside `updateSpawners()`:

- decrement respawn timer only for the attempt being made;
- increment logical occupancy only when callback returns success;
- if callback returns failure, stop the current fill loop for that spawner;
- do not continue a catch-up loop repeatedly against impossible terrain in the same tick.

A failed attempt should leave the spawner below cap and retry on a later eligible update.

## Timer behavior to preserve

Current semantics are:

- while at cap, `daysSinceLastRespawn = 0`;
- empty habitats use `EMPTY_HABITAT_RESPAWN_MULTIPLIER`;
- large `dayDelta` may fill multiple genuinely empty slots;
- non-active and `Infinity` spawners do not respawn.

Preserve those semantics.

Important subtlety: the "empty" multiplier should now use **logical ordinary occupancy**, not spatial proximity. A managed animal roaming far away still means the habitat is not logically empty.

## Recovery is intentionally different

Do not reuse logical membership for `tickSpawnPointRecovery()`.

Recovery deliberately asks whether same-kind animals are physically nearby within `SPAWNER_RADIUS`. That is ecological recolonization/local presence, not owned-population accounting.

The existing recovery loop in `createFauna()` should remain positional.

This distinction is the central architecture constraint of the fix:

- replenishment cap = logical managed membership;
- recovery eligibility = nearby same-kind locality.

## Death / removal lifecycle

`handleAnimalDeath()` currently:

1. resolves `spawnerId` through `animalToSpawner`;
2. removes that mapping exactly once;
3. increments `deathsThisCycle` while active;
4. may deplete the spawner.

Preserve this.

Do not add a second death decrement counter in `updateSpawners()`.

An ordinary managed corpse should not count as live occupancy because the membership count is derived from alive agents only.

## Initial and respawn creation

`spawnAgent(..., spawnPointId)` already:

- assigns the same `spawnPointId` to the agent;
- records `animalToSpawner.set(animalId, spawnPointId)`.

Reuse this exact path for respawns. Do not special-case newly spawned membership elsewhere.

## Tests to update

`src/fauna/AnimalSpawner.test.ts` currently encodes the old positional API. Update those tests to the logical occupancy contract.

High-value cases:

1. logical count at cap prevents respawn regardless of position;
2. empty logical count uses the longer empty-habitat interval;
3. same-kind population owned by another spawner does not count;
4. persistent reserved slots still reduce ordinary capacity;
5. callback `false` does not increment occupancy;
6. callback `false` stops catch-up attempts for that spawner in the current pass;
7. callback `true` allows multi-slot catch-up up to cap;
8. cap resets timer when logically full.

Add/createFauna-focused coverage where practical for:

- an alive ordinary agent with `spawnPointId` outside `SPAWNER_RADIUS` still blocks replacement;
- a failed dry-site materialization returns failure to `updateSpawners()`.

## Files expected to change

Primary:

- `src/fauna/AnimalSpawner.ts`
- `src/fauna/createFauna.ts`
- `src/fauna/AnimalSpawner.test.ts`

Likely no change needed in:

- `src/fauna/persistentOccupants.ts`
- save schema / persistence;
- `AnimalAgent` itself.

## Pitfalls

- Do not use species-wide live counts.
- Do not count persistent animals twice.
- Do not replace recovery locality with membership authority.
- Do not add per-animal persistence for ordinary managed fauna.
- Do not create a long-lived population cache unless the simple derived count proves insufficient.
- Do not let failed spawn materialization consume multiple catch-up iterations in one pass.
- Do not change depletion thresholds or scenario pressure semantics.

## Suggested implementation order

1. Change `updateSpawners()` input from positional occupancy to logical ordinary occupancy.
2. Change respawn callback to explicit success/failure.
3. Update `createFauna()` to derive ordinary managed live counts from current agents/`spawnPointId`.
4. Return success only after real agent materialization.
5. Update focused spawner tests.
6. Add one integration-level regression around away managed membership if practical.
