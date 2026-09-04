# Implementation Notes: World Location Catalog performance optimization

**Reviewed:** 2026-09-04  
**Plan:** `world-013-world-location-catalog-performance-optimization.md`

## Review conclusion

Plan trafnie wskazuje główny hotspot. Aktualny `src/world/locations/worldLocationCatalog.ts` rzeczywiście skanuje cały prostokąt coarse-grid przez pełne `projectCellAt()`, a następnie dla mountain cell ponownie wywołuje `sampleHeightAt()`. Obecny `scanCache` przechowuje końcowe `WorldLocation[]` pod kluczem `(rounded x, rounded z, rounded maxKm)`, więc prawie nie współdzieli kosztu między Near/Guard/Far.

Optymalizację zrobić wewnątrz istniejącego `WorldLocationCatalog`. Nie zmieniać `LocationKnowledge`, mapy ani gameplay flow i nie dodawać Workera w tym planie.

## 1. Ownership i lifecycle

Istotne pliki:

- `src/world/locations/worldLocationCatalog.ts` — właściciel skanu, cache i ekstrakcji lakes/peaks,
- `src/world/locations/locationDiscovery.ts` — obecne `landmarksInBand()` robi `landmarksWithin(maxKm) -> filter(minKm)`,
- `src/world/map/mapProjection.ts` — obecne reguły klasyfikacji terrain,
- `src/terrain/chunkHeightmap.ts` — niskopoziomowe samplery,
- `src/terrain/waterBodies.ts` — `oceanMixAt()`,
- `src/world/locations/locationConfig.ts` — `LOCATION_SCAN_STEP` i range constants,
- `src/world/locations/worldLocationCatalog.test.ts` — istniejące test doubles i testy katalogu,
- `src/app/createApp.ts` — lifecycle katalogu i invalidacja po rebuildzie.

`WorldLocationCatalog` jest tworzony raz w `createApp.ts`; zależności (`seed`, `Caves`, `ChunkManager`, sample params) są celowo thunkami odczytywanymi na bieżąco. Po `rebuildWorldBundle()` `createApp.ts` wywołuje już `worldLocationCatalog.invalidateScanCache()`. Zachować ten kontrakt i czyścić przez ten seam wszystkie nowe cache katalogu. Nie przenosić cache do `WorldBundle` i nie odtwarzać katalogu przy rebuildzie.

## 2. Lightweight classifier — współdzielić dokładne reguły

`projectCellAt()` obecnie liczy zawsze:

`floor + height + continentalness`, a dla land dodatkowo ridge, moisture, biome weights i forest density.

Location scan potrzebuje tylko:

```text
sampleFloorAt
├─ wet -> sampleContinentalnessAt -> ocean / inland water
└─ land -> sampleMountainRidgeAt
            └─ mountain -> sampleHeightAt
```

Nie kopiować przy tym warunków z `mapProjection.ts`. Obecnie ważne stałe/reguły są lokalne dla tego pliku:

- wet: `floorH < waterLevel - 1e-4`,
- ocean/inland: `oceanMixAt(...) > OCEAN_MIX_GATE`,
- mountain: `ridge > MOUNTAIN_RIDGE_THRESHOLD`.

Wydzielić małe pure helpers/stałe do warstwy terrain i użyć ich zarówno w `projectCellAt()`, jak i w location classifier. Po zmianie `worldLocationCatalog.ts` nie powinien importować `projectCellAt()` tylko po to, aby sklasyfikować coarse cell.

Wysokość mountain cell liczyć dokładnie raz i zachować ją w cache.

## 3. Coarse cache — stabilny grid, bez obiektu per cell

Najprostszy sensowny model to tiled cache oparty o globalne `(gx, gz)` z `LOCATION_SCAN_STEP`, np. tile 16x16 lub 32x32 coarse cells.

Preferowana reprezentacja tile:

- `Uint8Array` ze stanem `unknown | none | inlandWater | mountain`,
- `Float32Array` z wysokością wykorzystywaną tylko dla mountain,
- cells materializowane lazy, więc Near query nie musi samplować całego tile.

Dzięki temu nie powstaje `Map<string, object>` dla dziesiątek tysięcy komórek, a overlapping queries współdzielą dokładnie te same sample.

Po wprowadzeniu tego cache usunąć obecny query-result `scanCache` przynajmniej w pierwszej iteracji. Ponowne przejście po cached bytes będzie tanie, a pozostawienie starego cache utrudnia pomiary i maskuje błędy range/boundary. Jeśli później profiling pokaże istotny koszt samej ekstrakcji, result cache można dodać osobno.

## 4. Range query i granice — tu jest najważniejsza pułapka

Dodać jeden range-aware API katalogu, np. `landmarksInRange(x, z, minKm, maxKm)`, a `landmarksWithin()` pozostawić jako wrapper z `minKm = 0`. `locationDiscovery.landmarksInBand()` powinno delegować do tego API zamiast generować `0..max` i filtrować później.

Kosztowne terrain sampling ograniczać do faktycznego pierścienia/promienia plus potrzebny halo, nie do całego otaczającego kwadratu.

