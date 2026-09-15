# Symbols

Generated from exported TypeScript symbols.

## `settlement/animalCorpseSanitation.ts`

- `AnimalCorpseCleanupCandidate` — type — line 41
- `animalCorpseCleanupHandle` — function — line 174
- `AnimalCorpseCleanupHandle` — type — line 54
- `AnimalCorpseCleanupRejection` — type — line 80
- `AnimalCorpseView` — type — line 26
- `animalCorpseViewFromAgent` — function — line 157
- `collectAnimalCorpseCleanupCandidates` — function — line 132
- `HouseholdAnchor` — type — line 13
  - domain: settlements-npcs
- `isInsideSettlementInfluence` — function — line 90
- `resolveAnimalCorpseCleanupHandle` — function — line 195
- `resolveResponsibleHousehold` — function — line 105
- `SettlementCorpseCleanupHooks` — type — line 73
- `SettlementInfluence` — type — line 19

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

- `createSettlement` — function — line 424
- `CreateSettlementDeps` — type — line 270
- `Settlement` — type — line 144
- `settlementSpawnPoint` — function — line 258

## `settlement/decorProps.ts`

- `cemeteryGraveLayout` — function — line 849
- `CemeterySize` — type — line 817
- `CemeteryTemplates` — type — line 809
- `createBush` — function — line 103
- `createCactus` — function — line 151
- `createCaveMouth` — function — line 958
- `createCemetery` — function — line 887
- `createCemeteryPlot` — function — line 794
- `createCobblePlate` — function — line 185
- `createExpeditionRuins` — function — line 709
- `createFallenLog` — function — line 493
- `createFelledTree` — function — line 90
- `createFern` — function — line 170
- `createGraveStone` — function — line 776
- `createLargeRock` — function — line 416
- `createLilyPad` — function — line 216
- `createLimbedTree` — function — line 61
- `createMonolith` — function — line 526
- `createReed` — function — line 198
- `createRockCluster` — function — line 453
- `createSeaweed` — function — line 231
- `createSmallRuins` — function — line 634
- `createStoneCircle` — function — line 589
- `createThicket` — function — line 121
- `createTree` — function — line 18
- `createTreeStump` — function — line 40
- `LargeRockPalette` — type — line 248
- `TerrainPlacementContext` — type — line 11

## `settlement/families.ts`

- `cobbleCountForSize` — function — line 132
- `FamilyDef` — type — line 162
- `FamilyMember` — type — line 145
- `FamilyMemberRef` — type — line 171
- `FamilyRelation` — type — line 143
- `generateFamilies` — function — line 431
- `maxRolledVillageSize` — function — line 208
- `minRolledVillageSize` — function — line 216
- `RolledVillageSize` — type — line 18
- `rolledVillageSizeRank` — function — line 203
- `rollVillageSize` — function — line 239
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

## `settlement/horseAcquisition.ts`

- `getHorseAcquisitionState` — function — line 30
  - domain: quests-progression Single derived view over live animal state + quest reservation.
- `HorseAcquisitionState` — type — line 10
- `horseOfferStatusHint` — function — line 48
- `MERCHANT_HORSE_PRICE` — const — line 5
- `merchantHorseAnimalId` — function — line 14
- `resolveMerchantHorseAnimal` — function — line 21
  - domain: fauna Resolves the merchant horse acquisition target for `settlementId`.

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

- `createHousehold` — function — line 357
- `createHouseholdRegistry` — function — line 574
- `FARMER_STARTING_SEED_COUNT` — const — line 238
- `HayForageState` — type — line 125
- `Household` — type — line 241
- `HOUSEHOLD_WOOD_RESERVE_TARGET` — const — line 95
- `HouseholdAgricultureState` — type — line 192
- `HouseholdDepositResult` — type — line 34
- `HouseholdId` — type — line 29
  - domain: settlements-npcs
  - system: household
  - role: Owns one family's own food/wood/water stock, between NPC carrying and `SettlementEconomy`.
  - owns: Household
  - uses: SettlementEconomy
- `householdIdFor` — function — line 323
- `HouseholdRegistry` — type — line 565
- `HouseholdResourceKind` — type — line 52
- `HouseholdSnapshot` — type — line 204
- `HouseholdStartingContext` — type — line 229
- `resolveHayForage` — function — line 141
- `WaterReserve` — type — line 156

## `settlement/householdExchange.ts`

