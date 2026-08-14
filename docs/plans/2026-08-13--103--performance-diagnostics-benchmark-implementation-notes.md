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

Hitch streamingu: `recordHitch` wokół `buildAndAttachMesh` (`STREAMING`) i `buildGrassChunkMeshes` (`GRASS`). Próg 8 ms.

## Profile jakości

Tylko gałki live, bez rebuildu świata:

- `pixelRatioCap`, AO, bloom, god rays, odbicia wody, `terrainCastsShadow`
- `shadowMapSize` (512 / 1024 / 2048)
- `quality.lodScale` — mnożnik istniejącego `setLodFraction`

`terrain.resolution`, `grass.density`, `loadRadius` zostają w lil-gui jako world-gen.

Preset Low / Medium / High nadpisuje te gałki. Ręczna zmiana → `Custom` (`matchQualityPreset`).

UI gracza: Pauza → Świat → Grafika. Benchmark: lil-gui + `?benchmark=<id>` (nie Vue).

JSON ostatniego raportu: `window.__seedvalePerfLastReport`.

## Scenariusze benchmarku

`current` · `settlement` · `forest` · `water` · `night` · `stress`

Po teleportcie: `waitForChunks` pierścienia load + 1 s settle (poza raportem). Domyślnie 30 s pomiaru. Stan (pose, `timeOfDay`, preset) jest przywracany.

## Weryfikacja w przeglądarce

1. Bez `?perf` — konsola bez per-frame logów; lil-gui Performance pokazuje draw calls / simulate / render jak wcześniej.
2. `?perf=1` albo Enable timings — p95 i loaded chunks ożywają; zmiana kategorii nie spamuje `console.log` (tylko warning+).
3. `?benchmark=current` — po starcie jeden blok `[Seedvale Benchmark]` + JSON; `window.__seedvalePerfLastReport` ustawione.
4. Pauza → Świat → Grafika: Low vs High zmienia skalę renderu / AO / odbicia **bez** rebuildu terenu.
