# Review 012: Performance bottleneck diagnosis v2

**Status:** `done`  
**Date:** 2026-08-14  
**Scope:** drugi etap diagnostyki — naprawa instrumentacji `drawCalls`/`triangles`, ponowne benchmarki, spis sceny, probe izolacji, streaming chunków.  
**Not in scope:** optymalizacje gameplayu / architektury.  
**Poprzednik:** [010](./2026-08-14--010--perf-benchmark-data.md)

## Instrumentation changes

Jedyna zmiana kodu to **pomiar**, nie rendering.

| Zmiana | Po co |
|---|---|
| `renderer.info.autoReset = false` + `info.reset()` raz na klatkę (`createRenderer.ts`, `gameLoop.ts`) | EffectComposer / N8AO / mirror wołają `renderer.render()` wielokrotnie; domyślny `autoReset` zerował licznik po każdym fullscreen passie → `calls = 1` |
| GUI czyta `getLiveStats()` zamiast żywego `renderer.info.render` | ten sam snapshot co raport, po pełnej klatce |
| `censusScene()` | jednoprzebiegowy szacunek draw/tris per bucket (CPU, nie GPU time) |
| Hitch labels: `chunk mesh` / `water` / `vegetation` / `glb` / `environment` / `items` / `unload` / `grass generation` | rozróżnienie streamingu |
| Isolation probes (~0.4 s każdy) po 30 s benchmarku | kierunkowy koszt Render ms po ukryciu bucketa / wyłączeniu AO / cieni / odbić |
| Scenariusz `stream` | sprint diagnostyczny: teleport +X z prędkością sprintu przez 30 s |
| `?benchmark=` / `?perf=1` omija menu Kontynuuj | powtarzalne, nienadzorowane runy |
| `window.__seedvaleRunBenchmark` / `__seedvalePerfReports` | łańcuch scenariuszy bez reloadu |

## Environment vs review 010

| | 010 | 012 |
|---|---|---|
| Canvas (CSS) | ~1068×906 | **556×487** (embedded Cursor) |
| `devicePixelRatio` | 1 | **1.25** (cap High = 2 → faktyczne 1.25) |
| Seed / mesh / load | 42 / Insane 193 / radius 3 | **to samo** |
| Quality | High | High (wymuszone na czas runu) |
| Czas | 30 s | 30 s + ~6 s izolacji (poza FPS 30 s) |

`pixelRatio` 1.25 i mniejszy canvas to ograniczenie tej przeglądarki, nie zmiana presetu. Porównanie FPS z 010 jest **kierunkowe**, nie 1:1. Draw calls / scene census / izolacja są wiarygodne niezależnie od rozdzielczości.

`current` użył zapisanej pozycji gracza (76 chunków, 34 NPC). `settlement` jest bliższy 010 (13 NPC, home).

## Benchmark results (30 s, High, seed 42, res 193, load 3)

### `current` (zapisana pozycja)

```json
{"durationSec":30,"quality":"High","pixelRatio":1.25,"scenario":"current","fps":{"avg":42.1,"min":16,"p1":22},"frameTime":{"avg":23.8,"p95":31.8,"max":63.2},"rendering":{"drawCallsAvg":1308,"drawCallsMax":1331,"trianglesAvg":19216809,"mirrorDrawCallsAvg":388,"geometries":367,"textures":234},"systems":{"WATER":5.8,"NPC":2,"FAUNA":0.5,"RENDER":14.5},"context":{"loadedChunks":76,"npcCount":34,"faunaCount":24}}
```

### `settlement`

```json
{"durationSec":30,"quality":"High","pixelRatio":1.25,"scenario":"settlement","fps":{"avg":43.6,"min":10,"p1":25},"frameTime":{"avg":22.9,"p95":31.2,"max":102.1},"rendering":{"drawCallsAvg":1828,"drawCallsMax":1858,"trianglesAvg":8354788,"mirrorDrawCallsAvg":567,"geometries":556,"textures":419},"systems":{"WATER":5.6,"NPC":0.7,"FAUNA":0.5,"RENDER":15.5},"context":{"loadedChunks":61,"npcCount":13,"faunaCount":27}}
```

### `forest`

```json
{"durationSec":30,"quality":"High","pixelRatio":1.25,"scenario":"forest","fps":{"avg":88.2,"min":33,"p1":50},"frameTime":{"avg":11.3,"p95":15.6,"max":30.2},"rendering":{"drawCallsAvg":693,"drawCallsMax":693,"trianglesAvg":13950384,"mirrorDrawCallsAvg":265,"geometries":624,"textures":577},"systems":{"WATER":2.8,"NPC":0.3,"FAUNA":0.7,"RENDER":7},"context":{"loadedChunks":52,"npcCount":4,"faunaCount":28}}
```

