# Symbols

Generated from exported TypeScript symbols.

## `world/animalTraps.ts`

- `accumulateTrapWeatherWear` — function — line 241
- `isSpeciesTrappable` — function — line 96
- `isTrapCooldownActive` — function — line 179
- `PlacedTrapRecord` — type — line 265
- `rollTrapDetection` — function — line 136
- `spendTrapDurability` — function — line 204
- `startTrapCooldown` — function — line 191
- `TRAP_BAIT_DETECTION_CUT` — const — line 113
- `TRAP_CHECK_INTERVAL_SEC` — const — line 320
- `TRAP_DEFS` — const — line 50
- `TRAP_DETECTION_COOLDOWN_DAYS` — const — line 170
- `TRAP_FOOTPRINT_RADIUS` — const — line 308
- `TRAP_KIND_BY_ITEM` — const — line 75
- `TRAP_MAX_DETECTION` — const — line 104
- `TRAP_MIN_DETECTION` — const — line 103
- `TRAP_PLACE_REACH` — const — line 313
- `TRAP_PLACEMENT_MESSAGE` — const — line 300
- `TRAP_SEPARATION` — const — line 311
- `TRAP_SETUP_DURATION_SEC` — const — line 316
- `TRAP_SKILL_DETECTION_CUT` — const — line 106
- `TRAP_WEATHER_MAX_CATCHUP_CYCLES` — const — line 231
- `TRAP_WEATHER_SEVERITY` — const — line 211
- `TrapCooldowns` — type — line 175
- `TrapDef` — type — line 24
- `trapDetectionChance` — function — line 119
- `trapDetectionRoll` — function — line 163
- `TrapKind` — type — line 17
- `trapKindForItem` — function — line 80
- `TrapLureDescriptor` — type — line 290
- `TrapPlacementReason` — type — line 298
- `TrapState` — type — line 22
- `trapStateLabel` — function — line 322
- `TrapUseResult` — type — line 199
- `TrapWeatherCatchup` — type — line 233
- `trapWeatherWear` — function — line 222

## `world/beehives.ts`

- `BeehiveRecord` — type — line 5
- `burnHive` — function — line 69
- `collectHoney` — function — line 56
- `HIVE_BURN_REWARD_HONEY` — const — line 65
- `HIVE_STING_DAMAGE` — const — line 44
- `HiveBurnResult` — type — line 67
- `HiveCollectResult` — type — line 52
- `HONEY_MAX_ACCUMULATION` — const — line 22
- `HONEY_PRODUCTION_INTERVAL_DAYS` — const — line 20
- `honeyAvailable` — function — line 24
- `rollHiveSting` — function — line 46

## `world/bloodTraces.ts`

- `BLOOD_GLOBAL_CAP` — const — line 64
- `BLOOD_LOCAL_CAP` — const — line 61
- `BLOOD_LOCAL_RADIUS` — const — line 60
- `BLOOD_MAX_LIFETIME_DAYS` — const — line 50
- `BLOOD_MAX_SIZE` — const — line 48
- `BLOOD_MIN_LIFETIME_DAYS` — const — line 49
- `BLOOD_MIN_SIZE` — const — line 47
- `BLOOD_RAIN_FADE_WEIGHT` — const — line 56
- `BLOOD_VARIANT_COUNT` — const — line 46
- `BloodTrace` — type — line 26
- `bloodTraceRemainingFraction` — function — line 135
- `BloodTraceSink` — type — line 216
- `bloodTracesNear` — function — line 206
- `BloodTraceSystem` — type — line 239
- `BloodTraceWorldState` — type — line 41
- `computeBloodTraceSize` — function — line 97
- `createBloodTraceSystem` — function — line 262
- `createBloodTraceWorldState` — function — line 86
- `pruneBloodTraces` — function — line 146
- `recordBloodHit` — function — line 235
- `recordBloodTrace` — function — line 162
- `setBloodTraceSink` — function — line 228

## `world/caveColliders.ts`

- `buildCaveWallColliders` — function — line 102

## `world/caveGenerator.ts`

- `CAVE_MOUTH_DEPTH` — const — line 36
- `CaveGeneratorInput` — type — line 80
- `generateCaveDefinitions` — function — line 266

## `world/caveMesh.ts`

- `createCaveInteriorMesh` — function — line 117

## `world/caves/caveSpikeMaterial.ts`

- `createCaveSpikeMaterial` — function — line 21

## `world/caves/caveSpikeMetrics.ts`

- `CaveSpikeMetrics` — type — line 11
- `CaveSpikeVariant` — type — line 9
  - domain: world-terrain
- `reportCaveSpikeMetrics` — function — line 48
- `runMedianOfN` — function — line 28

## `world/caves/caveTopology.ts`

- `CaveTopology` — type — line 64
  - domain: world-terrain
- `CaveTopologyFeature` — type — line 48
- `CaveTopologyFeatureKind` — type — line 19
- `CaveTopologyNode` — type — line 27
- `CaveTopologyNodeKind` — type — line 17
- `CaveTopologyPoint` — type — line 21
- `CaveTopologySegment` — type — line 39

## `world/caves/sdfCaveMesh.ts`

- `AccidentalUnionStressConfig` — type — line 416
- `buildAccidentalUnionStressMesh` — function — line 431
  - domain: world-terrain
- `buildSdfCaveMesh` — function — line 357
  - domain: world-terrain
- `countConnectedComponents` — function — line 454
- `DEFAULT_SDF_PARAMS` — const — line 37
- `SdfCaveParams` — type — line 24
- `SdfCaveResult` — type — line 347

## `world/caves/spikeNoise.ts`

