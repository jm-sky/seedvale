# Plan: Natural Mountains & Rivers

**Created:** 2026-08-21
**Status:** `in progress` 🔄 — Etap 1–3 implemented (see "Implementation summary"); Etap 4–7 (river network, cross-chunk continuity, channel geometry, water-shader integration) not started, gated on evaluating the drainage prototype
**Priority:** high · **Effort:** M
**Depends on:** unknown

## Cel

Rozwinąć istniejący terrain generation w kierunku naturalnej geografii świata:

* duże, ciągłe masywy górskie,
* naturalne doliny, zbocza i przełęcze,
* deterministyczna sieć odpływu,
* strumienie i rzeki wynikające z ukształtowania terenu,
* ciągłość geografii niezależnie od granic chunków.

Nie tworzyć równoległego systemu geografii. Wykorzystać istniejącą deterministyczną funkcję `sampleFloorAt(worldX, worldZ, params)` oraz istniejący chunk/worker pipeline.

## 1. Naturalne góry

Rozwinąć istniejący system:

```text
continent
    ↓
mountain ridge
    ↓
hills
    ↓
local detail
    ↓
floorHeight
```

Nie tworzyć osobnego `MountainSystem`.

Cele:

* duże, ciągłe pasma zamiast pojedynczych pików,
* większe masywy górskie,
* naturalne doliny między masywami,
* zróżnicowane wysokości i nachylenia,
* naturalne przełęcze i obniżenia,
* ograniczenie ostrych pików i nienaturalnych dołów,
* zachowanie deterministyczności i ciągłości między chunkami.

Zmiany powinny rozszerzać istniejące pola `mountain`, `mountainRidge`, `continent` i `hills`, zamiast tworzyć niezależny generator.

## 2. Hydrologia

Rzeki powinny być wynikiem analizy istniejącego terenu, a nie niezależnie rozmieszczonymi obiektami.

Podstawowy model:

```text
sampleFloorAt(x, z)
        ↓
local terrain neighbourhood
        ↓
slope / drainage
        ↓
flow direction
        ↓
flow accumulation
        ↓
streams
        ↓
rivers
        ↓
lake / sea
```

Na początek przygotować prototyp oparty o **D8**:

* dla punktu określić najniższego z 8 sąsiadów,
* wyznaczyć kierunek spływu,
* obliczyć flow accumulation,
* klasyfikować cieki według wielkości przepływu.

D8 nie jest na tym etapie zamrażany jako docelowy algorytm. Po prototypie należy ocenić jakość przebiegu rzek i ewentualnie rozważyć dokładniejszy model.

Nie implementować pełnej symulacji fizyki płynów.

## 3. Prototyp hydrologii

Przed implementacją renderowanych rzek przygotować możliwość diagnostycznego sprawdzenia:

* wysokości,
* kierunku spływu,
* flow accumulation,
* potencjalnych źródeł,
* przebiegu strumieni i rzek.

Prototyp powinien pozwolić ocenić sieć hydrologiczną na kilku seedach bez konieczności tworzenia finalnej geometrii Three.js.

Dopiero po uzyskaniu sensownej sieci przejść do generowania geometrii.

## 4. Sieć rzeczna

Docelowy model:

```text
source
  ↓
stream
  ↓
stream
  ↓
river
  ↓
lake / sea
```

Uwzględnić:

* źródła na odpowiednio wysokich terenach,
* łączenie mniejszych cieków,
* zwiększanie szerokości wraz z przepływem,
* ujścia do jezior/morza,
* wodospady przy odpowiednio dużym spadku,
* naturalne zakręty i meandrowanie.

Meandry powinny być nakładane po wyznaczeniu poprawnego przebiegu hydrologicznego, a nie zastępować analizę spadku.

## 5. Chunking i ciągłość

Nie tworzyć globalnego heightfieldu całego świata.

Wykorzystać fakt, że:

```text
sampleFloorAt(worldX, worldZ)
```

działa dla dowolnego punktu świata bez załadowanego chunka.

Hydrologia musi być deterministyczna i niezależna od:

* kolejności generowania chunków,
* aktualnie załadowanych chunków,
* stanu `ChunkManager`,
* istnienia mesha terenu.

