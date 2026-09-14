# Plan: Settlement outskirts and pasture

**Created:** 2026-09-13
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `settlements`
**Type:** `feature`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Dodać funkcjonalne obrzeża większych osad, zaczynając od prostego pastwiska:

```text
settlement core
→ defensive perimeter / palisade
→ outskirts
→ pasture
```

Pastwisko:

- należy funkcjonalnie do osady,
- znajduje się poza głównym zabudowanym footprintem i poza defensywnym perimeterem,
- jest regularnym miejscem pracy shepherdów i pobytu stad,
- jest bardziej narażone na dziką faunę niż wnętrze osady,
- ma minimalny czytelny wizualnie marker granicy w postaci prostego ogrodzenia.

Nie tworzyć pełnego systemu `Pasture` ani nowej symulacji gospodarstwa.

## Zakres V1

Outskirts generować jako obowiązkowy element zależny od skali osady:

- `SM` — brak pasture;
- `MD` — małe pasture;
- `LG` — regularne pasture;
- `XL` — większe pasture.

V1 outskirts zawiera:

- planned pasture area,
- studnię,
- animal trough,
- minimalne fencing,
- dojście z osady,
- semantyczną informację, że obszar jest poza defensywnym perimeterem.

Bez dodatkowych stodół, stajni i nowych budynków w tym planie.

## Ownership

Pastwisko jest **settlement-owned**, nie player-owned i nie osobnym autonomicznym bytem.

`VillagePlan` powinien być źródłem prawdy dla jego lokalizacji i zasięgu.

Nie tworzyć:

```text
PastureManager
PastureSimulation
PastureAgent
```

Jeżeli potrzebny jest nowy typ danych, powinien być małym elementem planu osady, np. planned area/zone/landmark opisującym:

- center,
- radius / footprint,
- powiązanie z settlement,
- dostępne utility anchors,
- planned fence segments.

Runtime korzysta z danych `VillagePlan`, zamiast rekonstruować pastwisko niezależnie.

Pasture istnieje niezależnie od tego, czy dana osada aktualnie ma shepherda. Shepherd jest konsumentem planned pasture, a nie warunkiem jego utworzenia.

## Defensive perimeter

Pastwisko musi znajdować się **poza palisadą/murem osady**, jeżeli settlement posiada defensywny perimeter.

Jest to celowy kompromis:

```text
owned by settlement
≠
protected by settlement walls
```

Dlatego pasture można traktować jako bardziej zagrożoną część settlement territory.

Nie dodawać w tym planie abstrakcyjnego `riskZone` systemu.

Wystarczy, że położenie pastwiska realnie wystawia shepherdów i zwierzęta na istniejącą faunę świata.

Późniejsze systemy bezpieczeństwa mogą wykorzystać tę semantykę.

## Placement

Rozszerzyć istniejący `VillagePlan` / planner zamiast generować pastwisko po utworzeniu osady.

Kandydat powinien:

- znajdować się poza core i głównym ringiem zabudowy;
- znajdować się poza defensywnym perimeterem;
- pozostawać w praktycznym dystansie dojścia od osady;
- preferować względnie płaski, dostępny teren;
- unikać wody, stromych stoków i kolizji z istniejącymi planned areas;
- nie blokować entrance/main road;
- respektować istniejące river/path/spacing constraints.

Pozycja nie musi być związana z entrance.

Planner powinien wybrać najlepszy terenowo kierunek.

## Skala

Bazowy rozmiar pasture wynika z `VillageSize`, ale może być lekko korygowany na podstawie przewidywanej/faktycznej liczby livestock w osadzie.

Cel:

- nie generować nieproporcjonalnie dużego pasture dla bardzo małego stada,
- nie generować mikroskopijnego pasture dla dużej liczby zwierząt.

Nie tworzyć w tym planie dynamicznej symulacji capacity ani depletion.

Nie rozszerzać sztucznie footprintu całej zabudowanej osady tylko po to, aby objąć pastwisko.

Pasture jest satellite/outskirts area.

## Fencing

Pasture musi mieć co najmniej minimalny widoczny marker granicy.

