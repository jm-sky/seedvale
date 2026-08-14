# Plan 112: Chunk Streaming Hitch Optimization

**Status:** `planned` 📋  
**Created:** 2026-08-14  
**Priority:** 🔴 high  
**Effort:** `M`  
**Depends on:** —  
**Related:** [review 012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md), [issue 030](../issues/2026-08-14--030--perf-render-bottlenecks.md), [plan 103](./2026-08-13--103--performance-diagnostics-benchmark.md)

## Cel

Zmniejszyć **frame hitching podczas szybkiego streamingu chunków**.

Review 012 potwierdził dla scenariusza `stream`:

- `chunk mesh`: **48 hitchy**
- average: **29.9 ms**
- maximum: **53.6 ms**
- pozostałe kategorie streamingu (`grass`, `vegetation`, `environment`, `glb`, `unload`) nie przekroczyły progu 8 ms.

To nie jest problem średniego FPS.

### Istotny kontekst

Obecny `ChunkManager` już ogranicza **start generowania** do:

`CHUNKS_STARTED_PER_FRAME = 2`

Nie oznacza to jednak, że finalny koszt:

`worker result → buildAndAttachMesh() → scene.add()`

jest rozłożony na klatki.

Kilka wyników workera może być gotowych w podobnym czasie, a ich synchroniczne `buildAndAttachMesh()` może zostać wykonane w tej samej klatce.

**Celem planu jest więc rozdzielenie worker completion od main-thread mesh finalization.**

Nie tworzyć nowego systemu streamingu. Rozszerzyć istniejący pipeline.

---