### `water`

```json
{"durationSec":30,"quality":"High","pixelRatio":1.25,"scenario":"water","fps":{"avg":51.6,"min":24,"p1":31},"frameTime":{"avg":19.4,"p95":25.7,"max":41},"rendering":{"drawCallsAvg":1953,"drawCallsMax":1999,"trianglesAvg":7138129,"mirrorDrawCallsAvg":865,"geometries":657,"textures":731},"systems":{"WATER":6.2,"NPC":0.3,"FAUNA":0.6,"RENDER":11.8},"context":{"loadedChunks":55,"npcCount":5,"faunaCount":28}}
```

### `night`

```json
{"durationSec":30,"quality":"High","pixelRatio":1.25,"scenario":"night","fps":{"avg":37.9,"min":17,"p1":24},"frameTime":{"avg":26.4,"p95":34.8,"max":60.1},"rendering":{"drawCallsAvg":1306,"drawCallsMax":1335,"trianglesAvg":19212268,"mirrorDrawCallsAvg":384,"geometries":826,"textures":892},"systems":{"WATER":6.1,"NPC":1.9,"FAUNA":0.6,"RENDER":17},"context":{"loadedChunks":76,"npcCount":34,"faunaCount":28}}
```

### `stress` (las + noc + High)

```json
{"durationSec":30,"quality":"High","pixelRatio":1.25,"scenario":"stress","fps":{"avg":83,"min":33,"p1":47},"frameTime":{"avg":12.1,"p95":16.5,"max":30.5},"rendering":{"drawCallsAvg":695,"drawCallsMax":695,"trianglesAvg":13958080,"mirrorDrawCallsAvg":267,"geometries":712,"textures":880},"systems":{"WATER":3,"NPC":0.3,"FAUNA":0.6,"RENDER":7.6},"context":{"loadedChunks":52,"npcCount":4,"faunaCount":27}}
```

### `stream` (teleport +X, 14.4 m/s, 30 s; bez izolacji)

```json
{"durationSec":30,"quality":"High","pixelRatio":1.25,"scenario":"stream","fps":{"avg":55,"min":14,"p1":27},"frameTime":{"avg":18.2,"p95":28.6,"max":69.8},"rendering":{"drawCallsAvg":971,"drawCallsMax":1875,"trianglesAvg":11367407,"mirrorDrawCallsAvg":347,"geometries":849,"textures":1190},"systems":{"WATER":4.4,"NPC":0.8,"FAUNA":0.6,"RENDER":11.8},"hitches":[{"category":"STREAMING","label":"chunk mesh","count":48,"avgMs":29.9,"maxMs":53.6}],"context":{"loadedChunks":68,"npcCount":14,"faunaCount":27}}
```

Draw calls są teraz **setki–tysiące**, nie `1`. Triangles **7–19 M**, nie `1`.

Simulate (z systemów poza RENDER/WATER-mirror): NPC 0.3–2.0 ms, fauna 0.5–0.7 ms, PHYSICS nie przebija 0.05 ms. **Symulacja nie jest bottleneckiem.**

---

## Scene census (jednoprzebiegowy szacunek, nie frustum)

`current` / `night` (76 chunków, ciężka lokacja):

| Bucket | Draws | Tris | Meshes / inst |
|---|---:|---:|---|
| grass | 100 | **9.71 M** | 100 instanced, 348k instancji |
| terrain | 76 | **5.60 M** | 76 |
| water | 45 | **3.25 M** | 45 |
| vegetation | 451 | 2.37 M | 451 instanced, 1294 instancji |
| settlement | **780** | 0.67 M | 780 **nieinstanced** |
| npc | **308** | 0.21 M | 308 (34 NPC ≈ 9 meshy/osoba) |
| other | 372 | 0.02 M | sky/player/światła/itp. |
| fauna | 163 | 0.04 M | 163 |
| items | 204 | 0.01 M | 204 |
| environment | 72 | 0.03 M | skały częściowo instanced |

`settlement` (home): settlement **567 draws**, grass 3.4 M tris, terrain 4.5 M, **łącznie ~1828 GPU submissions** (info.render, z cieniem + mirror).

Census to **jeden** przebieg sceny. `renderer.info.render.calls` jest wyższy, bo klatka robi: shadow map + mirror + beauty (N8AO) + fullscreen post.

