# Plan: World Location Catalog performance optimization

**Created:** 2026-09-04
**Status:** `verification needed` 🔍
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** ~~world-012~~
**Domain:** `world`
**Subdomains:** `places` `simulation`
**Tags:** `locations` `performance` `map`
**Roadmap:** -

## Problem

Zakup mapy obszaru u handlarza może obecnie zamrozić grę na około **3–5 sekund**, mimo że finalnie ujawnianych jest tylko około 10–15 lokacji.

Problem nie leży w `LocationKnowledge.reveal()` ani w liczbie zapisywanych lokacji. Koszt powstaje wcześniej:

```text
merchant transaction
→ applyLocationMap()
→ landmarksInBand()
→ WorldLocationCatalog.landmarksWithin()
→ scanLakesAndPeaks()
→ synchroniczny skan proceduralnego terenu
→ weightedTopN()
→ LocationKnowledge.reveal()
```

Dla Far Map zakres 200 km oznacza około 28 000 coarse terrain cells przy obecnym `LOCATION_SCAN_STEP = 48`. Każda komórka przechodzi przez pełne `projectCellAt()`, które wykonuje więcej proceduralnych sampli niż potrzeba do wykrycia jeziora lub szczytu.

Dodatkowo:

- mountain cell ponownie wywołuje `sampleHeightAt()`, mimo że `projectCellAt()` już policzył wysokość,
- obecny cache jest oparty na całym zapytaniu `(x, z, maxKm)` i słabo współdzieli pracę między Near Map, strażnikiem i Far Map,
- Far Map generuje `0–200 km`, a dopiero potem odrzuca `0–60 km`,
- skan obejmuje kwadrat otaczający promień, więc część proceduralnych sampli jest wykonywana poza faktycznym zakresem,
- flood-fill jezior tworzy wiele krótkotrwałych tablic.

Celem jest usunięcie freeze przez zmniejszenie ilości pracy. Web Worker jest fallbackiem dopiero wtedy, gdy zoptymalizowany algorytm nadal powoduje odczuwalny long task.

## Goal

Przebudować kosztowną część `WorldLocationCatalog`, aby:

1. terrain scan wykonywał tylko proceduralne sample potrzebne do klasyfikacji `lake` / `mountainPeak`,
2. oddzielić kosztowną klasyfikację coarse terrain od ekstrakcji lokacji,
3. raz policzone dane coarse terrain mogły być ponownie wykorzystane przez kolejne zapytania,
4. zakres zapytania ograniczał kosztowne sampling możliwie wcześnie,
5. wynik pozostał deterministyczny i zgodny z obecną semantyką World Locations,
6. zakup Near/Far Map oraz rozmowa ze strażnikiem nie powodowały zauważalnego zatrzymania render loop,
7. nie dodawać Web Workera, jeśli po optymalizacji cold scan jest wystarczająco szybki.

## Architecture

Nie tworzyć nowego systemu lokacji. Zachować istniejący przepływ:

```text
WorldLocationCatalog
       ↓
locationDiscovery
       ↓
LocationKnowledge
       ↓
world map / minimap
```

Koncepcyjnie rozdzielić dwa etapy wewnątrz katalogu:

```text
coarse terrain sampling/cache
→ deterministic classification data
        ↓
location extraction
├─ lakes
└─ peaks
```

Cache jest wyłącznie optymalizacją deterministycznej wiedzy o proceduralnym świecie. Nie jest nowym źródłem prawdy i nie przechowuje wiedzy gracza.

NPC oraz mapy kupowane u handlarza nadal korzystają ze wspólnego `WorldLocationCatalog`.

Nie tworzyć merchant-specific, NPC-specific ani map-specific resolvera.

## 1. Baseline performance instrumentation

Przed zmianą algorytmu zebrać baseline dla cold i warm query.

Zmierz co najmniej:

- `landmarksWithin()` total time,
- `scanLakesAndPeaks()` total time,
- liczbę grid cells rozważonych,
- liczbę grid cells faktycznie proceduralnie sampled,
- cache hits / misses,
- liczbę water cells,
- liczbę mountain cells,
- czas terrain classification,
- czas lake flood-fill,
- czas peak detection,
- liczbę wywołań `sampleFloorAt`, `sampleHeightAt`, `sampleContinentalnessAt` i `sampleMountainRidgeAt`.

Pomiary mają być dostępne przez istniejący debug/perf mechanism lub mały diagnostyczny seam, bez spamowania normalnej konsoli produkcyjnej.

Scenariusze bazowe:

```text
Near Map     0–20 km
Guard        0–60 km
Far Map      60–200 km
```

