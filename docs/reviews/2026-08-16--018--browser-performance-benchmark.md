# Review 018: Browser performance benchmark

**Status:** `done`  
**Date:** `2026-08-16`

## Scope

Powtórzenie `?benchmark=*` po planach 112/113/119 i późniejszych zmianach. Bez zmian w kodzie, instrumentacji i rendererze. Numer 016 był zajęty ([GPU-fix runtime verification](./2026-08-15--016--gpu-fix-runtime-verification.md)).

## Environment

- Cursor embedded browser + CDP. `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1`. Raporty: `pixelRatio=1`.
- `quality: High` (wymuszone przez `src/perf/benchmark.ts`), `seed=42`, terrain mesh **Insane (193)**, `loadRadius=3`.
- URL: `http://localhost:5577/?benchmark=<scenario>&seed=42&res=193`. Czas pomiaru: **30 s**. Wynik: `window.__seedvalePerfLastReport`.
- Vite `:5577` bez HMR w trakcie siedmiu runów.
- `current` w tej sesji: 55 chunków / 13 NPC — jak [010](./2026-08-14--010--perf-benchmark-data.md), lżejszy niż [015](./2026-08-15--015--browser-performance-benchmark.md) `current` (76 / 42). Środowisko canvas/DPR zgodne z 015 — porównanie FPS jest miarodajne, z adnotacją przy `current`.

## Method

Siedem scenariuszy po kolei, ten sam viewport. `?benchmark=` omija menu startowe. `stream` bez isolation probes (tak konstruuje `benchmark.ts`).

Kategorie `GRASS` / `VEGETATION` / `PROPS` / `SHADOWS` / `POSTPROCESS` / `STREAMING` w `systems{}` są puste (próg `< 0.05 ms` albo praca pod `TERRAIN` / hitch labels). `SHADOWS` i `POSTPROCESS` są zarezerwowane i nigdy nie są wypełniane — koszt AO/cieni siedzi w `RENDER`.

## Results

| Scenario | FPS avg | min / p1 | Frame avg / p95 / max | RENDER | WATER | TERRAIN | NPC | FAUNA | Draws avg | Tris avg | Mirror | Chunks | NPC n | Fauna n |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| current | 56.3 | 23 / 29 | 17.8 / 26.3 / 43.3 | 13.2 | 2.4 | — | 1.0 | 0.5 | 1263 | 6.22M | 233 | 55 | 13 | 25 |
| forest | 82.9 | 30 / 42 | 12.1 / 19.2 / 33.0 | 8.4 | 1.5 | — | 0.9 | 0.5 | 562 | 11.06M | 133 | 57 | 12 | 25 |
| settlement | 56.0 | 22 / 31 | 17.9 / 26.8 / 45.3 | 13.1 | 2.4 | — | 1.1 | 0.5 | 1255 | 6.47M | 235 | 55 | 13 | 25 |
| water | 98.4 | 38 / 52 | 10.2 / 14.6 / 26.6 | 6.7 | 1.2 | — | 1.1 | 0.5 | 301 | 5.84M | 64 | 54 | 13 | 25 |
| night | 59.1 | 19 / 31 | 16.9 / 24.7 / 52.6 | 12.4 | 2.4 | — | 0.9 | 0.5 | 1272 | 6.22M | 233 | 55 | 13 | 25 |
| stress | 78.4 | 32 / 37 | 12.8 / 21.0 / 31.3 | 8.6 | 1.8 | — | 1.0 | 0.5 | 565 | 11.08M | 135 | 57 | 12 | 25 |
| stream | 53.8 | 1 / 14 | 18.6 / 31.1 / **798.5** | 11.6 | 3.2 | 1.5 | 0.9 | 0.5 | 675 | 8.60M | 138 | 68 | 14 | 23 |

`PHYSICS` 0.1 ms we wszystkich. `hitches` puste poza `stream`.

### `stream` hitches

| Label | count | avg | max |
|---|---:|---:|---:|
| `chunk mesh` | 48 | 38.8 ms | 52 ms |
| `chunk vegetation glb` | 0 | — | — |
| `chunk water` | 0 | — | — |
| `grass generation` | 0 | — | — |

`STREAMING` spikes: 48 (zgodne z `chunk mesh`). Brak isolation probes.

### Isolation (RENDER ms / draws) — spójne kierunki

Próbki 400 ms; pojedyncze wzrosty po `hide-*` traktowane jako szum.

