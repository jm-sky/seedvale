# Plan: Shader/Program First-Use Hitch

**Created:** 2026-08-17
**Status:** `in progress` 🔄 — Phase 0 closed ([review 021](../reviews/2026-08-18--021--plan-149-phase-0-real-gpu.md), [review 022](../reviews/2026-08-18--022--plan-149-program-family-dump.md)). Phase 1 B diagnostic pin **PASS** ([review 023](../reviews/2026-08-18--023--plan-149-pointlight-variant-axis.md), [review 024](../reviews/2026-08-18--024--plan-149-pointlight-budget-curve.md)). Production PointLight budget **16** landed in [plan 157](./2026-08-18--157--production-pointlight-budget.md) (do not rewrite §12). Phase 1 A (`compileAsync` loading-window prewarm) **implemented + technically verified + browser verified** ([review 025](../reviews/2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md), §19). Leftover instancing/mask (`Green`/`Wood`/`MI_WindowGlass`) is Phase C. Whole plan is **not** `done`.
**Priority:** high · **Effort:** M/L
**Depends on:** none
**domain:** `world-terrain`
**tags:** `performance`, `rendering`, `streaming`

---

## 1. Cel

Usunąć lub istotnie ograniczyć wielosetmilisekundowy **first-use shader/program hitch** pojawiający się podczas streamingu chunków, bez pogorszenia:

- normalnego renderingu,
- visual correctness,
- jakości odbicia wody,
- chunk attach/build,
- streamingu i unload/reload,
- pamięci i stabilności GPU.

Najważniejszą metryką nie jest średni FPS, lecz **frame max / liczba first-use hitchy podczas streamingu**.

Nie implementować tego planu przez samo przesuwanie kosztu do innego miejsca klatki.

---

## 2. Executive summary

Aktualny codebase potwierdza, że plan 119 rozwiązał wcześniejszy problem CPU-side stampede w chunk finalization: finalize ma osobny `mesh`/`content` stage, tylko jeden stage jest wykonywany na klatkę, GLB templates są preloadowane, a `attachChunkContent()` nie wykonuje `await` na wspólnej obietnicy GLB. To jednak nie eliminuje first-use GPU/driver stall.

Najmocniejszy dowód z wcześniejszych trace'ów pozostaje aktualny co do mechanizmu: przy pierwszym użyciu nowego `WebGLProgram` driver może odroczyć zakończenie linkowania, a pierwsze zapytanie WebGL wymagające wyniku programu może wykonać synchroniczny CPU↔GPU/driver wait. W trace 012 nazwanym punktem był `getProgramInfoLog()` (~545 ms z ~615 ms long task), a późniejszy eksperyment na Three.js 0.185.1 pokazał, że po wyłączeniu `checkShaderErrors` koszt nie znika — może zostać przejęty przez wcześniejsze, bezwarunkowe `ACTIVE_UNIFORMS` query (~21.6 s łącznie / 288 first-use events, max ~323.8 ms w jednym runie).

To oznacza:

```text
nie jest to przede wszystkim problem getProgramInfoLog()
nie jest to problem checkShaderErrors
nie jest to problem samego chunk mesh CPU

rzeczywisty problem:
first use WebGLProgram
→ driver musi dokończyć odroczony link/compile
→ pierwsze wymagające query synchronizuje Main Thread
```

Aktualny renderer ma `checkShaderErrors` pozostawione na domyślnym `true`; komentarz w `createRenderer.ts` dokumentuje już, że wyłączenie tego mechanizmu tylko przenosi koszt do `ACTIVE_UNIFORMS`. Wcześniejsze research docs, które mówią, że `checkShaderErrors=false` jest nadal aktywne na `main`, są więc nieaktualne względem obecnego codebase i nie mogą być traktowane jako aktualny stan.

`compileAsync()` jest dostępne w Three.js 0.185.1 i jest właściwym mechanizmem Three.js do asynchronicznego prewarmingu, ale cztery wcześniejsze warianty prewarmingu na pełnym streamingu pogorszyły benchmark i zostały całkowicie wycofane. Dlatego **nie wolno wracać do per-chunk/full-scene prewarming bez nowego, małego proofu**.

Najbezpieczniejszy kierunek po Phase 0 to sprawdzić, czy Seedvale ma mały, stabilny zbiór współdzielonych material/program families dla chunk content. Jeśli tak, możliwe jest jednorazowe przygotowanie tych wariantów **przed rozpoczęciem gameplay streamingu**, w kontrolowanym loading/initialization window, zamiast kompilowania nowych programów w momencie pojawienia się chunku.

---

## 3. Aktualny pipeline i miejsce problemu

### 3.1 Worker → chunk finalize

