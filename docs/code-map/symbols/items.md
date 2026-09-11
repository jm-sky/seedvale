# Symbols

Generated from exported TypeScript symbols.

## `items/books.ts`

- `BookReadOutcome` — type — line 15
  - domain: items-player
  - role: Interprets the "Czytaj" inventory action against `ITEM_CATALOG[kind].book` metadata and `PlayerSkills` — the only place that decides what reading a book actually does. Owns no state of its own: the book stays in inventory either way, and the only lasting effect is the XP change `raiseSkillToValue` makes.
- `BookReadResult` — type — line 25
- `readBook` — function — line 37

## `items/campBlanketProp.ts`

- `createCampBlanketProp` — function — line 9
- `disposeCampBlanketProp` — function — line 19

## `items/campfireCooking.ts`

- `COOK_DURATION_SEC` — const — line 34
- `COOKING_RECIPES` — const — line 16
- `CookingRecipe` — type — line 10
- `findCookingBatch` — function — line 65
- `findCookingRecipe` — function — line 37
- `processCookedBatches` — function — line 82
  - domain: items-player
- `resolveCookingCapacity` — function — line 54

## `items/campRepair.ts`

- `applyCampRepairWork` — function — line 213
  - domain: items-player
- `BEDROLL_REPAIR_FULL_WORK_HOURS` — const — line 38
- `beginCampRepair` — function — line 166
  - domain: items-player
- `CAMP_REPAIR_COST_FACTOR` — const — line 32
- `CAMP_REPAIR_DURATION_CUT` — const — line 50
- `CAMP_REPAIR_SESSION_HOURS` — const — line 43
- `CAMP_REPAIR_SESSION_SEC` — const — line 44
- `CAMP_REPAIR_XP_PER_WORK_HOUR` — const — line 47
- `CampRepairableRecord` — type — line 200
- `campRepairCapability` — function — line 237
- `campRepairDurationScale` — function — line 243
- `CampRepairQuote` — type — line 52
- `CampRepairStartOutcome` — type — line 62
- `CampRepairTargetKind` — type — line 28
  - domain: items-player
- `campRepairXp` — function — line 248
- `hasActiveCampRepair` — function — line 232
- `PLATFORM_REPAIR_FULL_WORK_HOURS` — const — line 39
- `resolveCampRepairQuote` — function — line 139
  - domain: items-player
- `TENT_REPAIR_FULL_HIDE` — const — line 36
- `TENT_REPAIR_FULL_WORK_HOURS` — const — line 37

## `items/constructionMaterials.ts`

- `applyRecovery` — function — line 170
- `canReceiveRecovery` — function — line 162
- `computeMaterialRecovery` — function — line 152
- `CONSTRUCTION_MATERIAL_RADIUS` — const — line 12
- `consumeMaterial` — function — line 113
- `foldMaterialRequirements` — function — line 176
- `formatMaterialAvailabilityLine` — function — line 191
- `hasMaterial` — function — line 88
- `materialAvailabilityBreakdown` — function — line 64
- `MaterialAvailabilityView` — type — line 55
- `MaterialRecoveryPolicy` — type — line 143
- `MaterialRequirement` — type — line 8
- `nearbyWorldMaterialCount` — function — line 40

## `items/container.ts`

- `CONTAINER_DEFS` — const — line 41
- `CONTAINER_PLACE_REACH` — const — line 72
- `CONTAINER_PLACEMENT_MESSAGE` — const — line 55
- `CONTAINER_SETUP_DURATION_SEC` — const — line 75
- `ContainerDef` — type — line 24
- `ContainerKind` — type — line 22
- `ContainerPlacementReason` — type — line 53
- `containerTotalWeight` — function — line 66

## `items/cookingFireResolver.ts`

- `CookingFireRef` — type — line 7
- `NearbyCookingFire` — type — line 11
- `resolveCookingFireByRef` — function — line 81
- `resolveNearbyCookingFire` — function — line 35
  - domain: ui-input
