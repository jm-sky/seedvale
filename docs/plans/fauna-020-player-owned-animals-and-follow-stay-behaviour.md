# Plan: Player-owned animals and follow/stay behaviour

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~fauna-003~~
**Domain:** `fauna`
**Subdomains:** `domestication` `behavior` `lifecycle`
**Tags:** `ownership` `follow` `stay` `horse` `persistence`
**Roadmap:** `horse-and-riding.md`

## Cel

Rozszerzyć istniejący system `AnimalAgent` tak, aby persistent domestic/livestock animal mógł należeć do gracza i zachowywać się jak autonomiczne zwierzę świata, a nie player-only obiekt.

Pierwszym pełnym konsumentem jest koń.

Docelowy flow:

```text
existing AnimalAgent
→ ownership transfer to player
→ same persistent animalId
→ Follow / Stay control
→ normal hunger/thirst/stamina and threat behaviour
→ existing riding system
```

Nie tworzyć `PlayerHorse`, `HorseManager`, osobnego systemu potrzeb ani alternatywnego movement pipeline.

## Aktualny punkt wyjścia

Current `main` ma już:

- `horse` i `donkey` jako mountable `AnimalKind`,
- `horse` jako domestic livestock `AnimalAgent`,
- stable per-instance `animalId`,
- per-individual livestock persistence,
- hunger/thirst/stamina i shared food/water pursuit,
- horse grazing przez shared herbivore diet,
- household ownership przez `ownerHouseId`,
- merchant horse jako realny `AnimalAgent`, nie dekorację,
- riding/mount persistence,
- brak player ownership,
- brak follow-player behaviour po zejściu z mounta.

Plan ma rozszerzyć te mechanizmy, nie tworzyć równoległych odpowiedników.

## 1. Ownership jako część istniejącego animal state

Obecne `ownerHouseId` opisuje household-owned livestock. Rozszerzyć ownership model tak, aby potrafił reprezentować co najmniej:

```text
unowned
household-owned
player-owned
```

Ownership ma mieć jedno źródło prawdy. Nie utrzymywać równolegle kilku pól reprezentujących ten sam fakt, np. `ownerHouseId` + `playerOwned` + `ownerType`.

Preferować najmniejszy contract zgodny z obecną architekturą i persistence. Reprezentacja nie powinna być booleanem typu `ownedByLocalPlayer`, jeśli równie prosto można zachować owner kind/identity i nie zamknąć drogi do przyszłego multiplayer.

Ownership pozostaje niezależne od affinity z `fauna-013`:

```text
ownership = formalnie do kogo należy animal
affinity  = indywidualna relacja animal → human
```

Nie uzależniać ownership od karmienia, familiarity ani affinity.

## 2. Jedna operacja ownership transfer

Dodać jedną domenową operację zmiany ownership dla konkretnego persistent animal.

Invariant:

```text
existing AnimalAgent
→ validate transfer
→ ownership changes exactly once
→ same animalId remains authoritative
→ persistence becomes dirty
```

Nie despawnować starego zwierzęcia i nie tworzyć nowego po transferze.

Ta sama operacja ma być przyszłym integration seam dla:

- sprzedaży konia przez merchant,
- quest reward przekazującego konia graczowi.

Merchant i quest system nie powinny bezpośrednio mutować wewnętrznego fauna state.

## 3. Persistence i settlement spawn ownership

Player-owned animal ma nadal korzystać z istniejącej per-individual livestock persistence. Zachować istniejące snapshot semantics dla position/yaw, health, hunger, thirst, stamina, lifecycle/corpse state i innych już persistowanych pól oraz dodać ownership/control state potrzebny temu planowi.

Po save/load musi wrócić ten sam `animalId`.

Szczególnie ważny jest transfer zwierzęcia pochodzącego z deterministic settlement spawn slot, np. obecnego `merchant-horse-<settlementId>`.

Po transferze:

```text
merchant/household horse → player-owned
settlement unload/reload
→ transferred animal remains player-owned
→ original settlement spawn slot does not create a duplicate
```

Persistence/tombstone/spawn reconciliation musi jednoznacznie odróżniać:

- zwierzę nadal należące do settlement/household,
- zwierzę legalnie przeniesione do gracza,
- zwierzę martwe/finalnie usunięte.

