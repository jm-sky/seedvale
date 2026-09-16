# Symbols

Generated from exported TypeScript symbols.

## `terrain/abandonedMineDeposits.ts`

- `AbandonedMineDepositInput` — type — line 76
- `allocateIntegerReserves` — function — line 131
  - domain: world
- `generateAbandonedMineGoldDeposits` — function — line 332
  - domain: world
- `MINE_GOLD_SLOTS` — const — line 20
- `mineGoldDepositId` — function — line 110
- `MineGoldSlot` — type — line 28
- `pickMineGoldTotalReserve` — function — line 119
  - domain: world

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

- `CEMETERY_CLEARING_PAD` — const — line 129
- `CEMETERY_INNER_FRAC` — const — line 127
- `CEMETERY_OUTER_FRAC` — const — line 128
- `cemeteryFitsVillageFringe` — function — line 213
- `cemeteryFootprintClearsRoads` — function — line 274
- `CemeteryTerrainSampler` — type — line 353
- `clearVegetationAroundOldTrees` — function — line 329
- `computeChunkEnvironment` — function — line 492
- `deriveLandmarkId` — function — line 315
- `EnvironmentKind` — type — line 18
- `EnvironmentPlacement` — type — line 34
- `isClassicLandmarkKind` — function — line 479
- `LANDMARK_BIAS_MAX` — const — line 131
- `LANDMARK_BIAS_MIN` — const — line 130
- `LANDMARK_LABELS` — const — line 152
- `LandmarkBiasInput` — type — line 165
- `LandmarkBiasKind` — type — line 133
- `landmarkChanceBias` — function — line 186
- `LandmarkKind` — type — line 138
- `LandmarkTerrainSampler` — type — line 364
  - domain: world-terrain
- `OLD_TREE_CLEARANCE_RADIUS` — const — line 118
- `resolveClassicLandmarkPlacement` — function — line 434
  - domain: world-terrain
- `rollCemeterySize` — function — line 292
- `VillageDisk` — type — line 174

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

- `apronGridWeights` — function — line 710
- `ApronGridWeights` — type — line 701
- `apronOriginWorld` — function — line 681
- `ChunkTileData` — type — line 365
- `ChunkTileParams` — type — line 238
- `ClearingSegment` — type — line 170
- `computeChunkTile` — function — line 1138
- `createLocalTerrainSampler` — function — line 1223
  - domain: world-terrain
- `createWorldTerrainSampler` — function — line 1265
  - domain: world-terrain
- `extractCoreGrid` — function — line 765
- `LocalTerrainSampler` — type — line 1198
  - domain: world-terrain
- `RawSampleParams` — type — line 345
- `RegionalSmoothingSegment` — type — line 230
- `RegionParams` — type — line 21
- `RiverChannelSegment` — type — line 206
- `RoadCorridorSegment` — type — line 152
- `RoadNetworkParams` — type — line 89
- `sampleApronGrid` — function — line 748
- `sampleApronGridWeighted` — function — line 733
- `sampleBiomeAt` — function — line 652
- `sampleContinentalnessAt` — function — line 656
- `sampleFloorAt` — function — line 648
- `sampleHeightAt` — function — line 644
- `sampleMoistureRegionAt` — function — line 664
- `sampleMountainRidgeAt` — function — line 672
- `VegetationKind` — type — line 19
- `VillageClearingParams` — type — line 70

## `terrain/chunkHeightmapProtocol.ts`

- `ChunkTileResult` — type — line 13
- `ChunkWorkerRequest` — type — line 30
- `ChunkWorkerResponse` — type — line 36
- `GrassRequestParams` — type — line 26

## `terrain/chunkItems.ts`

- `computeChunkItems` — function — line 103
- `ItemPlacement` — type — line 14

## `terrain/chunkManager.ts`

- `applyChunkWaterDayNight` — function — line 970
- `applyModificationToTile` — function — line 827
- `ChunkManager` — type — line 506
- `ChunkManagerConfig` — type — line 327
- `createChunkManager` — function — line 995
  - domain: world-terrain
  - system: chunk-manager
  - role: Owns terrain chunk streaming, sampling and environment-facing world queries.
  - simulation: on-demand
  - performance: nearby-only