- `createHouseholdExchangeHooks` — function — line 79
- `HouseholdExchangeHooks` — type — line 62
- `HouseholdSurplusCandidate` — type — line 12
- `HouseholdSurplusLookup` — type — line 24
- `selectHouseholdSurplusSource` — function — line 36

## `settlement/householdResourceTransfer.ts`

- `HouseholdTransferRequest` — type — line 23
- `HouseholdTransferResult` — type — line 27
- `householdTransferSummary` — function — line 57
- `transferableHouseholdItemKinds` — function — line 46
- `transferResourceToHousehold` — function — line 70

## `settlement/householdWells.ts`

- `minimumHouseholdWellCount` — function — line 21
  - domain: settlements-npcs
- `resolveNearestWaterWellTarget` — function — line 98
  - domain: settlements-npcs
- `selectHouseholdWellFamilyIndices` — function — line 35
  - domain: settlements-npcs
- `SettlementWellSource` — type — line 80
- `WaterWellTarget` — type — line 85

## `settlement/householdWood.ts`

- `applyWoodItemBatch` — function — line 77
- `claimableWoodSurplusValue` — function — line 70
- `HOUSEHOLD_WOOD_ITEM_KINDS` — const — line 13
  - domain: settlements-npcs
- `householdWoodCountFromItems` — function — line 23
- `HouseholdWoodItemBatch` — type — line 32
- `HouseholdWoodItemKind` — type — line 15
- `householdWoodItemValue` — function — line 18
- `selectClaimableWoodItems` — function — line 39

## `settlement/householdYard.ts`

- `HOUSEHOLD_YARD_PROP_OFFSETS` — const — line 27
- `householdYardRadius` — function — line 34
- `MAX_HOUSE_FOOTPRINT_RADIUS` — const — line 21

## `settlement/houseLighting.ts`

- `createHouseLight` — function — line 170
- `createProceduralTorchPost` — function — line 205
- `createVillageTorchLight` — function — line 226
- `HouseLight` — type — line 23
- `ResolvedHouseLampMount` — type — line 371
- `resolveHouseLampMount` — function — line 413
- `VillageTorch` — type — line 29

## `settlement/landmarkProps.ts`

- `createLandmarkProp` — function — line 152
- `isLandmarkGlbKind` — function — line 146
- `preloadLandmarkTemplates` — function — line 127

## `settlement/landOwnership.ts`

- `createLandOwnershipRegistry` — function — line 22
- `LandOwnershipRegistry` — type — line 9
- `landPlotKey` — function — line 18

## `settlement/landPurchase.ts`

- `LandPurchaseResult` — type — line 5
- `LandPurchaseTarget` — type — line 16
- `purchaseLandPlot` — function — line 29

## `settlement/livestock.ts`

- `createLivestockRegistry` — function — line 321
- `disposeLivestock` — function — line 846
- `fillShepherdFlockKinds` — function — line 43
- `isPlayerOwnedLivestockRecord` — function — line 99
- `LIVESTOCK_KINDS` — const — line 76
- `LIVESTOCK_URLS` — const — line 60
- `LivestockPersistence` — type — line 149
- `livestockRecordMatchesHouseholdSlot` — function — line 116
- `LivestockRegistry` — type — line 171
- `LivestockSaveRecord` — type — line 89
- `livestockStrayCandidateFromAgent` — function — line 129
- `PersistentLivestockContext` — type — line 756
- `resolveLivePersistentAnimal` — function — line 764
- `restoreDetachedPlayerOwnedLivestock` — function — line 828
- `setOwnedAnimalControl` — function — line 816
- `shouldSpawnDeterministicLivestockSlot` — function — line 108
  - domain: fauna
  - role: Household rolls and merchant-horse slots skip tombstones and player-owned records restored on the detached path (fauna-020 / fauna-030).
- `spawnAnimalFromRecord` — function — line 216
- `SpawnAnimalFromRecordDeps` — type — line 204
- `spawnLivestock` — function — line 597
- `tickSettlementLivestock` — function — line 863
- `transferAnimalOwnership` — function — line 791

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

- `collectLodgingCandidates` — function — line 179
- `collectOwnedHouseLodgingOptions` — function — line 197
- `LodgingCandidateContext` — type — line 171
- `LodgingSelection` — type — line 296
- `LodgingSettlementInput` — type — line 24
- `resolveBestLodging` — function — line 261
- `selectLodgingFromCandidates` — function — line 310
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

## `settlement/npcIdentity.ts`

- `flattenedSettlementMembers` — function — line 22
  - domain: settlements-npcs