| Probe | current | settlement | night | water |
|---|---|---|---|---|
| full | 12.2 / 1258 | 11.7 / 1260 | 12.3 / 1259 | 6.8 / 303 |
| hide-settlement | **8.3 / 619** | **8.6 / 622** | **9.3 / 637** | 6.2 / 163 |
| hide-grass | 12.9 / 1201 | 12.4 / 1227 | 13.2 / 1237 | 6.8 / 261 |
| hide-vegetation | 11.4 / 1229 | 11.3 / 1221 | 12.0 / 1251 | 6.9 / 291 |
| hide-npc-fauna | 10.5 / 1127 | 10.3 / 1134 | **8.8 / 1133** | 6.7 / 298 |
| no-shadows | 10.7 / 807 | 11.9 / 811 | **8.7 / 854** | 5.9 / 172 |
| no-ao | 12.4 / 1271 | 11.6 / 1249 | **9.3 / 1272** | **5.0 / 287** |
| no-reflections | 15.4 / 1044 | 13.7 / 1042 | 11.5 / 1057 | 7.1 / 241 |

Census (scene graph, nie frustum): osada ~470 draws; `other` ~360; grass 1.3–5.7M tris; terrain ~4.0–5.0M; water 2.2–4.2M.

## Comparison with previous baseline

Vs [015](./2026-08-15--015--browser-performance-benchmark.md) (ten sam canvas/DPR/High/seed/193):

| Scenario | 015 FPS | 018 FPS | 015 p95 | 018 p95 | 015 max | 018 max |
|---|---:|---:|---:|---:|---:|---:|
| current | 50.7 | 56.3 | 30.8 | 26.3 | 68.9 | 43.3 |
| forest | 81.4 | 82.9 | 16.5 | 19.2 | **1816** | **33** |
| settlement | 48.5 | 56.0 | 31.1 | 26.8 | 46.8 | 45.3 |
| water | 61.8 | 98.4 | 25.5 | 14.6 | **375** | **27** |
| night | 65.9 | 59.1 | 23.1 | 24.7 | 35.9 | 52.6 |
| stress | 90.4 | 78.4 | 17.0 | 21.0 | 43.5 | 31.3 |
| stream | (nie ruszany) | 53.8 | — | 31.1 | — | **799** |

- Standing FPS: `settlement`/`water` wyraźnie lepiej; `forest` płaski; `night`/`stress` trochę gorzej. `current` +5.6 FPS, ale 015 miało cięższy zapis (76 chunków / 42 NPC).
- RENDER nadal 7–13 ms. WATER niższy niż 015 w wiosce (2.4 vs 3.8) i przy wodzie (1.2 vs 2.6).
- Wieloset-ms `frame.max` w `forest`/`water` **zniknęły** ze standing runów (teleport + `waitForChunks` przed `beginSession`). Ten sam koszt wraca w `stream`, bo ładowanie jest *w* oknie pomiaru.
- Draw calls są teraz realne (010/część 015 miały `1`). Ciężka osada ~1250 avg / ~1540 max — w paśmie review 012 (~1300–1950), nie poniżej.

Vs plan 119 capture `stream` (wolniejszy embedded browser, **nie** baseline FPS): `chunk vegetation glb` 20× max 544 ms → **0**. `chunk mesh` 43× 58.6/124.5 → 48× 38.8/52. Frame max 613 → **799** (nadal setki ms).

Vs review 012 `stream` (warm GLB): FPS 55 vs 53.8; `chunk mesh` max 53.6 vs 52 — koszt pojedynczego mesha bez zmian. 012 `frame.max` 69.8 vs 799 tutaj — zimny run nadal ma nieoznaczony spike.

## Bottleneck analysis

### A. Main sustained bottleneck

**RENDER** we wszystkich scenariuszach (6.7–13.2 ms). W wiosce (`current`/`settlement`/`night`) to ~12–13 ms przy ~1250 draw calls. WATER 1.2–3.2 ms jest drugi, ale wyraźnie poniżej 010. NPC/FAUNA 0.9–1.1 / 0.5 ms — nie są celem.

### B. Worst spikes

1. `stream` `frame.max` **798.5 ms**, FPS min 1 — **bez** etykiety hitcha. `chunk mesh` max to tylko 52 ms, więc 799 ms to coś poza `recordHitch` (compile/upload GPU, GC, albo nieowinięty etap content).
2. Oznaczone: 48× `chunk mesh` avg 38.8 / max 52 ms — jeden Insane 193 mesh na klatkę, jak plan 112/119 B.
3. Standing `frame.max` 27–53 ms. 015 `forest` 1816 / `water` 375 nie reprodukują się po settle.