- `createMultiScaleNoise1D` — function — line 40
- `createValueNoise1D` — function — line 25
- `NoiseOctave` — type — line 35

## `world/caves/spikeTestCave.ts`

- `buildSpikeTestTopology` — function — line 53
  - domain: world-terrain
- `SpikeTestCaveOptions` — type — line 40

## `world/caves/sweepCaveMesh.ts`

- `buildSweepCaveMesh` — function — line 257
  - domain: world-terrain
- `DEFAULT_SWEEP_PARAMS` — const — line 39
- `SweepCaveParams` — type — line 24
- `SweepCaveResult` — type — line 249

## `world/caves/topologyAdapter.ts`

- `topologyToCaveDefinition` — function — line 34
  - domain: world-terrain

## `world/caveVolume.ts`

- `CaveBounds` — type — line 41
- `CaveDefinition` — type — line 50
- `CaveEntrance` — type — line 30
- `CaveNode` — type — line 10
- `CaveNodeKind` — type — line 8
- `CaveTunnel` — type — line 20
- `CaveVolume` — type — line 105
- `computeCaveBounds` — function — line 178
- `createCaveVolume` — function — line 126

## `world/clouds.ts`

- `CloudAppearance` — type — line 59
- `cloudAppearanceFor` — function — line 99
- `CloudSystem` — type — line 129
- `createClouds` — function — line 135

## `world/collision.ts`

- `CircleCollider` — type — line 24
- `closestBoundaryPoint` — function — line 112
- `Collider` — type — line 45
- `colliderActiveAtY` — function — line 51
- `colliderContainsPoint` — function — line 96
- `ColliderRegistry` — type — line 244
- `colliderRimPoint` — function — line 141
- `colliderSignedDistance` — function — line 85
- `createColliderRegistry` — function — line 260
- `isInsideAnyCollider` — function — line 100
- `ObbCollider` — type — line 36
- `resolvePosition` — function — line 223
- `VerticalExtent` — type — line 19

## `world/containerProp.ts`

- `createPlacedContainerProp` — function — line 15
- `disposePlacedContainerProp` — function — line 48

## `world/createBeehives.ts`

- `BeehiveEntry` — type — line 13
- `Beehives` — type — line 15
- `createBeehives` — function — line 63

## `world/createCaves.ts`

- `Caves` — type — line 46
- `createCaves` — function — line 90
  - system: caves
  - role: Owns cave definitions, streamed interior presentation and cave-wall collider registration; `PlayerController` ground/ceiling queries go through `contains`/`sampleFloor`/`sampleCeiling`.
  - owns: Caves
  - lifecycle: rebuild

## `world/createDryingRacks.ts`

- `createDryingRacks` — function — line 48
- `DryingRackEntry` — type — line 9
- `DryingRacks` — type — line 11

## `world/createGrassForagePatches.ts`

- `createGrassForagePatches` — function — line 62
- `GrassForageService` — type — line 22

## `world/createLights.ts`

- `createLights` — function — line 24
- `WorldLights` — type — line 4

## `world/createOcean.ts`

- `createOcean` — function — line 33
- `WorldOcean` — type — line 9

## `world/createPalisades.ts`

- `createPalisades` — function — line 74
  - domain: items-player
- `Palisades` — type — line 30
- `PalisadeSegmentEntry` — type — line 28

## `world/createPlacedContainers.ts`

- `createPlacedContainers` — function — line 108
- `PlacedContainerEntry` — type — line 33
- `PlacedContainerRecord` — type — line 13
- `PlacedContainers` — type — line 47
- `SaveCarriedContainer` — type — line 26

## `world/createPlacedTraps.ts`

- `createPlacedTraps` — function — line 92
- `PlacedTrapEntry` — type — line 25
- `PlacedTraps` — type — line 47
- `PlacedTrapsHooks` — type — line 38
- `TrapCaptureEvent` — type — line 27

## `world/createPlayerGardens.ts`

- `createPlayerGardens` — function — line 67
- `PlayerGardenEntry` — type — line 19
- `PlayerGardens` — type — line 21

## `world/createPlayerWells.ts`

- `createPlayerWells` — function — line 56
- `PlayerWellEntry` — type — line 16
- `PlayerWells` — type — line 18

## `world/createRiverWater.ts`

- `createChunkRiver` — function — line 23
- `WorldRiver` — type — line 8

## `world/createSky.ts`

- `createSky` — function — line 31
- `SkyParams` — type — line 4
- `WorldSky` — type — line 12

## `world/createSleepingUtilities.ts`

- `BedrollEntry` — type — line 12
- `createSleepingUtilities` — function — line 52
  - domain: items-player
- `PlatformEntry` — type — line 13
- `SleepingUtilities` — type — line 15

## `world/createStandingTorches.ts`

- `createStandingTorches` — function — line 64
  - domain: items-player
- `StandingTorchEntry` — type — line 15
- `StandingTorches` — type — line 29

## `world/createTerrainPreparations.ts`

- `createTerrainPreparations` — function — line 58
- `TerrainPreparationEntry` — type — line 9
- `TerrainPreparations` — type — line 11

## `world/createWater.ts`

- `createChunkWater` — function — line 46
- `WorldWater` — type — line 15

## `world/createWorkContracts.ts`

- `CreateWorkContractParams` — type — line 23
- `createWorkContracts` — function — line 144
  - domain: npc
- `WorkContracts` — type — line 38

## `world/cropLifecycle.ts`

- `CROP_DEFS` — const — line 26
- `CROP_IDS` — const — line 32
- `CropDefinition` — type — line 13
- `CropGrowthStage` — type — line 7
- `CropHarvestYield` — type — line 89
- `CropId` — type — line 11
- `CropPlacement` — type — line 36
- `resolveCropHarvest` — function — line 94
- `resolveCropStage` — function — line 70
- `rollCropPhase` — function — line 85

