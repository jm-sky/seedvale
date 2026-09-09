# Implementation notes: fauna-018 persistent habitat occupants

## Recon baseline

Focused recon wykonany 2026-09-09 na aktualnym `main`, po dużym refaktorze `fauna-017`.

Planowa koncepcja pozostaje właściwa: potrzebny jest sparse, fauna-owned mechanizm stable habitat occupant identity + `AnimalSaveState` persistence + permanent tombstone. Nie ma potrzeby redesignu całej fauny ani cofania `fauna-017`.

Najważniejsza zmiana względem poprzednich notes: `AnimalAgent` nadal integruje pojedynczego runtime agenta i nadal posiada persistence seam, ale lifecycle/foraging/roaming mają już kanoniczne moduły. Implementacja `fauna-018` musi się do nich dopasować zamiast dopisywać równoległe mechanizmy do klasy.

## Current codebase facts

### `src/fauna/createFauna.ts`

- Nadal jest composition root dla ordinary wild fauna i habitat spawners.
- `Fauna` obecnie expose'uje `update()`, `dispose()`, `resolveTimeSkip()`, `getAgents()`, `getSpawners()`, `isWolfDenCleared()`, marker/destroy-spawner API — brak persistent-individual snapshot API.
- Ordinary `animalId` nadal powstaje lokalnie w `spawnAgent()` jako `${kind}-${nextAnimalId++}`. Ten counter jest per-build i nie może być stable identity dla persistent occupant.
- `spawnAgent()` już centralizuje normalny `AnimalAgent` construction, visuals/assets, scene registration oraz optional `spawnPointId` → `animalToSpawner` binding. Persistent creation powinno wejść przez ten sam seam z optional explicit `animalId`, nie tworzyć drugiego spawn path.
- `handleAnimalDeath()` nadal odłącza `animalToSpawner` i zasila istniejące spawner death/depletion accounting. Persistent slot ownership nie może być z tego inferowane.
- Removal odbywa się w `Fauna.update()` przez `agents.some(a => a.readyToRemove())`, `disposeAgent(a)` i odfiltrowanie tablicy. To jest właściwy seam na immediate persistent tombstone **przed** disposal.
- `updateSpawners()` nadal dostaje projection tylko żywych agentów (`!a.isDead()`) jako `{ kind, x, z }`. Persistent occupancy nie może opierać się na tej projection, bo resident może odejść od domu albo być corpse.

### `src/fauna/AnimalSpawner.ts`

- `PreySpawner.id` pozostaje stabilnym identity obecnego habitat/spawn pointu.
- Spawn-point lifecycle ma własny persisted state przez `SavedSpawnPointState` / `snapshotSpawnPointState()` / `restoreSpawnPointState()`.
- `updateSpawners()` pozostaje właścicielem timer/depletion/recovery/replenishment mechanics; `fauna-018` powinien rozszerzyć wyłącznie capacity/occupancy seam.
- Obecny nearby/live population model nie wystarcza dla persistent slot ownership. Persistent resident fizycznie poza `SPAWNER_RADIUS`, corpse albo tombstone nadal musi zajmować logiczny slot.

### `src/fauna/AnimalAgent.ts` po `fauna-017`

`AnimalAgent` nadal jest poprawnym runtime integration ownerem pojedynczego zwierzęcia i nadal zawiera:

- `animalId`,
- `spawnPointId`,
- `snapshot()` / `hydrate()` przez `AnimalSaveState`,
- `isDead()`,
- `readyToRemove()`,
- normalny update/combat/movement integration.

Nie należy jednak dopisywać do niego nowych ownerów subsystemów. Po `fauna-017` kanoniczne moduły to:

- `src/fauna/AnimalLife.ts` — hunger/thirst/stamina/biological state helpers,
- `src/fauna/animalCorpse.ts` — corpse/remains/decay/rabies exposure/claim/removal lifecycle,
- `src/fauna/animalForaging.ts` — source selection/validation/relief i `SourceTarget`,
- `src/fauna/animalRoaming.ts` — roaming/water-trip logic i `AnimalTrip`,
- `src/fauna/animalDefs.ts` — taxonomy/species definitions.

`AnimalAgent.ts` re-exportuje część tych modułów compatibility-only. Nowy kod powinien importować kanoniczne symbole bezpośrednio tam, gdzie to ma sens.

