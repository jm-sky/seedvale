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

- `applyRecovery` — function — line 135
- `canReceiveRecovery` — function — line 127
- `computeMaterialRecovery` — function — line 117
- `CONSTRUCTION_MATERIAL_RADIUS` — const — line 12
- `consumeMaterial` — function — line 78
- `hasMaterial` — function — line 53
- `MaterialRecoveryPolicy` — type — line 108
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

- `createDroppedItems` — function — line 59
- `DroppedItem` — type — line 9
- `DroppedItems` — type — line 23

## `items/createItemSpawners.ts`

- `createItemSpawners` — function — line 124
- `ItemSpawners` — type — line 11
- `OneTimeWorldItemPickup` — type — line 117

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

- `bait` — function — line 280
- `BAIT_ITEM_PRIORITY` — const — line 289
- `canMergeFoodBatches` — function — line 214
- `CARRIED_FOOD_DECAY` — const — line 54
- `checkpointFoodBatch` — function — line 187
  - domain: items-player
- `cloneFoodBatch` — function — line 117
- `compareFoodBatchesFifo` — function — line 224
  - domain: items-player
- `createFoodBatch` — function — line 122
- `FOOD_BATCH_MERGE_TOLERANCE_DAYS` — const — line 212
- `FOOD_SOURCE_SPECIES` — const — line 15
- `FOOD_SOURCE_SPECIES_LABEL` — const — line 39
- `FoodBatch` — type — line 67
  - domain: items-player
- `foodBatchEffectiveAge` — function — line 144
  - domain: items-player
- `foodBatchesMergeEqual` — function — line 201
- `foodBatchUsedFraction` — function — line 149
- `foodFreshnessDef` — function — line 76
- `foodHungerRelief` — function — line 270
  - domain: items-player
- `FoodSourceSpecies` — type — line 13
- `foodTotalShelfLifeDays` — function — line 81
- `FRESHNESS_STAGE_LABEL` — const — line 47
- `FreshnessStage` — type — line 8
- `getFoodBatchFreshnessStage` — function — line 163
- `getFreshnessStage` — function — line 168
- `getFreshnessStageFromAge` — function — line 155
- `inheritProcessedFoodBatch` — function — line 239
  - domain: items-player
- `isBaitCapable` — function — line 284
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

## `items/guardSword.ts`

- `askGuardForSword` — function — line 22
- `GuardSwordAsk` — type — line 3
- `GuardSwordAskResult` — type — line 11
- `shouldGrantQuestSword` — function — line 41

## `items/HeldTool.ts`

- `createHeldTool` — function — line 68
  - domain: items-player
  - system: held-tool
  - role: Tracks which single tool/weapon instance is currently equipped in hand.
  - uses: Inventory
- `HeldTool` — type — line 38
- `isToolKind` — function — line 34
- `ToolKind` — type — line 7

## `items/heldToolVisual.ts`

- `BRANCH_HELD_ATTACH` — const — line 187
- `createHeldToolObject` — function — line 282
- `findRightHandSocket` — function — line 259
- `HELD_ATTACH` — const — line 32
- `HELD_GLB` — const — line 196
- `HeldAttach` — type — line 10
- `HeldMountContext` — type — line 249
- `mountAttachOnSocket` — function — line 352
- `mountHeldToolOnSocket` — function — line 310
- `preloadHeldToolModels` — function — line 263

## `items/Inventory.ts`

- `DEFAULT_MAX_SIZE` — const — line 59
- `EMPTY_INVENTORY_CONTENTS` — const — line 114
- `Inventory` — class — line 133
  - domain: items-player
  - system: inventory
  - role: Owns item ownership: stack counts, item instances and perishable food batches.
  - owns: FoodBatch
  - produces: SaveItemInstance
- `InventoryContentsSnapshot` — type — line 108
- `inventoryFromContents` — function — line 594
- `inventoryFullToastText` — function — line 613
- `ItemAmount` — type — line 64
- `SaveItemInstance` — type — line 66
- `snapshotInventoryContents` — function — line 584
- `toSaveItemInstance` — function — line 84

## `items/inventoryTransfer.ts`

- `transferInventoryCount` — function — line 19
  - domain: items-player
  - system: inventory
- `transferInventoryInstance` — function — line 40

## `items/inventoryView.ts`

- `buildInventoryGroups` — function — line 119
- `inventoryCountsForUi` — function — line 149
- `InventoryGroupView` — type — line 31
- `InventoryInstanceRow` — type — line 21

## `items/itemCatalog.ts`

- `ARROW_DAMAGE_BONUS` — const — line 1326
- `BookTier` — type — line 134
- `CAPABILITY_KINDS` — const — line 1357
- `CAPABILITY_NEED_LABEL` — const — line 112
- `CONSUMABLE_KINDS_BY_NEED` — const — line 1392
- `ConsumableNeed` — type — line 125
- `consumeNeedNoun` — function — line 226
- `consumeVerbLabel` — function — line 217
- `DefenseConfig` — type — line 42
- `hasItemCapability` — function — line 1382
- `HOLDABLE_KINDS` — const — line 1348
- `INJURY_TREATMENT_KINDS` — const — line 1414
- `isMeleeToolKind` — function — line 1341
- `isRangedTool` — function — line 1333
- `ITEM_CATALOG` — const — line 240
  - domain: items-player
  - system: item-catalog
  - role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
  - owns: ItemCatalogEntry