- `resolvePlacedFireById` — function — line 92

## `items/createDroppedItems.ts`

- `createDroppedItems` — function — line 69
- `DroppedItem` — type — line 13
- `DroppedItems` — type — line 27

## `items/createItemSpawners.ts`

- `createItemSpawners` — function — line 133
- `ItemSpawners` — type — line 12
- `OneTimeWorldItemPickup` — type — line 118

## `items/createPlacedTents.ts`

- `createPlacedTents` — function — line 107
  - domain: items-player
- `PlacedTent` — type — line 20
- `PlacedTentEntry` — type — line 34
- `PlacedTents` — type — line 41
- `TENT_CONDITION_MAX` — const — line 73
- `TENT_RAIN_DECAY_PER_DAY` — const — line 71
- `TENT_SNOW_DECAY_PER_DAY` — const — line 72
- `TentPackResult` — type — line 36

## `items/foodFreshness.ts`

- `bait` — function — line 308
- `BAIT_ITEM_PRIORITY` — const — line 317
- `canMergeFoodBatches` — function — line 242
- `CARRIED_FOOD_DECAY` — const — line 54
- `checkpointFoodBatch` — function — line 215
  - domain: items-player
- `cloneFoodBatch` — function — line 117
- `compareFoodBatchesFifo` — function — line 252
  - domain: items-player
- `createFoodBatch` — function — line 122
- `FOOD_BATCH_MERGE_TOLERANCE_DAYS` — const — line 240
- `FOOD_SOURCE_SPECIES` — const — line 15
- `FOOD_SOURCE_SPECIES_LABEL` — const — line 39
- `FoodBatch` — type — line 67
  - domain: items-player
- `foodBatchDecomposeAtDays` — function — line 196
  - domain: items-player
- `foodBatchEffectiveAge` — function — line 144
  - domain: items-player
- `foodBatchesMergeEqual` — function — line 229
- `foodBatchUsedFraction` — function — line 149
- `foodFreshnessDef` — function — line 76
- `foodHungerRelief` — function — line 298
  - domain: items-player
- `FoodSourceSpecies` — type — line 13
- `foodTotalShelfLifeDays` — function — line 81
- `FRESHNESS_STAGE_LABEL` — const — line 47
- `FreshnessStage` — type — line 8
- `getFoodBatchFreshnessStage` — function — line 163
- `getFreshnessStage` — function — line 168
- `getFreshnessStageFromAge` — function — line 155
- `inheritProcessedFoodBatch` — function — line 267
  - domain: items-player
- `isBaitCapable` — function — line 312
- `isFoodBatchDecomposed` — function — line 203
- `isFoodBatchSpoiled` — function — line 176
- `isFoodPerishable` — function — line 87
- `isFoodSourceSpecies` — function — line 19
- `isSpoiled` — function — line 172
- `MEAT_KIND_BY_SOURCE_SPECIES` — const — line 31
- `normalizeFoodBatch` — function — line 101
  - domain: items-player
- `SOURCE_SPECIES_BY_MEAT_KIND` — const — line 23
- `sourceSpeciesForMeatKind` — function — line 91
- `STORED_FOOD_DECAY` — const — line 57
- `WORLD_SPOILED_FOOD_DECAY_DAYS` — const — line 187
  - domain: items-player

## `items/foodItems.ts`

- `carryFoodClaim` — function — line 124
- `claimFoodItems` — function — line 52
- `deliverCarriedFoodClaim` — function — line 142
- `depositFoodItems` — function — line 74
- `expandFoodBatchesToUnits` — function — line 92
- `FOOD_ITEM_KINDS` — const — line 18
- `FoodItemClaim` — type — line 45
- `foodItemCount` — function — line 24
- `skipBatchCount` — function — line 101
- `takeBatchCount` — function — line 79
- `takeOneFoodItem` — function — line 33

## `items/foodSafety.ts`

- `RawMeatSafetyRisk` — type — line 24
- `resolveRawMeatSafetyRisk` — function — line 70
  - domain: items-player

