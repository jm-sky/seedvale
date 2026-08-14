# 103 — Performance diagnostics, benchmark, quality profiles — implementation notes

Uzupełnienie [planu 103](./2026-08-13--103--performance-diagnostics-benchmark.md). Etapy 1–4 zaimplementowane 2026-08-14. Etap 5 (Adaptive Quality) **nie** — tylko pole `quality.adaptiveEnabled` (domyślnie `false`, ignorowane).

## Architektura

`src/perf/` jest poza `WorldBundle` (przeżywa rebuild). Aktywny monitor: `setActiveMonitor` / `getMonitor` (`src/perf/active.ts`).

Per-system CPU timers są **wyłączone** w normalnej grze. Włączają się gdy:

- `?perf=1`, albo
- lil-gui Performance → Enable timings, albo
- trwa benchmark.

Dwa `performance.now()` na klatkę (simulate / render) zostają — były już w `gameLoop`.

CPU timer mierzy CPU. Cienie i post-process siedzą w jednym `postProcessing.render()` — kategorie `SHADOWS` / `POSTPROCESS` zostają puste, zamiast zgadywać GPU. Koszt GPU zgłasza się jako `RENDER`.

Hitch streamingu: `recordHitch` wokół `buildAndAttachMesh` (`STREAMING` / `chunk mesh`), `createChunkWater`, vegetation/environment/items, unload oraz `buildGrassChunkMeshes` (`GRASS`). Próg 8 ms. 2026-08-14: `renderer.info.autoReset = false` — poprzedni odczyt po EffectComposerze pokazywał `calls = 1`. GUI i raport biorą snapshot z `endFrame`. Census sceny + isolation probes + scenariusz `stream` opisane w [review 012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md).

## Profile jakości

Tylko gałki live, bez rebuildu świata:

- `pixelRatioCap`, AO, bloom, god rays, odbicia wody, `terrainCastsShadow`
- `shadowMapSize` (512 / 1024 / 2048)
- `quality.lodScale` — mnożnik istniejącego `setLodFraction`

`terrain.resolution`, `grass.density`, `loadRadius` zostają w lil-gui jako world-gen.

Preset Low / Medium / High nadpisuje te gałki. Ręczna zmiana → `Custom` (`matchQualityPreset`).

UI gracza: Pauza → Świat → Grafika. Benchmark: lil-gui + `?benchmark=<id>` (nie Vue).

JSON ostatniego raportu: `window.__seedvalePerfLastReport`. Łańcuch: `window.__seedvalePerfReports`, `window.__seedvaleRunBenchmark(id)`. `?benchmark=` / `?perf=1` pomija menu Kontynuuj.

## Scenariusze benchmarku

`current` · `settlement` · `forest` · `water` · `night` · `stress` · `stream`

Po teleportcie: `waitForChunks` pierścienia load + 1 s settle (poza raportem). Domyślnie 30 s pomiaru. Stan (pose, `timeOfDay`, preset) jest przywracany. `stream` teleportuje gracza w +X z prędkością sprintu. Po 30 s (poza `stream`) krótkie isolation probes.

## Weryfikacja w przeglądarce

1. Bez `?perf` — konsola bez per-frame logów; lil-gui Performance pokazuje draw calls / simulate / render jak wcześniej.
2. `?perf=1` albo Enable timings — p95 i loaded chunks ożywają; zmiana kategorii nie spamuje `console.log` (tylko warning+).
3. `?benchmark=current` — po starcie jeden blok `[Seedvale Benchmark]` + JSON; `window.__seedvalePerfLastReport` ustawione.
4. Pauza → Świat → Grafika: Low vs High zmienia skalę renderu / AO / odbicia **bez** rebuildu terenu.