Szczególnie zanotować pierwszy cold Far Map query, który obecnie powoduje obserwowany freeze.

## 2. Dedicated lightweight location terrain classification

`scanLakesAndPeaks()` nie powinien używać pełnego `projectCellAt()`.

`projectCellAt()` jest projekcją potrzebną mapie i liczy również informacje takie jak biome, moisture region, biome weights i forest density, które nie są potrzebne do znalezienia jeziora ani szczytu.

Wprowadzić minimalną ścieżkę klasyfikacji używaną przez World Locations. Dla coarse cell potrzebne są tylko informacje wymagane do odpowiedzi:

```text
inland water?
mountain?
mountain height?
```

Preferowany flow:

```text
sample floor
│
├─ water
│    └─ continentalness
│         → ocean / inland water
│
└─ land
     └─ mountain ridge
          ├─ ordinary land
          └─ mountain
               └─ sample height
```

Nie liczyć podczas location scan danych takich jak moisture region, biome weights czy forest density.

Nie kopiować matematyki proceduralnego terenu w sposób, który może rozjechać się z głównym generatorem. Reużyć istniejące niskopoziomowe samplery i współdzieloną logikę klasyfikacji. Jeżeli ocean/inland-water wymaga wyciągnięcia małego pure helpera, współdzielić go zamiast duplikować warunki.

## 3. Remove duplicate and unnecessary sampling

Po wprowadzeniu dedykowanego samplera:

- wysokość liczyć tylko dla mountain cells,
- wysokość liczyć dokładnie raz,
- ordinary land i water nie powinny płacić kosztu `sampleHeightAt()` wyłącznie na potrzeby location scan.

Porównać liczbę wywołań niskopoziomowych samplerów przed i po zmianie.

## 4. Reusable coarse terrain cache

Zastąpić lub uzupełnić obecny cache całego query:

```text
(x, z, maxKm) → WorldLocation[]
```

mechanizmem pozwalającym współdzielić koszt proceduralnego terrain sampling pomiędzy zapytaniami.

Nie narzucać z góry `Map<string, object>` per pojedyncza komórka. Wybrać najprostszą reprezentację o rozsądnym koszcie pamięci i GC, np.:

- coarse cells,
- stabilne grid tiles/regions z typed arrays,
- inny mały data-oriented cache zgodny z istniejącym gridem.

Preferować stabilne tile/grid identity zamiast origin-dependent query identity.

Oczekiwany efekt:

```text
Guard 60 km
→ sample region A

Far Map 200 km
→ reuse A
→ sample tylko brakujące dane
```

Cache powinien przechowywać klasyfikację terenu potrzebną do ekstrakcji lokacji, nie `LocationKnowledge`.

## 5. Separate terrain sampling from location extraction

Terrain classification i lake/peak extraction powinny być koncepcyjnie oddzielone.

```text
terrain cache
→ coarse classification
        ↓
requested range
→ lake components / peak candidates
→ WorldLocation[]
```

Ponowne przejście po tanich cached classification cells jest akceptowalne, jeśli pozwala zachować prosty i poprawny algorytm.

Nie optymalizować za wszelką cenę każdej iteracji. Najważniejsze jest, aby kolejne query nie wykonywały ponownie kosztownych proceduralnych sampli.

## 6. Cache lifecycle

Cache coarse terrain musi być poprawnie invalidowany przy zmianie świata lub parametrów wpływających na terrain sampling.

Istniejące `WorldLocationCatalog.invalidateScanCache()` pozostaje lifecycle seam albo zostaje zachowane kompatybilne API o tej samej odpowiedzialności.

Po invalidacji nie mogą pozostać dane pochodzące ze starego world seed lub terrain/water configuration.

Nie zmieniać zasad rebuild `WorldBundle`.

## 7. Limit expensive sampling to the requested range

Nie wykonywać kosztownego proceduralnego samplingu dla cells, które z góry wiadomo, że nie mogą uczestniczyć w query.

Obsłużyć zakres jako `minKm/maxKm`, aby Far Map nie wymagała bezwarunkowo pełnego nowego proceduralnego skanu `0–200 km` tylko dlatego, że publiczne API przyjmuje obecnie wyłącznie `maxKm`.

Dopuszczalne jest przejście po już cached inner cells, jeżeli jest to tanie i upraszcza poprawną detekcję.

Zachować jawny boundary margin tam, gdzie jest potrzebny do:

- oceny local maxima,
- poprawnego flood-fill jeziora przecinającego granicę query.

Optymalizować kosztowny sampling, nie kosztem poprawności boundary detection.

## 8. Introduce band-aware catalog query

