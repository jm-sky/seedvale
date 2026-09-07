# Implementation Notes: Contextual River Water Safety

**Reviewed:** 2026-09-07  
**Source:** current `main` codebase + `docs/STATE.md` + `docs/plans/PLANNING.md` + `world-017-contextual-river-water-safety.md` + current river/water/settlement implementations

## 1. Najważniejsza decyzja architektoniczna

Plan pasuje do obecnej architektury, ale dziś brakuje jednego seamu: `resolveWaterBodyShore()` dostaje dla rzeki tylko `kind + bank position`, a `ChunkManager` nie wystawia hydrologicznego kontekstu tego miejsca.

Nie odtwarzać river lookup w `WaterSource` ani `survivalActions`. Rozszerzyć istniejący river query path tak, aby z tego samego najbliższego segmentu dało się uzyskać dane potrzebne klasyfikacji (`elevation`, `accumulation`, opcjonalnie stabilny spatial key).

Najlepsza granica odpowiedzialności:

- `riverNetwork.ts` / `ChunkManager` — znajdowanie lokalnego kontekstu hydrologicznego,
- nowy mały pure classifier w warstwie world — hydrology + settlement modifier → `WaterQuality`,
- `WaterSource` — nadal tylko finalny kontrakt `{ kind, quality, ... }`, bez hydrologii i settlement logic,
- `survivalActions.ts` — bez zmian semantycznych; konsumuje gotowy `WaterSource`.

## 2. Reuse istniejącego river runtime

`src/terrain/riverNetwork.ts` już ma właściwe dane źródłowe:

- `RiverPoint = { x, z, elevation, accumulation }`,
- `flowFactor(accumulation)` jest kanoniczną pochodną używaną przez szerokość/geometrię,
- `riverChannelSegmentsNear()` buduje runtime segmenty z tych samych chainów, które renderują i carve'ują rzekę.

Problem: `RiverChannelSegment` przechowuje obecnie geometrię (`waterH`, `bedH`, widths), ale nie `elevation/accumulation`. Nie próbować rekonstruować accumulation z width/depth/flow — zachować dane źródłowe jawnie albo dodać query operujące bezpośrednio na `RiverChain`/`RiverPoint`.

`ChunkManager.riverShoreDistance()` i `riverShorePoint()` skanują loaded chunks i ponownie wykonują niemal ten sam nearest-segment lookup. Przy tej zmianie warto dodać jeden wspólny lokalny river sample/query zwracający bank point + hydrology context i na nim oprzeć istniejące dwa API, zamiast dokładać trzeci niezależny scan.

Nie używać `terrain/riverQuery.ts` w per-frame interaction path. Ten obiekt jest przeznaczony do analitycznych query dla placement poza streamingiem i może synchronicznie `computeRiverTile()` dla brakującego tile'a. Dla shoreline interaction właściwy jest już załadowany runtime river cache w `ChunkManager`.

## 3. Settlement proximity — użyć plan cache, nie loaded settlements

Nie opierać jakości na `SettlementsManager.getLoaded()` ani tablicy `settlements` przekazywanej do `buildInteractables()` — wynik zmieniałby się wraz ze streamingiem.

Istnieją już potrzebne mechanizmy:

- `settlementGenerator.ts::worldToCell()`;
- `cellsWithinRadius()`;
- `SETTLEMENT_GRID_STEP = 280`;
- `SettlementsManager.peekDef(cell)` → `settlementDefFor()` z jedynego canonical `settlementPlanCache`, bez ładowania meshes.

Dodać mały bounded proximity lookup: wyznaczyć cell punktu poboru, sprawdzić stały mały promień komórek i mierzyć dystans do `SettlementDef.x/z`. `peekDef()` może zwrócić `null` dla komórki bez osady — to normalne.

Nie wchodzić bezpośrednio do prywatnego `defCache` w `settlementPlanCache.ts` i nie tworzyć drugiego cache settlement defs.

## 4. Gdzie składać finalną jakość

`src/world/WaterSource.ts::createWaterSource(kind)` jest dziś statyczne: `well/river = safe`, `lake = unsafe`, `ocean = undrinkable`.

