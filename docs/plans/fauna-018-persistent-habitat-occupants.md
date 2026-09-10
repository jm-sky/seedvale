# Plan: Persistent habitat occupants

> Implementation landed on `main` 2026-09-10. Automated checks are the
> remaining gate before browser/manual verification (plan § Manual verification).
> No real-cave occupant is declared yet — `quests-progression-008` is the first
> consumer.

**Created:** 2026-09-07
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** fauna-016, fauna-017
**Domain:** `fauna`  
**Type:** `feature`  
**Roadmap:** -

## Cel

Dodać mały, reusable mechanizm trwałej tożsamości i istotnego stanu dla wybranych dzikich zwierząt związanych ze stabilnym habitat/home.

Pierwszym konsumentem jest `quests-progression-008-treasure-map-bear-cave.md`: konkretna realna jaskinia ma konkretnego niedźwiedzia jako mieszkańca. Jeżeli niedźwiedź przeżyje, po save/load nadal jest tym samym zwierzęciem. Jeżeli zginie i zakończy się jego corpse lifecycle, nie może zostać odtworzony przez zwykły habitat respawn.

Mechanizm nie jest quest-owned. Quest nie przechowuje `bearAlive`, HP ani lifecycle zwierzęcia.

Docelowy model:

```text
stable habitat/home
→ persistent occupant declaration
→ stable animal identity
→ normal AnimalAgent simulation
→ AnimalSaveState snapshot / hydrate
→ normal animalCorpse lifecycle
→ permanent occupant tombstone
→ generic habitat spawning respects occupied/removed slot
```

Mechanizm powinien nadawać się później także dla alpha wolf, nazwanego/tracked animal oraz innych zwierząt mających trwałe znaczenie dla historii świata.

## Stan obecny po fauna-017

`fauna-017` nie zmienił podstawowego persistence seam: konkretny osobnik nadal jest zwykłym `AnimalAgent`, a `AnimalAgent.snapshot()` / `hydrate()` nadal round-tripują `AnimalSaveState`.

Nie należy jednak ponownie skupiać logiki w `AnimalAgent`. Po refaktorze kanoniczni właściciele części zachowania są rozdzieleni:

- `src/fauna/AnimalLife.ts` — hunger/thirst/stamina i lifecycle biologiczny,
- `src/fauna/animalCorpse.ts` — corpse/remains/decay/removal lifecycle,
- `src/fauna/animalForaging.ts` — food/water target selection i relief,
- `src/fauna/animalRoaming.ts` — roaming/water-trip state,
- `src/fauna/AnimalAgent.ts` — integracja pojedynczego runtime agenta, `AnimalSaveState`, `snapshot()`, `hydrate()`, `readyToRemove()`.

`createFauna()` nadal jest composition root dla ordinary wild fauna i habitat spawners. Ordinary wild `animalId` nadal powstaje z per-build countera (`${kind}-${nextAnimalId++}`), więc nie jest trwałym identity contractem.

`PreySpawner.id` jest stabilne i posiada persistent lifecycle (`active` / `depleted` / `disabled` / `recovering`). `AnimalAgent.spawnPointId` wiąże agenta ze spawn pointem, a `AnimalSpawner.updateSpawners()` uzupełnia zwykłą populację według aktualnego habitat capacity/population modelu.

Obok livestock istnieje już także persistence settlement rats:

```text
stable individual id
+ AnimalSaveState
+ registry capture / hydrate
+ markRemoved() before disposal
+ SaveData collection + removed ids
→ reconstruct individual without resurrection
```

`src/settlement/ratPersistence.ts` jest szczególnie bliskim precedentem dla wild animals, bo nie niesie livestock ownership semantics. Nie należy jednak przenosić persistent habitat occupants pod `SettlementsManager`: registry tego planu pozostaje fauna-owned.

## Ownership

Persistent wild animal pozostaje częścią systemu fauna.

