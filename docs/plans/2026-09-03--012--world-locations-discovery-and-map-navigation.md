# Plan: World Locations, Discovery and Map Navigation

**Created:** 2026-09-03
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `world`
**Type:** `feature`
**Roadmap:** `locations`

## Goal

Rozbudować istniejącą mapę Seedvale o system konkretnych **World Locations**, ich nazw, odkrywania oraz nawigacji.

Gracz nie zna automatycznie wszystkich interesujących miejsc świata. Wiedzę zdobywa poprzez:
- rozmowy z NPC,
- mapy kupowane u handlarzy,
- później także eksplorację świata.

System ma wykorzystać istniejące mechanizmy mapy, `MapKnownLocation`, `MapDiscovery`, minimapę, settlementy, proceduralne landmarki i `CaveDefinition`, zamiast tworzyć równoległy system markerów.

Pierwsze typy:
- `settlement`
- `cave`
- `mountainPeak`
- `lake`
- `cemetery`

## 1. World Locations

Wprowadzić lekki, niezależny od Three.js model konkretnej lokacji świata:

```
WorldLocation
 ├─ stable id
 ├─ kind
 ├─ position X/Z
 ├─ name
 └─ discoveryWeight
```

`WorldLocation` jest danymi świata, a nie obiektem renderującym.

Źródła lokacji:
- `settlement` → istniejące settlementy,
- `cave` → istniejące `CaveDefinition`,
- `cemetery` → istniejące procedural landmarks,
- `lake` → istniejące dane jezior,
- `mountainPeak` → nowa reprezentacja konkretnych szczytów.

Nie tworzyć osobnych systemów lokacji dla każdego typu.

## 2. Stabilne identyfikatory i nazwy

Każda lokacja musi mieć stabilne ID.

Nazwy landmarków powinny być deterministyczne względem world seed + location ID.

Przykłady:
- Szczyt Miedziany
- Jezioro Srebrne
- Jaskinia Czarnego Kamienia
- Cmentarz Starych Dębów

Nazwa:
- nie jest generowana przez UI,
- nie zmienia się po reloadzie,
- może być odtworzona deterministycznie z danych świata.

Settlementy zachowują istniejący mechanizm nazewnictwa.

## 3. Rozdzielenie eksploracji i wiedzy

Istniejące odkrywanie komórek mapy pozostaje bez zmian:

```
MapDiscovery
    discoveredCells
```

Dodać niezależną wiedzę o konkretnych lokacjach:

```
Location knowledge
    discoveredLocations
```

Nie zastępować `discoveredCells` systemem lokacji.

Wykorzystać istniejący `MapKnownLocation` i jego:
- `state`
- `source`
- `label`
- `description`

Źródła wiedzy:
- `npc`
- `map`
- `exploration`

## 4. Zasięgi

Przyjąć abstrakcyjną jednostkę podróży:

```
1 dzień drogi = 20 km
```

Zakresy:

| Zakres | Odległość |
|---|---:|
| `near` | 0–20 km |
| `medium` | 20–60 km |
| `far` | 60–200 km |

Odległość w pierwszej wersji liczona jako poziomy dystans świata:

```
sqrt(dx² + dz²)
```

Nie używać pathfindingu ani rzeczywistej długości trasy.

„Dzień drogi” jest jednostką gameplayową i nie oznacza prędkości NPC/playera.

## 5. Discovery weight

Landmark posiada:

```
discoveryWeight
```

Waga określa **ważność lokacji przy wyborze informacji przekazywanych graczowi**.

Nie jest to prawdopodobieństwo wygenerowania lokacji.

Algorytm:
1. filtr dystansu,
2. wybór wg `discoveryWeight`.

Settlementy nie korzystają z `discoveryWeight`.

## 6. Strażnik — landmark knowledge

Strażnik zna landmarki w zakresie:
- near + medium,
- 0–60 km.

Z kwalifikujących się landmarków wyznaczana jest pula **top 5 wg `discoveryWeight`**.

Strażnik nie przekazuje jednak całej puli jednocześnie.

## 7. Dialog ze strażnikiem

Dostępna opcja:

> Opowiedz mi coś o okolicy.

Odpowiedź jest dynamiczna i zawiera **1–3 lokacje** wylosowane z top 5 znanych strażnikowi.