`water`: `mirrorDrawCallsAvg = 865` przy `drawCallsAvg = 1953` — **~44% submissions to pierwszy `renderer.render()` (cień + odbicie).**

---

## Isolation probes

Próbki ~0.4 s (~20 klatek) — **kierunkowe**. Delty &lt; ~3 ms traktować jako szum (hide-grass czasem *podbił* Render ms).

Powtarzalne sygnały:

| Probe | Obserwacja | Wniosek |
|---|---|---|
| `no-ao` | current 17.3 → **9.1** ms; night 21.6 → **11.7**; draw calls prawie bez zmian | N8AO to **GPU fill**, nie extra scene draws |
| `hide-npc-fauna` | current 17.3 → **9.8**; settlement 14.9 → **9.9**; gdy NPC w kadrze | skinned NPC są drogie w **submit + shadow**, mimo małych tris |
| `hide-settlement` | settlement draws 1835 → **942**; water 1982 → **1036** | osada ≈ połowa draw calli w wiosce; Render ms spada umiarkowanie |
| `no-shadows` | current draws 1300 → **813** | ~⅓ submissions to shadow map |
| `no-reflections` | water draws 1982 → **1096**; tris 7.1 M → 5.1 M | mirror to drugi pełny przebieg sceny (256², ale CPU submit nadal) |
| `hide-grass` | tris 19.2 M → 8.7 M; draws tylko −57 | trawa = **budżet wierzchołków/fill**, nie draw calli |
| `hide-terrain` | tris −4.5 M; Render ms mały spadek | teren jest ciężki w tris, tani w draws (1 mesh/chunk) |
| `hide-vegetation` | current draws 1300 → 911 | 451 bucketów instanced drzew/krzaków nadal sporo calli |

Ograniczenie: **brak `EXT_disjoint_timer_query` w tej sesji.** `renderMs` to CPU czas `composer.render()`, który przy zapełnionym command bufferze zawiera GPU stall. Nie da się uczciwie rozdzielić „10 ms CPU submit” vs „10 ms czekania na GPU” obecnym licznikiem.

---

## A. Potwierdzone bottlenecks

1. **Sustained: koszt klatki siedzi w `RENDER` + `WATER` (mirror), nie w symulacji.**  
   Dowód: RENDER 7–17 ms, WATER 2.8–6.2 ms (w tym `ocean.renderMirror`), NPC/fauna/physics ≤ 2 ms. FPS spada tam, gdzie rośnie liczba draw calli (settlement 1828 / water 1953), nie tam, gdzie jest więcej NPC w lesie.

2. **Draw calls osad (nieinstanced GLB) + NPC (skinned, ~9 meshy/osoba).**  
   Dowód: census 567–780 meshy osady; hide-settlement tnie draws o ~50% w wiosce; hide-npc-fauna tnie Render ms o ~5–7 ms przy 13–34 NPC.

3. **N8AO (High = `aoQuality: Low`, half-res) jest dużym kosztem GPU fill.**  
   Dowód: `no-ao` prawie nie zmienia draw calli, a Render ms spada ~40–50% w ciężkich lokacjach.

4. **Podwójny (czasem potrójny) przebieg sceny: shadow + mirror + beauty.**  
   Dowód: `mirrorDrawCallsAvg` 265–865; `no-shadows` −~500 draws; Three.js `shadowMap.autoUpdate === true` renderuje cienie przy **każdym** `renderer.render()` — pierwszy pass klatki to mirror, więc cień idzie wtedy; beauty to drugi scene render.

5. **Trawa / teren / woda dominują trójkąty (nie calli).**  
   Dowód: grass 3–10 M tris przy 36–100 draws; terrain ~73 k tris × N chunków; water 2–3 M. To budżet GPU vertex/fill, mierzony szacunkiem geometrii, nie timerem GPU.

6. **Streaming hitch = `buildAndAttachMesh` (Insane 193), nie grass/vegetation po rozgrzaniu cache.**  
   Dowód: `stream` — 48 hitchy `chunk mesh`, avg **29.9 ms**, max **53.6 ms**. Grass / vegetation / env / unload / glb **nie przekroczyły progu 8 ms** (szablony GLB były już w pamięci po sześciu poprzednich scenariuszach).

## B. Prawdopodobne bottlenecks