Nie pozwolić, aby deterministic livestock reconstruction cofnęło ownership albo wskrzesiło drugi egzemplarz.

## 4. Player-owned animal lookup

Zapewnić mały accessor/registry seam pozwalający znaleźć player-owned persistent animals po stabilnym `animalId` albo ownership.

Nie zakładać w domenowym modelu globalnego singletonu:

```text
playerHorse: AnimalAgent
```

V1 gameplay może używać jednego konia, ale ownership model nie powinien wymuszać jednej sztuki na gracza.

Nie tworzyć animal-management UI ani osobnego globalnego managera skanującego wszystkie zwierzęta co tick.

## 5. Follow / Stay control state

Player-owned controllable animal obsługuje dwa proste stany:

```text
Follow
Stay
```

Po pierwszym transferze ownership do gracza domyślnym stanem jest `Follow`.

Control state należy do fauna/animal state, nie do UI. UI jedynie wydaje komendę.

`Follow` / `Stay` muszą przetrwać save/load. Jeżeli `Stay` potrzebuje anchor/origin, także musi być odtworzony w sposób zgodny z persistence contractem.

## 6. Follow behaviour

Follow jest autonomicznym zachowaniem `AnimalAgent`.

Koń powinien:

- zacząć podążać dopiero po przekroczeniu sensownego dystansu,
- zatrzymać się w sensownej odległości od gracza,
- używać istniejącego movement/path/water-traversal pipeline,
- przy większym dystansie legalnie użyć szybszego movement, jeżeli species capability na to pozwala,
- nie oscylować stale pomiędzy follow i idle przy granicy dystansu.

Nie attachować transformu konia do playera i nie teleportować go podczas normalnego follow.

Bardzo duży dystans nie oznacza automatycznego teleportu ani magicznego summon. Lost-horse recovery/whistle jest osobnym przyszłym problemem.

## 7. Stay behaviour

`Stay` wyłącza podążanie za graczem, ale nie zamraża zwierzęcia.

Preferować reuse istniejącego home/wander origin contract zamiast tworzyć osobny dokładny return-to-point system.

W `Stay` animal nadal może:

- szukać jedzenia,
- szukać wody,
- reagować na zagrożenia,
- korzystać z istniejącego flee/hazard behaviour,
- lokalnie roamować w dozwolonym zakresie.

Po ustaniu needs/threat behaviour powinien pozostać związany z lokalnym Stay origin zgodnie z istniejącą semantyką roaming/home.

Nie wymagać powrotu do dokładnego punktu co do centymetra.

## 8. Integracja z istniejącym fauna behaviour

Nie przebudowywać w tym planie całej fauna arbitration.

Obecna fauna ma fixed-priority threat/social overrides oraz hunger/thirst rozwiązywane wewnątrz normal behaviour branches. Follow/Stay trzeba wpiąć w ten pipeline tak, aby zachować istniejące semantics.

W szczególności:

- dead/mounted hard gates pozostają nadrzędne,
- threat/flee/combat safety nadal może przerwać follow,
- hunger/thirst pursuit nadal musi być skuteczne,
- Follow nie może wyłączyć normalnej fizjologii,
- ordinary roaming ma być fallbackiem wobec aktywnego ownership control.

Nie wprowadzać sztucznego nowego unified pressure system tylko dla Follow.

## 9. Riding integration

`fauna-003` pozostaje authority dla mounting/riding.

Gdy owned animal jest mounted:

```text
mounted
→ player controls movement
→ autonomous Follow / Stay movement is suspended
```

Po dismount:

- ownership pozostaje bez zmian,
- ten sam `AnimalAgent` wraca do autonomicznego behaviour,
- wcześniejszy `Follow`/`Stay` state pozostaje aktywny.

Nie tworzyć nowej mount reference ani drugiego riding persistence contract.

## 10. Needs, grazing i water pozostają wspólne

Player ownership zmienia social/control context, nie fizjologię.

Owned horse nadal korzysta z istniejących:

- hunger/thirst/stamina,
- species diet,
- grass forage,
- food targeting,
- water targeting,
- water traversal.

Nie dodawać `horseHunger`, `horseThirst`, player-only grazing ani specjalnego horse water system.

Przyszły player-built trough powinien móc wejść do tego samego istniejącego water-target pipeline bez horse-specific branch.