Obecne `landmarksWithin(maxKm) → filter(minKm)` powoduje niepotrzebne generowanie szerszego zakresu przed filtrowaniem.

Rozszerzyć katalog o efektywne range-aware query, np.:

```text
landmarksInRange(x, z, minKm, maxKm)
```

lub równoważny mechanizm.

Nie dublować implementacji. `landmarksWithin()` powinno pozostać wygodnym przypadkiem `minKm = 0`.

Caves i cemeteries również powinny stosować min/max filtering możliwie wcześnie, jeżeli można to zrobić bez zmiany ich identity lub generatora.

## 9. Keep lake and peak detection deterministic

Optymalizacja nie może zmienić stabilności `WorldLocation.id`, `WorldLocation.name` ani `discoveryWeight` dla tych samych rzeczywistych lokacji.

`LOCATION_SCAN_STEP` pozostaje źródłem stabilnego coarse-grid identity. Nie zmieniać jego wartości wyłącznie jako shortcut wydajnościowy.

Jeżeli range-aware query wpływa na flood-fill lub peak detection przy granicy zakresu, zapewnić wymagane neighbor/boundary data.

Rezultat nie powinien zależeć od kolejności zapytań:

```text
Guard → Near → Far
```

vs.

```text
Far → Guard → Near
```

Cache może wpływać na szybkość, ale nie na wynik.

## 10. Reduce flood-fill allocations

Obecny flood-fill używa wielu krótkotrwałych par współrzędnych. Jeżeli po usunięciu głównego sampling hotspotu nadal jest to mierzalny koszt, zastąpić hot-path prostszą reprezentacją, np. flat numeric indexes, typed arrays lub reusable stack.

Priorytet: niski GC pressure, prosty kod, deterministyczny wynik.

Nie tworzyć skomplikowanej abstrakcji wyłącznie dla tej mikrooptymalizacji.

## 11. Peak candidate merge

Sprawdzić koszt obecnego near-duplicate peak merge (`sorted candidates → kept.some(distance...)`).

Jeżeli pomiar pokaże, że jest istotnym hotspotem, zastąpić go bounded spatial/grid lookup. Nie optymalizować spekulacyjnie, jeśli po poprawie terrain sampling koszt jest pomijalny.

## 12. Cemetery search

`cemeteryCandidates()` może wykonywać realną pracę chunk-generation przez `ChunkManager.findLandmarkNear()` i jest obecnie ograniczone do maksymalnie 12 settlementów.

Zmierzyć ten etap osobno.

Jeżeli stanowi istotny udział cold query, reuse/cache wyników cemetery lookup względem stabilnego settlement/chunk identity, tak aby Guard/Near/Far nie powtarzały tej samej pracy.

Nie przenosić cemetery placement do nowego systemu. Fizyczny cemetery i jego `WorldLocation` nadal muszą korzystać z istniejącego generatora.

## 13. Merchant and NPC flow

Po optymalizacji nie zmieniać semantyki gameplayowej.

Merchant nadal wykonuje:

```text
purchase map
→ resolve matching locations
→ LocationKnowledge.reveal(...)
→ feedback
```

Guard nadal wykonuje:

```text
ask about area
→ resolve pool
→ weighted selection
→ reveal locations
```

Oba korzystają ze wspólnego katalogu.

Nie dodawać w tym planie osobnego lifecycle `knowledge pending/resolving/ready`. Jeśli synchroniczny resolver po optymalizacji jest wystarczająco szybki, taki mechanizm jest zbędny.

## 14. Performance targets

Główne wymagania:

- brak wielosekundowego freeze,
- warm query bez zauważalnego hitch,
- cold Far query bez long task odczuwalnego jako freeze,
- istotna redukcja liczby proceduralnych sampli,
- kolejne overlapping queries reuse'ują wcześniejszą klasyfikację terenu.

Orientacyjny target dla development machine:

```text
cold Far: < 100 ms
preferred: < 50 ms
warm overlapping query: single-digit ms lub koszt praktycznie pomijalny
```

Progi są targetem diagnostycznym, nie kryterium poprawności świata. Decyzję o dalszym offloadzie podejmować na podstawie browser performance trace / realnego long task, nie wyłącznie pojedynczego `performance.now()`.

## 15. Web Worker decision gate

**Nie implementować Web Workera w podstawowym zakresie tego planu.**

Po wykonaniu optymalizacji ponownie zebrać pomiary.

Worker jest uzasadniony tylko wtedy, gdy zoptymalizowany cold Far query nadal powoduje wyraźny frame hitch / long task, którego nie da się rozsądnie usunąć kolejną prostą optymalizacją.

