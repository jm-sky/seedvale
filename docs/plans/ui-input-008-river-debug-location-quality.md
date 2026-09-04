# Plan: River debug location quality

**Created:** 2026-09-04
**Status:** `planned` 📋
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

## Cel

Sprawić, aby debugowy lookup rzeki zwracał punkt przydatny do manualnego testowania rzek: rzeczywisty odcinek cieku na lądzie, a nie punkt w jeziorze/morzu albo bezpośrednio przy ujściu.

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

### 3. Przygotować API pod testowanie wielu rzek

Nie rozbudowywać jeszcze publicznego API o pełną listę rzek, ale wydzielić selekcję kandydata tak, aby kolejny mały krok mógł dodać np. `riversNearby()` / wybór następnej rzeki bez kopiowania logiki kwalifikacji.

Nie dodawać teraz indeksu trwałych rzek ani globalnego registry.

### 4. Teleport bez zmian ownership

`debug.teleportTo.riverNearest()` ma nadal delegować do `debug.locations.riverNearest()` i istniejącego callbacku teleportu.

Nie dodawać osobnej logiki wyboru punktu do teleport API.

## Testy

Rozszerzyć `src/debug/locationQueries.test.ts` o przypadki:

- chain zawiera punkt przy/poniżej `waterLevel` oraz poprawny punkt lądowy — wybierany jest lądowy;
- tile zawiera wyłącznie punkty niekwalifikujące się — search przechodzi dalej;
- preferowany jest punkt wewnętrzny chaina zamiast terminala, jeżeli oba są poprawne;
- wynik pozostaje deterministyczny;
- `null`, gdy w całym bounded search nie ma kwalifikującego odcinka.

Utrzymać istniejące testy debug API i teleport delegation.

Uruchomić `tsc`, lint, testy i build.

## Manual verification

W przeglądarce z `?debug=1` sprawdzić wielokrotnie z różnych pozycji:

```ts
seedvale.debug.locations.riverNearest()
await seedvale.debug.teleportTo.riverNearest()
```

Zweryfikować, że teleport prowadzi do czytelnego odcinka rzeki na lądzie, a nie do jeziora/morza ani bezpośrednio do ujścia.

Manualna weryfikacja należy do gracza.

## Poza zakresem

- zmiana hydrologii, `computeRiverTile()` lub `HydrologyFlag`;
- zmiana sposobu powstawania jezior/oceanu;
- redesign river network;
- renderowanie rzek;
- poprawki channel carving;
- nowe globalne registry lokalizacji;
- pełne API do listowania wszystkich rzek.

## Kryterium sukcesu

`debug.teleportTo.riverNearest()` jest wiarygodnym narzędziem do manualnego testowania rzek: wybiera deterministyczny, reprezentatywny odcinek rzeki na lądzie w ograniczonym obszarze wyszukiwania, bez wpływania na właściwą symulację lub hydrologię świata.

Przy implementacji dodać/utrzymać JSDoc przy publicznych lub architektonicznie istotnych helperach selekcji; użyć `@domain ui-input` tam, gdzie pomaga to preflightowi.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
