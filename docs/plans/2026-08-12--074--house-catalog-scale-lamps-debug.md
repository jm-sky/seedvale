# Plan: House catalog — per-model scale, lamps, examine/debug

**Status:** `verification needed` 🔍
**Created:** 2026-08-12
**Priority:** 🔴 high
**Effort:** M
**Depends on:** ~~072~~, issue [018](../issues/2026-08-12--018--house-scale-vs-npc.md)

## Cel

Traktować każdy wariant domu osobno (wysokość, lampa, rola), zamiast jednej globalnej skali. Umożliwić identyfikację modelu w grze przy debugowaniu.

## Zrobione

1. **`houseCatalog.ts`** — tabela per `hut_a/b/c/d` + `towerhouse` + fallback: `doorHeightFraction` / `targetDoorHeight` → `resolveHouseHeight()`, lamp fractions, `label`, `examine`, `useAsHome`.
2. **`towerhouse` wyłączony z rotacji domów rodzinnych** (`useAsHome: false`) — wygląda jak wieża z flagami, nie jak chata.
3. **Lampy** — przywrócony prawdziwy `findWallMount` (XZ + wysokość z raycastu); usunięty hack `displacementFactor = 0`.
4. **`[E] Obejrzyj: …`** + `?debug=1` (dialog + `console.info`); przy gaze też `[house:gaze]` w konsoli (bez spamu).

## Jak debugować / kalibrować

```text
http://localhost:5577/?debug=1
```

1. Podejdź do domu — w konsoli: `[house:gaze] { id, model, label }`.
2. `[E] Obejrzyj` — flavor + `[debug] hut_a · /models/...`.
3. Jeśli drzwi za niskie: w `houseCatalog.ts` **obniż** `doorHeightFraction` (np. 0.20 → 0.18) albo podnieś `targetDoorHeight` / `maxHeight`.
4. Jeśli dom za duży względem placu: obniż `maxHeight` albo podnieś `doorHeightFraction`.

**Nie ruszać** `worldConfig` / localStorage przy tej kalibracji — wysokości są w katalogu.

## Done when

- [x] Katalog per model
- [x] Lampy na ścianie, nie w powietrzu
- [x] Identyfikacja modelu w debug
- [ ] Ręczna kalibracja wysokości po `?debug=1` (user)
