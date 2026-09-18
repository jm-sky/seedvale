# Plan: Settlement render submission budget

**Created:** 2026-09-17
**Status:** `verification needed` 🔍
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** -
**Domain:** `settlements`
**Subdomains:** `buildings`
**Tags:** `rendering` `instancing` `performance`
**Model:** Sonnet, Composer

## Cel

Zmniejszyć liczbę main-pass submissions generowanych przez duże osady, wykorzystując istniejące ścieżki instancingu i static batching zamiast tworzyć drugi renderer settlementów.

## Evidence / punkt startowy

Aktualny punkt odniesienia po zakończeniu `world-terrain-038-shadow-caster-content-budget-v2` to `2026-09-18--028--benchmark-settlement-heavy.md`:

- FPS avg ~12.9,
- frame avg ~77.4 ms,
- RENDER ~45.8 ms,
- settlement main-pass census: ~1607 draws, ~1.38M tris, ~3577 instances,
- settlement shadow census: ~810 draws, ~831.6k tris,
- `hide-settlement`: ~45.0 → ~37.0 ms,
- `no-shadows`: ~45.0 → ~34.7 ms.

`world-terrain-038` istotnie obniżył settlement shadow workload, ale main-pass settlement submissions nadal są wysokie. Ten plan przejmuje dalszą optymalizację main pass.

Repo już ma istniejące mechanizmy do ponownego użycia:

- `src/render/instancedProps.ts::buildInstancedProps()`,
- `src/settlement/houseBuilder.ts` — `instantiateStatics()` i settlement-wide `createHouseStaticBatch()`,
- `src/settlement/props.ts::buildSettlementProps()`,
- placement arrays używane już dla barrels/troughs/hay/fences/bushes/plaza cobbles.

## Zakres

### Stage 1. Bezpieczny static landmark batching — wells + gardens/crops

Ten etap należy wykonać **przed dodawaniem nowej diagnostyki**, ponieważ oba targety są już wystarczająco uzasadnione przez aktualny kod i poprzednie benchmarki.

#### 1A. Wells

Aktualny path:

- `well.glb` jest przygotowywany jako wspólny template,
- central / household / pasture wells powstają przez `clone(true)`,
- asset ma 5 render primitives,
- household wells mają po `world-terrain-038` wyłączone `castShadow`, ale nadal kosztują main-pass submissions,
- gameplay uses stable landmark/position/queue/collider state i nie powinien zależeć od indywidualnego render clone.

Cel:

- zastąpić clone-per-well settlement-owned instancingiem opartym o istniejący `buildInstancedProps()` lub minimalne rozszerzenie tego samego seamu,
- zachować oddzielne buckety tam, gdzie różnią się shadow semantics:
  - central/pasture: shadow-casting,
  - household: no-shadow,
- zachować dokładne world transforms, scaling i placement,
- nie zmieniać gameplayowych queue IDs, colliderów, drink interactions ani authoritative landmark positions.

Przed usunięciem renderowego `well.prop` sprawdzić jego aktualne użycie w `buildWellInteractionQueueConfig()`. Jeżeli funkcja potrzebuje tylko jawnych danych świata/footprintu, odseparować ten kontrakt od renderowego `Object3D`; nie utrzymywać sztucznego live mesh tylko dla kolejki interakcji.

#### 1B. Gardens / crops beds

Aktualny path:

- `crops.glb` jest wspólnym template,
- `layoutCropsGarden()` klonuje cały template osobno dla każdego bedu,
- template ma 6 render primitives,
- po `world-terrain-038` plant meshes nie rzucają cieni; Dirt pozostaje casterem,
- cultivation anchors są osobnym gameplay state i nie wymagają indywidualnych render clones.

Cel:

- zamienić clone-per-bed na settlement-owned instancing wspólnych primitives,
- zachować spacing z `GARDEN_BED_W` / `GARDEN_BED_GAP`,
- zachować garden/world rotation, scale i ground placement,
- zachować per-primitive `castShadow` / `receiveShadow`,
- nie zmieniać cultivation anchors, growth/gameplay semantics ani settlement layout.

#### 1C. Wspólny rendering seam

Preferować reuse `buildInstancedProps()` zamiast tworzyć `InstancedWellsManager` / `InstancedGardensManager`.

Jeżeli obecny `PropPlacement` nie wystarcza do wiernego odwzorowania lokalnych offsetów bedów lub różnej shadow policy tego samego template, dopuścić **małe, ogólne rozszerzenie istniejącego seamu**, pod warunkiem że:

- pozostaje użyteczne także dla innych static repeated props,
- nie wprowadza settlement-specific state do `render/instancedProps.ts`,
- nie wymaga per-frame traversal/synchronizacji,
- zachowuje ownership i disposal settlementu,
- nie duplikuje istniejącego systemu instancingu.

#### Stage 1 guardrails

Nie obejmować tym etapem:

- settlement living trees — mają live `mesh` contract dla harvest/stump lifecycle,
- food-storage representatives — mają dynamiczne visibility/pools,
- torches/campfires — light/VFX/controllers,
- houses — static content jest już settlement-wide batchowany,
- fences/hay/troughs/barrels/bushes/plaza cobbles — są już instancjonowane,
- wheat fields — nie są częścią tego pierwszego, bounded targetu.

Po Stage 1 zatrzymać produkcyjne zmiany i wykonać benchmark użytkownika przed ruszaniem kolejnych kategorii.

### Stage 2. Warunkowa diagnostyka pozostałych main-pass sources

Ten etap uruchamiać **dopiero po Stage 1 + benchmarku użytkownika**, jeśli settlement main-pass nadal jest istotnym kosztem.

Dodać bounded diagnostic raportujący settlement renderables/draws według źródła, np.:

- house static batches,
- house interactive/dynamic parts,
- furniture nieobjęte static batch,
- fences/palisades/paddocks,
- landmarks,
- market/storage/workplace props,
- torches/fire/effects,
- misc decorative props.

Census ma działać w benchmarku `settlement-heavy` i nie może zostać jako kosztowny per-frame traversal w normalnym gameplayu.

### Gate A — wybór kolejnego targetu po diagnostyce

Wybrać tylko kategorie, które:

- mają dużą liczbę powtarzalnych renderables,
- współdzielą geometry/material albo mogą bezpiecznie użyć istniejącego asset/template path,
- nie wymagają per-instance interakcji lub unikalnej animacji/material state.

Jeśli większość kosztu pochodzi z obiektów niebatchowalnych, zatrzymać plan po diagnostyce i zapisać wynik zamiast budować szeroki nowy system.

### Stage 3. Kolejne batching wins tylko na podstawie danych

Dla najlepszego 1–2 targetów wskazanych przez Stage 2 rozszerzyć istniejący mechanizm zamiast dodawać równoległy:

- preferować settlement-wide/static `InstancedMesh` buckets,
- zachować world positions/transforms i ownership settlementu,
- zachować osobne interactive meshes tylko tam, gdzie są faktycznie potrzebne,
- nie instancjować skinned/animated contentu,
- nie łączyć obiektów o różnych material semantics tylko dla liczby draw calls.

## Lifecycle

Batch musi respektować aktualny create/unload settlementu i disposal shared GPU resources. Nie tworzyć globalnego settlement megabatchu niezależnego od streamingu.

## Architektoniczne decyzje

- Settlement pozostaje właścicielem swoich render resources.
- Reuse `houseBuilder` / `instancedProps` i istniejących placement arrays.
- Nie odtwarzać placementów z gotowych mesh transforms, jeśli źródłowe placement data już istnieją.
- Interakcje/collidery pozostają oddzielone od sposobu renderowania.
- Nie łączyć tego planu z dalszym shadow budget — shadow content został już obsłużony przez `world-terrain-038`.
- Stage 1 nie jest blokowany przez nowy census; diagnostyka jest warunkowym Stage 2.
- Nowe ważne funkcje assembly/batching powinny mieć JSDoc; gdy pomaga preflightowi użyć `@domain settlements`.

## Non-goals

- HLOD settlementu,
- impostory,
- przebudowa systemu budynków,
- globalny renderer wszystkich propsów świata,
- optymalizacja NPC/fauna,
- zmiana gameplayowych colliderów lub interaction anchors,
- kolejna fala shadow-only wyjątków bez nowych danych.

## Verification

AI agent — Stage 1:

- focused tests dla wells/gardens batching,
- testy zachowania transformów i shadow semantics,
- testy potwierdzające, że gameplay anchors/interactions pozostają niezależne od render clone,
- type-check/lint/test/build,
- bez browser verification.

Użytkownik po Stage 1:

- `?benchmark=settlement-heavy`,
- porównać settlement draw/renderable census, total draw calls, `RENDER`, FPS, p95,
- sprawdzić wizualnie central / household / pasture wells,
- sprawdzić picie/interakcję przy studniach,
- sprawdzić ogrody różnych rozmiarów i cultivation interaction.

AI agent — Stage 2, tylko jeśli potrzebny:

- testy census/classification/counting,
- type-check/lint/test/build,
- bez browser verification.

## Success gate

Stage 1 ma sens, jeśli usuwa znaczącą liczbę settlement submissions bez regresji lifecycle/interakcji i bez nowego równoległego render systemu.

Po Stage 1 decyzję o dalszej optymalizacji podejmować na podstawie benchmarku. Jeżeli settlement nadal pozostaje istotnym main-pass kosztem, uruchomić Stage 2 i dopiero wtedy wybierać trudniejsze targety (np. storage goods / living trees / nieoczywisty decor remainder).

> **Zrób git commit i push do main, rebase jeżeli trzeba**