- `CropHarvestOutcome` — type — line 984
- `drainByBudget` — function — line 945
- `FinalizeStage` — type — line 428
- `pickNearestQueuedKey` — function — line 905
- `pickNextFinalizeKey` — function — line 923
- `TerrainModification` — type — line 784
- `tickChunkWaterSurfaces` — function — line 958

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

## `terrain/chunkTileWorldgenCache.ts`

- `CHUNK_TILE_CACHE_BYTE_BUDGET` — const — line 62
- `CHUNK_TILE_CACHE_NAMESPACE` — const — line 30
  - domain: world-terrain
  - system: worldgen-cache
  - role: Persistent-cache adapter for canonical worker-generated chunk tiles (plan world-terrain-031): one `chunk:<cx>:<cz>` record per chunk holding the unchanged `ChunkTileResult` — the eight apron-inclusive terrain grids plus the deterministic vegetation/item/environment/crop placements. Stores the existing worker contract verbatim; there is deliberately no cache-specific terrain model and no `SaveData` field.
  - integration: Disposable derived data only. `ChunkManager.ensureLoaded()` generates exactly the same chunk with an empty cache — a miss, a malformed record or an IndexedDB failure always falls back to the tile worker. The payload is *base* worldgen: player/system terrain modifications, terrain cutouts, tree/crop lifecycle, collected items, resource depletion, mesh data and every Three.js object stay downstream and are never cached here, so two same-seed saves share only deterministic generation output.
- `CHUNK_TILE_CACHE_VERSION` — const — line 46
- `CHUNK_TILE_META_SUBKEY` — const — line 51
- `ChunkTileCacheStats` — type — line 92
- `ChunkTileCacheStorage` — type — line 228
- `chunkTileFingerprint` — function — line 85
  - domain: world-terrain
  - system: worldgen-cache
- `chunkTileSubKey` — function — line 69
- `cloneChunkTileForRuntime` — function — line 205
  - domain: world-terrain
  - system: worldgen-cache
- `estimateChunkTileBytes` — function — line 184
- `getChunkTileCacheStats` — function — line 118
- `loadCachedChunkTile` — function — line 329
  - domain: world-terrain
  - system: worldgen-cache
- `persistChunkTile` — function — line 377
  - domain: world-terrain
  - system: worldgen-cache
- `resetChunkTileCacheMetadata` — function — line 312
- `resetChunkTileCacheStats` — function — line 122
- `validateCachedChunkTile` — function — line 162
  - domain: world-terrain
  - system: worldgen-cache

## `terrain/chunkVegetation.ts`

- `computeChunkVegetation` — function — line 180
- `VegetationPlacement` — type — line 27

## `terrain/chunkWorkerPool.ts`

- `cancelChunkGrass` — function — line 430
- `cancelChunkMesh` — function — line 441
- `cancelChunkTile` — function — line 419
- `cancelChunkWorldKnowledge` — function — line 452
- `ChunkWorkerLike` — type — line 25
- `ChunkWorkerPool` — type — line 41
- `ChunkWorkerPoolOptions` — type — line 32
- `createChunkWorkerPool` — function — line 140
- `defaultChunkWorkerCount` — function — line 113
- `disposeChunkWorkerPool` — function — line 456
- `HeightmapGenerationCancelledError` — class — line 13
- `isChunkWorkerCancelledError` — function — line 20
- `requestChunkGrass` — function — line 423
- `requestChunkMesh` — function — line 434
- `requestChunkTile` — function — line 412
- `requestChunkWorldKnowledge` — function — line 445

## `terrain/chunkWorldItems.ts`

- `chunkCoordFromWorldItemId` — function — line 29
- `nearestWorldChunkItem` — function — line 60
- `proceduralChunkItems` — function — line 45
  - domain: settlements-npcs
- `WorldChunkItemRef` — type — line 21

## `terrain/coastPlacement.ts`

- `COAST_BEACH_HEIGHT` — const — line 14
- `COAST_INLAND_MARGIN` — const — line 16
- `CoastalSamplers` — type — line 6
- `isCoastalPlacement` — function — line 19

