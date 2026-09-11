# Symbols

Generated from exported TypeScript symbols.

## `terrain/biomeColors.ts`

- `applyMicroTint` — function — line 275
- `applyMountainRock` — function — line 202
- `applyOceanDepthTint` — function — line 225
- `applyRoadTint` — function — line 246
- `applySlopeRock` — function — line 168
- `colorForTerrain` — function — line 128
- `landBlendForSandBand` — function — line 54
- `ROCK_SLOPE_FULL` — const — line 62
- `ROCK_SLOPE_START` — const — line 61
- `SAND_BAND` — const — line 22
- `SAND_BAND_MAX` — const — line 20
- `SAND_BAND_MIN` — const — line 18
- `sandBandAt` — function — line 47
- `terrainTintNoise` — function — line 269

## `terrain/biomeRegions.ts`

- `BiomeWeights` — type — line 4
- `biomeWeightsAt` — function — line 28
- `ForestBiome` — type — line 139
- `forestBiomeAt` — function — line 157
- `forestDensityAt` — function — line 102

## `terrain/bloodOverlay.ts`

- `BloodOverlayPlacement` — type — line 31
- `BloodOverlaySystem` — type — line 41
- `createBloodOverlaySystem` — function — line 156

## `terrain/buildChunkGeometry.ts`

- `buildChunkGeometry` — function — line 414
- `ChunkMeshResult` — type — line 12
- `createTerrainMaterial` — function — line 50
- `TERRAIN_DIRT_DIFFUSE_TUNING` — const — line 41
- `TerrainWeatherUniforms` — type — line 35

## `terrain/cemeteryAssignment.ts`

- `ABANDONED_SETTLEMENT_MIN_DISTANCE` — const — line 53
- `activeTopologyNear` — function — line 267
- `assignmentVariationSeed` — function — line 247
- `CEMETERY_SETTLEMENT_GATHER_RADIUS` — const — line 51
- `CemeteryAssignment` — type — line 34
- `cemeteryAssignmentFromTopology` — function — line 233
- `cemeteryAssignmentId` — function — line 97
- `CemeteryAssignmentIntent` — type — line 24
- `cemeteryIdForAbandoned` — function — line 108
- `cemeteryIdForAssignment` — function — line 102
- `CemeterySettlementRef` — type — line 15
- `CemeteryTopologyIntent` — type — line 27
- `clearCemeteryCaches` — function — line 58
- `collectSettlementRefsNear` — function — line 66
- `dedicatedCemeteryTopology` — function — line 164
- `isAbandonedCemeteryId` — function — line 118
- `isLegacyCemeteryId` — function — line 113
- `makeSettlementRefPeek` — function — line 41
- `PeekSettlementDef` — type — line 38
- `PeekSettlementRef` — type — line 39
- `resolveCemeteryTopologyForSettlement` — function — line 189
  - domain: world-terrain
- `resolveSmSharePartner` — function — line 151
- `rollCemeterySizeForAssignment` — function — line 210
- `servedSettlementIdsForCemeteryId` — function — line 255
  - domain: world-terrain
- `settlementRefFromDef` — function — line 62
- `SM_SHARING_CELL_RADIUS` — const — line 47
- `SM_SHARING_MAX_DISTANCE` — const — line 49

## `terrain/cemeteryPlacement.ts`

- `ABANDONED_CEMETERY_CHANCE` — const — line 35
- `abandonedCemeteryMaxOffsetFromCenter` — function — line 44
  - domain: world-terrain
- `chunkPassesAbandonedCemeteryRoll` — function — line 59
  - domain: world-terrain
- `clearCemeteryPlacementCaches` — function — line 285
- `getCachedPlacementForAssignment` — function — line 327
- `isSharedAssignmentSplit` — function — line 323
- `placementOwnerChunk` — function — line 415
- `resolveAbandonedCemeteryAfterRoll` — function — line 364
  - domain: world-terrain
- `resolveAbandonedCemeteryForChunk` — function — line 374
- `resolveCemeteriesForChunk` — function — line 437
  - domain: world-terrain
- `resolveCemeteryPlacement` — function — line 468
- `ResolvedCemeteryPlacement` — type — line 63
- `resolvedPlacementToEnvironment` — function — line 334
- `resolvePlacementForTopology` — function — line 303
  - domain: world-terrain
- `validateCemeteryPhysical` — function — line 175

## `terrain/chunkCrops.ts`

- `computeChunkCrops` — function — line 37

## `terrain/chunkEnvironment.ts`

