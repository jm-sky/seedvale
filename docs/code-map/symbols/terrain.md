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
- `ForestBiome` — type — line 132
- `forestBiomeAt` — function — line 150
- `forestDensityAt` — function — line 95

## `terrain/buildChunkGeometry.ts`

- `buildChunkGeometry` — function — line 420
- `ChunkMeshResult` — type — line 21
- `createTerrainMaterial` — function — line 69
- `SCORCH_CHARCOAL` — const — line 32
- `scorchFalloffAt` — function — line 37
- `TerrainScorchPatch` — type — line 29
- `TerrainWeatherUniforms` — type — line 64

## `terrain/chunkCrops.ts`

- `computeChunkCrops` — function — line 37

## `terrain/chunkEnvironment.ts`

- `CEMETERY_CLEARING_PAD` — const — line 100
- `CEMETERY_INNER_FRAC` — const — line 98
- `CEMETERY_OUTER_FRAC` — const — line 99
- `cemeteryFitsVillageFringe` — function — line 167
- `computeChunkEnvironment` — function — line 241
- `deriveLandmarkId` — function — line 221
- `EnvironmentKind` — type — line 13
- `EnvironmentPlacement` — type — line 23
- `LANDMARK_BIAS_MAX` — const — line 102
- `LANDMARK_BIAS_MIN` — const — line 101
- `LANDMARK_LABELS` — const — line 112
- `LandmarkBiasInput` — type — line 119
- `LandmarkBiasKind` — type — line 104
- `landmarkChanceBias` — function — line 140
- `LandmarkKind` — type — line 108
- `rollCemeterySize` — function — line 198
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

- `apronGridWeights` — function — line 534
- `ApronGridWeights` — type — line 525
- `apronOriginWorld` — function — line 505
- `ChunkTileData` — type — line 278
- `ChunkTileParams` — type — line 198
- `ClearingSegment` — type — line 142
- `computeChunkTile` — function — line 827
- `extractCoreGrid` — function — line 589
- `RawSampleParams` — type — line 264
- `RegionalSmoothingSegment` — type — line 190
- `RegionParams` — type — line 12
- `RiverChannelSegment` — type — line 168
- `RoadCorridorSegment` — type — line 124
- `RoadNetworkParams` — type — line 80
- `sampleApronGrid` — function — line 572
- `sampleApronGridWeighted` — function — line 557
- `sampleBiomeAt` — function — line 476
- `sampleContinentalnessAt` — function — line 480
- `sampleFloorAt` — function — line 472
- `sampleHeightAt` — function — line 468
- `sampleMoistureRegionAt` — function — line 488
- `sampleMountainRidgeAt` — function — line 496
- `VegetationKind` — type — line 10
- `VillageClearingParams` — type — line 61

## `terrain/chunkHeightmapProtocol.ts`

- `ChunkTileResult` — type — line 11
- `ChunkWorkerRequest` — type — line 28
- `ChunkWorkerResponse` — type — line 32
- `GrassRequestParams` — type — line 24

## `terrain/chunkItems.ts`

- `computeChunkItems` — function — line 103
- `ItemPlacement` — type — line 14

## `terrain/chunkManager.ts`

- `applyModificationToTile` — function — line 592
- `ChunkManager` — type — line 374
- `ChunkManagerConfig` — type — line 233
- `createChunkManager` — function — line 731
- `CropHarvestOutcome` — type — line 720
- `drainByBudget` — function — line 710
- `FinalizeStage` — type — line 319
- `pickNearestQueuedKey` — function — line 670
- `pickNextFinalizeKey` — function — line 688
- `ringChunkOffsets` — function — line 192
- `TerrainModification` — type — line 549

## `terrain/chunkVegetation.ts`

- `computeChunkVegetation` — function — line 175
- `VegetationPlacement` — type — line 26

## `terrain/chunkWorkerPool.ts`

