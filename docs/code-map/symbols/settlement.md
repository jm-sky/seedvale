# Symbols

Generated from exported TypeScript symbols.

## `settlement/blacksmithYard.ts`

- `BLACKSMITH_YARD_BASE_OFFSET` — const — line 23
  - domain: settlements-npcs Blacksmith household-yard workplace geometry (plan settlements-npcs-024 Stage 1) — pure geometry only, no Three.js or runtime state. Computes the compact anvil + grind-workbench + NPC access-anchor arrangement for one household's blacksmith workplace, anchored to that household's own house. The workplace sits in a lateral sector offset from the house's existing outward yard axis (`props.ts`'s `houseYardPlacements()`, also core → house) so it never overlaps the common household barrel/trough/storage slots (`householdYard.ts`) or the house entrance, which faces inward toward the settlement core (`props.ts` sets house yaw to `outward + PI`).
- `BLACKSMITH_YARD_SECTOR_OFFSET` — const — line 32
- `blacksmithYardGeometry` — function — line 61
- `BlacksmithYardGeometry` — type — line 46

## `settlement/campfireProps.ts`

- `CampfireBodyKind` — type — line 11
- `CampfireFlame` — type — line 196
- `createCampfire` — function — line 180
- `createCampfireBody` — function — line 172
- `createCampfireFlame` — function — line 211
- `createGrateVisual` — function — line 271
- `createLitCampfireVisual` — function — line 255
- `createSimpleFireBase` — function — line 187
- `preloadCampfireTemplates` — function — line 51

## `settlement/createSettlement.ts`

- `createSettlement` — function — line 343
- `CreateSettlementDeps` — type — line 227
- `Settlement` — type — line 114
- `settlementSpawnPoint` — function — line 215

## `settlement/decorProps.ts`

- `cemeteryGraveLayout` — function — line 579
- `CemeterySize` — type — line 547
- `CemeteryTemplates` — type — line 539
- `createBush` — function — line 103
- `createCactus` — function — line 144
- `createCaveMouth` — function — line 688
- `createCemetery` — function — line 617
- `createCemeteryPlot` — function — line 524
- `createCobblePlate` — function — line 178
- `createFallenLog` — function — line 290
- `createFelledTree` — function — line 90
- `createFern` — function — line 163
- `createGraveStone` — function — line 506
- `createLargeRock` — function — line 241
- `createLilyPad` — function — line 209
- `createLimbedTree` — function — line 61
- `createMonolith` — function — line 323
- `createReed` — function — line 191
- `createRockCluster` — function — line 264
- `createSeaweed` — function — line 224
- `createSmallRuins` — function — line 431
- `createStoneCircle` — function — line 386
- `createThicket` — function — line 121
- `createTree` — function — line 18
- `createTreeStump` — function — line 40
- `TerrainPlacementContext` — type — line 11

## `settlement/families.ts`

- `cobbleCountForSize` — function — line 132
- `FamilyDef` — type — line 162
- `FamilyMember` — type — line 145
- `FamilyMemberRef` — type — line 171
- `FamilyRelation` — type — line 143
- `generateFamilies` — function — line 403
- `RolledVillageSize` — type — line 18
- `rollVillageSize` — function — line 210
- `VILLAGE_SIZE_CONFIG` — const — line 64
- `VillageSize` — type — line 15
- `villageSizeConfig` — function — line 117
- `VillageSizeConfig` — type — line 22

## `settlement/findSettlementSite.ts`

- `DEFAULT_SITE_SEARCH_MARGIN` — const — line 52
- `findSettlementSite` — function — line 170
- `SettlementFootprintHint` — type — line 15
- `SettlementSite` — type — line 7
- `SITE_RIVER_CLEARANCE` — const — line 60
- `SITE_SCORE_WEIGHTS` — const — line 28

## `settlement/frameYield.ts`

- `createPropYieldGate` — function — line 22

## `settlement/gardenScale.ts`

