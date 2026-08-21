# Plan: Natural Mountains & Rivers

**Created:** 2026-08-21
**Status:** `planned` 📋
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

> **Zrób git commit i push do main, rebase jeżeli trzeba**
