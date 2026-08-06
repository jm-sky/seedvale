# Brzeg jeziora w schodkach — twarde progi koloru terenu

**Status:** `todo`
**Created:** 2026-08-07
**Źródło:** [reviews/2026-08-07-water-quality.md](../reviews/2026-08-07-water-quality.md) (Finding 1)

## Problem

`src/terrain/biomeColors.ts:38-47` klasyfikuje kolor terenu twardymi progami (`height <= waterLevel + 0.05` → seabed, `< waterLevel + 1.0` → sand). Kolor jest zapisany per-wierzchołek (`createTerrainMesh.ts`), Gouraud-interpolowany. Przy domyślnym configu (`size=128`, `resolution=193`) pas „sand" (1.0 jednostki) obejmuje ~1.5 wiersza wierzchołków → widoczne schodki wzdłuż linii brzegowej, niezależnie od maski wody (która jest per-fragment i dużo gładsza).

## Fix (kierunek)

Przenieść klasyfikację koloru brzegu na fragment/teksturę (analogicznie do `uHeightmap` DataTexture już używanej w `createWater.ts`) albo zmiękczyć progi (smoothstep zamiast `if`/`else`) tak, by szerokość pasa przejścia nie zależała wyłącznie od gęstości siatki terenu.

## Effort

Quick win, ~pół dnia. Część „Ścieżki 1" w powiązanym review.
