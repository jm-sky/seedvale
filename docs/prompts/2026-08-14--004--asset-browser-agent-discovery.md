# Seedvale — Asset Browser: discovery dla agenta (plan 107)

**Status:** `todo`  
**Created:** 2026-08-14  
**Plan:** [docs/plans/2026-08-14--107--asset-browser-agent-discovery.md](../plans/2026-08-14--107--asset-browser-agent-discovery.md)  
**Review (źródło tarcia):** [docs/reviews/2026-08-14--008--asset-browser-modular-cottage.md](../reviews/2026-08-14--008--asset-browser-modular-cottage.md)

## Cel

Zaimplementuj **plan 107 v1 (P0)**. Asset Browser zostaje narzędziem alignmentu (plan 088). Ta sesja dodaje warstwę **odnajdywania i uczciwego pomiaru**, żeby kolejny agent mógł dobrać części jednego modularnego domku bez znajomości drzewa katalogów.

Nie buduj systemu modularnych domów, collidera z otworem, entrance, ani nie podpinaj MegaKit do generatora osad.

## Przeczytaj najpierw

1. `CLAUDE.md`
2. `docs/STATE.md`
3. `docs/reviews/2026-08-14--008--asset-browser-modular-cottage.md` — **cały**, w tym §11 (kontynuacja po kopii 176 GLB)
4. `docs/plans/2026-08-14--107--asset-browser-agent-discovery.md`
5. `docs/assets/ANCHORS.md`
6. `public/models/settlement/megakit/README.md`
7. Kod: `src/assets/assetIndex.ts`, `src/tools/assetBrowser/` (szczególnie `ui/AssetBrowser.vue`, `viewer/createAssetSlot.ts`, `viewer/reportFromScene.ts`, `viewer/createViewer.ts`), `vite-plugin-asset-browser.ts`

## Stan, którego nie zgaduj

Stan **po** audycie 008 i konwersji MegaKit (ta sama data):

- W `public/models/settlement/megakit/` jest **176** GLB (pełny Standard kit, meshopt + WebP 512). Parked, poza `wagon.glb` (Kupiec).
- Manifest `/asset-browser-models.json` ma ~265 plików. Dropdown `buildAssetIndex()` nadal **~73 wired**.
- Search `roof` w manifeście daje **~39** plików — **nie 0**. Punkt weryfikacji w planie 107 „Search roof → 0” jest **przestarzały** (pisany przy 19 parked). Popraw plan przy implementacji: search `roof` ma pokazać dachy MegaKit jako `parked`, nie pusto.
- Import GLB z `_temp` **już zrobiony** — nie konwertuj packa od nowa. Punkt „Poza zakresem: Import brakujących GLB” w planie 107 jest zrealizowany wcześniej.
- Native ściana plaster/brick: **2.00 × 3.12 × 0.41 m**. Free URL dziś robi `fitMax: 1` i to niszczy tę skalę.

## Zrób (v1 / P0 z planu 107)

Trzymaj się planu. Priorytet:

1. Parked MegaKit (i/lub cały manifest) w tym samym pickerze co wired. `id` np. `parked:settlement/megakit/wall_plaster_straight`. `status: 'parked'`, `prepare: { mode: 'none' }`. `wagon.glb` = `wired`, bez duplikatu parked.
2. Rozszerz `AssetIndexEntry` o opcjonalne `status`, `pack`, ewentualnie `kind` z nazwy pliku MegaKit (wall/door/roof/window/…) — **nie** nowy registry i nie ręczna ontologia 265 tagów.
3. Pole search filtrujące pickery Reference i Target.
4. Free URL: `prepare: 'none'`, nie `fitMax: 1`. Wired wpisy zachowują swój dotychczasowy prepare.
5. Reference też ładuje Free URL.
6. Raport: osobne AABB reference i target; **native** (przed helperami) i **po prepare**. `getBounds()` nie może obejmować `Box3Helper`.
7. Labele z `id` albo basename (`hut_d — Chata`). Koniec dwóch identycznych „Chałupa”.

Jeżeli zostanie czas: v1.1 z planu (materiały/tris/klipy w raporcie; brak `HELD_SIDE_OFFSET` gdy nie ma in-hand; camera persist per para; label palisady RTS).

## Nie rób

- Prefab domu, snap grid, `SettlementsManager`, physics 097, kotwice `entrance` / `SV_*`.
- Nowy równoległy system assetów.
- Przepisywanie grip editora / held preview.
- Masowa zmiana istniejących GLB.
- Commit, chyba że użytkownik poprosi.

## Weryfikacja

Techniczna: `npx tsc --noEmit`, `npm run lint`, `npm run test`.

Browser — **nie** odpalaj headless Chrome jako domyślnego testu. Podaj użytkownikowi kroki na już działający `npm run dev` (`localhost:5577`):

1. `/asset-browser.html` — search `wall` pokazuje palisadę RTS **i** `wall_plaster_*` / `wall_brick_*`.
2. Search `roof` pokazuje dachy MegaKit (`parked`), nie pusto.
3. Para `wall_plaster_straight` vs `wall_plaster_door_flat` — raport ~2 × 3.12 × 0.4 m, **nie** 1 m.
4. `house:hut_d` — label zawiera `hut_d`; native AABB ≠ prepare height 8.2 m.
5. `?url=/models/settlement/megakit/chimney.glb` nie skaluje komina do 1 m.

Po implementacji: status planu 107 → `verification needed`; krótka notatka w planie (co weszło z v1 / v1.1). Review 008 zostaw jako audit — nie przepisuj go na specyfikację.

## Definition of done

Agent bez znajomości `public/models/` potrafi: znaleźć ściany MegaKit, odróżnić je od palisady, odczytać skalę 2 m, zobaczyć warianty dachu, zobaczyć `parked` vs `wired`. Nadal **nie** składa domu w świecie.
