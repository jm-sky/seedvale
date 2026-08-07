# Brzeg jeziora w schodkach — twarde progi koloru terenu

**Status:** `done`
**Created:** 2026-08-07
**Updated:** 2026-08-07
**Źródło:** [reviews/2026-08-07-water-quality.md](../reviews/2026-08-07-water-quality.md) (Finding 1)

## Problem

`src/terrain/biomeColors.ts:38-47` klasyfikuje kolor terenu twardymi progami (`height <= waterLevel + 0.05` → seabed, `< waterLevel + 1.0` → sand). Kolor jest zapisany per-wierzchołek (`createTerrainMesh.ts`), Gouraud-interpolowany. Przy domyślnym configu (`size=128`, `resolution=193`) pas „sand" (1.0 jednostki) obejmuje ~1.5 wiersza wierzchołków → widoczne schodki wzdłuż linii brzegowej, niezależnie od maski wody (która jest per-fragment i dużo gładsza).

## Fix (kierunek)

Przenieść klasyfikację koloru brzegu na fragment/teksturę (analogicznie do `uHeightmap` DataTexture już używanej w `createWater.ts`) albo zmiękczyć progi (smoothstep zamiast `if`/`else`) tak, by szerokość pasa przejścia nie zależała wyłącznie od gęstości siatki terenu.

## Effort

Quick win, ~pół dnia. Część „Ścieżki 1" w powiązanym review.

## Implementacja (2026-08-07)

- `biomeColors.ts`: `colorForTerrain` — zastąpiono oba twarde progi (`if`/`else`) przez `THREE.MathUtils.smoothstep` na dwóch niezależnych pasmach:
  - seabed → sand: `smoothstep(height, waterLevel - 0.25, waterLevel + 0.25)` (poprzednio: skok przy `waterLevel + 0.05`, pasmo przejścia ≈ 0 jednostek)
  - sand → land: `smoothstep(height, waterLevel + SAND_BAND - 0.35, waterLevel + SAND_BAND + 0.35)` (poprzednio: skok przy `waterLevel + 0.6`)
- Kolor `land` (arid/humid blend) liczony raz do bufora (`landTmp`), bez dodatkowej alokacji per wierzchołek.
- `applySlopeRock` — bez zmian (poza zakresem Finding 1; jego własny hard-cutoff przy `waterLevel + 0.05` to osobna sprawa, nie zgłoszona w tym issue).
- `tsc --noEmit` i `npx eslint src/terrain/biomeColors.ts` czyste.

### Weryfikacja numeryczna

Policzono nachylenie koloru (RGB delta na jednostkę wysokości) wokół progu seabed→sand (`waterLevel=0.45`) dla starej i nowej implementacji:

- stara: max slope ≈ **801** (praktycznie nieciągłość — skok w obrębie < 0.001 jednostki)
- nowa: max slope ≈ **3.4** (rozłożone na ~0.5 jednostki, ciągłe)

To ~235× redukcja maksymalnego nachylenia — usuwa twardą krawędź, która przy siatce o rozstawie wierzchołków ~0.667 jednostki (default `size=128`, `resolution=193`) była węższa niż jedna komórka siatki i renderowała się jako ostra linia/schodek.

- Automatyczna sesja nie złapała dobrego ujęcia z wyraźnym pasem piasku (mały, stromy staw przy osadzie w polu widzenia). Użytkownik potwierdził wizualnie w przeglądarce, że brzeg wygląda dobrze (bez schodków) → status `done`.
