# Implementation Notes: Player-owned animal Stay safety and recovery

**Plan:** `fauna-030-player-owned-animal-stay-safety-and-recovery.md`  
**Reviewed against:** `main`, 2026-09-15

## Recon conclusion

`fauna-020` już rozwiązało ownership/persistence. Player-owned livestock jest odpinane od settlement array, trzymane w detached collection i odtwarzane przez `restoreDetachedPlayerOwnedLivestock(...)`. Nie tworzyć nowego managera ani drugiego persistence path. Problem leży w semantyce `Stay`: `OwnedAnimalControlState` persistuje `stayAnchor`, ale `resolveOwnedControlMovement(...)` dla `stay` tylko zwraca `{ kind: 'stay' }`; anchor nie generuje return movement. Jednocześnie normalne needs/threat nadal mogą przejąć ruch.

## Existing mechanisms to reuse

- `OwnedAnimalControlState`, `setOwnedAnimalControlMode(...)`, `snapshotOwnedAnimalControl(...)`, `hydrateOwnedAnimalControl(...)`.
- `AnimalAgent` jako owner live state i integrator needs/roaming/trips/water traversal.
- `animalForaging.ts` — istniejący food/water source selection.
- `animalRoaming.ts` — `AnimalTrip`, water-trip destination/cooldown.
- `transferAnimalOwnership(...)`, `resolveLivePersistentAnimal(...)`, `setOwnedAnimalControl(...)`, `restoreDetachedPlayerOwnedLivestock(...)` w `settlement/livestock.ts`.
- `LivestockRegistry.upsert(...)` + origin settlement mapping.

## Implementation decisions

1. Dodać w `ownedAnimalControl.ts` pure resolver return-to-anchor z hysteresis i bounded excursion radius. `Stay` ma rozróżniać: within anchor band -> brak control movement; outside -> return target.
2. W `AnimalAgent` wpiąć return-to-anchor w normal-behaviour fallback **po** threat/safety override i po aktywnej potrzebie, ale **przed** ordinary wander. To zachowuje założenia `fauna-020`.
3. Routine `AnimalTrip` nie może zostać rozpoczęty, gdy player-owned animal jest w `stay`. Nie kasować aktywnego threat/flee ani mounted movement.
4. Needs nadal używają istniejących source selectors. Jeśli źródło jest poza bounded Stay excursion, nie wybierać go jako routine need target; preferować źródło lokalne albo pozostać przy anchorze. Nie dodawać horse-specific water search.
5. Po zakończeniu need/threat normal fallback powinien automatycznie prowadzić do anchoru. Bez teleportu.
6. Persistence nie wymaga nowego schema: `mode` + `stayAnchor` już są snapshot/hydrate. Zmiany schema tylko jeśli recon implementacyjny wykaże brak tych pól w realnym `AnimalSaveState` serialization.
7. Death/removal: zachować existing corpse lifecycle i origin tombstone semantics. Nie odtwarzać deterministic merchant horse po player-owned death.

## Files / symbols

- `src/fauna/ownedAnimalControl.ts` — policy + hysteresis.
- `src/fauna/AnimalAgent.ts` — normal movement arbitration / snapshot-hydrate integration.
- `src/fauna/animalForaging.ts` — source-range filtering tylko przez existing inputs/policy seam.
- `src/fauna/animalRoaming.ts` — trip start gate.
- `src/settlement/livestock.ts` — detached restore/removal tests; nie przebudowywać registry.
- `src/settlement/SettlementsManager.ts` — detached tick/lifecycle call-sites.
- `src/fauna/AnimalAgent.test.ts` + livestock tests.

## Tests to pin

- Stay + snapshot/hydrate zachowuje anchor.
- Stay animal poza return threshold dostaje ruch do anchoru; wewnątrz stop threshold nie oscyluje.
- routine water trip nie startuje w Stay.
- need excursion w dozwolonym promieniu działa, po relief następuje return.
- threat może wyprowadzić dalej, a po threat następuje return.
- transfer merchant horse -> Stay -> settlement unload/save/load -> jedna ta sama player-owned jednostka.
- death/removal nie powoduje duplicate deterministic respawn.

Browser verification wykonuje User.

## Implementation (2026-09-15)

Stay no longer returns a consuming `{ kind: 'stay' }`. `resolveOwnedControlMovement` reuses `resolveFollowHysteresis` against `stayAnchor` (`STAY_RETURN_START` 12 / `STAY_RETURN_STOP` 6) and emits `{ kind: 'returnToAnchor' }` or `{ kind: 'none' }`. `pursueOwnedControl` walks on return and otherwise falls through to local wander. `wander()` skips `tickTrip()` while Stay; `maybeStartWaterTrip` also refuses via `isOwnedStayBlockingRoutineTrips`. Food selection (`findForageTarget` / `findGrassPatchTarget` / grassPatch validation) now honours `withinNeedLeash`. Persistence unchanged (no save-version bump). Deterministic slot skip is `shouldSpawnDeterministicLivestockSlot`.
