# Plan: River debug location quality

**Created:** 2026-09-04
**Status:** `verification needed` 🔍
**Type:** bug
**Priority:** medium · **Effort:** S
**Depends on:** ui-input-001
**Domain:** `ui-input`
**Subdomains:** `interaction`
**Tags:** `debug` `river` `teleport`
**Roadmap:** -

## Problem

`debug.locations.riverNearest()` oraz `debug.teleportTo.riverNearest()` potrafią kierować gracza do jeziora albo morza zamiast do czytelnego odcinka rzeki na lądzie.

To nie jest błąd hydrologii. River network poprawnie może kończyć ciek w prawdziwym zbiorniku wodnym, a `OCEAN_OUTLET` obejmuje także śródlądowy sink znajdujący się na lub poniżej `waterLevel`.

Problem leży w semantyce debugowego wyboru lokalizacji: obecny kod uznaje każdy `RiverChain.points[]` za równoważny kandydat i wybiera najbliższy punkt z pierwszego tile/ringu, w którym istnieje rzeka. Nie ma kryterium mówiącego, że teleport testowy powinien trafić na reprezentatywny, lądowy odcinek rzeki z dala od ujścia lub zalanego fragmentu.

Dodatkowo obecne API nie daje wygodnego sposobu przechodzenia między różnymi rzekami podczas manualnego testowania.

## Cel

Sprawić, aby debugowy lookup rzeki zwracał punkt przydatny do manualnego testowania rzek: rzeczywisty odcinek cieku na lądzie, a nie punkt w jeziorze/morzu albo bezpośrednio przy ujściu.

Dodać wygodny, deterministyczny sposób przechodzenia do kolejnych różnych rzek bez ręcznego manipulowania pozycją gracza.

Nie zmieniać generacji, topologii ani hydrologii rzek.

## Zakres

### 1. Wprowadzić pojęcie kwalifikującego punktu debugowego rzeki

W `src/debug/locationQueries.ts` zastąpić obecne bezwarunkowe `nearestChainPoint()` selekcją kandydatów spełniających warunki jakościowe.

Kandydat powinien:

- pochodzić z istniejącego `RiverChain` wygenerowanego przez `computeRiverTile()`;
- znajdować się ponad globalnym poziomem zbiorników wodnych z bezpiecznym marginesem, tak aby nie wybierać końców chainów wpadających do jeziora/oceanu;
- preferować punkt wewnętrzny chaina zamiast pierwszego/ostatniego punktu, jeżeli pozwala na to długość chaina;
- nadal być wybierany deterministycznie;
- nie wymagać renderowanych chunków, sceny Three.js ani river tile cache.

Preferowana baza kryterium wysokości to dane już obecne w `RiverPoint` / `RawSampleParams`, bez ponownego samplowania renderowanego terenu.

Nie wprowadzać osobnego modelu „debug river”.

### 2. Zachować bounded search

Zachować obecny tile-ring search i jego ograniczony koszt. Nie skanować proceduralnego świata bez limitu.

Jeżeli pierwszy tile zawiera wyłącznie niekwalifikujące się punkty przy zbiorniku, wyszukiwanie ma przejść do kolejnego tile/ringu zamiast zwracać zły punkt.

Nie zmieniać ogólnego kontraktu `searchNearest()` dla pozostałych location queries, jeśli problem można rozwiązać przez lepszy `probe` w `riverNearest()`.

### 3. Wyszukiwanie wielu różnych rzek

Dodać mały, bounded mechanizm zwracający kilka kwalifikujących się kandydatów reprezentujących **różne rzeki**, a nie kilka punktów tego samego cieku.

Preferowane API:

```ts
debug.locations.riversNearby()
```

Wyniki powinny:

- używać tej samej logiki kwalifikacji punktu co `riverNearest()`;
- być deterministycznie uporządkowane;
- mieć ograniczony koszt i zasięg;
- deduplikować fragmenty tego samego cieku przecinające wiele river tiles;
- nie tworzyć trwałego globalnego registry rzek.

Sposób identyfikacji „tej samej rzeki” ma bazować na istniejącej topologii/ciągłości chainów lub lekkim deterministycznym kluczu wyprowadzonym z aktualnych danych. Nie wprowadzać równoległego modelu hydrologii tylko na potrzeby debug API.

### 4. `teleportTo.nextRiver()`

Rozszerzyć `TeleportToDebugApi` o:

```ts
await debug.teleportTo.nextRiver()
```

Semantyka:

- pierwsze wywołanie wybiera pierwszą kwalifikującą się rzekę z deterministycznej listy;
- kolejne wywołania przechodzą do następnej **różnej rzeki**;
- po końcu listy następuje deterministyczne zawinięcie do początku;
- stan kursora należy wyłącznie do warstwy debugowej i nie może wpływać na symulację świata;
- po rebuildzie świata lub zmianie seed/config cursor musi zostać bezpiecznie zresetowany albo ponownie związany z aktualną listą;
- teleport nadal korzysta z tego samego wąskiego callbacku i mechanizmu ładowania chunków co istniejące `teleportTo.*`.

Nie duplikować wyszukiwania w teleport API — `nextRiver()` ma korzystać ze wspólnej logiki candidate/list selection.

### 5. Teleport bez zmian ownership

`debug.teleportTo.riverNearest()` ma nadal delegować do `debug.locations.riverNearest()` i istniejącego callbacku teleportu.

Nie dodawać osobnej logiki wyboru punktu do teleport API poza lekkim debugowym cursorem wymaganym przez `nextRiver()`.

## Testy

Rozszerzyć `src/debug/locationQueries.test.ts` oraz testy debug API o przypadki:

- chain zawiera punkt przy/poniżej `waterLevel` oraz poprawny punkt lądowy — wybierany jest lądowy;
- tile zawiera wyłącznie punkty niekwalifikujące się — search przechodzi dalej;
- preferowany jest punkt wewnętrzny chaina zamiast terminala, jeżeli oba są poprawne;
- wynik pozostaje deterministyczny;
- `null`, gdy w całym bounded search nie ma kwalifikującego odcinka;
- `riversNearby()` nie zwraca wielu fragmentów tej samej rzeki jako osobnych kandydatów;
- `nextRiver()` przechodzi po różnych rzekach w stabilnej kolejności i zawija do początku;
- cursor `nextRiver()` nie przecieka do symulacji i zachowuje się poprawnie po rebuildzie/world change.

Utrzymać istniejące testy debug API i teleport delegation.

Uruchomić `tsc`, lint, testy i build.

## Manual verification

Manualna weryfikacja należy do gracza.

## Poza zakresem

- zmiana hydrologii, `computeRiverTile()` lub `HydrologyFlag`;
- zmiana sposobu powstawania jezior/oceanu;
- redesign river network;
- renderowanie rzek;
- poprawki channel carving;
- nowe globalne registry lokalizacji;
- trwałe ID wszystkich rzek w świecie;
- nieograniczone listowanie wszystkich rzek proceduralnego świata.
- agent Ai nie robi weryfikacji w browser

## Kryterium sukcesu

`debug.teleportTo.riverNearest()` jest wiarygodnym narzędziem do manualnego testowania rzek, a `debug.teleportTo.nextRiver()` pozwala szybko przechodzić między różnymi, reprezentatywnymi rzekami w deterministycznym, bounded search bez wpływania na właściwą symulację lub hydrologię świata.

Przy implementacji dodać/utrzymać JSDoc przy publicznych lub architektonicznie istotnych helperach selekcji; użyć `@domain ui-input` tam, gdzie pomaga to preflightowi.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
