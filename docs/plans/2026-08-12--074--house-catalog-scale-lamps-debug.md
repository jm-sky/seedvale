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

1. Przy starcie wioski: `[house:lamp]` — `source`, `mount`, gotowy `paste:` do `houseCatalog.ts`.
2. Podejdź do domu — `[house:gaze]` z tym samym `paste:`.
3. `[E] Obejrzyj` — flavor + debug + `lampMount` w dialogu.
4. Jeśli drzwi za niskie: w `houseCatalog.ts` **obniż** `doorHeightFraction` (np. 0.20 → 0.18) albo podnieś `targetDoorHeight` / `maxHeight`.
5. Jeśli dom za duży względem placu: obniż `maxHeight` albo podnieś `doorHeightFraction`.
6. Wall lamp źle: wklej `lampMount: { x, y, z }` z konsoli do wpisu modelu (`source: catalog`).

**Nie ruszać** `worldConfig` / localStorage przy tej kalibracji — wysokości są w katalogu.

## Update (2026-08-12 playtest)

- `hut_d` height 9.0 → **8.2** (drzwi ~20 cm za wysokie).
- `hut_a/b/c` First Age: **brak ścian** — nadal w katalogu (OUTPOST/SM rare); lampy **floor-center** przy ziemi (NPC mieszkają).
- `hut_a` `groundYOffset: -0.2` (szary fundament).
- Lampy: `lampStyle` + opcjonalne `lampMount` (paste z konsoli). Wall: raycast → bbox provisional. Debug: `[house:lamp]` / gaze `[house:gaze]` z `paste:`.
- `towerhouse` nadal poza rotacją (wieża/flagi) — dlatego nie pojawiał się w wiosce.
- Blender / socket w GLB — awaryjnie później.