# Implementation notes: fauna-018 persistent habitat occupants

## Current codebase facts

- `src/fauna/createFauna.ts` owns ordinary wild-fauna creation and habitat-spawner replenishment. Ordinary `animalId` is still `${kind}-${nextAnimalId++}` and therefore cannot be reused as persistent identity.
- `PreySpawner.id` is already deterministic and survives rebuild/save-load. `AnimalAgent.spawnPointId` links spawned animals back to that habitat.
- `src/fauna/AnimalSpawner.ts:updateSpawners()` currently counts only **live same-kind animals within `SPAWNER_RADIUS` (12)**. This is insufficient for persistent occupancy: a resident that temporarily leaves home for roaming/trips would look like a vacancy and could receive a replacement.
- `createFauna()` currently fills every active habitat immediately to `maxPreyCount`, then later replenishes it through `updateSpawners()`. Persistent declarations therefore must be applied before generic habitat filling/replenishment decides how many ordinary slots are available.
- `AnimalAgent.snapshot()` / `hydrate()` is the correct state seam and is already proven by livestock persistence. `AnimalSaveState` currently stores position/yaw, HP/dead, hunger/thirst/stamina ratio, production state and corpse `{ timeSinceDeath, meatHarvested }`; transient target/path/trip/action/animation state is intentionally absent.
- `rabid` is **not** currently part of `AnimalSaveState`. Persistent occupants need it; extend the shared snapshot instead of adding a persistent-wild-only disease field.
- Corpse phase itself is not persisted. `hydrate()` restores `timeSinceDeath`/`meatHarvested`; presentation/phase is re-derived. Keep this contract.
- Livestock persistence in `src/settlement/livestock.ts` is the closest lifecycle pattern: live snapshots + immediate tombstone when `readyToRemove()` becomes true + deterministic reconstruction that respects tombstones. Reuse the pattern, not settlement/household ownership.
- `SaveData` is currently version 6 and the current repository rule is to bump schema version when persisted representation/semantics change. The plan's older-save wording should not bypass the migration pipeline.

## Recommended ownership / data shape

Keep the registry fauna-owned and small. Do not add a `NotableAnimalManager`.

Prefer a dedicated fauna module such as `src/fauna/persistentOccupants.ts` containing pure identity/registry helpers and serializable types, while `createFauna.ts` remains the composition point that instantiates `AnimalAgent`s.

Suggested conceptual contracts:

```ts
type PersistentOccupantDecl = {
  habitatId: string
  occupantKey: string
  kind: AnimalKind
}

type PersistentOccupantSaveRecord = {
  habitatId: string
  occupantKey: string
  animalId: string
  kind: AnimalKind
  state: AnimalSaveState
}
```

Keep tombstones keyed by the logical slot (`habitatId + occupantKey`), not only by runtime `animalId`. The slot identity is the authoritative fact that must stay unavailable after removal.

Use one stable identity helper, e.g. a namespaced string derived only from `habitatId` + `occupantKey`. Do not include spawn order. `kind` should be validated against the declaration on restore rather than trusted as the identity source.

The generic key should remain `habitatId`, not `spawnerId`, so `fauna-019` can later bind the same mechanism to a real cave identity without redesigning persistence. Existing `PreySpawner.id` is simply the first usable habitat id source.

## Habitat occupancy semantics

Do not derive persistent occupancy from distance or current nearby population.

For each habitat, distinguish:

- ordinary capacity,
- declared persistent slots,
- current state of each persistent slot: live/dead-corpse/removed.

A persistent slot consumes capacity in **all** three states. A resident temporarily away from home still owns the slot. A corpse still owns it. A tombstone permanently blocks it.

Therefore adjust initial habitat fill and `updateSpawners()` around an explicit effective ordinary capacity, conceptually:

```text
ordinaryCapacity = maxPreyCount - persistentSlotCount
```

Then count/proximity logic only decides replenishment of those ordinary slots. Do not let a traveling persistent resident influence whether its own slot is recreated.

Be careful with the current death accounting: `handleAnimalDeath()` removes `animalToSpawner` immediately on death and increments `deathsThisCycle`. That is fine for depletion, but it must not be interpreted as freeing the persistent slot. Slot release never occurs; it transitions to corpse, then tombstone.

## Runtime lifecycle

During creation/reconstruction:

1. Build stable habitat declarations.
2. For each persistent slot:
   - tombstone → create nothing;
   - saved state → create the declared kind with the stable id, then `hydrate()` before first update;
   - no saved state → create once from the declaration with stable id.
3. Register the persistent agent in normal `agents` and normal spawner death accounting where applicable.
4. Fill only remaining ordinary habitat capacity.

When pruning `readyToRemove()` agents in `createFauna.update()`, mark a persistent slot removed **before** `disposeAgent()`/array removal. This is the equivalent of livestock's immediate `markRemoved()` and is required for in-session `WorldBundle` rebuild safety even before the next save.

