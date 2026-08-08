# Plan: Kierunkowskazy przy drogach do wiosek

**Status:** `todo`
**Created:** 2026-08-08
**Scope:** rozszerza [roads-and-paths](./2026-08-07--026--roads-and-paths.md) (`roadNetwork.ts` — grafowanie osad, nazwane trasy) i [village-generation](./2026-08-08--031--village-generation.md) (`SettlementDef.name`)

## Skąd to się wzięło

Propozycja użytkownika po teście wiosek: przy drogach międzyosadowych postawić kierunkowskazy pokazujące, dokąd prowadzą (nazwa docelowej osady) — dziś gracz nie ma żadnej wskazówki poza wizualnym śledzeniem drogi (lub minimapą, jeśli osada jest już znana/widoczna).

**Update (2026-08-09):** kierunkowskazy tylko przy krawędzi osady to za mało — user chce też oznaczenia **w głębi trasy** (np. w połowie odległości między wioskami) oraz **na skrzyżowaniach**, nie tylko przy samym punkcie startowym drogi. Sekcja „Koncepcja v1" niżej zaktualizowana o oba przypadki.

## Stan obecny (dla kontekstu)

- `settlement/roadNetwork.ts` już zna pełny graf: `neighborsFor(cell, ctx)` (kandydaci-sąsiedzi wg realnego dystansu), `roadSegmentsForSettlement(def, ctx)` (faktycznie połączone drogi, do `maxNeighborRoads`), każda `SettlementDef` ma unikalną nazwę (`generateSettlementName`, `shared/SettlementName.ts`).
- Drogi są dziś **czysto terenowe** (spłaszczenie + tinting w `chunkHeightmap.ts`) — żadnych propsów/oznaczeń wzdłuż nich.
- Wzorzec etykiet w świecie: `.npc-label`/`CSS2DObject` (etykiety NPC, skalowane opacity z dystansem przez `labelOpacityForDistance`, `src/ui/labelDistance.ts`) — gotowy do reużycia dla tekstu kierunkowskazu zamiast wymyślania nowego systemu renderowania tekstu 3D.

## Koncepcja v1

Trzy miejsca na kierunkowskazy wzdłuż drogi, rosnące od najprostszego:

### 1. Przy krawędzi osady (punkt startowy drogi)

1. **Pozycja i orientacja:** dla każdego `RoadSegment` (`kind: 'road'`) należącego do osady — pierwszy punkt trasy (`segments[0].a`, blisko `def`) daje pozycję; kierunek do drugiego punktu (`segments[0].b` lub kolejnego) daje orientację (rotacja słupka + tabliczki wzdłuż drogi, ten sam wzorzec co `MinorLocation.angle` dla doku w `minorLocations.ts`).
2. **Nowy prop `createSignpost()`** (`settlement/props.ts`, styl spójny z `createWell`/`createDock` — prosty słupek + tabliczka, flat-shaded, `BoxGeometry`/`CylinderGeometry`).
3. **Etykieta:** `CSS2DObject` (jak `.npc-label`) z tekstem nazwy docelowej osady (`neighbor.name`, już dostępne z `roadSegmentsForSettlement`/`neighborsFor`) — reużywa `labelOpacityForDistance` dla zanikania z dystansem, spójnie z NPC-ami.
4. **Gdzie wpiąć:** `createSettlement.ts` już rozwiązuje `roadCtx` dla doku (`minorLocationsFor`/`routeToMinorLocation`) — analogiczny krok: dla każdego `roadSegmentsForSettlement(def, ctx)` segmentu typu `'road'`, dodać signpost do grupy osady, tak jak dziś dodawany jest dok.

### 2. W połowie trasy (nowe, 2026-08-09)