Nie wciskać kontekstowej logiki rzeki do tego istniejącego prostego factory w sposób wymagający importu terrain/settlements. Zachować je dla statycznych źródeł albo rozszerzyć API tak, aby `river` wymagało już rozstrzygniętej jakości.

Praktyczny układ:

- pure `classifyBaseRiverWater(context)`;
- pure `applyRiverWaterModifiers(baseQuality, { nearSettlement })`;
- world-owned resolver/cache, który składa query hydrologii + settlement proximity;
- `interactables.ts` tworzy `waterEdge.source` z finalnym wynikiem.

`Interactable.waterEdge.source` już niesie gotowy `WaterSource` do `gameLoop.ts` i `survivalActions.ts`; nie dodawać tam osobnego `riverContext`.

## 5. Cache i lifecycle

Nie cache'ować dokładnego `(playerX, playerZ)`. Hydrologia ma krok `RIVER_CELL_STEP = 8`, więc stabilny klucz oparty o istniejący river point/cell albo kwantyzację do tej rozdzielczości jest wystarczający.

Cache powinien żyć razem z resolverem bieżącego świata i zniknąć przy `WorldBundle` rebuild / zmianie seedu. Bez `SaveData`.

Jeżeli final quality zawiera wyłącznie deterministyczny hydrology context + `SettlementDef`, można cache'ować finalny wynik. API warto jednak zachować w układzie `cached base + modifiers`, aby późniejsze dynamiczne pollution nie wymagało unieważniania całego hydrology cache.

## 6. Ważna pułapka wydajnościowa

`buildInteractables()` działa co klatkę i już tworzy synthetic `waterEdge` per frame. Klasyfikator nie może więc wykonywać kosztownej hydrologii ani szerokiego settlement generation przy każdym frame.

Po pierwszym query tego fragmentu rzeki kolejne wywołania powinny być praktycznie map lookup. Settlement search musi mieć stały, mały maksymalny zestaw cells.

Jeżeli `peekDef()` dla sąsiednich cells okaże się zauważalnie kosztowne przy cold miss, wykonywać je tylko przy cache miss river-quality, nie osobno dla każdego frame.

## 7. Progi

Nie wiązać progu elevation z nazwą biome/mountain. Użyć jawnych constants w module klasyfikatora i testować je jako heurystykę jakości wody.

Do tuningu accumulation preferować wartości odnoszące się do istniejących `DEFAULT_RIVER_THRESHOLDS` / `flowFactor()`, zamiast niezależnej skali, która szybko rozjedzie się z worldgenem.

Warto przetestować progi na kilku rzeczywistych seedach przed ich utrwaleniem; `stream=15`, `river=50`, `majorRiver=200` są dziś kanonicznymi progami river classification.

## 8. Testy warte dodania

Najbardziej wartościowe są małe testy pure functions oraz jednego integration seamu:

- hydrology classifier: high + low accumulation → safe candidate; pozostałe kombinacje → unsafe;
- settlement modifier nigdy nie podnosi jakości, tylko `safe → unsafe`;
- bounded settlement lookup działa również dla osady nie-streamed-in przez `peekDef()`;
- river query zwraca kontekst z tego samego najbliższego segmentu/banku co shoreline resolver;
- cache nie zmienia wyniku i nie rośnie per exact player coordinate;
- istniejące `well/lake/ocean` klasyfikacje pozostają bez zmian.

Nie rozszerzać testów o choroby ani jakość wody w bukłaku — obecny container model nadal nie przechowuje source quality.

## 9. Sugerowana kolejność

1. Dodać/reuse jeden river-local sample zwracający bank + `elevation/accumulation` z istniejących loaded `riverChains`.
2. Dodać pure base classifier i settlement modifier.
3. Dodać bounded settlement-proximity hook oparty o `worldToCell()` + `cellsWithinRadius()` + `SettlementsManager.peekDef()`.
4. Złożyć world-scoped lazy resolver/cache.
5. Podpiąć tylko river branch przy tworzeniu `waterEdge.source`; lake/ocean/well zostawić na istniejących zasadach.
6. Dodać małe testy i browser verification przez Usera.

**Kluczowa zasada:** jakość rzeki ma być cechą konkretnego world location wynikającą z canonical hydrology + deterministic settlement plan, a nie cechą aktualnie załadowanej geometrii osady ani logiką player action.