## `terrain/depositMining.ts`

- `hitsForRichness` — function — line 30
- `isDepleted` — function — line 59
- `isMineableOre` — function — line 25
- `MINE_DURATION_SEC` — const — line 23
- `MineableOre` — type — line 6
- `ORE_ITEM` — const — line 8
- `ORE_YIELD_LABEL` — const — line 15
- `oreEconomicKind` — function — line 76
- `recordMined` — function — line 65
- `resolveRemaining` — function — line 48
- `ResourceDepletionState` — type — line 43
- `yieldForOre` — function — line 69

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

- `applyDigAt` — function — line 26
- `applyLevelAt` — function — line 72
- `applyMoundAt` — function — line 97
- `DigFeedback` — type — line 15

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

- `createGrassSystem` — function — line 457
- `grassBladeLocalPositions` — function — line 343
  - domain: world-terrain
- `GrassSystem` — type — line 50
- `WorldGrassChunk` — type — line 14

## `terrain/grassBounds.ts`

- `createGrassBoundsAccumulator` — function — line 90
- `expandGrassInstanceBounds` — function — line 108
  - domain: world-terrain
- `finalizeGrassBounds` — function — line 144
  - domain: world-terrain
- `GrassBoundsAccumulator` — type — line 18
- `grassBoundsContainsPoint` — function — line 153
- `GrassBucketBounds` — type — line 11
- `grassInstanceConservativeRadius` — function — line 79
  - domain: world-terrain
- `grassSpeciesLocalExtent` — function — line 69
  - domain: world-terrain
- `transformGrassLocalPoint` — function — line 167

## `terrain/grassPlacement.ts`

- `computeChunkGrass` — function — line 349
- `GRASS_SPECIES_ORDER` — const — line 31
- `GrassBucketData` — type — line 67
- `GrassChunkData` — type — line 80
- `GrassComputeParams` — type — line 43
- `GrassSpeciesId` — type — line 27
- `GrassTileGrids` — type — line 35
- `macroMeadowNoiseFor` — function — line 326
- `macroMeadowWeightAt` — function — line 342
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

## `terrain/mineableDeposit.ts`

- `depositMatchesQueryContext` — function — line 92
- `DepositQueryOptions` — type — line 47
- `MineableDepositDefinition` — type — line 34
  - domain: world
- `mineableDepositFromNaturalResource` — function — line 55
- `querySpatialContext` — function — line 85
- `resolveDepositRemaining` — function — line 78
  - domain: world

## `terrain/naturalResources.ts`

- `dominantResourceNear` — function — line 283
- `NaturalResource` — type — line 50
- `RESOURCE_ROLE` — const — line 75
- `RESOURCE_TYPES` — const — line 46
- `resourceAttractionAt` — function — line 305
- `resourceById` — function — line 252
  - domain: settlements-npcs
- `ResourceEnv` — type — line 115
- `resourcesNear` — function — line 261
- `ResourceType` — type — line 34
- `SIGNIFICANT_RICHNESS` — const — line 69

## `terrain/resourceDeposits.ts`

- `createResourceDeposits` — function — line 177
  - domain: world
- `DepositTarget` — type — line 95
- `InterestPoint` — type — line 115
- `MineResult` — type — line 105
- `ResourceDeposits` — type — line 129
- `ResourceDepositSources` — type — line 124
  - domain: world
- `SettlementMiningHooks` — type — line 149

## `terrain/riverFord.ts`

- `FORD_WATER_DEPTH` — const — line 31
  - domain: terrain
  - system: water
  - role: Ford *shaping* maths — the small amount of pure geometry that turns an already-declared road↔river crossing into a shallow, traversable bed instead of the road falling into a full-depth carved channel.
  - integration: Since plan world-terrain-023 this module no longer decides whether a crossing exists: `settlement/roadRiverCrossing.ts` owns that, and `settlement/roadNetwork.ts` projects each declared `ford` crossing into compact, worker-safe FordProjection data on `ChunkTileParams.fordProjections` (the same "resolve nearby routes main-thread, ship plain numbers to the worker" seam as `RoadCorridorSegment`). `chunkHeightmap.ts`'s river-carving stage and `ChunkManager.sampleLocalWater()` both read the influence through fordInfluenceAt and the shaped bed through fordBedHeight, so gameplay water depth and terrain agree by construction. An incidental road × river overlap with no declared crossing leaves the canonical channel completely natural. Seam-safety follows the same argument roads and rivers already use: a projection is plain world-space geometry handed to every chunk its influence reaches, so two chunks sharing a boundary compute an identical ford there.