- `GARDEN_BED_D` — const — line 62
- `GARDEN_BED_GAP` — const — line 63
- `GARDEN_BED_W` — const — line 61
- `GARDEN_PLAZA_GAP` — const — line 46
- `gardenBedCount` — function — line 69
- `gardenClearingRadius` — function — line 81
- `gardenPlazaMinCenterDist` — function — line 52
- `gardenPlotRadius` — function — line 34
- `GardenScale` — type — line 2
- `gardenUnitsFromHouses` — function — line 5
- `packGardenScales` — function — line 15

## `settlement/hiddenTreasure.ts`

- `HIDDEN_TREASURE_DIG_TOLERANCE` — const — line 19
- `HIDDEN_TREASURE_MARKER_COUNT` — const — line 10
- `HiddenTreasureAnchorSource` — type — line 45
- `hiddenTreasureDigHit` — function — line 76
- `hiddenTreasureMarkerPositions` — function — line 54

## `settlement/houseBuilder.ts`

- `buildAssemblyCollidersWorld` — function — line 657
- `buildHouse` — function — line 719
- `buildHouseCollidersWorld` — function — line 642
- `buildHouseDoorCollidersLocal` — function — line 594
- `BuildHouseOptions` — type — line 308
- `buildHouseWallCollidersLocal` — function — line 560
- `censusAssembly` — function — line 427
- `cornerLocalPosition` — function — line 214
- `createHouseStaticBatch` — function — line 876
- `DOOR_1_FLAT_HINGE_OFFSET_X` — const — line 39
- `DOOR_ANIM_SPEED` — const — line 41
- `DOOR_OPEN_ANGLE` — const — line 40
- `fillOffsetFor` — function — line 372
- `floorTilePositions` — function — line 226
- `HOUSE_ASSEMBLY_SCALE` — const — line 43
- `HOUSE_DOOR_OPENING_HALF_WIDTH_M` — const — line 67
- `HOUSE_WALL_LENGTH_M` — const — line 52
- `HOUSE_WALL_THICKNESS_M` — const — line 53
- `HouseAssembly` — type — line 148
- `HouseAssemblyCensus` — type — line 140
- `HouseBuildContext` — type — line 125
- `houseDefinitionAssetIds` — function — line 317
- `houseDefinitionAssetIdsForStage` — function — line 321
- `HouseDoor` — type — line 131
- `houseFootprintRadius` — function — line 247
- `HouseLocalPose` — type — line 110
- `HousePartPrimitive` — type — line 117
- `HouseStaticBatch` — type — line 161
- `HouseVisualStage` — type — line 306
- `loadHousePartTemplates` — function — line 356
- `matchingWallPlacement` — function — line 252
- `openingLocalPose` — function — line 277
- `resolveRoofParts` — function — line 290
- `transformHouseCollidersToWorld` — function — line 612
- `WALL_YAW` — const — line 89
- `wallLocalTransform` — function — line 193

## `settlement/houseCatalog.ts`

- `DEFAULT_TARGET_DOOR_HEIGHT` — const — line 72
- `HOME_HOUSE_CATALOG` — const — line 204
- `homeHouseEntryAt` — function — line 218
- `HOUSE_CATALOG` — const — line 80
- `HOUSE_FLOOR_LAMP_Y` — const — line 78
- `HOUSE_LAMP_MAX_LOCAL_Y` — const — line 75
- `houseCatalogById` — function — line 214
- `HouseCatalogEntry` — type — line 25
- `HouseLampMount` — type — line 23
- `HouseLampStyle` — type — line 21
- `HouseRole` — type — line 18
- `pickHomeHouse` — function — line 233
- `resolveHouseHeight` — function — line 207

## `settlement/houseDoors.ts`

- `createHouseDoorController` — function — line 57
- `HOUSE_DOOR_CLOSE_DISTANCE` — const — line 18
- `HOUSE_DOOR_OPEN_DISTANCE` — const — line 17
  - domain: settlements
  - system: house-doors
  - role: Owns per-house door proximity hysteresis and change detection.