```text
player movement
  ↓
ChunkManager.recheck()
  ↓
loadQueue / nearest-first
  ↓
requestChunkTile()
  ↓
worker: heightmap + placements
  ↓
finalizeQueue
  ↓
1 stage / frame
```

Worker i transfer nie są obecnie głównym kandydatem na 100–800 ms hitch.

### 3.2 Mesh stage

`src/terrain/chunkManager.ts`:

```text
attachChunkMesh()
  ├─ buildAndAttachMesh()
  ├─ createChunkWater()
  ├─ state = ready
  └─ ensure grass
```

`buildAndAttachMesh()` pozostaje potencjalnie ciężkim CPU operation (~kilkadziesiąt ms przy Insane 193), ale nie wyjaśnia wcześniejszych 500+ ms WebGL waits.

### 3.3 Content stage

```text
attachChunkContent()
  ├─ vegetationRegionBatcher
  ├─ items
  ├─ environment
  └─ rebuildColliders()
```

Plan 119 usunął `await` w tej ścieżce i korzysta z `peek()` na wcześniej rozpoczętych template loads. To jest istotne: nie należy ponownie łączyć shader investigation z wcześniejszym GLB promise stampede.

### 3.4 Render

Po symulacji i streamingu:

```text
renderer.info.reset()
  ↓
ocean.renderMirror()
  ↓
shadow update
  ↓
postProcessing.render()
  ↓
labelRenderer.render()
```

Mirror i post-processing są oddzielnymi render calls. `waterMirror.ts` ustawia własny `WebGLRenderTarget`, wykonuje `renderer.render(scene, mirrorCamera)`, a następnie przywraca poprzedni target.

EffectComposer również renderuje scene do offscreen targets. Dlatego wcześniejsza hipoteza, że mirror i beauty pass **zawsze** muszą mieć dwa różne program cache variants tylko dlatego, że jeden jest mirror, a drugi jest canvas, jest niezgodna z aktualnym pipeline. Ta część research 015 jest nieaktualna. W Phase 0 trzeba zmierzyć faktyczne warianty, zamiast zakładać ich liczbę.

---

## 4. Root-cause analysis

### 4.1 Co jest potwierdzone

**A. Hitch jest związany z pierwszym użyciem programu.**

Trace 012 pokazał:

```text
WebGLRenderer.render()
  → getProgramInfoLog()
  → ~545 ms synchronous wait
```

Perfetto pokazało niezależnie `kLinkProgram` + długie `gpu_toplevel` waits przy jednoczesnej bezczynności Main Thread/GPU decoder. To jest zgodne z synchronicznym driver wait.

**B. `checkShaderErrors` nie jest rozwiązaniem.**

W Three.js 0.185.1 `onFirstUse()` wykonuje bezwarunkowo zapytania dotyczące programu, w tym `ACTIVE_UNIFORMS` i `ACTIVE_ATTRIBUTES`. `LINK_STATUS`/`VALIDATE_STATUS` oraz info logs są dodatkowo zależne od `checkShaderErrors`.

W diagnostycznym pomiarze przy `checkShaderErrors=false`:

```text
ACTIVE_UNIFORMS      288 events   21,603.4 ms total   323.8 ms max
ACTIVE_ATTRIBUTES    288 events        0.8 ms total     0.1 ms max
LINK_STATUS            0 events
COMPLETION_STATUS_KHR  0 events
```

Wniosek: wyłączenie checków nie usuwa underlying first-use link wait.

**C. `compileAsync()` jest obecnie nieużywane.**

Aktualny codebase nie wywołuje `renderer.compileAsync()`. `COMPLETION_STATUS_KHR` nie jest więc obecnie używany przez Seedvale.

**D. Plan 119 już ogranicza CPU finalization.**

Aktualny `ChunkManager` ma `mesh`/`content` stages, nearest-first selection, jeden finalize stage na gameplay frame oraz preload templateów. Nie należy ponownie projektować stream scheduler tylko dlatego, że hitch nadal występuje.

### 4.2 Co nadal nie jest dostatecznie udowodnione

Nie mamy jeszcze aktualnego, produkcyjnego censusu:

- ile `THREE.Material` objects faktycznie występuje podczas `stream`,
- ile `WebGLProgram` objects tworzy renderer,
- ile programów jest first-used po każdym chunk finalize,
- które material/program families są odpowiedzialne za największe waits,
- czy pierwszy stall jest związany głównie z jednym materiałem/programem, czy z dużym burstem nowych variants,
- czy wszystkie streamed chunk materials są stabilnie współdzielone.

To jest najważniejsza luka przed implementacją.

### 4.3 Obecne oznaki dobrej konsolidacji

