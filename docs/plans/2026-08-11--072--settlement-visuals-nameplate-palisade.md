# Plan: Settlement visuals — houses, nameplate, palisade seeds

**Status:** `done`
**Created:** 2026-08-11
**Priority:** 🟡 medium
**Effort:** M
**Depends on:** [031 — village generation](./2026-08-08--031--village-generation.md), [047 — village generation overhaul](./2026-08-09--047--village-generation-overhaul.md)

## Cel

Osada ma wyglądać jak miejsce, nie jak kilka „daszków" na płaskim placu: lepsze warianty domów z już pobranych GLB, tabliczka z nazwą przy studni, oraz skromne zaczątki muru/palisady przy wejściu (szczególnie dla małych wiosek — mały zakres).

## Zaimplementowane (2026-08-11)

1. **Domy** — `HUT_URLS` zaczyna od `hut_d` (Second Age) + `towerhouse`, potem First Age a/b/c; wysokość per typ.
2. **Tabliczka nazwy** — `createVillageNamepost` + CSS2D `def.name` obok studni (`createSettlement.ts`).
3. **Palisada** — `plantEntrancePalisade`: skrzydła `wall.glb` po bokach głównego wejścia z luką (OUTPOST=1…XL=4 segmenty/stronę).

## Done when

- [x] Domy używają Second Age / towerhouse jako części wariantów.
- [x] Przy studni widać nazwę osady.
- [x] Przy wejściu widać krótką palisadę z luką (brama).
- [ ] `tsc` / lint / testy przechodzą; weryfikacja wizualna w przeglądarce.