- `HouseDoorController` — type — line 37
- `shouldOpenHouseDoors` — function — line 23

## `settlement/household.ts`

- `createHousehold` — function — line 312
- `createHouseholdRegistry` — function — line 449
- `HayForageState` — type — line 112
- `Household` — type — line 205
- `HouseholdId` — type — line 22
  - domain: settlements-npcs
  - system: household
  - role: Owns one family's own food/wood/water stock, between NPC carrying and `SettlementEconomy`.
  - owns: Household
  - uses: SettlementEconomy
- `householdIdFor` — function — line 278
- `HouseholdRegistry` — type — line 440
- `HouseholdResourceKind` — type — line 37
- `HouseholdSnapshot` — type — line 180
- `resolveHayForage` — function — line 128
- `WaterReserve` — type — line 143

## `settlement/householdExchange.ts`

- `createHouseholdExchangeHooks` — function — line 67
- `HouseholdExchangeHooks` — type — line 55
- `HouseholdSurplusCandidate` — type — line 12
- `selectHouseholdSurplusSource` — function — line 30

## `settlement/householdYard.ts`

- `HOUSEHOLD_YARD_PROP_OFFSETS` — const — line 27
- `householdYardRadius` — function — line 34
- `MAX_HOUSE_FOOTPRINT_RADIUS` — const — line 21

## `settlement/houseLighting.ts`

- `createHouseLight` — function — line 168
- `createProceduralTorchPost` — function — line 203
- `createVillageTorchLight` — function — line 224
- `HouseLight` — type — line 23
- `ResolvedHouseLampMount` — type — line 365
- `resolveHouseLampMount` — function — line 407
- `VillageTorch` — type — line 29

## `settlement/landOwnership.ts`

- `createLandOwnershipRegistry` — function — line 22
- `LandOwnershipRegistry` — type — line 9
- `landPlotKey` — function — line 18

## `settlement/landPurchase.ts`

- `LandPurchaseResult` — type — line 5
- `LandPurchaseTarget` — type — line 16
- `purchaseLandPlot` — function — line 29

## `settlement/livestock.ts`

- `createLivestockRegistry` — function — line 196
- `disposeLivestock` — function — line 587
- `LIVESTOCK_KINDS` — const — line 54
- `LIVESTOCK_URLS` — const — line 38
- `LivestockPersistence` — type — line 78
- `LivestockRegistry` — type — line 100
- `LivestockSaveRecord` — type — line 67
- `spawnLivestock` — function — line 448
- `tickSettlementLivestock` — function — line 604

## `settlement/lodging.ts`

- `advanceLodgingProgress` — function — line 97
  - domain: ui-input Advances the lodging-walk stuck watchdog by one frame — a meaningful distance improvement resets the timer, otherwise `dt` accumulates until `LODGING_STUCK_TIMEOUT_SEC` is reached. Pure and frame-count-independent (driven by `dt`, not calls) so it can be unit-tested without a running game loop or a `PlayerActionContext` mock.
- `hayLodgingId` — function — line 149
- `initialLodgingProgress` — function — line 87
- `LODGING_ARRIVE_TOLERANCE` — const — line 67
- `LODGING_STUCK_PROGRESS_EPSILON` — const — line 73
- `LODGING_STUCK_TIMEOUT_SEC` — const — line 79
- `lodgingChoiceLabel` — function — line 138
- `LodgingOption` — type — line 16
- `lodgingPlaceLabel` — function — line 117
- `LodgingProgress` — type — line 85
- `LodgingQuality` — type — line 14
- `lodgingRequiresPayment` — function — line 126
- `lodgingRestQuality` — function — line 59
- `LodgingType` — type — line 12

## `settlement/lodgingResolver.ts`