Codebase już posiada kilka ważnych mechanizmów ograniczających proliferację:

- terrain używa **jednego współdzielonego `MeshStandardMaterial` na cały `ChunkManager`**;
- weather surface używa współdzielonych uniforms zamiast per-chunk material clones;
- GLTF loader cache'uje assety po URL;
- przygotowane GLTF geometry/material są oznaczane jako `sharedGpu`;
- chunk vegetation/environment używa wspólnych templateów i region batchingu;
- plan 143 ograniczył draw submissions, ale nie powinien być traktowany jako rozwiązanie shader hitcha.

Dlatego najpierw trzeba sprawdzić, czy problemem jest rzeczywiście proliferacja programów, czy raczej koszt pierwszego linku nawet dla niewielkiej liczby programów.

---

## 5. Co pokazały wcześniejsze eksperymenty

### `compileAsync()`

Cztery warianty zostały wykonane na Three.js 0.185.1 i wszystkie pogorszyły wynik względem baseline.

| Wariant | Wynik | Wniosek |
|---|---|---|
| v1 full-scene co tick | max 1637 ms, FPS 24.9 vs 45.5 | niedopuszczalny CPU overhead `compile()` traversal |
| v2 scoped + accumulating queue | max 9805 ms, FPS 13.6 | backlog flush może tworzyć synchroniczny burst |
| v3 max 4 roots | max nadal 9805 ms, FPS 33.4 | samo capowanie batcha nie rozwiązuje problemu; pojawiły się GL errors |
| v4 layer-filtered | max 4829.8 ms, FPS 3.3, WATER 209.4 ms/frame | potencjalna interferencja ze stanem/program cache; nie kontynuować bez izolacji |

Wszystkie zmiany zostały wycofane.

**Wniosek:** nie wdrażać `compileAsync()` w obecnej formie per-chunk/per-root/full-scene. Sam mechanizm Three.js pozostaje potencjalnie użyteczny, ale tylko po udowodnieniu małego, kontrolowanego zastosowania.

### `checkShaderErrors`

Eksperyment był wartościowy diagnostycznie, ale nie jako fix. `false` zmieniło punkt obserwowanego waita, a nie usunęło jego przyczynę. Aktualny renderer zostawia `checkShaderErrors` włączone.

### Stream isolation

Research 018 pokazał, że wyłączenie mirror nie usuwa first-use max frame: przy `mirror-off` nadal wystąpił frame 324.5 ms. Oznacza to, że mirror jest **miejscem, które często płaci koszt jako pierwszy render call**, a nie jedyną możliwą przyczyną samego programu first-use stall.

Post-off również nie usuwa max frame. `water-off` dał nawet 913.4 ms, co potwierdza, że wcześniejszy `hitches` list jest niewystarczającym źródłem do diagnozy tych frame spikes.

---

## 6. Odrzucone rozwiązania

### 6.1 `checkShaderErrors=false` jako final fix — ODRZUCONE

Nie usuwa underlying wait. Ukrywa też realne shader errors. Aktualny codebase poprawnie pozostawia default `true`.

### 6.2 `compileAsync()` per chunk / per root — ODRZUCONE

Cztery warianty już regresowały streaming i rendering. Nie powtarzać bez minimalnego repro wyjaśniającego GL errors / renderer-state interference.

### 6.3 Full-scene `compileAsync()` co tick — ODRZUCONE

Udowodniony koszt synchronicznego traversal i brak związku z kontrolowanym first-use prewarming.

### 6.4 Przeniesienie hitcha do `chunkManager.update()` — ODRZUCONE

Jeżeli przygotowanie shaderów jest wykonywane synchronicznie w momencie attachu, zmienia tylko etykietę/miejsce waita. Nie rozwiązuje problemu latency.

### 6.5 Wyłączanie mirror / postprocess jako rozwiązanie — ODRZUCONE

Isolation probes pokazały, że first-use hitch może zostać przejęty przez inny render pass. Dodatkowo byłaby to regresja wizualna.

### 6.6 Globalna przebudowa renderera / WebGPU — ODRZUCONE

Brak dowodu, że architektura WebGL jest niewystarczająca. Problem jest w konkretnym first-use lifecycle programu.

### 6.7 Zmiana terrain resolution / worker pipeline — ODRZUCONE

Nie dotyka potwierdzonego WebGL first-use wait.

---

## 7. Porównanie możliwych rozwiązań

