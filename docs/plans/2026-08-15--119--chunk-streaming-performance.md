# Plan: Chunk Streaming Performance

**Created:** 2026-08-15
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** 112
**domain:** `world-terrain`

Related: [review 012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md), [review 015](../reviews/2026-08-15--015--browser-performance-benchmark.md), [review 013](../reviews/2026-08-15--013--architecture-and-performance-audit.md), [review 016](../reviews/2026-08-15--016--gpu-fix-runtime-verification.md), [plan 112](./2026-08-14--112--chunk-streaming-hitch-optimization.md).

Nie implementować w tej sesji — tylko ten plan.

---

### 1. Problem

Średni FPS jest dobry; problemem są **sporadyczne wieloset-milisekundowe / sekundowe klatki** przy ładowaniu chunków.

Review 015 (`?benchmark=*`, High, seed 42, Insane 193, loadRadius 3):

| Scenario | FPS avg | Frame p95 | Frame max | `hitches` |
|---|---:|---:|---:|---|
| forest | 81.4 | 16.5 | **1816 ms** | puste |
| water | 61.8 | 25.5 | **375 ms** | puste |
| stress | 90.4 | 17.0 | 43.5 | puste |
| settlement | 48.5 | 31.1 | 46.8 | puste |

015 nie uruchomiło `stream`. Hitchy nie dostały etykiety `STREAMING`.

Review 010 (ręczny sprint) i review 012 (`stream`: 48× `chunk mesh`, avg 29.9, max 53.6 ms) pokazały, że przy ruchu koszt siedzi w finalizacji mesha. Plan 112 rozłożył **start** `buildAndAttachMesh` na 1/klatkę — to jest w kodzie, bez browser verification.

`?benchmark=stream` w sesji planu 119 (embedded Cursor, wolniejszy niż 012/015 — FPS avg 7.7; liczby bezwzględne nie są nowym baseline’em, etykiety hitchy są):

| Label | count | avg | max |
|---|---:|---:|---:|
| `chunk vegetation glb` | 20 | 161 ms | **544 ms** |
| `chunk mesh` | 43 | 58.6 ms | 124.5 ms |
| `chunk water` | 3 | 10.2 ms | 12.2 ms |
| `grass generation` | 1 | 8.3 ms | 8.3 ms |

Frame max **613 ms**. TERRAIN avg 47.9 ms (sync mesh w `update()`). To jest dowód, że 1-finalize-start/klatkę **nie** usuwa wieloset-ms klatek.

---

### 2. Root cause

Dwie współpracujące dziury w **tym samym** `attachGeneratedChunk`. Worker i transfer **nie** są głównym blokowaniem main thread.

#### A. Stampede po `await` GLB (główny wieloset-ms hitch)

`src/terrain/chunkManager.ts`:

1. `drainFinalizeQueue(CHUNKS_FINALIZED_PER_FRAME)` (`= 1`) woła `void runFinalize(rec)` — **nie czeka**.
2. `runFinalize` → `attachGeneratedChunk`.
3. Sync na main thread, w tej samej klatce co `update()`:
   - `buildAndAttachMesh` → `buildChunkGeometry` (`src/terrain/buildChunkGeometry.ts`) — `PlaneGeometry` Insane 193² + pętla vertex (pozycja, normale, kolor). Review 012: ~30 ms; ten `stream`: avg 58.6 / max 124.5.
   - `createChunkWater` (`src/world/createWater.ts`) — tanie (3 hitchy ~10 ms).
   - `syncGrassForRecord` tylko **startuje** job workera, nie czeka.
4. Potem, jeśli `tile.vegetation.length > 0`:

```ts
const glbT0 = performance.now()
const [treeTemplates, bushTemplates, cactusTemplates, reedTemplates] = await Promise.all([
  getTreeTemplates(), getBushTemplates(), getCactusTemplates(), getReedTemplates(),
])
getMonitor().recordHitch('STREAMING', performance.now() - glbT0, 'chunk vegetation glb')
```

`getTreeTemplates` itd. to `memoTemplates` → jedna obietnica na proces, `loadPropTemplates` (`src/settlement/props.ts`) → `GLTFLoader.loadAsync` (`src/assets/loadGltf.ts`) dla 14 URL-i (6 drzew + 5 krzaków + 2 kaktusy + 1 trzcina). Parse GLB + `prepareProp` + `patchFoliageWindOnObject` jest **na main thread**.