- `collectLodgingCandidates` — function — line 178
- `collectOwnedHouseLodgingOptions` — function — line 196
- `LodgingCandidateContext` — type — line 170
- `LodgingSelection` — type — line 295
- `LodgingSettlementInput` — type — line 24
- `resolveBestLodging` — function — line 260
- `selectLodgingFromCandidates` — function — line 309
- `settlementLodgingInput` — function — line 68

## `settlement/merchantWagon.ts`

- `MERCHANT_HORSE_RADIUS` — const — line 21
- `MERCHANT_STALL_RADIUS` — const — line 23
- `MERCHANT_WAGON_HORSE_DIST` — const — line 19
- `MERCHANT_WAGON_PREFERRED_YAW` — const — line 17
- `MERCHANT_WAGON_RADIUS` — const — line 20
- `MERCHANT_WAGON_STALL_DIST` — const — line 18
- `MerchantWagonPose` — type — line 8
- `pickMerchantWagonPose` — function — line 65
- `WagonObstacle` — type — line 6

## `settlement/minorLocations.ts`

- `clearMinorLocationCaches` — function — line 69
- `findDockLocation` — function — line 26
- `MinorLocation` — type — line 5
- `minorLocationsFor` — function — line 77

## `settlement/npcPhysicalProfile.ts`

- `ageMultiplierForAge` — function — line 80
- `agilityAgePotentialForAge` — function — line 257
- `clampAge` — function — line 42
- `generatePhysicalProfile` — function — line 361
- `LifeStage` — type — line 17
- `lifeStageForAge` — function — line 46
- `NPC_AGE_MAX` — const — line 15
- `NPC_AGE_MIN` — const — line 14
- `PhysicalProfile` — type — line 328
- `resolveHumanAgilityProfile` — function — line 271
- `resolveHumanEnduranceProfile` — function — line 308
- `resolveHumanStrengthProfile` — function — line 296
- `strengthAgePotentialForAge` — function — line 208

## `settlement/npcPostDeath.ts`

- `canLootNpcCorpse` — function — line 149
- `claimNpcCorpseForBurial` — function — line 135
- `cloneNpcCorpseLoot` — function — line 54
- `cloneNpcPostDeath` — function — line 61
- `commitNpcDeath` — function — line 199
- `corpseLootInventory` — function — line 153
- `createActiveNpcPostDeath` — function — line 92
- `createEmptyNpcCorpseLoot` — function — line 74
- `createLegacyTerminalNpcPostDeath` — function — line 80
- `dropNpcCorpseLoot` — function — line 257
- `EMPTY_NPC_CORPSE_LOOT` — const — line 52
- `extractNpcLoadoutLoot` — function — line 180
- `finalizeExpiredNpcCorpse` — function — line 269
- `hasActiveNpcCorpse` — function — line 110
- `markNpcPostDeathTerminal` — function — line 129
- `NPC_CORPSE_BONES_ONSET_DAYS` — const — line 49
- `NPC_CORPSE_REMOVE_DAYS` — const — line 50
- `NPC_CORPSE_ROT_ONSET_DAYS` — const — line 48
- `NpcCorpseCleanupReason` — type — line 25
- `NpcCorpseLootSnapshot` — type — line 27
- `NpcCorpsePhase` — type — line 23
- `npcCorpsePhaseFromElapsedDays` — function — line 114
- `npcCorpseReadyToRemove` — function — line 124
- `NpcPostDeathState` — type — line 32
- `NpcPostDeathStatus` — type — line 21
  - domain: npc
  - role: Authoritative NPC corpse lifecycle, loot snapshot and burial handoff.
  - owns: NpcPostDeathState
- `releaseNpcCorpseBurialClaim` — function — line 141
- `resolveNpcCorpsePhase` — function — line 119
- `shouldSkipNpcCorpsePresentation` — function — line 281
- `snapshotCorpseLoot` — function — line 157
- `transferCorpseCountTo` — function — line 235
- `transferCorpseInstanceTo` — function — line 219

## `settlement/npcRelationships.ts`