| Rozwiązanie | Mechanizm | Benefit | CPU | GPU | Memory | Ryzyko | Streaming | Visual | Effort |
|---|---|---|---|---|---|---|---|---|---|
| **A. Loading-time program prewarm** | przygotować tylko potwierdzone material/program families przed gameplay | potencjalnie bardzo duży | średni jednorazowo | wcześniejszy compile/link | mały/średni | **M** | bardzo dobry po starcie | bardzo dobry, jeśli wariant identyczny | M/L |
| **B. Program/material consolidation** | zmniejszyć liczbę unikalnych program variants/material states | duży, jeśli census pokaże proliferację | mały/średni | mniej programów | mały | M | dobry | wymaga dokładnego porównania | M/L |
| **C. Dynamic per-chunk prewarm przez `compileAsync()`** | przygotowywać każdy nowy chunk przed renderem | teoretycznie duży | wysoki | wcześniejszy compile | mały/średni | **H** | ryzyko backlogów | średnie | L |
| **D. Time-slicing program preparation** | rozkładać przygotowanie programów na wiele idle frames | średni | średni | wcześniejszy compile | mały | M/H | dobry, ale trudny | dobry | L |
| **E. Render-pass-specific variant elimination** | zmniejszyć liczbę cache variants między passami | potencjalnie bardzo duży | mały | mniej linków | mały | **H** | dobry | wysokie ryzyko | L/XL |
| **F. Disable shader diagnostics** | pominąć część query | brak realnej redukcji underlying wait | mały | brak | brak | H | brak | brak | S |

### Wstępny wybór

**A** jest preferowane jako Phase 1, ale tylko jeśli Phase 0 potwierdzi, że większość first-use programów można przygotować z małego, stabilnego zestawu współdzielonych materiałów.

Jeżeli Phase 0 pokaże dużą liczbę realnie różnych variants, pierwszym kandydatem staje się **B**, a nie A.

---

## 8. Rekomendowane rozwiązanie

### Phase 0 — instrumentation / proof

Nie zmieniać zachowania renderera.

Dodać minimalną, tymczasową instrumentację browser-only/dev-only, która podczas `?benchmark=stream` zbierze:

1. **Frame hitch attribution**
   - `renderMirror()` duration,
   - `postProcessing.render()` duration,
   - pełny frame duration,
   - first-use frame timestamps.
2. **Program census**
   - `renderer.info.programs.length` po frame,
   - delta liczby programów względem poprzedniego frame,
   - liczba programów po settle.
3. **Material census**
   - liczba unikalnych material UUID w scene,
   - liczba unikalnych material UUID w newly attached chunk roots,
   - rozbicie przynajmniej na terrain / vegetation / environment / items, jeśli istnieją już stabilne granice.
4. **First-use correlation**
   - moment chunk `mesh`/`content` attach,
   - następny mirror render,
   - następny postprocessing render,
   - program-count delta.
5. **WebGL query proof**, jeśli bezpiecznie możliwe w krótkim eksperymencie:
   - policzyć/zmierzyć `ACTIVE_UNIFORMS`, `ACTIVE_ATTRIBUTES`, `LINK_STATUS` tylko w osobnym diagnostycznym buildzie;
   - nie zostawiać patcha w `node_modules` ani produkcyjnym kodzie.

### Warunek zakończenia Phase 0

Musi być odpowiedź na:

> Czy first-use hitch jest powodowany głównie przez małą liczbę ciężkich programów, czy przez dużą liczbę nowych program variants wchodzących podczas streamingu?

oraz:

> Czy wszystkie program families używane przez streamed chunk content mogą być przygotowane wcześniej z istniejących shared materials/templates?

Jeśli nie — **nie implementować Phase 1 A**. Przygotować mały dodatkowy repro tylko dla brakującego przypadku.

### Real-GPU gate

Jeżeli Phase 0 instrumentation ma identyfikować rzeczywiste first-use program hitches, finalne wnioski z Phase 0 muszą być potwierdzone w Cursor browser na hardware WebGL.

`agent-browser` może służyć do sprawdzenia, czy instrumentacja działa technicznie, ale nie może być źródłem prawdy dla:
- GPU/driver waits,
- shader compile/link timing,
- frame hitch duration,
- GPU frame time,
- FPS.

Jeżeli wyniki headless i real-GPU różnią się, priorytet ma real-GPU benchmark.

---

## 9. Phase 1 — minimal safe fix

### Preferred: loading-time prewarm istniejących shared program families

Jeżeli Phase 0 potwierdzi stabilny zbiór program families:

1. Wykorzystać istniejące Three.js `renderer.compileAsync()`.
2. Nie wywoływać go z `ChunkManager.update()`.
3. Nie uruchamiać go per chunk.
4. Nie uruchamiać go co tick.
5. Nie kompilować całego live scene tylko dlatego, że jest łatwo dostępne.
6. Zbudować mały staging set z **istniejących shared materials/templates**, reprezentujący tylko program families, które rzeczywiście mogą pojawić się na streamed chunk content.
7. Przygotować dokładnie ten sam renderer state / render-target context, który ma znaczenie dla programu first-use.
8. Uruchomić prewarm podczas kontrolowanego loading/initialization window, zanim rozpocznie się normalny gameplay streaming.
9. Poczekać na zakończenie tylko w loading/initialization flow — nigdy w gameplay frame.
10. Po zakończeniu usunąć staging objects bez dotykania shared geometry/material ownership.
11. Nie zmieniać `ChunkManager` scheduling, worker protocol ani render-pass order.

### Ważne ograniczenie

Nie zakładać, że staging material automatycznie reprezentuje każdy realny variant. Program key może zależeć m.in. od:

- material type,
- textures/defines,
- instancing,
- skinning/morphing,
- fog,
- lights/shadows,
- alpha/side settings,
- renderer state,
- render target/output state.

Dlatego Phase 0 musi najpierw zidentyfikować rzeczywiste families.

### Expected benefit

Jeżeli wszystkie relevant first-use programs zostaną przygotowane przed gameplay:

```text
chunk attach
→ scene becomes visible
→ render
→ program already linked/initialized
→ brak wieluset-ms first-use wait
```

### CPU/GPU/memory

- CPU: jednorazowy koszt podczas loadingu; potencjalnie wyższy czas initial loading.
- GPU: shader compile/link przesunięty przed gameplay; brak redukcji samego kosztu GPU compile.
- Memory: program cache pozostaje zajęty przez przygotowane programy; nie powinno tworzyć dodatkowych trwałych material clones.
- Streaming: brak zmian w worker/finalize scheduling.
- Visual: powinien pozostać identyczny, jeśli program key jest identyczny.

### Ryzyko

**M**, głównie przez niepełne pokrycie variants i różnice w renderer state. Nie akceptować implementacji, jeśli prewarm tworzy dodatkowe GL errors, program-cache churn lub wzrost normalnego frame time.

---

## 10. Phase 2 — optional optimization

Uruchomić tylko po pozytywnym Phase 1.

Możliwe kierunki, zależnie od danych:

### 10.1 Program/material consolidation

Jeżeli Phase 0 pokaże nadmiar variants:

- zidentyfikować konkretne material state differences,
- sprawdzić, które są faktycznie potrzebne wizualnie,
- konsolidować tylko warianty mające identyczny visual contract,
- nie zmieniać materiałów GLTF na siłę,
- benchmarkować każdy merge osobno.

**Nie robić globalnego "one material for everything".**

### 10.2 Idle/time-sliced prewarm

Jeżeli część programów pojawia się dopiero w późniejszych, rzadkich chunkach:

- utrzymywać małą kolejkę program families,
- wykonywać tylko ograniczoną liczbę przygotowań poza latency-critical streaming,
- nigdy nie pozwolić na nieograniczony backlog flush,
- nigdy nie blokować chunk attach na Promise.

To jest opcja dopiero po zrozumieniu, dlaczego wcześniejsze v2/v3/v4 pogarszały renderer.

### 10.3 Mirror/pass investigation

Tylko jeśli Phase 0 wykaże, że konkretny render pass tworzy niepotrzebne dodatkowe variants. Nie zakładać tego na podstawie starej hipotezy o canvas-vs-mirror color space.

---

## 11. Dokładne miejsca zmian

### Phase 0

Preferowane miejsca:

- `src/app/gameLoop.ts`
  - istniejące granice `renderMirror()` i `postProcessing.render()` są naturalnymi punktami pomiaru;
- `src/perf/monitor.ts`
  - tylko jeśli można dodać generic frame/render attribution bez zmiany zachowania benchmarku;
- `src/terrain/chunkManager.ts`
  - istniejące `attachChunkMesh` / `attachChunkContent` są naturalnymi event points;
- ewentualnie mały tymczasowy diagnostics module w `src/perf/`.

Nie modyfikować Three.js source w repo.

### Phase 1

Prawdopodobne miejsca po potwierdzeniu Phase 0:

- `src/render/createRenderer.ts` — ewentualny helper/API dla prewarmingu;
- `src/world/waterMirror.ts` — tylko jeśli staging/prewarm musi użyć dokładnego mirror render-target state;
- istniejący startup/loading flow w `src/app/createApp.ts` — miejsce uruchomienia prewarmingu przed gameplay streaming;
- ewentualnie mały nowy moduł `src/render/` dla programu prewarmingu, jeśli odpowiedzialność będzie wyraźnie oddzielona.

`src/terrain/chunkManager.ts` powinien pozostać bez zmian w Phase 1, chyba że Phase 0 udowodni, że obecny lifecycle nie pozwala przygotować materiałów wcześniej.

