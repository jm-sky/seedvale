# Plan: Player-Built Palisade and Building Removal

**Created:** 2026-09-01
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** 008
**Domain:** `items-player`

## Cel

Dodać palisadę jako drugi typ player-built world object oraz pierwszy obiekt modularny, który może być łączony z innymi segmentami.

Etap wprowadza również wspólny mechanizm usuwania player-built objects z częściowym odzyskiem materiałów.

Docelowy flow:

```
materials
    ↓
palisade placement
    ↓
segment
    ↓
snap to existing segment
    ↓
connected palisade
```

oraz:

```
placed building
    ↓
Remove
    ↓
world object removed
    ↓
partial material recovery
```

Palisada nie jest pełnym systemem budowy z construction progress/work time.

## Zakres

### 1. Palisade segment

Dodać palisadę jako osobny player-built world object.

Każdy segment jest osobnym persistent objectem.

Segment posiada:

- identity,
- position,
- rotation,
- construction/material state,
- runtime representation.

Palisada jako całość nie jest pojedynczym monolitycznym world objectem.

```
Palisade
├── segment
├── segment
├── segment
└── segment
```

Dzięki temu poszczególne segmenty mogą być niezależnie usuwane i zapisywane.

### 2. Construction recipe

Palisade segment wykorzystuje istniejące drewniane materiały/itemy.

Przed implementacją ustalić konkretny koszt segmentu na podstawie istniejących item/resource definitions i podobnych player-built objects.

Nie tworzyć nowego recipe frameworku.

Wykorzystać istniejący mechanizm:

- wymaganych materiałów,
- sprawdzania dostępności,
- consumption.

Materiały nie mogą zostać zużyte, jeśli placement zostanie odrzucony.

### 3. Placement

Palisada korzysta z istniejącego player-building placement infrastructure.

Placement musi obsługiwać:

- ground validation,
- collision validation,
- preview,
- rotation,
- potwierdzenie placement.

Palisada jest obiektem naziemnym.

Nie wymaga ściany ani istniejącego budynku.

### 4. Modular snapping

Palisade segment powinien umożliwiać snapowanie do istniejących segmentów.

Docelowy flow:

```
existing segment
       ↓
placement preview
       ↓
near valid connection point
       ↓
snap
       ↓
confirm
```

Snap powinien zapewnić:

- przewidywalne połączenie segmentów,
- spójną orientację,
- brak konieczności ręcznego ustawiania pozycji,
- możliwość tworzenia prostych ciągów,
- możliwość zmiany kierunku.

Zmiana orientacji kolejnego segmentu tworzy narożnik; nie tworzyć osobnego corner object.

Każdy segment pozostaje niezależnym world objectem.

Jeżeli istniejący placement system ma reusable connection/anchor mechanism, wykorzystać go zamiast tworzyć palisade-specific rozwiązanie.

Nie tworzyć `PalisadeManager`.

### 5. Usuwanie player-built objects

Ten etap wprowadza wspólny mechanizm usuwania player-built objects.

Nie implementować usuwania wyłącznie jako funkcji palisady.

Docelowy flow:

```
select player-built object
        ↓
Remove
        ↓
calculate recovery
        ↓
remove authoritative state
        ↓
remove runtime representation
        ↓
return materials
```

Mechanizm powinien być możliwy do wykorzystania później przez:

- torch,
- palisade,
- garden,
- field,
- house,
- inne player-built objects.

Usuwanie powinno być dostępne przez istniejący interaction/action mechanism.

Nie usuwać zwykłych world objects, NPC structures ani natural world elements.

### 6. Material recovery

Usunięcie player-built object zwraca część materiałów użytych do jego budowy.

Każdy typ budowli ma własny `recoveryRate`.

Wartości powinny typowo mieścić się w zakresie:

```
30% — minimum
75% — maximum
```

Nie traktować 30–75% jako twardego ograniczenia całego mechanizmu; wyjątki mogą być potrzebne dla przyszłych typów budowli.

Recovery rate jest własnością/konfiguracją typu player-built object, a nie regułą zakodowaną w palisade removal.

Preferowany model jest deterministyczny:

```
construction cost
        ↓
material count × recoveryRate
        ↓
deterministic rounding
        ↓
returned materials
```

Nie używać losowania do ustalania ilości odzyskanych materiałów.

Recovery nigdy nie może zwrócić więcej materiału niż pierwotny koszt.

### 7. Atomic removal and recovery

Removal musi zachowywać się atomowo.

Nie może wystąpić sytuacja:

- obiekt został usunięty, ale materiały nie zostały zwrócone,
- materiały zostały zabrane, ale obiekt nie powstał/usunięty nie został,
- część materiałów została zwrócona, a operacja zakończyła się błędem.

Jeżeli istniejący inventory system nie ma miejsca na odzyskane materiały i nie posiada istniejącego overflow/drop mechanism, removal powinno zostać zablokowane.

Nie tworzyć nowego overflow systemu tylko dla palisady.

### 8. Runtime cleanup

Po usunięciu:

- authoritative object jest usunięty,
- Three.js representation jest usunięta,
- runtime resources są zwolnione,
- obiekt nie jest zapisywany ponownie.

Usunięcie segmentu nie może pozostawić osieroconego runtime object.

Usunięcie segmentu nie powinno wymagać przebudowania całej palisady.

### 9. Persistence

Każdy palisade segment jest zapisywany jako niezależny player-built world object.