## `world/cropVisuals.ts`

- `createCropStageMesh` — function — line 12

## `world/dayNight.ts`

- `createDayNightState` — function — line 43
- `DayNightState` — type — line 29
- `DEFAULT_TIME_OF_DAY` — const — line 27
- `formatClock` — function — line 200
- `parseTimeOfDayFromUrl` — function — line 184
- `phaseName` — function — line 207
- `resetDayNightForNewGame` — function — line 57
- `skyParamsFromTime` — function — line 72
- `tickDayNight` — function — line 62

## `world/dryingRacks.ts`

- `DryingRackRecord` — type — line 9
- `DryingRecipe` — type — line 27
- `isDryingComplete` — function — line 51
- `pickDryingRecipe` — function — line 32
- `startDryingProcess` — function — line 40

## `world/fishing.ts`

- `applyFishingBait` — function — line 82
- `FISHING_BAIT_BASE_STRENGTH` — const — line 72
- `FISHING_BAIT_BONUS` — const — line 46
- `FISHING_BAIT_DURATION_DAYS` — const — line 71
- `FISHING_BAIT_MAX_STRENGTH` — const — line 73
- `FISHING_BASE_CATCH_CHANCE` — const — line 45
- `FISHING_CAST_DURATION_SEC` — const — line 58
- `FISHING_MAX_CATCH_CHANCE` — const — line 47
- `FishingBaitState` — type — line 64
- `fishingCatchChance` — function — line 49
- `fishingCatchRoll` — function — line 41
- `fishingSpotId` — function — line 14
- `isBaitActive` — function — line 75
- `rollFishingCatch` — function — line 54

## `world/foliageWind.ts`

- `FOLIAGE_ALPHA_CUTOFF` — const — line 49
- `hardenFoliageAlpha` — function — line 58
- `patchFoliageWindMaterial` — function — line 80
- `patchFoliageWindOnObject` — function — line 106
- `patchProceduralFoliageMaterial` — function — line 124
- `updateFoliageWind` — function — line 130

## `world/foodSources.ts`

- `createFoodSourceHooks` — function — line 163
- `FoodSourceTarget` — type — line 19
- `nearestFoodSource` — function — line 98
- `nearestHarvestableCrop` — function — line 138
- `SettlementFoodSourceHooks` — type — line 26

## `world/gardenPlotProp.ts`

- `createGardenPlotProp` — function — line 9

## `world/grassForage.ts`

- `depleteGrassPatch` — function — line 105
- `GRASS_PATCH_CELL_SIZE` — const — line 22
  - domain: fauna
  - system: grass-forage
  - role: Owns deterministic patch placement and depletion/regrowth state.
  - owns: GrassForageOverrides
- `GRASS_PATCH_EXISTS_CHANCE` — const — line 26
- `GRASS_PATCH_JITTER` — const — line 27
- `GRASS_REGROWTH_DAYS` — const — line 30
- `GrassForageOverrides` — type — line 94
- `grassPatchCandidate` — function — line 51
- `GrassPatchCandidate` — type — line 32
- `grassPatchCandidatesNear` — function — line 69
- `grassPatchCellCoord` — function — line 40
- `grassPatchId` — function — line 44
- `isGrassPatchAvailable` — function — line 96
- `pruneGrassForageOverrides` — function — line 113

## `world/helperDeliveryHooks.ts`

- `createHelperDeliveryHooks` — function — line 27
- `HelperDeliveryHooks` — type — line 10

## `world/hiddenFinds.ts`

- `findHiddenFindSpot` — function — line 171
- `HIDDEN_FIND_SEARCH_RADIUS` — const — line 49
- `HiddenFindLandmark` — type — line 51
- `HiddenFindLoot` — type — line 61
- `HiddenFindMatch` — type — line 161
- `resolveHiddenFindLoot` — function — line 198

## `world/largeCaves.ts`

- `LARGE_CAVE_MAX_LENGTH` — const — line 33
- `LARGE_CAVE_MIN_HOME_DIST` — const — line 35
- `LARGE_CAVE_MIN_LENGTH` — const — line 32
- `LARGE_CAVE_MIN_SEPARATION` — const — line 34
- `LARGE_CAVE_MOUTH_WIDTH` — const — line 31
- `LargeCavePlacementInput` — type — line 19
- `LargeCaveSite` — type — line 7
- `openingDirection` — function — line 131
- `pickLargeCaveSites` — function — line 98
- `tunnelDirection` — function — line 127
- `VillageFootprint` — type — line 17

## `world/largeCaveVisual.ts`

- `createLargeCaveVisual` — function — line 13
- `placeLargeCaveVisual` — function — line 63

## `world/locations/locationConfig.ts`

- `CEMETERY_SEARCH_CHUNK_RADIUS` — const — line 45
- `FAR_RANGE_KM` — const — line 32
- `GUARD_LANDMARK_POOL_SIZE` — const — line 83
- `GUARD_REVEAL_MAX` — const — line 85
- `GUARD_REVEAL_MIN` — const — line 84
- `KM_PER_DAY` — const — line 15
- `kmToDays` — function — line 25
- `kmToWorldUnits` — function — line 21
- `LAKE_FLOOD_FILL_SAFETY_CAP` — const — line 79
- `LOCATION_SCAN_STEP` — const — line 39
- `LOCATION_TILE_CELLS` — const — line 63
- `MAX_CEMETERY_SETTLEMENTS_SEARCHED` — const — line 53
- `MEDIUM_RANGE_KM` — const — line 31
- `MERCHANT_MAP_LANDMARK_POOL_SIZE` — const — line 88
- `MIN_LAKE_CELLS` — const — line 57
- `NEAR_RANGE_KM` — const — line 30
- `PEAK_MERGE_RADIUS_CELLS` — const — line 71
- `PEAK_NEIGHBOR_MARGIN_CELLS` — const — line 70
- `PEAK_SCAN_HALO_CELLS` — const — line 72
- `WORLD_UNITS_PER_KM` — const — line 11
- `worldUnitsToKm` — function — line 17