---

## 12. Risk & rollback strategy

### Rollback rules

Każdy etap jest osobnym eksperymentem.

- Phase 0: usunąć instrumentację bez zmiany runtime behaviour.
- Phase 1: jeden commit/PR dotyczący wyłącznie prewarmingu.
- Phase 2: osobny commit/PR per optimization.

Nie łączyć:

```text
prewarm
+ material consolidation
+ stream scheduler changes
+ mirror changes
```

w jednym kroku.

### Immediate rollback triggers

Wycofać zmianę, jeśli wystąpi którekolwiek z poniższych:

- first-use hitch nie spada,
- hitch zostaje tylko przesunięty do loading/gameplay transition,
- pojawiają się nowe `GL_INVALID_OPERATION`,
- program count rośnie bez uzasadnienia,
- draw calls rosną bez visual benefit,
- normal frame p50/p95 się pogarsza,
- visual regression,
- chunk content pojawia się za późno,
- chunk unload/reload powoduje artefakty,
- memory/GPU resource usage rośnie bez potrzeby.

---

## 13. Verification / benchmark plan

### Environment

Powtórzyć istniejący benchmark:

```text
?benchmark=stream&seed=42&res=193
quality=High
pixelRatio=1
```

Każdy first-use test musi zaczynać się od **page reload**, aby cache programów z poprzedniej sesji nie maskował problemu.

Dla ważnych wyników wykonać minimum 3 powtórzenia. Różnice kilku ms traktować jako noise, zgodnie z research 018.

### BEFORE / AFTER

Minimum:

- frame p50,
- frame p95,
- frame max,
- liczba frame hitchy >= 8 ms,
- liczba first-use hitchy,
- maksymalny first-use hitch,
- `RENDER` p50/p95/max,
- `WATER`/mirror p50/p95/max,
- draw calls avg/max,
- triangles avg/max,
- loaded chunks,
- `renderer.info.programs.length`,
- material count,
- geometries/textures,
- JS heap / GC, jeśli dostępne,
- GPU memory indicator, jeśli browser udostępnia wiarygodny pomiar.

### Browser visual verification

Sprawdzić ręcznie:

1. start świata / loading,
2. pierwszy ruch po świecie,
3. szybki sprint przez granice chunków,
4. teleport / duży skok pozycji, jeśli benchmark/debug to umożliwia,
5. las,
6. osada,
7. woda i odbicia,
8. noc/dzień,
9. weather/grass,
10. unload → reload tego samego obszaru.

Sprawdzić szczególnie:

- brak brakujących materiałów,
- brak czarnych/niezainicjalizowanych meshów,
- brak flickeru pierwszej klatki,
- brak różnicy w alpha-test foliage,
- brak różnicy w terrain/weather shaderze,
- brak artefaktów mirror,
- brak opóźnionego pojawiania się vegetation/environment.

### Streaming verification

Potwierdzić:

- worker nadal generuje tile poza Main Thread,
- load queue nadal nearest-first,
- finalize nadal max 1 stage/gameplay frame,
- mesh stage nie czeka na content stage,
- content stage nie tworzy async stampede,
- unload nie zostawia pending content/prewarm references,
- `waitForChunks` nadal oznacza pełne settled state.

---

## 14. Success criteria

Problem uznajemy za rozwiązany dopiero, gdy wszystkie poniższe są spełnione:

### Hitch

- brak reprodukowalnych 500+ ms first-use frame hitchy w `stream`,
- docelowo brak 100+ ms first-use hitchów w reprezentatywnym scenariuszu,
- `frame max` wyraźnie spada względem świeżego baseline,
- poprawa jest widoczna po **cold page reload**, nie tylko na warm cache.

### Normal rendering

- frame p50 nie pogarsza się istotnie,
- frame p95 nie pogarsza się,
- draw calls nie rosną bez uzasadnienia,
- triangles nie rosną bez uzasadnienia,
- program/material count nie rośnie bez uzasadnienia.

### Streaming

- brak regresji chunk load latency poza świadomym loading-time prewarm,
- brak chunk content pop-in ponad obecny baseline,
- brak unload/reload regression,
- brak nowych streaming hitches.

### Visual correctness

- brak shader/material errors,
- brak GL_INVALID_OPERATION,
- brak różnicy w terrain/vegetation/water/reflection/postprocessing,
- brak artefaktów po zmianie jakości/render state.

### Stability

- brak wzrostu JS heap/GC, który kompensuje zysk,
- brak niekontrolowanego wzrostu GPU resources,
- brak renderer-state corruption.

---

## 15. Open questions przed Phase 1

Jeżeli Phase 0 nie odpowie na poniższe pytania, zatrzymać implementację:

1. Ile programów jest first-used w pierwszych sekundach `stream`?
2. Ile z nich pochodzi z chunk content, a ile z postprocessing/other systems?
3. Czy first-use program count rośnie przy każdym nowym chunku, czy głównie przy pierwszym pojawieniu się danego asset/material family?
4. Czy wszystkie chunk GLTF materials są współdzielone przez cache po URL, tak jak sugeruje aktualny `loadGltf.ts`?
5. Czy terrain pozostaje jednym program/material family mimo zmian weather uniforms?
6. Czy mirror i EffectComposer rzeczywiście używają tego samego programu dla tych samych materiałów w aktualnym 0.185.1 pipeline?
7. Czy staging prewarm może odtworzyć wszystkie istotne program parameters bez dodawania sztucznych variants?
8. Czy `KHR_parallel_shader_compile` jest dostępne w docelowym browserze testowym?

Jeśli odpowiedź na 7 jest „nie”, **nie wdrażać loading-time prewarm jako pewnego rozwiązania** — przygotować minimalny repro dla konkretnego brakującego wariantu.

---

## 16. Source of truth / documents

Przeczytane i wykorzystane:

- `docs/performance/README.md`
- `docs/STATE.md`
- `docs/plans/2026-08-15--119--chunk-streaming-performance.md`
- `docs/research/2026-08-16--011--streaming-hitch-investigation.md`
- `docs/research/2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md`
- `docs/research/2026-08-17--018--stream-isolation-probes.md`
- `docs/reviews/2026-08-15--015--browser-performance-benchmark.md`
- `docs/research/2026-08-17--014--compileasync-prewarming-ab-experiment-results.md`
- `docs/research/2026-08-17--015--streaming-hitch-gl-errors-handoff.md`

Aktualny codebase zweryfikowany szczególnie w:

- `src/terrain/chunkManager.ts`
- `src/render/createRenderer.ts`
- `src/world/waterMirror.ts`
- `src/app/gameLoop.ts`
- `src/render/createPostProcessing.ts`
- `src/terrain/buildChunkGeometry.ts`
- `src/assets/loadGltf.ts`
- `src/settlement/props.ts`
- `src/perf/monitor.ts`
- `package.json`

Aktualny `package.json` wskazuje `three: ^0.185.1`, a repozytorium ma kod zgodny z Three.js 0.185.1. Dokumenty mówiące o 0.180.0 lub o aktywnym `checkShaderErrors=false` należy traktować jako historyczne, jeśli stoją w sprzeczności z aktualnym kodem.

---

## 17. Final recommendation

Phase 0 + PointLight pin (plan 157) + Phase 1 A loading-window `compileAsync` are landed. Streaming first-use bursts on the light-count axis are gone; remaining named copies (`Green` / `MI_WindowGlass` / `Wood`) are Phase C. Do not revive per-chunk / per-tick / full-scene `compileAsync`.

## 18. Verification ownership

### Claude Code / agent-browser

Claude Code może wykonać:
- analizę codebase,
- implementację Phase 0 instrumentation,
- unit/type/build checks,
- lokalne testy,
- przygotowanie danych diagnostycznych.

`agent-browser` używa headless Chrome bez gwarancji realnego GPU rendering, dlatego **nie traktować jego wyników FPS/GPU/frame-time jako wiarygodnego benchmarku tego problemu**.

### Cursor browser

Real-GPU benchmark i visual verification muszą być wykonane w Cursor embedded browser z potwierdzonym hardware WebGL renderer.

Przed benchmarkiem potwierdzić `WEBGL_debug_renderer_info` i zapisać renderer string.

Claude Code nie powinien uznawać 149 za `done` na podstawie benchmarku wykonanego wyłącznie przez `agent-browser`.

---

## 19. Phase 1 A — loading-window `compileAsync` (2026-08-19)

**Status:** implemented + technically verified + real-GPU/browser verified. Plan 149 stays `in progress` (Phase C / Phase 2 open).

### What landed

- New `src/render/programPrewarm.ts`: one-shot staging set from the already-built live scene (home chunks + settlement + fauna + ocean/sky), **one clone per `(material.uuid × object flags)`**, sharing geometry/material by reference.
- `renderer.compileAsync(staging, camera, liveScene)` runs in the loading window in `createApp.ts` **after** `gameLoop.resyncDayNight()` + `pointLightBudget.sync(camera)`, **before** the rAF loop and `loadingScreen.hide()`. Same call after `rebuildWorldBundle`.
- A 1×1 throwaway `WebGLRenderTarget` is bound only for that call so program keys match gameplay (`toneMapping = NoToneMapping`, `outputColorSpace = workingColorSpace` — Three.js 0.185.1 `WebGLPrograms.getParameters` when `getRenderTarget() !== null`). Default-framebuffer compile would create unused ACES/sRGB variants. Mirror and postprocess modules are not modified.
- Staging clones are never added to the scene graph and are dropped without disposing shared GPU resources.
- Not in `ChunkManager`, not per chunk / per tick / per root, not a full-live-scene `compileAsync(scene, camera)` shortcut, no PointLight budget change.