- `createNpcRelationships` — function — line 32
- `NpcRelationshipEntry` — type — line 26
- `NpcRelationships` — type — line 15

## `settlement/npcState.ts`

- `createNpcAuthoritativeState` — function — line 173
- `createNpcStateRegistry` — function — line 214
- `MAX_HP` — const — line 37
- `MAX_STAMINA` — const — line 38
- `NpcAuthoritativeState` — type — line 57
  - domain: settlements-npcs
- `NpcId` — type — line 32
- `NpcPhysicalMaxima` — type — line 159
- `NpcStateRegistry` — type — line 201
- `NpcStateSnapshot` — type — line 110

## `settlement/pathDryness.ts`

- `PATH_DRY_SAMPLES` — const — line 10
- `pathIsDry` — function — line 18
- `SETTLEMENT_WATER_MARGIN` — const — line 7

## `settlement/PlacedFires.ts`

- `createPlacedFires` — function — line 138
- `HABITAT_BURN_DESPAWN_DELAY` — const — line 61
- `isPlayerPlacedFire` — function — line 71
- `pileBodyScale` — function — line 37
- `PlacedFire` — type — line 87
- `PlacedFireEntry` — type — line 89
- `PlacedFireKind` — type — line 17
- `PlacedFires` — type — line 101
- `PlaceFireOpts` — type — line 63

## `settlement/places.ts`

- `homeIndexFromPlaceId` — function — line 48
- `homePlaceId` — function — line 38
- `Place` — type — line 20
- `PlaceType` — type — line 18
- `socialPlaceFor` — function — line 71
- `workplaceFor` — function — line 114

## `settlement/props.ts`

- `BlacksmithWorkplace` — type — line 259
- `buildSettlementProps` — function — line 665
- `disposeSettlementGroup` — function — line 1822
- `SettlementHouseBed` — type — line 134
- `SettlementHouseLandmark` — type — line 105
- `SettlementLandmarks` — type — line 141
- `SettlementLandPlot` — type — line 248
- `SettlementStorageVisuals` — type — line 240
- `SettlementTreeLandmark` — type — line 266

## `settlement/propSpecs.ts`

- `BUSH_SPECS` — const — line 17
- `CACTUS_SPECS` — const — line 31
- `CAMPFIRE_FIT_MAX` — const — line 122
- `CAMPFIRE_UNLIT_URL` — const — line 120
- `CEMETERY_SPECS` — const — line 80
- `COBBLE_FIT_MAX` — const — line 127
- `COBBLE_URL` — const — line 124
- `CROPS_FIT_MAX` — const — line 103
- `CROPS_URL` — const — line 101
- `DOCK_SPECS` — const — line 64
- `FALLEN_LOG_SPECS` — const — line 76
- `FARM_HEIGHT` — const — line 99
- `FARM_URL` — const — line 96
- `FERN_SPECS` — const — line 27
- `FIRE_FX_URL` — const — line 137
- `GRAVE_SPECS` — const — line 84
- `LANTERN_FLOOR_MAX` — const — line 138
- `LANTERN_URL` — const — line 135
- `LANTERN_WALL_MAX` — const — line 141
- `LILY_SPECS` — const — line 51
- `REED_SPECS` — const — line 42
- `RESOURCE_GOLD_SPECS` — const — line 88
- `RESOURCE_ROCK_SPECS` — const — line 92
- `ROCK_CLUSTER_SPECS` — const — line 72
- `ROCK_SPECS` — const — line 68
- `SEAWEED_SPECS` — const — line 60
- `TABLE_LAMP_FIT_MAX` — const — line 150
- `TABLE_LAMP_URL` — const — line 149
- `TREE_SPECS` — const — line 5
- `TREE_STUMP_HEIGHT` — const — line 132
- `TREE_STUMP_URL` — const — line 129
- `VILLAGE_CAMPFIRE_COLLISION_RADIUS` — const — line 118
- `VILLAGE_TORCH_HEIGHT` — const — line 142
- `VILLAGE_TORCH_URL` — const — line 136
- `WALL_URL` — const — line 134
- `WELL_HEIGHT` — const — line 107
- `WELL_URL` — const — line 105
- `WOOD_PILE_COLLISION_RADIUS` — const — line 116
- `WOOD_PILE_HEIGHT` — const — line 113
- `WOOD_PILE_PROGRESSIVE_URL` — const — line 111
- `WOOD_PILE_URL` — const — line 109