- `SettlementNpcDescriptor` — type — line 29
- `settlementNpcDescriptors` — function — line 41
  - domain: settlements-npcs
- `settlementNpcId` — function — line 12
  - domain: settlements-npcs

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

- `canLootNpcCorpse` — function — line 209
- `claimNpcCorpseForBurial` — function — line 148
- `cloneNpcCorpseLoot` — function — line 67
- `cloneNpcPostDeath` — function — line 71
- `commitNpcDeath` — function — line 238
- `corpseLootInventory` — function — line 216
- `createActiveNpcPostDeath` — function — line 104
- `createEmptyNpcCorpseLoot` — function — line 85
- `createLegacyTerminalNpcPostDeath` — function — line 91
- `dropNpcCorpseLoot` — function — line 295
- `EMPTY_NPC_CORPSE_LOOT` — const — line 62
- `finalizeExpiredNpcCorpse` — function — line 315
- `FinalizeNpcBurialResult` — type — line 188
- `finalizeNpcCorpseBurial` — function — line 192
- `hasActiveNpcCorpse` — function — line 123
- `isNpcCorpseBuryable` — function — line 180
- `markNpcPostDeathTerminal` — function — line 142
- `NPC_CORPSE_BONES_ONSET_DAYS` — const — line 59
- `NPC_CORPSE_REMOVE_DAYS` — const — line 60
- `NPC_CORPSE_ROT_ONSET_DAYS` — const — line 58
- `npcCorpseBurialClaimOwner` — function — line 176
- `NpcCorpseCleanupReason` — type — line 30
- `NpcCorpseLootSnapshot` — type — line 38
- `NpcCorpsePhase` — type — line 28
- `npcCorpsePhaseFromElapsedDays` — function — line 127
- `npcCorpseReadyToRemove` — function — line 137
- `NpcPostDeathState` — type — line 40
- `NpcPostDeathStatus` — type — line 26
  - domain: npc
  - role: Authoritative NPC corpse lifecycle, loot snapshot and burial handoff.
  - owns: NpcPostDeathState
- `recoverStaleNpcBurialClaim` — function — line 167
- `releaseNpcCorpseBurialClaim` — function — line 158
- `resolveNpcCorpsePhase` — function — line 132
- `shouldSkipNpcCorpsePresentation` — function — line 327
- `snapshotCorpseLoot` — function — line 220
- `transferCorpseCountTo` — function — line 277
- `transferCorpseInstanceTo` — function — line 261

## `settlement/npcRelationships.ts`

- `createNpcRelationships` — function — line 32
- `NpcRelationshipEntry` — type — line 26
- `NpcRelationships` — type — line 15

## `settlement/npcState.ts`

- `createNpcAuthoritativeState` — function — line 234
- `createNpcStateRegistry` — function — line 280
- `MAX_HP` — const — line 49
- `MAX_STAMINA` — const — line 50
- `NpcAuthoritativeState` — type — line 82
  - domain: settlements-npcs
- `NpcGraveVisitRecord` — type — line 41
- `NpcId` — type — line 37
- `NpcPhysicalMaxima` — type — line 220
- `NpcStateRegistry` — type — line 266
- `NpcStateSnapshot` — type — line 156

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
- `workplaceFor` — function — line 117

## `settlement/playerOwnedHorseDebug.ts`

- `HorseDebugCandidate` — type — line 33
- `HorseDebugCommandResult` — type — line 39
- `listPlayerOwnedHorses` — function — line 210
  - domain: fauna
  - role: Plain diagnostic list of player-owned horses from persistent livestock authority (live, saved-only, tombstoned). Never returns `AnimalAgent`.
- `PlayerOwnedHorseDebugSnapshot` — type — line 14
- `PlayerOwnedHorseDebugStatus` — type — line 12
- `resurrectPlayerOwnedHorse` — function — line 254
  - domain: fauna
  - role: Debug resurrection of a player-owned horse identity. Live corpses are revived in place; tombstoned individuals restore one saved record and one spawned agent. Never creates a second `animalId`.
- `teleportPlayerOwnedHorseToPlayer` — function — line 233
  - domain: fauna
  - role: Debug teleport of an existing live player-owned horse through the agent's ground-snap seam. Preserves identity/owner/name/control.

## `settlement/professionStaffing.ts`

- `adultProfessionCoverage` — function — line 309
  - domain: settlements-npcs
- `isAdultAge` — function — line 277
- `isProfessionAdult` — function — line 282
- `ProfessionStaffingContext` — type — line 22
  - domain: settlements-npcs