- Trasa (`RoadSegment[]` dla jednej drogi, z `findRoute`/`toSegments`) to seria punktów — policzyć długość łuku (jak `smoothProfile`'s `arc` w `roadNetwork.ts`) i znaleźć punkt najbliższy 50% całkowitej długości.
- Tam postawić **dwa** signposty (jeden na każdy kierunek, ten sam prop co przy osadzie) albo jeden dwustronny słupek z tabliczką na każdą stronę — do zdecydowania przy implementacji, dwustronny bardziej realistyczny dla prawdziwego rozstaju.
- **Unikanie duplikatów:** trasa jest dziś cachowana raz per para osad, kluczowana posortowaną parą id (`routeCache`/`pairKey` w `roadNetwork.ts`) — ale KAŻDA z dwóch osad woła `roadSegmentsForSettlement` niezależnie. Signpost w połowie trasy musi być dodany **tylko raz**, nie przez obie osady osobno — np. reguła „dodaje go tylko osada z leksykograficznie mniejszym `id`" (ten sam duch, co istniejący `pairKey`).
- Signpost w połowie trasy nie należy do żadnej konkretnej osady w sensie `group`/`landmarks` — potrzebuje własnego miejsca w scenie (być może nowy, mały „minor prop" rejestrowany przy pierwszej z dwóch osad, która się załaduje — do przemyślenia przy implementacji, żeby nie zniknął przy unload jednej z dwóch osad, dopóki obie nie są poza zasięgiem).

### 3. Na skrzyżowaniach (nowe, 2026-08-09)

- „Skrzyżowanie" = miejsce, gdzie dwie różne trasy (różne pary osad) przebiegają blisko siebie — dziś **nie ma** wprost takiego pojęcia w `roadNetwork.ts` (każda trasa liczona niezależnie, bez świadomości sąsiednich tras).
- Najprostsze podejście: przy budowaniu segmentów per-chunk (`segmentsNear`/`clearingSegmentsNear`-jak pattern) sprawdzić, czy segmenty dwóch **różnych** tras (`RoadCorridorSegment` z różnych par osad) leżą w promieniu kilku jednostek od siebie — jeśli tak, to przybliżone skrzyżowanie, tam postawić wieloramienny signpost (kilka tabliczek na jednym słupku, po jednej na każdy kierunek).
- Zaakceptować, że to **przybliżenie geometrii** (rzeczywiste przecięcie odcinków nie jest sprawdzane) — wystarczające dla dekoracyjnego drogowskazu, nie dla logiki nawigacji.
- Z `maxNeighborRoads` ograniczonym do 3-4 i siatką osad co `SETTLEMENT_GRID_STEP=280`, rzeczywistych skrzyżowań może być niewiele — ocenić w praktyce na kilku seedach, czy ten punkt w ogóle wnosi coś wizualnie zauważalnego, zanim zainwestuje się więcej czasu w dokładniejszą detekcję.

## Poza zakresem v1

- Kierunkowskazy przy ścieżkach do mniejszych lokalizacji (`kind: 'path'`, np. do doku) — tylko drogi międzyosadowe, jak prosił user.
- Dystans do celu na tabliczce (np. „Lipowo — 340m") — możliwe rozszerzenie, nie blokujące, do dodania jeśli wygląda dobrze bez tego.
- Dokładna geometryczna detekcja przecięcia odcinków (punkt 3) — przybliżenie odległością wystarczy na start.
- Kierunkowskazy dla dróg, które akurat nie są jeszcze rozwiązane (osada poza `SettlementsManager` load radius) — te i tak nie generują się, dopóki obie strony drogi nie zostaną załadowane (ta sama „eventual consistency" co reszta `roadNetwork.ts`).

## Weryfikacja

- Kilka `?seed=` z widocznymi drogami międzyosadowymi (patrz [roads-and-paths](./2026-08-07--026--roads-and-paths.md)) — kierunkowskaz stoi przy wyjściu drogi z osady, tabliczka pokazuje poprawną nazwę sąsiedniej osady, orientacja zgodna z kierunkiem drogi.
- Signpost w połowie trasy widoczny raz (nie podwójnie) między dwiema załadowanymi osadami; nie znika, dopóki chociaż jedna z dwóch osad jest załadowana.
- Jeśli zaimplementowany punkt 3 — na seedach z gęstszą siecią dróg (`maxNeighborRoads` 3-4) sprawdzić, czy skrzyżowania faktycznie się zdarzają i czy wieloramienny signpost tam wygląda sensownie.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

## Powiązane

- [roads-and-paths](./2026-08-07--026--roads-and-paths.md) — `roadNetwork.ts`, `neighborsFor`/`roadSegmentsForSettlement`
- [village-generation](./2026-08-08--031--village-generation.md) — `SettlementDef.name`
- `src/settlement/minorLocations.ts` — wzorzec orientacji propsa wzdłuż kierunku (`MinorLocation.angle`, dok)
- `src/ui/labelDistance.ts` — `labelOpacityForDistance`, reużyte dla etykiety kierunkowskazu
