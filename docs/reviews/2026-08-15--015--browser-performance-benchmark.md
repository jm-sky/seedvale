# Review 015: Browser performance benchmark

**Status:** `done`  
**Date:** `2026-08-15`

## Scope

Powtórzenie istniejących browser benchmarków `?benchmark=*` po zmianach ocenionych w [review 013](./2026-08-15--013--architecture-and-performance-audit.md), bez nowej instrumentacji i bez optymalizacji.

## Environment

- Cursor embedded browser + CDP. Natywny viewport przed override: 468×228, `devicePixelRatio=1.25`.
- Dopasowanie do [review 010](./2026-08-14--010--perf-benchmark-data.md): `Emulation.setDeviceMetricsOverride` → canvas **1068×906**, `deviceScaleFactor=1`. Raporty: `pixelRatio=1`.
- `quality: High` (wymuszone przez `src/perf/benchmark.ts`), `seed=42`, terrain mesh **Insane (193)**, `loadRadius=3`.
- URL: `http://localhost:5577/?benchmark=<scenario>&seed=42&res=193`. Czas pomiaru: **30 s**. Wynik: `window.__seedvalePerfLastReport`.
- `?benchmark=` omija menu **Kontynuuj** (ścieżka unattended z review 012).
- Vite `:5577` uruchomiony na start sesji. Brak HMR w trakcie sześciu runów.
- `current` użył zapisanej pozycji gracza (76 chunków, 42 NPC) — cięższy kontekst niż 010 `current` (55 / 13).

## Results

| Scenario | FPS avg | Frame p95 | RENDER | WATER | NPC | FAUNA | Chunks |
|---|---:|---:|---:|---:|---:|---:|---:|
| current | 50.7 | 30.8 | 11.9 | 3.8 | 2.6 | 0.5 | 76 |
| settlement | 48.5 | 31.1 | 13.3 | 3.8 | 2.3 | 0.4 | 55 |
| forest | 81.4 | 16.5 | 7.2 | 2.9 | 0.9 | 0.5 | 57 |
| water | 61.8 | 25.5 | 11.6 | 2.6 | 0.9 | 0.5 | 54 |
| night | 65.9 | 23.1 | 11.1 | 2.0 | 0.9 | 0.5 | 55 |
| stress | 90.4 | 17.0 | 7.3 | 1.7 | 0.8 | 0.5 | 57 |

Dodatkowe pola z tego samego raportu:

| Scenario | FPS min / p1 | Frame avg / max | PHYSICS | npcCount | faunaCount |
|---|---|---|---:|---:|---:|
| current | 15 / 25 | 19.7 / 68.9 | 0.1 | 42 | 24 |
| settlement | 21 / 27 | 20.6 / 46.8 | not measured | 43 | 24 |
| forest | 1 / 44 | 12.3 / 1816.4 | 0.1 | 12 | 24 |
| water | 3 / 32 | 16.2 / 374.8 | not measured | 13 | 24 |
| night | 28 / 37 | 15.2 / 35.9 | not measured | 13 | 24 |
| stress | 23 / 43 | 11.1 / 43.5 | 0.1 | 12 | 24 |

`PHYSICS` poniżej progu raportu (`< 0.05 ms`) oznaczono `not measured`. Tablica `hitches` była pusta we wszystkich sześciu raportach.

| Scenario | Metric | 010 | 015 | Change |
|---|---|---:|---:|---:|
| current | FPS avg | 51.9 | 50.7 | −1.2 |
| settlement | FPS avg | 42.7 | 48.5 | +5.8 |
| water | FPS avg | 37.9 | 61.8 | +23.9 |
| night | FPS avg | 42.3 | 65.9 | +23.6 |
| stress | FPS avg | 75.4 | 90.4 | +15.0 |

## Findings

**Measured**

- RENDER pozostaje głównym kosztem we wszystkich scenariuszach (7.2–13.3 ms). WATER jest istotny, ale niższy niż w 010 (1.7–3.8 ms vs 3.5–7.7 ms). NPC/FAUNA przy obecnej populacji zostają tanie (NPC 0.8–2.6 ms, FAUNA 0.4–0.5 ms), także przy 42–43 NPC w `current`/`settlement`.
- Średni FPS wzrósł w 5/6 scenariuszach vs 010; `current` jest praktycznie płaski, ale przy wyraźnie cięższym zapisie (76 chunków / 42 NPC vs 55 / 13).
- Oczywiste zacięcia: `forest` max 1816 ms (FPS min 1), `water` max 375 ms. Pole `hitches` nie oznaczyło ich jako STREAMING. `settlement` max 46.8 ms vs 192.9 ms w 010.

**Static analysis**

- Ten benchmark nie mówi nic o skalowaniu O(N²). [Issue 031](../issues/2026-08-15--031--unbounded-proximity-scans-fauna-settlement.md) **nie wymaga działania teraz** — przy N≈12–43 koszt NPC/FAUNA zostaje daleko za RENDER/WATER, zgodnie z werdyktem review 013.

## Conclusion

`monitor`

GPU/water wyglądają lepiej niż w 010 przy zbliżonym canvasie. Streaming nadal potrafi dać wieloset-milisekundowe (i w `forest` ~2 s) klatki po teleportach scenariusza. Issue 031 zostaje odłożone do momentu, gdy populacja NPC/fauny będzie celem, nie pomiarem.

## Known limitations

- Embedded browser Cursor; bez CDP override canvas był 468×228 @ dpr 1.25.
- `current` i `settlement` mają więcej NPC niż te same nazwy w 010 (42–43 vs 13) — zapis świata się zmienił.
- Nie uruchamiano `?benchmark=stream` (poza zakresem tej sesji).