- `cancelChunkGrass` — function — line 285
- `cancelChunkTile` — function — line 274
- `ChunkWorkerPool` — type — line 22
- `createChunkWorkerPool` — function — line 72
- `defaultChunkWorkerCount` — function — line 61
- `disposeChunkWorkerPool` — function — line 289
- `HeightmapGenerationCancelledError` — class — line 10
- `requestChunkGrass` — function — line 278
- `requestChunkTile` — function — line 267

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
- `grassFillerLodFraction` — function — line 13
- `grassGeometryLodTier` — function — line 24
- `GrassGeometryLodTier` — type — line 22

## `terrain/fbm.ts`

- `fbm01` — function — line 14
- `FbmParams` — type — line 3

## `terrain/footstepSurface.ts`

- `FootstepSurface` — type — line 6
- `sampleFootstepSurface` — function — line 35

## `terrain/grass.ts`

- `createGrassSystem` — function — line 414
- `GrassSystem` — type — line 38
- `WorldGrassChunk` — type — line 13

## `terrain/grassPlacement.ts`

- `computeChunkGrass` — function — line 272
- `GRASS_SPECIES_ORDER` — const — line 21
- `GrassBucketData` — type — line 47
- `GrassChunkData` — type — line 56
- `GrassComputeParams` — type — line 33
- `GrassSpeciesId` — type — line 17
- `GrassTileGrids` — type — line 25

## `terrain/hydrology.ts`

- `classifyStreams` — function — line 174
- `computeHydrologyRegion` — function — line 77
- `D8_DIRECTIONS` — const — line 16
- `DEFAULT_STREAM_THRESHOLDS` — const — line 167
- `findSourceCandidates` — function — line 221
- `FLOW_DIR_SINK` — const — line 34
- `HydrologyFlag` — const — line 27
- `HydrologyRegion` — type — line 46
- `HydrologyRegionParams` — type — line 36
- `SourceCandidateOptions` — type — line 187
- `StreamClass` — type — line 159
- `StreamThresholds` — type — line 161
- `traceDownstreamPath` — function — line 271

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

## `terrain/riverNetwork.ts`

- `computeRiverTile` — function — line 424
- `DEFAULT_RIVER_THRESHOLDS` — const — line 53
- `depthFromAccumulation` — function — line 154
- `flowFactor` — function — line 122
- `overlappingRiverTiles` — function — line 80
- `RIVER_CELL_STEP` — const — line 36
- `RIVER_TILE_HALO` — const — line 35
- `RIVER_TILE_SIZE` — const — line 29
- `RiverChain` — type — line 94
- `riverChannelSegmentsNear` — function — line 183
- `RiverPoint` — type — line 93
- `RiverTileCoord` — type — line 59
- `riverTileCoordOf` — function — line 61
- `riverTileCoreRect` — function — line 72
- `riverTileKey` — function — line 65
- `widthFromAccumulation` — function — line 136
- `WorldRect` — type — line 69

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

## `terrain/terrainDetailNormalMap.ts`

- `createTerrainNormalMap` — function — line 27

## `terrain/terrainPreparation.ts`

- `averageAbsHeightDelta` — function — line 154
- `computeRequiredWork` — function — line 150
- `exceedsMaxDeformation` — function — line 133
- `formatHeightDelta` — function — line 215
- `GridSample` — type — line 22
- `HeightSample` — type — line 23
- `MAX_PREPARATION_DELTA` — const — line 128
- `MINIMUM_PREPARATION_WORK_HOURS` — const — line 147
- `nearestGridPoint` — function — line 61
- `preparationSamplesPerSide` — function — line 89
- `PreparationSize` — type — line 20
- `PreparationValidationResult` — type — line 190
- `progressiveHeight` — function — line 177
- `progressiveHeights` — function — line 182
- `resolveLevelSamples` — function — line 72
- `resolvePreparationSamples` — function — line 105
- `TerrainPreparationRecord` — type — line 36
- `toolSpeedMultiplier` — function — line 165
- `validatePreparationSamples` — function — line 202

## `terrain/vegetationRegionBatcher.ts`

- `createVegetationRegionBatcher` — function — line 121
- `REGION_CHUNKS` — const — line 42
- `VegetationKind` — type — line 9
- `VegetationRegionBatcher` — type — line 67

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

## `terrain/worleyNoise.ts`

- `worleyRidge` — function — line 35
- `WorleyRidgeResult` — type — line 1
