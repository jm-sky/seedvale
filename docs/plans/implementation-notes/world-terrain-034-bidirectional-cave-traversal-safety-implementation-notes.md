# Implementation Notes: Bidirectional cave traversal safety

**Plan:** `world-terrain-034-bidirectional-cave-traversal-safety.md`  
**Reviewed against:** `main`, 2026-09-15

## Recon conclusion

Problem jest w reprezentacji floor, nie w topology ani player slope limicie. `productionTopology.ts` już ogranicza centerline przez `MAX_TRAVERSABLE_FLOOR_GRADE`, a `productionTopology.floor-continuity.test.ts` ma dwa istniejące `it.fails` dla seed `1136726869`, gdzie finalny heightfield koncentruje descent na granicy widening/chamber. Implementacja powinna naprawić `CaveHeightfieldRepresentation`, a nie dodawać escape/teleport ani podnosić `SLOPE_MAX_WALKABLE_DEG`.

## Existing mechanisms to reuse

- `buildProductionCaveTopology(...)` / `MAX_TRAVERSABLE_FLOOR_GRADE` — authority dla planowanej trasy.
- `buildCaveHeightfieldRepresentation(...)` — jedyne miejsce, gdzie topology staje się gameplay floor.
- `queryHeightfieldGround(...)` — production gameplay query używane też przez testowy `gameplayFloorProfile(...)`.
- `mouthCarveDepth(...)` — surface/portal transition; nie zastępować osobnym entrance fixem bez potrzeby.
- `SLOPE_MAX_WALKABLE_DEG` — physical player walkability authority.

## Implementation decisions

1. Naprawić sposób blendowania/interpolacji floor lobes w `caveHeightfieldRepresentation.ts` tak, aby zmiana wysokości wynikająca z centerline była rozłożona po dostępnej długości segmentu zamiast skupiana przy boundary.
2. Nie post-processować heightfieldu niezależnie od topology. Rendering/query/occupancy muszą nadal wynikać z tej samej reprezentacji.
3. Zachować portal/mouth jako osobny przypadek tylko tam, gdzie obecne `mouthCarve` tego wymaga; invariant walkability obejmuje także możliwość powrotu do surface.
4. Testować finalny sampled floor z małym krokiem XZ. Sam `maxCenterlineFloorGrade(...)` nie wystarcza.
5. Kierunek ruchu nie zmienia matematycznego grade, ale test `interior -> entrance` powinien przejść przez ten sam rzeczywisty query path, żeby złapać asymetrie ground snap/portal transition.

## Files / symbols

- `src/world/caves/caveHeightfieldRepresentation.ts` — główna implementacja.
- `src/world/caves/caveHeightfieldQuery.ts` — query contract, zmieniać tylko jeśli reprezentacja ujawnia realny błąd query.
- `src/world/caves/productionTopology.ts` — reference/invariant, nie rozszerzać scope bez dowodu.
- `src/world/caves/productionTopology.floor-continuity.test.ts` — istniejące fixtures i `gameplayFloorProfile(...)`; dwa `it.fails` mają po fixie stać się `it`.
- `src/world/caves/mouthCarve.ts` — entrance transition.
- `src/terrain/slopeConstraint.ts` — `SLOPE_MAX_WALKABLE_DEG`.

## Verification order

1. Najpierw odtworzyć seed `1136726869` i potwierdzić, że oba `it.fails` rzeczywiście przechodzą po zmianie.
2. Zamienić je na zwykłe `it` dopiero po fixie.
3. Dodać bounded multi-seed test finalnego heightfield floor dla wszystkich głównych segmentów i drogi powrotnej do entrance.
4. Uruchomić istniejące cave topology/query tests.

Browser verification wykonuje User.
