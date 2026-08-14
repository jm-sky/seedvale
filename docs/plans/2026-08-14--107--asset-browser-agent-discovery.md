# Plan 107: Asset Browser — discovery dla agenta (index, search, uczciwa skala)

**Status:** `planned`  
**Created:** 2026-08-14  
**Priority:** 🟡 medium  
**Effort:** `M`  
**Depends on:** ~~088~~  
**Review:** [008](../reviews/2026-08-14--008--asset-browser-modular-cottage.md)

## Po co

Review 008: kolejny agent **nie** dobierze części jednego modularnego domku z obecnego Asset Browsera. Narzędzie zostaje alignment browserem (plan 088). Ten plan dodaje warstwę **odnajdywania i uczciwego pomiaru** na istniejącym `AssetIndexEntry` + manifeście GLB.

Nie jest to system modularnych budynków, entrance/collider, ani wiring MegaKit do osad.

## Cel

Agent na `/asset-browser.html` potrafi w minutę odpowiedzieć:

1. jakie mamy ściany (i że `settlement:wall` to palisada, a MegaKit to mur 2×3.12 m),
2. które doorway walls są plaster vs brick,
3. czy są warianty dachu (dziś: zero — UI ma to powiedzieć),
4. jaka jest **authored** skala vs prepare runtime,
5. czy plik jest `wired` czy `parked`,
6. co jeszcze jest z tej samej paczki (`megakit/`),
7. czy z plików w `public/models/` da się złożyć kompletny domek (checklist ról — dziś nie).

## Poza zakresem

- Prefab domu, snap grid, settlement generation, physics z otworem.
- Nowa ontologia / osobny asset graph.
- Import brakujących GLB z pełnego MegaKit (dach, narożnik, okno, `Door_*`) — to backlog MODELS M01 + audyt 3D, nie ten plan.
- Authoring kotwic `entrance` / `SV_*` w GLB.
- Przeróbka grip editora / held preview (zostaje).

## Zakres v1 (P0 z review 008)

1. **Index parked** — `buildAssetIndex()` nadal źródło wired. Dodać wpisy z `/asset-browser-models.json` (albo na start tylko ` /models/settlement/megakit/`), `id` w stylu `parked:settlement/megakit/wall_plaster_straight`, `status: 'parked'`, `prepare: { mode: 'none' }`. Wagon (`/models/settlement/megakit/wagon.glb`) oznaczyć `wired` (już ładuje `props.ts`) zamiast duplikować jako parked.
2. **`AssetIndexEntry`** — opcjonalne `status?: 'wired' | 'parked' | 'extra'`, `pack?: string` (segment ścieżki). Bez nowego pliku registry. Opcjonalnie `kind` tylko dla znanej tabeli MegaKit README (wall / door / chimney / fence / prop) — mapowanie z nazwy pliku, nie ręczna baza 108 tagów.
3. **Search** w pickerze Reference i Target (jedno pole filtruje optgroupy). Puste zapytanie `roof` → 0 wyników, nie cisza.
4. **Free URL prepare `none`**, nie `fitMax: 1`. Toggle prepare przy slocie: none / height / fitMax (P1 jeśli v1 ma tylko none+istniejące wired).
5. **Reference ładuje Free URL** tak samo jak Target.
6. **Raport** — `reference_bounds` i `target_bounds` osobno; native AABB z modelu **przed** helperami; prepared AABB po `prepareProp*`. Nie jeden `bounds` z `setFromObject(slot.group)`.
7. **Labele** — pokazać `id` albo basename obok labela katalogu (`hut_d — Chata`). Koniec dwóch „Chałupa”.

## v1.1 (P1, ten sam plan jeśli zostaje czas)

- Materiały + tris + liczba klipów w raporcie (z już załadowanego `Object3D` / `animations`).
- Brak `HELD_SIDE_OFFSET`, gdy nie ma in-hand preview.
- Camera persist kluczem `referenceId|targetId|url`, nie globalnie.
- `settlement:wall` label np. `Wall segment (RTS palisade)` — zero nowej abstrakcji.

## Szkic plików

```text
src/assets/assetIndex.ts              # status/pack/kind; merge manifest parked; wagon wired
src/assets/assetIndex.test.ts         # unique ids; megakit obecny; wagon nie zduplikowany
src/tools/assetBrowser/ui/AssetBrowser.vue  # search; free URL na reference; prepare none
src/tools/assetBrowser/viewer/createAssetSlot.ts  # prepare none; getBounds bez Box3Helper
src/tools/assetBrowser/viewer/reportFromScene.ts  # per-slot native/prepared bounds
src/tools/assetBrowser/viewer/createViewer.ts     # offset tylko dla held; persist key
src/assets/alignmentReport.ts         # pola native_size_m / prepared_size_m (v2 raportu albo additive)
```

Manifest już serwuje `vite-plugin-asset-browser.ts` — reuse, nie drugi skan.

## Weryfikacja

Techniczna: `npx tsc --noEmit`, `npm run lint`, `npm run test` (index + alignment report).

Browser (użytkownik, nie headless):

1. `/asset-browser.html` — search `wall` pokazuje palisadę **i** `wall_plaster_*` / `wall_brick_*`.
2. Search `roof` → 0.
3. Load `parked:…/wall_plaster_straight` vs `wall_plaster_door` — oba ~2 × 3.12 × 0.4 m w raporcie, nie 1 m.
4. Load `house:hut_d` — label zawiera `hut_d`; AABB native ≠ 8.2 m (8.2 to prepare height).
5. Deep link `?url=/models/settlement/megakit/chimney.glb` nie fitMax-uje komina do 1 m.

## Definition of done

Agent bez znajomości drzewa katalogów potrafi: znaleźć MegaKit walls, odróżnić je od palisady, odczytać zgodną skalę 2 m, zobaczyć że dachu nie ma, zobaczyć że kit jest parked. Nie potrafi jeszcze złożyć domu w świecie — to nie ten plan.