- `ITEM_SYSTEM_ROADMAP` — const — line 1435
- `ItemCapability` — type — line 89
- `ItemCatalogEntry` — type — line 136
- `ItemSpawnKind` — type — line 14
- `itemTreatsPhysicalInjury` — function — line 1427
- `MeleeConfig` — type — line 25
- `NON_ITEM_PROPS` — const — line 1441
- `RangedConfig` — type — line 53

## `items/itemDisplay.ts`

- `itemDisplayName` — function — line 15
  - domain: items-player

## `items/itemInstances.ts`

- `clamp01` — function — line 167
- `clampCampCondition` — function — line 126
- `cloneItemInstance` — function — line 172
- `createItemInstanceId` — function — line 142
- `createTentInstance` — function — line 131
- `INSTANCE_BACKED_KINDS` — const — line 147
- `isInstanceBackedKind` — function — line 155
- `isLiquidContainerInstance` — function — line 110
- `isLiquidContainerKind` — function — line 84
- `isTentItemInstance` — function — line 121
- `isTrapItemInstance` — function — line 163
- `isTrapKind` — function — line 159
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

- `canCancelRestNow` — function — line 212
- `canCancelRestProgress` — function — line 183
- `createItemMesh` — function — line 1207
- `hasItemCategory` — function — line 162
- `hasItemKindCategory` — function — line 166
- `ITEM_DEFS` — const — line 216
- `ITEM_SIZE_UNITS` — const — line 135
- `ItemCategory` — type — line 126
- `ItemDef` — type — line 148
- `ItemKind` — type — line 6
- `ItemSize` — type — line 131
- `itemSizeUnits` — function — line 144
- `primaryItemCategory` — function — line 173
- `REST_CANCEL_PROGRESS_THRESHOLD` — const — line 181
- `REST_CANCEL_VIGOR_THRESHOLD` — const — line 193
- `restCancelAllowedByStartVigor` — function — line 200

## `items/ItemSpawner.ts`

- `ItemSpawnPoint` — type — line 3
- `updateItemSpawnPoints` — function — line 16

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

- `createAcquiredInstance` — function — line 139
- `InstanceSellResult` — type — line 30
- `OfferBuybackResolution` — type — line 34
- `previewPricedPurchaseNetCoins` — function — line 288
- `previewTransactionNetCoins` — function — line 273
- `resolveOfferBuyback` — function — line 222
  - domain: settlements — merchant buyback for an entire offer basket plus the concrete instance ids settlement should remove for instance-backed kinds.
- `resolveOfferLineBuyback` — function — line 199
  - domain: settlements — deterministic merchant buyback for one offer row, using the same worst-condition instance selection that settlement will remove.
- `selectInstancesToSell` — function — line 157
- `selectInstanceToPlace` — function — line 172
- `sellInstancesForCoins` — function — line 359
- `settlePricedPurchase` — function — line 301
- `settleTransaction` — function — line 329
- `TradeResult` — type — line 28

## `items/tradeCatalog.ts`

- `BASE_SELL_FACTOR` — const — line 181
  - domain: settlements — full-condition sell factor bounds (plan settlements-006).
- `BROKEN_SELL_MULTIPLIER` — const — line 283
- `canSell` — function — line 212
- `fullConditionSellFactor` — function — line 245
  - domain: settlements — sell factor for a full-condition item before durability scaling.
- `isMerchantStock` — function — line 196
- `MAX_SELL_FACTOR` — const — line 183
- `MERCHANT_PRICES` — const — line 13
- `MERCHANT_STOCK` — const — line 87
- `merchantPrice` — function — line 192
- `MIN_SELL_FACTOR` — const — line 182
- `NEUTRAL_SELL_PRICE_CONTEXT` — const — line 173
  - domain: settlements — neutral social standing for merchant sell pricing.
- `offerValue` — function — line 274
- `relationshipEffect` — function — line 221
  - domain: settlements — relation tier bonus in percentage points (0.01 = 1 pp).
- `reputationEffect` — function — line 234
  - domain: settlements — weighted reputation × renown amplification (percentage points).
- `resolveInstanceSellPrice` — function — line 286
  - domain: settlements — merchant buyback for a concrete item instance — price is derived, never stored.
- `roundSellPrice` — function — line 254
  - domain: settlements — deterministic integer coin rounding shared by stack and instance pricing.
- `sellPrice` — function — line 264
  - domain: settlements — merchant buyback for a stackable kind at full condition.
- `SellPriceContext` — type — line 185
- `tradeValue` — function — line 201

## `items/trapItemInstances.ts`

- `createTrapInstance` — function — line 6
- `isPlaceableTrapInstance` — function — line 44
- `trapConditionPercent` — function — line 40
- `trapConditionRatio` — function — line 33
- `trapInstanceFromWorld` — function — line 15
- `trapMaxDurability` — function — line 28

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
