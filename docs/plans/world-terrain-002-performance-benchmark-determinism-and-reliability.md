# Plan: Performance Benchmark Determinism & Reliability

**Created:** 2026-08-24
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world-terrain`
**Tags:** `performance`, `benchmarking`, `rendering`, `streaming`

## Cel

Uczynić benchmark Seedvale powtarzalnym i diagnostycznie wiarygodnym, tak aby baseline → zmiana → benchmark rzeczywiście porównywały ten sam workload.

Nie przebudowywać `PerfMonitor` bez potrzeby. Główny zakres dotyczy **stanu początkowego, scenariuszy, warm-up i kontekstu raportu**.

## 1. Deterministic benchmark fixture

Benchmark nie może zależeć od aktualnego save/`Continue` ani od stanu świata sprzed uruchomienia.

Fixture ma definiować:

- stały seed,
- `timeOfDay = 07:00` jako standardowy start,
- stałe `elapsedDays` / porę roku,
- deterministyczny climate/weather,
- stałą konfigurację terrain/world,
- stałą jakość i pixel ratio dla benchmarku.

Nie przywracać tylko bieżącego `timeOfDay` i pozycji. Obecny benchmark zapisuje te wartości, ale nie kontroluje `elapsedDays`, przez co sezon/klimat mogą różnić się między runami.

## 2. Scenario anchors

Scenariusze muszą wskazywać reprodukowalne miejsca/workloady dla tego samego fixture.

### `current`

Nie może zależeć od pozycji gracza sprzed benchmarku. Albo otrzymuje stały anchor, albo zostaje wyłączony z automatycznych porównań.

### `settlement`

Używać stabilnego settlement anchor i kontrolować, że workload sceny jest porównywalny.

### `forest`

Nie wykonywać jedynie dynamicznego `seekForest()` od aktualnego home. Zdefiniować deterministyczny forest anchor dla fixture.

### `water`

Nie wybierać sceny wyłącznie przez wyszukiwanie najbliższej wysokości do water level. Zdefiniować deterministyczny water anchor zapewniający rzeczywiście porównywalną scenę wodną.

### `night`

Pozostaje tym samym scenariuszem co standardowy fixture, ale z jawnie ustaloną nocną porą; nie może wpływać na pozostałe runy.

### `stress`

Musi korzystać z tego samego deterministycznego fixture i jasno określonego ciężkiego miejsca/sceny.

### `stream`

Zdefiniować:

- stały start,
- stały kierunek,
- stałą trasę,
- stałą prędkość,
- stały czas pomiaru,
- przewidywalny workload chunków.

Celem jest możliwość powiązania frame hitchów z konkretnym streaming workloadem.

## 3. Warm-up vs measurement

Rozdzielić:

```text
setup
→ required chunk preload
→ warm-up
→ measured run
```

Obecne `waitForChunks()` + `sleep(1000)` nie stanowi jawnego modelu warm-up.

Standard benchmarku powinien wykluczać z measured run jednorazowe koszty, które nie reprezentują steady-state performance, w szczególności lazy initialization i pierwszego użycia zasobów.

Jeżeli potrzebujemy cold-start benchmarku, powinien być osobnym, jawnie nazwanym trybem.

## 4. Benchmark context

Rozszerzyć `PerfContext` / raport o informacje potrzebne do odtworzenia runu:

- seed,
- `elapsedDays`,
- `timeOfDay`,
- season,
- weather,
- player/scenario position,
- scenario anchor/route,
- quality,
- pixel ratio / viewport,
- terrain resolution,
- load radius,
- duration.

Kontekst ma pozwalać szybko stwierdzić, czy dwa raporty są rzeczywiście porównywalne.

## 5. Report interpretation

Nie traktować automatycznie najwyższej średniej kategorii CPU jako rzeczywistego bottlenecku.

Obecne `report.ts` sortuje średni koszt kategorii i na tej podstawie tworzy `bottlenecks` oraz rekomendację. Należy rozróżnić co najmniej:

- sustained cost,
- frame spikes/hitches,
- brak wystarczającej atrybucji,
- potencjalny GPU/render cost.

Nie rozszerzać tego w pełny trace analyzer — raport benchmarku ma pozostać prosty.

## 6. Scope boundaries

Poza zakresem:

- przebudowa `PerfMonitor` bez dowodu potrzeby,
- pełna analiza Chrome Performance trace,
- rozwiązywanie shader first-use hitch,
- optymalizacja rendering/chunk streaming sama w sobie,
- zmiana gameplay simulation.

## 7. Relevant files

- `src/perf/benchmark.ts`
- `src/perf/benchmarkScenarios.ts`
- `src/perf/types.ts`
- `src/perf/report.ts`
- `src/perf/monitor.ts`
- integracja benchmarku w `src/app/createApp.ts`
- `docs/performance/agent-browser-benchmarking.md`
- `docs/performance/PERFORMANCE-TOOLS-BACKLOG.md`

## 8. Verification

### Technical

- `tsc`
- lint
- tests
- build

### Benchmark

Wykonać ten sam scenariusz wielokrotnie i potwierdzić stabilność:

- seed/world state,
- time/season/weather,
- scenario position/route,
- loaded chunks,
- draw calls / triangles,
- FPS/frame-time distribution.

Porównać baseline i drugi run bez zmian w kodzie; różnice powinny mieścić się w ustalonym, akceptowalnym variance.

### Browser

Manual/browser verification benchmark workflow po implementacji.

**Zrób git commit i push do main, rebase jeżeli trzeba**
