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

- `CampfireBodyKind` — type — line 13
- `CampfireFlame` — type — line 253
- `createCampfire` — function — line 237
- `createCampfireBody` — function — line 228
- `createCampfireFlame` — function — line 268
- `createGrateVisual` — function — line 328
- `createLitCampfireVisual` — function — line 312
- `createSimpleFireBase` — function — line 244
- `preloadCampfireTemplates` — function — line 53

## `settlement/createSettlement.ts`

- `createSettlement` — function — line 482
- `CreateSettlementDeps` — type — line 299
- `Settlement` — type — line 158
- `settlementSpawnPoint` — function — line 287

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

- `cobbleCountForSize` — function — line 133
- `ensureSettlementElder` — function — line 544
  - domain: settlements-npcs
- `FamilyDef` — type — line 163
- `FamilyMember` — type — line 146
- `FamilyMemberRef` — type — line 172
- `FamilyRelation` — type — line 144
- `generateFamilies` — function — line 466
- `maxRolledVillageSize` — function — line 209
- `minRolledVillageSize` — function — line 217
- `RolledVillageSize` — type — line 19
- `rolledVillageSizeRank` — function — line 204
- `rollVillageSize` — function — line 240
- `VILLAGE_SIZE_CONFIG` — const — line 65
- `VillageSize` — type — line 16
- `villageSizeConfig` — function — line 118
- `VillageSizeConfig` — type — line 23

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

- `getHorseAcquisitionState` — function — line 61
  - domain: quests-progression Single derived view over live animal state + quest reservation.
- `HorseAcquisitionState` — type — line 16
- `horseOfferStatusHint` — function — line 79
- `isVendorHorseAnimalId` — function — line 26
- `isVendorHorseSaleEligible` — function — line 47
  - domain: settlements
- `listVendorHorseAnimals` — function — line 101
  - domain: settlements
- `MERCHANT_HORSE_PRICE` — const — line 11
- `merchantHorseAnimalId` — function — line 20
- `resolveMerchantHorseAnimal` — function — line 33
  - domain: fauna Resolves the merchant horse acquisition target for `settlementId`.
- `vendorHorseOfferLabel` — function — line 84
- `vendorHorseOfferPrice` — function — line 91

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

- `createHousehold` — function — line 390
- `createHouseholdRegistry` — function — line 608
- `FARMER_STARTING_SEED_COUNT` — const — line 271
- `HayForageState` — type — line 129
- `Household` — type — line 274
- `HOUSEHOLD_WOOD_RESERVE_TARGET` — const — line 99
- `HouseholdAgricultureState` — type — line 203
- `HouseholdDepositResult` — type — line 38
- `HouseholdId` — type — line 33
  - domain: settlements-npcs
  - system: household
  - role: Owns one family's own food/wood/water stock, between NPC carrying and `SettlementEconomy`.
  - owns: Household
  - uses: SettlementEconomy
- `householdIdFor` — function — line 356
- `HouseholdRegistry` — type — line 599
- `HouseholdResourceKind` — type — line 56
- `HouseholdSnapshot` — type — line 215
- `HouseholdStartingContext` — type — line 255
- `HouseholdTradeStockContext` — type — line 242
  - domain: settlements-npcs
- `resolveHayForage` — function — line 145
- `WaterReserve` — type — line 160

## `settlement/householdExchange.ts`

- `createHouseholdExchangeHooks` — function — line 79
- `HouseholdExchangeHooks` — type — line 62
- `HouseholdSurplusCandidate` — type — line 12
- `HouseholdSurplusLookup` — type — line 24
- `selectHouseholdSurplusSource` — function — line 36

## `settlement/householdProfessionStock.ts`

- `applyProfessionTradeStock` — function — line 274
  - domain: settlements-npcs
- `BLACKSMITH_TRADE_PAULDRON_COUNT` — const — line 25
- `BLACKSMITH_TRADE_SWORD_COUNT` — const — line 24
- `FARMER_TRADE_TOOL_COUNT` — const — line 23
- `householdStartingContextFromFamily` — function — line 235
  - domain: settlements-npcs
- `HUNTER_STARTER_DRIED_MEAT` — const — line 29
- `HUNTER_STARTER_HERB` — const — line 30
- `HUNTER_STARTER_TRADE_ARROWS` — const — line 28
- `HUNTER_STARTER_TRADE_SHORT_BOWS` — const — line 22
- `resolveProfessionStarterGrants` — function — line 214
  - domain: settlements-npcs
- `StarterGrant` — type — line 32
- `WOODCUTTER_TRADE_AXE_COUNT` — const — line 21
  - domain: settlements-npcs

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

