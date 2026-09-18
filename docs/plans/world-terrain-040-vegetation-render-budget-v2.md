# Plan: Vegetation render budget v2

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** -
**Domain:** `world-terrain`
**Subdomains:** `vegetation` `rendering`
**Tags:** `lod` `batching` `performance`
**Model:** Sonnet, Composer

## Cel

Zmniejszyć koszt renderowania vegetation po istniejącym 3×3 region batchingu, bez tworzenia drugiego batching systemu i bez globalnego vegetation megabatchu.

## Evidence / punkt startowy

`settlement-heavy`:

- `full`: ~46.5 ms,
- `hide-vegetation`: ~28.7 ms,
- census vegetation: ~214 draws / ~760.9k triangles.

`stream`:

- `full`: ~10.8 ms,
- `hide-vegetation`: ~6.8 ms.

Aktualny `src/terrain/vegetationRegionBatcher.ts` już:

- grupuje vegetation w stałe regiony 3×3 chunk,
- rebuilds on change,
- synchronizuje LOD konserwatywnie przez nearest-member-wins,
- zachowuje chunk ownership/streaming.

Plan nie może ponownie „wdrożyć batchingu”.

## Aktualny kontrakt LOD

`src/terrain/chunkManager.ts` liczy jeden wspólny vegetation fraction przez:

`densityLodFraction(dist, loadRadius, lodScale)`

i przekazuje go do:

`vegetationRegionBatcher.syncLod(chunkCoord, fraction)`.

W efekcie każdy `VegetationKind` dostaje dziś ten sam source fraction przed regionowym `maxFraction()`.

Dla benchmarkowego / domyślnego High:

- `loadRadius = 3`,
- `lodScale = 1`,
- dist 0 → 1.00,
- dist 1 → 1.00,
- dist 2 → ~0.49,
- dist 3 → 0.08.

Ta sama polityka dotyczy zarówno dużych drzew, jak i paproci, trzcin, lilii czy seaweed.

## Zakres

### Stage 1. Conservative per-kind vegetation density LOD

Ten etap wykonać **przed dodawaniem nowej diagnostyki**, ponieważ aktualny kod już pokazuje bezpieczny i ograniczony lever: drobna vegetation może używać niższego mid-distance fraction bez ruszania near field, far floor, worldgen ani batchingu.

#### 1A. Wspólna polityka per-kind

Dodać małą, czystą politykę LOD opartą o klasy vegetation, np.:

```ts
type VegetationLodClass =
  | 'silhouette'
  | 'medium'
  | 'detail'
  | 'groundDetail'
```

Mapowanie Stage 1:

- `silhouette`
  - `tree-living`
  - `cactus`
  - `largeRock`
- `medium`
  - `fallenLog`
  - `rockCluster`
- `detail`
  - `bush`
  - `reed`
  - `lily`
- `groundDetail`
  - `fern`
  - `seaweed`

W Stage 1 **silhouette i medium zachowują obecną politykę 1:1**.

Faktyczna zmiana dotyczy wyłącznie:

- `bush`,
- `reed`,
- `lily`,
- `fern`,
- `seaweed`.

#### 1B. Distance-aware policy

Nie opierać policy wyłącznie o finalny `baseFraction`, ponieważ implementacja ma jawnie rozróżniać near / mid / far.

Preferowany kontrakt:

```ts
vegetationLodFraction(
  kind: VegetationKind,
  dist: number,
  radius: number,
  lodScale: number,
): number
```

Dopuszczalny jest równoważny helper z `baseFraction + distance band`, jeśli lepiej pasuje do istniejącego call-site.

Wymagania:

- near field zachowany dokładnie,
- mid field może być zredukowany per class,
- far zachowuje obecny floor,
- nie duplikować niezależnej distance-curve w kilku miejscach,
- globalny `lodScale` z quality presetów pozostaje źródłem bazowym.

#### 1C. Docelowa konserwatywna polityka Stage 1

Dla High / `loadRadius=3` celować w:

| Kind / class | dist 0 | dist 1 | dist 2 | dist 3 |
|---|---:|---:|---:|---:|
| silhouette | 100% | 100% | ~49% | 8% |
| medium | 100% | 100% | ~49% | 8% |
| detail | 100% | 100% | ~27–29% | 8% |
| groundDetail | 100% | 100% | ~20% | 8% |

To odpowiada orientacyjnie:

- `detail`: ~0.55–0.60 × obecny partial fraction,
- `groundDetail`: ~0.40 × obecny partial fraction,

ale tylko w środkowym zakresie, nie przy `baseFraction === 1` i nie kosztem obecnego far floor.

Nie dodawać osobnych magicznych krzywych per kind, jeśli klasy wystarczają.

#### 1D. Integracja z istniejącym region batcherem

Preferowany flow:

```text
chunkManager
  computes existing distance/base LOD inputs
        ↓
vegetationRegionBatcher
  applies per-kind policy
        ↓
stores chunk fraction per region+kind
        ↓
existing maxFraction() / nearest-member-wins
        ↓
InstancedPropGroup.setLodFraction()
```

Jeśli da się zachować obecny publiczny `syncLod(chunkCoord, fraction)` bez utraty jawnej distance-band policy, zachować go.

Jeżeli do poprawnej implementacji potrzebny jest `dist`, dopuścić minimalne rozszerzenie call contractu, ale bez przenoszenia world/scene ownership do polityki.

#### 1E. Zachować nearest-member-wins

Nie zmieniać w Stage 1:

- `REGION_CHUNKS = 3`,
- `maxFraction()`,
- region visibility,
- reflection visibility,
- rebuild-on-change.

Region nadal ma być konserwatywny: jeśli bliski chunk wymaga wyższego LOD dla danego kind, cały region-kind może go zachować.

