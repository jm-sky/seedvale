# Plan: Persistent habitat occupants

**Created:** 2026-09-07
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** fauna-016
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
→ snapshot / restore
→ death / corpse lifecycle
→ permanent occupant tombstone
→ generic habitat spawning respects occupied/removed slot
```

Mechanizm powinien nadawać się później także dla alpha wolf, nazwanego/tracked animal oraz innych zwierząt mających trwałe znaczenie dla historii świata.

## Stan obecny

`AnimalAgent` jest właścicielem runtime state konkretnego zwierzęcia i posiada już `snapshot()` / `hydrate()` przez `AnimalSaveState`. Ten seam jest obecnie wykorzystywany przez livestock persistence.

Livestock ma istniejący wzorzec, który należy wykorzystać koncepcyjnie zamiast projektować persistence od zera:

```text
stable deterministic identity
+ AnimalSaveState
+ persistence store surviving runtime reconstruction
+ removed/tombstone ids
→ reconstruct same individual without resurrection
```

Wild fauna nie ma odpowiednika tego mechanizmu. `createFauna()` odtwarza dzikie zwierzęta podczas budowy `WorldBundle`.

Zwykłe wild `animalId` powstaje obecnie z per-build countera (`${kind}-${nextAnimalId++}`). Nie jest to trwały identity contract: zmiana kolejności lub liczby spawnów może zmienić identyfikator tego samego logicznego mieszkańca świata.

Habitat/spawner ma natomiast stabilne `PreySpawner.id`, persistent lifecycle (`active` / `depleted` / `disabled` / `recovering`) oraz istniejące powiązanie `AnimalAgent.spawnPointId`.

Aktywny habitat przy reconstruction tworzy świeżą populację do `maxPreyCount`, a później `updateSpawners()` uzupełnia braki. Sam zapis stanu niedźwiedzia nie wystarczy więc do zapobieżenia jego późniejszemu zastąpieniu nowym osobnikiem.

## Ownership

Persistent wild animal pozostaje częścią systemu fauna.

Nie tworzyć `NotableAnimalManager` ani quest-owned lifecycle state.

Preferowany ownership:

```text
Fauna
├─ ordinary ephemeral wild population
├─ habitat/spawner lifecycle
└─ persistent habitat occupants
   └─ AnimalAgent authoritative individual state
```

Persistence layer przechowuje serializowalny snapshot, ale nie staje się właścicielem reguł animal lifecycle ani habitat occupancy.

Quest może znać stabilne identity/habitat binding potrzebne do sprawdzania świata, ale nie może posiadać duplikatu stanu zwierzęcia.

## 1. Persistent habitat occupant

Wprowadzić mały kontrakt pozwalający zadeklarować konkretny slot mieszkańca stabilnego habitat/home jako persistent.

V1 zakłada, że persistent wild animal zawsze posiada stabilny habitat/home owner.

Identity powinno wynikać ze stabilnego habitat identity oraz stabilnego klucza occupanta, np. konceptualnie:

```text
habitatId + occupantKey
→ stable persistent animalId
```

Nie opierać persistent identity na `nextAnimalId` ani runtime spawn order.

`occupantKey` powinien być częścią kontraktu już w V1, mimo że pierwszy przypadek potrzebuje tylko jednego mieszkańca. Pozwala to później obsłużyć kilka trwałych osobników jednego habitat bez zmiany modelu danych.

Nie wymagać nazwy, questa ani UI markerów. `persistent` opisuje lifecycle/persistence semantics; `notable` pozostaje pojęciem gameplayowym.

## 2. Reuse AnimalAgent snapshot/hydration

Nie tworzyć równoległego modelu HP/needs/death dla persistent animals.

Persistent occupant powinien używać normalnego `AnimalAgent` i istniejącego `AnimalSaveState` / `snapshot()` / `hydrate()`.

Minimalnie zachować przez save/load stan potrzebny do ciągłości konkretnego osobnika:

- stabilną identity,
- pozycję/orientację zgodnie z obecnym snapshotem,
- health/dead state,
- hunger/thirst/stamina i inne istniejące długotrwałe pools objęte snapshotem,
- corpse lifecycle,
- habitat/home binding,
- rabies.

Jeżeli `rabid` nie jest obecnie częścią `AnimalSaveState`, rozszerzyć wspólny snapshot w sposób kompatybilny z livestock i istniejącymi restore paths.

Nie persistować krótkotrwałego execution state tylko dlatego, że zwierzę jest persistent, w szczególności:

- aktualnego pathfindingu,
- transient combat target,
- bieżącej fazy behaviour/action,
- aktywnego trip target,
- animation state.

Po load agent może wznowić normalne decision/movement systems ze swoim trwałym stanem.

## 3. Fauna-owned persistence state

Dodać fauna-owned persistence collection wyłącznie dla persistent habitat occupants.

Rekord powinien identyfikować co najmniej:

```text
habitatId
occupantKey
animalId
kind
persistent AnimalAgent snapshot
```

oraz umożliwiać reprezentację permanentnie usuniętego occupanta.

Nie persystować wszystkich dzikich zwierząt. Ordinary wild fauna pozostaje ephemeral i korzysta z obecnego deterministic/runtime spawning.

Wykorzystać istniejący livestock registry pattern tam, gdzie pasuje: capture live state, serialize, hydrate oraz tombstone. Nie kopiować settlement ownership ani nie uzależniać wild fauna od `SettlementsManager`.

## 4. Save/load integration

Dodać minimalny `SaveData` seam dla persistent wild animals.

`SaveState.buildSaveData()` powinien pobierać snapshot z `Fauna`, analogicznie do istniejących world/fauna-owned collections.

Podczas `createWorldBundle()` / `buildFauna()` zapisany stan powinien zostać przekazany do `createFauna()` i użyty podczas reconstruction persistent occupants.

Restore musi rozróżniać:

```text
no saved record
→ fresh world / first construction
→ create declared occupant