`AnimalSaveState` pozostaje wspólnym persistence contractem dla agentów. Implementacja musi ponownie przeczytać dokładny aktualny shape przed zmianą. Nie persistować `SourceTarget`, `AnimalTrip`, paths/nav rescue, combat targets, action/animation state.

### Existing persistence precedents

#### Livestock

`src/settlement/livestock.ts` nadal daje wzorzec:

```text
stable deterministic individual identity
+ AnimalSaveState
+ live capture
+ removed/tombstone ids
+ reconstruction
```

Jest jednak settlement/household-owned, więc nie jest właściwym ownerem persistent wild inhabitants.

#### Settlement rats — nowy ważny precedent

`src/settlement/ratPersistence.ts` i `src/settlement/rats.ts` są bliższym lifecycle patternem dla wild fauna:

- `RatSaveRecord = AnimalSaveState + settlementId + animalId`,
- registry posiada `capture()`, `serialize()`, `getSaved()`, `getRemoved()`, `markRemoved()`,
- restore tworzy normalny `AnimalAgent` i następnie wywołuje `hydrate()`,
- `createSettlementRats.update()` wywołuje `markRemoved()` **przed** dispose, gdy `readyToRemove()` jest true.

Reuse tego wzorca powinien być koncepcyjny. Persistent habitat occupants są fauna-owned, nie `SettlementsManager`-owned.

### Persistence / save schema

- `src/app/saveState.ts::buildSaveData()` jest jedynym assembly pointem live `SaveData`.
- Obecnie pobiera `spawnPoints` bezpośrednio z `bundle.fauna.getSpawners()` i `snapshotSpawnPointState()`.
- Livestock/rats są capture'owane przez `SettlementsManager` (`snapshotLivestock()`, `snapshotRats()`). Persistent habitat occupants nie powinny iść tą drogą; snapshot ma pochodzić z `bundle.fauna`.
- `src/persistence/saveData.ts` ma obecnie `CURRENT_SAVE_VERSION = 18` i obowiązujący sequential `SAVE_MIGRATIONS` contract. Nie hardcodować `v7` ani żadnego numeru w implementacji; sprawdzić HEAD i wykonać `current → current+1`.
- Jeżeli `AnimalSaveState` zostanie rozszerzony o durable field (np. rabies, jeśli nadal go brakuje), migration musi poprawnie defaultować **wszystkie** istniejące persisted `AnimalSaveState` consumers, obecnie co najmniej livestock i rats.

### `src/app/worldBundle.ts`

`buildFauna()` jest właściwym composition boundary. Obecnie przekazuje do `createFauna()` m.in.:

- `homeDef.id`, seed i settlement geometry,
- terrain/water/road queries,
- `initialSpawnerState`,
- grass forage service.

`rebuildWorldBundle()` już wykonuje poprawny in-session carry dla spawn-point lifecycle:

```text
bundle.fauna.getSpawners()
→ snapshotSpawnPointState
→ bundle.fauna.dispose()
→ build new world with carriedSpawnerState
```

Persistent occupant registry potrzebuje analogicznego plain-data carry wykonanego **przed** `bundle.fauna.dispose()`. Gdy `resetCollectedItems === true`, carry ma zostać wyzerowane tak jak inne genuinely-new-world state.

## Recommended ownership / data shape

Preferować nowy mały moduł:

`src/fauna/persistentOccupants.ts`

Nie jest to nowy manager symulacji. Powinien zawierać przede wszystkim serializowalne typy, stable-key helpers i sparse registry state.

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