- `resolveInitialProfessionStaffing` — function — line 411
  - domain: settlements-npcs
- `shepherdHouseholdIndex` — function — line 287
- `StaffingPriority` — type — line 12

## `settlement/props.ts`

- `BlacksmithWorkplace` — type — line 297
- `buildSettlementProps` — function — line 709
- `disposeSettlementGroup` — function — line 1953
- `SettlementHouseBed` — type — line 150
- `SettlementHouseLandmark` — type — line 116
- `SettlementLandmarks` — type — line 166
- `SettlementLandPlot` — type — line 286
- `SettlementStorageVisuals` — type — line 278
- `SettlementTreeLandmark` — type — line 307
- `SettlementWellLandmark` — type — line 157

## `settlement/propSpecs.ts`

- `ANIMAL_TROUGH_HEIGHT` — const — line 120
- `ANIMAL_TROUGH_URL` — const — line 118
- `BUSH_SPECS` — const — line 26
- `CACTUS_SPECS` — const — line 40
- `CAMPFIRE_FIT_MAX` — const — line 139
- `CAMPFIRE_UNLIT_URL` — const — line 137
- `CEMETERY_SPECS` — const — line 89
- `COBBLE_FIT_MAX` — const — line 156
- `COBBLE_URL` — const — line 153
- `CROPS_FIT_MAX` — const — line 112
- `CROPS_URL` — const — line 110
- `DOCK_SPECS` — const — line 73
- `FALLEN_LOG_SPECS` — const — line 85
- `FARM_HEIGHT` — const — line 108
- `FARM_URL` — const — line 105
- `FERN_SPECS` — const — line 36
- `FIRE_FX_URL` — const — line 166
- `GRAVE_SPECS` — const — line 93
- `LANDMARK_BOAT_FIT_MAX` — const — line 143
- `LANDMARK_BOAT_URL` — const — line 142
- `LANDMARK_OLD_TREE_FIT_MAX` — const — line 149
- `LANDMARK_OLD_TREE_URL` — const — line 148
- `LANDMARK_SHIPWRECK_FIT_MAX` — const — line 145
- `LANDMARK_SHIPWRECK_URL` — const — line 144
- `LANDMARK_TOWER_FIT_MAX` — const — line 147
- `LANDMARK_TOWER_URL` — const — line 146
- `LANDMARK_WAGON_FIT_MAX` — const — line 151
- `LANDMARK_WAGON_URL` — const — line 150
- `LANTERN_FLOOR_MAX` — const — line 167
- `LANTERN_URL` — const — line 164
- `LANTERN_WALL_MAX` — const — line 170
- `LILY_SPECS` — const — line 60
- `REED_SPECS` — const — line 51
- `RESOURCE_GOLD_SPECS` — const — line 97
- `RESOURCE_ROCK_SPECS` — const — line 101
- `ROCK_CLUSTER_SPECS` — const — line 81
- `ROCK_SPECS` — const — line 77
- `SEAWEED_SPECS` — const — line 69
- `TABLE_LAMP_FIT_MAX` — const — line 179
- `TABLE_LAMP_URL` — const — line 178
- `THICKET_TREE_SPECS` — const — line 19
- `TRAP_GOOD_FIT_MAX` — const — line 124
- `TRAP_GOOD_URL` — const — line 123
- `TREE_SPECS` — const — line 5
- `TREE_STUMP_HEIGHT` — const — line 161
- `TREE_STUMP_URL` — const — line 158
- `VILLAGE_CAMPFIRE_COLLISION_RADIUS` — const — line 135
- `VILLAGE_TORCH_HEIGHT` — const — line 171
- `VILLAGE_TORCH_URL` — const — line 165
- `WALL_URL` — const — line 163
- `WELL_HEIGHT` — const — line 116
- `WELL_URL` — const — line 114
- `WOOD_PILE_COLLISION_RADIUS` — const — line 133
- `WOOD_PILE_HEIGHT` — const — line 130
- `WOOD_PILE_PROGRESSIVE_URL` — const — line 128
- `WOOD_PILE_URL` — const — line 126

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

## `settlement/ratInfestation.ts`

- `createRatInfestationRegistry` — function — line 47
- `NO_RAT_INFESTATION` — const — line 18
- `RAT_NEST_DESTROY_DURATION_SEC` — const — line 31
- `RatInfestationRegistry` — type — line 33
- `RatInfestationState` — type — line 11
  - domain: settlements
  - system: rat-infestation
  - role: Authoritative settlement-owned rat infestation state (plan quests-progression-013) — keyed by stable `settlementId`, survives settlement stream-out/in, `WorldBundle` rebuild and save/load. Owns independent storage-damage and nest-destroyed facts. Not owned by `QuestManager` or Three.js props.