W takim przypadku udokumentować pozostały hotspot i przygotować osobny follow-up plan. Nie używać Workera jako zamiennika dla kosztownego algorytmu, który można usunąć.

## 16. Tests

Dodać lub rozszerzyć testy `WorldLocationCatalog`.

Sprawdzić:

1. ten sam seed/config daje te same lake/peak IDs,
2. kolejność Near/Guard/Far queries nie wpływa na wynik,
3. warm query zwraca identyczny rezultat jak cold query,
4. invalidacja cache wymusza ponowne sampling,
5. Far band nie zwraca lokacji z wewnętrznego zakresu,
6. `landmarksWithin()` zachowuje dotychczasową semantykę,
7. lake detection działa dla komponentu przecinającego boundary query,
8. peak przy granicy query jest oceniany z wymaganym neighborhood,
9. cave/cemetery results nie zmieniają identity,
10. `weightedTopN()` i `LocationKnowledge` nie zmieniają zachowania.

Nie pisać testów wall-clock jako głównego kryterium poprawności. Performance mierzyć oddzielnym benchmarkiem/debug diagnostic.

## 17. Relevant files

Główne:

```text
src/world/locations/worldLocationCatalog.ts
src/world/locations/locationDiscovery.ts
src/world/locations/locationConfig.ts
src/world/map/mapProjection.ts
src/terrain/chunkHeightmap.ts
src/app/inventoryWiring.ts
```

Podczas implementacji potwierdzić dokładne ownership helpers dla water classification i cemetery lookup zamiast zakładać ich lokalizację z planu.

`inventoryWiring.ts` powinien wymagać najwyżej niewielkiej zmiany wywołania range-aware API. Nie przenosić logiki optymalizacji do UI/merchant wiring.

## 18. JSDoc / discoverability

Dla ważnych nowych lub zmienionych publicznych funkcji katalogu dodać JSDoc opisujący:

- ownership cache,
- deterministyczność,
- różnicę między expensive terrain sampling i derived location extraction,
- lifecycle invalidacji,
- znaczenie `minKm/maxKm`.

Dodać `@domain world` tam, gdzie poprawi to przyszły AI preflight.

## 19. Non-goals

Poza zakresem:

- Web Worker,
- async knowledge lifecycle,
- progress bar mapy,
- zmiana zasad Near/Far Map,
- zmiana `MERCHANT_MAP_LANDMARK_POOL_SIZE`,
- zmiana `LOCATION_SCAN_STEP` jako shortcut wydajnościowy,
- nowy system hydrologii,
- dokładniejsza globalna reprezentacja jezior,
- nowy mountain generator,
- przebudowa World Map,
- refactor całego `mapProjection`,
- persistence coarse terrain cache.

## 20. Verification

### Automated

Uruchomić odpowiednie typecheck, location/map discovery tests, merchant/inventory tests oraz standardowy zestaw wymagany przez repo.

### Performance diagnostic

Na tym samym world seed zmierzyć przed/po:

```text
cold Near
cold Guard
cold Far
warm Near
warm Guard
warm Far
```

Porównać:

- total time,
- sampled cells,
- cache hits/misses,
- liczbę wywołań poszczególnych proceduralnych samplerów,
- browser long task / frame hitch.

Zapisać wyniki w implementation notes lub krótkim performance summary.

### Manual browser verification

Gracz sprawdza:

1. zakup Near Map nie powoduje widocznego freeze,
2. zakup Far Map nie powoduje wielosekundowego freeze,
3. feedback po zakupie nadal pokazuje prawidłową liczbę nowych miejsc,
4. mapa pokazuje prawidłowe odkryte locations,
5. rozmowa ze strażnikiem nie powoduje zauważalnego freeze,
6. kolejne podobne query korzystają z warm cache,
7. New Game / world rebuild nie korzysta ze starego cache,
8. wyniki lokacji pozostają deterministyczne.

## 21. Success criteria

Plan jest zakończony, gdy:

- usunięto pełne `projectCellAt()` z hot path location scan,
- nie ma podwójnego ani zbędnego `sampleHeightAt()` dla location classification,
- terrain sampling i location extraction są wyraźnie rozdzielone,
- coarse terrain sampling jest współdzielony pomiędzy overlapping queries,
- range-aware query ogranicza nowy expensive sampling,
- cache ma poprawny lifecycle i rozsądny koszt pamięci/GC,
- wyniki pozostają deterministyczne i niezależne od kolejności query,
- zakup mapy nie powoduje obserwowanego 3–5 sekundowego freeze,
- pomiary before/after dokumentują redukcję kosztu i proceduralnych sampli,
- nie dodano Web Workera; ewentualny Worker wymaga osobnego planu popartego pomiarem pozostałego hotspotu.