Nie tworzyć `NotableAnimalManager`, osobnej klasy persistent animal ani quest-owned lifecycle state.

Preferowany ownership:

```text
Fauna
├─ ordinary ephemeral wild population
├─ habitat/spawner lifecycle
└─ persistent habitat occupants
   ├─ stable habitat + occupant identity
   ├─ sparse persistence registry
   └─ normal AnimalAgent instance
      ├─ AnimalLife
      ├─ animalForaging / animalRoaming
      └─ animalCorpse
```

Persistence layer przechowuje serializowalny snapshot, ale nie staje się właścicielem reguł animal lifecycle ani habitat occupancy.

Quest może znać stabilne identity/habitat binding potrzebne do sprawdzania świata, ale nie może posiadać duplikatu stanu zwierzęcia.

## 1. Persistent habitat occupant contract

Wprowadzić mały fauna-owned kontrakt pozwalający zadeklarować konkretny slot mieszkańca stabilnego habitat/home jako persistent.

V1 zakłada, że persistent wild animal zawsze posiada stabilny habitat/home owner.

Identity powinno wynikać wyłącznie ze stabilnego habitat identity oraz stabilnego klucza occupanta:

```text
habitatId + occupantKey
→ stable persistent animalId
```

Nie opierać persistent identity na `nextAnimalId`, runtime spawn order ani aktualnej pozycji zwierzęcia.

`occupantKey` jest częścią kontraktu już w V1, mimo że pierwszy przypadek potrzebuje tylko jednego mieszkańca. Pozwala to później obsłużyć kilka trwałych osobników jednego habitat bez zmiany modelu danych.

Nie wymagać nazwy, questa ani UI markerów. `persistent` opisuje lifecycle/persistence semantics; `notable` pozostaje pojęciem gameplayowym.

Preferować mały moduł typu `src/fauna/persistentOccupants.ts` dla serializowalnych typów, stable-key helpers i registry operations. `createFauna.ts` pozostaje composition root tworzącym realne `AnimalAgent` instances.

## 2. Reuse istniejącego AnimalAgent persistence seam

Nie tworzyć równoległego modelu HP/needs/death dla persistent animals.

Persistent occupant używa normalnego `AnimalAgent` oraz istniejących `AnimalSaveState`, `snapshot()` i `hydrate()`.

Minimalnie zachować przez save/load stan objęty aktualnym wspólnym snapshotem i potrzebny do ciągłości osobnika, w tym:

- pozycję/orientację zgodnie z `AnimalSaveState`,
- health/dead state,
- hunger/thirst/stamina oraz inne durable pools już objęte snapshotem,
- corpse state potrzebny `animalCorpse` do wznowienia lifecycle,
- pozostały istniejący durable individual state.

Przed implementacją ponownie sprawdzić dokładny `AnimalSaveState`. Jeżeli istotny durable disease state, szczególnie `rabid`, nadal nie round-tripuje, rozszerzyć **wspólny** `AnimalSaveState`/`snapshot()`/`hydrate()` zamiast dodawać persistent-wild-only pole.

Nie persistować transient execution state tylko dlatego, że zwierzę jest persistent, w szczególności:

- aktualnego pathfindingu/nav rescue,
- combat/chase targetów,
- bieżącej fazy behaviour/action,
- `SourceTarget` z `animalForaging`,
- aktywnego `AnimalTrip` z `animalRoaming`,
- animation state.

Po load agent ma wznowić normalne decision/foraging/roaming systems z trwałego stanu, bez odtwarzania in-flight akcji.

## 3. Fauna-owned sparse persistence registry

Dodać persistence collection wyłącznie dla persistent habitat occupants.

Rekord powinien identyfikować co najmniej:

```text
habitatId
occupantKey
animalId
kind
AnimalSaveState
```

oraz umożliwiać reprezentację permanentnie usuniętego occupanta.