## `settlement/propUtils.ts`

- `applyTerrainTilt` — function — line 65
- `cloneProp` — function — line 154
- `clonePropWithYaw` — function — line 168
- `loadPropOrFallback` — function — line 119
- `loadPropTemplates` — function — line 143
- `LocalTerrainSample` — type — line 38
- `placeOnGround` — function — line 87
- `rotateOffsetY` — function — line 81
- `sampleLocalTerrain` — function — line 45
- `TerrainSampler` — type — line 29
- `tintPropMaterials` — function — line 10

## `settlement/ratPersistence.ts`

- `createRatRegistry` — function — line 41
- `RatPersistence` — type — line 17
- `RatRegistry` — type — line 23
- `RatSaveRecord` — type — line 12
  - domain: fauna
  - system: settlement-rat-persistence
  - role: Per-`SettlementsManager` persistence for wild settlement rats (plan quests-progression-006) — mirrors `livestock.ts`'s registry lifecycle without livestock ownership semantics.

## `settlement/rats.ts`

- `createSettlementRats` — function — line 130
- `RAT_INFESTATION_FLOOR` — const — line 34
- `RAT_INFESTATION_PRESSURE_BONUS` — const — line 32
- `RAT_POPULATION_CAP` — const — line 26
  - domain: fauna
  - system: settlement-rats
  - role: Settlement-local rat population pressure/reconciliation (plan fauna-016 §7/§8/§9, quests-progression-006) — deliberately not a `RatManager`: rats are plain `AnimalAgent('rat')` instances this module spawns/despawns toward a small, deterministic-target population and periodically drains real household/settlement food from.
- `RatFoodSite` — type — line 82
- `ratNormalPopulationTarget` — function — line 43
- `ratPopulationTarget` — function — line 53
- `RatPressureInputs` — type — line 36
- `SettlementRats` — type — line 103
- `SettlementRatsDeps` — type — line 84

## `settlement/roadNetwork.ts`

- `clearRoadNetworkCaches` — function — line 74
- `entranceToward` — function — line 101
- `findRoute` — function — line 189
- `meanderRoute` — function — line 315
- `MidpointSignpost` — type — line 532
- `midpointSignpostsFor` — function — line 546
- `neighborsFor` — function — line 132
- `RoadNetworkContext` — type — line 51
- `RoadSegment` — type — line 41
- `RoadSegmentKind` — type — line 39
- `RoutePoint` — type — line 29
- `routeToMinorLocation` — function — line 616
- `segmentsNear` — function — line 654
- `SettlementSignpost` — type — line 473
- `signpostsForSettlement` — function — line 485
- `VillageSegments` — type — line 697
- `villageSegmentsNear` — function — line 721
- `yawToward` — function — line 469

## `settlement/settlementGenerator.ts`

- `cellFromId` — function — line 135
- `cellKey` — function — line 120
- `cellSeed` — function — line 163
- `cellsWithinRadius` — function — line 147
- `generateSettlementDef` — function — line 634
- `generateVillagePlan` — function — line 572
- `SETTLEMENT_GRID_STEP` — const — line 63
- `SettlementCell` — type — line 69
- `SettlementDef` — type — line 71
- `worldToCell` — function — line 124

## `settlement/settlementNightCycle.ts`

- `createSettlementNightCycle` — function — line 51
- `NIGHT_FIRE_IGNITE_CHANCE` — const — line 27
- `NIGHT_FIRE_THRESHOLD` — const — line 24
  - domain: settlements
  - system: settlement-night-cycle
  - role: Owns the dusk/dawn threshold crossing that drives fire autolight, torches and house-light intensity.