## Implementation status

Implemented in full inside the existing `WorldLocationCatalog` (`src/world/locations/worldLocationCatalog.ts`), no new system/Worker added.

- Shared pure terrain-classification rules extracted to `src/terrain/terrainClassification.ts` (`isWetFloor`/`isOceanMix`/`isMountainRidge`), reused by both `mapProjection.projectCellAt()` and the new lightweight coarse-cell classifier — the two can no longer silently drift apart.
- Lightweight classifier samples only `sampleFloorAt → (wet: sampleContinentalnessAt) / (land: sampleMountainRidgeAt → mountain: sampleHeightAt once)` — no `projectCellAt()`, no moisture/biome-weights/forest-density, no duplicate height sample.
- Old per-query `scanCache` (keyed by `(x, z, maxKm)`) replaced with a lazily-materialized coarse tile cache (`LOCATION_TILE_CELLS`² `Uint8Array`/`Float32Array` tiles keyed by stable `(tileX, tileZ)`), shared across every Near/Guard/Far query. A cell is sampled at most once for the cache's lifetime.
- New `landmarksInRange(x, z, minKm, maxKm)` on the catalog; `landmarksWithin` is its `minKm = 0` wrapper. `locationDiscovery.landmarksInBand()` now delegates straight to it instead of generating `0..maxKm` and filtering afterwards. Caves/cemeteries apply `(minKm, maxKm]` directly (cemetery's settlement search itself is still bounded only by `maxKm + margin`, unchanged, per notes §5).
- Coarse terrain sampling is bounded to the circular annulus `[minKm − halo, maxKm + halo]` (never the enclosing square, never a full re-scan), with `PEAK_SCAN_HALO_CELLS` boundary margin so a peak/lake right at a query boundary is still evaluated with its true neighborhood/full connected component. Lake flood-fill expands past the query's own candidate window on demand (via the shared tile cache) until each component actually closes, so a lake's id/centroid no longer depends on which query/range found it first (this also fixes a latent boundary bug in the old code, which treated any neighbor outside its scan rectangle as "not water"/"not mountain").
- Cemetery lookup results are cached per settlement id (`cemeteryForSettlement`, notes §12) — `ChunkManager.findLandmarkNear()` is only paid once per settlement across Near/Guard/Far.
- Opt-in, zero-cost-when-unread diagnostics counters (`WorldLocationCatalog.getScanDiagnostics()`): sampled/cache-hit cells, per-sampler call counts, water/mountain cell counts, and per-phase timings. Reset by `invalidateScanCache()`.
- New tests in `worldLocationCatalog.test.ts`: classifier/`projectCellAt()` parity on a grid, cold==warm, Near→Guard→Far order independence, `invalidateScanCache()` forces resampling, overlapping-query reuse (via diagnostics), `landmarksWithin(max) == landmarksInRange(0, max)`, Far band never returns inner-range locations, and a split-bands-union-equals-one-wide-query check (exercises lake/peak boundary correctness against the real procedural noise for a fixed seed).

### Measured (Node, `tsx`, seed 42, empty caves/cemeteries — isolates the terrain-scan portion only; see caveat below)

| Query | Before (equivalent full `projectCellAt()` square scan) | After — cold | After — warm (repeat) |
| --- | --- | --- | --- |
| Near 0–20 km | – | ~12 ms | – |
| Guard 0–60 km | – | ~16 ms (cold) / ~10 ms (repeat) | – |
| Far 60–200 km (after warm Guard) | – | +69 ms incremental | ~7 ms |
| Far 0–200 km, single cold catalog | **176 ms** classification-only (28 224 cells via `projectCellAt()`, 1 678 duplicate `sampleHeightAt()` calls) | **~81 ms** total (`landmarksWithin`), 23 796 sampled cells | ~7 ms (0 new samples) |

Cold Far lands under the plan's 100 ms diagnostic target (not quite the "preferred" 50 ms); warm/overlapping queries are single-digit ms as targeted. This benchmark isolates coarse terrain sampling — it does not include real settlement/cemetery chunk-generation cost, browser JIT warm-up, or main-thread contention with the rest of the running game, all of which contributed to the originally reported 3–5 s freeze. **Browser Performance-trace / manual verification (buying Near/Far Map, guard conversation) is still open** — this is why the plan is marked `verification needed` rather than `done`.

No Web Worker added (§15 gate not reached — no remaining long task identified without a browser trace).

> **Zrób git commit i push do main, rebase jeżeli trzeba**