- `CEMETERY_CLEARING_PAD` — const — line 99
- `CEMETERY_INNER_FRAC` — const — line 97
- `CEMETERY_OUTER_FRAC` — const — line 98
- `cemeteryFitsVillageFringe` — function — line 167
- `cemeteryFootprintClearsRoads` — function — line 228
- `CemeteryTerrainSampler` — type — line 288
- `computeChunkEnvironment` — function — line 304
- `deriveLandmarkId` — function — line 269
- `EnvironmentKind` — type — line 18
- `EnvironmentPlacement` — type — line 29
- `LANDMARK_BIAS_MAX` — const — line 101
- `LANDMARK_BIAS_MIN` — const — line 100
- `LANDMARK_LABELS` — const — line 111
- `LandmarkBiasInput` — type — line 119
- `LandmarkBiasKind` — type — line 103
- `landmarkChanceBias` — function — line 140
- `LandmarkKind` — type — line 107
- `rollCemeterySize` — function — line 246
- `VillageDisk` — type — line 128

## `terrain/chunkGrid.ts`

- `chebyshevDistance` — function — line 21
- `chunkCenter` — function — line 17
- `ChunkCoord` — type — line 1
- `chunkKey` — function — line 3
- `chunksNear` — function — line 30
- `keyToCoord` — function — line 7
- `RegionCoord` — type — line 39
- `regionCoordOf` — function — line 44
- `regionKey` — function — line 48
- `worldToChunk` — function — line 13

## `terrain/chunkHeightmap.ts`

- `apronGridWeights` — function — line 689
- `ApronGridWeights` — type — line 680
- `apronOriginWorld` — function — line 660
- `ChunkTileData` — type — line 344
- `ChunkTileParams` — type — line 237
- `ClearingSegment` — type — line 169
- `computeChunkTile` — function — line 1110
- `createLocalTerrainSampler` — function — line 1185
  - domain: world-terrain
- `createWorldTerrainSampler` — function — line 1225
  - domain: world-terrain
- `extractCoreGrid` — function — line 744
- `RawSampleParams` — type — line 326
- `RegionalSmoothingSegment` — type — line 229
- `RegionParams` — type — line 20
- `RiverChannelSegment` — type — line 205
- `RoadCorridorSegment` — type — line 151
- `RoadNetworkParams` — type — line 88
- `sampleApronGrid` — function — line 727
- `sampleApronGridWeighted` — function — line 712
- `sampleBiomeAt` — function — line 631
- `sampleContinentalnessAt` — function — line 635
- `sampleFloorAt` — function — line 627
- `sampleHeightAt` — function — line 623
- `sampleMoistureRegionAt` — function — line 643
- `sampleMountainRidgeAt` — function — line 651
- `VegetationKind` — type — line 18
- `VillageClearingParams` — type — line 69

## `terrain/chunkHeightmapProtocol.ts`

- `ChunkTileResult` — type — line 12
- `ChunkWorkerRequest` — type — line 29
- `ChunkWorkerResponse` — type — line 34
- `GrassRequestParams` — type — line 25

## `terrain/chunkItems.ts`

- `computeChunkItems` — function — line 103
- `ItemPlacement` — type — line 14

## `terrain/chunkManager.ts`

- `applyChunkWaterDayNight` — function — line 916
- `applyModificationToTile` — function — line 773
- `ChunkManager` — type — line 488
- `ChunkManagerConfig` — type — line 327
- `createChunkManager` — function — line 941
  - domain: world-terrain
  - system: chunk-manager
  - role: Owns terrain chunk streaming, sampling and environment-facing world queries.
  - simulation: on-demand
  - performance: nearby-only
- `CropHarvestOutcome` — type — line 930
- `drainByBudget` — function — line 891
- `FinalizeStage` — type — line 428
- `pickNearestQueuedKey` — function — line 851
- `pickNextFinalizeKey` — function — line 869
- `resolveUnloadedLandmark` — function — line 276
  - domain: world-terrain
- `ringChunkOffsets` — function — line 236
- `TerrainModification` — type — line 730
- `tickChunkWaterSurfaces` — function — line 904

## `terrain/chunkMeshCache.ts`

- `ChunkMeshDataCache` — type — line 13
- `createChunkMeshDataCache` — function — line 35
- `DEFAULT_MESH_CACHE_BUDGET_BYTES` — const — line 33

## `terrain/chunkMeshData.ts`

- `ChunkMeshData` — type — line 63
- `ChunkMeshDataParams` — type — line 75
- `ChunkMeshTileGrids` — type — line 47
- `computeChunkMeshData` — function — line 125
- `SCORCH_CHARCOAL` — const — line 22
- `scorchFalloffAt` — function — line 27
- `TerrainScorchPatch` — type — line 19