## `items/guardSword.ts`

- `askGuardForSword` — function — line 22
- `GuardSwordAsk` — type — line 3
- `GuardSwordAskResult` — type — line 11
- `shouldGrantQuestSword` — function — line 41

## `items/HeldTool.ts`

- `createHeldTool` — function — line 69
  - domain: items-player
  - system: held-tool
  - role: Tracks which single tool/weapon instance is currently equipped in hand.
  - uses: Inventory
- `HeldTool` — type — line 39
- `isToolKind` — function — line 35
- `ToolKind` — type — line 7

## `items/heldToolVisual.ts`

- `BRANCH_HELD_ATTACH` — const — line 192
- `createHeldToolObject` — function — line 287
- `findRightHandSocket` — function — line 264
- `HELD_ATTACH` — const — line 32
- `HELD_GLB` — const — line 201
- `HeldAttach` — type — line 10
- `HeldMountContext` — type — line 254
- `mountAttachOnSocket` — function — line 357
- `mountHeldToolOnSocket` — function — line 315
- `preloadHeldToolModels` — function — line 268

## `items/Inventory.ts`

- `DEFAULT_MAX_SIZE` — const — line 59
- `EMPTY_INVENTORY_CONTENTS` — const — line 126
- `Inventory` — class — line 145
  - domain: items-player
  - system: inventory
  - role: Owns item ownership: stack counts, item instances and perishable food batches.
  - owns: FoodBatch
  - produces: SaveItemInstance
- `InventoryContentsSnapshot` — type — line 120
- `inventoryFromContents` — function — line 694
- `inventoryFullToastText` — function — line 713
- `ItemAmount` — type — line 64
- `SaveItemInstance` — type — line 78
- `snapshotInventoryContents` — function — line 684
- `toSaveItemInstance` — function — line 96

## `items/inventoryTransfer.ts`

- `transferInventoryCount` — function — line 19
  - domain: items-player
  - system: inventory
- `transferInventoryInstance` — function — line 40

## `items/inventoryView.ts`

- `buildInventoryGroups` — function — line 178
- `inventoryCountsForUi` — function — line 213
- `InventoryGroupView` — type — line 50
- `InventoryInstanceRow` — type — line 38
- `ITEM_METER_LABEL` — const — line 32
- `ItemMeterKind` — type — line 27

## `items/itemCatalog.ts`

- `ARROW_DAMAGE_BONUS` — const — line 1467
- `BookTier` — type — line 156
- `CAPABILITY_KINDS` — const — line 1498
- `CAPABILITY_LABEL` — const — line 132
- `CAPABILITY_NEED_LABEL` — const — line 116
- `CONSUMABLE_KINDS_BY_NEED` — const — line 1538
- `ConsumableNeed` — type — line 147
- `consumeNeedNoun` — function — line 262
- `consumeVerbLabel` — function — line 253
- `DefenseConfig` — type — line 42
- `hasItemCapability` — function — line 1523
- `HOLDABLE_KINDS` — const — line 1489
- `INJURY_TREATMENT_KINDS` — const — line 1560
- `isMeleeToolKind` — function — line 1482
- `isRangedTool` — function — line 1474
- `ITEM_CATALOG` — const — line 276
  - domain: items-player
  - system: item-catalog
  - role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
  - owns: ItemCatalogEntry
- `ITEM_SYSTEM_ROADMAP` — const — line 1581
- `ItemCapability` — type — line 89
- `ItemCatalogEntry` — type — line 158
- `itemIsResilient` — function — line 1528
- `ItemSpawnKind` — type — line 14
- `itemTreatsPhysicalInjury` — function — line 1573
- `MeleeConfig` — type — line 25
- `NON_ITEM_PROPS` — const — line 1587
- `RangedConfig` — type — line 53

## `items/itemDisplay.ts`

- `itemDisplayName` — function — line 15
  - domain: items-player

## `items/itemFuel.ts`