### Peaks

Peak detection potrzebuje danych spoza samej granicy query:

- 1 coarse cell dla 8-neighborhood local maximum,
- obecny merge ma radius `2` cells, więc kandydaci tuż poza bandem również mogą wpłynąć na wynik.

Nie wolno po prostu pominąć wszystkich cells `< minKm`, bo zmieni to wynik Far Map przy granicy 60 km.

### Lakes

Obecny kod ma już problem deterministyczny: flood-fill kończy się na granicy prostokąta skanu, a `lake:<gx>,<gz>` powstaje z centroidu **przyciętego komponentu**. To oznacza, że jezioro przecinające granicę query może otrzymać innego reprezentanta/ID dla innego origin/range.

Samo dodanie 1-cell margin tego nie naprawi. Dla water component dotykającego granicy sampled region należy rozszerzać klasyfikację/flood-fill tylko w kierunku tego komponentu, aż zostanie domknięty. Dzięki coarse cache płaci się tylko za nowo potrzebne cells. To jest wymagane, aby wynik nie zależał od kolejności Near/Guard/Far.

Nie zmieniać reprezentanta dla komponentów, które już dziś są w całości wewnątrz zakresu. `getById()` dla starych `lake:<gx>,<gz>` jest bezpośredni i nie wymaga obecności w cache, więc nie dodawać walidacji, która unieważni zapisane wcześniej ID.

## 5. Caves i cemeteries

`caveCandidates()` może bezpiecznie filtrować `minKm/maxKm` od razu — każda cave pochodzi z gotowego `Caves.definitions()`.

Przy cemetery zachować obecną semantykę. Aktualnie katalog:

1. znajduje settlementy do `maxKm + margin`,
2. sortuje nearest-first,
3. bierze maksymalnie `MAX_CEMETERY_SETTLEMENTS_SEARCHED = 12`,
4. dopiero dla nich wykonuje `ChunkManager.findLandmarkNear()`.

Nie przesuwać `minKm` przed `.slice(0, 12)`, bo Far Map zaczęłaby przeszukiwać inne settlementy niż obecne `landmarksWithin(200) -> filter(60)` i zmieniłaby gameplay wynik.

Jeżeli pomiar pokaże istotny koszt cemetery lookup, cache'ować wynik **łącznie z brakiem wyniku** per stabilne `SettlementDef.id` dla bieżącego świata. Cache czyścić przez `invalidateScanCache()`. Nie kopiować algorytmu cemetery placement z `ChunkManager`/`chunkEnvironment`.

## 6. Instrumentation

Nie dodawać globalnego logowania do `chunkHeightmap.ts`. Najmniej inwazyjny jest opt-in diagnostics seam w katalogu/classifierze, który zbiera:

- sampled/coarse-cache-hit cells,
- rzeczywiste branch counts `sampleFloorAt` / `sampleContinentalnessAt` / `sampleMountainRidgeAt` / `sampleHeightAt`,
- czasy classification, lake extraction, peak extraction i cemetery lookup,
- liczby water/mountain cells.

Bez włączonej diagnostyki hot path nie powinien tworzyć rekordów ani logować do konsoli. Wall-clock targetów nie umieszczać w Vitest — są do browser trace/manual verification; testy powinny sprawdzać deterministyczne wyniki i liczbę wykonanych sample/reuse.

## 7. Testy, które realnie zabezpieczają refactor

Rozszerzyć `worldLocationCatalog.test.ts` przede wszystkim o:

- parity nowego lightweight classifiera z `projectCellAt()` dla `inland_water` i `mountain` na deterministycznym zestawie punktów,
- cold query == warm query,
- Near -> Guard -> Far daje te same wyniki jak Far -> Guard -> Near,
- overlapping query nie sampluje ponownie już sklasyfikowanych cells,
- `invalidateScanCache()` wymusza ponowny sampling,
- Far range nie wykonuje pełnego nowego skanu `0..200 km`, z wyjątkiem halo / domykania komponentu jeziora,
- lake/peak przy granicy query ma stabilne ID,
- `landmarksWithin(max)` zachowuje wynik odpowiadający `landmarksInRange(0, max)`.

## 8. Zalecana kolejność implementacji

1. Wydzielić wspólne pure terrain-classification rules i dodać parity tests.
2. Wprowadzić lazy coarse tile cache + diagnostics counters; usunąć duplicate `sampleHeightAt()` i `projectCellAt()` z location scan.
3. Oddzielić extraction od sampling i potwierdzić cold/warm reuse.
4. Dodać range-aware catalog API oraz poprawne peak/lake boundary handling.
5. Zmierzyć cemetery/flood-fill/peak-merge; optymalizować je tylko, jeśli nadal są mierzalne.
6. Sprawdzić browser Performance trace dla cold Far. Worker tylko jako osobny follow-up, jeśli po tych zmianach nadal pozostaje realny long task.

Nie zmieniać `LOCATION_SCAN_STEP`, `WorldLocation` shape, `LocationKnowledge`, merchant/guard reveal semantics ani rebuild lifecycle w ramach tego planu.