- `SEEDED_RAT_INFESTATION` — const — line 25

## `settlement/ratNestPlacement.ts`

- `placeRatNest` — function — line 85
- `PlaceRatNestArgs` — type — line 74
- `RatNestPlacement` — type — line 11
  - domain: settlements
  - system: rat-infestation
  - role: Deterministic rat-nest placement from a settlement's `VillagePlan` (plan quests-progression-013 §7) — one point behind a residential house, reconstructed from seed/id rather than a persisted transform.

## `settlement/ratPersistence.ts`

- `createRatRegistry` — function — line 41
- `RatPersistence` — type — line 17
- `RatRegistry` — type — line 23
- `RatSaveRecord` — type — line 12
  - domain: fauna
  - system: settlement-rat-persistence
  - role: Per-`SettlementsManager` persistence for wild settlement rats (plan quests-progression-006) — mirrors `livestock.ts`'s registry lifecycle without livestock ownership semantics.

## `settlement/rats.ts`

- `createSettlementRats` — function — line 257
- `infestationReplenishmentRoll` — function — line 102
- `normalizeRatClipName` — function — line 205
- `RAT_DOG_REPRODUCTION_PRESSURE` — const — line 41
- `RAT_INFESTATION_FLOOR` — const — line 38
- `RAT_INFESTATION_PRESSURE_BONUS` — const — line 36
- `RAT_MIN_REPRODUCTION_MULTIPLIER` — const — line 43
- `RAT_POPULATION_CAP` — const — line 32
  - domain: fauna
  - system: settlement-rats
  - role: Settlement-local rat population pressure/reconciliation (plan fauna-016 §7/§8/§9, quests-progression-006, quests-progression-013) — deliberately not a `RatManager`: rats are plain `AnimalAgent('rat')` instances this module spawns toward a small, food-driven target population. Infestation replenishment is a separate nest-gated roll; excess live rats are never deleted just because the target falls.
- `RAT_RECONCILE_INTERVAL_DAYS` — const — line 45
- `RAT_URL` — const — line 196
- `ratDogReproductionMultiplier` — function — line 92
- `RatFoodSite` — type — line 144
- `ratNormalPopulationTarget` — function — line 77
- `ratPopulationTarget` — function — line 85
- `RatPressureInputs` — type — line 51
- `ratReconcileAction` — function — line 127
- `RatReconcileAction` — type — line 56
- `SettlementRats` — type — line 168
- `SettlementRatsDeps` — type — line 146
- `shouldInfestationReplenish` — function — line 113

## `settlement/roadNetwork.ts`

- `bridgesNear` — function — line 1057
  - domain: world-terrain
- `bridgeSpecOf` — function — line 1016
- `clearRoadNetworkCaches` — function — line 103
- `entranceToward` — function — line 130
- `findRoute` — function — line 250
  - domain: world-terrain
- `fordsNear` — function — line 946
  - domain: world-terrain
- `meanderRoute` — function — line 513
- `MidpointSignpost` — type — line 778
- `midpointSignpostsFor` — function — line 792
- `neighborsFor` — function — line 161
- `RoadNetworkContext` — type — line 62
- `RoadRoute` — type — line 88
- `RoadSegment` — type — line 52
- `RoadSegmentKind` — type — line 50
- `RoutePoint` — type — line 40
- `RouteSearchOptions` — type — line 215
- `routeToMinorLocation` — function — line 843
- `segmentsNear` — function — line 868
- `SettlementSignpost` — type — line 743
- `signpostsForSettlement` — function — line 755
- `VillageSegments` — type — line 1089
- `villageSegmentsNear` — function — line 1113

## `settlement/roadRiverCrossing.ts`

- `crossingsForPolyline` — function — line 306
  - domain: world-terrain
- `CrossingVerdict` — type — line 113
- `evaluateRoadRiverCrossing` — function — line 126
  - domain: world-terrain
- `riverHitsOnEdge` — function — line 196
  - domain: world-terrain