Preferowany układ V1:

- dwa odcinki płotu pod kątem zbliżonym do prostego,
- z czytelną przerwą/przejściem między nimi,
- długości orientacyjnie rzędu kilkunastu–kilkudziesięciu metrów, kalibrowane do skali pasture i terenu.

Przykładowa semantyka:

```text
──────── gap ────────┐
                     │
                     │
```

Jeżeli teren lub spacing uniemożliwia sensowny układ dwóch odcinków, dopuszczalny fallback to jeden odcinek płotu.

Fencing ma przede wszystkim:

- wizualnie komunikować „tu jest pastwisko”,
- lekko porządkować przestrzeń,
- dawać czytelny kierunek wejścia.

Nie wymaga pełnego zamkniętego enclosure ani bramy.

Fence segments muszą być planowane w `VillagePlan`, a nie dorzucane jako późna dekoracja po materializacji propsów. Planner musi uwzględniać ich footprint/clearance względem ścieżki, studni, trough i innych planned elements.

## Shepherd

Obecny shepherd pracuje wokół household livestock i nie posiada dedykowanego pasture subsystemu.

Rozszerzyć istniejący work destination resolution:

```text
shepherd household
→ owned flock
→ settlement pasture anchor
→ shepherd work / herd movement
```

Jeżeli settlement ma planned pasture:

- shepherd używa go jako docelowego obszaru pracy w ciągu dnia;
- prowadzone przez niego zwierzęta mogą korzystać z pasture jako need/work anchor;
- po zakończeniu pracy zachować istniejące zachowanie powrotu do household/livestock area.

Nie tworzyć alternatywnego movement AI.

Istniejące fauna movement/roaming/follow mechanisms pozostają źródłem wykonania ruchu.

Plan `fauna-004-sheep-wool-and-shepherd` również jawnie odrzuca tworzenie osobnego `Pasture` entity.

## Animals

Nie przenosić ownership zwierząt z household do pasture.

```text
Household
  owns animal

Settlement
  owns pasture
```

Pasture jest miejscem wykorzystania, nie właścicielem stada.

Pozwala to zachować istniejące:

- livestock persistence,
- household ownership,
- feeding/watering,
- lifecycle,
- shepherd association.

## Water

Każde planned pasture w V1 powinno mieć dostęp do:

1. studni,
2. animal trough.

Nie tworzyć nowej implementacji trough.

Settlement animals już mają mechanizm preferowania istniejącego `AnimalTrough` przed naturalną wodą. Należy wykorzystać ten sam water-consumption contract.

### Ownership wody

Pasture trough jest infrastrukturą osady, ale istniejący fauna contract może wymagać household-backed water reserve.

Implementacja powinna rozszerzyć istniejący ownership/resolution w minimalny sposób:

- nie duplikować `AnimalTrough`;
- nie tworzyć drugiego rodzaju water inventory;
- umożliwić zwierzętom danego settlement korzystanie z pasture trough poprzez istniejący water-consumption contract.

Jeżeli obecny `AnimalTrough` bezpośrednio wymaga household ownership, preferować mały adapter/shared owner contract zamiast równoległej klasy `SettlementTrough`.

## Well

Pasture well korzysta z istniejącej mechaniki studni.

Nie tworzyć nowego rodzaju `PastureWell`.

Powinna to być kolejna planned instancja tej samej infrastruktury, z placementem wynikającym z pasture.

Studnia i trough muszą być częścią spacing/footprint planu przed materializacją propsów.

## Paths

Dodać prostą ścieżkę łączącą settlement z pasture przez istniejący local-path mechanism, jeżeli planner może ją bezpiecznie wyprowadzić.

Nie tworzyć nowego road subsystemu.

Pasture route może zaczynać się przy najbliższym existing local path / entrance-compatible connection.

Nie wymaga osobnej drogi międzyosadowej.

## Fauna i zagrożenie

Nie spawnujemy dodatkowych drapieżników specjalnie dla pastwiska.

Nie potrzebujemy quest-only ani scripted encounterów.

Pastwisko jest bardziej niebezpieczne dlatego, że:

- znajduje się poza defensywnym perimeterem,
- NPC i livestock realnie przebywają bliżej dzikiego świata,
- istniejące predators mogą wejść w interakcję ze stadem.

To tworzy emergent consequence bez równoległego encounter systemu.

Modyfikatory predator density dla charakteru `closed/cautious` należą do osobnego planu.

## Wydajność

Pasture nie może tworzyć aktywnego managera ani per-frame scanów.

Preferować:

- statyczne planned area,
- istniejące adaptive fauna updates,
- shepherd resolution tylko przy wyborze work destination,
- istniejące water/foraging query,
- zero nowych globalnych update loops.

Pasture geometry/decor powinno być materializowane tak samo jak pozostałe settlement props/zones i podlegać istniejącemu settlement streamingowi.

## Istniejące mechanizmy do reuse

Kluczowe miejsca:

- `src/settlement/villagePlan.ts`
  - canonical planned settlement data;
- `src/settlement/villagePlanner.ts`
  - placement/spacing/path constraints;
- `src/settlement/settlementGenerator.ts`
  - `VillagePlan → SettlementDef`;
- `src/settlement/livestock.ts`
  - deterministic livestock spawning i shepherd household association;
- `src/ai/schedule.ts`
  - obecny shepherd schedule;
- fauna work/movement resolution używany przez shepherd;
- `src/fauna/animalForaging.ts`
  - water source selection;
- `src/settlement/settlementStructures.ts`
  - istniejący `AnimalTrough` visual;
- istniejąca well infrastructure.

Ważne nowe publiczne/planner contracts udokumentować JSDoc i `@domain settlements`, jeżeli pomaga to preflightowi.

## Testy

Dodać deterministyczne testy:

- `SM` nie otrzymuje pasture;
- `MD/LG/XL` zawsze otrzymują pasture odpowiednie do skali;
- bazowy pasture size skaluje się z `VillageSize` i może uwzględniać livestock count;
- pasture istnieje również w osadzie bez shepherda;
- pasture leży poza settlement core/building ring;
- pasture nie koliduje z planned buildings/roads/water;
- przy palisadzie pasture znajduje się poza defensywnym perimeterem;
- ten sam seed generuje ten sam pasture placement;
- pasture well/trough mają stabilne planned positions;
- fencing ma stabilny planned layout;
- preferowane są dwa odcinki fencing, a jeden odcinek działa jako fallback przy trudnym placement;
- fence segments nie kolidują ze ścieżką, trough ani well;
- shepherd settlement z pasture wybiera pasture jako daytime work destination;
- zwierzęta zachowują household ownership;
- trough korzysta z istniejącego water mutation contract;
- streaming kolejności settlementów nie zmienia pasture layout.

## Poza zakresem

- pełna symulacja jakości trawy;
- depletion/regrowth pastwiska;
- pełne zamknięte enclosure;
- gates i containment simulation;
- barn/stable;
- reprodukcja zależna od pasture capacity;
- transfer własności zwierząt na settlement;
- seasonal pasture rotation;
- migracja stad między osadami;
- nowe predator spawny;
- nowe combat/guard AI;
- dynamiczne rozszerzanie outskirts;
- player-built settlement pasture.

## Weryfikacja przez użytkownika

W browserze:

1. `MD` ma niewielkie pastwisko poza zabudową;
2. `LG/XL` mają wyraźniejszą strefę livestock;
3. pasture nie przecina budynków, rzeki ani głównej drogi;
4. przy palisadzie pastwisko znajduje się za murami;
5. pastwisko ma czytelny wizualnie płot, preferencyjnie dwa odcinki z przejściem;
6. shepherd w dzień faktycznie dociera do pastwiska;
7. stado przebywa z nim w tej części świata;
8. trough/studnia są dostępne;
9. drapieżnik może realnie zagrozić stadu, ponieważ pasture nie znajduje się wewnątrz ochrony osady;
10. NPC i zwierzęta wracają do dotychczasowych miejsc zgodnie z istniejącymi routines.

> **Zrób git commit i push do main, rebase jeżeli trzeba**