- `FUEL_ITEM_PRIORITY` — const — line 18
  - domain: items-player
  - system: item-fuel
  - role: Catalog-driven campfire fuel resolution (plan items-player-023) — the fuel counterpart of `hasItemCapability`/`findWithCapability`. `VillageFire` receives a resolved branch-equivalent contribution and never has to know which item kind produced it.
- `fuelValue` — function — line 23
- `isFuel` — function — line 27
- `selectFuelKind` — function — line 35

## `items/itemInstances.ts`

- `clamp01` — function — line 174
- `clampCampCondition` — function — line 126
- `cloneItemInstance` — function — line 179
- `createItemInstanceId` — function — line 142
- `createKeyInstance` — function — line 158
- `createTentInstance` — function — line 131
- `INSTANCE_BACKED_KINDS` — const — line 147
- `isInstanceBackedKind` — function — line 162
- `isLiquidContainerInstance` — function — line 110
- `isLiquidContainerKind` — function — line 84
- `isTentItemInstance` — function — line 121
- `isTrapItemInstance` — function — line 170
- `isTrapKind` — function — line 166
- `isWeaponItemInstance` — function — line 97
- `isWeaponMaintenanceKind` — function — line 57
- `ItemInstance` — type — line 4
- `LIQUID_CONTAINER_KIND_LIST` — const — line 74
- `LIQUID_CONTAINER_KINDS` — const — line 82
- `LiquidContainerItemInstance` — type — line 104
- `LiquidContainerKind` — type — line 67
- `LiquidContent` — type — line 62
- `TentItemInstance` — type — line 116
- `TrapItemInstance` — type — line 11
- `TrapKind` — type — line 9
- `WEAPON_MAINTENANCE_KIND_LIST` — const — line 39
- `WEAPON_MAINTENANCE_KINDS` — const — line 55
- `WeaponItemInstance` — type — line 91
- `WeaponMaintenanceKind` — type — line 21

## `items/itemModels.ts`

- `cloneItemGlb` — function — line 174
- `ITEM_GLB_SPECS` — const — line 15
- `preloadItemGlbModels` — function — line 149

## `items/items.ts`

- `canCancelRestNow` — function — line 222
- `canCancelRestProgress` — function — line 193
- `createItemMesh` — function — line 1309
- `hasItemCategory` — function — line 172
- `hasItemKindCategory` — function — line 176
- `ITEM_DEFS` — const — line 226
- `ITEM_SIZE_UNITS` — const — line 145
- `ItemCategory` — type — line 136
- `ItemDef` — type — line 158
- `ItemKind` — type — line 6
- `ItemSize` — type — line 141
- `itemSizeUnits` — function — line 154
- `primaryItemCategory` — function — line 183
- `REST_CANCEL_PROGRESS_THRESHOLD` — const — line 191
- `REST_CANCEL_VIGOR_THRESHOLD` — const — line 203
- `restCancelAllowedByStartVigor` — function — line 210

## `items/ItemSpawner.ts`

- `ItemSpawnPoint` — type — line 3
- `updateItemSpawnPoints` — function — line 17

## `items/itemUseView.ts`

- `ItemUseView` — type — line 18
  - domain: items-player
- `resolveConsumeUseView` — function — line 31
- `resolveReadBookUseView` — function — line 52

## `items/liquidContainer.ts`

- `addLiquidToContainer` — function — line 64
- `canDrinkFromLiquidContainer` — function — line 87
- `canFillLiquidContainer` — function — line 38
- `createLiquidContainerInstance` — function — line 34
- `drinkFromLiquidContainer` — function — line 98
- `emptyLiquidContainer` — function — line 109
- `fillLiquidContainer` — function — line 48
- `hasLiquidContent` — function — line 79
- `LIQUID_DENSITY_KG_PER_LITRE` — const — line 25
- `LIQUID_DRINK_PORTION_LITRES` — const — line 20
- `liquidContainerCapacity` — function — line 27
- `migrateLegacyWaterskinsToInstances` — function — line 143
- `pourLiquidFromContainer` — function — line 117