- `RoadEdgeRiverHit` — type — line 180
- `RoadRiverCrossing` — type — line 55
- `RoadRiverCrossingFacts` — type — line 27
- `RoadRiverCrossingKind` — type — line 21
  - domain: world-terrain
  - system: roads
  - role: The single canonical road × river crossing authority (plan world-terrain-023). Decides *whether* a road polyline meets canonical river water, *where* exactly, and *what kind* of infrastructure that crossing is (`ford` / `bridge`) or that it is not supported at all. Pure and allocation-light so `roadNetwork.ts`'s A* can price every candidate edge through it.
  - integration: `roadNetwork.ts` is the only caller: it prices edges with riverHitsOnEdge/evaluateRoadRiverCrossing during the search and then derives the route's canonical RoadRiverCrossing records from the *final* polyline with crossingsForPolyline. No terrain, renderer or runtime stage may reclassify a crossing: terrain only projects a declared `ford` (`terrain/riverFord.ts`) and `world-terrain-033` only projects a declared `bridge`.

## `settlement/settlementAgriculture.ts`

- `completedAgricultureBatches` — function — line 57
- `householdAgriculturalCapacity` — function — line 20
  - domain: settlements-npcs
  - system: household
- `householdSeedReserveRequirement` — function — line 32
- `householdSeedStockCount` — function — line 37
- `householdSeedSurplusCount` — function — line 47
- `householdStartingContextFromFamily` — function — line 24
- `resolveSettlementAgricultureCatchUp` — function — line 123
- `resolveUnloadedHouseholdAgriculture` — function — line 78

## `settlement/settlementGenerator.ts`

- `cellFromId` — function — line 139
- `cellKey` — function — line 124
- `cellSeed` — function — line 167
- `cellsWithinRadius` — function — line 151
- `generateSettlementDef` — function — line 753
- `generateVillagePlan` — function — line 687
- `probeSettlementSite` — function — line 493
  - domain: settlements
- `SETTLEMENT_GRID_STEP` — const — line 66
- `SettlementCell` — type — line 72
- `SettlementDef` — type — line 74
- `SettlementSiteProbe` — type — line 478
- `worldToCell` — function — line 128

## `settlement/settlementNameUniqueness.ts`

- `compareSettlementNameOrder` — function — line 16
  - domain: settlements
- `fallbackSettlementName` — function — line 42
  - domain: settlements
- `pickUniqueSettlementName` — function — line 52
  - domain: settlements
- `predecessorSettlementCells` — function — line 30
  - domain: settlements
- `SETTLEMENT_NAME_ATTEMPT_LIMIT` — const — line 4

## `settlement/settlementNightCycle.ts`

- `createSettlementNightCycle` — function — line 62
- `NIGHT_FIRE_IGNITE_CHANCE` — const — line 27
- `NIGHT_FIRE_THRESHOLD` — const — line 24
  - domain: settlements
  - system: settlement-night-cycle
  - role: Owns the dusk/dawn threshold crossing that drives fire autolight, torches and house-light intensity.
- `SettlementNightAutoLightPolicy` — type — line 52
- `SettlementNightCycle` — type — line 49
- `SettlementNightTorch` — type — line 57
- `shouldAutoLightNightFire` — function — line 38

## `settlement/settlementPalisade.ts`

- `PALISADE_GATE_HALF_ANGLE` — const — line 20
- `PALISADE_WALL_HALF_DEPTH` — const — line 27
  - domain: settlements
- `plantEntrancePalisade` — function — line 145
  - domain: settlements
- `resolveEntrancePalisadePlacements` — function — line 69
  - domain: settlements
- `settlementPalisadeColliders` — function — line 166
  - domain: settlements
- `SettlementPalisadePlacement` — type — line 54
  - domain: settlements
- `WALL_HALF_LENGTH` — const — line 18

## `settlement/settlementPlanCache.ts`

- `cachedSettlementDefCount` — function — line 167
- `cachedSettlementProgressionPolicy` — function — line 172
- `clearSettlementDefCache` — function — line 79
- `setSettlementRiverQuery` — function — line 55
- `settlementDefFor` — function — line 154
- `SettlementResolveContext` — type — line 29
- `worldRiverQuery` — function — line 68

## `settlement/settlementProgression.ts`

- `chebyshevCellDistance` — function — line 55
- `orderProgressionCandidates` — function — line 89
  - domain: settlements
- `resolveSettlementProgressionPolicy` — function — line 151
  - domain: settlements
- `SETTLEMENT_PROGRESSION_FAR_ORDER_SALT` — const — line 20
- `SETTLEMENT_PROGRESSION_FAR_RING` — const — line 16
- `SETTLEMENT_PROGRESSION_NEAR_ORDER_SALT` — const — line 19
- `SETTLEMENT_PROGRESSION_NEAR_RING` — const — line 14
- `SettlementProgressionPolicy` — type — line 47
  - domain: settlements
