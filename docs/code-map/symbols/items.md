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

- `createItemSpawners` — function — line 117
- `ItemSpawners` — type — line 11

## `items/createPlacedTents.ts`

- `createPlacedTents` — function — line 24
- `PlacedTent` — type — line 6
- `PlacedTentEntry` — type — line 8
- `PlacedTents` — type — line 10

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

- `BRANCH_HELD_ATTACH` — const — line 188
- `createHeldToolObject` — function — line 282
- `findRightHandSocket` — function — line 259
- `HELD_ATTACH` — const — line 32
- `HELD_GLB` — const — line 197
- `HeldAttach` — type — line 10
- `HeldMountContext` — type — line 249
- `mountAttachOnSocket` — function — line 352
- `mountHeldToolOnSocket` — function — line 310
- `preloadHeldToolModels` — function — line 263

## `items/Inventory.ts`

- `DEFAULT_MAX_SIZE` — const — line 56
- `EMPTY_INVENTORY_CONTENTS` — const — line 108
- `Inventory` — class — line 127
  - domain: items-player
  - system: inventory
  - role: Owns item ownership: stack counts, item instances and perishable food batches.
  - owns: FoodBatch
  - produces: SaveItemInstance
- `InventoryContentsSnapshot` — type — line 102
- `inventoryFromContents` — function — line 579
- `inventoryFullToastText` — function — line 598
- `ItemAmount` — type — line 61
- `SaveItemInstance` — type — line 63
- `snapshotInventoryContents` — function — line 569
- `toSaveItemInstance` — function — line 79

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

- `ARROW_DAMAGE_BONUS` — const — line 1292
- `BookTier` — type — line 131
- `CAPABILITY_KINDS` — const — line 1323
- `CAPABILITY_NEED_LABEL` — const — line 110
- `CONSUMABLE_KINDS_BY_NEED` — const — line 1358
- `ConsumableNeed` — type — line 122
- `consumeNeedNoun` — function — line 221
- `consumeVerbLabel` — function — line 212
- `DefenseConfig` — type — line 42
- `hasItemCapability` — function — line 1348
- `HOLDABLE_KINDS` — const — line 1314
- `INJURY_TREATMENT_KINDS` — const — line 1380
- `isMeleeToolKind` — function — line 1307
- `isRangedTool` — function — line 1299
- `ITEM_CATALOG` — const — line 235
  - domain: items-player
  - system: item-catalog
  - role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
  - owns: ItemCatalogEntry
- `ITEM_SYSTEM_ROADMAP` — const — line 1401
- `ItemCapability` — type — line 89
- `ItemCatalogEntry` — type — line 133
- `ItemSpawnKind` — type — line 14
- `itemTreatsPhysicalInjury` — function — line 1393
- `MeleeConfig` — type — line 25
- `NON_ITEM_PROPS` — const — line 1407
- `RangedConfig` — type — line 53

## `items/itemDisplay.ts`

- `itemDisplayName` — function — line 15
  - domain: items-player

## `items/itemInstances.ts`

- `clamp01` — function — line 141
- `cloneItemInstance` — function — line 146
- `createItemInstanceId` — function — line 117
- `INSTANCE_BACKED_KINDS` — const — line 122
- `isInstanceBackedKind` — function — line 129
- `isLiquidContainerInstance` — function — line 110
- `isLiquidContainerKind` — function — line 84
- `isTrapItemInstance` — function — line 137
- `isTrapKind` — function — line 133
- `isWeaponItemInstance` — function — line 97
- `isWeaponMaintenanceKind` — function — line 57
- `ItemInstance` — type — line 4
- `LIQUID_CONTAINER_KIND_LIST` — const — line 74
- `LIQUID_CONTAINER_KINDS` — const — line 82
- `LiquidContainerItemInstance` — type — line 104
- `LiquidContainerKind` — type — line 67
- `LiquidContent` — type — line 62
- `TrapItemInstance` — type — line 11
- `TrapKind` — type — line 9
- `WEAPON_MAINTENANCE_KIND_LIST` — const — line 39
- `WEAPON_MAINTENANCE_KINDS` — const — line 55
- `WeaponItemInstance` — type — line 91
- `WeaponMaintenanceKind` — type — line 21

## `items/itemModels.ts`