saved live/dead/corpse record
→ create same stable individual
→ hydrate snapshot

removed tombstone
→ do not create individual
→ keep its persistent habitat slot unavailable to generic respawn
```

Starszy save bez collection powinien zachowywać dotychczasowe zachowanie i traktować persistent declaration jako pierwszy spawn, bez wymagania migracji istniejącej ordinary wild fauna.

## 5. Death, corpse lifecycle i tombstone

Śmierć persistent occupanta musi przechodzić przez normalny `AnimalAgent` death/collapse path.

Nie tombstonować zwierzęcia natychmiast po utracie HP. Jeżeli save nastąpi podczas corpse lifecycle, po load powinno nadal istnieć jako ten sam corpse state zgodnie z `AnimalSaveState`.

Dopiero gdy normalny corpse/removal lifecycle zakończy się i agent staje się `readyToRemove()`, zapisać trwały tombstone persistent occupanta.

Tombstone oznacza:

```text
this logical habitat occupant existed
→ its lifecycle ended permanently
→ deterministic/generic spawning must not recreate it
```

Wzorować semantykę na `removedLivestockIds`, ale utrzymać fauna ownership i habitat/occupant identity.

Tombstone musi powstać również w runtime store przed następnym save, aby in-session reconstruction/rebuild nie wskrzesił zwierzęcia.

## 6. Habitat population accounting i respawn

Persistent occupant zajmuje normalny slot populacji swojego habitat.

Nie traktować go jako `maxPreyCount + 1`.

Generic habitat spawning/replenishment musi uwzględniać persistent occupant slots:

- żywy/dead-corpse persistent occupant zajmuje swój slot,
- restored persistent occupant nie może dostać obok siebie świeżego replacementu tego samego slotu,
- tombstonowany persistent occupant pozostawia ten slot permanentnie niedostępny dla generic respawn,
- pozostałe zwykłe slots habitat mogą nadal używać obecnego respawn/recovery modelu.

Nie rozwiązywać tego przez quest-specific `maxPreyCount = 0/1` mutation ani przez specjalne sprawdzanie bear quest w `updateSpawners()`.

Preferować jawny occupancy contract na habitat/spawner zamiast inferowania persistent status tylko z nearby same-kind count.

## 7. Stable identity

Persistent `animalId` musi być stabilne między:

- save/load,
- in-session `WorldBundle` rebuild,
- kolejnymi reconstruction cycles,
- zmianami liczby/kolejności ordinary wild spawns.

Nie wymagać zmiany identity strategy wszystkich wild animals.

Jeżeli istniejące API oczekuje globalnej unikalności `animalId`, generator persistent identity powinien zawierać stabilny habitat namespace wystarczający do uniknięcia kolizji między habitatami.

Quest/system history może później bezpiecznie odwoływać się do tego identity, ale nie staje się jego właścicielem.

## 8. Home i normalne zachowanie

Persistent occupant ma korzystać z normalnych systemów fauny.

Mechanizm nie może przywiązywać agenta fizycznie do habitat ani tworzyć osobnego movement mode.

Po utworzeniu/hydration zwierzę korzysta z istniejących:

- hunger/thirst/metabolism,
- roaming/home,
- trips/water trips,
- predator/combat/flee,
- disease,
- death/corpse lifecycle.

W szczególności przyszły niedźwiedź związany z realną jaskinią może wyjść po jedzenie lub wodę i wracać przez normalne fauna systems. Integracja realnej walk-in cave z habitat/home jest osobnym planem; ten plan dostarcza trwałą identity/lifecycle semantics dla jej occupanta.

## 9. Off-screen / hybrid simulation

Nie implementować pełnego persistent wild population simulatora ani regionalnej aggregated fauna simulation.

Persistent status nie oznacza obowiązku high-fidelity tickowania zwierzęcia przez cały czas.

Mechanizm ma jedynie zachować authoritative continuity istotnego osobnika na granicach reconstruction/save-load i być kompatybilny z przyszłym hybrid/off-screen simulation.

Nie persistować transient state, którego przyszły aggregated model nie powinien potrzebować.

## 10. Pierwszy consumer: treasure-map bear cave

`quests-progression-008-treasure-map-bear-cave.md` będzie pierwszym konsumentem, ale nie implementować w tym planie logiki questa ani real-cave habitat integration poza niezbędnym reusable contractem.

Po wdrożeniu mechanizmu quest/cave plan powinien móc zadeklarować konceptualnie:

```text
real cave habitat
+ persistent occupant key: resident
+ species: bear
→ stable concrete bear
```

Jeżeli bear przeżyje save/load, restore odtwarza ten sam individual state.

Jeżeli bear jest martwy, ale corpse nadal istnieje, restore odtwarza corpse state.

Jeżeli corpse lifecycle się zakończył, occupant pozostaje tombstonowany i habitat nie generuje replacement bear dla tego persistent slotu.

Quest nie zapisuje własnego `bearAlive`.

## Performance i determinism

Mechanizm ma być sparse: koszt persistence rośnie z liczbą jawnie persistent occupants, nie z całą populacją wild fauna.

Nie dodawać nowych globalnych per-frame scans.

Persistent lookup powinien być keyed po stabilnym habitat/occupant identity lub `animalId` i korzystać z map/set tam, gdzie wymagane jest częste sprawdzenie.

Capture przy save oraz reconstruction przy world build mogą wykonywać pracę proporcjonalną do małej liczby persistent occupants.

Identity i first-spawn semantics muszą być deterministyczne.

## Testy

Dodać focused tests co najmniej dla:

- persistent identity nie zależy od ordinary `nextAnimalId`/spawn order,
- fresh declared occupant powstaje raz ze stabilnym identity,
- live persistent occupant snapshot → load odtwarza ten sam `animalId` i trwały stan,
- health/needs/corpse state round-trip przez istniejący `AnimalSaveState`,
- rabies round-trip,
- transient path/target/trip state nie jest wymagany do restore,
- persistent occupant zajmuje normalny habitat population slot,
- generic replenishment nie tworzy replacementu obok restored occupanta,
- dead corpse nadal blokuje swój persistent slot,
- zakończenie `readyToRemove()` tworzy tombstone,
- tombstone przeżywa save/load,
- tombstonowany occupant nie jest rekonstruowany,
- generic spawner nie wypełnia tombstonowanego persistent slotu,
- inne ordinary slots habitat nadal mogą działać według normalnych respawn rules,
- old save bez persistent-animal collection tworzy deklarowanego occupanta jak fresh world,
- ordinary wild fauna nadal nie jest masowo persystowana.

## Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Po podłączeniu pierwszego realnego consumera sprawdzić co najmniej:

1. Persistent animal zachowuje identity i HP/needs po save/load.
2. Save wykonany przy żywym zwierzęciu nie tworzy duplikatu przy habitat.
3. Save wykonany przy corpse przywraca corpse zamiast nowego żywego osobnika.
4. Po zakończeniu corpse lifecycle i kolejnym save/load zwierzę nie wraca.
5. Długie działanie habitat respawn nie tworzy replacementu dla tombstonowanego persistent slotu.
6. Pozostała ordinary fauna i zwykłe habitat respawns nadal działają.
7. Persistent animal nadal używa normalnego movement/combat/needs behaviour.

## Non-goals

Poza zakresem:

- persistence wszystkich dzikich zwierząt,
- `NotableAnimalManager`,
- quest-owned animal HP/alive state,
- quest implementation z `quests-progression-008`,
- generowanie realnej walk-in cave,
- integracja real caves z habitat/home poza kontraktem potrzebnym persistent occupant,
- pełny ecosystem/population simulator,
- regionalna/off-screen fauna simulation,
- migracje sezonowe,
- persistence pathfindingu, combat targetów, animation state lub active trip,
- zmiana identity wszystkich ordinary wild animals,
- szeroki `AnimalAgent` refactor z `fauna-017`,
- UI dla nazwanych/notable animals.

## Implementation notes

Przygotować i utrzymywać:

`docs/plans/implementation-notes/fauna-018-persistent-habitat-occupants-implementation-notes.md`

Implementation preflight powinien ponownie potwierdzić aktualne `AnimalSaveState`, `AnimalAgent.snapshot()/hydrate()`, `createFauna()` spawn/replenishment flow, `PreySpawner` state oraz `SaveData`/`SaveState` seams, szczególnie jeżeli wcześniej zostanie wdrożony `fauna-017` lub plan integrujący real caves z fauna habitat/home.

Nie uruchamiać ręcznie `pnpm docs:sync`; synchronizacja dokumentacji działa przez GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
