# Plan: Trace Analyzer — Real Application CPU Attribution

**Created:** 2026-08-24
**Status:** `done` ✅
**Priority:** high · **Effort:** M
**Depends on:** -

## Cel

Rozszerzyć `scripts/analyze_trace.py` / `scripts/trace_analyzer/` tak, aby Trace Analyzer potrafił wskazać rzeczywisty kod aplikacji Seedvale odpowiedzialny za CPU zamiast raportować głównie browserowe kontenery (`RunTask`, `FunctionCall`, `TimerFire`).

Obecny analizator poprawnie buduje call tree i analizuje osadzone V8 CPU profiles, ale `v8_profiles.py` ogranicza analizę profili do WebGL/Three.js. Równocześnie `cpu_analysis.py` agreguje trace nodes przede wszystkim po nazwie eventu. W efekcie raport może wskazać `RunTask` jako kosztowny, ale nie pokazuje funkcji Seedvale, która ten koszt wygenerowała.

Źródła referencyjne:
- `docs/performance/PERFORMANCE-TOOLS-BACKLOG.md`
- `scripts/analyze_trace.py`
- `scripts/trace_analyzer/`
- `docs/performance/trace-results/Trace-20260820T085349.md`

## Zakres

### 1. Pełna analiza V8 CPU profiles

Rozszerzyć istniejącą obsługę `args.data.cpuProfile` tak, aby profile mogły raportować również application JavaScript.

Zachować istniejącą analizę:
- WebGL,
- SHADER / PROGRAM,
- THREE.JS RENDERER.

Dodać kategorię:
- APPLICATION.

Nie tworzyć drugiego parsera CPU profiles.

### 2. Identyfikacja funkcji aplikacji

Dla funkcji application wykorzystać istniejące dane V8:
- `functionName`,
- `url`,
- `lineNumber`,
- `columnNumber`,
- `samples`,
- `timeDeltas`,
- call tree (`children`).

Tożsamość operacji powinna być oparta na lokalizacji kodu, a nie wyłącznie na nazwie funkcji:

`functionName + url + line + column`

Dzięki temu funkcje o tej samej nazwie w różnych modułach nie będą agregowane razem.

### 3. Application vs framework/browser

Wprowadzić klasyfikację pozwalającą odróżnić:
- kod Seedvale,
- Three.js,
- framework/runtime,
- Chrome/V8/profiling infrastructure.

Nie traktować `RunTask`, `FunctionCall`, `TimerFire` itp. jako rzeczywistej przyczyny CPU — są kontenerami.

Klasyfikacja ma być konserwatywna. Jeżeli URL nie pozwala wiarygodnie określić właściciela kodu, raport powinien oznaczyć wynik jako niejednoznaczny zamiast zgadywać.

### 4. Raport application CPU

Dodać sekcję raportu:

`TOP APPLICATION CPU OPERATIONS`

Dla każdej operacji raportować, o ile dane są dostępne:
- function name,
- category,
- source location,
- sampled CPU time,
- sample count,
- liczba profili,
- call tree.

Preferować rzeczywisty koszt CPU nad samą liczbą samples.

### 5. Zachowanie istniejącego raportu

Nie usuwać:
- `TOP 5 REAL CPU OPERATIONS`,
- agregacji CPU,
- frame statistics,
- WebGL/Three.js analysis,
- GPU summary.

Zmiana ma rozszerzyć istniejące narzędzie, nie tworzyć równoległy analyzer.

### 6. Weryfikacja danych

Przed implementacją właściwej korelacji należy sprawdzić istniejący trace:

`docs/performance/trace-results/Trace-20260820T085349.md`

oraz odpowiednie dane wejściowe trace, jeżeli są dostępne, aby potwierdzić, że V8 CPU profiles zawierają wystarczające dane do meaningful application attribution.

Jeżeli dokładne przypisanie czasu do funkcji nie jest możliwe z obecnego formatu trace, raport nie może udawać precyzji. W takim przypadku należy jasno oznaczyć ograniczenie i opisać, jakie dane trzeba nagrywać inaczej.

## Istniejące mechanizmy do wykorzystania

- `scripts/analyze_trace.py`
- `scripts/trace_analyzer/v8_profiles.py`
- `scripts/trace_analyzer/cpu_analysis.py`
- `scripts/trace_analyzer/models.py`
- `scripts/trace_analyzer/report.py`
- istniejący `ProfileOperation`
- istniejący call-tree builder
- istniejące testy:
  - `scripts/tests/test_cpu_analysis.py`
  - `scripts/tests/test_call_tree.py`
  - `scripts/tests/test_trace_parser.py`

Nie tworzyć osobnego pipeline'u dla application CPU.

## Testy

Dodać testy jednostkowe dla:

1. klasyfikacji application vs Three.js/browser,
2. identyfikacji funkcji przez `url + line + column`,
3. agregacji tej samej funkcji z wielu samples,
4. rozdzielania funkcji o tej samej nazwie z różnych lokalizacji,
5. brakujących URL/line/column,
6. pustych lub niepełnych CPU profiles,
7. zachowania istniejącej analizy WebGL/Three.js.

Uruchomić istniejący zestaw testów analizatora oraz `tsc`/lint/build, jeżeli zmiany dotkną kodu wymagającego pełnej weryfikacji repozytorium.

## Weryfikacja raportu

Uruchomić analyzer na reprezentatywnym trace i sprawdzić, czy raport potrafi przejść od:

`RunTask / FunctionCall`

do:

`Seedvale function → source location → sampled CPU cost`.

Nie uznawać zadania za zweryfikowane wyłącznie na podstawie przejścia testów jednostkowych.

## Poza zakresem

Ten plan nie implementuje jeszcze:

- hitch → cause correlation,
- frame-focused analysis,
- browser noise classification jako osobnego systemu raportowania,
- Three.js attribution improvements,
- GPU attribution,
- chunk-streaming correlation,
- actionable findings,
- severity/confidence scoring.

Te elementy pozostają kolejnymi etapami Trace Analyzer.

## Definition of Done

- Trace Analyzer raportuje rzeczywiste funkcje application JS.
- Funkcje są identyfikowane po lokalizacji, nie tylko nazwie.
- `RunTask` i podobne browserowe kontenery nie są przedstawiane jako końcowa przyczyna CPU.
- Istniejące WebGL/Three.js profile analysis nadal działa.
- Są testy pokrywające nową klasyfikację i agregację.
- Raport na realnym trace pokazuje source location application code, jeżeli trace dostarcza wystarczających danych.
- Brak nieuzasadnionych wniosków, gdy trace nie pozwala na dokładną atrybucję.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
