Zbadaj WYŁĄCZNIE problem chunk-streaming hitchy w Seedvale i przygotuj plan poprawy.

**Status:** `done`
**Pla:**: `docs/plans/2026-08-15--119--chunk-streaming-performance.md`

## Cel

Zidentyfikować przyczynę bardzo długich klatek podczas chunk streaming oraz przygotować konkretny plan implementacji.

Punktem wyjścia jest:

`docs/reviews/2026-08-15--015--browser-performance-benchmark.md`

Kluczowe obserwacje:

- `forest`: frame max **1816 ms**
- `water`: frame max **374.8 ms**
- benchmark nie oznaczył tych hitchy jako `STREAMING`
- wcześniejsze manualne testy z review 010 również pokazały wielosekundowe hitchy podczas przemieszczania się i ładowania nowych chunków
- obecne średnie FPS są dobre, więc problemem nie jest sustained performance, tylko **sporadyczne długie blokowanie main thread**

## Scope

Skup się wyłącznie na:

- `ChunkManager`
- chunk generation
- terrain mesh generation
- chunk environment
- vegetation / trees / grass związane z chunkami
- water związane z chunkami, jeśli uczestniczy w hitchu
- finalize/commit chunków na main thread
- disposal/unload chunków
- istniejące batching/defer/streaming mechanisms
- ewentualne worker pipelines
- kolejność i budżetowanie pracy między klatkami

Nie rób ogólnego performance audytu.

Nie analizuj NPC, fauna, economy, UI ani innych systemów poza przypadkiem, gdy bezpośrednio uczestniczą w blokadzie podczas streamingu.

## Najpierw przeczytaj

Tylko:

1. `CLAUDE.md`
2. `docs/STATE.md`
3. `docs/reviews/2026-08-14--010--perf-benchmark-data.md`
4. `docs/reviews/2026-08-14--012--perf-bottleneck-diagnosis.md`
5. `docs/reviews/2026-08-15--013--architecture-and-performance-audit.md`
6. `docs/reviews/2026-08-15--015--browser-performance-benchmark.md`

Następnie przejdź bezpośrednio do kodu odpowiedzialnego za chunk streaming.

## Analiza kodu

Ustal konkretnie:

1. Co dzieje się po wykryciu potrzeby załadowania nowego chunka?
2. Które etapy wykonują się:
   - w workerze,
   - asynchronicznie,
   - na main thread,
   - synchronicznie w jednej klatce.
3. Które operacje mogą powodować >100 ms blokady.
4. Czy problemem jest:
   - generation,
   - transfer danych z workera,
   - tworzenie BufferGeometry,
   - tworzenie Three.js objects,
   - tworzenie/łączenie materiałów,
   - vegetation,
   - collider/physics,
   - water,
   - scene insertion,
   - disposal,
   - GC,
   - zbyt wiele chunków finalizowanych jednocześnie,
   - albo kombinacja kilku etapów.
5. Czy istnieją już mechanizmy:
   - queue,
   - priority,
   - batching,
   - per-frame budget,
   - deferred finalize,
   - backpressure,
   - cancellation,
   - worker pipeline,

   i czy są faktycznie używane.
6. Czy streaming może wykonać zbyt dużo pracy jednocześnie po większym ruchu/teleporcie.
7. Czy unload starych chunków może kolidować z load nowych.
8. Dlaczego obecny benchmark nie klasyfikuje tych hitchy jako `STREAMING`.

## Ważne

Nie zakładaj z góry, że problemem jest Worker.

Nie przenoś automatycznie pracy do Workerów.

Najpierw ustal, gdzie faktycznie powstaje blokada.

Preferuj wykorzystanie istniejącej architektury zamiast nowego systemu.

Szczególnie sprawdź, czy można ograniczyć pracę wykonywaną w pojedynczej klatce przez istniejący pipeline.

## Browser verification

Jeżeli istniejący workflow pozwala na tanią weryfikację:

- użyj istniejącego benchmarku `?benchmark=*`,
- szczególnie `forest`, `water` oraz `stress`,
- sprawdź korelację hitcha z chunk loading/finalization.

Nie twórz nowej instrumentacji, chyba że jest absolutnie konieczna do rozróżnienia dwóch możliwych przyczyn.

Jeśli potrzebna byłaby nowa instrumentacja, NIE implementuj jej teraz — opisz ją jako element planu.

## Wynik

Utwórz nowy plan w:

`docs/plans/`

Najpierw sprawdź `docs/plans/README.md` i wybierz następny dostępny numer planu.

Nazwa:

`YYYY-MM-DD--NNN--chunk-streaming-performance.md`

Plan musi zaczynać się dokładnie od:

# Plan: Chunk Streaming Performance

**Created:** 2026-08-15
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** unknown

Jeżeli podczas analizy okaże się, że znane są konkretne dependencies, zastąp `unknown` odpowiednimi ID planów.

## Plan powinien zawierać

### 1. Problem

Krótki opis hitchy i dane z review 015.

### 2. Root cause

Konkretnie wskazany kod/ścieżka wykonania.

Nie pisz ogólników typu „chunk generation is expensive”.

Wskaż:
- pliki,
- klasy/funkcje,
- kolejność operacji,
- miejsce potencjalnego blokowania main thread.