## `world/locations/locationDiscovery.ts`

- `classifyRange` — function — line 5
- `formatDistance` — function — line 21
- `isWithinRange` — function — line 11
- `landmarksInBand` — function — line 66
- `pickRandomReveal` — function — line 51
- `pickRandomSubset` — function — line 40
- `settlementsInBand` — function — line 76
- `weightedTopN` — function — line 30

## `world/locations/locationKnowledge.ts`

- `createLocationKnowledge` — function — line 35
- `getActiveLocationKnowledge` — function — line 83
- `LocationKnowledge` — type — line 19
- `LocationKnowledgeEntry` — type — line 3
- `setActiveLocationKnowledge` — function — line 79

## `world/locations/locationsCoarseCache.ts`

- `CoarseCachePersistence` — type — line 73
- `CoarseTilePayload` — type — line 26
- `createCoarseCachePersistence` — function — line 91
- `LOCATIONS_COARSE_NAMESPACE` — const — line 20
  - domain: world
  - system: worldgen-cache
  - role: Persistent-cache integration for `WorldLocationCatalog`'s coarse terrain tiles (plan world-015 §7/§11/§15) — reuses the exact tile shape `worldLocationCatalog.ts` already keeps in memory (`Uint8Array` state + `Float32Array` height per 16×16 tile), never a second coarse-terrain representation.
  - integration: The catalog stays fully synchronous; this module owns the async IndexedDB side (hydrate-on-activate, debounced dirty-tile upsert) behind a synchronous `hydrateTile`/`onTileDirty` seam the catalog calls through its `WorldLocationCatalogDeps`. A hydrate miss or write failure always falls back to normal procedural sampling — this is an optimization layer, never a correctness dependency.
- `LOCATIONS_COARSE_VERSION` — const — line 24
- `locationsCoarseFingerprint` — function — line 63
- `tileSubKey` — function — line 28

## `world/locations/navigationTargets.ts`

- `createNavigationTargets` — function — line 35
- `getActiveNavigationTargets` — function — line 94
- `MAX_NAVIGATION_TARGETS` — const — line 1
- `NavigationTargetEntry` — type — line 3
- `NavigationTargets` — type — line 21
- `setActiveNavigationTargets` — function — line 90
- `SetTargetResult` — type — line 12

## `world/locations/seedProfile.ts`

- `generateSeedName` — function — line 82
- `sampleStartupTerrainProfile` — function — line 36
- `SeedTerrainProfile` — type — line 23

## `world/locations/worldLocationCatalog.ts`

- `createWorldLocationCatalog` — function — line 166
- `LocationScanDiagnostics` — type — line 63
- `settlementLocationId` — function — line 557
- `WorldLocationCatalog` — type — line 97
- `WorldLocationCatalogDeps` — type — line 23

## `world/locations/worldLocationNames.ts`

- `landmarkName` — function — line 67

## `world/locations/worldLocationTypes.ts`

- `DiscoveryRange` — type — line 27
- `WorldLocation` — type — line 14
- `WorldLocationKind` — type — line 1
- `worldLocationKindFromId` — function — line 39

## `world/map/mapConfig.ts`

- `MAP_CELL_SIZE` — const — line 2
- `MAP_DISCOVERY_RADIUS` — const — line 5
- `MAP_EXTENT_HALF` — const — line 9
- `MAP_MINIMAP_ZOOM_MAX` — const — line 13
- `MAP_MINIMAP_ZOOM_MIN` — const — line 12
- `MAP_WORLD_MAX_CELLS_PER_AXIS` — const — line 21
- `MAP_WORLD_ZOOM_DEFAULT` — const — line 18
- `MAP_WORLD_ZOOM_MAX` — const — line 17
- `MAP_WORLD_ZOOM_MIN` — const — line 16

## `world/map/mapData.ts`

- `createMapData` — function — line 44
- `getActiveMapData` — function — line 112
- `MapData` — type — line 13
- `setActiveMapData` — function — line 108

## `world/map/mapDiscovery.ts`

- `cellsInDiscoveryRadius` — function — line 20
- `createMapDiscovery` — function — line 37
- `MapDiscovery` — type — line 5

## `world/map/mapProjection.ts`

- `createMapProjection` — function — line 125
- `mapCellBounds` — function — line 40
- `mapCellCenter` — function — line 33
- `mapCellKey` — function — line 22
- `MapProjection` — type — line 118
- `parseMapCellKey` — function — line 54
- `projectCellAt` — function — line 79
- `rawSampleParamsFromWorld` — function — line 63
- `worldToMapCell` — function — line 26

## `world/map/mapTypes.ts`

- `MapBiomeKind` — type — line 13
- `MapCellData` — type — line 15
- `MapCellKey` — type — line 1
- `MapConfidence` — type — line 28
- `MapKnownLocation` — type — line 32
- `MapLocationKind` — type — line 30
- `MapSource` — type — line 25
- `MapTerrainKind` — type — line 4
- `MapViewport` — type — line 43

## `world/palisade.ts`