### C. Draw-call bottleneck

Tak, nadal **settlement**. Census ~470 draws osady; `hide-settlement` tnie draws ~1260→620 i RENDER ~12→8.3 ms. Cienie: `no-shadows` ~450 draws mniej. Mirror 64–235. Vegetation 80–253. NPC+fauna ~250. `other` ~360 (census, nieizolowane).

### D. Geometry bottleneck

Grass 1.3–5.7M i terrain ~4M tris **nie** rządzą frame time przy 1068×906: `hide-grass` / `hide-terrain` nie obniżają RENDER. To zapas na wyższe DPR/mobile, nie obecny limiter FPS.

### E. CPU vs GPU

Mieszanka, z przewagą kosztu w `composer.render()` (`RENDER`). Suma pozostałych kategorii CPU ≈ 4–5 ms na standing; `RENDER` 7–13 ms zawiera GPU wait i nie da się go rozdzielić istniejącymi timerami. Isolation: mniej submissions (osada/cienie) obniża `RENDER`; mniej trójkątów trawy — nie. Streaming spike 799 ms jest poza kategoriami CPU — dane **nie** rozstrzygają compile vs GC.

## Chunk streaming analysis

Plan 119 A (GLB stampede) **potwierdzony jako naprawiony w pomiarze**: zero `chunk vegetation glb`. `chunk water` i `grass generation` też poniżej 8 ms.

Plan 119 B / 112: `buildAndAttachMesh` nadal hitch 39–52 ms × 48 w 30 s (~1/klatkę). TERRAIN avg 1.5 ms zgadza się z rozłożeniem tego kosztu.

Acceptance planu 119 („`frame.max` w `stream` spada z setek ms do rzędu pojedynczego mesha”) **nie jest spełnione**: 799 ms vs mesh 52 ms. Instrumentacja nadal nie etykietuje tego spiku (luka z planu 119 §2.C — nie naprawiana tu).

## Findings

**Measured**

- Sustained limiter = **RENDER + settlement draw calls** w wiosce (~56 FPS, ~13 ms RENDER, ~1250 draws).
- Najgorszy hitch = **nieoznaczony `stream` 799 ms**. GLB stampede zniknął; pojedynczy chunk mesh został przy ~40–52 ms.
- N8AO nie dominuje ciężkiej dziennej osady (auto-suppress); widać go w `water` (−1.8 ms) i `night` (−3.0 ms).
- Cienie: pewny zysk RENDER w `night` (−3.6 ms) i spadek ~400 draws wszędzie.
- Mirror/WATER nie są już głównym kosztem przy wodzie (98 FPS, WATER 1.2 ms).
- Grass/terrain LOD i vegetation batching nie wynikają z tego viewportu jako next step.

**Instrumentation (opis, bez fixu)**

- `frame.max` ≫ max hitch: GPU/GC poza `recordHitch`.
- `SHADOWS` / `POSTPROCESS` zawsze puste.
- Isolation 400 ms jest zbyt krótka na twarde delta (część `hide-*` podnosi RENDER).

## Recommended next optimization order

Kolejność z planu 113 **nie** jest już aktualna jako P0→P2.

```text
1. nieoznaczony hitch streamingu (frame.max ~800 ms) — najpierw zidentyfikować przyczynę
2. settlement batching — jedyny spójny sustained zysk RENDER + draws
3. pojedynczy chunk mesh (~40–52 ms) — ten sam Insane attach co 012
4. shadows (noc: −3.6 ms RENDER, −400 draws)
5. N8AO pozostały koszt, gdy auto-suppress nie gasi (water/night)
6. water mirror / vegetation batching / grass·terrain LOD / NPC / HLOD / culling — później
```

N8AO jako P0 planu 113: **demote**. Water mirror: **demote**. Vegetation batching i grass/terrain LOD: **demote** przy tym canvasie. Settlement batching: **promote** na pierwszy sustained target po hitchu streamingu.

## Known limitations

- Embedded browser Cursor, nie pełne okno desktop.
- `current` lżejszy niż 015 `current` (55/13 vs 76/42).
- Isolation probes 400 ms — kierunek tak, wielkość delta nie.
- `stream` bez isolation; 799 ms bez etykiety.
- Brak osobnego GPU timer / `EXT_disjoint_timer_query`.