Nie persystować wszystkich dzikich zwierząt. Ordinary wild fauna pozostaje ephemeral.

Wzorować lifecycle registry na istniejących:

- `src/settlement/livestock.ts`,
- `src/settlement/ratPersistence.ts`.

Reuse dotyczy semantyki `capture → serialize → hydrate → markRemoved`, nie ownership. Nie importować registry szczurów/livestock jako ownera persistent wild fauna i nie uzależniać mechanizmu od `SettlementsManager`.

Tombstone powinien być keyed po logicznym slocie (`habitatId + occupantKey`) lub innym jednoznacznym stable slot key, nie wyłącznie po runtime `animalId`.

## 4. `createFauna()` i reconstruction

Persistent declarations muszą zostać zastosowane **przed** generic initial habitat fill.

`src/fauna/createFauna.ts::spawnAgent()` powinien zachować jeden wspólny spawn path, ale umożliwić jawne przekazanie stable `animalId` dla persistent occupanta. Ordinary callers nadal używają `nextAnimalId`.

Persistent agent musi nadal korzystać z tych samych:

- species templates / visuals,
- `AnimalAgent` constructor,
- scene registration,
- death callback,
- `spawnPointId` binding tam, gdzie habitat jest `PreySpawner`,
- normalnego update/dispose flow.

Restore rozróżnia:

```text
no saved record
→ fresh declaration
→ create occupant once with stable id

saved live/dead/corpse record
→ create same stable individual
→ hydrate before first update

removed tombstone
→ create nothing
→ persistent slot remains unavailable to generic respawn
```

Nie dodawać drugiej ścieżki symulacji persistent animals obok `AnimalAgent`.

## 5. Death, corpse lifecycle i tombstone

Śmierć persistent occupanta przechodzi przez istniejący `AnimalAgent` death path i kanoniczny `animalCorpse.ts` lifecycle.

Nie tombstonować na utracie HP ani w `handleAnimalDeath()`. Martwy agent/corpse nadal jest tym samym persistent occupantem i musi móc zostać zapisany oraz odtworzony.

Tombstone powstaje dopiero, gdy normalny corpse lifecycle doprowadzi `AnimalAgent.readyToRemove()` do `true`.

W `createFauna.update()` persistent registry musi wykonać `markRemoved(slot)` **przed** `disposeAgent()` i usunięciem agenta z `agents`, analogicznie do aktualnego rat lifecycle w `createSettlementRats()`.

To jest wymagane także bez save: runtime registry musi natychmiast wiedzieć, że occupant lifecycle zakończył się permanentnie, aby in-session `WorldBundle` rebuild nie wskrzesił zwierzęcia.

## 6. Habitat population accounting i respawn

Persistent occupant zajmuje normalny slot populacji swojego habitat i nie jest `maxPreyCount + 1`.

Generic initial fill oraz `AnimalSpawner.updateSpawners()` muszą dostać jawny occupancy/capacity seam dla persistent slots.

Persistent slot jest zajęty logicznie we wszystkich stanach:

- live,
- dead/corpse,
- tombstoned/removed.

Zwierzę może fizycznie odejść od habitat przez normalne roaming/foraging/water trips. Nie wolno więc inferować ownership persistent slotu z nearby same-kind count ani z bieżącego dystansu od spawnera.

Konceptualnie ordinary respawn capacity powinna uwzględniać liczbę zadeklarowanych persistent slots, np.:

```text
ordinaryCapacity = maxPreyCount - persistentSlotCount
```

Szczegół API ma pasować do aktualnego `AnimalSpawner.ts`, ale nie należy zastępować obecnego depletion/recovery FSM ani pisać specjalnej logiki dla bear questa.

`handleAnimalDeath()` może nadal obsługiwać istniejące spawner death/depletion accounting; śmierć nie oznacza jednak zwolnienia persistent slotu.

## 7. Save/load i schema migration