## 11. Interaction commands

Dla player-owned controllable animal udostępnić lekką contextual interaction możliwość przełączenia:

```text
Follow ↔ Stay
```

Preferować istniejący contextual interaction/dialog actions seam.

Komenda może być wydana tylko wobec zwierzęcia, którym player ma prawo sterować. Domestic sociability sama w sobie nie daje kontroli nad cudzym livestock.

Nie budować dużego management screen.

## 12. Death i final removal

Ownership nie zmienia istniejącego animal death/corpse lifecycle.

Player-owned horse może umrzeć normalnie. Po final removal nie może zostać automatycznie odtworzony przez settlement spawn reconciliation ani player ownership restore.

Reuse istniejących tombstone/removal semantics zamiast tworzyć horse-specific resurrection guards.

## Cross-domain contract dla następnych planów

Po ukończeniu `fauna-020` inne domeny powinny potrzebować tylko małego publicznego seam:

```text
resolve animal by stable id
→ transfer ownership to player
→ same AnimalAgent becomes player-owned
```

Następne plany wykorzystają go dla:

- merchant purchase,
- quest reward,
- player-built animal care infrastructure.

Nie implementować tych feature'ów tutaj.

## Testy

Dodać testy przede wszystkim dla domenowych invariantów:

- existing household ownership zachowuje dotychczasowe semantics,
- animal może zostać przeniesiony na player ownership,
- transfer zachowuje ten sam `animalId`,
- transfer nie tworzy drugiego `AnimalAgent`,
- ownership survives save/load,
- `Follow`/`Stay` survives save/load,
- settlement unload/reload nie cofa player ownership,
- deterministic settlement spawn nie duplikuje transferred merchant/household animal,
- player-owned animal domyślnie przechodzi w `Follow` po pierwszym transferze,
- Follow zaczyna ruch po przekroczeniu odpowiedniego dystansu,
- Follow zatrzymuje się bez ciągłej oscylacji,
- Follow korzysta z existing movement/walkability pipeline,
- `Stay` wyłącza player-follow, ale nadal pozwala na hunger/thirst/threat behaviour,
- mounted animal nie wykonuje autonomous Follow/Stay movement,
- dismount zachowuje ownership i control state,
- obcy domestic animal nie przyjmuje player Follow/Stay command,
- death/final removal nie powoduje resurrection ani duplicate spawn.

## Manual verification

W przeglądarce użytkownik sprawdza co najmniej:

1. Existing horse nadal działa jako mount.
2. Po transferze ownership ten sam koń zaczyna należeć do gracza.
3. Koń w `Follow` podąża po oddaleniu i zatrzymuje się w sensownej odległości.
4. Koń nie oscyluje stale wokół follow threshold.
5. `Stay` zatrzymuje podążanie za graczem.
6. Głodny/spragniony koń w `Stay` nadal może zaspokoić potrzeby.
7. Zagrożenie nadal może przerwać follow.
8. Po dismount koń wraca do wcześniejszego Follow/Stay state.
9. Save/load zachowuje ownership oraz Follow/Stay.
10. Settlement unload/reload nie tworzy drugiego transferred horse i nie cofa ownership.
11. Śmierć i corpse removal działają jak dla pozostałego livestock.

## Non-goals

Poza zakresem:

- zakup konia,
- quest dający konia,
- player-built trough,
- stajnia,
- selling/stealing animals,
- horse inventory/equipment/saddle,
- breeding,
- affinity-driven obedience,
- taming wild horses,
- whistle/summon/lost-horse teleport,
- multiple-animal management UI,
- mounted combat changes.

## Wskazówki implementacyjne

Przed implementacją sprawdzić aktualny kod i implementation notes związane z:

- `AnimalAgent` ownership/lifecycle,
- `animalDefs`,
- fauna decision pipeline,
- livestock spawning i persistence,
- merchant horse spawn slot,
- riding/mount actions,
- `SaveData`,
- `fauna-003`,
- `fauna-013` wyłącznie dla zachowania granicy ownership ≠ affinity.

Preferować istniejące seams i najmniejsze rozszerzenie obecnego ownership/persistence contract.

Dla ważnych nowych publicznych lub architektonicznych funkcji/classes dodać JSDoc, używając `@domain fauna` tam, gdzie pomaga to w preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