- `settlementProgressionRingCells` — function — line 64
  - domain: settlements
- `SettlementProgressionTarget` — type — line 36
- `SettlementProgressionWorldInput` — type — line 25

## `settlement/settlementPropColliders.ts`

- `SettlementPropColliderLandmarks` — type — line 18
- `settlementPropColliders` — function — line 25

## `settlement/settlementProximity.ts`

- `isNearSettlement` — function — line 34
- `NEAR_SETTLEMENT_DISTANCE` — const — line 21
  - domain: settlement
  - system: settlement-proximity
  - role: Cheap, bounded "which settlements are near this world point" checks, built on the existing settlement grid instead of loaded/streamed settlements — `isNearSettlement`'s fixed-radius boolean check, and `settlementsWithinDistance`'s larger-radius full candidate list.
- `settlementsWithinDistance` — function — line 60

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

- `createSettlementsManager` — function — line 306
  - domain: settlements
  - system: settlements-manager
  - role: Owns settlement generation, streaming and per-settlement economy/household/NPC-state registries.
  - owns: SettlementEconomy, Household
  - lifecycle: streaming
- `SettlementsManager` — type — line 121

## `settlement/settlementStructures.ts`

- `createAnvil` — function — line 266
- `createBarrel` — function — line 102
- `createCrate` — function — line 253
- `createDock` — function — line 335
- `createGarden` — function — line 403
- `createGrindWorkbench` — function — line 292
- `createHayBale` — function — line 126
- `createHut` — function — line 12
- `createRatNest` — function — line 207
- `createSignpost` — function — line 361
- `createStockpile` — function — line 317
- `createTrough` — function — line 199
- `createTroughVisual` — function — line 193
- `createVillageNamepost` — function — line 382
- `createWell` — function — line 39
- `createWheatField` — function — line 454
- `layoutCropsGarden` — function — line 433
- `preloadAnimalTroughVisual` — function — line 149
- `TroughVisual` — type — line 139
- `VILLAGE_NAMEPOST_BOARD_CENTER_Y` — const — line 380

## `settlement/settlementTerrain.ts`

- `classifySettlementTerrain` — function — line 36
- `MOUNTAIN_RIDGE_THRESHOLD` — const — line 28
- `TerrainSamplers` — type — line 6

## `settlement/settlementVillageTorch.ts`

- `SettlementVillageTorch` — type — line 12
  - domain: settlements
  - system: settlement-lighting
- `settlementVillageTorchId` — function — line 19

## `settlement/storageDestinations.ts`

- `classifyItemStorageKind` — function — line 31
  - domain: settlements-npcs
  - system: storage-destinations
  - role: Resolves the physical destination for a wood/food delivery, given the household or settlement it belongs to.
- `householdStorageDestination` — function — line 37
- `resolveHouseholdWoodStorage` — function — line 47
- `settlementStorageDestination` — function — line 64

## `settlement/storageRepair.ts`

- `describeSettlementStorageRepair` — function — line 19
- `formatSettlementStorageInspection` — function — line 40
- `SETTLEMENT_STORAGE_REPAIR_BEAM_COST` — const — line 5
- `SETTLEMENT_STORAGE_REPAIR_DURATION_SEC` — const — line 8
- `SettlementStorageRepairView` — type — line 10

## `settlement/storageVisuals.ts`

- `allocateFoodRepresentatives` — function — line 167
  - domain: settlements-npcs
- `createFoodStorageVisual` — function — line 277
  - domain: settlements-npcs
- `createWoodPileVisual` — function — line 105
- `findWoodPileStageNodes` — function — line 76
- `flattenFoodRepresentatives` — function — line 211
- `FOOD_STORAGE_LOCAL_SLOTS` — const — line 236
  - domain: settlements-npcs
- `FOOD_STORAGE_MAX_KINDS` — const — line 137
- `FOOD_STORAGE_MAX_REPRESENTATIVES` — const — line 140
- `FoodRepresentativeAllocation` — type — line 142
- `foodRepresentativeCount` — function — line 150
  - domain: settlements-npcs
- `foodStorageAllocationSignature` — function — line 219
- `FoodStorageLocalSlot` — type — line 223
- `FoodStorageVisual` — type — line 261
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

## `settlement/structureCondition.ts`

- `applyStructureDamage` — function — line 169
  - domain: settlements