## `terrain/chunkVegetation.ts`

- `computeChunkVegetation` — function — line 180
- `VegetationPlacement` — type — line 27

## `terrain/chunkWorkerPool.ts`

- `cancelChunkGrass` — function — line 334
- `cancelChunkMesh` — function — line 345
- `cancelChunkTile` — function — line 323
- `ChunkWorkerPool` — type — line 23
- `createChunkWorkerPool` — function — line 87
- `defaultChunkWorkerCount` — function — line 76
- `disposeChunkWorkerPool` — function — line 349
- `HeightmapGenerationCancelledError` — class — line 11
- `requestChunkGrass` — function — line 327
- `requestChunkMesh` — function — line 338
- `requestChunkTile` — function — line 316

## `terrain/coastPlacement.ts`

- `COAST_BEACH_HEIGHT` — const — line 14
- `COAST_INLAND_MARGIN` — const — line 16
- `CoastalSamplers` — type — line 6
- `isCoastalPlacement` — function — line 19

## `terrain/depositMining.ts`

- `hitsForRichness` — function — line 30
- `isDepleted` — function — line 55
- `isMineableOre` — function — line 25
- `MINE_DURATION_SEC` — const — line 23
- `MineableOre` — type — line 6
- `ORE_ITEM` — const — line 8
- `ORE_YIELD_LABEL` — const — line 15
- `oreEconomicKind` — function — line 72
- `recordMined` — function — line 61
- `resolveRemaining` — function — line 47
- `ResourceDepletionState` — type — line 43
- `yieldForOre` — function — line 65

## `terrain/dig.ts`

- `DIG_DEPTH_ROCK` — const — line 10
- `DIG_DEPTH_SAND` — const — line 9
- `DIG_DEPTH_SOIL` — const — line 8
- `DIG_DURATION_SEC` — const — line 18
- `DIG_RADIUS` — const — line 7
- `DigEnv` — type — line 38
- `DigProfile` — type — line 32
- `DigStoneOutcome` — type — line 77
- `DigSurface` — type — line 30
- `getDigProfileAt` — function — line 58
- `getRockDigProfileAt` — function — line 70
- `isRockGround` — function — line 48
- `resolveDigStone` — function — line 83
- `ROCK_MOUNTAIN_RIDGE_THRESHOLD` — const — line 25
- `STONE_CHANCE_ROCK` — const — line 13
- `STONE_CHANCE_SAND` — const — line 12
- `STONE_CHANCE_SOIL` — const — line 11
- `STONE_NOTICE_CHANCE` — const — line 16

## `terrain/digAction.ts`

- `applyDigAt` — function — line 23
- `applyLevelAt` — function — line 69
- `applyMoundAt` — function — line 94
- `DigFeedback` — type — line 14

## `terrain/distanceLod.ts`

- `densityLodFraction` — function — line 6
- `grassFillerLodFraction` — function — line 20
- `grassGeometryLodTier` — function — line 32
- `GrassGeometryLodTier` — type — line 30

## `terrain/fbm.ts`

- `fbm01` — function — line 14
- `FbmParams` — type — line 3

## `terrain/footstepSurface.ts`

- `FootstepSurface` — type — line 6
- `sampleFootstepSurface` — function — line 35

## `terrain/grass.ts`

- `createGrassSystem` — function — line 435
- `GrassSystem` — type — line 44
- `WorldGrassChunk` — type — line 13

## `terrain/grassPlacement.ts`

- `computeChunkGrass` — function — line 323
- `GRASS_SPECIES_ORDER` — const — line 22
- `GrassBucketData` — type — line 58
- `GrassChunkData` — type — line 67
- `GrassComputeParams` — type — line 34
- `GrassSpeciesId` — type — line 18
- `GrassTileGrids` — type — line 26
- `macroMeadowNoiseFor` — function — line 300
- `macroMeadowWeightAt` — function — line 316
  - domain: world-terrain

## `terrain/gridContour.ts`

- `CELL_RING` — const — line 12
  - domain: world-terrain
- `marchCellRing` — function — line 34
  - domain: world-terrain

## `terrain/hydrology.ts`

