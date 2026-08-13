# Plan: Ogród 2× + pad pod crops

**Created:** 2026-08-13  
**Status:** `done` ✅  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~077~~ ~~095~~ ~~099~~

## Cel

Powiększyć grządki `crops.glb` 2× i dopasować pad terenu (wyrównanie + brak trawy/drzew), żeby mesh siedział na clearing, a nie obok niego.

## Zrobione (2026-08-13)

1. [`propSpecs.ts`](../../src/settlement/propSpecs.ts) — `CROPS_FIT_MAX` 2.4 → 4.8.
2. [`props.ts`](../../src/settlement/props.ts) — `GARDEN_BED_W/D` 4.8 / 3.2; mesh na `clearings.gardens[gi]` (bez jittera).
3. [`gardenScale.ts`](../../src/settlement/gardenScale.ts) — `gardenPlotRadius` 4.8 / 6.4 / 8.4; `gardenClearingRadius` = obrys grządek + 1.2 (S/M/L ~4.1 / 6.4 / 8.9).
4. [`roadNetwork.ts`](../../src/settlement/roadNetwork.ts) — pad ogrodu jak pad domu (`houseHeightStrength` + pełny `tintStrength`); `innerFraction` 0.75 (place/domy 0.45), żeby ziemia została pod meshem.

Pszenica (`farm.glb`) bez zmian.

## Done when

- [x] Skala 2× (fit + beds + radii)
- [x] Mesh na padzie
- [x] Flatten + dirt tint (trawa gaśnie przez `roadTint`)
- [x] tsc / lint / test
- [x] Browser: home — grządki ~2×, ziemia płaska i bez trawy pod meshem, siano obok, drzewa poza padem
