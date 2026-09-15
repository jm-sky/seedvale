# Implementation Notes: Bidirectional cave traversal safety

**Plan:** `world-terrain-034-bidirectional-cave-traversal-safety.md`  
**Reviewed against:** `main`, 2026-09-15  
**Implemented:** 2026-09-15

## Recon conclusion

Problem jest w reprezentacji floor, nie w topology ani player slope limicie. `productionTopology.ts` już ogranicza centerline przez `MAX_TRAVERSABLE_FLOOR_GRADE`, a `productionTopology.floor-continuity.test.ts` miał dwa `it.fails` dla seed `1136726869`, gdzie finalny heightfield koncentrował descent na granicy widening/chamber.

## Seam that shipped

Chamber/widening lobes keep their ellipse silhouette and local `dy`, but **floor axis Y** is no longer constant `node.y + dy`. At each sample, `axisY` is the nearest interpolated Y on incident-segment centerlines (`resampleSegmentStations`) plus `dy`. The drop therefore follows the topology ramp instead of the lobe rim band (~0.35–0.9 m). Ceiling/width union is unchanged. No heightfield post-process, query change, mouth rewrite, or slope-limit bump.

`queryHeightfieldGround` at the exact entrance coordinates is still not cave ground (portal lip / `mouthCarve`); interior→entrance tests walk back to the inward end of the entrance segment.

## Existing mechanisms reused

- `buildProductionCaveTopology(...)` / `MAX_TRAVERSABLE_FLOOR_GRADE` — planned route.
- `buildCaveHeightfieldRepresentation(...)` / `buildChamberLobes(...)` — gameplay floor.
- `queryHeightfieldGround(...)` — sampled by `gameplayFloorProfile(...)`.
- `SLOPE_MAX_WALKABLE_DEG` — walkability cap in tests (`FLOOR_GRADE_LIMIT`).

## Verification

- Seed `1136726869` widening→chamber and all interior segments: former `it.fails` are now `it`.
- Reverse `gameplayFloorProfile` on interior segments + main route from chamber to mouth interior.
- Bounded seeds `[42, 99, 7, 1]` with the same heightfield grade invariant.
- Also green: `caveHeightfieldRepresentation`, `caveHeightfieldQuery`, `productionTopology`, `caveHabitat`, `caveGroundQuery`.

Browser verification wykonuje User.