- `SettlementNightCycle` — type — line 49
- `shouldAutoLightNightFire` — function — line 38

## `settlement/settlementPalisade.ts`

- `PALISADE_GATE_HALF_ANGLE` — const — line 17
- `plantEntrancePalisade` — function — line 61
- `pointHitsCorridor` — function — line 39
- `WALL_HALF_LENGTH` — const — line 15

## `settlement/settlementPlanCache.ts`

- `cachedSettlementDefCount` — function — line 75
- `clearSettlementDefCache` — function — line 48
- `setSettlementRiverQuery` — function — line 42
- `settlementDefFor` — function — line 53
- `SettlementResolveContext` — type — line 16

## `settlement/settlementPropColliders.ts`

- `SettlementPropColliderLandmarks` — type — line 18
- `settlementPropColliders` — function — line 25

## `settlement/settlementProximity.ts`

- `isNearSettlement` — function — line 32
- `NEAR_SETTLEMENT_DISTANCE` — const — line 19
  - domain: settlement
  - system: settlement-proximity
  - role: Cheap, bounded "is this world point near a settlement" check, built on the existing settlement grid instead of loaded/streamed settlements.

## `settlement/settlementSignposts.ts`

- `createLabeledProp` — function — line 51
- `createSettlementSignposts` — function — line 111
- `disposeLabeledProp` — function — line 95
- `LabeledProp` — type — line 37
  - domain: settlements
  - system: settlement-signposts
  - role: Owns build/update/dispose for every settlement prop that pairs a ground-placed mesh with a distance-faded CSS2D label.
- `SettlementSignposts` — type — line 106
- `updateLabelOpacity` — function — line 84

## `settlement/SettlementsManager.ts`

- `createSettlementsManager` — function — line 185
  - domain: settlements
  - system: settlements-manager
  - role: Owns settlement generation, streaming and per-settlement economy/household/NPC-state registries.
  - owns: SettlementEconomy, Household
  - lifecycle: streaming
- `SettlementsManager` — type — line 71

## `settlement/settlementStructures.ts`

- `createAnvil` — function — line 170
- `createBarrel` — function — line 100
- `createCrate` — function — line 157
- `createDock` — function — line 239
- `createGarden` — function — line 307
- `createGrindWorkbench` — function — line 196
- `createHayBale` — function — line 124
- `createHut` — function — line 10
- `createSignpost` — function — line 265
- `createStockpile` — function — line 221
- `createTrough` — function — line 138
- `createVillageNamepost` — function — line 286
- `createWell` — function — line 37
- `createWheatField` — function — line 358
- `layoutCropsGarden` — function — line 337
- `VILLAGE_NAMEPOST_BOARD_CENTER_Y` — const — line 284

## `settlement/settlementTerrain.ts`

- `classifySettlementTerrain` — function — line 36
- `MOUNTAIN_RIDGE_THRESHOLD` — const — line 28
- `TerrainSamplers` — type — line 6

## `settlement/storageDestinations.ts`

- `classifyItemStorageKind` — function — line 31
  - domain: settlements-npcs
  - system: storage-destinations
  - role: Resolves the physical destination for a wood/food delivery, given the household or settlement it belongs to.
- `householdStorageDestination` — function — line 37
- `resolveHouseholdWoodStorage` — function — line 47
- `settlementStorageDestination` — function — line 64

## `settlement/storageInfestation.ts`

- `createStorageInfestationRegistry` — function — line 22
- `StorageInfestationCondition` — type — line 10
  - domain: settlements
  - system: storage-infestation
  - role: Authoritative settlement-owned storage infestation condition (plan quests-progression-006) — keyed by stable `settlementId`, survives settlement stream-out/in, `WorldBundle` rebuild and save/load. Not owned by `QuestManager` or Three.js props.
- `StorageInfestationRegistry` — type — line 12