Tylko te 1–3 lokacje zostają dodane do wiedzy gracza.

Kolejna rozmowa może wybrać inne lokacje z top 5.

Już odkryte przez gracza lokacje nie powinny być traktowane jako nowe odkrycie.

Po odkryciu należy pokazać krótki feedback, np.:

> Nowe miejsca odkryte  
> Jaskinia Czarnego Kamienia  
> Jezioro Srebrne

## 8. Strażnik — settlement knowledge

Settlementy są całkowicie niezależne od puli top 5 landmarków.

Strażnik zna **najbliższe settlementy** według dystansu.

Rozmowa może więc odkrywać zarówno:
- landmarki → weighted top 5,
- settlementy → nearest settlements.

Nie konkurują one ze sobą o wspólną pulę.

## 9. Mapy kupowane u handlarza

Wprowadzić dwa rodzaje map.

### Near Map

```
Landmarks:
    near range
    weighted top 10

Settlements:
    near range
```

### Far Map

```
Landmarks:
    far range
    weighted top 10

Settlements:
    far range
```

Far map nie może powtarzać landmarków ujawnionych przez Near Map.

Jeżeli w danym zakresie jest mniej niż 10 kwalifikujących się lokacji, mapa zawiera wszystkie dostępne.

## 10. Map item i Map Knowledge

Mapa kupiona u handlarza:
- trafia do inventory,
- ma bardzo małą wagę,
- natychmiast przekazuje wiedzę do mapy gracza.

Po przekazaniu wiedza jest niezależna od przedmiotu.

Usunięcie/sprzedanie mapy **nie usuwa wiedzy**.

Po zakupie należy pokazać feedback, np.:
> Odkryto 17 nowych miejsc.

## 11. Settlement discovery

Obecne automatyczne ujawnianie wszystkich settlementów należy usunąć.

Nowy model:
- nowa gra → settlements unknown,
- NPC conversation → settlement knowledge,
- Near Map → nearby settlements,
- Far Map → distant settlements.

Sam fakt istnienia settlementu w świecie nie oznacza automatycznego oznaczenia go na mapie gracza.

## 12. Pełna mapa

Wykorzystać istniejące `drawMap()` i `knownLocations()`.

Mapa pokazuje wszystkie **znane graczowi** lokacje.

Kliknięcie lokacji otwiera mały panel/popover:

```
Jaskinia Czarnego Kamienia
Jaskinia

37 km · około 2 dni drogi

[ Wyznacz cel ]
```

Dla aktywnego celu:
```
[ Usuń cel ]
```

Nie odkrywać lokacji przez kliknięcie.

## 13. Aktywne cele mapy

Gracz może wybrać maksymalnie **3 discovered locations** jako cele podróży.

Każdy cel ma osobny kolor/slot:

```
① Cel
② Cel
③ Cel
```

Mapa pokazuje listę aktywnych celów.

Kliknięcie celu na liście centruje mapę na lokacji.

Dodać:
- `Wyczyść cele`,
- `Wyśrodkuj na graczu`.

Odkrycie lokacji i ustawienie jej jako celu są osobnymi operacjami.

## 14. Minimap

Minimapa nie pokazuje wszystkich discovered locations.

Pokazuje wyłącznie aktywne 1–3 cele.

Dla celu:
- wewnątrz minimapy → marker,
- poza minimapą → strzałka przy krawędzi wskazująca kierunek.

Kolor strzałki/markera odpowiada slotowi celu.

Wykorzystać istniejącą logikę minimap arrows.

Nie tworzyć osobnego systemu nawigacji GPS.

## 15. Dystans i UX

W UI używać przyjaznej reprezentacji:

```
37 km · około 2 dni drogi
```

Nie pokazywać graczowi technicznych zakresów `near/medium/far`.

Odległość może być liczona na podstawie aktualnej pozycji gracza.

## 16. Location state

Wykorzystać istniejące rozróżnienie stanu wiedzy:
- `estimated`
- `discovered`
- `confirmed`

Przykładowo:
- NPC tells player → estimated/discovered,
- player reaches location → confirmed.

Dokładny zakres automatycznego `confirmed` dla poszczególnych typów lokacji może zostać ograniczony do przypadków, dla których istnieje już odpowiedni world-system.