type PersistentOccupantSnapshot = {
  entries: PersistentOccupantSaveRecord[]
  removedSlots: string[]
}
```

Nazwy są orientacyjne; ważniejszy jest ownership i invariant.

Stable logical key powinien wynikać wyłącznie z:

```text
habitatId + occupantKey
```

Tombstone keyed po logical slot jest bezpieczniejszy niż tombstone tylko po `animalId`: authoritative fact brzmi „ten slot miał swojego persistent mieszkańca i jego lifecycle się zakończył”.

`kind` powinien być walidowany względem aktualnej declaration przy restore. Nie pozwalać saved recordowi po cichu zmienić species zadeklarowanego occupanta.

## Habitat identity

Dla obecnych spawn-point habitats `PreySpawner.id` jest gotowym stable `habitatId`.

Nie nazywać publicznego kontraktu wyłącznie `spawnerId`, ponieważ przyszły real cave habitat z `fauna-019` może mieć własne world-stable identity niezależne od obecnego prop/spawner implementation.

Dobra granica:

```text
persistentOccupants knows habitatId
current createFauna adapter may source it from PreySpawner.id
future cave integration may source it from cave/habitat identity
```

Nie hashować pozycji floating-point jako podstawowego identity.

## Stable animal id

Dodać jeden deterministic helper, np. konceptualnie:

```text
persistentAnimalId(habitatId, occupantKey)
```

Id musi być namespaced tak, aby nie kolidowało z ordinary `${kind}-${nextAnimalId++}` ani między habitatami.

Nie zmieniać identity strategy zwykłej wild fauna.

`spawnAgent()` w `createFauna.ts` powinien przyjmować optional explicit id:

```text
ordinary caller
→ no explicit id
→ existing nextAnimalId path

