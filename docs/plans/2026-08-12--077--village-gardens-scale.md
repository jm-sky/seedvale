# Plan: Village gardens scale (S/M/L)

**Status:** `verification needed` 🔍  
**Created:** 2026-08-12  
**Priority:** 🟡 medium  
**Effort:** M  
**Depends on:** ~~047~~, ~~076~~

## Cel

Skala ogrodów z wielkością wioski: ~1 jednostka / 3 domy, pakowanie w wizualne S/M/L, clearings żeby drzewa nie rosły w grządkach.

## Zrobione (2026-08-12)

1. [`gardenScale.ts`](../../src/settlement/gardenScale.ts) — `gardenUnitsFromHouses`, `packGardenScales`, radii.
2. Planner — klastry z liczby domów; plot id `plot-infra-garden-{i}-{S|M|L}`; landmark `gardenScale`.
3. `ClearingLayout.gardens` + terrain clearings + `blocksPathOrClearing`.
4. Props — pętla ogrodów; `createGarden(S/M/L)`; `landmarks.gardens[]` + `garden` = primary.

## Done when

- [x] Packing + planner plots
- [x] Props S/M/L + landmarks
- [x] Trees avoid gardens
- [x] tsc (nasze pliki) / lint / test
- [ ] Browser: większa wioska → większy/więcej ogrodów; drzewa poza grządkami
