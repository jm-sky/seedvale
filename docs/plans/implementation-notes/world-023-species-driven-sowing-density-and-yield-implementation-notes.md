# Implementation Notes: world-023 Species-Driven Sowing, Density and Yield

## Recon baseline

- `settlements-npcs-030` is already implemented. `src/settlement/settlementAgriculture.ts::resolveUnloadedHouseholdAgriculture()` consumes real seed items, reads `CROP_DEFS[cropId].matureAfterDays` / `yieldCount`, and deposits through `Household.depositFood()`. Treat it as an existing consumer, not a future dependency.
- Shared crop ownership is already correct: `src/world/cropLifecycle.ts` owns `CropId`, `CropDefinition`, `CROP_DEFS`, `CropPlacement`, lazy `resolveCropStage()` and `resolveCropHarvest()`.
- `CropPlacement` is already the common record for wild and planted crops. Do not add per-biological-plant records or state.
- `src/world/plantedCrops.ts` already centralizes `CROP_SEED_ITEM`, `FARM_SEED_PRIORITY`, shared footprint/separation, planted-id generation and save parsing. Keep density/yield out of NPC profession code.

## Recommended implementation shape

### Species semantics

Extend `CropDefinition` with one authoritative logical-population field (the plan's `logicalPlantsPerSowingUnit` name is suitable unless a clearer name emerges during implementation). Keep `yieldCount` as the base total yield for one mature `CropPlacement`.

Do not derive runtime entities from the logical count. The count is species/design data used to define the meaning of one sowing unit and to inform presentation; `resolveCropHarvest()` should remain a small shared resolver returning `def.yieldCount` for mature crops.

The implementation needs one explicit gameplay-data decision for each current species before changing `CROP_DEFS`: logical plants per sowing unit, base placement yield, and bounded rendered count. Keep those values together with the crop definition/presentation policy and cover them by tests; do not scatter constants through player/Farmer/aggregate paths.

### Planting and harvest paths

Do not restructure player planting. `src/app/actions/placementActions.ts` already removes exactly one `CROP_SEED_ITEM[cropId]`, calls `ChunkManager.plantCrop()`, and refunds on failure.

Do not restructure Farmer planting. `src/world/foodSources.ts::SettlementFoodSourceHooks.plant()` is already a thin `ChunkManager.plantCrop()` adapter and Farmer policy uses `FARM_SEED_PRIORITY` from `plantedCrops.ts`.

Preserve the existing modifier order for cultivated crops. `createFoodSourceHooks().harvest()` first receives the base `ChunkManager.harvestCrop()` outcome and only then applies `cultivationYieldCount(...)` for a matching player garden. Do not move care/hydration into `CropDefinition` or `resolveCropHarvest()`; doing so would also affect wild crops.

`resolveUnloadedHouseholdAgriculture()` already multiplies completed seed batches by `def.yieldCount`. Once `CROP_DEFS` changes, off-screen agriculture automatically shares the new base yield. Do not introduce an aggregate-specific yield table.

## Rendering decision

The current production renderer is still standalone: `src/terrain/chunkManager.ts` resolves the stage and creates one `createCropStageMesh(...)` `Object3D` per placement; the mesh carries placement id / crop definition id in `userData`. `src/world/cropVisuals.ts` clones/tints the ordinary item mesh and explicitly assumes sparse crops.

Do not implement logical density by cloning that Object3D N times. Add a pure deterministic layout resolver in the crop-visual/presentation layer, keyed from stable placement identity (`placement.id` + species is sufficient), with a hard small render budget. The same spatial offsets should survive stage changes; stage may change scale/material/template, not the random layout.

`buildInstancedProps()` is useful precedent but is not an ideal drop-in owner for crops: it batches immutable placement lists by template and supports keyed single-instance removal, while one crop placement may own multiple visual instances and crops can be planted at runtime. Prefer a small crop-specific wrapper only if needed, while reusing the same `THREE.InstancedMesh`/shared-geometry principles. Do not add a global crop render manager.

Keep interaction at placement level. Visual instances do not get interactables/colliders/IDs. Harvest removes one logical placement and all visual instances associated with that placement.

For runtime planting, simplest safe path is acceptable: update/rebuild only the loaded chunk's crop presentation, provided the cost is bounded by loaded chunk crop count. Do not introduce a permanent temporary-render subsystem unless profiling/code shape shows rebuilding the local crop batch is actually problematic.

Wild crops must keep `src/terrain/chunkCrops.ts` generation unchanged (`CROP_CANDIDATES_PER_CHUNK = 2`, sparse deterministic placements). If wild presentation needs a different visual count than planted sowing units, resolve that as presentation policy from placement provenance/ID or another stateless input; do not multiply wild `CropPlacement`s and do not create a second lifecycle.

## Persistence

`SavePlantedCrop` / `parsePlantedCrops()` already persist only `id`, `x`, `z`, `cropId`, `stageStartedAt`; that remains sufficient. Do not persist logical count, visual count, layout offsets or a visual RNG seed.

Current persistence baseline is `CURRENT_SAVE_VERSION = 41`. Repository policy says to bump when persisted representation **or semantics** change. This plan changes what an existing planted-crop record means, so treat it as a semantic migration: at implementation time re-check the current version, add exactly one next migration step, and keep the migration data-preserving/identity-like for `plantedCrops` (one legacy record remains one record of the same `cropId`). Do not fan out old placements into multiple records.

If another merged change advances the save version first, use that new current version; never hardcode `41` from these notes into implementation logic.

## Tests worth adding/updating

- `src/world/cropLifecycle.test.ts`: every crop has positive logical population/base yield; mature/young/spoiled behavior remains shared and unchanged except new species yields.
- `src/world/plantedCrops*`: `CROP_SEED_ITEM` is complete for every `CropId`; parsing remains unchanged.
- Player/Farmer planting tests: one seed item still creates exactly one `CropPlacement`.
- `src/settlement/settlementAgriculture*`: one aggregate seed batch uses the same `CROP_DEFS` base yield as detailed harvest.
- Crop visual tests: deterministic layout for the same placement, bounded instance count, same offsets across stages, all instances stay inside the logical placement footprint.
- Persistence migration test: legacy planted crops remain one-for-one with stable identity/crop/lifecycle anchor.

Do not add tests asserting `logicalPlantsPerSowingUnit === yieldCount` or rendered count equals either value; those are intentionally separate concepts.

## Pitfalls / scope guards

- The plan text has a couple of leftover references to "031"; they do not describe a separate dependency. This file is for `world-023`.
- Do not expand `CROP_PLANT_FOOTPRINT_RADIUS` / `CROP_PLANT_SEPARATION` just because visuals become denser. Fit presentation inside the existing footprint unless a deliberate gameplay-spacing change is separately justified.
- Do not change natural crop spawn frequency, Farmer work priority, garden hydration/care, seed recovery, crop suitability, seasons or field-capacity rules in this plan.
- No worker is justified: lifecycle remains lazy O(placements), aggregate agriculture is already bounded by crop species count, and presentation work is local to loaded chunks.

## Suggested implementation order

1. Finalize current-species logical population / base yield / visual-budget values and encode/test `CropDefinition`.
2. Add deterministic bounded crop visual-layout/presentation support and integrate it into the loaded-chunk crop path without changing interaction ownership.
3. Verify player, Farmer and aggregate agriculture all consume the same definition-derived base yield; change adapters only if a failing test exposes a real discrepancy.
4. Apply the required save semantic-version migration and migration tests.
5. Run focused crop/agriculture/persistence tests, then `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
