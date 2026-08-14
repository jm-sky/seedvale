# Plan 071: Local Economy & Settlement Development

**Status:** `verification needed` 🔍 — implemented 2026-08-13; technically verified (`tsc`/`lint`/`build`/`test`). Browser: watch a woodcutter chop → deposit, then a second smaller pile appear after enough wood.
**Created:** 2026-08-11
**Scope:** przyszły etap po rozwoju NPC schedule/actions, oparty na istniejących systemach zasobów, potrzeb, pracy, osad i planowania wiosek.

## Cel

Zbudować lokalną gospodarkę osady jako system wynikający z życia NPC i dostępnych zasobów, a następnie wykorzystać ją do naturalnego rozwoju osady.

Nie tworzyć osobnego, izolowanego „crafting systemu”. Produkcja, dobra, magazyny i crafting powinny korzystać ze wspólnego modelu ekonomii.

## 1. NPC livelihood

NPC powinny wykonywać rzeczywistą pracę odpowiadającą potrzebom osady i własnym rolom:

- zdobywanie i przechowywanie żywności,
- pobieranie i przechowywanie wody,
- zapasy żywności i wody,
- pasza dla zwierząt,
- hodowla / obsługa zwierząt,
- polowanie,
- łowienie ryb,
- ścinanie i pozyskiwanie drewna,
- zbieranie innych lokalnych zasobów,
- transport zasobów między miejscem pozyskania, magazynem i miejscem użycia.

Docelowy przepływ:

`needs → work → resources → storage → consumption`

System powinien rozszerzać istniejące NPC needs, schedule/actions, role i world interactions zamiast tworzyć równoległy mechanizm AI.

## 2. Local economy

Zasoby naturalne powinny prowadzić do produkcji dóbr potrzebnych mieszkańcom i osadzie:

`natural resources → production → goods → storage → settlement consumption`

Wstępny zakres:

- lokalne źródła surowców,
- produkcja dóbr,
- magazyny i zapasy,
- zużycie dóbr przez NPC i osadę,
- zapotrzebowanie i niedobory,
- specjalizacja osad wynikająca z lokalnych zasobów i profesji,
- nadwyżki produkcji,
- wymiana dóbr między osadami.

Plan 032 przygotował już fundament w postaci `NaturalResource`, richness, `dominantResource`, food source i specjalizacji rodzin. Produkcja i handel pozostają kolejnym etapem.

## 3. Settlement growth

Osada powinna rozwijać się w odpowiedzi na populację, potrzeby, dostępne zasoby i zgromadzone dobra.

Wstępny zakres:

- common goods / materiały potrzebne do rozwoju,
- wymagania nowych budynków,
- nowe domy wraz ze wzrostem populacji,
- magazyny i budynki produkcyjne,
- warsztaty i inne obiekty związane z lokalną gospodarką,
- rozwój infrastruktury,
- poprawa / przygotowanie terenu pod nowe funkcje,
- planowanie kolejnych etapów rozwoju osady.

Docelowy przepływ:

`population + needs + resources + goods → settlement development`

Rozwój powinien być procesem wynikającym z symulacji, a nie ręcznie uruchamianym „level-upem” wioski.

## 4. Crafting

Crafting powinien zostać zbudowany **na wspólnym systemie ekonomii**, a nie jako osobna mechanika.

Przykładowo:

`resource → production/processing → good/material → crafting recipe → item`

To pozwoli wykorzystać te same zasoby, magazyny, profesje i dobra zarówno przez NPC, osadę, jak i później przez gracza.

## 5. Trade / exchange

Handel jest kolejnym etapem po uruchomieniu lokalnej produkcji i magazynowania:

- osady z nadwyżkami mogą dostarczać dobra,
- osady z niedoborami mogą ich potrzebować,
- istniejąca specjalizacja zasobowa osad może tworzyć naturalne kierunki wymiany,
- handel powinien wynikać z potrzeb i dostępności, nie z questów handlowych.

## 6. Zasada architektoniczna

Najważniejszym celem nie jest stworzenie dużej liczby systemów ekonomicznych, lecz połączenie istniejących mechanizmów:

`natural resources → NPC professions/work → production → storage → needs → settlement growth → trade`

NPC, settlement i player crafting powinny konsumować możliwie wspólny model zasobów/dóbr.

## Poza zakresem tego wstępnego planu

Na tym etapie nie ustalamy jeszcze:

- dokładnego modelu danych produkcji,
- listy wszystkich dóbr i receptur,
- konkretnej hierarchii budynków,
- szczegółowego systemu cen/waluty,
- pełnego modelu handlu między osadami,
- dokładnych zasad automatycznego rozwoju terenu.

Te elementy wymagają osobnego review aktualnego repozytorium i dopracowania planu przed implementacją.

## Powiązane plany

- `032` — Natural Resources, Food & Village Economy
- `060` — NPC Schedule Actions + Trait Overlays
- `047` — Village Generation Overhaul
- `058` — Living Forest / Tree Lifecycle
- `057` — Axe / Player Tree Harvesting

## Następny krok

Przed implementacją należy przeprowadzić review aktualnego repozytorium i rozbić ten kierunek na konkretne, zależne od siebie etapy implementacyjne. W szczególności należy ustalić wspólny model `resources / goods / storage / production` oraz sposób, w jaki NPC actions będą realizować pracę gospodarczą.