- `applyStructureRepairWork` — function — line 286
  - domain: settlements
- `beginStructureRepair` — function — line 237
  - domain: settlements
- `hasActiveStructureRepair` — function — line 55
- `isStructureRepairProblem` — function — line 152
- `pristineStructureState` — function — line 42
- `quoteStructureRepair` — function — line 203
  - domain: settlements
- `resolveStructureCondition` — function — line 141
- `SettlementStructureState` — type — line 31
  - domain: settlements
- `STRUCTURE_REPAIR_RESUME_PRESSURE` — const — line 119
- `STRUCTURE_REPAIR_WORK_SESSION_HOURS` — const — line 310
- `STRUCTURE_REPAIR_WORK_SESSION_SEC` — const — line 309
- `structureConditionStateFromSnapshot` — function — line 312
- `structureRepairPolicy` — function — line 105
- `StructureRepairPolicy` — type — line 63
- `structureRepairPressureFromCondition` — function — line 129
  - domain: settlements
- `StructureRepairQuote` — type — line 184
- `StructureRepairStartOutcome` — type — line 221
- `StructureRepairWorkOutcome` — type — line 271

## `settlement/structureRepairCandidates.ts`

- `createNpcStructureRepairHooks` — function — line 97
- `NpcStructureRepairHooks` — type — line 79
  - domain: settlements
- `ResidentialRepairCandidate` — type — line 27
  - domain: settlements
- `residentialRepairCandidates` — function — line 41

## `settlement/structureStateRegistry.ts`

- `beginRegistryStructureRepair` — function — line 57
  - domain: settlements
- `contributeRegistryStructureRepairWork` — function — line 76
- `createSettlementStructureStateRegistry` — function — line 93
- `SettlementStructureStateRegistry` — type — line 28
  - domain: settlements
  - system: structure-condition
  - role: Owns mutable settlement-structure condition/repair state, keyed by stable structureId.
  - owns: SettlementStructureState

## `settlement/villageClearing.ts`

- `ClearingArea` — type — line 10
- `ClearingLayout` — type — line 20
- `layoutClearings` — function — line 145
- `layoutClearingsFromPlan` — function — line 73
- `plazaCoreRadius` — function — line 56

## `settlement/VillageFire.ts`

- `createVillageFire` — function — line 100
- `FireLightSource` — type — line 36
- `FUEL_PER_BRANCH` — const — line 11
- `IGNITE_DURATION_SEC` — const — line 15
- `VillageFire` — type — line 43
- `VillageFireHooks` — type — line 38

## `settlement/villagePlan.ts`

- `FoodSourceType` — type — line 10
- `householdWellLandmarkId` — function — line 127
- `householdWellPlotId` — function — line 113
- `parseHouseholdWellFamilyIndex` — function — line 119
- `residentialStructureId` — function — line 107
- `VillageBoundary` — type — line 27
- `VillageBuildingPlan` — type — line 86
- `VillageBuildingRole` — type — line 78
- `VillageCenter` — type — line 35
- `VillageEntrance` — type — line 164
- `VillageIdentity` — type — line 14
- `VillageLandmarkKind` — type — line 131
- `VillageLandmarkPlan` — type — line 141
- `VillageLayoutPattern` — type — line 176
- `VillagePathPlan` — type — line 155
- `VillagePlan` — type — line 192
- `VillagePlot` — type — line 59
- `VillagePlotRole` — type — line 57
- `VillageZone` — type — line 49
- `VillageZoneKind` — type — line 41

## `settlement/villagePlanDebug.ts`

- `summarizeVillagePlan` — function — line 5

## `settlement/villagePlanner.ts`

- `buildingsAndLandmarksFromPlots` — function — line 1223
- `chooseLayoutPattern` — function — line 145
- `HOUSE_PLOT_RADIUS` — const — line 69
- `householdWellLocalBand` — function — line 79
  - domain: settlements-npcs
- `pathPlansToCorridorData` — function — line 1594
- `planLocalPathsAndEntrances` — function — line 1475
- `planVillageLayout` — function — line 835
- `PLOT_SCORE_WEIGHTS` — const — line 43
- `VillageLayoutDraft` — type — line 114

## `settlement/wellInteractionQueue.ts`

- `buildWellInteractionQueueConfig` — function — line 19
- `WELL_QUEUE_SERVING_OFFSET_ANCHOR` — const — line 8
- `WELL_QUEUE_SERVING_OFFSET_FALLBACK` — const — line 11
- `WellQueueRestConfig` — type — line 13