- `createLivestockRegistry` — function — line 329
- `disposeLivestock` — function — line 930
- `fillShepherdFlockKinds` — function — line 48
- `isPlayerOwnedLivestockRecord` — function — line 105
- `LIVESTOCK_KINDS` — const — line 81
- `LIVESTOCK_URLS` — const — line 65
- `LivestockPersistence` — type — line 157
- `livestockRecordMatchesHouseholdSlot` — function — line 122
- `LivestockRegistry` — type — line 179
- `LivestockSaveRecord` — type — line 95
- `livestockStrayCandidateFromAgent` — function — line 135
- `PersistentLivestockContext` — type — line 840
- `resolveLivePersistentAnimal` — function — line 848
- `restoreDetachedPlayerOwnedLivestock` — function — line 912
- `setOwnedAnimalControl` — function — line 900
- `shouldSpawnDeterministicLivestockSlot` — function — line 114
  - domain: fauna
  - role: Household rolls and merchant-horse slots skip tombstones and player-owned records restored on the detached path (fauna-020 / fauna-030).
- `spawnAnimalFromRecord` — function — line 224
- `SpawnAnimalFromRecordDeps` — type — line 212
- `spawnLivestock` — function — line 605
- `tickSettlementLivestock` — function — line 947
- `transferAnimalOwnership` — function — line 875

## `settlement/lodging.ts`

- `advanceLodgingProgress` — function — line 99
  - domain: ui-input Advances the lodging-walk stuck watchdog by one frame — a meaningful distance improvement resets the timer, otherwise `dt` accumulates until `LODGING_STUCK_TIMEOUT_SEC` is reached. Pure and frame-count-independent (driven by `dt`, not calls) so it can be unit-tested without a running game loop or a `PlayerActionContext` mock.
- `GUARD_PAID_LODGING_PRICE` — const — line 81
- `hayLodgingId` — function — line 162
- `initialLodgingProgress` — function — line 89
- `LODGING_ARRIVE_TOLERANCE` — const — line 65
- `LODGING_STUCK_PROGRESS_EPSILON` — const — line 71
- `LODGING_STUCK_TIMEOUT_SEC` — const — line 77
- `lodgingChoiceLabel` — function — line 150
- `LodgingOption` — type — line 16
- `lodgingPlaceLabel` — function — line 119
- `LodgingProgress` — type — line 87
- `LodgingQuality` — type — line 14
- `lodgingRequiresPayment` — function — line 128
- `lodgingRestQuality` — function — line 57
- `LodgingType` — type — line 12

## `settlement/lodgingResolver.ts`

- `collectLodgingCandidates` — function — line 243
- `collectOwnedHouseLodgingOptions` — function — line 260
- `LodgingCandidateContext` — type — line 235
- `LodgingSelection` — type — line 364
- `LodgingSettlementInput` — type — line 32
- `resolveBestLodging` — function — line 329
- `selectLodgingFromCandidates` — function — line 378
- `settlementLodgingInput` — function — line 74

## `settlement/lostTreasureChroniclesArchaeologistResident.ts`

- `createLostTreasureArchaeologistFamily` — function — line 54
  - domain: settlements-npcs
- `findLostTreasureArchaeologistResident` — function — line 127
  - domain: settlements-npcs
- `findLostTreasureChroniclesArchaeologistSettlement` — function — line 150
  - domain: settlements-npcs
- `isLostTreasureArchaeologistFamily` — function — line 44
  - domain: settlements-npcs
- `LOST_TREASURE_ARCHAEOLOGIST_AGE` — const — line 16
- `LOST_TREASURE_ARCHAEOLOGIST_FAMILY_ID` — const — line 12
- `LOST_TREASURE_ARCHAEOLOGIST_GIVEN_NAME` — const — line 14
- `LOST_TREASURE_ARCHAEOLOGIST_LAST_NAME` — const — line 15
- `LOST_TREASURE_ARCHAEOLOGIST_SETTLEMENT_SEARCH_RADIUS` — const — line 20
- `LostTreasureArchaeologistSettlementCandidate` — type — line 30
  - domain: settlements-npcs
- `selectLostTreasureChroniclesArchaeologistSettlement` — function — line 90
  - domain: settlements-npcs

## `settlement/lostTreasureChroniclesElderResident.ts`

- `appendAuthoredResidentFamilies` — function — line 65
  - domain: settlements-npcs
- `appendAuthoredResidentFamily` — function — line 52
  - domain: settlements-npcs
- `createLostTreasureElderFamily` — function — line 80
  - domain: settlements-npcs
- `isLostTreasureElderFamily` — function — line 42
  - domain: settlements-npcs
- `LOST_TREASURE_ELDER_AGE` — const — line 14
- `LOST_TREASURE_ELDER_FAMILY_ID` — const — line 10
- `LOST_TREASURE_ELDER_GIVEN_NAME` — const — line 12
- `LOST_TREASURE_ELDER_LAST_NAME` — const — line 13
- `LOST_TREASURE_ELDER_SETTLEMENT_SEARCH_RADIUS` — const — line 17
- `LostTreasureElderSettlementCandidate` — type — line 27
  - domain: settlements-npcs
- `selectLostTreasureChroniclesElderSettlement` — function — line 111
  - domain: settlements-npcs

## `settlement/lostTreasureChroniclesSpecialistResident.ts`

- `createLostTreasureSpecialistFamily` — function — line 52
  - domain: settlements-npcs
