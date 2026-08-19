# Review 016: GPU-fix runtime verification (pre-streaming plan)

**Status:** `done`  
**Date:** `2026-08-15`  
**Scope:** Czy poprawki z `c4c8c9d` / `94874a5` / `080fd3f` są obecne w kodzie **i aktywne** podczas `?benchmark=*`. Bez implementacji.  
**Not in scope:** audyt wydajności, Issue 031, zmiana instrumentacji.

## Environment

- Vite `:5577`, Cursor embedded browser + CDP.
- `Emulation.setDeviceMetricsOverride` → 1068×906, `deviceScaleFactor=1` (jak review 015).
- `?benchmark=settlement&seed=42&res=193` (High wymuszone przez `src/perf/benchmark.ts`).
- Dodatkowo `?benchmark=stream&seed=42&res=193` — tylko jako kontekst hitchy streamingu (plan 119); ten review nie ocenia hitchy.

Ta sesja miała wyraźnie słabszy embedded GPU/CPU niż review 015 (`settlement` FPS avg 14.9 vs 48.5). Liczby FPS z tego runu **nie zastępują** 015. Poniżej: flagi runtime i census, nie nowy baseline FPS.

## Results

| Area | Fix present? | Active in benchmark? | Conclusion |
|---|---|---|---|
| N8AO | tak | **AO ON**, nie OFF | **fixed but later superseded** |
| Shadows | tak | tak (kolejność w `gameLoop`) | **fixed and verified** (kod + kolejność renderu) |
| Water mirror | tak | tak | **fixed and verified** |
| Settlement construction | tak | tak (census) | **fixed and verified** — wysoki draw count nadal oczekiwany |

## 1. N8AO

`c4c8c9d` wyłączył AO na High (`aoEnabled: false`). `080fd3f` **włączył je z powrotem**: High = `aoEnabled: true`, `aoQuality: 'Performance'`, half-res, auto-suppress gdy last-frame Render ≥ 15 ms (`src/render/aoBudget.ts`).

Benchmark zawsze woła `applyQualityPreset('High')` (`src/perf/benchmark.ts`). localStorage nie wygrywa z tym — preset High nadpisuje gałki na czas runu.

Runtime podczas `?benchmark=settlement` (lil-gui Post-processing):

- Quality preset = `High`
- Ambient occlusion = **checked**
- AO quality = `Performance`
- AO radius 2 / intensity 3

Dlaczego AO jest ON: `080fd3f` celowo przywrócił AO na High (High bez AO wyglądał gorzej niż Medium). Auto-budget gasi AO na ciężkich klatkach; przy Render ~35 ms w tym runie isolacja `no-ao` nic nie zyskała (AO i tak było stłumione).

## 2. Shadows

Intencja `080fd3f`: **jeden** update shadow mapy na klatkę, **po** mirrorze, przed beauty.

Runtime flow (`src/app/gameLoop.ts`):

1. `renderer.shadowMap.autoUpdate = false` (na starcie pętli)
2. `ocean.renderMirror()` — wewnątrz też `autoUpdate = false` na czas `renderer.render(scene, mirrorCamera)` (`src/world/waterMirror.ts`)
3. `renderer.shadowMap.needsUpdate = true`
4. `postProcessing.render()` (beauty + N8AO + SMAA + …)

Asset browser nie idzie przez `gameLoop` i zostaje przy domyślnym `autoUpdate` — poza benchmarkiem.

Nie odczytano żywej instancji `WebGLRenderer.shadowMap` z heapu; kolejność w źródle jest jednoznaczna. Wysoka liczba draw calli ≠ wielokrotny shadow pass.

## 3. Water mirror

`94874a5` + `080fd3f`:

| Knob | Runtime |
|---|---|
| RT size | `WATER_MIRROR_SIZE = 128` |
| Częstotliwość | `MIRROR_MAX_HZ = 30` |
| NPC/fauna | `AGENT_RENDER_LAYER = 2`; kamera lustra zostaje na warstwie 0 |
| GUI podczas benchmarku | Water reflections = **on** |

`settlement` w tej sesji: `mirrorDrawCallsAvg = 472` przy `drawCallsAvg = 1482`. Przy ~15 FPS lustro i tak idzie co klatkę (klatka > 33 ms). Isolacja `no-reflections`: draws 1464 → 992.

## 4. Construction Catalog / settlement

Instancing z `080fd3f` / planu 111 jest aktywne. Census `settlement` (ta sesja):

| | Review 012 | Ta sesja |
|---|---:|---:|
| settlement draws | 567–780, prawie wszystkie nieinstanced | **458** |
| instanced meshes | — | **76** |
| instances | — | **770** |

Co jest instanced (kod, bez redesignu):

- palisada, krzaki pasa leśnego, beczki, stogi — `buildInstancedProps` w `src/settlement/props.ts`
- statyczne części domów — `instantiateStatics` + `createHouseStaticBatch` w `src/settlement/houseBuilder.ts`

Co zostaje osobnymi meshami (oczekiwane): drzwi (hinge), światła/torche, studnia, wóz, ognisko, ścinane drzewa osady, unikalne submeshe MegaKit, NPC.

Wysoki draw count osad **jest oczekiwany** przy obecnym pipeline House Buildera — nie jest dowodem, że `080fd3f` nie działa.

## Findings

1. **N8AO nie jest wyłączone w benchmarku High.** `c4c8c9d` zostało nadpisane przez `080fd3f`. To nie jest regresja względem planu 113 — to jego P0.
2. Cień raz/klatkę i lustro 128² / 30 Hz / bez agentów są w ścieżce renderu benchmarku.
3. Instancing osady działa; 458 settlement draws vs 567–780 w 012.

Streaming hitchy: osobno w [plan 119](../plans/archive/2026-08-15--119--chunk-streaming-performance.md).
