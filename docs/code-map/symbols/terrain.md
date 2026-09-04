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

- `buildChunkGeometry` — function — line 363
- `ChunkMeshResult` — type — line 6
- `createTerrainMaterial` — function — line 34
- `TerrainWeatherUniforms` — type — line 29

## `terrain/chunkCrops.ts`

- `computeChunkCrops` — function — line 37

## `terrain/chunkEnvironment.ts`

- `CEMETERY_CLEARING_PAD` — const — line 102
- `CEMETERY_INNER_FRAC` — const — line 100
- `CEMETERY_OUTER_FRAC` — const — line 101
- `cemeteryFitsVillageFringe` — function — line 169
- `cemeteryFootprintClearsRoads` — function — line 230
- `computeChunkEnvironment` — function — line 291
- `deriveLandmarkId` — function — line 271
- `EnvironmentKind` — type — line 15
- `EnvironmentPlacement` — type — line 25
- `LANDMARK_BIAS_MAX` — const — line 104
- `LANDMARK_BIAS_MIN` — const — line 103
- `LANDMARK_LABELS` — const — line 114
- `LandmarkBiasInput` — type — line 121
- `LandmarkBiasKind` — type — line 106
- `landmarkChanceBias` — function — line 142
- `LandmarkKind` — type — line 110
- `rollCemeterySize` — function — line 248
- `VillageDisk` — type — line 130

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

- `apronGridWeights` — function — line 656
- `ApronGridWeights` — type — line 647
- `apronOriginWorld` — function — line 627
- `ChunkTileData` — type — line 311
- `ChunkTileParams` — type — line 231
- `ClearingSegment` — type — line 163
- `computeChunkTile` — function — line 988
- `extractCoreGrid` — function — line 711
- `RawSampleParams` — type — line 297
- `RegionalSmoothingSegment` — type — line 223
- `RegionParams` — type — line 14
- `RiverChannelSegment` — type — line 199
- `RoadCorridorSegment` — type — line 145
- `RoadNetworkParams` — type — line 82
- `sampleApronGrid` — function — line 694
- `sampleApronGridWeighted` — function — line 679
- `sampleBiomeAt` — function — line 598
- `sampleContinentalnessAt` — function — line 602
- `sampleFloorAt` — function — line 594
- `sampleHeightAt` — function — line 590
- `sampleMoistureRegionAt` — function — line 610
- `sampleMountainRidgeAt` — function — line 618
- `VegetationKind` — type — line 12
- `VillageClearingParams` — type — line 63

## `terrain/chunkHeightmapProtocol.ts`

- `ChunkTileResult` — type — line 12
- `ChunkWorkerRequest` — type — line 29
- `ChunkWorkerResponse` — type — line 34
- `GrassRequestParams` — type — line 25

## `terrain/chunkItems.ts`

- `computeChunkItems` — function — line 103
- `ItemPlacement` — type — line 14

## `terrain/chunkManager.ts`

- `applyModificationToTile` — function — line 651
- `ChunkManager` — type — line 401
- `ChunkManagerConfig` — type — line 252
- `createChunkManager` — function — line 790
  - domain: world-terrain
  - system: chunk-manager
  - role: Owns terrain chunk streaming, sampling and environment-facing world queries.
  - simulation: on-demand
  - performance: nearby-only
- `CropHarvestOutcome` — type — line 779
- `drainByBudget` — function — line 769
- `FinalizeStage` — type — line 341
- `pickNearestQueuedKey` — function — line 729
- `pickNextFinalizeKey` — function — line 747
- `ringChunkOffsets` — function — line 211
- `TerrainModification` — type — line 608

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

- `createGrassSystem` — function — line 433
- `GrassSystem` — type — line 44
- `WorldGrassChunk` — type — line 13

## `terrain/grassPlacement.ts`

- `computeChunkGrass` — function — line 280
- `GRASS_SPECIES_ORDER` — const — line 22
- `GrassBucketData` — type — line 52
- `GrassChunkData` — type — line 61
- `GrassComputeParams` — type — line 34
- `GrassSpeciesId` — type — line 18
- `GrassTileGrids` — type — line 26

## `terrain/hydrology.ts`

- `classifyStreams` — function — line 188
- `computeHydrologyRegion` — function — line 85
- `D8_DIRECTIONS` — const — line 16
- `DEFAULT_STREAM_THRESHOLDS` — const — line 181
- `findSourceCandidates` — function — line 235
- `FLOW_DIR_SINK` — const — line 40
- `HydrologyFlag` — const — line 27
- `HydrologyRegion` — type — line 54
- `HydrologyRegionParams` — type — line 44
- `SourceCandidateOptions` — type — line 201
- `StreamClass` — type — line 173
- `StreamThresholds` — type — line 175
- `traceDownstreamPath` — function — line 285

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

- `canonicalWaterHeight` — function — line 199
- `computeRiverTile` — function — line 567
- `DEFAULT_RIVER_THRESHOLDS` — const — line 54
- `depthFromAccumulation` — function — line 183
- `exposedBankFromFlow` — function — line 169
- `flowFactor` — function — line 123
- `isInsideRiverChannel` — function — line 325
- `nearestRiverBankDistance` — function — line 301
- `nearestRiverBankPoint` — function — line 337
- `overlappingRiverTiles` — function — line 81
- `RIVER_CELL_STEP` — const — line 37
- `RIVER_TILE_HALO` — const — line 36
- `RIVER_TILE_SIZE` — const — line 30
- `RiverChain` — type — line 95
- `riverChannelSegmentsNear` — function — line 226
- `RiverPoint` — type — line 94
- `RiverTileCoord` — type — line 60
- `riverTileCoordOf` — function — line 62
- `riverTileCoreRect` — function — line 73
- `riverTileKey` — function — line 66
- `submergedDepthFromFlow` — function — line 174
- `widthFromAccumulation` — function — line 137
- `WorldRect` — type — line 70

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

## `terrain/terrainDetailNormalMap.ts`

- `createTerrainNormalMap` — function — line 27

## `terrain/terrainPreparation.ts`

- `averageAbsHeightDelta` — function — line 157
- `computeRequiredWork` — function — line 153
- `exceedsMaxDeformation` — function — line 136
- `formatHeightDelta` — function — line 218
- `GridSample` — type — line 22
- `HeightSample` — type — line 23
- `MAX_PREPARATION_DELTA` — const — line 131
- `MINIMUM_PREPARATION_WORK_HOURS` — const — line 150
- `nearestGridPoint` — function — line 61
- `preparationSamplesPerSide` — function — line 89
- `PreparationSize` — type — line 20
- `PreparationValidationResult` — type — line 193
- `progressiveHeight` — function — line 180
- `progressiveHeights` — function — line 185
- `resolveLevelSamples` — function — line 72
- `resolvePreparationSamples` — function — line 105
- `TerrainPreparationRecord` — type — line 36
- `toolSpeedMultiplier` — function — line 168
- `validatePreparationSamples` — function — line 205

## `terrain/vegetationRegionBatcher.ts`

- `createVegetationRegionBatcher` — function — line 123
- `REGION_CHUNKS` — const — line 44
- `VegetationKind` — type — line 9
- `VegetationRegionBatcher` — type — line 69

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