- `findLostTreasureChroniclesSpecialistSettlement` — function — line 148
  - domain: settlements-npcs
- `findLostTreasureSpecialistResident` — function — line 125
  - domain: settlements-npcs
- `isLostTreasureSpecialistFamily` — function — line 42
  - domain: settlements-npcs
- `LOST_TREASURE_SPECIALIST_AGE` — const — line 14
- `LOST_TREASURE_SPECIALIST_FAMILY_ID` — const — line 10
- `LOST_TREASURE_SPECIALIST_GIVEN_NAME` — const — line 12
- `LOST_TREASURE_SPECIALIST_LAST_NAME` — const — line 13
- `LOST_TREASURE_SPECIALIST_SETTLEMENT_SEARCH_RADIUS` — const — line 18
- `LostTreasureSpecialistSettlementCandidate` — type — line 28
  - domain: settlements-npcs
- `selectLostTreasureChroniclesSpecialistSettlement` — function — line 95
  - domain: settlements-npcs

## `settlement/merchantJourney.ts`

- `advanceMerchantJourneyToVisiting` — function — line 65
  - domain: settlements-npcs
- `cloneMerchantJourney` — function — line 33
- `isNpcAwayOnMerchantJourney` — function — line 53
- `MerchantJourneyHost` — type — line 43
- `MerchantJourneyPhase` — type — line 16
  - domain: settlements-npcs
- `MerchantJourneyState` — type — line 18
- `MerchantReturnPoints` — type — line 85
- `resolveMerchantReturnArrival` — function — line 134
  - domain: settlements-npcs
- `TRAVELLING_MERCHANT_VISIT_DAYS` — const — line 31
- `tryBeginMerchantReturn` — function — line 100
  - domain: settlements-npcs

## `settlement/merchantTrade.ts`

- `generateMerchantAssortment` — function — line 473
- `HOME_STARTER_MERCHANT_KINDS` — const — line 94
- `horseVendorNpcId` — function — line 254
- `isPremiumMerchantGood` — function — line 185
- `MERCHANT_ARMOR_QUALITY_WEIGHTS` — const — line 568
- `MERCHANT_SPECIALIZATIONS` — const — line 42
- `MerchantArmorQualityContext` — type — line 578
- `MerchantAssortmentContext` — type — line 56
- `MerchantProfile` — type — line 50
- `merchantProfileFor` — function — line 245
- `MerchantSpecialization` — type — line 35
  - domain: settlements
- `merchantStockQuantity` — function — line 563
- `PREMIUM_MERCHANT_KINDS` — const — line 69
- `premiumAvailabilityChance` — function — line 190
- `resolveMerchantArmorQuality` — function — line 613
  - domain: settlements
- `resolveMerchantProfiles` — function — line 226
  - domain: settlements
- `resolvePremiumMerchantAssignment` — function — line 399
  - domain: settlements
- `seedMerchantStockIfNeeded` — function — line 637
- `settlementHasPremiumOffer` — function — line 387
- `specializationAffinity` — function — line 290

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

- `flattenedSettlementMembers` — function — line 23
  - domain: settlements-npcs
- `resolveSettlementNpcHomeDescriptor` — function — line 88
  - domain: settlements-npcs
- `settlementMemberPhysicalSeed` — function — line 55
- `SettlementNpcDescriptor` — type — line 30
- `settlementNpcDescriptors` — function — line 42
  - domain: settlements-npcs
- `SettlementNpcHomeDescriptor` — type — line 71
- `settlementNpcId` — function — line 13
  - domain: settlements-npcs
- `settlementNpcMemberIndex` — function — line 62
- `TravellingVisitorSpawn` — type — line 116

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

- `canLootNpcCorpse` — function — line 210
- `claimNpcCorpseForBurial` — function — line 149
- `cloneNpcCorpseLoot` — function — line 68
- `cloneNpcPostDeath` — function — line 72
- `commitNpcDeath` — function — line 243
- `corpseLootInventory` — function — line 217
- `createActiveNpcPostDeath` — function — line 105
- `createEmptyNpcCorpseLoot` — function — line 86
- `createLegacyTerminalNpcPostDeath` — function — line 92
- `dropNpcCorpseLoot` — function — line 301
- `EMPTY_NPC_CORPSE_LOOT` — const — line 63
- `finalizeExpiredNpcCorpse` — function — line 321
- `FinalizeNpcBurialResult` — type — line 189
- `finalizeNpcCorpseBurial` — function — line 193
- `hasActiveNpcCorpse` — function — line 124
- `isNpcCorpseBuryable` — function — line 181
- `markNpcPostDeathTerminal` — function — line 143
- `NPC_CORPSE_BONES_ONSET_DAYS` — const — line 60
- `NPC_CORPSE_REMOVE_DAYS` — const — line 61
- `NPC_CORPSE_ROT_ONSET_DAYS` — const — line 59
- `npcCorpseBurialClaimOwner` — function — line 177
- `NpcCorpseCleanupReason` — type — line 31
- `NpcCorpseLootSnapshot` — type — line 39
- `NpcCorpsePhase` — type — line 29
- `npcCorpsePhaseFromElapsedDays` — function — line 128
- `npcCorpseReadyToRemove` — function — line 138
- `NpcPostDeathState` — type — line 41
- `NpcPostDeathStatus` — type — line 27
  - domain: npc
  - role: Authoritative NPC corpse lifecycle, loot snapshot and burial handoff.
  - owns: NpcPostDeathState