Dodać minimalny `SaveData` seam dla persistent habitat occupants i tombstones.

Aktualny codebase ma `CURRENT_SAVE_VERSION = 18` oraz fail-closed `SAVE_MIGRATIONS`. Implementacja nie może zakładać starego numeru wersji. W momencie wdrożenia należy sprawdzić aktualny `CURRENT_SAVE_VERSION`, bumpnąć go o 1 i dodać dokładnie jeden kolejny migration step zgodnie z repo contractem.

`src/app/saveState.ts::buildSaveData()` jest aktualnym assembly pointem `SaveData`. Powinien pobierać sparse snapshot bezpośrednio z `bundle.fauna`, tak jak dziś pobiera `spawnPoints` z `bundle.fauna.getSpawners()`.

`createWorldBundle()` / `buildFauna()` powinny przekazywać restored persistent occupant state do `createFauna()`.

Migration z poprzedniej wersji defaultuje nową collection/tombstones do pustego stanu. Brak saved record dla zadeklarowanego occupanta oznacza wtedy first construction/fresh occupant, bez migracji ordinary wild population.

Jeżeli implementacja rozszerza `AnimalSaveState` o nowy durable field, migracja musi także nadać poprawny default istniejącym `livestock` i `rats` records zamiast tworzyć osobny format tylko dla persistent wild animals.

## 8. In-session `WorldBundle` rebuild

Save/load nie jest jedyną granicą reconstruction.

`src/app/worldBundle.ts::rebuildWorldBundle()` już przed `bundle.fauna.dispose()` snapshotuje `PreySpawner` lifecycle do `carriedSpawnerState`. Persistent occupants potrzebują analogicznego plain-data carry:

```text
old bundle.fauna
→ snapshot persistent occupant registry
→ dispose old fauna
→ buildFauna(... carriedPersistentOccupants ...)
→ createFauna restore
```

Dla `resetCollectedItems === true` / genuinely new world carry nie może przechodzić do nowego świata.

Nie przenosić starych `AnimalAgent` references między bundle'ami.

## 9. Home i normalne zachowanie po refaktorze

Persistent occupant korzysta z normalnych systemów fauny i nie otrzymuje osobnego movement/foraging/lifecycle mode.

Po utworzeniu/hydration nadal korzysta z:

- `AnimalLife` metabolism,
- `animalForaging` food/water sourcing,
- `animalRoaming` roaming i water trips,
- istniejącego predator/combat/flee decision flow,
- disease,
- `animalCorpse` death/remains lifecycle.

W szczególności przyszły niedźwiedź związany z realną jaskinią może wyjść po jedzenie lub wodę i wracać przez normalne fauna systems. Integracja realnej walk-in cave z habitat/home pozostaje osobnym planem; ten plan dostarcza trwałą identity/lifecycle semantics dla occupanta.

## 10. Pierwszy consumer: treasure-map bear cave

`quests-progression-008-treasure-map-bear-cave.md` pozostaje pierwszym consumerem, ale ten plan nie implementuje logiki questa ani real-cave navigation.

Docelowy reusable contract powinien pozwolić później zadeklarować:

```text
real cave habitat
+ persistent occupant key: resident
+ species: bear
→ stable concrete bear
```

Quest nie zapisuje własnego `bearAlive`, HP ani corpse state.

## Performance i determinism

Mechanizm ma być sparse: koszt persistence rośnie z liczbą jawnie persistent occupants, nie z całą wild population.

Nie dodawać nowych globalnych per-frame scans.

Persistent lookup powinien używać `Map`/`Set` keyed po stable slot key i/lub stable `animalId` tam, gdzie sprawdzenie występuje podczas update/removal.

Nie dokładać persistence pracy do `animalForaging`, `AnimalLife` ani `animalRoaming` per tick. Capture wykonuje się przy save/rebuild, a registry mutations tylko przy tworzeniu/removal occupanta.

