# Plan: Dig UX polish — held tool, channel, stone notice, level

**Created:** 2026-08-11
**Status:** `verification needed` (2026-08-11) — implemented and technically verified (`tsc`/`vue-tsc`/`lint`/`build`/`test`), not yet browser-verified.
**Follow-up to:** `2026-08-10--052--shovel-digging-and-finding-stones.md`

## Cel

Dopracować UX kopania po ręcznym teście 052:

- większy / głębszy dołek,
- ~2 s kanał z overlay,
- dwustopniowy loot kamienia (zauważenie → ekwipunek / ziemia; pełny ekwipunek → ziemia, nigdy strata),
- minimalny slot „narzędzie w ręce” + kompromisowy prompt HUD,
- akcja „Wyrównaj” (bez surowca ziemi).

## Co zostało zaimplementowane

### Held tool

- [`src/items/HeldTool.ts`](../../src/items/HeldTool.ts) — jeden slot tool (`knife` / `firestarter` / `shovel`).
- Inventory UI: Weź / Odłóż; HUD: `w ręce: …`.
- Persistencja: `SaveData` v7 pole `heldTool`.

### Dig size

- `DIG_RADIUS = 1.4`, `DIG_DEPTH_SOIL = 0.28`, `DIG_DEPTH_SAND = 0.14` w [`src/terrain/dig.ts`](../../src/terrain/dig.ts).

### Channel + overlay

- [`src/app/busyAction.ts`](../../src/app/busyAction.ts) + Vue [`BusyOverlay`](../../src/ui-vue/screens/BusyOverlay.vue).
- Modal `'busy'` blokuje input (bez przesuwania zegara dnia).
- `DIG_DURATION_SEC = 2`.

### Stone notice

- `resolveDigStone` + `STONE_NOTICE_CHANCE = 0.65`.
- Miss notice / full inventory → `droppedItems.drop('stone', …)`.
- Shared apply path: [`src/terrain/digAction.ts`](../../src/terrain/digAction.ts).

### Wyrównaj

- `ChunkManager.levelTerrain` + `sampleBaseHeight`; raise clamped to procedural base.
- HUD prompt preferuje „Wyrównaj” gdy jest depresja; dig inaczej.
- Quick Actions (gdy `has('shovel')`): Wykop dołek / Wyrównaj.

### UX wiring

- HUD only when `heldTool === 'shovel'`: **`E` = Wykop dołek**, **`R` = Wyrównaj** (prompt np. `[E] Wykop dołek · [R] Wyrównaj`).
- Menu akcji gdy gracz **posiada** łopatę (nawet bez trzymania).
- Touch: przycisk `R` obok `E`.

## Poza zakresem (bez zmian)

- Mesh narzędzia w dłoni.
- Surowiec `dirt`.
- Persistencja dołków.

## Weryfikacja techniczna

- `npx tsc --noEmit`, `npx vue-tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` (122/122) — czyste.

## Manual (browser)

1. Podnieś łopatę → w ekwipunku Weź → HUD pokazuje „w ręce: łopata” i prompt „Wykop dołek”.
2. Odłóż łopatę → brak promptu HUD; menu akcji nadal ma Wykop/Wyrównaj.
3. Kopanie trwa ~2 s z overlay „Kopanie…”, dołek wyraźnie większy/głębszy.
4. Przy pełnym ekwipunku / nie zauważonym kamieniu — kamień leży obok na ziemi.
5. Wyrównaj po dołku zbliża teren do bazy (bez pagórka ponad naturalną wysokość).