- `recoverStaleNpcBurialClaim` — function — line 168
- `releaseNpcCorpseBurialClaim` — function — line 159
- `resolveNpcCorpsePhase` — function — line 133
- `shouldSkipNpcCorpsePresentation` — function — line 333
- `snapshotCorpseLoot` — function — line 221
- `transferCorpseCountTo` — function — line 283
- `transferCorpseInstanceTo` — function — line 267

## `settlement/npcRelationships.ts`

- `createNpcRelationships` — function — line 32
- `NpcRelationshipEntry` — type — line 26
- `NpcRelationships` — type — line 15

## `settlement/npcState.ts`

- `createNpcAuthoritativeState` — function — line 281
- `createNpcStateRegistry` — function — line 331
- `MAX_HP` — const — line 52
- `MAX_STAMINA` — const — line 53
- `NpcAuthoritativeState` — type — line 91
  - domain: settlements-npcs
- `NpcGraveVisitRecord` — type — line 44
- `NpcId` — type — line 40
- `NpcPhysicalMaxima` — type — line 267
- `NpcStateRegistry` — type — line 317
- `NpcStateSnapshot` — type — line 189

## `settlement/pastureWater.ts`

- `PASTURE_WELL_TROUGH_BUCKET_REACH` — const — line 13
  - domain: settlements-npcs
  - role: Canonical pasture well ↔ pasture trough local water use contract (plan settlements-npcs-046). Single source for the "close enough for the well's rope bucket" reach shared by the pasture layout generator (`villagePasture.ts`) and pasture-trough player/runtime interaction eligibility. This is the well+trough usable reach, not a collision or terrain-clearance footprint (see `villagePasture.ts`'s `WELL_RADIUS`/ `TROUGH_RADIUS`, which stay independent obstacle-clearance radii).
- `pastureTroughCanFill` — function — line 49
- `pastureTroughPromptLabel` — function — line 57
- `pastureWellTroughDistance` — function — line 16
- `resolvePastureWaterHousehold` — function — line 36

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

- `homeIndexFromPlaceId` — function — line 49
- `homePlaceId` — function — line 39
- `Place` — type — line 21
- `PlaceType` — type — line 19
- `socialPlaceFor` — function — line 72
- `workEligibleSettlementTrees` — function — line 90
- `workplaceFor` — function — line 132

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

## `settlement/plazaPaving.ts`

- `centralPlazaReservedFootprints` — function — line 53
- `fullPlazaSurfaceHoles` — function — line 111
- `generateFullPlazaCobbles` — function — line 129
- `generateSparsePlazaCobbles` — function — line 79
- `PlazaExclusion` — type — line 15
- `plazaPavingMode` — function — line 34
- `PlazaPavingMode` — type — line 13
  - domain: settlements
- `PlazaPavingPlacement` — type — line 21
- `PlazaSurfaceHole` — type — line 28

## `settlement/professionFamilySurnames.ts`

- `applyProfessionFamilySurnames` — function — line 122
  - domain: settlements-npcs
- `isWorldgenFamilyId` — function — line 47

## `settlement/professionStaffing.ts`

- `adultProfessionCoverage` — function — line 332
  - domain: settlements-npcs
- `isAdultAge` — function — line 300
- `isProfessionAdult` — function — line 305
- `ProfessionStaffingContext` — type — line 22
  - domain: settlements-npcs
- `resolveInitialProfessionStaffing` — function — line 434
  - domain: settlements-npcs
- `shepherdHouseholdIndex` — function — line 310
- `StaffingPriority` — type — line 12

## `settlement/props.ts`

- `BlacksmithWorkplace` — type — line 355
- `buildSettlementProps` — function — line 766
- `disposeSettlementGroup` — function — line 2247
- `SettlementHouseBed` — type — line 164
- `SettlementHouseLandmark` — type — line 130
- `SettlementLandmarks` — type — line 185
- `SettlementLandPlot` — type — line 344
- `SettlementStorageVisuals` — type — line 336
- `SettlementTreeLandmark` — type — line 365
- `SettlementWellLandmark` — type — line 171

## `settlement/propSpecs.ts`

- `ANIMAL_TROUGH_HEIGHT` — const — line 137
- `ANIMAL_TROUGH_URL` — const — line 135
- `BUSH_SPECS` — const — line 33
- `CACTUS_SPECS` — const — line 50
- `CAMPFIRE_FIT_MAX` — const — line 158
- `CAMPFIRE_UNLIT_URL` — const — line 156
- `CEMETERY_SPECS` — const — line 106
- `COBBLE_FIT_MAX` — const — line 175
- `COBBLE_URL` — const — line 172
- `CROPS_FIT_MAX` — const — line 129
- `CROPS_URL` — const — line 127
- `DOCK_SPECS` — const — line 83
- `FALLEN_LOG_SPECS` — const — line 99
- `FARM_HEIGHT` — const — line 125
- `FARM_URL` — const — line 122
- `FERN_SPECS` — const — line 46
- `FIRE_FX_URL` — const — line 185
- `GRAVE_SPECS` — const — line 110
- `LANDMARK_BOAT_FIT_MAX` — const — line 162
- `LANDMARK_BOAT_URL` — const — line 161
- `LANDMARK_OLD_TREE_FIT_MAX` — const — line 168
- `LANDMARK_OLD_TREE_URL` — const — line 167
- `LANDMARK_SHIPWRECK_FIT_MAX` — const — line 164
- `LANDMARK_SHIPWRECK_URL` — const — line 163
- `LANDMARK_TOWER_FIT_MAX` — const — line 166
- `LANDMARK_TOWER_URL` — const — line 165
- `LANDMARK_WAGON_FIT_MAX` — const — line 170
- `LANDMARK_WAGON_URL` — const — line 169
- `LANTERN_FLOOR_MAX` — const — line 186
- `LANTERN_URL` — const — line 183
- `LANTERN_WALL_MAX` — const — line 189
- `LILY_SPECS` — const — line 70
- `REED_SPECS` — const — line 61
- `RESOURCE_GOLD_SPECS` — const — line 114
- `RESOURCE_ROCK_SPECS` — const — line 118
- `ROCK_CLUSTER_SPECS` — const — line 95
- `ROCK_SPECS` — const — line 87
- `SEAWEED_SPECS` — const — line 79
- `TABLE_LAMP_FIT_MAX` — const — line 198
- `TABLE_LAMP_URL` — const — line 197
- `THICKET_TREE_SPECS` — const — line 26
- `TRAP_GOOD_FIT_MAX` — const — line 141
- `TRAP_GOOD_URL` — const — line 140
- `TREE_SPECS` — const — line 6
- `TREE_STUMP_HEIGHT` — const — line 180
- `TREE_STUMP_URL` — const — line 177
- `VILLAGE_CAMPFIRE_COLLISION_RADIUS` — const — line 152
- `VILLAGE_MASONRY_FIREPIT_COLLISION_RADIUS` — const — line 154
- `VILLAGE_TORCH_HEIGHT` — const — line 190
- `VILLAGE_TORCH_URL` — const — line 184
- `WALL_URL` — const — line 182
- `WELL_HEIGHT` — const — line 133
- `WELL_URL` — const — line 131
- `WOOD_PILE_COLLISION_RADIUS` — const — line 150
- `WOOD_PILE_HEIGHT` — const — line 147
- `WOOD_PILE_PROGRESSIVE_URL` — const — line 145
- `WOOD_PILE_URL` — const — line 143

## `settlement/propUtils.ts`

- `applyTerrainTilt` — function — line 69
- `cloneProp` — function — line 176
- `clonePropWithYaw` — function — line 190
- `disableCastShadow` — function — line 119
  - domain: world-terrain
- `loadPropOrFallback` — function — line 141
- `loadPropTemplates` — function — line 165
- `LocalTerrainSample` — type — line 42
- `placeOnGround` — function — line 91
- `rotateOffsetY` — function — line 85
- `sampleLocalTerrain` — function — line 49
- `tagSettlementShadowKind` — function — line 133
  - domain: world-terrain
- `TerrainSampler` — type — line 33
- `tintPropMaterials` — function — line 14

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

- `activateRoadRouteWorldgenCache` — function — line 133
  - domain: world-terrain
  - system: worldgen-cache
- `attachRoadRoutePersistence` — function — line 122
  - domain: world-terrain
- `bridgesNear` — function — line 1141
  - domain: world-terrain
- `bridgeSpecOf` — function — line 1100
- `clearRoadNetworkCaches` — function — line 192
- `clearRoadNetworkMemoryCaches` — function — line 179
  - domain: world-terrain
- `entranceToward` — function — line 216
- `findRoute` — function — line 336
  - domain: world-terrain
- `fordsNear` — function — line 1030
  - domain: world-terrain
- `ingestHydratedRoadRoute` — function — line 112
  - domain: world-terrain
- `meanderRoute` — function — line 599
- `MidpointSignpost` — type — line 862
- `midpointSignpostsFor` — function — line 876
- `neighborsFor` — function — line 247
- `peekRoadRouteCache` — function — line 143
- `RoadNetworkContext` — type — line 63
- `RoadRoute` — type — line 89
- `roadRouteLocationKey` — function — line 165
  - domain: world-terrain
  - system: worldgen-cache
- `roadRoutePairKey` — function — line 154
  - domain: world-terrain
  - system: worldgen-cache
- `roadRouteWorldgenCacheReady` — function — line 138
- `RoadSegment` — type — line 53
- `RoadSegmentKind` — type — line 51
- `RoutePoint` — type — line 41
- `RouteSearchOptions` — type — line 301
- `routeToMinorLocation` — function — line 927
- `segmentsNear` — function — line 952
- `SettlementSignpost` — type — line 827
- `signpostsForSettlement` — function — line 839
- `VillageSegments` — type — line 1173
- `villageSegmentsNear` — function — line 1197

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

## `settlement/roadRouteWorldgenCache.ts`

- `createRoadRouteWorldgenCache` — function — line 186
  - domain: world-terrain
  - system: worldgen-cache
- `isValidRoadRoutePayload` — function — line 135
  - domain: world-terrain
  - system: worldgen-cache
- `ROAD_ROUTE_CACHE_NAMESPACE` — const — line 28
  - domain: world-terrain
  - system: worldgen-cache
  - role: Persistent-cache adapter for inter-settlement / settlement↔minor-location `RoadRoute` results (plan world-terrain-029). IndexedDB only hydrates and extends the module-level `routeCache` in `roadNetwork.ts` — that map stays the synchronous authority. Cached `null` is a real hit (a deterministic failed route), never a miss.
  - integration: Disposable derived data only. Route consumers stay synchronous; a miss, malformed payload or IndexedDB failure always falls back to the canonical `findRoute()` path. Never `SaveData`, never a second crossing classifier, never signposts / per-chunk corridors / bridge specs.
- `ROAD_ROUTE_CACHE_VERSION` — const — line 41
- `RoadRouteCachePayload` — type — line 48
- `roadRouteFingerprint` — function — line 63
  - domain: world-terrain
  - system: worldgen-cache
- `RoadRouteWorldgenCache` — type — line 161

## `settlement/settlementAgriculture.ts`

- `completedAgricultureBatches` — function — line 52
- `householdAgriculturalCapacity` — function — line 22
  - domain: settlements-npcs
  - system: household
- `householdSeedReserveRequirement` — function — line 27
- `householdSeedStockCount` — function — line 32
- `householdSeedSurplusCount` — function — line 42
- `resolveSettlementAgricultureCatchUp` — function — line 118
- `resolveUnloadedHouseholdAgriculture` — function — line 73

## `settlement/settlementArmorQuality.ts`

- `hashArmorQualityOwner` — function — line 24
- `normalizeArmorQualityWeights` — function — line 33
- `pickWeightedArmorQuality` — function — line 41
- `resolveSettlementArmorQuality` — function — line 57
  - domain: settlements-npcs
- `SETTLEMENT_ARMOR_QUALITY_WEIGHTS` — const — line 16
  - domain: settlements-npcs

## `settlement/settlementCharacter.ts`

- `resolveSettlementCharacter` — function — line 34
  - domain: settlements
- `SETTLEMENT_CHARACTER_CHANCES` — const — line 42
- `SETTLEMENT_CHARACTER_SALT` — const — line 7
- `SettlementCharacterInput` — type — line 21
  - domain: settlements

## `settlement/settlementGenerator.ts`

- `cellFromId` — function — line 143
- `cellKey` — function — line 128
- `cellSeed` — function — line 171
- `cellsWithinRadius` — function — line 155
- `generateSettlementDef` — function — line 790
- `generateVillagePlan` — function — line 720
- `probeSettlementSite` — function — line 507
  - domain: settlements
- `SETTLEMENT_GRID_STEP` — const — line 70
- `SettlementCell` — type — line 76
- `SettlementDef` — type — line 78
- `SettlementSiteProbe` — type — line 492
- `worldToCell` — function — line 132

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

- `fencePlacementColliders` — function — line 380
  - domain: settlements
- `PALISADE_GATE_HALF_ANGLE` — const — line 20
- `PALISADE_WALL_HALF_DEPTH` — const — line 27
  - domain: settlements
- `plantEntrancePalisade` — function — line 359
  - domain: settlements
- `resolveEntrancePalisadePlacements` — function — line 181
  - domain: settlements
- `resolveEntranceTorchPlacements` — function — line 288
  - domain: settlements
- `SettlementEntranceTorchPlacement` — type — line 62
  - domain: settlements
- `settlementPalisadeColliders` — function — line 399
  - domain: settlements
- `SettlementPalisadePlacement` — type — line 54
  - domain: settlements
- `WALL_HALF_LENGTH` — const — line 18

## `settlement/settlementPlanCache.ts`

- `activateSettlementDefinitionCacheForWorld` — function — line 183
  - domain: settlements
  - system: worldgen-cache
- `attachSettlementDefinitionPersistence` — function — line 151
  - domain: settlements
  - system: worldgen-cache
- `cachedLostTreasureArchaeologistHostCell` — function — line 360
- `cachedLostTreasureSpecialistHostCell` — function — line 369
- `cachedSettlementDefCount` — function — line 391
- `cachedSettlementProgressionPolicy` — function — line 396
- `clearSettlementDefCache` — function — line 117
- `ingestHydratedSettlementDef` — function — line 136
  - domain: settlements
  - system: worldgen-cache
- `setSettlementRiverQuery` — function — line 81
- `settlementDefFor` — function — line 377
- `settlementDefinitionCacheReady` — function — line 200
- `SettlementResolveContext` — type — line 55
- `worldRiverQuery` — function — line 94

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

- `SettlementPropColliderLandmarks` — type — line 19
- `settlementPropColliders` — function — line 26

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

- `createSettlementsManager` — function — line 333
  - domain: settlements
  - system: settlements-manager
  - role: Owns settlement generation, streaming and per-settlement economy/household/NPC-state registries.
  - owns: SettlementEconomy, Household
  - lifecycle: streaming
- `SettlementsManager` — type — line 133

## `settlement/settlementStructures.ts`

- `createAnvil` — function — line 267
- `createBarrel` — function — line 103
- `createCrate` — function — line 254
- `createDock` — function — line 336
- `createGarden` — function — line 404
- `createGrindWorkbench` — function — line 293
- `createHayBale` — function — line 127
- `createHut` — function — line 13
- `createRatNest` — function — line 208
- `createSignpost` — function — line 362
- `createStockpile` — function — line 318
- `createTrough` — function — line 200
- `createTroughVisual` — function — line 194
- `createVillageNamepost` — function — line 383
- `createWell` — function — line 40
- `createWheatField` — function — line 506
- `cropsBedPlacements` — function — line 473
  - domain: settlements
- `disableGardenPlantCastShadow` — function — line 441
  - domain: world-terrain
- `preloadAnimalTroughVisual` — function — line 150
- `TroughVisual` — type — line 140
- `VILLAGE_NAMEPOST_BOARD_CENTER_Y` — const — line 381
- `wellPropPlacement` — function — line 459
  - domain: settlements

## `settlement/settlementTerrain.ts`

- `classifySettlementTerrain` — function — line 39
- `MOUNTAIN_RIDGE_THRESHOLD` — const — line 31
- `TerrainSamplers` — type — line 9

## `settlement/settlementVillageTorch.ts`

- `SettlementVillageTorch` — type — line 12
  - domain: settlements
  - system: settlement-lighting
- `settlementVillageTorchId` — function — line 19

## `settlement/settlementWorldgenCache.ts`

- `createSettlementWorldgenCache` — function — line 562
  - domain: settlements
  - system: worldgen-cache
- `isValidSettlementDefPayload` — function — line 500
  - domain: settlements
  - system: worldgen-cache
- `parseSettlementCellSubKey` — function — line 88
- `SETTLEMENT_DEFINITION_CACHE_NAMESPACE` — const — line 46
  - domain: settlements
  - system: worldgen-cache
  - role: Persistent-cache adapter for `SettlementDef | null` results (plan settlements-014). IndexedDB only hydrates and extends the module-level `defCache` in `settlementPlanCache.ts` — that map stays the synchronous authority. Cached `null` is a real hit (a cell that deterministically has no settlement), never a miss.
  - integration: Disposable derived data only. `settlementDefFor()` stays synchronous; a miss, malformed payload or IndexedDB failure always falls back to `generateSettlementDef()`. Never `SaveData`, never a second reduced `VillagePlan`, never economy / household / NPC runtime state.
- `SETTLEMENT_DEFINITION_CACHE_VERSION` — const — line 59
- `settlementCellSubKey` — function — line 83
  - domain: settlements
  - system: worldgen-cache
- `SettlementDefinitionCachePayload` — type — line 66
- `settlementDefinitionFingerprint` — function — line 110
  - domain: settlements
  - system: worldgen-cache
- `SettlementProgressionIdentity` — type — line 70
- `SettlementWorldgenCache` — type — line 536

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

- `allocateFoodRepresentatives` — function — line 166
  - domain: settlements-npcs
- `createFoodStorageVisual` — function — line 276
  - domain: settlements-npcs
- `createWoodPileVisual` — function — line 104
- `findWoodPileStageNodes` — function — line 75
- `flattenFoodRepresentatives` — function — line 210
- `FOOD_STORAGE_LOCAL_SLOTS` — const — line 235
  - domain: settlements-npcs
- `FOOD_STORAGE_MAX_KINDS` — const — line 136
- `FOOD_STORAGE_MAX_REPRESENTATIVES` — const — line 139
- `FoodRepresentativeAllocation` — type — line 141
- `foodRepresentativeCount` — function — line 149
  - domain: settlements-npcs
- `foodStorageAllocationSignature` — function — line 218
- `FoodStorageLocalSlot` — type — line 222
- `FoodStorageVisual` — type — line 260
- `WOOD_PILE_EXTRA_OFFSETS` — const — line 37
- `WOOD_PILE_MAX_EXTRA` — const — line 29
- `WOOD_PILE_OVERFLOW_START` — const — line 27
- `WOOD_PILE_OVERFLOW_STEP` — const — line 28
- `WOOD_PILE_STAGES` — const — line 22
  - domain: settlements-npcs
  - system: storage-visuals
  - role: Derives a bounded, deterministic Three.js visual from a storage destination's authoritative quantity/contents.
- `woodPileOverflowCount` — function — line 61
- `woodPileStage` — function — line 51
- `WoodPileStage` — type — line 23
- `WoodPileVisual` — type — line 87
- `woodPileVisualState` — function — line 70
- `WoodPileVisualState` — type — line 42

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

- `ClearingArea` — type — line 11
- `ClearingLayout` — type — line 21
- `layoutClearings` — function — line 137
- `layoutClearingsFromPlan` — function — line 65
- `plazaCoreRadius` — function — line 57

## `settlement/VillageFire.ts`

- `createVillageFire` — function — line 100
- `FireLightSource` — type — line 36
- `FUEL_PER_BRANCH` — const — line 11
- `IGNITE_DURATION_SEC` — const — line 15
- `VillageFire` — type — line 43
- `VillageFireHooks` — type — line 38

## `settlement/villagePaddock.ts`

- `appendPaddockPath` — function — line 391
- `horseVendorSetupChance` — function — line 68
- `paddockFencePlacements` — function — line 429
- `PaddockPlanArgs` — type — line 95
- `paddockRadiusFor` — function — line 82
- `paddockSlotCountForRadius` — function — line 87
- `planSettlementPaddock` — function — line 312
  - domain: settlements
- `settlementRollsHorseVendor` — function — line 76
- `vendorHorseAnimalId` — function — line 91

## `settlement/villagePasture.ts`

- `appendPasturePath` — function — line 450
- `fenceSegmentPlacements` — function — line 497
- `pastureFencePlacements` — function — line 526
- `PasturePlanArgs` — type — line 88
- `pastureRadiusFor` — function — line 81
- `planSettlementPasture` — function — line 359
- `settlementWantsPasture` — function — line 72

## `settlement/villagePlan.ts`

- `DEFAULT_PLAZA_RADIUS` — const — line 65
- `FoodSourceType` — type — line 10
- `householdWellLandmarkId` — function — line 207
- `householdWellPlotId` — function — line 193
- `isTreeWorkEligible` — function — line 111
- `noticeBoardPlotId` — function — line 223
- `PADDOCK_ID` — const — line 265
- `paddockPathId` — function — line 267
- `parseHouseholdWellFamilyIndex` — function — line 199
- `PASTURE_ID` — const — line 251
- `pasturePathId` — function — line 260
- `pastureWellLandmarkId` — function — line 255
- `plannedCampfireBodyKind` — function — line 103
- `plannedCampfireFootprint` — function — line 99
- `PLAZA_CAMPFIRE_FOOTPRINT` — const — line 91
- `PLAZA_MASONRY_FIREPIT_FOOTPRINT` — const — line 93
- `PLAZA_TREE_WORK_MARGIN` — const — line 109
- `plazaRadiusForSize` — function — line 69
- `plazaUsesMasonryFirepit` — function — line 95
- `residentialStructureId` — function — line 187
- `SettlementCharacter` — type — line 19
  - domain: settlements
- `VillageBoundary` — type — line 39
- `VillageBuildingPlan` — type — line 166
- `VillageBuildingRole` — type — line 158
- `VillageCenter` — type — line 47
- `VillageEntrance` — type — line 345
- `VillageIdentity` — type — line 23
- `VillageLandmarkKind` — type — line 211
- `VillageLandmarkPlan` — type — line 227
- `VillageLayoutPattern` — type — line 357
- `VillagePaddockPlan` — type — line 326
  - domain: settlements
- `VillagePastureAnchor` — type — line 286
- `VillagePastureFenceSegment` — type — line 277
  - domain: settlements
- `VillagePasturePlan` — type — line 301
  - domain: settlements
- `VillagePathPlan` — type — line 241
- `VillagePlan` — type — line 373
- `VillagePlaza` — type — line 58
- `villagePlazaAt` — function — line 82
- `VillagePlot` — type — line 139
- `VillagePlotRole` — type — line 137
- `VillageZone` — type — line 129
- `VillageZoneKind` — type — line 121

## `settlement/villagePlanDebug.ts`

- `summarizeVillagePlan` — function — line 5

## `settlement/villagePlanner.ts`

- `buildingsAndLandmarksFromPlots` — function — line 1380
- `chooseLayoutPattern` — function — line 160
- `HOUSE_PLOT_RADIUS` — const — line 76
- `householdWellLocalBand` — function — line 88
  - domain: settlements-npcs
- `pathPlansToCorridorData` — function — line 1755
- `planLocalPathsAndEntrances` — function — line 1636
- `planVillageLayout` — function — line 924
- `PLOT_SCORE_WEIGHTS` — const — line 50
- `VillageLayoutDraft` — type — line 123

## `settlement/wellInteractionQueue.ts`

- `buildWellInteractionQueueConfig` — function — line 19
- `WELL_QUEUE_SERVING_OFFSET_ANCHOR` — const — line 8
- `WELL_QUEUE_SERVING_OFFSET_FALLBACK` — const — line 11
- `WellQueueRestConfig` — type — line 13