persistent caller
→ stable explicit id
→ same AnimalAgent construction path
```

Nie duplikować loaderów/assets/death callback/scene registration.

## Initial construction order

Najważniejszy ordering invariant:

**persistent declarations/restore muszą zostać rozstrzygnięte przed generic habitat initial fill.**

Reconstruction:

1. Zbuduj deterministic habitat declarations.
2. Zarejestruj persistent slots w registry.
3. Dla każdego slotu:
   - tombstone → nic nie twórz,
   - saved record → spawn stable id + `hydrate()` przed first update,
   - brak recordu → first spawn stable id.
4. Dopiero potem wypełnij ordinary habitat capacity.
5. `updateSpawners()` później replenishes tylko ordinary capacity.

Jeżeli generic fill wykona się pierwszy, restored persistent resident może dać `maxPreyCount + 1` albo przypadkowo wypchnąć zwykłego osobnika.

## Explicit habitat occupancy seam

Nie reprezentować persistent ownership przez proximity count.

Dla każdego habitat logicznie istnieją:

- `maxPreyCount`,
- `persistentSlotCount`,
- ordinary respawn capacity,
- registry state każdego persistent slotu: live/corpse/removed.

Persistent slot konsumuje capacity w każdym z tych stanów.

Konceptualnie:

```text
ordinaryCapacity = max(0, maxPreyCount - persistentSlotCount)
```

`AnimalSpawner.updateSpawners()` nadal może używać aktualnej live-nearby projection do liczenia **ordinary** population. Nie może na tej podstawie stwierdzać, że persistent slot jest wolny.

Nie dodawać per-frame scan po registry, jeśli capacity można wyliczyć/lookupnąć po `spawner.id` z małej mapy.

## Death / corpse / removal lifecycle

Po `fauna-017` corpse semantics są kanonicznie w `animalCorpse.ts`, ale `AnimalAgent.readyToRemove()` pozostaje właściwym integration seam.

Lifecycle persistent occupant:

```text
live
→ normal death path
→ dead/corpse still persisted as same occupant
→ normal animalCorpse lifecycle
→ readyToRemove() true
→ registry.markRemoved(slot)
→ dispose/remove agent
→ tombstone persists forever unless future explicit gameplay rule says otherwise
```

Nie tombstonować w `handleAnimalDeath()`: spawner death accounting i persistent logical slot to dwa różne fakty.

Nie czekać z tombstone do następnego save. Rat persistence już pokazuje poprawny pattern: `markRemoved()` przed disposal.

## Durable state / `AnimalSaveState`

Nie projektować drugiego persistent-wild snapshotu. `PersistentOccupantSaveRecord.state` ma być normalnym `AnimalSaveState`.

Przed implementacją sprawdzić aktualny type i `snapshot()`/`hydrate()` po wszystkich zmianach na `main`.

Jeżeli `rabid` nadal nie round-tripuje, rozszerzyć wspólny snapshot i migration. Nie dodawać pola `rabid` tylko do `PersistentOccupantSaveRecord`, bo stworzyłoby to drugi owner disease persistence.

Nie persistować:

- `animalForaging.SourceTarget`,
- `animalRoaming.AnimalTrip`,
- active paths/nav rescue,
- chase/flee target,
- current action/behaviour phase,
- animations,
- terrain-derived Y.

Po hydration normalne `AnimalLife`, `animalForaging`, `animalRoaming`, combat/decision systems mają ponownie wybrać dalsze działania.

## Fauna API

Rozszerzyć `Fauna` minimalnie o snapshot potrzebny persistence/rebuild, np. konceptualnie:

```ts
snapshotPersistentOccupants(): PersistentOccupantSnapshot
```

Ewentualny stable lookup dla późniejszych consumers może być dodany tylko jeśli jest potrzebny przez ten plan/testy; nie budować szerokiego notable-animal API na zapas.

Registry state powinien być dostępny wewnątrz `createFauna()` bez wystawiania mutowalnych map na zewnątrz.

## Save/load wiring

Relevant current files:

- `src/fauna/persistentOccupants.ts` — new sparse registry/types/helpers,
- `src/fauna/createFauna.ts` — declaration/restore/spawn/removal integration,
- `src/fauna/AnimalSpawner.ts` — narrow ordinary-capacity seam,
- `src/fauna/AnimalAgent.ts` — shared snapshot/hydration only if durable-state gap exists,
- `src/fauna/AnimalLife.ts`, `animalCorpse.ts`, `animalForaging.ts`, `animalRoaming.ts` — reuse, do not refactor back into agent,
- `src/app/worldBundle.ts` — build + rebuild carry,
- `src/app/saveState.ts` — snapshot into `SaveData`,
- `src/persistence/saveData.ts` — schema, validator, migration,
- `src/settlement/ratPersistence.ts` / `rats.ts` — reference lifecycle pattern,
- `src/settlement/livestock.ts` — reference stable-individual persistence pattern.

### Save path

```text
SaveState.buildSaveData()
→ bundle.fauna.snapshotPersistentOccupants()
→ SaveData.persistentHabitatOccupants / removed slots (exact naming TBD)
```

Nie routować tego przez `SettlementsManager`.

### Real load path

```text
SaveData
→ createWorldBundle/buildWorldSystems
→ buildFauna(initialPersistentOccupants)
→ createFauna(...)
→ registry restore
→ stable agent creation + hydrate
```

### In-session rebuild path

```text
rebuildWorldBundle()
→ snapshot persistent occupants before fauna.dispose()
→ resetCollectedItems ? undefined/empty : carried snapshot
→ build new fauna with carried snapshot
```

Plain serializable state only; żadnych old `AnimalAgent` references.

## Save schema / migration

Recon baseline: `CURRENT_SAVE_VERSION = 18`.

Implementation rule:

1. Re-read current value at implementation time.
2. Add one next migration (`N → N+1`).
3. Default new persistent occupant entries/tombstones to empty.
4. Update `SaveData` validator.
5. Jeżeli wspólny `AnimalSaveState` zyskuje field, migrate/default existing livestock + rats records too.
6. Preserve fail-closed validation policy.

Nie wpisywać do planu implementacyjnego założenia, że konkretny next version to `19`; `main` może zmienić schema wcześniej.

## `AnimalSpawner` integration guardrails

Zmiana ma być wąska:

- zachować `PreySpawner` state machine,
- zachować depletion/recovery timers,
- zachować ordinary respawn location logic,
- nie robić quest-specific checks,
- nie specjalizować po `bear`,
- nie uzależniać slotu od current distance resident → home,
- nie zwalniać persistent slotu po death,
- nie zwiększać `maxPreyCount` dla persistent resident.

Najbardziej naturalny seam to jawna informacja o ordinary capacity lub reserved persistent-slot count keyed po habitat id. Dokładna sygnatura powinna wynikać z aktualnego `AnimalSpawner.ts` w implementation preflight.

## `handleAnimalDeath()` interaction

Obecne death callback accounting może pozostać bez zmian dla depletion semantics.

Ważne rozdzielenie:

```text
animalToSpawner/deathsThisCycle
= spawn-point ecological/depletion accounting