Szczególnie dopilnować:

* ciągłości rzek na granicach chunków,
* możliwości kontynuowania cieku w sąsiednim chunku,
* spójnego kierunku przepływu,
* deterministycznego wyznaczania źródeł i ujść.

Chunk powinien być lokalnym odbiorcą wyniku geografii:

```text
world geography
      ↓
hydrology
      ↓
chunk query
      ↓
river geometry
```

Nie rozszerzać `waterBodies` do globalnego systemu hydrologii. Obecne `detectWaterBodies()` pozostaje lokalnym mechanizmem detekcji zbiorników.

## 6. Koryto i rendering

Dopiero po poprawnym wyznaczeniu sieci hydrologicznej:

* generować lekką proceduralną geometrię rzek,
* dostosowywać szerokość do przepływu,
* zapewnić zgodność koryta z terenem,
* małe strumienie utrzymywać bardzo tanie,
* większe rzeki mogą otrzymywać bardziej szczegółową geometrię,
* wykorzystać istniejący water shader i UV/parametry do wizualizacji przepływu.

Początkowo **nie modyfikować `sampleFloorAt()` przez rzeki**. Rzeka powinna być wynikiem istniejącej geografii.

Ewentualna deformacja terenu pod koryto może zostać rozważona później jako osobne rozszerzenie.

## 7. Architektura

Preferowany przepływ:

```text
Terrain
   ↓
Elevation / slope
   ↓
Drainage
   ↓
Streams
   ↓
Rivers
   ↓
Water geometry
```

Wykorzystać istniejące:

* `chunkHeightmap.ts`,
* `sampleFloorAt()`,
* `mountainRidge`,
* `continentalness`,
* `chunkGrid.ts`,
* `ChunkManager`,
* `chunkWorkerPool.ts`,
* worker pipeline,
* istniejący water rendering.

Nie tworzyć drugiego systemu geografii ani persistentnej globalnej mapy wysokości.

## 8. Kolejność implementacji

### Etap 1 — Naturalne góry

Poprawić istniejący mountain terrain:

* struktura dużych masywów,
* ciągłość pasm,
* doliny,
* przełęcze,
* ograniczenie ostrych pików.

### Etap 2 — Drainage prototype

Na bazie `sampleFloorAt()`:

* lokalne sąsiedztwo,
* slope,
* flow direction,
* flow accumulation,
* diagnostyczne źródła i cieki.

### Etap 3 — Ocena algorytmu

Na kilku seedach ocenić:

* naturalność sieci,
* zachowanie w górach i dolinach,
* liczbę cieków,
* sposób łączenia,
* problemy D8.

Jeśli D8 daje wystarczający efekt — pozostać przy nim. W przeciwnym razie poprawić model hydrologiczny przed przejściem dalej.

### Etap 4 — River network

Dodać:

* źródła,
* strumienie,
* łączenie,
* większe rzeki,
* ujścia,
* relację z jeziorami i morzem.

### Etap 5 — Cross-chunk continuity

Zapewnić ciągłość i deterministyczność sieci niezależnie od streamingu.

### Etap 6 — River geometry

Dodać:

* koryta,
* szerokość zależną od przepływu,
* podstawowe meandry,
* wodospady.

### Etap 7 — Rendering polish

Dopracować:

* shader flow,
* UV,
* LOD,
* tani rendering małych strumieni,
* wydajność dużych rzek.

## 9. Wydajność

Uwzględnić od początku:

* brak generowania całego świata,
* lokalne/on-demand obliczenia hydrologii,
* wykorzystanie workerów dla kosztownych analiz, jeśli rzeczywisty koszt to uzasadnia,
* cache tylko tam, gdzie jest potrzebny,
* małą geometrię dla małych cieków,
* zgodność z obecnym chunk streamingiem.

Nie przenosić automatycznie całej hydrologii do workera. Sposób podziału pracy powinien wynikać z rzeczywistego kosztu obliczeń i komunikacji.

## 10. Weryfikacja

Sprawdzić:

* kilka różnych seedów,
* naturalność dużych pasm górskich,
* brak nadmiaru ostrych pików i dołów,
* doliny i przełęcze,
* deterministyczność,
* kierunek spływu,
* flow accumulation,
* ciągłość rzek między chunkami,
* łączenie strumieni,
* ujścia do jezior/morza,
* wodospady,
* zgodność koryta z terenem,
* koszt generowania,
* koszt renderowania,
* browser verification wizualnego efektu.

## Implementation summary (2026-08-21)

Implemented in this session, per the implementation notes' explicit gating ("Do not start E–I until B/C produce a believable drainage network"):

**Etap 1 — natural mountains** (`src/terrain/chunkHeightmap.ts`, `src/config/worldConfig.ts`): tuned the existing combination rather than adding a parallel generator. `RegionParams` defaults changed — `worleyCellSize: 260 → 400` (wider ridge spacing → larger continuous massifs), `ridgeSharpness: 2.0 → 1.4` (broader ridge crest, less knife-edge), `mountainThresholdWidth: 0.14 → 0.2` (softer hills→mountain gate, more natural foothills). `mountainThreshold`, `mountainGain`, `heightScale`, `hillsAmplitude`, `hillsScale` left unchanged to avoid shifting overall mountain coverage/amplitude (lower regression risk for settlement placement/road routing/vegetation/biome thresholds that key off those fields). A new local `MOUNTAIN_DETAIL_DAMPING` constant (not a `RegionParams` field — avoids `applyStoredTerrain`/test-fixture plumbing for an internal shaping knob, same precedent as `DETAIL_WARP_FREQ`/`DETAIL_WARP_AMP`) dampens local-detail amplitude in proportion to `mountainRidge`, addressing "ostre piki/doły" by suppressing fine noise riding on top of the ridge — not by flattening the ridge/mountain contribution itself (explicitly avoided per the notes).

**Etap 2–3 — drainage prototype + multi-seed evaluation** (`src/terrain/hydrology.ts`, `src/terrain/hydrology.test.ts`): a pure D8 module (no ChunkManager/Three.js/worker) consuming only `sampleFloorAt`/`sampleHeightAt`. Fixed 8-neighbour order, distance-aware steepest-descent with deterministic tie-break, iterative (no recursion) descending-elevation accumulation pass over typed arrays (`Float32Array`/`Int8Array`/`Int32Array`/`Uint8Array`, no per-cell objects). Boundary cells whose flow exits the analysis window are flagged `BOUNDARY_EXIT` (not silently treated as an outlet); one extra `sampleHeightAt` just outside the window distinguishes `OCEAN_OUTLET` from an incomplete/unresolved path. `findSourceCandidates()` derives sources from drainage leaves + elevation/slope thresholds with deterministic local-maxima thinning (never random). `classifyStreams()`/`traceDownstreamPath()` round out the diagnostic surface for a future river-network builder.

Evaluation (Etap 3) was done numerically rather than visually — a rendered river network doesn't exist yet to look at. `hydrology.test.ts` deterministically scans each seed for a mountain-heavy and a coast-heavy region (via `sampleMountainRidgeAt`/`sampleContinentalnessAt`, no hardcoded magic coordinates) and asserts: determinism, strict downhill descent per non-terminal cell, mass conservation (accumulation over terminal cells == cell count), and a bounded sink ratio. Measured across seeds `1/42/999` × mountain/coast regions (64×64 cells, 6 world units/cell): sink ratio ~2.6%–4.0%, source candidates 17–40 per region — low enough that naive-D8 closed depressions don't dominate the terrain, without a depression-resolution pass.

**Not implemented (Etap 4–7, deferred)**: river network as compact sequential data, cross-chunk continuity/query, channel/meander geometry, `createWater.ts`/`waterMaterial.ts` integration, an interactive in-browser hydrology debug overlay. Tracked in [LOOSE-ENDS.md](./LOOSE-ENDS.md).

**Verified**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1434 tests) all green. One golden snapshot (`grassPlacement.test.ts`, chunk `(-18,6)` — a low-count foothill-boundary chunk) shifted and was deliberately updated: a documented, expected interaction ("grass thins into mountain foothills") reacting to the mountain-gate/ridge tuning, not a regression. No browser/visual verification in this session — the user verifies mountain shape/foothills/passes manually; hydrology has no rendered representation yet to check.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