- `isPalisadeConstructionComplete` — function — line 117
- `nearestPalisadeConnection` — function — line 151
- `PALISADE_FOOTPRINT_RADIUS` — const — line 46
- `PALISADE_HALF_LENGTH` — const — line 45
- `PALISADE_LENGTH` — const — line 44
- `PALISADE_MATERIAL_REQUIREMENTS` — const — line 82
- `PALISADE_PLACE_DURATION_SEC` — const — line 61
- `PALISADE_PLACE_REACH` — const — line 55
- `PALISADE_PLACEMENT_MESSAGE` — const — line 69
- `PALISADE_RECOVERY_RATE` — const — line 89
- `PALISADE_REQUIRED_WORK` — const — line 95
- `PALISADE_SEPARATION` — const — line 52
- `PALISADE_SNAP_RADIUS` — const — line 59
- `PALISADE_WORK_SESSION_HOURS` — const — line 103
- `PALISADE_WORK_SESSION_SEC` — const — line 98
- `palisadeEndpoints` — function — line 135
- `PalisadePlacementReason` — type — line 63
- `palisadePromptLabel` — function — line 125
- `palisadeRemainingWork` — function — line 109
- `PalisadeSegmentRecord` — type — line 28
  - domain: items-player
- `resolvePalisadeSite` — function — line 185

## `world/palisadeProp.ts`

- `createPalisadeSegmentProp` — function — line 20
- `disposePalisadeSegmentProp` — function — line 53

## `world/parseSeed.ts`

- `createSeededRandom` — function — line 2
- `hasExplicitUrlSeed` — function — line 34
- `parseSeedFromUrl` — function — line 14
- `randomSeed` — function — line 25
- `setUrlSearchParam` — function — line 41
- `syncSeedInUrl` — function — line 48

## `world/placementPreview.ts`

- `createPlacementPreviewGhost` — function — line 38
- `PlacementPreviewGhost` — type — line 27

## `world/plantedCrops.ts`

- `CROP_PLANT_DURATION_SEC` — const — line 14
- `CROP_PLANT_FOOTPRINT_RADIUS` — const — line 10
- `CROP_PLANT_MESSAGE` — const — line 24
- `CROP_PLANT_REACH` — const — line 8
- `CROP_PLANT_SEPARATION` — const — line 12
- `CROP_SEED_ITEM` — const — line 18
- `GARDEN_PLANT_RADIUS` — const — line 39
- `isNearAnyGarden` — function — line 44
- `makePlantedCropId` — function — line 56
- `parsePlantedCrops` — function — line 66

## `world/plantedTrees.ts`

- `makePlantedTreeId` — function — line 44
- `parsePlantedTrees` — function — line 76
- `pickPlantedTreeSpecies` — function — line 53
- `PlantedTreeRecord` — type — line 12
- `TREE_PLANT_DURATION_SEC` — const — line 32
- `TREE_PLANT_FOOTPRINT_RADIUS` — const — line 27
- `TREE_PLANT_MESSAGE` — const — line 34
- `TREE_PLANT_REACH` — const — line 24
- `TREE_PLANT_SEPARATION` — const — line 29

## `world/playerGarden.ts`

- `applyCultivationMaintenance` — function — line 157
- `applyGardenWatering` — function — line 310
- `CARE_DEGRADATION_PER_DAY` — const — line 118
- `CARE_MAINTAINED_THRESHOLD` — const — line 120
- `CARE_NEGLECTED_THRESHOLD` — const — line 121
- `CARE_REMOVAL_THRESHOLD` — const — line 125
- `CultivationStatus` — type — line 127
- `cultivationYieldCount` — function — line 350
- `DROUGHT_STRESS_CAP_DAYS` — const — line 230
- `DROUGHT_STRESS_MAX_STEPS` — const — line 227
- `DROUGHT_STRESS_PERCENT_PER_STEP` — const — line 226
- `DROUGHT_STRESS_STEP_DAYS` — const — line 225
- `droughtYieldMultiplier` — function — line 243
- `findNearestGarden` — function — line 84
- `GARDEN_CAPABILITY` — const — line 52
- `GARDEN_COST` — const — line 48
- `GARDEN_FOOTPRINT_RADIUS` — const — line 56
- `GARDEN_PLACE_DURATION_SEC` — const — line 61
- `GARDEN_PLACE_REACH` — const — line 59
- `GARDEN_PLACEMENT_MESSAGE` — const — line 71
- `GARDEN_SEPARATION` — const — line 57
- `GardenHydrationState` — type — line 248
- `GardenMaterialCost` — type — line 47
- `GardenPlacementReason` — type — line 69
- `gardenPlotPromptLabel` — function — line 371
- `getCultivationStatus` — function — line 129
- `HYDRATION_DROUGHT_THRESHOLD` — const — line 210
- `HYDRATION_DRY_RATE_PER_DAY` — const — line 195
- `HYDRATION_RAIN_GAIN_PER_DAY` — const — line 207
- `HYDRATION_SIM_WINDOW_DAYS` — const — line 223
- `MAINTENANCE_BASE_DURATION_SEC` — const — line 172
- `MAINTENANCE_CARE_GAIN` — const — line 152
- `MAINTENANCE_TOOL_DURATION_SEC` — const — line 178
- `maintenanceDurationSec` — function — line 181
- `PLAYER_GARDEN_PLANT_RADIUS` — const — line 67
- `PlayerGardenRecord` — type — line 27
- `resolveCultivationCare` — function — line 142
- `resolveGardenHydration` — function — line 269
- `resolveGardenHydrationAfterHarvest` — function — line 322
- `WATERING_DURATION_SEC` — const — line 203
- `WATERING_HYDRATION_GAIN` — const — line 197
- `WATERING_LITRES` — const — line 200
- `weedGrowthMultiplier` — function — line 234

## `world/playerWell.ts`

