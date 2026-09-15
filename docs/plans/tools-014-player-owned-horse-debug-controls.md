# Plan: Player-owned horse debug controls

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** ~~fauna-020~~
**Domain:** `tools`
**Subdomains:** `debug` `diagnostics`
**Tags:** `seedvale.debug` `horse` `ownership` `recovery`
**Roadmap:** -

## Cel

Dodać wąski zestaw narzędzi diagnostycznych do `seedvale.debug` dla player-owned koni, aby szybko odróżnić problem z persistence/streamingiem od normalnego autonomous movement lub śmierci zwierzęcia.

Docelowy UX:

```ts
seedvale.debug.horse.list()
seedvale.debug.horse.teleportToPlayer(animalId?)
seedvale.debug.horse.resurrect(animalId?)
```

API ma działać przez istniejący player-owned/detached livestock lifecycle, nie przez ręczne manipulowanie sceną Three.js.

## Recon

- `fauna-020` wprowadziło authoritative player ownership i detached persistent livestock.
- `src/settlement/livestock.ts` ma `resolveLivePersistentAnimal(...)`, `transferAnimalOwnership(...)`, `setOwnedAnimalControl(...)` oraz registry/origin mapping.
- Player-owned zwierzę może żyć poza loaded source settlement; debug lookup nie może więc ograniczać się do `settlement.livestock` ani `Fauna.getAgents()`.
- Debug resurrect nie może tworzyć nowego konia ani omijać origin/tombstone semantics.

## Zakres

### `horse.list()`

Zwracać plain diagnostic data dla player-owned horse records/live agents, co najmniej:

- `animalId`,
- name,
- owner/control mode,
- alive/dead,
- live vs saved-only jeśli taki stan istnieje,
- origin settlement id,
- world position jeśli live,
- Stay anchor jeśli istnieje,
- hunger/thirst/stamina i water traversal state, jeśli są dostępne przez istniejący public/debug snapshot bez naruszania encapsulation.

Preferować kopię danych, nie zwracać mutable `AnimalAgent`.

### `horse.teleportToPlayer(animalId?)`

- Resolve wyłącznie player-owned live horse przez istniejący persistent-animal lookup.
- Gdy argument jest pominięty i istnieje dokładnie jeden player-owned horse, użyć go; przy wielu zwrócić czytelny błąd/listę kandydatów.
- Ustawić pozycję przez istniejący agent/world movement seam oraz ground snap, nie przez samo `mesh.position.copy(...)` jeśli ominęłoby to state.
- Nie zmieniać ownership, name ani control mode.
- Debug action może zresetować transient movement/trip commitment, jeśli jest to konieczne do spójnego teleportu; nie kasować persistent state bez potrzeby.

### `horse.resurrect(animalId?)`

- Tylko debug/dev command.
- Reuse istniejącego persistent record/origin identity; nie tworzyć nowego deterministic merchant-horse slotu.
- Jeśli corpse/live dead agent nadal istnieje, przywrócić ten sam individual identity przez explicit fauna debug seam.
- Jeśli agent został już usunięty i istnieje tombstone/saved origin, resurrection musi odwrócić właściwy persistence state atomowo zamiast tylko spawnąć duplikat.
- Przywrócić sensowne minimum health/stamina oraz alive lifecycle state; nie resetować ownership/name/control mode.
- Zwracać wynik diagnostyczny (`ok`, reason, animalId), nie tylko logować.

## Architecture

Preferowany układ:

- domena fauna/livestock dostarcza małe debug-safe operations/snapshots nad istniejącym ownership/persistence state,
- istniejący `seedvale.debug` composition layer tylko eksponuje namespace `horse`,
- brak debug-specific authoritative state.

Nie tworzyć `HorseManager`.

## Relevant files

- existing `seedvale.debug` registration/composition files discovered during implementation recon
- `src/settlement/livestock.ts`
- `src/settlement/SettlementsManager.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/ownedAnimalControl.ts`
- `src/persistence/saveData.ts` tylko jeśli resurrection wymaga istniejącego tombstone mutation contract

## Verification

Automated:

- list obejmuje detached player-owned horse,
- teleport nie zmienia identity/ownership,
- no-id convenience działa tylko dla jednoznacznego horse,
- resurrection nie tworzy dwóch agentów o tym samym `animalId`,
- save snapshot po resurrection zawiera jeden poprawny player-owned record i brak konfliktującego tombstone.

Manual browser verification wykonuje User przez devtools/`seedvale.debug`.

Przy debug-safe publicznych helperach dodać JSDoc z `@domain tools` lub `@domain fauna` zgodnie z ownershipem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
