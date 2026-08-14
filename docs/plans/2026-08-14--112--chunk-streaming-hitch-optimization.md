# Plan 112: Chunk Streaming Hitch Optimization

**Status:** `planned` 📋  
**Created:** 2026-08-14  
**Priority:** 🔴 high  
**Effort:** `M`  
**Depends on:** —  
**Related:** [review 012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md), [issue 030](../issues/2026-08-14--030--perf-render-bottlenecks.md), [plan 103](./2026-08-13--103--performance-diagnostics-benchmark.md)

## Cel

Zmniejszyć jednorazowy koszt `buildAndAttachMesh` przypadający na jedną klatkę podczas szybkiego streamingu chunków.

To jest problem **frame hitching**, nie średniego FPS. Review 012 potwierdził dla scenariusza `stream`:

- `chunk mesh`: **48 hitchy**;
- average: **29.9 ms**;
- maximum: **53.6 ms**;
- inne kategorie streamingu (`grass`, `vegetation`, `environment`, `glb`, `unload`) nie przekroczyły progu 8 ms.

Istniejący pipeline już posiada mechanizm rozłożenia ładowania chunków na wiele klatek. Plan ma **dostroić ten istniejący scheduler/budget**, a nie wprowadzać drugi system streamingu.

## Prompt dla Cursor

```text
# Seedvale — Chunk Streaming Hitch Optimization

Przejrzyj aktualny codebase oraz:

`docs/reviews/2026-08-14--012--perf-bottleneck-diagnosis.md`

Problem potwierdzony przez Performance Diagnose:

Podczas scenariusza `stream`:
- `buildAndAttachMesh` / `chunk mesh`
- 48 hitchy,
- średnio ~29.9 ms,
- maksimum ~53.6 ms.

To jest problem **płynności podczas streamingu**, a nie średniego FPS.

## Cel

Zmniejszyć jednorazowy koszt budowania i dołączania chunk mesh do jednej klatki.

Wykorzystaj istniejący pipeline chunków i scheduler. Nie projektuj nowego systemu.

### Preferowane rozwiązanie

Rozłóż koszt `buildAndAttachMesh` na wiele klatek poprzez istniejący mechanizm kolejkowania/budżetowania pracy.

Najważniejsze:
- ograniczyć ilość pracy wykonywanej w jednej klatce,
- zachować kolejność i poprawność streamingu,
- nie powodować widocznych opóźnień w pojawianiu się chunków,
- nie zmieniać semantyki generowania świata.

Jeżeli istnieje już scheduler/budget dla chunków, **dostosuj go zamiast tworzyć drugi mechanizm**.

## Ograniczenia

Nie:
- przenoś Three.js rendering/scene manipulation do Web Workera,
- nie przebudowuj całego chunk systemu,
- nie zmieniaj gameplay semantics,
- nie optymalizuj grass/vegetation/water,
- nie zmieniaj NPC,
- nie twórz równoległego systemu streamingu.

Worker może przygotowywać dane, ale finalne tworzenie i attach Three.js objects pozostaje na main thread.

## Weryfikacja

Po implementacji:

1. uruchom build/testy,
2. uruchom istniejący benchmark `stream`,
3. porównaj:
   - hitch count,
   - average hitch,
   - maximum hitch,
4. sprawdź, czy chunki nadal pojawiają się wystarczająco szybko,
5. sprawdź, czy nie ma brakujących chunków ani artefaktów.

Najważniejszy rezultat:

**mniej i krótsze hitchy podczas szybkiego przemieszczania się po świecie.**

Na końcu podaj krótko:

- źródło hitcha,
- zastosowane rozwiązanie,
- Before → After dla `count / avg / max`,
- ewentualny kompromis.

Pracuj oszczędnie. Najpierw prześledź wyłącznie istniejący pipeline chunków związany z `buildAndAttachMesh` i streamingiem. Nie wykonuj szerokiego przeglądu repozytorium.
```

## 1. Aktualny pipeline — punkt wejścia

Przed zmianą prześledzić wyłącznie ścieżkę odpowiedzialną za streamed chunk mesh:

`ChunkManager.update()` → istniejąca kolejka/budget → `requestChunkTile()` / wynik workera → `buildAndAttachMesh()` → `scene.add()` oraz lifecycle/dispose.

Nie wykonywać szerokiego audytu `ChunkManager`. Interesują tylko miejsca, w których wiele gotowych wyników może doprowadzić do wielu `buildAndAttachMesh()` w tej samej klatce.

`ChunkManager` jest właścicielem streamingu chunków i ma już mechanizm ograniczający liczbę nowych chunków uruchamianych w jednej klatce. Istniejący commit dotyczący budgeted chunk streaming rozkładał wcześniej ładowanie „a few per frame”; problem 012 pokazuje, że sam koszt finalnego main-thread attach/build nadal może koncentrować się w jednej klatce. Nie zakładać jednak konkretnego obecnego limitu — odczytać aktualny kod i dostroić rzeczywisty scheduler.

## 2. Strategia implementacji

### 2.1 Najpierw ustalić prawdziwy punkt koncentracji pracy

Sprawdzić:

- gdzie scheduler wybiera chunk do rozpoczęcia;
- gdzie wynik workera trafia z powrotem na main thread;
- czy `buildAndAttachMesh()` jest wykonywane bezpośrednio w callbacku Promise/worker;
- czy kilka gotowych wyników może zostać obsłużonych kolejno w tej samej klatce;
- czy obecny budget obejmuje **tylko start generation**, czy również finalny mesh build/attach.