- `activeWellStage` — function — line 259
- `advanceWellConstruction` — function — line 164
- `formatHours` — function — line 316
- `getWellPitWorkHours` — function — line 70
- `isWellCompleted` — function — line 227
- `isWellStageWorkComplete` — function — line 219
- `isWellWaterAvailable` — function — line 236
- `NearbyPlayerWellLookup` — type — line 346
- `nextWellStage` — function — line 214
- `PlayerWellRecord` — type — line 26
- `WELL_FOOTPRINT_RADIUS` — const — line 276
- `WELL_PLACE_DURATION_SEC` — const — line 282
- `WELL_PLACE_REACH` — const — line 279
- `WELL_PLACEMENT_MESSAGE` — const — line 266
- `WELL_SEPARATION` — const — line 277
- `WELL_STAGE_CAPABILITY` — const — line 105
- `WELL_STAGE_COST` — const — line 93
- `WELL_STAGE_START_PROMPT` — const — line 300
- `WELL_STAGE_WORK_HOURS` — const — line 56
- `WELL_WORK_LABEL` — const — line 307
- `WELL_WORK_SESSION_HOURS` — const — line 297
- `WELL_WORK_SESSION_SEC` — const — line 288
- `WellMaterialCost` — type — line 87
- `WellPlacementReason` — type — line 264
- `wellPromptLabel` — function — line 328
- `wellRemainingWork` — function — line 199
- `WellStage` — type — line 21
- `wellStageCapabilities` — function — line 118
- `wellStageRequirements` — function — line 130
- `wellStageWorkHours` — function — line 83
- `wellWaterSource` — function — line 245
- `WellWorkOutcome` — type — line 151

## `world/playerWellProp.ts`

- `createPlayerWellStageProp` — function — line 64

## `world/pointLightBudget.ts`

- `countVisibleRealPointLights` — function — line 143
- `createNullPointLightBudget` — function — line 333
- `createPointLightBudget` — function — line 159
- `POINT_LIGHT_CULL_USERDATA` — const — line 34
- `POINT_LIGHT_PAD_NAME` — const — line 33
- `POINT_LIGHT_PAD_USERDATA` — const — line 32
- `POINT_LIGHT_PROTECT_RADIUS` — const — line 42
- `PointLightBudget` — type — line 71
- `PointLightBudgetSnapshot` — type — line 44

## `world/riverGeometry.ts`

- `buildRiverRibbonGeometry` — function — line 134
- `clipChainToRect` — function — line 62
- `RIVER_SURFACE_OFFSET` — const — line 12

## `world/riverWaterMaterial.ts`

- `createRiverWaterMaterial` — function — line 117

## `world/seedLibrary.ts`

- `clearSeedCache` — function — line 96
- `DeleteSeedError` — type — line 78
- `deleteSeedGuarded` — function — line 84
- `DeleteSeedResult` — type — line 79
- `ensureSeedRecordsForSeeds` — function — line 68
- `isSeedInLibrary` — function — line 23
- `resolveInitialSeedChoice` — function — line 35
- `resolveNewGameSeed` — function — line 54
- `SeedChoice` — type — line 18
  - domain: world
  - system: seed-library
  - role: New Game seed-intent resolution + lifecycle orchestration (plan world-015 §3/§10/§13) — the single seam both New Game entrypoints (boot `StartScreen`, in-app pause menu) go through, so "reuse an existing seed" can never quietly fall back to `randomSeed()`.
  - uses: SeedRecord

## `world/settlementForestHooks.ts`

- `SettlementForestHooks` — type — line 4

## `world/sleepingUtilities.ts`

- `BEDROLL_FOOTPRINT_RADIUS` — const — line 51
- `BEDROLL_MATERIAL_REQUIREMENTS` — const — line 64
- `BEDROLL_ON_PLATFORM_RADIUS` — const — line 96
- `BEDROLL_PLACE_DURATION_SEC` — const — line 54
- `BEDROLL_PLACE_REACH` — const — line 53
- `BEDROLL_PLACEMENT_MESSAGE` — const — line 71
- `BEDROLL_REST_RADIUS` — const — line 90
- `BEDROLL_SEPARATION` — const — line 52
- `BedrollPlacementReason` — type — line 68
- `BedrollRecord` — type — line 24
- `findNearestSleepingUtility` — function — line 102
- `PLATFORM_FOOTPRINT_RADIUS` — const — line 56
- `PLATFORM_MATERIAL_REQUIREMENTS` — const — line 66
- `PLATFORM_PLACE_DURATION_SEC` — const — line 59
- `PLATFORM_PLACE_REACH` — const — line 58
- `PLATFORM_PLACEMENT_MESSAGE` — const — line 79
- `PLATFORM_SEPARATION` — const — line 57
- `PlatformPlacementReason` — type — line 69
- `PlatformRecord` — type — line 39
- `resolveSleepingUtilityCondition` — function — line 175
- `SLEEPING_UTILITY_CONDITION_MAX` — const — line 122
- `SLEEPING_UTILITY_RAIN_DECAY_PER_DAY` — const — line 132
- `SLEEPING_UTILITY_SIM_WINDOW_DAYS` — const — line 138
- `SLEEPING_UTILITY_SNOW_DECAY_PER_DAY` — const — line 133
- `SleepingUtilityVariant` — type — line 22
  - domain: items-player

## `world/sleepingUtilityProp.ts`

- `createBedrollProp` — function — line 13
- `createPlatformProp` — function — line 46
- `disposeSleepingUtilityProp` — function — line 74

## `world/standingTorch.ts`

