# Review 010: Performance benchmark raw data

**Status:** `done`  
**Date:** 2026-08-14  
**Scope:** diagnostyka wydajności obecnego builda przez `src/perf/` — surowe wyniki, bez zmian w kodzie i bez wniosków o bottleneckach.  
**Not in scope:** analiza, optymalizacje, poprawki instrumentacji.

## Environment

- Cursor embedded browser (nie pełne okno). Canvas na starcie ~940×607, później 1068×906, `dpr=1`.
- `quality: High`, `pixelRatio: 1`.
- Zapis: seed `42`, terrain mesh **Insane (193)**, 73 728 tris/chunk, load radius 3.
- Każdy URL `?benchmark=*` i `?perf=1` wymagał kliknięcia **Kontynuuj** na menu startowym.
- Czas automatycznego pomiaru: 30 s (`src/perf/benchmark.ts`).
- Wynik: `window.__seedvalePerfLastReport`.

## Benchmark results

### `current`

```json
{"durationSec":30,"quality":"High","pixelRatio":1,"scenario":"current","fps":{"avg":51.9,"min":16,"p1":23},"frameTime":{"avg":19.3,"p95":27.5,"max":63.6},"rendering":{"drawCallsAvg":1,"drawCallsMax":1,"trianglesAvg":1},"systems":{"WATER":5,"NPC":0.7,"FAUNA":0.4,"RENDER":12.5},"bottlenecks":["RENDER","WATER","NPC"],"spikes":[],"recommendation":"RENDER is the primary sustained bottleneck.","context":{"loadedChunks":55,"npcCount":13,"faunaCount":22,"pixelRatio":1,"quality":"High"}}
```

### `settlement`

```json
{"durationSec":30,"quality":"High","pixelRatio":1,"scenario":"settlement","fps":{"avg":42.7,"min":5,"p1":26},"frameTime":{"avg":23.4,"p95":32,"max":192.9},"rendering":{"drawCallsAvg":1,"drawCallsMax":1,"trianglesAvg":1},"systems":{"WATER":6,"NPC":0.8,"FAUNA":0.4,"RENDER":15.4},"bottlenecks":["RENDER","WATER","NPC"],"spikes":[],"recommendation":"RENDER is the primary sustained bottleneck.","context":{"loadedChunks":55,"npcCount":13,"faunaCount":22,"pixelRatio":1,"quality":"High"}}
```

### `forest`

```json
{"durationSec":30,"quality":"High","pixelRatio":1,"scenario":"forest","fps":{"avg":71.2,"min":4,"p1":33},"frameTime":{"avg":14,"p95":19.1,"max":244.8},"rendering":{"drawCallsAvg":1,"drawCallsMax":1,"trianglesAvg":1},"systems":{"WATER":3.7,"NPC":0.8,"FAUNA":0.5,"RENDER":8.3},"bottlenecks":["RENDER","WATER","NPC"],"spikes":[{"category":"RENDER","count":10}],"recommendation":"RENDER is the primary sustained bottleneck.","context":{"loadedChunks":57,"npcCount":12,"faunaCount":22,"pixelRatio":1,"quality":"High"}}
```

### `water`

```json
{"durationSec":30,"quality":"High","pixelRatio":1,"scenario":"water","fps":{"avg":37.9,"min":17,"p1":21},"frameTime":{"avg":26.4,"p95":39.2,"max":57.2},"rendering":{"drawCallsAvg":1,"drawCallsMax":1,"trianglesAvg":1},"systems":{"WATER":7.7,"NPC":1.1,"FAUNA":0.5,"PHYSICS":0.1,"RENDER":16.3},"bottlenecks":["RENDER","WATER","NPC"],"spikes":[],"recommendation":"RENDER is the primary sustained bottleneck.","context":{"loadedChunks":54,"npcCount":13,"faunaCount":21,"pixelRatio":1,"quality":"High"}}
```

### `night`