- **451 instanced vegetation buckets** (jeden `InstancedMesh` na parę species×primitive) — 451 calli to nadal dużo; hide-vegetation tnie draws, Render ms tylko trochę.  
- **SMAA / bloom / god rays** — nieizolowane osobno (siedzą w `RENDER` po N8AO). `no-ao` zostawia resztę postprocessu i nadal jest zysk, więc AO &gt; pozostałe passe, ale bloom/SMAA mogą dokładac fill.  
- **Wielosekundowe hitch'e z 010** — nie odtworzone. Prawdopodobne źródła tamtej sesji: zimny parse GLB, zbieżność wielu `chunk mesh` w jednej klatce, CDP/screenshot, albo `createSettlement` (issue 027, frame-yield — wall-clock, nie jeden freeze). Nie potwierdzone tutaj.

## C. Niepotwierdzone hipotezy

- Że fauna jest bottleneckem — **odrzucone** (0.5–0.7 ms, mało tris).  
- Że Simulate/NPC FSM jest bottleneckem — **odrzucone** (≤ 2 ms).  
- Że sam fog/światła CPU są problemem — nie zmierzone osobno; `applyDayNight` jest throttlowany.  
- Że transparent/alpha-test foliage jest głównym GPU kosztem — brak timer query; liście są `alphaTest` opaque (STATE.md).  
- Że GC jest głównym hitch'em sprintu — `stream` max 69.8 ms zgadza się z 1–2 × `chunk mesh` (30–54 ms), bez wielosekundowych pauz.

## D. Chunk streaming

Rozróżnienie (warm cache, `stream` 30 s, home → +X):

| Operacja | Pomiar | Werdykt |
|---|---|---|
| Terrain generation | worker (`requestChunkTile`) | poza main thread; nie w hitchach |
| Worker result → mesh | `chunk mesh` 48×, avg 29.9, max 53.6 ms | **główny hitch klatki** przy Insane 193 |
| Chunk water | brak hitch ≥ 8 ms | tanie |
| Vegetation instancing | brak hitch ≥ 8 ms (warm) | tanie po cache szablonów |
| GLB load/parse | nie złapane (warm); zimny parse **nie zmierzony** w tym runie | luka |
| Environment / items | brak hitch ≥ 8 ms | tanie |
| Grass mesh build | brak hitch ≥ 8 ms (placement w workerze, plan 086) | nie jest już tym, czym było w review 005 |
| Unload/dispose | brak hitch ≥ 8 ms | tanie |
| Settlement `createSettlement` | **nie mierzony** (frame-yield, wall-clock ≠ freeze) | luka; issue 027 nadal otwarte jakościowo |
| GC | nieinstrumentowane | niepotrzebne do wyjaśnienia 30–70 ms |

Wiele chunków wracających w tej samej klatce: 7 nowych krawędzi × 30 ms ≈ teoretyczne 210 ms; zaobserwowane max **69.8 ms** ⇒ zwykle 1–2 meshe na klatkę, nie pełny pierścień.

**Instrukcja ręczna (krótka), jeśli trzeba zimnego GLB:** nowa karta `?perf=1&seed=42`, Enable timings, sprint z osady zanim cokolwiek się załaduje poza home. Szukaj w raporcie `chunk vegetation glb` / `chunk environment glb`. Nie powtarzane w tej sesji po HMR.

## E. Rekomendacje

### 1. N8AO / post-process (High)

- **Problem:** ~40–50% Render ms znika po `aoEnabled: false` bez zmiany liczby scene draws.  
- **Dowód:** isolation `no-ao`.  
- **Rozwiązanie:** na High trzymać half-res (już jest); rozważyć Performance quality albo AO off poza wioską; nie ruszać SMAA dopóki AO nie spadnie.  
- **Wpływ:** +10–20 FPS w ciężkich lokacjach (szacunek z 17 ms → 9 ms Render przy ~24 ms klatce).  
- **Ryzyko:** wygląd (mniej AO).  
- **Architektura:** nie.

### 2. Settlement instancing / merge

- **Problem:** 500–780 indywidualnych meshy osady, ~50% draws w wiosce.  
- **Dowód:** census + `hide-settlement`.  
- **Rozwiązanie:** rozszerzyć `buildInstancedProps` na powtarzalne propsy osady (płoty, stosy, kopie GLB); merge statycznego batcha per settlement. NPC zostawić.  
- **Wpływ:** duży na draw calls, umiarkowany na Render ms (GPU i tak liczy N8AO/cienie).  
- **Ryzyko:** lifecycle (światła, interactables, drzwi).  
- **Architektura:** tak, ale w istniejącym `instancedProps.ts`.

### 3. Shadow: jeden update na klatkę