### 3. Current pipeline

Krótki diagram:

request
→ generation
→ worker
→ transfer
→ finalize
→ Three.js objects
→ scene
→ ...

### 4. Proposed solution

Konkretny sposób ograniczenia hitchy.

Preferuj:
- istniejące mechanizmy,
- incremental/deferred finalize,
- per-frame work budget,
- priorytety chunków,
- ograniczenie liczby finalize w jednej klatce,
- cancellation/backpressure,

jeżeli kod potwierdza, że są właściwe.

Nie projektuj abstrakcyjnego „streaming framework”.

### 5. Scope

Dokładnie:
- jakie pliki zmieniamy,
- jakie funkcje,
- jakie dane/stany,
- czego NIE zmieniamy.

### 6. Verification

Plan musi zawierać browser verification.

Porównanie przed/po:

- `forest`
- `water`
- `stress`
- frame max
- p95
- FPS
- liczba hitchy
- czas największego hitcha

Najważniejszy acceptance criterion:

> brak wieloset-milisekundowych / sekundowych blokad main thread podczas normalnego chunk streaming.

Nie wymagaj jednak absolutnego `0 ms` hitchy, jeśli przeglądarka/GC może powodować niezależne skoki.

### 7. Risks

Uwzględnij:
- wolniejsze pojawianie się chunków,
- pop-in,
- kolejki zalegających chunków,
- priorytet gracza vs odległe chunki,
- unload/load starvation,
- dodatkowy koszt komunikacji z workerem.

### 8. Expected result

Krótko opisz oczekiwany efekt.

Nie zakładaj konkretnej wartości FPS, jeśli nie wynika z pomiarów.

## Ważne ograniczenia

- NIE implementuj zmian w kodzie.
- NIE rób refaktoru.
- NIE twórz nowych systemów poza tym, co wynika z root cause.
- NIE optymalizuj NPC/fauna.
- NIE rozwiązuj Issue 031.
- NIE zmieniaj benchmark instrumentation, chyba że jest to część przyszłego planu.
- Nie wykonuj szerokiego repository scan.

Jeżeli root cause nie może być jednoznacznie ustalony statycznie, wyraźnie to zaznacz i zaproponuj minimalną diagnostykę potrzebną przed implementacją.

Na końcu zaktualizuj:

`docs/plans/README.md`

dodając nowy plan ze statusem `planned`.

Plan ma kończyć się dokładnie:

> **Zrób git commit i push do main, rebase jeżeli trzeba**

-----

## Quick verification before Chunk Streaming Investigation

Before starting the chunk streaming investigation, verify whether the performance fixes from these commits are actually active in the current browser benchmark:

- `c4c8c9d` — Disable N8AO
- `94874a5` — Tune water mirror and shadow map resolution
- `080fd3f` — Cut CPU frame cost

Do NOT implement any changes. This is only a focused verification.

### 1. N8AO

Verify the actual runtime configuration during `?benchmark=`.

Check:
- `High` preset configuration after all later changes,
- whether benchmark mode overrides AO settings,
- whether localStorage/config can override them,
- actual `aoEnabled` / AO quality at runtime,
- whether the benchmark is really running with AO OFF.

Important: compare the current implementation against commit `c4c8c9d` and later changes in `080fd3f`.

If AO is ON during the benchmark, determine exactly why.

### 2. Shadows

Verify the fix from `080fd3f` / related shadow changes.

Check the actual runtime render flow:

- `shadowMap.autoUpdate`
- `shadowMap.needsUpdate`
- mirror render
- beauty render
- number of shadow-map updates per frame

Confirm whether the intended behaviour is:

> one shadow-map update per frame, after mirror rendering

Do not assume that a high number of total draw calls means shadows are being rendered multiple times.

### 3. Water mirror

Verify that the current benchmark actually uses the tuned water settings from `94874a5`:

- mirror resolution
- mirror update frequency
- whether mirror rendering is skipped on alternate frames
- whether NPC/fauna are excluded from mirror rendering

Confirm the actual runtime values rather than only reading configuration defaults.

### 4. Construction Catalog / settlement

Do a focused check of the current Construction Catalog / House Builder output.

We observed roughly 500–780 settlement draws in the previous benchmarks.

Determine:

- whether the optimization from `080fd3f` is active,
- which settlement objects are instanced,
- which parts of houses remain separate meshes/submeshes,
- whether the high draw count is expected from the current construction pipeline.

Do NOT redesign or optimize the builder.

### Browser benchmark

Use the existing benchmark workflow and existing scenarios. Prefer:

- `settlement`
- `current`
- `water`
- `night`

Do not create new instrumentation unless absolutely necessary.

### Output

Create a short report in `docs/reviews/` only if useful.

For each area:

| Area | Fix present? | Active in benchmark? | Conclusion |
|---|---|---|---|
| N8AO | | | |
| Shadows | | | |
| Water mirror | | | |
| Settlement construction | | | |

For every unexpected result, give the exact file/function/config responsible.

Clearly distinguish:

- **fixed and verified**
- **fixed but benchmark overrides it**
- **fixed but runtime behaviour differs**
- **not fixed**
- **unclear**

Do not implement anything.

Do not perform a general performance audit.

After this verification, proceed to the planned **chunk streaming investigation**.