- `isStandingTorchConstructionComplete` — function — line 98
- `STANDING_TORCH_FOOTPRINT_RADIUS` — const — line 41
- `STANDING_TORCH_MATERIAL_REQUIREMENTS` — const — line 72
- `STANDING_TORCH_PLACE_DURATION_SEC` — const — line 48
- `STANDING_TORCH_PLACE_REACH` — const — line 45
- `STANDING_TORCH_PLACEMENT_MESSAGE` — const — line 55
- `STANDING_TORCH_REQUIRED_WORK` — const — line 81
- `STANDING_TORCH_SEPARATION` — const — line 42
- `STANDING_TORCH_WORK_SESSION_HOURS` — const — line 87
- `STANDING_TORCH_WORK_SESSION_SEC` — const — line 84
- `StandingTorchPlacementReason` — type — line 50
- `standingTorchPromptLabel` — function — line 106
- `StandingTorchRecord` — type — line 27
  - domain: items-player
- `standingTorchRemainingWork` — function — line 91

## `world/standingTorchProp.ts`

- `createStandingTorchVisual` — function — line 28
- `preloadStandingTorchTemplate` — function — line 15

## `world/terrainPreparationPreview.ts`

- `createTerrainPreparationPreview` — function — line 42
- `TerrainPreparationPreview` — type — line 15

## `world/terrainPreparationProp.ts`

- `createTerrainPreparationMarker` — function — line 14

## `world/timeConversion.ts`

- `GAME_HOURS_PER_DAY` — const — line 13
- `gameDaysToGameHours` — function — line 19
- `gameDaysToRealSeconds` — function — line 27
- `gameHoursToGameDays` — function — line 15
- `gameHoursToRealSeconds` — function — line 35
- `realSecondsToGameDays` — function — line 23
- `realSecondsToGameHours` — function — line 31

## `world/timeSkip.ts`

- `createTimeSkip` — function — line 67
- `TimeSkip` — type — line 25
- `TimeSkipFadeStrength` — type — line 8
- `TimeSkipTickResult` — type — line 10

## `world/trapProp.ts`

- `createTrapProp` — function — line 32
- `disposeTrapProp` — function — line 102
- `setTrapPropState` — function — line 88

## `world/treeHarvest.ts`

- `advanceWorldTreeHarvest` — function — line 39
- `CHOP_DURATION_SEC` — const — line 7
- `harvestWorldTree` — function — line 79
- `harvestWorldTreeFully` — function — line 59
- `TreeHarvestResult` — type — line 9

## `world/treeLifecycle.ts`

- `advanceStage` — function — line 416
- `bonusYieldForChopStage` — function — line 217
- `BRANCH_REGENERATION_DAYS` — const — line 172
- `BRANCH_YIELD_BY_SIZE` — const — line 177
- `BranchHarvestResult` — type — line 183
- `canopyGrowthFactor` — function — line 397
- `canReachOld` — function — line 202
- `CHOP_SCALE_MULT` — const — line 136
- `CHOP_YIELDS` — const — line 150
- `clamp01` — function — line 267
- `coastalFactor` — function — line 355
- `createTreeLifecycle` — function — line 558
- `envGrowthFactor` — function — line 365
- `FELLING_BEAM_YIELD` — const — line 167
- `HARVEST_YIELD` — const — line 158
- `HarvestYield` — type — line 145
- `HEIGHT_RANGE_M` — const — line 98
- `isCanopyStage` — function — line 198
- `isChoppableStage` — function — line 194
- `lerp` — function — line 271
- `livingHeightM` — function — line 281
- `makeTreeId` — function — line 547
- `OLD_SPAWN_CHANCE` — const — line 123
- `parseTreeOverrides` — function — line 964
- `PINE_SPECIES_INDICES` — const — line 133
- `quantizeTreeCoord` — function — line 539
- `ResolvedTreeState` — type — line 258
- `rollLivingAge` — function — line 328
- `rollSizeClass` — function — line 317
- `SIZE_CLASS_T` — const — line 106
- `SIZE_CLASS_WEIGHTS` — const — line 113
- `SIZE_JITTER_HALF` — const — line 120
- `sizeT` — function — line 276
- `speciesPrefs` — function — line 343
- `STAGE_DURATION_DAYS` — const — line 88
- `templateHeightM` — function — line 290
- `TREE_SPECIES_PREFS` — const — line 234
- `TREE_TEMPLATE_HEIGHT_M` — const — line 129
- `TreeEnvSample` — type — line 54
- `TreeGrowthStage` — type — line 14
  - domain: world-terrain
  - system: tree-lifecycle
  - role: Owns tree growth stage progression and multi-stage chop state.
  - simulation: tick
  - lifecycle: growth
- `TreeHarvestStepResult` — type — line 459
- `TreeId` — type — line 32
- `TreeLifecycle` — type — line 463
- `TreeLivingAge` — type — line 24
- `TreePresence` — type — line 246
- `TreeSizeClass` — type — line 27
- `TreeSpeciesPrefs` — type — line 74
- `TreeStateOverride` — type — line 36
- `treeVisualKind` — function — line 221
- `TreeVisualKind` — type — line 30
- `visualScaleForTree` — function — line 298
- `yieldForChopStage` — function — line 206

## `world/treeVisuals.ts`

- `applyHarvestedTreeVisual` — function — line 126
- `applyTreeStageVisual` — function — line 100
- `createTreeStageMesh` — function — line 59
- `felledYawFromTreeId` — function — line 20
- `preloadTreeStumpTemplate` — function — line 36
- `readTreeLivingStage` — function — line 88
- `readTreeSizeClass` — function — line 78
- `readTreeSizeJitter` — function — line 84
- `tagTreeMesh` — function — line 131

## `world/waterMaterial.ts`