## `items/primaryWeapons.ts`

- `createPrimaryWeaponSelection` — function — line 68
- `inventoryOwnsPrimaryWeaponChoice` — function — line 50
- `inventoryOwnsPrimaryWeaponKind` — function — line 41
- `isPrimaryMeleeAssignment` — function — line 96
- `isPrimaryRangedAssignment` — function — line 102
- `PrimaryWeaponChoice` — type — line 6
- `PrimaryWeaponSelection` — type — line 13
- `SavePrimaryWeaponChoice` — type — line 8

## `items/sensibleFood.ts`

- `resolveSensibleFoodKind` — function — line 66
  - domain: ui-input

## `items/tentPlacement.ts`

- `evaluateGroundPlacement` — function — line 96
- `evaluateOrientedGroundPlacement` — function — line 160
- `evaluateTentPlacement` — function — line 179
- `GroundPlacementInput` — type — line 15
- `GroundPlacementReason` — type — line 13
- `OrientedGroundPlacementInput` — type — line 113
- `PLACEMENT_WATER_MARGIN` — const — line 48
- `TENT_PLACEMENT_MESSAGE` — const — line 196
- `TENT_SETUP_DURATION_SEC` — const — line 194
- `TentPlacementInput` — type — line 30
- `TentPlacementReason` — type — line 3
- `WATER_MARGIN` — const — line 41

## `items/tentProp.ts`

- `createPlacedTentProp` — function — line 31
- `disposePlacedTentProp` — function — line 106
- `TENT_FOOTPRINT_RADIUS` — const — line 12
- `TENT_HEIGHT` — const — line 10
- `TENT_LENGTH` — const — line 8
- `TENT_WIDTH` — const — line 9
- `tentRestPose` — function — line 22
- `TentRestPose` — type — line 14

## `items/timedProcess.ts`

- `isProcessComplete` — function — line 31
- `ItemStackInput` — type — line 12
- `ItemStackOutput` — type — line 13
- `processCompletedAtDays` — function — line 27
- `processProgress` — function — line 36
- `TimedProcess` — type — line 15
- `TimedProcessKind` — type — line 10

## `items/trade.ts`

- `createAcquiredInstance` — function — line 140
- `InstanceSellResult` — type — line 31
- `OfferBuybackResolution` — type — line 35
- `previewPricedPurchaseNetCoins` — function — line 290
- `previewTransactionNetCoins` — function — line 275
- `resolveOfferBuyback` — function — line 224
  - domain: settlements — merchant buyback for an entire offer basket plus the concrete instance ids settlement should remove for instance-backed kinds.
- `resolveOfferLineBuyback` — function — line 201
  - domain: settlements — deterministic merchant buyback for one offer row, using the same worst-condition instance selection that settlement will remove.
- `selectInstancesToSell` — function — line 159
- `selectInstanceToPlace` — function — line 174
- `sellInstancesForCoins` — function — line 361
- `settlePricedPurchase` — function — line 303
- `settleTransaction` — function — line 331
- `TradeResult` — type — line 29

## `items/tradeCatalog.ts`

- `BASE_SELL_FACTOR` — const — line 194
  - domain: settlements — full-condition sell factor bounds (plan settlements-006).
- `BROKEN_SELL_MULTIPLIER` — const — line 296
- `canSell` — function — line 225
- `fullConditionSellFactor` — function — line 258
  - domain: settlements — sell factor for a full-condition item before durability scaling.
- `isMerchantStock` — function — line 209
- `MAX_SELL_FACTOR` — const — line 196
- `MERCHANT_PRICES` — const — line 14
- `MERCHANT_STOCK` — const — line 92
- `merchantPrice` — function — line 205
- `MIN_SELL_FACTOR` — const — line 195
- `NEUTRAL_SELL_PRICE_CONTEXT` — const — line 186
  - domain: settlements — neutral social standing for merchant sell pricing.