Diagnostics (dev side-channel, no gameplay cost): `window.__seedvaleProgramPrewarm` — staging roots/materials, program count before/after, `compileAsync` ms, `glError`, KHR flag.

### Staging set (measured)

Home-scene walk after `waitForChunks(home)` + settlement/fauna build. Unique program families after compile: **30–33**. Staging root count is high (**459–558** / **454–544** materials) because house-builder/GLTF clones still have distinct material UUIDs; they collapse to those ~33 cache keys. That is a loading-time traverse, not extra live programs.

First `gameLoop.tick()` still runs synchronously before `loadingScreen.hide()`, so remaining frame-0 first-use (shadow depth + EffectComposer, plus `onFirstUse`/`ACTIVE_UNIFORMS` of the already-linked 30–33) stays behind the loading overlay.

### Limitations (not this phase)

- `compileAsync` links programs; it does **not** call `getUniforms()` / `onFirstUse`. First draw of the prewarmed set can still cost ~180–420 ms on frame-0 **mirror with `programDelta = 0`**, behind the overlay.
- ~26–27 frame-0 programs are MeshDepthMaterial / composer ShaderMaterials — not in the scene-graph staging set.
- Instancing/mask copies `Green` 5 / `MI_WindowGlass` 4 / `Wood` 2 remain (Phase C). Do not merge them here.

### Technical checks

`npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1143 tests, +7 in `programPrewarm.test.ts`) — green.

### Real-GPU verification

Cursor IDE browser + CDP, hardware WebGL. GPU: `ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)` via `WEBGL_debug_renderer_info` — **not** SwiftShader. `KHR_parallel_shader_compile`: available. Viewport `1068×906`, `deviceScaleFactor=1`, reports `pixelRatio=1`, `quality: High`, `seed=42`, `res=193`. Fresh origin `:5610`. Three cold reloads. Do **not** rank mean FPS. Run 3 was hitch-starved (tab `document.hidden`, 75 census frames) — keep it for the hitch axis, do not median into RENDER/p95. Full table: [review 025](../reviews/2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md).

Before = plan 157 §12 production budget 16, no prewarm (hitch-starved stream runs; use for program-axis / first-use hitch, not as a healthy RENDER sample).

| Metric | Before (157 R1–R3) | After R1 | After R2 | After R3 (starved) |
|---|---|---:|---:|---:|
| unique cacheKeys | 65–66 | 68 | 67 | 65 |
| `npl` on physical | 16 only | 16 only | 16 only | 16 only |
| `compileAsync` | unused | 223 ms, 33 programs | 206 ms, 30 | 135 ms, 33 |
| `glError` | — | 0 | 0 | 0 |
| max first-use hitch (`Δ>0`) | 726 / 320 / 382 ms | **407 ms** (frame 0 post) | **206 ms** | **299 ms** |
| max hitch after frame 0 (`Δ>0`) | 353 / 316 / 382 ms | **65 ms** | **99.5 ms** | **69.5 ms** |
| hitch ≥100 / ≥500 (`Δ>0`) | 5/2 · 5/0 · 6/0 | **1 / 0** | **1 / 0** | **1 / 0** |
| frame max (report) | — (starved) | 199.9 | 111.8 | 143.1 |
| frame p95 | 200.8 / 150.9 / 167.2 (starved) | 93.6 | **49.5** | 124.2 |
| RENDER / WATER | 36–39 / — | 33.7 / 4.5 | **14.5 / 2.3** | 35 / 5 |
| draw calls avg | — | 681 | 623 | 573 |
| triangles avg | — | 9.34M | 8.60M | 7.53M |
| `Green` / glass / `Wood` | 5 / 4 / 1 | 5 / 4 / 2 | 5 / 4 / 2 | 5 / 4 / 2 |

Visual (runs 1 and 3): morning/late-morning home settlement (`Osada Brzozowa`), terrain, mixed foliage, shadows, labels, no black materials, no missing vegetation.

### Decision

Keep Phase 1 A. Streaming first-use hitch dropped from multi-hundred ms after frame 0 to **<100 ms**. Residual frame-0 cost is controlled loading-time (overlay still up). Program count did not grow. No GL errors. Next: Phase C (instancing/mask families), not another `compileAsync` layer.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
