# Plan: Większy stóg siana + ogród poza placem

**Status:** `verification needed` 🔍  
**Created:** 2026-08-13  
**Priority:** 🟡 medium  
**Effort:** S  
**Depends on:** ~~077~~, ~~082~~

## Cel

Stóg siana w wiosce ~2.5× większy. Ogrody poza ubitym placem we wszystkich wsiach (także nie-domowych).

## Zrobione (2026-08-13)

1. [`gardenScale.ts`](../../src/settlement/gardenScale.ts) — `gardenPlazaMinCenterDist(plazaR, scale)` = `plazaR + gardenPlotRadius + 1.5`.
2. Planner — `plazaR` przed pętlą ogrodów; `minCenterDist` / `preferredRing` od placu, nie od ułamka footprintu.
3. Props — per-ogród `gardenPlazaClear`; siano `height: 1.4`; fallback `createHayBale(2.5)`; offset `gardenPlotRadius + 1.4`.
4. Test planner: OUTPOST / SM / MD / LG / XL `isHome: false` — plot ogrodu ≥ plaza + plot radius.

## Done when

- [x] Hay ~2.5× (1.4 m) + offset poza grządkami
- [x] Planner + props clearance od `plazaCoreRadius`
- [x] Test planner
- [ ] Browser: home — większy stóg, ogród poza placem; wioska nie-domowa — ogród poza ubitym centrum (L nie nachodzi na plac)