- `offerValue` — function — line 287
- `relationshipEffect` — function — line 234
  - domain: settlements — relation tier bonus in percentage points (0.01 = 1 pp).
- `reputationEffect` — function — line 247
  - domain: settlements — weighted reputation × renown amplification (percentage points).
- `resolveInstanceSellPrice` — function — line 299
  - domain: settlements — merchant buyback for a concrete item instance — price is derived, never stored.
- `roundSellPrice` — function — line 267
  - domain: settlements — deterministic integer coin rounding shared by stack and instance pricing.
- `sellPrice` — function — line 277
  - domain: settlements — merchant buyback for a stackable kind at full condition.
- `SellPriceContext` — type — line 198
- `tradeValue` — function — line 214

## `items/trapItemInstances.ts`

- `createTrapInstance` — function — line 6
- `isPlaceableTrapInstance` — function — line 44
- `trapConditionPercent` — function — line 40
- `trapConditionRatio` — function — line 33
- `trapInstanceFromWorld` — function — line 15
- `trapMaxDurability` — function — line 28

## `items/treasureGameplay.ts`

- `applyTreasureContentsLosses` — function — line 313
- `BLADE_TRAP_DAMAGE` — const — line 17
- `CAVE_FINAL_COIN_MAX` — const — line 28
- `CAVE_FINAL_COIN_MIN` — const — line 27
- `CAVE_FINAL_GOLD_MAX` — const — line 30
- `CAVE_FINAL_GOLD_MIN` — const — line 29
- `CAVE_SIDE_COIN_MAX` — const — line 26
- `CAVE_SIDE_COIN_MIN` — const — line 25
- `commitForcedEntry` — function — line 380
- `describeTreasureContainerInteraction` — function — line 328
- `EMPTY_TREASURE_MUTATION` — const — line 66
- `FORCE_ENTRY_DURATION_SEC` — const — line 18
- `ForcedEntryCommitInput` — type — line 354
- `ForcedEntryCommitResult` — type — line 363
- `GEMSTONE_KINDS` — const — line 38
- `GemstoneKind` — type — line 47
- `generateTreasureLoot` — function — line 202
- `GenerateTreasureLootOptions` — type — line 34
- `getTreasureMutation` — function — line 147
- `isGemstoneKind` — function — line 135
- `mutationIsDefault` — function — line 154
- `pryingQuality` — function — line 143
- `quantizeStrength` — function — line 139
- `resolveFireSeverity` — function — line 275
- `resolveMechanicalResult` — function — line 251
- `resolveTreasureLockDifficulty` — function — line 247
- `resolveTreasureTrap` — function — line 240
- `selectDestroyedContents` — function — line 297
- `serializeTreasureMutations` — function — line 163
- `snapshotTreasureContents` — function — line 289
- `TREASURE_COIN_MAX` — const — line 16
- `TREASURE_COIN_MIN` — const — line 15
  - domain: items-player
- `TreasureChestMutation` — type — line 59
- `TreasureContainerInteraction` — type — line 322
- `TreasureContentsSnapshot` — type — line 285
- `TreasureFireSeverity` — type — line 51
- `TreasureForceCapabilitySnapshot` — type — line 53
- `TreasureLootProfile` — type — line 32
- `TreasureMechanicalResult` — type — line 50
- `TreasureTrapType` — type — line 49
- `treasureWorldContainerPrompt` — function — line 341

## `items/weaponMaintenance.ts`

- `applySharpnessWear` — function — line 83
- `createWeaponInstance` — function — line 67
- `getSharpnessDamageModifier` — function — line 53
- `getWeaponMaintenanceProfile` — function — line 38
- `migrateWeaponCountsToInstances` — function — line 122
- `SharpenResult` — type — line 94
- `sharpenWeapon` — function — line 100
- `weaponDurabilityPercent` — function — line 72
- `WeaponMaintenanceProfile` — type — line 22
- `weaponSharpnessPercent` — function — line 76