- `createWaterMaterial` — function — line 235
- `DAY_LAKE_DEEP` — const — line 15
- `DAY_LAKE_FOAM` — const — line 17
- `DAY_LAKE_SHALLOW` — const — line 16
- `DAY_OCEAN_DEEP` — const — line 22
- `DAY_OCEAN_FOAM` — const — line 24
- `DAY_OCEAN_SHALLOW` — const — line 23
- `NIGHT_LAKE_DEEP` — const — line 18
- `NIGHT_LAKE_FOAM` — const — line 20
- `NIGHT_LAKE_SHALLOW` — const — line 19
- `NIGHT_OCEAN_DEEP` — const — line 25
- `NIGHT_OCEAN_FOAM` — const — line 27
- `NIGHT_OCEAN_SHALLOW` — const — line 26
- `setWaterDayNight` — function — line 281
- `tickWaterTime` — function — line 277
- `WaterMaterialOptions` — type — line 35

## `world/waterMirror.ts`

- `AGENT_RENDER_LAYER` — const — line 24
- `assignRenderLayer` — function — line 83
- `bindWaterMirror` — function — line 260
- `createWaterMirror` — function — line 126
- `MirrorCadenceState` — type — line 66
- `REFLECTION_DISTANT_LAYER` — const — line 43
- `REFLECTION_SKIPPED_LAYER` — const — line 35
- `setSubtreeCastShadow` — function — line 89
- `shouldRenderMirror` — function — line 77
- `WATER_MIRROR_SIZE` — const — line 46
- `WATER_RENDER_LAYER` — const — line 19
- `WaterMirror` — type — line 102
- `WaterMirrorUniforms` — type — line 96

## `world/WaterSource.ts`

- `createWaterSource` — function — line 88
- `DRINK_THIRST_RELIEF` — const — line 73
- `UNCOVERED_WELL_CONSUMPTION_RISK` — const — line 57
- `UNCOVERED_WELL_WARNING` — const — line 65
- `UNDRINKABLE_WATER_WARNING` — const — line 83
- `UNSAFE_WATER_WARNING` — const — line 78
- `WaterBodyKind` — type — line 25
- `WaterConsumptionRisk` — type — line 37
- `WaterQuality` — type — line 18
  - domain: world
  - system: water-source
  - role: Shared well/lake/river/ocean drink/fill abstraction; future polluted/treated sources should reuse it.
- `WaterSource` — type — line 45
- `WELL_ROPE_REQUIRED_WARNING` — const — line 68

## `world/weather.ts`

- `ClimateState` — type — line 259
- `computeClimate` — function — line 245
- `computeRainExposureDays` — function — line 220
- `computeSurfaceWeather` — function — line 166
- `computeWeather` — function — line 116
- `createClimateState` — function — line 272
- `DAYS_PER_SEASON` — const — line 31
- `getSeason` — function — line 33
- `getSeasonProgress` — function — line 39
- `Season` — type — line 8
- `SEASON_LABELS` — const — line 14
- `SNOW_ACCUMULATE_WINDOW_DAYS` — const — line 140
- `SNOW_MELT_WINDOW_DAYS` — const — line 143
- `SurfaceWeatherState` — type — line 151
- `temperatureFor` — function — line 69
- `tickClimate` — function — line 276
- `WEATHER_CYCLE_DAYS` — const — line 77
- `WEATHER_LABELS` — const — line 21
- `WeatherState` — type — line 101
- `WeatherType` — type — line 9
- `WETNESS_DRY_WINDOW_DAYS` — const — line 136
- `WorldClimateState` — type — line 236

## `world/weatherParticles.ts`

- `createWeatherParticles` — function — line 221
- `WeatherParticles` — type — line 207
- `WeatherParticlesOptions` — type — line 200

## `world/weatherVisuals.ts`

- `applyWeatherOverlay` — function — line 39
- `WeatherVisualOverlay` — type — line 11

## `world/wellGroundwater.ts`

- `DEEP_WELL_DEPTH_THRESHOLD` — const — line 52
- `isDeepWellDepth` — function — line 54
- `resolveWellWater` — function — line 91
- `WELL_WATER_DEPTH_MAX` — const — line 31
- `WELL_WATER_DEPTH_MIN` — const — line 30
- `WellWaterKind` — type — line 18
  - domain: world
  - system: well-groundwater
  - role: Pure placement-time depth/water-kind resolution for player-built wells.
- `WellWaterResult` — type — line 20

## `world/workContract.ts`

- `acceptWorkContract` — function — line 248
- `beginContractTravel` — function — line 255
- `beginContractWork` — function — line 262
- `canAcceptContract` — function — line 241
- `cancelWorkContract` — function — line 224
- `canPostContract` — function — line 155
- `completeContractWork` — function — line 270
- `ConstructionContractTarget` — type — line 47
- `contractHasActiveTarget` — function — line 147
- `ContractTarget` — type — line 79
- `createWorkContractRecord` — function — line 171
- `invalidateWorkContract` — function — line 232
- `isContractTerminal` — function — line 141
- `isNpcCommitmentFulfilled` — function — line 295
- `noticeBoardId` — function — line 163
- `PalisadeContractTarget` — type — line 65
- `postWorkContract` — function — line 213
- `recordNpcWorkContribution` — function — line 303
- `releaseWorkContract` — function — line 285
- `sameContractTarget` — function — line 311
- `StandingTorchContractTarget` — type — line 72
- `TerrainPreparationContractTarget` — type — line 56
- `WORK_SHARE_PRESETS` — const — line 169
- `WorkContractAdvertisement` — type — line 35
- `WorkContractRecord` — type — line 85
- `WorkContractState` — type — line 24
  - domain: npc
- `WorkType` — type — line 39

## `world/worldContext.ts`

- `createWorldContext` — function — line 39
- `WorldContext` — type — line 17