## 17. Deep caves

Cave location wskazuje na **wejście do jaskini**.

Źródłem danych:
```
CaveDefinition
    caveId
    entrance.x
    entrance.z
```

Mapa nie potrzebuje ładować ani analizować geometrii jaskini.

Dzięki temu każda deep cave może mieć własną stabilną lokację na mapie.

## 18. Fizyczne landmarki

Dla `mountainPeak` docelowo wygenerować fizyczny element na szczycie:
- kamień,
- tablica,
- nazwa szczytu.

Nazwa pochodzi z tego samego `WorldLocation`, który pokazuje mapa.

## 19. Debug

Dodać narzędzia developerskie pozwalające:
- Show all locations,
- Show undiscovered locations,
- Show location IDs,
- Reveal location,
- Reveal all locations.

Szczególnie ważne dla testowania deep caves.

Debug nie może wpływać na normalny `MapKnowledge`.

## 20. Persistence

Wiedza o odkrytych konkretnych lokacjach musi być zapisywana.

Po reloadzie world seed + stable location IDs + player location knowledge muszą odtworzyć ten sam stan.

Nie zapisywać deterministycznych danych, które można ponownie wygenerować, np. nazw lokacji.

## 21. Architektura

Docelowy przepływ:

```
                    WORLD
                      │
                WorldLocation
                      │
        ┌─────────────┴─────────────┐
        │                           │
   Physical world              Discovery
        │                           │
   cave / peak / etc.         NPC / Map / Explore
                                    │
                                    ↓
                              MapKnowledge
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                      World Map             Targets
                                               │
                                               ↓
                                            Minimap
```

`WorldLocation` nie powinien zależeć od:
- Three.js,
- canvas,
- Vue,
- minimapy.

## 22. UX — dodatkowe wymagania

- Odkrycie lokacji i wyznaczenie jej jako celu są osobnymi operacjami.
- Kliknięcie lokacji na mapie otwiera informacje o niej.
- Informacje pokazują typ, nazwę i dystans.
- Aktywne cele mają listę 1–3 pozycji.
- Cele można usunąć pojedynczo i wyczyścić wszystkie.
- Mapa posiada przycisk centrowania na graczu.
- Pełna mapa może filtrować kategorie lokacji.
- Minimap pozostaje prosta i pokazuje tylko aktywne cele.
- Nie stosować dużej ekranowej strzałki GPS.
- Odkrycie przez NPC/handel daje wyraźny feedback.
- `estimated/discovered/confirmed` powinny być wizualnie rozróżnialne, jeśli jest to możliwe bez przeładowania UI.

## 23. Poza zakresem

Nie implementować w tym planie:
- spring,
- riverSource,
- ruins,
- monolith,
- waterfall,
- pathfindingowego czasu podróży,
- rzeczywistego travel simulation,
- zaawansowanego systemu wiedzy NPC,
- LLM-generated dialogue,
- pełnego systemu plotek.

## 24. Verification

Sprawdzić manualnie:
1. Nowa gra nie pokazuje automatycznie wszystkich settlementów.
2. Strażnik może odkryć 1–3 landmarki podczas jednej rozmowy.
3. Kolejne rozmowy mogą odkryć pozostałe lokacje z top 5.
4. Strażnik wskazuje settlementy niezależnie od landmark pool.
5. Near Map odkrywa właściwe lokacje.
6. Far Map odkrywa inne lokacje i nie dubluje Near Map.
7. Zakup mapy zachowuje wiedzę po usunięciu itemu.
8. Kliknięcie lokacji otwiera informacje i pozwala ustawić cel.
9. Maksymalnie 3 cele mogą być aktywne.
10. Cele mają stabilne kolory.
11. Minimap pokazuje marker lub kierunkową strzałkę.
12. Centrowanie na graczu działa.
13. Odkrycie pokazuje czytelny feedback.
14. Deep caves wskazują wejścia.
15. Nazwy lokacji są stabilne między uruchomieniami.
16. Persistence zachowuje location knowledge.
17. Debug pozwala znaleźć wszystkie lokacje/jaskinie.
18. Istniejące odkrywanie komórek mapy nadal działa niezależnie.

**Zrób git commit i push do main, rebase jeżeli trzeba**