Plan 112 ogranicza tylko **ile finalize się zaczyna** w `update()`. Po pierwszym `await` funkcja yielduje. Kolejne klatki startują kolejne `attachGeneratedChunk`. Wiele chunków parkuje na **tej samej** memoizowanej obietnicy GLB.

Gdy obietnica się rozwiąże, **wszystkie** kontynuacje wracają jako mikrotaski w jednym ticku: instancing drzew/krzaków (`buildInstancedProps`), potem drugi `await` na skały/kłody, potem environment + `rebuildColliders`. Limit 1/klatkę tego nie obejmuje.

`recordHitch(..., 'chunk vegetation glb')` mierzy **wall-clock await**, więc 20 hitchy avg 161 ms to też czas czekania wielu waiterów na jeden load — ale frame max 613 ms potwierdza realny sync burst w klatce, w której parse się kończy i wszystkie kontynuacje lecą razem.

To jest dokładnie luka z review 013 pkt 4, zmierzona.

Dlaczego `stream` to pokazuje, a `forest`/`water` w 015 mają puste `hitches`: te scenariusze robią `waitForChunks` + 1 s settle **przed** `beginSession`. GLB/mesh dzieje się poza pomiarem. `forest` max 1816 ms przy TERRAIN ≈ 0 w raporcie 015 to najpewniej GPU compile/upload albo GC **po** pojawieniu się geometrii, albo stampede, który przecieknie w okno pomiaru bez etykiety, jeśli timer await spadł poniżej 8 ms (cache już warm). Nie da się tego rozdzielić bez jednej diagnostyki (poniżej) — nie blokuje implementacji A+B, bo `stream` już pokazuje A.

#### B. Pojedynczy `buildAndAttachMesh` nadal jest hitch em (plan 112 follow-up)

Insane 193: ~37 k wierzchołków, alokacja atrybutów, `scene.add`. 1/klatkę zapobiega *sumowaniu* kilku meshy, ale jedna klatka i tak może być 30–120 ms. Plan 112 świadomie to odłożył.

Nie ruszać algorytmu heightmapy, resolution, ani nie przenosić `BufferGeometry` do workera w tym planie.

#### C. Dlaczego benchmark nie oznacza hitchy jako `STREAMING`

1. `recordHitch` zapisuje tylko operacje ≥ `HITCH_MS` (8 ms) owinięte ręcznie (`chunkManager.ts`). Długi `composer.render()` / compile shaderów / GC **nie** dostaje etykiety.
2. `chunkManager.update()` jest w `withCategory(..., 'TERRAIN')` (`src/app/gameLoop.ts`), nie `STREAMING`. Kategoria `STREAMING` w `systems{}` prawie nigdy nie istnieje — tylko tabela `hitches`.
3. Scenariusze `forest` / `water` / `stress` mierzą **stanie** po `waitForChunks`. Streaming CPU jest poza sesją → puste `hitches` mimo `frame.max` 375–1816 ms.
4. Timer `chunk vegetation glb` mierzy await wall-clock, nie czas CPU klatki — i odwrotnie, GPU stall nie trafia do `hitches`.

Nie zmieniać instrumentacji w implementacji tego planu, chyba że A+B nie wyjaśnią pozostałego `frame.max` (wtedy minimalny split: czas *po* `await` vs wall-clock await — opisać, nie robić teraz).

#### Co odpada

| Hipoteza | Werdykt |
|---|---|
| Worker heightmap na main thread | nie — `requestChunkTile` / `chunkHeightmap.worker.ts` |
| Transfer Structured Clone jako hitch ≥ 100 ms | niezmierzony; nie w `hitches` |
| Grass CPU | 1× 8.3 ms w `stream`; placement w workerze |
| Water mesh | 3× ~10 ms |
| Unload | brak hitchy ≥ 8 ms w `stream` |
| Zbyt wiele `buildAndAttachMesh` w jednej klatce | naprawione planem 112 (43 meshe / 30 s ≈ 1/klatkę) |
| Nowa architektura streamingu | niepotrzebna |

---

### 3. Current pipeline