```json
{"durationSec":30,"quality":"High","pixelRatio":1,"scenario":"night","fps":{"avg":42.3,"min":20,"p1":24},"frameTime":{"avg":23.7,"p95":32.8,"max":51},"rendering":{"drawCallsAvg":1,"drawCallsMax":1,"trianglesAvg":1},"systems":{"WATER":5.5,"NPC":1,"FAUNA":0.5,"PHYSICS":0.1,"RENDER":15.8},"bottlenecks":["RENDER","WATER","NPC"],"spikes":[],"recommendation":"RENDER is the primary sustained bottleneck.","context":{"loadedChunks":55,"npcCount":13,"faunaCount":22,"pixelRatio":1,"quality":"High"}}
```

### `stress`

```json
{"durationSec":30,"quality":"High","pixelRatio":1,"scenario":"stress","fps":{"avg":75.4,"min":31,"p1":47},"frameTime":{"avg":13.3,"p95":16.3,"max":31.8},"rendering":{"drawCallsAvg":1,"drawCallsMax":1,"trianglesAvg":1},"systems":{"WATER":3.5,"NPC":0.7,"FAUNA":0.5,"RENDER":7.8},"bottlenecks":["RENDER","WATER","NPC"],"spikes":[{"category":"RENDER","count":8}],"recommendation":"RENDER is the primary sustained bottleneck.","context":{"loadedChunks":57,"npcCount":12,"faunaCount":22,"pixelRatio":1,"quality":"High"}}
```

Pola `bottlenecks` / `recommendation` pochodzą z `buildReport()` — to treść JSON, nie werdykt tej sesji.

Anomalia we wszystkich raportach: `drawCallsAvg` / `drawCallsMax` / `trianglesAvg` = `1`.

## Manual observations

Test: `?perf=1`, sprint WASD, start w **Osada Brzozowa** (noc), dojście do **Dolina Zielona**. Performance GUI (`Enable timings` włączone):

- **Osada, stanie / chodzenie między NPC:** FPS ~56 → ~31, p95 ~23.6 ms, Simulate 2–3.2 ms, Render 15.8 → 28.7 ms, chunks 55 → 59. Krótkie zacięcia przy ruszaniu.
- **Wyjście z osady + nowy teren / trawa:** wyraźne, wielosekundowe hitch’e przy sprincie (chunks 59 → 68 → 75). Performance GUI w ruchu: FPS ~24–42, p95 27–42 ms, Render 20–37 ms, Simulate 3.2–4.7 ms.
- **Dzień, obserwacja w Dolinie Zielonej (stanie, NPC w kadrze):** HUD `09:45 dzień`, FPS **19.6**, p95 **40.5 ms**, Render **47.7 ms**, Simulate 3.4 ms, chunks 75, geometries 884, textures 632. Widoczne zacięcia przy przełączeniu czasu i staniu.
- **Noc, ta sama lokacja (stanie):** HUD `01:19 noc`, FPS **34**, p95 **38.2 ms**, Render **25.3 ms**, Simulate 4.1 ms, chunks 75, geometries 906, textures 635. Spokojniej niż dzień w tym samym miejscu; bez wielosekundowych stalli.
- Draw calls / triangles w GUI cały czas **1**; geometries/textures rosną (start ~537/271 → koniec ~906/635).

## Execution problems

- Dev server na `:5577` nie działał na starcie sesji — uruchomiony `pnpm dev`.
- `?benchmark=*` i `?perf=1` zatrzymują się na menu startowym; benchmark startuje dopiero po **Kontynuuj**.
- Pierwszy `water` został zerwany przez Vite HMR (`page reload` m.in. `createApp.ts`, `AnimalAgent.ts`, `createSettlement.ts` o 12:36:40). Ponowiony; `water` / `night` / `stress` mogły pójść na innym snapshotcie plików niż `current` / `settlement` / `forest`.
- Pomiar w embedded browserze Cursor, nie w pełnym oknie.
- `rendering.drawCalls*` / `trianglesAvg` w raportach i GUI są stale `1` — licznik wygląda na zepsuty, nie na realną geometrię.
- Część ręcznych zacięć mogła być podbita przez screenshot/CDP w trakcie testu (jeden sample ~6 s zbiegł się ze zrzutem).
