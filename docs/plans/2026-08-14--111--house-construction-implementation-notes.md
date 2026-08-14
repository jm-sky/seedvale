# Plan 111 — implementation notes

**Date:** 2026-08-14  
**Plan:** [2026-08-14--111--house-construction.md](./2026-08-14--111--house-construction.md)

## What landed

- `HouseDefinition` in `src/assets/houseDefinitionExample.ts` is the single data contract. Village homes: cottages 4×4 / 6×4 and medium houses 6×6 / 8×6 with explicit MegaKit cap roofs (`roundtiles_4x4` / `4x6` / `6x6`) plus `roof_front_brick*` gable infill on the two non-slope sides. Wall kits mix plaster, plaster-woodgrid and brick (door/window bays stay on verified plaster openings). Some variants add a `chimney` decoration. Assembly is uniformly scaled ×1.1. `TEST_HOUSE_01` remains the 4×2 wooden_2x1 unit-test house and is not used as a village home.
- `pickHouseDefinition` is size-aware: outposts stay on cottages; MD+ mix in 6×6 / 8×6 farmsteads.
- `src/settlement/houseBuilder.ts` resolves parts through the existing `ConstructionCatalog` / `loadGltf` cache. No second asset registry.
- Static repeats become per-house `InstancedMesh` buckets; after placement, `createHouseStaticBatch()` merges identical geometry+material across houses into settlement-owned InstancedMeshes. Doors stay interactive.
- Door: `door → hingePivot → doorLeaf`. `door_1_flat` hinge offset is **x = -0.51 m** (review 011). `setOpen` interpolates only `hingePivot.rotation.y`. Settlement `update` opens the door when the observer is near the entrance point.
- `buildSettlementProps()` uses `pickHouseDefinition → buildHouse → placeOnGround`. Native MegaKit metres — no `prepareProp` height-fit. `landmarks.houses` now carries `definitionId` + `footprintRadius` (`houseId` === `definitionId` for assembled houses). Colliders / Places / households / livestock / night lamps unchanged in ownership.
- `houseCatalog.ts` is kept: Asset Browser entries, lamp-mount tests, and GLB fallback if MegaKit templates fail to load.

## Not done (plan §9–10)

Browser visual check and `?perf=1` / settlement benchmark census vs review 012. Technical checks (`tsc`, unit tests, `vite build`) passed; do not treat that as visual proof.

## Cleanup left for later

`pickHomeHouse` / `resolveHouseHeight` are unused on the happy path but still required by the fallback and catalog tests. Do not delete `houseCatalog.ts` until the fallback and Asset Browser house group are explicitly retired.