# Prompt dla Cursor

    # Seedvale — Chunk Streaming Hitch Optimization

    Przejrzyj aktualny codebase oraz:

    `docs/reviews/2026-08-14--012--perf-bottleneck-diagnosis.md`

    Problem potwierdzony przez Performance Diagnose:

    Podczas scenariusza `stream`:
    - `buildAndAttachMesh` / `chunk mesh`
    - 48 hitchy,
    - średnio ~29.9 ms,
    - maksimum ~53.6 ms.

    To jest problem frame hitching podczas streamingu, nie średniego FPS.

    ## Ważny kontekst aktualnego kodu

    `ChunkManager` już posiada:
    - `loadQueue`,
    - nearest-first ordering,
    - `drainLoadQueue()`,
    - `CHUNKS_STARTED_PER_FRAME = 2`.

    Ten limit kontroluje jednak **starty generowania chunków**, a niekoniecznie finalny main-thread etap:

    `worker result → buildAndAttachMesh() → scene.add()`

    Najpierw potwierdź to w aktualnym kodzie.

    Nie zakładaj konkretnej implementacji na podstawie tego promptu — odczytaj aktualny pipeline.

    ## Cel

    Zmniejszyć koncentrację `buildAndAttachMesh()` w jednej klatce.

    Preferowany model:

    worker result ready
            ↓
    existing chunk pipeline / queue
            ↓
    per-frame finalization limit
            ↓
    1 × buildAndAttachMesh()
            ↓
    scene.add()

    zamiast:

    worker result ready
            ↓
    Promise continuation
            ↓
    wiele buildAndAttachMesh() w tej samej klatce

    ## Najpierw wykonaj bardzo wąski code trace

    Prześledź wyłącznie:

    `ChunkManager.update()`
    → `drainLoadQueue()`
    → `ensureLoaded()`
    → worker result
    → `buildAndAttachMesh()`
    → `scene.add()`

    Ustal:

    1. gdzie worker result wraca na main thread;
    2. czy `buildAndAttachMesh()` wykonywane jest bezpośrednio w continuation/callbacku;
    3. czy wiele gotowych wyników może wykonać `buildAndAttachMesh()` w jednej klatce;
    4. czy obecny `CHUNKS_STARTED_PER_FRAME` faktycznie chroni finalization stage;
    5. ile kosztuje pojedyncze `buildAndAttachMesh()`.

    Nie wykonuj szerokiego audytu `ChunkManager`.

    ## Mikroprofiling

    Jeżeli aktualny instrumentation nie pozwala określić struktury kosztu `buildAndAttachMesh()`, dodaj tylko minimalny pomiar potrzebny do ustalenia:

    - całkowitego czasu `buildAndAttachMesh()`;
    - kosztu głównego geometry/build stage;
    - ewentualnych wyraźnie dominujących podoperacji.

    Nie optymalizuj tych podoperacji w ramach tego planu, chyba że okaże się, że istnieje oczywisty, lokalny błąd powodujący niepotrzebny koszt.

    Najpierw rozwiązuj problem koncentracji pracy między klatkami.

    ## Preferowane rozwiązanie

    Jeżeli potwierdzi się, że worker results są finalizowane bezpośrednio po ukończeniu:

    1. dodaj wyniki do istniejącego pipeline/kolejki finalizacji;
    2. finalizuj ograniczoną liczbę gotowych chunków na klatkę;
    3. rozpocznij od prostego limitu:

    `1 × buildAndAttachMesh() / frame`

    4. zachowaj istniejący `loadQueue`, ordering i `CHUNKS_STARTED_PER_FRAME`.

    Nie twórz drugiego systemu streamingu.

    Nie twórz globalnego scheduler systemu.

    Nie dodawaj osobnego `requestAnimationFrame` managera, jeżeli istniejący `ChunkManager.update()` może obsłużyć ten etap.

    ## Dlaczego zaczynamy od 1 finalizacji/frame

    Pojedynczy `buildAndAttachMesh()` może sam kosztować kilkanaście–kilkadziesiąt ms.

    Budżet na liczbę finalizacji nie może przerwać pojedynczego synchronicznego builda.

    Celem pierwszej zmiany jest więc:

    Frame N     → chunk A finalization
    Frame N+1   → chunk B finalization
    Frame N+2   → chunk C finalization

    zamiast:

    Frame N → A + B + C finalization

    Jeżeli benchmark pokaże zbyt duże opóźnienie wizualnego streamingu, dopiero wtedy rozważ `2/frame` lub istniejący czasowy budget.

    Nie wprowadzaj adaptacyjnego budgetu bez potrzeby.

    ## Kolejność

    Zachowaj aktualną deterministyczną kolejność chunków.

    Jeżeli obecna kolejka jest nearest-first / distance ordered, nie zastępuj jej FIFO.

    Finalization queue musi:

    - preferować potrzebne/nearby chunki;
    - nie powodować starvation;
    - ignorować wyniki chunków, które zostały już unloadowane;
    - respektować aktualny lifecycle `chunks`, `pendingPromise` i cancellation.

    Nie zmieniaj semantyki streamingu.

    ## Lifecycle / stale results

    Obecny kod zawiera zabezpieczenia przed sytuacją:

    worker result
        ↓
    chunk został już unloadowany

    Zachowaj istniejące guardy.

    Przeniesienie wyniku do kolejki finalizacji nie może spowodować:

    - attachu starego chunk result;
    - odbudowania unloadowanego chunku;
    - pozostawienia `pendingPromise`;
    - wycieku Three.js objects;
    - błędnego `state`.

    Jeżeli chunk zostanie unloadowany przed finalization, wynik powinien zostać pominięty zgodnie z obecnym lifecycle.

    ## Nie zmieniaj

    Nie zmieniaj:

    - procedural generation;
    - worker generation algorithm;
    - terrain resolution;
    - `Insane 193`;
    - grass generation;
    - vegetation generation;
    - water;
    - settlement rendering;
    - NPC;
    - gameplay semantics;
    - chunk coordinates;
    - load/unload radii;
    - worker protocol, jeżeli nie jest to konieczne.

    Nie przenoś do Workera:

    - `THREE.Mesh`;
    - `THREE.BufferGeometry`;
    - `scene.add()`;
    - innych operacji wymagających Three.js scene/render objects.

    Worker może przygotowywać dane. Final mesh construction i scene attachment pozostają na main thread.

    ## Minimalna zmiana

    Preferuj rozwiązanie polegające na:

    istniejący loadQueue
            +
    istniejący update()
            +
    mała kolejka gotowych wyników
            +
    limit finalizacji/frame

    zamiast przebudowy `ChunkManager`.

    Nie twórz równoległego mechanizmu streamingu.

    Jeżeli istniejąca struktura może zostać rozszerzona bez dodatkowej kolejki, preferuj tę opcję.

    ## Ważne rozróżnienie

    Nie zakładaj, że:

    `CHUNKS_STARTED_PER_FRAME = 2`

    rozwiązuje problem.

    Ten limit dotyczy startu pracy.

    Plan dotyczy:

    `READY RESULT → buildAndAttachMesh()`

    To właśnie ten etap musi zostać rozłożony na klatki.

    ## Performance trade-off

    Akceptowalny jest niewielki wzrost całkowitego czasu dogonienia streamingu, jeżeli:

    - hitch count wyraźnie spada;
    - hitch max/avg wyraźnie spada;
    - gracz nie obserwuje trwałego opóźnienia chunków.

    Nie optymalizuj pod „najmniejszy możliwy wall-clock time”.

    W tym planie priorytetem jest:

    **frame-time distribution / smoothness podczas streamingu.**

    ## Weryfikacja

    Uruchom istniejące standardowe checki projektu:

    `npm run test`
    `npm run build`

    Jeżeli aktualny workflow wymaga dodatkowego `tsc`/lint, użyj istniejących checków repozytorium.

    Następnie uruchom istniejący benchmark:

    `?benchmark=stream`

    Użyj tej samej konfiguracji, seed/load/quality i scenariusza co Review 012, o ile benchmark nadal to definiuje.

    Nie porównuj wyników z inną konfiguracją bez zaznaczenia różnicy.

    ## Baseline

    Review 012:

    | Metric | Before |
    |---|---:|
    | hitch count | 48 |
    | hitch avg | 29.9 ms |
    | hitch max | 53.6 ms |

    Po implementacji raportuj:

    | Metric | Before | After |
    |---|---:|---:|
    | hitch count | 48 | ? |
    | hitch avg | 29.9 ms | ? |
    | hitch max | 53.6 ms | ? |

    Nie ustalaj sztucznego progu sukcesu typu `<16 ms`.

    Najważniejsze jest wyraźne zmniejszenie hitching przy zachowaniu odpowiedniej szybkości streamingu.

    ## Browser / visual verification

    Podczas istniejącego scenariusza `stream` sprawdź:

    1. szybki ruch zgodny z benchmarkiem;
    2. brak brakujących/pustych chunków;
    3. brak widocznych seamów lub artefaktów;
    4. brak trwałego opóźnienia chunków względem gracza;
    5. poprawny stream-out;
    6. brak problemów po zmianie kierunku ruchu.

    Nie dodawaj nowego narzędzia diagnostycznego.

    Użyj istniejącego `?perf=1` / benchmark reportów, jeśli jest to przydatne.

    ## Kryteria sukcesu

    Plan jest udany, jeżeli:

    - `buildAndAttachMesh()` nie kumuluje się już masowo w jednej klatce;
    - hitch count wyraźnie spada;
    - average hitch spada;
    - maximum hitch spada lub przynajmniej nie pogarsza się;
    - streaming pozostaje wizualnie wystarczająco szybki;
    - nie ma regresji lifecycle/cancellation/unload;
    - zmiana pozostaje mała i wykorzystuje istniejący chunk pipeline.

    Jeżeli pojedynczy `buildAndAttachMesh()` nadal powoduje duży pojedynczy hitch po rozłożeniu finalizacji, **nie rozszerzaj zakresu automatycznie**.

    Zarejestruj ten fakt jako osobny, konkretny bottleneck do kolejnego planu.

    ## Raport końcowy

    Podaj krótko:

    - **Źródło hitcha:** gdzie dokładnie kumulowała się praca;
    - **Potwierdzenie:** czy `CHUNKS_STARTED_PER_FRAME` nie ograniczał finalization stage;
    - **Rozwiązanie:** jak istniejący pipeline został dostosowany;
    - **Before → After:** `count / avg / max`;
    - **Streaming latency:** czy wizualne pojawianie się chunków pozostało wystarczająco szybkie;
    - **Kompromis:** tylko jeśli rzeczywiście wystąpił;
    - **Follow-up:** tylko jeśli pojedynczy `buildAndAttachMesh()` pozostaje niezależnym bottleneckiem.

    Nie raportuj innych bottlenecków z Review 012.
    Ten plan dotyczy wyłącznie `chunk mesh` hitching.