- `classifyStreams` — function — line 698
- `computeHydrologyRegion` — function — line 658
- `D8_DIRECTIONS` — const — line 28
- `DEFAULT_DEPRESSION_REPAIR_OPTIONS` — const — line 203
- `DEFAULT_DOWNSTREAM_PROBE_STEPS` — const — line 124
- `DEFAULT_STREAM_THRESHOLDS` — const — line 90
- `DepressionRepairOptions` — type — line 179
- `DownstreamProbe` — type — line 113
- `DownstreamProbeOutcome` — type — line 100
- `findSourceCandidates` — function — line 745
- `FLOW_DIR_SINK` — const — line 52
- `HydrologyFlag` — const — line 39
- `HydrologyRegion` — type — line 66
- `HydrologyRegionParams` — type — line 56
- `probeDownstreamTerminal` — function — line 161
  - domain: world-terrain
- `SourceCandidateOptions` — type — line 711
- `StreamClass` — type — line 695
- `StreamThresholds` — type — line 84
- `traceDownstreamPath` — function — line 795

## `terrain/naturalResources.ts`

- `dominantResourceNear` — function — line 248
- `NaturalResource` — type — line 39
- `RESOURCE_ROLE` — const — line 64
- `RESOURCE_TYPES` — const — line 35
- `resourceAttractionAt` — function — line 270
- `ResourceEnv` — type — line 104
- `resourcesNear` — function — line 226
- `ResourceType` — type — line 23
- `SIGNIFICANT_RICHNESS` — const — line 58

## `terrain/resourceDeposits.ts`

- `createResourceDeposits` — function — line 146
- `DepositTarget` — type — line 93
- `InterestPoint` — type — line 111
- `MineResult` — type — line 101
- `ResourceDeposits` — type — line 113
- `SettlementMiningHooks` — type — line 127

## `terrain/riverFord.ts`

- `FORD_WATER_DEPTH` — const — line 36
- `fordBedHeight` — function — line 77
- `fordStrength` — function — line 57

## `terrain/riverNetwork.ts`

- `canonicalWaterHeight` — function — line 213
- `computeRiverTile` — function — line 796
- `computeRiverTileDiagnostics` — function — line 812
  - domain: world-terrain
- `DEFAULT_RIVER_THRESHOLDS` — const — line 57
- `depthFromAccumulation` — function — line 197
- `exposedBankFromFlow` — function — line 183
- `flowFactor` — function — line 137
- `footprintOverlapsRiver` — function — line 381
- `isInsideRiverChannel` — function — line 368
- `nearestRiverBankDistance` — function — line 351
- `nearestRiverBankPoint` — function — line 398
- `nearestRiverHydrologyContext` — function — line 451
- `overlappingRiverTiles` — function — line 84
- `RIVER_CELL_STEP` — const — line 40
- `RIVER_TILE_HALO` — const — line 39
- `RIVER_TILE_SIZE` — const — line 33
- `RiverChain` — type — line 98
- `RiverChainDiagnostic` — type — line 582
- `RiverChainRejection` — type — line 573
- `RiverChainTerminal` — type — line 552
- `riverChannelSegmentsNear` — function — line 240
- `RiverHydrologyContext` — type — line 441
- `RiverPoint` — type — line 97
- `RiverTileCoord` — type — line 63
- `riverTileCoordOf` — function — line 65
- `riverTileCoreRect` — function — line 76
- `riverTileKey` — function — line 69
- `RiverWaterSample` — type — line 308
- `riverWaterSampleAt` — function — line 319
- `submergedDepthFromFlow` — function — line 188
- `widthFromAccumulation` — function — line 151
- `WorldRect` — type — line 73

## `terrain/riverQuery.ts`

- `createRiverQuery` — function — line 46
  - domain: terrain
- `RiverQuery` — type — line 27
  - domain: terrain
  - system: water
  - role: Analytic "what river geometry is around here" seam for *placement* code (settlement sites, village plots) that runs long before — and independently of — chunk streaming. Returns the same canonical `RiverChannelSegment[]` terrain carving and the water ribbon are built from (`riverChannelSegmentsNear`), so placement never reasons about rivers through a second, approximate representation.
  - integration: Deliberately separate from `riverTileCache.ts`: that cache is reference-counted against *loaded chunks* and evicts the moment no chunk holds a tile, which is the wrong lifetime for a query that has to answer for settlements far outside the loaded ring. This keeps its own small bounded map instead, at the cost of recomputing a tile the chunk cache may also hold. Both compute through the identical pure `computeRiverTile`, so the two can never disagree.

## `terrain/riverTileCache.ts`

- `createRiverTileCache` — function — line 24
- `RiverTileCache` — type — line 14

## `terrain/slopeConstraint.ts`