- `fordBedHeight` — function — line 106
- `fordInfluenceAt` — function — line 76
- `FordProjection` — type — line 41

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

## `terrain/roadBridge.ts`

- `bridgeDeckYAt` — function — line 72
- `isOnAnyBridgeDeck` — function — line 82
- `isOnBridgeDeck` — function — line 63
- `RoadBridgeSpec` — type — line 23
  - domain: world-terrain
  - system: roads
  - role: Bridge *projection* geometry — the plain-data `RoadBridgeSpec` an already-declared canonical `RoadRiverCrossing(kind = 'bridge')` (plan world-terrain-023) is turned into, plus the one oriented-footprint test every consumer shares (plan world-terrain-033). Mirrors `riverFord.ts`'s split: this module owns worker-safe type + pure query, `roadNetwork.ts` owns the settlement-layer projection (`bridgeSpecOf`) and bounded query (`bridgesNear`), same "terrain owns the shared shape, settlement produces it" seam `RoadCorridorSegment`/`FordProjection` already use.
  - integration: `terrain/chunkHeightmap.ts` reads isOnBridgeDeck to suppress road-height/tint shaping under an open span (never the river carve). `terrain/chunkManager.ts` reads the same test for bridge presentation ownership and the shared movement-ground query (`sampleBridgeDeck`/`sampleSurfaceGround`). No THREE.js, no route/crossing search — every bridge here is already decided.

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

## `terrain/terrainVisualHorizon.ts`

- `terrainVisualHorizon` — function — line 33
  - domain: world-terrain
- `TerrainVisualHorizon` — type — line 14
  - domain: world-terrain

## `terrain/unloadedLandmarkLookup.ts`

- `isLightweightUnloadedLandmark` — function — line 49
  - domain: world-terrain
- `landmarkFromEnvironment` — function — line 35
  - domain: world-terrain
- `resolveUnloadedLandmark` — function — line 64
  - domain: world-terrain
- `ringChunkOffsets` — function — line 18
  - domain: world-terrain

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

- `DRY_WATER_SAMPLE` — const — line 24
- `LocalWaterSample` — type — line 20
  - domain: terrain
  - system: water
  - role: Single physical "what water, if any, is at this point" answer (plan fauna-015) — the one thing world/terrain owns so fauna (and, later, any other gameplay consumer) never re-derives lake/ocean vs. river depth logic itself. Pure/allocation-light so it's safe to call from a hot per-agent movement path; `ChunkManager.sampleLocalWater` is the only wiring that turns real chunk/river data into these inputs.
- `sampleLocalWater` — function — line 48

## `terrain/worldKnowledgeScan.ts`

- `chunkParamsForWorldKnowledgeScan` — function — line 201
  - domain: world-terrain
- `prepareWorldKnowledgeScan` — function — line 136
  - domain: world-terrain
- `scanWorldKnowledge` — function — line 285
  - domain: world-terrain
- `WORLD_KNOWLEDGE_MAX_NEARBY_HITS` — const — line 28
- `WorldKnowledgeChunkGather` — type — line 82
- `worldKnowledgeGatherFor` — function — line 185
- `WorldKnowledgeQueryKind` — type — line 30
- `worldKnowledgeRoadContext` — function — line 114
  - domain: world-terrain
- `WorldKnowledgeScanHit` — type — line 69
- `WorldKnowledgeScanResult` — type — line 77
- `WorldKnowledgeTerrainSnapshot` — type — line 37
  - domain: world-terrain
- `WorldKnowledgeWorkerParams` — type — line 58

## `terrain/worleyNoise.ts`

- `worleyRidge` — function — line 35
- `WorleyRidgeResult` — type — line 1