Nie dodawać nowego `requestAnimationFrame`/queue managera, jeśli istniejąca kolejka może zostać rozszerzona o etap finalizacji.

### 2.2 Preferowany model

Jeżeli obecny scheduler nie ogranicza finalizacji gotowych tile results, rozszerzyć jego istniejący budżet tak, aby również `buildAndAttachMesh` podlegał limitowi na klatkę.

Preferować prosty deterministyczny limit, np.:

- maksymalna liczba finalizacji chunków na klatkę;
- lub mały time budget dla finalnego build/attach, jeśli istniejący scheduler już operuje czasowo.

Wybrać rozwiązanie zgodne z istniejącym stylem kodu. Nie tworzyć dwóch niezależnych budżetów, które mogą się wzajemnie omijać.

Jeżeli aktualny scheduler już posiada jeden wspólny budget, dostosować jego wartość/warunek i pozostawić strukturę bez zmian.

### 2.3 Kolejność

Zachować obecną deterministyczną kolejność streamingu. Jeżeli scheduler ma kolejkę `desired`/distance/order, nie zastępować jej prostym FIFO bez uzasadnienia.

Ważne jest, aby ograniczenie pracy nie powodowało:

- ładowania odległych chunków przed potrzebnymi;
- trwałego starvation blisko gracza;
- race condition po stream-out;
- attachu anulowanego/starego chunk result.

## 3. Frame-yield

Jeżeli konieczne jest rozdzielenie istniejącej kolejki finalizacji na kolejne klatki, użyć mechanizmu zgodnego z obecnym schedulerem.

Nie wprowadzać globalnego scheduler systemu. Yield ma dotyczyć tylko istniejącego chunk pipeline.

Preferowana własność:

```text
worker result ready
        ↓
existing chunk queue
        ↓
per-frame budget
        ↓
1..N × buildAndAttachMesh
        ↓
scene.add
```

Zamiast:

```text
many worker results become ready
        ↓
Promise callbacks immediately build everything
        ↓
one long main-thread frame
```

## 4. Performance constraints

Cel optymalizacji to **frame-time distribution**, nie zmniejszenie całkowitej liczby wygenerowanych chunków.

Nie zmieniać:

- rozdzielczości `Insane 193`;
- geometrii terenu;
- grass generation;
- vegetation;
- water;
- settlement rendering;
- worker protocol, jeśli nie jest to konieczne do poprawnego budżetowania;
- gameplay semantics.

Nie przenosić `THREE.Mesh`, `THREE.BufferGeometry`, `scene.add()` ani innych operacji Three.js na worker.

Jeżeli zmiana zwiększy wall-clock time pełnego dogonienia streamingu, jest to akceptowalny kompromis tylko wtedy, gdy hitchy wyraźnie spadają i opóźnienie wizualnego pojawiania się chunków pozostaje praktycznie niezauważalne.

## 5. Weryfikacja techniczna

Uruchomić istniejące:

```text
npm run test
npm run build
```

Jeżeli repo ma osobny `tsc`/lint wymagany przez aktualny workflow, uruchomić również istniejące standardowe checki.

Następnie uruchomić benchmark:

```text
?benchmark=stream
```

Użyć tego samego scenariusza, seed/load/quality i środowiska co Review 012, o ile benchmark nadal to wymusza. Nie porównywać wyników z inną konfiguracją bez zaznaczenia różnicy.

## 6. Kryteria sukcesu

Baseline z Review 012:

| Metric | Before |
|---|---:|
| hitch count | 48 |
| hitch avg | 29.9 ms |
| hitch max | 53.6 ms |

Po zmianie oczekiwane jest:

- wyraźnie mniej hitchy;
- niższy average hitch;
- niższy maximum hitch;
- brak regresji poprawności streamingu;
- brak widocznego „pustego pasa” chunków przy szybkim ruchu.

Nie ustalać sztucznego progu typu „musi być <16 ms”, jeśli rzeczywisty benchmark pokazuje inny sensowny kompromis. Raportować rzeczywisty Before → After.

## 7. Browser / visual verification

Podczas `stream` sprawdzić:

1. szybki ruch w osi używanej przez benchmark;
2. brak brakujących chunków;
3. brak widocznych seamów/artefaktów;
4. brak trwałego opóźnienia chunków względem gracza;
5. poprawne stream-out za graczem;
6. powrót w stronę wcześniej opuszczonego obszaru nadal odtwarza poprawne chunki.

W razie potrzeby użyć istniejącego `?perf=1` i benchmark reportów. Nie dodawać nowego narzędzia diagnostycznego tylko dla tego planu.

## 8. Raport końcowy

Na końcu implementacji podać krótko:

- **Źródło hitcha:** gdzie dokładnie wiele `buildAndAttachMesh` kumulowało się w jednej klatce;
- **Rozwiązanie:** który istniejący scheduler/budget został dostosowany;
- **Before → After:** `count / avg / max`;
- **Streaming latency:** czy pojawianie się chunków pozostało wystarczająco szybkie;
- **Kompromis:** tylko jeśli rzeczywiście wystąpił.

Nie rozbudowywać raportu o inne bottlenecks z Review 012. Ten plan dotyczy wyłącznie hitchy `chunk mesh`.