```text
recheck() → loadQueue (nearest-first)
        ↓
drainLoadQueue()                // max 2 starts / frame
        ↓
ensureLoaded → requestChunkTile  // worker: heightmap + placements
        ↓
tile ready → finalizeQueue
        ↓
drainFinalizeQueue()            // max 1 START / frame
        ↓
attachGeneratedChunk            // fire-and-forget async
   ├─ sync: buildAndAttachMesh + createChunkWater + grass request
   ├─ await get*Templates()     // ← parkour wielu chunków na jednej obietnicy
   ├─ sync: tree lifecycle + buildInstancedProps (vegetation)
   ├─ await env GLB templates   // ten sam wzorzec
   └─ sync: environment + colliders
        ↓
scene.add / GPU upload / (później) shader compile
```

Grass: osobna kolejka niższego priorytetu na tym samym poolu; `buildGrassChunkMeshes` w `.then()` **bez** limitu/klatkę — dziś tanie.

Unload: cały pierścień w jednym `recheck()` — dziś tanie.

---

### 4. Proposed solution

Zostać przy istniejącej `finalizeQueue` + `update()`. Nie nowy scheduler, nie worker Three.js.

**Krok 1 — preload GLB poza finalize (usuwa zimny parse ze ścieżki hitcha)**

Gdy `ChunkManager` powstaje, albo gdy pierwszy kafelek z `vegetation` / GLB-env wchodzi na `loadQueue`, odpalić `getTreeTemplates()` / bush / cactus / reed / rock / fallenLog (istniejące `memoTemplates`). Nie czekać w `attachGeneratedChunk`.

**Krok 2 — rozdzielić finalize na dwa etapy w tej samej kolejce (usuwa stampede)**

Nie `await` w środku `attachGeneratedChunk`.

Etap `mesh` (1/klatkę, jak dziś):

- `buildAndAttachMesh` + water + grass request
- `state = 'ready'` (gracz stoi na terenie)
- jeśli treść (vegetation/env) potrzebna: wróć klucz na kolejkę jako etap `content`, **bez** await

Etap `content` (też 1/klatkę, nearest-first):

- jeśli szablony jeszcze nie ready: zostaw w kolejce, nie blokuj meshy
- jeśli ready: instancing vegetation + environment + `rebuildColliders` synchronicznie, jeden chunk

`drainFinalizeQueue`: w jednej klatce **albo** 1× mesh, **albo** 1× content — nie oba, dopóki benchmark nie pokaże, że 1+1 mieści się w budżecie. Start od 1 łącznie.

Gdy szablony są już w cache, etap `content` to tylko `buildInstancedProps` (review 012: vegetation < 8 ms na warm). Stampede znika, bo kontynuacje nie wracają paczką po jednym `Promise.all`.

**Krok 3 — nie ruszać pojedynczego `buildAndAttachMesh` w tym planie**, chyba że po 1+2 `stream` nadal ma `chunk mesh` max ≫ 50 ms *i* to dominuje `frame.max`. Wtedy osobny follow-up (reuse bufferów / niższy default res) — nie rozszerzać zakresu automatycznie, tak jak plan 112.

`waitForChunks` / init: nadal może flushować kolejkę gdy nie ma game loopa (`GAME_LOOP_IDLE_MS`) — loading screen, nie gameplay hitch.

---

### 5. Scope

**Zmieniamy**

- `src/terrain/chunkManager.ts`
  - `attachGeneratedChunk` / `runFinalize` / `drainFinalizeQueue` / `waitForFinalizeSlot`
  - rekord chunka: etap `mesh` vs `content` (pole na `ChunkRecord`, nie nowy manager)
  - preload: wywołanie istniejących `get*Templates()` przy konstrukcji albo przy enqueue vegetation
  - unload / `finalizeWaiter`: pomijać oba etapy; nie attachować treści po unload
- `src/terrain/chunkManager.test.ts` — tylko jeśli da się przetestować kolejkę etapów bez Three (np. wyeksportować pick/stage jak `pickNearestQueuedKey`); nie budować testu WebGL
- ten plan + krótka notatka implementacyjna po zrobieniu

**Dane / stan**

- `finalizeQueue` zostaje nearest-first
- `CHUNKS_STARTED_PER_FRAME = 2` bez zmian
- `CHUNKS_FINALIZED_PER_FRAME = 1` obejmuje oba etapy łącznie
- `pendingPromise` / `waitForChunks` musi czekać na etap `content` (inaczej `waitSettled` uzna świat za gotowy bez drzew)