- `cloneItemGlb` — function — line 169
- `ITEM_GLB_SPECS` — const — line 15
- `preloadItemGlbModels` — function — line 144

## `items/items.ts`

- `canCancelRestNow` — function — line 209
- `canCancelRestProgress` — function — line 180
- `createItemMesh` — function — line 1177
- `hasItemCategory` — function — line 159
- `hasItemKindCategory` — function — line 163
- `ITEM_DEFS` — const — line 213
- `ITEM_SIZE_UNITS` — const — line 132
- `ItemCategory` — type — line 123
- `ItemDef` — type — line 145
- `ItemKind` — type — line 6
- `ItemSize` — type — line 128
- `itemSizeUnits` — function — line 141
- `primaryItemCategory` — function — line 170
- `REST_CANCEL_PROGRESS_THRESHOLD` — const — line 178
- `REST_CANCEL_VIGOR_THRESHOLD` — const — line 190
- `restCancelAllowedByStartVigor` — function — line 197

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
- `migrateLegacyWaterskinsToInstances` — function — line 128

## `items/primaryWeapons.ts`

- `createPrimaryWeaponSelection` — function — line 43
- `isPrimaryMeleeAssignment` — function — line 71
- `isPrimaryRangedAssignment` — function — line 77
- `PrimaryWeaponChoice` — type — line 6
- `PrimaryWeaponSelection` — type — line 13
- `SavePrimaryWeaponChoice` — type — line 8

## `items/sensibleFood.ts`

- `resolveSensibleFoodKind` — function — line 66
  - domain: ui-input

## `items/tentPlacement.ts`

- `evaluateGroundPlacement` — function — line 96
- `evaluateTentPlacement` — function — line 112
- `GroundPlacementInput` — type — line 15
- `GroundPlacementReason` — type — line 13
- `PLACEMENT_WATER_MARGIN` — const — line 48
- `TENT_PLACEMENT_MESSAGE` — const — line 129
- `TENT_SETUP_DURATION_SEC` — const — line 127
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

- `createAcquiredInstance` — function — line 137
- `InstanceSellResult` — type — line 28
- `OfferBuybackResolution` — type — line 32
- `previewTransactionNetCoins` — function — line 269
- `resolveOfferBuyback` — function — line 218
  - domain: settlements — merchant buyback for an entire offer basket plus the concrete instance ids settlement should remove for instance-backed kinds.
- `resolveOfferLineBuyback` — function — line 195
  - domain: settlements — deterministic merchant buyback for one offer row, using the same worst-condition instance selection that settlement will remove.
- `selectInstancesToSell` — function — line 153
- `selectInstanceToPlace` — function — line 168
- `sellInstancesForCoins` — function — line 312
- `settleTransaction` — function — line 282
- `TradeResult` — type — line 26

## `items/tradeCatalog.ts`

- `BASE_SELL_FACTOR` — const — line 179
  - domain: settlements — full-condition sell factor bounds (plan settlements-006).
- `BROKEN_SELL_MULTIPLIER` — const — line 281
- `canSell` — function — line 210
- `fullConditionSellFactor` — function — line 243
  - domain: settlements — sell factor for a full-condition item before durability scaling.
- `isMerchantStock` — function — line 194
- `MAX_SELL_FACTOR` — const — line 181
- `MERCHANT_PRICES` — const — line 13
- `MERCHANT_STOCK` — const — line 86
- `merchantPrice` — function — line 190
- `MIN_SELL_FACTOR` — const — line 180
- `NEUTRAL_SELL_PRICE_CONTEXT` — const — line 171
  - domain: settlements — neutral social standing for merchant sell pricing.
- `offerValue` — function — line 272
- `relationshipEffect` — function — line 219
  - domain: settlements — relation tier bonus in percentage points (0.01 = 1 pp).
- `reputationEffect` — function — line 232
  - domain: settlements — weighted reputation × renown amplification (percentage points).
- `resolveInstanceSellPrice` — function — line 284
  - domain: settlements — merchant buyback for a concrete item instance — price is derived, never stored.
- `roundSellPrice` — function — line 252
  - domain: settlements — deterministic integer coin rounding shared by stack and instance pricing.
- `sellPrice` — function — line 262
  - domain: settlements — merchant buyback for a stackable kind at full condition.
- `SellPriceContext` — type — line 183
- `tradeValue` — function — line 199

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