Expose a small snapshot/serialize method from `Fauna` for persistent occupants. `SaveState.buildSaveData()` should read it directly from `bundle.fauna`, analogous to the existing spawner snapshot path.

## WorldBundle rebuild integration

`Fauna` itself is recreated during `WorldBundle` rebuild. Persisted occupants therefore need the same two reconstruction inputs as other carried world state:

- real save/load input from `SaveData`,
- in-session carried snapshot taken from the old `bundle.fauna` before disposal.

Do not rely solely on `SaveData`; config-triggered rebuilds happen without a save. Add a carried persistent-occupant snapshot in `rebuildWorldBundle()` alongside the existing carried spawner/settlement/world state and pass it into `buildFauna()` / `createFauna()`.

Keep this as plain serializable data, never old `AnimalAgent` references.

## `AnimalSaveState` / rabies

Extend the shared snapshot with rabies state and let livestock automatically benefit from the same round-trip.

Prefer making the new current-schema field explicit and migrating old livestock records to `rabid: false`, rather than creating a second disease persistence path. `hydrate()` must assign it before the first update.

Do not add trip/path/chase target persistence. Current `AnimalTrip` is deliberately transient; after load a persistent animal keeps durable biological/lifecycle state and resumes normal decision-making from there.

## Save schema

Relevant files:

- `src/persistence/saveData.ts`
- `src/app/saveState.ts`
- `src/app/createApp.ts`
- `src/app/worldBundle.ts`

Add one sparse fauna collection for persistent occupants/tombstones; do not add all wild animals.

Because this changes the persisted schema, follow the current `CURRENT_SAVE_VERSION` + `SAVE_MIGRATIONS` contract. A v6→v7 migration can default the new persistent-occupant collection to empty and default existing livestock animal snapshots to non-rabid. Runtime interpretation of an absent persistent record remains "declared occupant has never been saved yet → create fresh once".

Update the save validator for:

- stable slot ids / strings,
- `AnimalKind`,
- `AnimalSaveState`, including corpse consistency,
- tombstone representation.

Do not silently accept a saved `kind` that conflicts with the current declaration; prefer ignoring/rejecting that record and following the repository's existing validation policy rather than hydrating the wrong species.

## Integration points to reuse

- `src/fauna/createFauna.ts`
  - `spawnAgent()` should gain a way to receive an explicit stable `animalId`; ordinary callers continue using `nextAnimalId`.
  - persistent creation must still use the same templates, `AnimalAgent`, death callback, scene registration and `spawnPointId` linkage.
- `src/fauna/AnimalSpawner.ts`
  - keep current timer/depletion/recovery mechanics;
  - change only the capacity/occupancy seam needed so persistent slots are not represented by proximity counts.
- `src/fauna/AnimalAgent.ts`
  - reuse `snapshot()`/`hydrate()` and `readyToRemove()`;
  - extend shared durable state with rabies only.
- `src/settlement/livestock.ts`
  - reference implementation for capture/tombstone semantics; do not import its registry into fauna.
- `docs/plans/fauna-016...` implementation
  - persistent animals must continue using normal roaming, water trips and habitat behaviour; persistent status must not create a movement special case.
- `quests-progression-008` / future `fauna-019`
  - they should consume declaration/lookup by stable habitat + occupant key; they must not own alive/dead/HP state.

## Pitfalls

- **Do not use nearby count as slot ownership.** A resident away from the cave/home would otherwise be duplicated.
- **Do not tombstone on death.** Save during corpse lifetime must restore the corpse.
- **Do not wait until save to tombstone.** `readyToRemove()` must mutate the runtime registry immediately or rebuild can resurrect the animal.
- **Do not let generic initial fill run first.** Otherwise the restored persistent resident becomes `maxPreyCount + 1` or displaces an arbitrary ordinary animal.
- **Do not make persistent identity depend on species spawn counters or order.**
- **Do not persist terrain-derived Y, pathfinding, current target, trip state, combat target or animation.**
- **Do not couple the registry to settlements.** Current spawners are settlement-derived, but future real-cave habitats are world/fauna-owned.
- Review `isWolfDenCleared()` assumptions if persistent occupants are ever used for wolf-den packs: it currently tracks the ids created in the current build, not a general habitat-slot registry. No broad refactor is needed for the bear use case.

## Focused implementation order

1. Add persistent slot identity/types/registry and explicit-id support in `spawnAgent()`.
2. Extend `AnimalSaveState` with rabies and update shared snapshot/hydration tests.
3. Integrate declared occupants into habitat initial fill and ordinary-capacity accounting.
4. Tombstone at `readyToRemove()` and expose fauna snapshot/restore.
5. Wire in-session `WorldBundle` carry.
6. Add `SaveData` v7 migration/validation + `SaveState`/load wiring.
7. Add focused tests for travel-away occupancy, corpse restore and rebuild-before-save resurrection prevention in addition to the plan's listed cases.

The most important invariant is: **persistent slot ownership is independent of the animal's current distance from home and survives live → corpse → tombstone without ever becoming an ordinary respawn vacancy.**