**Nie zmieniamy**

- worker heightmap / grass placement / protokół workera
- Insane 193, load/unload radius
- NPC, fauna, economy, UI
- settlement / House Builder
- N8AO, cienie, lustro (plan 113)
- Issue 031
- instrumentacja benchmarku (chyba że A+B nie wystarczą — wtedy tylko split timera GLB, jako osobny mikro-krok)
- przenoszenie `THREE.Mesh` / `BufferGeometry` / `scene.add` do workera

---

### 6. Verification

Techniczne: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

Browser — istniejący `?benchmark=*`, seed 42, `res=193`, High, canvas jak 015 (1068×906, dpr 1) jeśli embedded browser na to pozwoli. Nie porównywać FPS 1:1 z inną rozdzielczością bez adnotacji.

Scenariusze: `forest`, `water`, `stress`, oraz **`stream`** (jedyne, które ładuje chunki *w trakcie* sesji).

| Metric | forest 015 | water 015 | stress 015 | stream 012 | stream 119 (ta sesja, wolniejszy browser) |
|---|---:|---:|---:|---:|---:|
| FPS avg | 81.4 | 61.8 | 90.4 | 55 | 7.7 |
| Frame p95 | 16.5 | 25.5 | 17.0 | 28.6 | 379.9 |
| Frame max | 1816 | 375 | 43.5 | 69.8 | 613 |
| hitch `chunk mesh` max | — | — | — | 53.6 | 124.5 |
| hitch `chunk vegetation glb` | — | — | — | (warm, brak) | **544** |
| liczba hitchy STREAMING | 0 (puste) | 0 | 0 | 48 | 63 |

Po implementacji wypełnić kolumnę After dla `forest` / `water` / `stress` / `stream`: FPS, p95, frame max, liczba hitchy, czas największego hitcha, etykiety (`chunk mesh` / `chunk vegetation glb` / inne).

Acceptance:

> brak wieloset-milisekundowych / sekundowych blokad main thread podczas **normalnego** chunk streaming (`stream` + sprint z osady).

Nie wymagać `frame.max = 0` ani braku pojedynczych hitchy ~16–40 ms (GC, pierwszy compile shaderów, jeden Insane mesh). Sukces: `chunk vegetation glb` nie burstuje; `frame.max` w `stream` spada z setek ms do rzędu pojedynczego mesha; `forest`/`water` nie pokazują ~1–2 s klatek jeśli da się je odtworzyć.

Ręcznie: `?perf=1&seed=42`, sprint z osady w świeżą kartę (zimny GLB). Drzewa mogą pojawić się 1–kilka klatek po terenie (pop-in etapu `content`) — akceptowalne.

---

### 7. Risks

| Ryzyko | Mitygacja |
|---|---|
| Wolniejsze pojawianie się drzew/skał (1 content chunk/klatkę) | Teren pod nogami jest od razu; treść dogania nearest-first |
| Pop-in vegetation | 1 klatka × N chunków; preload zmniejsza lukę do samego instancingu |
| Kolejka content zalega przy sprincie | Ten sam nearest-first co mesh; unload odrzuca stale |
| Starvation meshy przez content | Jeden slot/klatkę: priorytet mesh nad content gdy oba czekają (gracz stoi na dziurze, nie na pustym lesie) |
| `waitForChunks` dłuższy o etap content | Poprawne — settle ma mieć drzewa; loading screen to nie hitch |
| Preload GLB na starcie świata | Koszt raz, na ekranie ładowania / pierwszych klatkach home, nie przy sprincie |
| Extra komunikacja z workerem | Brak — GLB zostaje na main, tylko kiedy |

---

### 8. Expected result

Streaming przestaje składać wiele post-mesh finalizacji w jedną klatkę. Zimny parse 14 GLB-ów roślinności wychodzi ze ścieżki `attachGeneratedChunk`. Pojedynczy terrain mesh nadal może zająć kilkadziesiąt ms przy Insane 193 — to osobny, już znany koszt, nie wielosekundowy freeze.

Nie zakładamy konkretnego FPS; 015 już pokazało, że średnia jest w porządku.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