persistent slot registry
= logical individual continuity
```

Death może usunąć mapping używany do spawner accounting, ale nie może uwolnić persistent slotu. Slot pozostaje reserved przez corpse, a później tombstone.

## Normal behaviour after hydrate

Persistent status nie powinien pojawiać się w scoring/decision branches `AnimalAgent.update()`.

Persistent resident nadal korzysta normalnie z:

- `AnimalLife`,
- `animalForaging`,
- `animalRoaming`,
- predator/prey behaviour,
- water traversal,
- combat/flee,
- `animalCorpse`.

Nie dodawać `if (persistent) stayNearHome` ani osobnego movement mode.

## Focused tests

Najbardziej wartościowe test seams:

### Pure registry / identity

- stable slot key,
- stable `animalId`,
- niezależność od `nextAnimalId`,
- tombstone blocks reconstruction,
- kind/declaration mismatch validation.

### `AnimalSpawner.test.ts`

- persistent slot redukuje ordinary capacity,
- resident poza nearby radius nie tworzy vacancy,
- corpse nie tworzy vacancy,
- tombstone nie tworzy vacancy,
- ordinary slots nadal replenish normally.

### `AnimalAgent` / lifecycle tests

- `AnimalSaveState` durable fields round-trip,
- corpse state round-trip,
- shared disease field round-trip, jeżeli dodany,
- transient `SourceTarget` / `AnimalTrip` nie jest wymagany do hydration.

### `createFauna` focused integration

- declaration restore before generic initial fill,
- explicit stable id używa normalnego spawn path,
- `readyToRemove()` marks tombstone before disposal,
- snapshot + reconstruct does not duplicate resident.

### `worldBundle` / persistence

- carried snapshot survives same-world rebuild,
- new-world rebuild resets it,
- migration defaults collection/tombstones,
- save/load restores live/corpse/removed states.

## Pitfalls

- **Nie dodawaj lifecycle z powrotem do `AnimalAgent`.** `fauna-017` wyznaczył canonical modules.
- **Nie używaj nearby count jako persistent ownership.** Roaming/foraging/trips celowo odprowadzają zwierzę od home.
- **Nie tombstonuj na death.** Corpse musi round-tripować.
- **Nie czekaj do save z tombstone.** `readyToRemove()` → `markRemoved()` przed dispose.
- **Nie uruchamiaj generic fill przed persistent restore.** Powstanie duplicate/over-capacity.
- **Nie persistuj `SourceTarget` ani `AnimalTrip`.** Są transient execution state.
- **Nie podpinaj registry do `SettlementsManager`.** Rats są tylko patternem, nie ownerem.
- **Nie zakładaj save version 6/7/9.** Recon baseline ma v18; implementation musi czytać aktualny HEAD.
- **Nie twórz `NotableAnimalManager`.** Stable persistent occupant jest fauna conceptem, notable/quest meaning jest osobną warstwą.
- **Nie rozwiązuj real-cave navigation w tym planie.** `fauna-019`/quest consumer ma użyć gotowego identity/persistence contractu.
- `isWolfDenCleared()` nadal ma własne semantics oparte o wilki utworzone przez den. Nie refaktorować go szeroko dla bear use case; wrócić do niego dopiero, jeśli persistent pack rzeczywiście stanie się consumerem.

## Focused implementation order

1. Re-read current `AnimalSaveState`, `spawnAgent()`, `AnimalSpawner.updateSpawners()` i current save version.
2. Dodać `persistentOccupants.ts`: stable slot/id helpers, records, registry + pure tests.
3. Dodać explicit-id seam do istniejącego `createFauna.ts::spawnAgent()` bez duplikowania construction path.
4. Zintegrować declarations/restore **przed** generic habitat initial fill.
5. Dodać explicit persistent-slot reservation / ordinary-capacity seam do `AnimalSpawner` i testy resident-away/corpse/tombstone.
6. W `Fauna.update()` markować persistent tombstone przed disposal na `readyToRemove()`.
7. Dodać `Fauna.snapshotPersistentOccupants()` oraz same-session carry w `rebuildWorldBundle()`.
8. Dodać `SaveData` collection + validator + next sequential migration + `SaveState.buildSaveData()`/load wiring.
9. Jeżeli recon potwierdzi brak durable disease state w `AnimalSaveState`, rozszerzyć wspólny snapshot/hydrate i migrate existing livestock/rats records.
10. Uruchomić focused unit/integration tests + repo build/typecheck zgodnie z bieżącymi skryptami. Browser verification pozostaje po stronie użytkownika.

Najważniejszy invariant:

**persistent slot ownership jest niezależny od aktualnej pozycji agenta i przechodzi ciągle przez live → corpse → tombstone; żaden etap nie może stać się ordinary respawn vacancy.**