- `applySlopeMovementConstraint` — function — line 82
- `constrainToSlope` — function — line 66
- `sampleSlope` — function — line 42
- `SLOPE_FALLOFF_START_DEG` — const — line 12
- `SLOPE_MAX_WALKABLE_DEG` — const — line 15
- `SLOPE_SAMPLE_STEP` — const — line 20
- `SlopeSample` — interface — line 31
- `stepWithSlopeAndCollision` — function — line 104

## `terrain/terrainClassification.ts`

- `isMountainRidge` — function — line 25
- `isOceanMix` — function — line 21
- `isWetFloor` — function — line 17
- `MOUNTAIN_RIDGE_THRESHOLD` — const — line 13
- `OCEAN_MIX_GATE` — const — line 15

## `terrain/terrainCutout.ts`

- `buildCutChunkAttributes` — function — line 148
  - domain: world-terrain
- `CutChunkAttributes` — type — line 57
- `cutoutsOverlappingChunk` — function — line 76
- `TerrainCutout` — type — line 34
- `TerrainCutoutBounds` — type — line 27

## `terrain/terrainDetailNormalMap.ts`

- `createTerrainNormalMap` — function — line 27
- `getSharedTerrainDetailNormalMap` — function — line 106

## `terrain/terrainPreparation.ts`

- `averageAbsHeightDelta` — function — line 213
- `CompletedTerrainPreparation` — type — line 49
  - domain: world
  - system: terrain-preparation
- `completedTerrainPreparationFrom` — function — line 55
- `computeRequiredWork` — function — line 189
- `exceedsMaxDeformation` — function — line 172
- `formatHeightDelta` — function — line 274
- `GridSample` — type — line 37
- `HeightSample` — type — line 38
- `isPreparationSize` — function — line 33
- `MAX_PREPARATION_DELTA` — const — line 167
- `MAX_PREPARATION_SIZE` — const — line 21
- `MIN_PREPARATION_SIZE` — const — line 20
- `MINIMUM_PREPARATION_WORK_HOURS` — const — line 186
- `nearestGridPoint` — function — line 97
- `PREPARATION_SIZES` — const — line 27
- `preparationSamplesPerSide` — function — line 125
- `PreparationSize` — type — line 29
- `PreparationValidationResult` — type — line 249
- `progressiveHeight` — function — line 236
- `progressiveHeights` — function — line 241
- `resolveLevelSamples` — function — line 108
- `resolvePreparationSamples` — function — line 141
- `TERRAIN_PREP_NPC_WORK_SESSION_HOURS` — const — line 211
- `TERRAIN_PREP_NPC_WORK_SESSION_SEC` — const — line 204
- `TerrainPreparationRecord` — type — line 73
- `terrainPreparationRemainingWork` — function — line 196
- `toolSpeedMultiplier` — function — line 224
- `validatePreparationSamples` — function — line 261

## `terrain/vegetationRegionBatcher.ts`

- `createVegetationRegionBatcher` — function — line 125
- `REGION_CHUNKS` — const — line 46
- `VegetationKind` — type — line 9
- `VegetationRegionBatcher` — type — line 71

## `terrain/waterBodies.ts`

- `BodyScaleParams` — type — line 14
- `computeBodyScale` — function — line 108
- `detectWaterBodies` — function — line 36
- `LAKE_SCALE_MAX` — const — line 29
- `lakeScaleFor` — function — line 86
- `OCEAN_BODY_SCALE_DISCARD` — const — line 27
- `oceanMixAt` — function — line 94
- `WaterBody` — type — line 3
- `WaterBodyDetection` — type — line 9

## `terrain/waterBodyKind.ts`

- `lakeProximityAt` — function — line 136
- `LakeProximitySamplers` — type — line 83
- `nearestShoreProbePoint` — function — line 49
- `resolveWaterBodyKind` — function — line 71
- `shoreProbeHits` — function — line 32

## `terrain/waterSample.ts`

- `DRY_WATER_SAMPLE` — const — line 23
- `LocalWaterSample` — type — line 19
  - domain: terrain
  - system: water
  - role: Single physical "what water, if any, is at this point" answer (plan fauna-015) — the one thing world/terrain owns so fauna (and, later, any other gameplay consumer) never re-derives lake/ocean vs. river depth logic itself. Pure/allocation-light so it's safe to call from a hot per-agent movement path; `ChunkManager.sampleLocalWater` is the only wiring that turns real chunk/river data into these inputs.
- `sampleLocalWater` — function — line 40

## `terrain/worleyNoise.ts`

- `worleyRidge` — function — line 35
- `WorleyRidgeResult` — type — line 1