## `settlement/storageRepair.ts`

- `describeSettlementStorageRepair` — function — line 19
- `formatSettlementStorageInspection` — function — line 40
- `SETTLEMENT_STORAGE_REPAIR_BEAM_COST` — const — line 5
- `SETTLEMENT_STORAGE_REPAIR_DURATION_SEC` — const — line 8
- `SettlementStorageRepairView` — type — line 10

## `settlement/storageVisuals.ts`

- `createFoodStorageVisual` — function — line 196
- `createWoodPileVisual` — function — line 105
- `findWoodPileStageNodes` — function — line 76
- `FOOD_STORAGE_MAX_SLOTS` — const — line 139
- `FoodStorageSlot` — type — line 151
- `FoodStorageVisual` — type — line 179
- `selectFoodStorageSlots` — function — line 158
- `WOOD_PILE_EXTRA_OFFSETS` — const — line 37
- `WOOD_PILE_MAX_EXTRA` — const — line 29
- `WOOD_PILE_OVERFLOW_START` — const — line 27
- `WOOD_PILE_OVERFLOW_STEP` — const — line 28
- `WOOD_PILE_STAGES` — const — line 22
  - domain: settlements-npcs
  - system: storage-visuals
  - role: Derives a bounded, deterministic Three.js visual from a storage destination's authoritative quantity/contents.
- `woodPileOverflowCount` — function — line 62
- `woodPileStage` — function — line 52
- `WoodPileStage` — type — line 23
- `WoodPileVisual` — type — line 88
- `woodPileVisualState` — function — line 71
- `WoodPileVisualState` — type — line 43

## `settlement/villageClearing.ts`

- `ClearingArea` — type — line 10
- `ClearingLayout` — type — line 20
- `layoutClearings` — function — line 145
- `layoutClearingsFromPlan` — function — line 73
- `plazaCoreRadius` — function — line 56

## `settlement/VillageFire.ts`

- `createVillageFire` — function — line 100
- `FIRE_FUEL_KINDS` — const — line 10
- `FireLightSource` — type — line 41
- `FUEL_PER_BRANCH` — const — line 16
- `IGNITE_DURATION_SEC` — const — line 20
- `VillageFire` — type — line 48
- `VillageFireHooks` — type — line 43

## `settlement/villagePlan.ts`

- `FoodSourceType` — type — line 10
- `VillageBoundary` — type — line 27
- `VillageBuildingPlan` — type — line 86
- `VillageBuildingRole` — type — line 78
- `VillageCenter` — type — line 35
- `VillageEntrance` — type — line 134
- `VillageIdentity` — type — line 14
- `VillageLandmarkKind` — type — line 101
- `VillageLandmarkPlan` — type — line 111
- `VillageLayoutPattern` — type — line 146
- `VillagePathPlan` — type — line 125
- `VillagePlan` — type — line 162
- `VillagePlot` — type — line 59
- `VillagePlotRole` — type — line 57
- `VillageZone` — type — line 49
- `VillageZoneKind` — type — line 41

## `settlement/villagePlanDebug.ts`

- `summarizeVillagePlan` — function — line 5

## `settlement/villagePlanner.ts`

- `buildingsAndLandmarksFromPlots` — function — line 1040
- `chooseLayoutPattern` — function — line 130
- `HOUSE_PLOT_RADIUS` — const — line 66
- `pathPlansToCorridorData` — function — line 1405
- `planLocalPathsAndEntrances` — function — line 1286
- `planVillageLayout` — function — line 720
- `PLOT_SCORE_WEIGHTS` — const — line 40
- `VillageLayoutDraft` — type — line 99

## `settlement/wellInteractionQueue.ts`

- `buildWellInteractionQueueConfig` — function — line 19
- `WELL_QUEUE_SERVING_OFFSET_ANCHOR` — const — line 8
- `WELL_QUEUE_SERVING_OFFSET_FALLBACK` — const — line 11
- `WellQueueRestConfig` — type — line 13