Save/load musi zachować:

- identity,
- position,
- rotation,
- wymagany stan konstrukcji.

Po reloadzie kilka segmentów powinno odtworzyć tę samą geometrię i wzajemne ustawienie.

Nie przechowywać runtime connection objects jako persistent state.

### 10. WorldBundle lifecycle

Palisada musi korzystać z istniejącego `WorldBundle` lifecycle.

W szczególności:

- authoritative state nie może należeć do Three.js objects,
- identity/state musi przetrwać world rebuild,
- runtime representation musi być możliwa do odtworzenia,
- cleanup nie może pozostawiać globalnego stanu.

Nie tworzyć `PalisadeManager`.

## Architektura

### Segment ≠ palisade

```
player-built world
├── palisade segment
├── palisade segment
└── palisade segment
```

Palisada jest układem segmentów, a nie osobnym persistent entity.

### Construction ≠ connection

Budowa odpowiada za utworzenie segmentu.

Snapping odpowiada za jego transformację podczas placement.

Nie mieszać tych odpowiedzialności.

### Removal ≠ material recovery

Ogólny removal system odpowiada za usunięcie world object.

Typ budowli dostarcza recovery policy.

```
remove(object)
    ↓
object.recoveryRate
    ↓
recover materials
```

## Performance

Nie dodawać per-frame update iterującego po wszystkich palisade segments.

Snapping i connection evaluation są potrzebne podczas placement, a nie podczas każdej klatki symulacji.

Po postawieniu segment nie powinien wymagać stałego przeliczania sąsiedztwa.

Nie tworzyć globalnego managera aktualizującego całą palisadę co frame.

## Non-goals

Plan nie obejmuje:

- construction progress,
- NPC construction,
- worker/building jobs,
- palisade gates,
- doors,
- defensive combat mechanics,
- damage/destruction,
- repair,
- automated building,
- blueprint system,
- terrain deformation,
- advanced wall topology,
- curved procedural walls,
- full building editor,
- salvage system beyond deterministic material recovery.

Nie tworzyć osobnego systemu palisade construction.

## Kryteria ukończenia

- palisada jest player-built world object,
- każdy segment jest niezależnym persistent objectem,
- segment może być postawiony na ziemi,
- placement wykorzystuje istniejące building placement infrastructure,
- placement korzysta z istniejącej walidacji,
- wymagane materiały są sprawdzane przed zużyciem,
- odrzucony placement nie zużywa materiałów,
- segment może snapować do istniejącego segmentu,
- snap zapewnia spójne połączenie i orientację,
- można zbudować kilka połączonych segmentów,
- można zmienić kierunek palisady bez osobnego corner object,
- każdy segment zachowuje własną identity,
- save/load zachowuje wszystkie segmenty,
- można usunąć pojedynczy segment,
- removal korzysta ze wspólnego player-built object mechanism,
- removal zwraca część materiałów,
- recovery rate jest konfigurowany przez typ budowli,
- recovery jest deterministyczne,
- recovery nie zwraca więcej materiałów niż koszt budowy,
- removal jest atomowy względem usunięcia obiektu i odzysku materiałów,
- brak miejsca w inventory blokuje removal, jeśli nie istnieje istniejący overflow/drop mechanism,
- usunięty segment nie wraca po save/load,
- usunięcie jednego segmentu nie usuwa pozostałych segmentów,
- nie powstał `PalisadeManager`,
- nie powstał palisade-specific placement system,
- nie powstał palisade-specific removal system,
- nie dodano per-frame simulation dla segmentów.

## Weryfikacja

Automatycznie:

```
pnpm exec tsc --noEmit
pnpm run lint
pnpm run test
pnpm run build
```

W razie istnienia aktualnych komend preflight/CI użyć ich zgodnie z `CLAUDE.md`.

Manualnie:

1. wejść w placement palisady,
2. sprawdzić preview pierwszego segmentu,
3. sprawdzić zachowanie przy braku materiałów,
4. postawić segment,
5. sprawdzić zużycie materiałów,
6. ustawić drugi segment w pobliżu pierwszego,
7. potwierdzić automatyczne snapowanie,
8. zbudować kilka połączonych segmentów,
9. sprawdzić zmianę kierunku palisady,
10. zapisać świat,
11. wykonać reload,
12. potwierdzić poprawne odtworzenie segmentów,
13. wybrać pojedynczy segment,
14. użyć `Remove`,
15. potwierdzić usunięcie tylko tego segmentu,
16. potwierdzić częściowy zwrot materiałów,
17. sprawdzić, że pozostałe segmenty nadal istnieją,
18. zapisać/reload i potwierdzić brak usuniętego segmentu,
19. sprawdzić removal przy pełnym inventory, jeśli inventory ma limit.

## JSDoc

Podczas implementacji dodać JSDoc dla ważnych publicznych/architektonicznych funkcji i klas wprowadzonych lub istotnie zmienionych przez ten plan, gdy jest potrzebny do preflight/discovery.

Warto użyć:

```
@domain items-player
```

## Dokumentacja

Jeżeli implementacja zmieni rzeczywisty stan opisany w `docs/STATE.md`, zaktualizować odpowiednią sekcję.

Jeżeli wspólny removal/recovery mechanism stanie się częścią player-building infrastructure, udokumentować go w odpowiednim miejscu.

Po implementacji sprawdzić, czy roadmapa player construction nadal poprawnie opisuje kolejne etapy.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