Identity i first-spawn semantics muszą być deterministyczne oraz niezależne od ordinary spawn order.

## Testy

Dodać focused tests co najmniej dla:

- persistent identity nie zależy od ordinary `nextAnimalId` / spawn order,
- fresh declared occupant powstaje raz ze stabilnym identity,
- live snapshot → hydrate odtwarza ten sam `animalId` i durable state,
- persistent corpse round-trip korzysta z obecnego `AnimalSaveState` / `animalCorpse` semantics,
- durable disease state round-trip, jeżeli wymaga rozszerzenia wspólnego snapshotu,
- transient path/target/`SourceTarget`/`AnimalTrip` nie jest wymagany do restore,
- persistent occupant zajmuje normalny habitat population slot także gdy fizycznie odejdzie od domu,
- generic initial fill nie tworzy `maxPreyCount + 1`,
- `updateSpawners()` nie tworzy replacementu dla persistent slotu,
- dead corpse nadal blokuje persistent slot,
- `readyToRemove()` tworzy tombstone przed disposal,
- tombstone przeżywa save/load,
- tombstone przeżywa in-session rebuild przed kolejnym save,
- tombstonowany occupant nie jest rekonstruowany,
- ordinary slots tego samego habitat nadal działają według normalnych respawn rules,
- migration z poprzedniej save version defaultuje nową collection poprawnie,
- ordinary wild fauna nadal nie jest masowo persystowana.

Preferować testy przy nowych pure registry/identity helpers oraz istniejących `AnimalSpawner.test.ts`, `AnimalAgent.test.ts` / lifecycle testach zamiast budowania dużego integration harness tylko dla planu.

## Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Po podłączeniu pierwszego realnego consumera sprawdzić co najmniej:

1. Persistent animal zachowuje identity i durable state po save/load.
2. Save wykonany przy żywym zwierzęciu nie tworzy duplikatu przy habitat.
3. Save wykonany przy corpse przywraca corpse zamiast nowego żywego osobnika.
4. Po zakończeniu corpse lifecycle i kolejnym save/load zwierzę nie wraca.
5. In-session world rebuild nie wskrzesza tombstonowanego occupanta.
6. Długie działanie habitat respawn nie tworzy replacementu dla persistent slotu.
7. Pozostała ordinary fauna i zwykłe habitat respawns nadal działają.
8. Persistent animal nadal używa normalnego movement/combat/needs/foraging behaviour.

## Non-goals

Poza zakresem:

- persistence wszystkich dzikich zwierząt,
- `NotableAnimalManager` lub nowa persistent-animal class,
- quest-owned animal HP/alive state,
- quest implementation z `quests-progression-008`,
- generowanie realnej walk-in cave,
- real-cave path/home navigation poza reusable habitat identity contractem,
- pełny ecosystem/population simulator,
- regionalna/off-screen fauna simulation,
- migracje sezonowe,
- persistence pathfindingu, combat targetów, `SourceTarget`, `AnimalTrip`, animation state,
- zmiana identity wszystkich ordinary wild animals,
- cofanie lub obchodzenie modułów wydzielonych przez `fauna-017`,
- ponowne przenoszenie `AnimalLife`, corpse, foraging lub roaming do `AnimalAgent`,
- UI dla nazwanych/notable animals.

## Implementation notes

Aktualny focused recon i konkretne seams utrzymywać w:

`docs/plans/implementation-notes/fauna-018-persistent-habitat-occupants-implementation-notes.md`

Implementation preflight powinien sprawdzić aktualny HEAD dla `AnimalSaveState`, `createFauna()` / `spawnAgent()`, `AnimalSpawner.updateSpawners()`, `rebuildWorldBundle()`, `SaveData` version/migrations oraz obu istniejących registry patterns (`livestock`, `ratPersistence`).

Nie uruchamiać ręcznie `pnpm docs:sync`; synchronizacja dokumentacji działa przez GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**