#### 1F. Deterministyczny prefix guard

`InstancedPropGroup.setLodFraction()` zmniejsza `InstancedMesh.count`, czyli renderuje prefix istniejących instancji.

To jest akceptowalne dzięki obecnemu deterministycznemu/seedowanemu orderingowi placementów.

W ramach Stage 1:

- nie sortować placementów po dystansie,
- nie sortować placementów po kind-specific importance,
- nie zmieniać kolejności source placements,
- nie wprowadzać per-frame reordering.

Zmiana ordering może stworzyć przestrzennie widoczne dziury i jest poza zakresem.

#### 1G. Quality presets

Nie dodawać nowych pól do `WorldConfig`, persisted config ani GUI.

Istniejące:

- Low: `lodScale = 0.5`,
- Medium: `lodScale = 0.75`,
- High: `lodScale = 1.0`

pozostają źródłem globalnej jakości.

Per-kind policy jest tylko dodatkową warstwą istniejącego vegetation LOD.

### Stage 1 guardrails

Nie ruszać:

- `tree-living`,
- `cactus`,
- `largeRock`,
- `fallenLog`,
- `rockCluster`,
- shadow policy,
- reflection policy,
- 3×3 region size,
- region visibility,
- rebuild frequency,
- worldgen density,
- placement count,
- grass/filler,
- settlement vegetation.

Po Stage 1 zatrzymać produkcyjne zmiany i wykonać benchmark użytkownika przed kolejną optymalizacją.

### Stage 2. Warunkowa diagnostyka pozostałego vegetation cost

Uruchamiać dopiero po Stage 1 + benchmarku użytkownika, jeśli vegetation nadal jest istotnym kosztem.

Dla `settlement-heavy` i `stream` rozdzielić koszt na:

- draw submissions per kind,
- triangle count per kind / active LOD,
- instance counts,
- shadow participation,
- region visibility / active regions,
- rebuild frequency/cost podczas streamingu.

W pierwszej kolejności sprawdzić:

- `tree-living`,
- medium/silhouette kinds pozostawione bez zmian,
- conservative region `maxFraction()`,
- rebuild cost,
- shadow participation tylko jako pomiar, bez duplikowania polityki z `world-terrain-038`.

### Gate A — kolejny target po diagnostyce

Wybrać jeden dominujący typ kosztu:

- geometry/triangle pressure,
- zbyt konserwatywny LOD,
- zbyt konserwatywna region visibility,
- shadow participation,
- rebuild cost podczas streamingu.

Nie implementować kilku niezależnych hipotez naraz.

### Stage 3. Kolejna produkcyjna optymalizacja tylko na podstawie danych

W zależności od Stage 2 zastosować **jeden** najlepiej rokujący mechanizm:

1. tuning silhouette/medium per-kind LOD,
2. bounded improvement region aggregation,
3. ograniczenie rebuild work, jeśli `stream` potwierdzi CPU/hitch cost,
4. inny konkretny measured lever.

Nie wracać do shadow-only wyjątków bez nowych danych; `world-terrain-038` zamknął ten zakres.

## Architektoniczne decyzje

- Nie tworzyć drugiego vegetation visibility systemu.
- Nie wykonywać per-frame iteracji po wszystkich vegetation instances.
- Preferować dane już dostępne w chunk/region lifecycle.
- Nie zwiększać main-thread finalization work kosztem niewielkiego GPU winu.
- G17 worker/data-only boundaries pozostają bez zmian.
- `InstancedPropGroup.setLodFraction()` pozostaje istniejącym wykonawczym seamem.
- Reflection visibility pozostaje niezależna od main-pass LOD.
- Nowe ważne API/policy powinno mieć JSDoc i `@domain world-terrain`.

## Non-goals

- global vegetation batching,
- GPU-driven renderer,
- occlusion culling framework,
- HLOD całego świata,
- przebudowa chunk streamingu,
- zmiana vegetation worldgen,
- optymalizacja grass filler,
- shadow-policy duplication z `world-terrain-038`,
- zmiana region size w Stage 1.

## Verification

AI agent — Stage 1:

- unit tests dla policy classes / fraction logic,
- testy region logic,
- type-check/lint/test/build,
- bez browser verification.

Testy powinny potwierdzić:

- `base/near = 1` zachowuje 1 dla wszystkich kinds,
- silhouette/medium pozostają zgodne z obecnym LOD,
- detail jest niżej niż baseline tylko w partial/mid range,
- groundDetail jest bardziej agresywny niż detail,
- wynik nie przekracza bazowego fraction,
- wynik zachowuje far floor,
- monotoniczność,
- dwa różne kinds w tym samym regionie mogą dostać różne effective fractions,
- `maxFraction()` nadal działa per region+kind,
- rebuild zachowuje aktualny effective LOD,
- reflection semantics pozostają bez zmian.

Użytkownik po Stage 1:

- `?benchmark=settlement-heavy`,
- `?benchmark=stream`,
- porównać vegetation active instances / triangles, total draws, `RENDER`, FPS, frame p95,
- przejść przez las i obracać kamerę,
- sprawdzić brzegi rzek/jezior, reed beds, ferns, lilies i seaweed,
- obserwować granice regionów pod kątem pop/flicker/pulsowania.

## Success gate

Stage 1 zostaje, jeśli:

- bliska vegetation wygląda identycznie,
- nie ma oczywistego region-shaped poppingu,
- mid-distance detail vegetation pozostaje wizualnie akceptowalne,
- aktywne instances/triangles spadają sensownie,
- `RENDER` pokazuje powtarzalną poprawę.

Jeżeli zysk jest mały, nie zwiększać agresywności w ciemno. Przejść do Stage 2 i dopiero na podstawie diagnostyki wybierać następny lever.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