- **Problem:** `autoUpdate` renderuje shadow map przy każdym `renderer.render()`; pierwszy w klatce to mirror.  
- **Dowód:** Three.js 0.180 `WebGLShadowMap` + `mirrorDrawCallsAvg`.  
- **Rozwiązanie:** `renderer.shadowMap.autoUpdate = false`, `needsUpdate = true` raz przed beauty; albo wyłączyć cienie w mirror camera.  
- **Wpływ:** −~30% draws; mniejszy fill 1024².  
- **Ryzyko:** cienie w odbiciu wody mogą zniknąć / stać się klatkę do tyłu.  
- **Architektura:** nie (flaga Three.js).

### 4. Water mirror

- **Problem:** drugi scene render, 256², warstwa 0; w scenie `water` ~865 mirror draws.  
- **Dowód:** `mirrorDrawCallsAvg`, `WATER` 6 ms, `no-reflections`.  
- **Rozwiązanie:** już wyłączalne (Medium/Low); High może obniżyć do co 2. klatki albo mniejszego RT; nie instancjować wody.  
- **Wpływ:** średni na wybrzeżu, mały w lesie.  
- **Ryzyko:** odbicia.  
- **Architektura:** nie.

### 5. NPC mesh count

- **Problem:** ~9 draw calli na NPC × 13–34 w kadrze; hide tnie Render ms mocno.  
- **Dowód:** census 308 meshy / 34 NPC; isolation.  
- **Rozwiązanie:** merdż materiałów / mniej submesh w prepareProp; frustum + hide distant skinned.  
- **Wpływ:** średni w osadzie, zero w lesie.  
- **Ryzyko:** animacje.  
- **Architektura:** nie (pipeline modelu).  
- **Nie** optymalizować FSM — 0.7–2 ms.

### 6. Chunk mesh hitch (Insane 193)

- **Problem:** 30 ms avg / 54 ms max na `buildChunkGeometry` + upload.  
- **Dowód:** `stream` hitch table.  
- **Rozwiązanie:** time-slice attach (jeden chunk/klatkę — sprawdzić czy już nie tak); obniżyć default resolution; reuse geometry buffers. Worker już liczy heightmap.  
- **Wpływ:** usuwa 30–70 ms spike przy chodzeniu.  
- **Ryzyko:** opóźnione pojawianie się terenu.  
- **Architektura:** mała (kolejka attach). **Nie** przenosić geometrii Three.js do workera bez dowodu, że to CPU index buffer a nie GPU upload.

### 7. Trawa 10 M tris

- **Problem:** największy budżet trójkątów; 100 draws.  
- **Dowód:** census. Isolation Render ms szum.  
- **Rozwiązanie:** agresywniejszy LOD (`count`), niższa gęstość poza near field. Już jest `setLodFraction`.  
- **Wpływ:** GPU vertex, nie CPU.  
- **Ryzyko:** wygląd.  
- **Architektura:** nie.

## F. Priorytet

| ID | Pri | Temat |
|---|---|---|
| N8AO koszt na High w osadzie | **P0** | bez tego dalszy content (więcej NPC/domów) tylko pogorszy 20–40 FPS |
| Shadow raz na klatkę + settlement instancing | **P1** | duży wpływ na draws; umiarkowany na FPS |
| Chunk mesh time-slice / niższy default than Insane | **P1** | hitch przy ruchu |
| Water mirror co N klatek | **P1** na wybrzeżu, **P2** globalnie |
| NPC submesh merge | **P2** | po instancingu osady |
| Trawa LOD | **P2** | już instanced |
| Fauna / NPC AI | **ignore** | pomiary |
| Przenoszenie renderu do workerów | **ignore** | GPU + submit, nie logika |

## CPU vs GPU

**Oba, z przewagą GPU fill + CPU draw-call submit w `renderer.render()`.**

- Main thread poza renderem: 2–6 ms (OK).  
- `composer.render()`: 7–17 ms — miesza submit i ewentualny GPU stall.  
- Izolacja: AO (GPU, bez extra draws) i NPC/settlement (CPU submits + shadow).  

Ręczny test GPU: Chrome DevTools → Performance → Rendering → GPU; albo `no-ao` w lil-gui i porównanie FPS na miejscu. Nie wymagane do powyższych wniosków.

## Findings

1. **P0 / fixed** — `drawCalls`/`triangles` = 1 był bugiem `autoReset`, nie sceną.  
2. **P0** — RENDER+N8AO+osada, nie Simulate.  
3. **P1** — streaming hitch = `chunk mesh` ~30 ms, nie grass.
