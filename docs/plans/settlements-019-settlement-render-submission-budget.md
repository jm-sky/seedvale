# Plan: Settlement render submission budget

**Created:** 2026-09-17
**Status:** `planned` 📋
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

`2026-09-17--021--benchmark-settlement-heavy.md`:

- ~2399 draw calls avg,
- census settlement: ~1901 meshes/draws,
- `full`: ~46.5 ms render,
- `hide-settlement`: ~22.9 ms.

To wskazuje bardzo wysoki potencjał, ale isolation delta nie mówi, które settlement categories są winne. Najpierw potrzebny jest census źródeł submissions.

Repo już ma istniejące mechanizmy do ponownego użycia:

- `src/settlement/houseBuilder.ts` — `instantiateStatics()` i `HouseAssembly`,
- settlement-wide house static batching (`createHouseStaticBatch`),
- `src/render/instancedProps.ts` / istniejące `InstancedMesh` paths,
- `src/settlement/props.ts::buildSettlementProps()`.

## Zakres

### 1. Settlement render census

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

### Gate A

Wybrać tylko kategorie, które:

- mają dużą liczbę powtarzalnych renderables,
- współdzielą geometry/material albo mogą bezpiecznie użyć istniejącego asset/template path,
- nie wymagają per-instance interakcji lub unikalnej animacji/material state.

Jeśli większość kosztu pochodzi z obiektów niebatchowalnych, zatrzymać plan po diagnostyce i zapisać wynik zamiast budować szeroki nowy system.

### 2. Rozszerzenie istniejącego batching seam

Dla najlepszych 1–3 kategorii rozszerzyć istniejący mechanizm zamiast dodawać równoległy:

- preferować settlement-wide/static `InstancedMesh` buckets,
- zachować world positions/transforms i ownership settlementu,
- zachować osobne interactive meshes tylko tam, gdzie są faktycznie potrzebne,
- nie instancjować skinned/animated contentu,
- nie łączyć obiektów o różnych material semantics tylko dla liczby draw calls.

### 3. Lifecycle

Batch musi respektować aktualny create/unload settlementu i disposal shared GPU resources. Nie tworzyć globalnego settlement megabatchu niezależnego od streamingu.

## Architektoniczne decyzje

- Settlement pozostaje właścicielem swoich render resources.
- Reuse `houseBuilder`/`instancedProps` i istniejących placement arrays.
- Nie odtwarzać placementów z gotowych mesh transforms, jeśli źródłowe placement data już istnieją.
- Interakcje/collidery pozostają oddzielone od sposobu renderowania.
- Nie łączyć tego planu z shadow budget — shadow content jest osobnym planem i benchmarkiem.
- Nowe ważne funkcje assembly/batching powinny mieć JSDoc; gdy pomaga preflightowi użyć `@domain settlements`.

## Non-goals

- HLOD settlementu,
- impostory,
- przebudowa systemu budynków,
- globalny renderer wszystkich propsów świata,
- optymalizacja NPC/fauna,
- zmiana gameplayowych colliderów lub interaction anchors.

## Verification

AI agent:

- testy assembly/census dla zmienionych kategorii,
- type-check/lint/test/build,
- bez browser verification.

Użytkownik:

- `?benchmark=settlement-heavy`,
- porównać settlement draw/renderable census, total draw calls, `RENDER`, FPS, p95,
- sprawdzić wizualnie pełną dużą osadę oraz interakcje z obiektami, które pozostały dynamiczne.

## Success gate

Plan ma sens, jeśli usuwa znaczącą liczbę settlement submissions bez regresji lifecycle/interakcji. Preferowany wynik to setki mniej draw calls w ciężkiej osadzie; jeśli recon nie pokaże takiego potencjału, nie rozszerzać scope.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
