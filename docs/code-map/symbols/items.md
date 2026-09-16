# Symbols

Generated from exported TypeScript symbols.

## `items/armorItemInstances.ts`

- `applyArmorPenaltyQuality` — function — line 72
  - domain: items-player
- `createArmorInstance` — function — line 34
  - domain: items-player
- `EffectiveArmorPiece` — type — line 81
  - domain: items-player
- `effectiveInstanceWeight` — function — line 126
  - domain: items-player
- `migrateArmorCountsToInstances` — function — line 141
  - domain: items-player
- `resolveEffectiveArmorPiece` — function — line 97
  - domain: items-player

## `items/authoredWorldPickups.ts`

- `buildAuthoredOneTimePickups` — function — line 12
  - domain: quests-progression

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
- `CONTAINER_PLACE_REACH` — const — line 81
- `CONTAINER_PLACEMENT_MESSAGE` — const — line 64
- `CONTAINER_SETUP_DURATION_SEC` — const — line 84
- `ContainerDef` — type — line 24
- `ContainerKind` — type — line 22
- `ContainerPlacementReason` — type — line 62
- `containerTotalWeight` — function — line 75

## `items/cookingFireResolver.ts`

- `CookingFireRef` — type — line 7
- `NearbyCookingFire` — type — line 11
- `resolveCookingFireByRef` — function — line 81
- `resolveNearbyCookingFire` — function — line 35
  - domain: ui-input
- `resolvePlacedFireById` — function — line 92

## `items/createDroppedItems.ts`

- `createDroppedItems` — function — line 76
- `DroppedItem` — type — line 13
- `DroppedItems` — type — line 27

## `items/createItemSpawners.ts`

- `CollectedSpawnerItem` — type — line 12
- `createItemSpawners` — function — line 141
- `ItemSpawners` — type — line 20
- `OneTimeWorldItemPickup` — type — line 126

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

## `items/equipment.ts`

- `composeEquipmentModifiers` — function — line 228
  - domain: items-player
- `createEquipmentState` — function — line 104
- `EQUIPMENT_SLOT_LABEL` — const — line 27
- `EQUIPMENT_SLOTS` — const — line 17
- `EquipmentModifiers` — type — line 43
- `EquipmentSlot` — type — line 15
- `EquipmentState` — type — line 70
  - domain: items-player
  - system: equipment
  - role: Tracks which owned armor instance (if any) is worn in each equipment slot.
  - uses: Inventory
- `equippedArmorInstances` — function — line 179
- `equippedBodyArmor` — function — line 195
- `equippedInstanceId` — function — line 201
- `equippedInstanceIds` — function — line 210
- `isEquipmentSlot` — function — line 80
- `NEUTRAL_EQUIPMENT_MODIFIERS` — const — line 53
- `resolveArmorInstanceEffective` — function — line 272
- `resolveEquipmentModifiers` — function — line 262
  - domain: items-player
- `SavePlayerEquipment` — type — line 37

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

- `BRANCH_HELD_ATTACH` — const — line 206
- `createHeldToolObject` — function — line 310
- `findRightHandSocket` — function — line 282
- `findUbcLeftHandSocket` — function — line 287
- `HELD_ATTACH` — const — line 45
- `HELD_GLB` — const — line 215
- `HeldAttach` — type — line 18
- `HeldMountContext` — type — line 268
- `mountAttachOnSocket` — function — line 384
- `mountHeldToolOnSocket` — function — line 338
- `preloadHeldToolModels` — function — line 291

## `items/Inventory.ts`

- `DEFAULT_MAX_SIZE` — const — line 65
- `EMPTY_INVENTORY_CONTENTS` — const — line 135
- `Inventory` — class — line 154
  - domain: items-player
  - system: inventory
  - role: Owns item ownership: stack counts, item instances and perishable food batches.
  - owns: FoodBatch
  - produces: SaveItemInstance
- `InventoryContentsSnapshot` — type — line 129
- `inventoryFromContents` — function — line 713
- `inventoryFullToastText` — function — line 732
- `ItemAmount` — type — line 70
- `SaveItemInstance` — type — line 84
- `snapshotInventoryContents` — function — line 703
- `toSaveItemInstance` — function — line 104

## `items/inventoryItemReadAction.ts`

- `inventoryItemReadAction` — function — line 15
  - domain: items-player
- `InventoryItemReadAction` — type — line 4

## `items/inventoryTransfer.ts`

- `transferAllInventoryContents` — function — line 69
- `transferInventoryCount` — function — line 19
  - domain: items-player
  - system: inventory
- `transferInventoryInstance` — function — line 40

## `items/inventoryView.ts`

- `buildInventoryGroups` — function — line 259
- `inventoryCountsForUi` — function — line 296
- `InventoryGroupView` — type — line 68
- `InventoryInstanceRow` — type — line 46
- `ITEM_METER_LABEL` — const — line 40
- `ItemMeterKind` — type — line 35

## `items/itemCatalog.ts`

- `ArmorConfig` — type — line 56
- `ARROW_DAMAGE_BONUS` — const — line 1733
- `BookTier` — type — line 179
- `CAPABILITY_KINDS` — const — line 1776
- `CAPABILITY_LABEL` — const — line 155
- `CAPABILITY_NEED_LABEL` — const — line 139
- `CONSUMABLE_KINDS_BY_NEED` — const — line 1816
- `ConsumableNeed` — type — line 170
- `consumeNeedNoun` — function — line 288
- `consumeVerbLabel` — function — line 279
- `DefenseConfig` — type — line 42
- `hasItemCapability` — function — line 1801
- `HOLDABLE_KINDS` — const — line 1767
- `INJURY_TREATMENT_KINDS` — const — line 1838
- `isArmorCatalogKind` — function — line 1754
- `isBodyArmorKind` — function — line 1760
- `isMeleeToolKind` — function — line 1748
- `isRangedTool` — function — line 1740
- `ITEM_CATALOG` — const — line 302
  - domain: items-player
  - system: item-catalog
  - role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
  - owns: ItemCatalogEntry
- `ITEM_SYSTEM_ROADMAP` — const — line 1859
- `ItemCapability` — type — line 112
- `ItemCatalogEntry` — type — line 181
- `itemIsResilient` — function — line 1806
- `ItemSpawnKind` — type — line 14
- `itemTreatsPhysicalInjury` — function — line 1851
- `MeleeConfig` — type — line 25
- `NON_ITEM_PROPS` — const — line 1865
- `RangedConfig` — type — line 76

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

- `ARMOR_KIND_LIST` — const — line 27
- `ARMOR_KINDS` — const — line 36
- `ARMOR_QUALITIES` — const — line 40
- `ARMOR_QUALITY_LABELS` — const — line 42
- `ARMOR_QUALITY_RANK` — const — line 50
- `ArmorItemInstance` — type — line 57
- `ArmorKind` — type — line 19
- `ArmorQuality` — type — line 38
- `clamp01` — function — line 251
- `clampCampCondition` — function — line 188
- `cloneItemInstance` — function — line 256
- `createItemInstanceId` — function — line 204
- `createKeyInstance` — function — line 235
- `createTentInstance` — function — line 193
- `IDENTITY_ONLY_ITEM_KINDS` — const — line 211
- `INSTANCE_BACKED_KINDS` — const — line 222
- `isArmorItemInstance` — function — line 74
- `isArmorKind` — function — line 62
- `isArmorQuality` — function — line 66
- `isInstanceBackedKind` — function — line 239
- `isLiquidContainerInstance` — function — line 172
- `isLiquidContainerKind` — function — line 146
- `isTentItemInstance` — function — line 183
- `isTrapItemInstance` — function — line 247
- `isTrapKind` — function — line 243
- `isWeaponItemInstance` — function — line 159
- `isWeaponMaintenanceKind` — function — line 119
- `ItemInstance` — type — line 4
- `LIQUID_CONTAINER_KIND_LIST` — const — line 136
- `LIQUID_CONTAINER_KINDS` — const — line 144
- `LiquidContainerItemInstance` — type — line 166
- `LiquidContainerKind` — type — line 129
- `LiquidContent` — type — line 124
- `normalizeArmorQuality` — function — line 70
- `TentItemInstance` — type — line 178
- `TrapItemInstance` — type — line 11
- `TrapKind` — type — line 9
- `WEAPON_MAINTENANCE_KIND_LIST` — const — line 101
- `WEAPON_MAINTENANCE_KINDS` — const — line 117
- `WeaponItemInstance` — type — line 153
- `WeaponMaintenanceKind` — type — line 83

## `items/itemModels.ts`

- `cloneItemGlb` — function — line 189
- `ITEM_GLB_SPECS` — const — line 15
- `preloadItemGlbModels` — function — line 164

## `items/items.ts`

- `canCancelRestNow` — function — line 257
- `canCancelRestProgress` — function — line 228
- `createItemMesh` — function — line 1533
- `hasItemCategory` — function — line 205
- `hasItemKindCategory` — function — line 209
- `ITEM_DEFS` — const — line 261
- `ITEM_SIZE_UNITS` — const — line 178
- `ItemCategory` — type — line 169
- `ItemDef` — type — line 191
- `ItemKind` — type — line 6
- `ItemSize` — type — line 174
- `itemSizeUnits` — function — line 187
- `primaryItemCategory` — function — line 218
- `REST_CANCEL_PROGRESS_THRESHOLD` — const — line 226
- `REST_CANCEL_VIGOR_THRESHOLD` — const — line 238
- `restCancelAllowedByStartVigor` — function — line 245
- `tintBucketGlb` — function — line 1557

## `items/ItemSpawner.ts`

- `ItemSpawnPoint` — type — line 3
- `updateItemSpawnPoints` — function — line 19

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

- `createAcquiredInstance` — function — line 196
- `InstanceSellResult` — type — line 36
- `OfferBuybackResolution` — type — line 40
- `OwnedGoodsPurchaseLine` — type — line 538
- `previewPricedPurchaseNetCoins` — function — line 358
- `previewTransactionNetCoins` — function — line 342
- `resolveOfferBuyback` — function — line 291
  - domain: settlements — merchant buyback for an entire offer basket plus the concrete instance ids settlement should remove for instance-backed kinds.
- `resolveOfferLineBuyback` — function — line 268
  - domain: settlements — deterministic merchant buyback for one offer row, using the same worst-condition instance selection that settlement will remove.
- `selectInstancesToSell` — function — line 226
- `selectInstanceToPlace` — function — line 241
- `sellInstancesForCoins` — function — line 641
- `settleMerchantStockTransaction` — function — line 485
- `settleOwnedGoodsPurchase` — function — line 562
  - domain: settlements-npcs
- `settlePricedPurchase` — function — line 371
- `settleTransaction` — function — line 399
- `TradeResult` — type — line 34

## `items/tradeCatalog.ts`

- `armorQualityValueMultiplier` — function — line 262
  - domain: items-player
- `BASE_BUY_FACTOR` — const — line 241
  - domain: settlements — full-condition buy-from-NPC factor bounds (plan settlements-npcs-033) — a markup over `tradeValue` the player pays an ordinary NPC. `MIN_BUY_FACTOR` intentionally equals `MAX_SELL_FACTOR` so the best possible buy price never undercuts the best possible merchant buyback for the same nominal value — no standing can create a buy→sell(merchant) arbitrage loop.
- `BASE_SELL_FACTOR` — const — line 231
  - domain: settlements — full-condition sell factor bounds (plan settlements-006).
- `BROKEN_SELL_MULTIPLIER` — const — line 435
- `canSell` — function — line 333
- `fullConditionBuyFactor` — function — line 405
  - domain: settlements — social buy factor for player purchases from an ordinary NPC (plan settlements-npcs-033) — reuses the exact same `relationshipEffect`/`reputationEffect` inputs as merchant sell pricing, but *subtracted* rather than added: better relation/reputation must never raise what the player pays, worse standing must never lower it.
- `fullConditionSellFactor` — function — line 366
  - domain: settlements — sell factor for a full-condition item before durability scaling.
- `instanceNominalValue` — function — line 281
  - domain: items-player
- `isMerchantStock` — function — line 317
- `MAX_BUY_FACTOR` — const — line 243
- `MAX_SELL_FACTOR` — const — line 233
- `MERCHANT_PRICES` — const — line 21
- `MERCHANT_STOCK` — const — line 108
- `merchantInstancePrice` — function — line 293
  - domain: items-player
- `merchantPrice` — function — line 252
- `MIN_BUY_FACTOR` — const — line 242
- `MIN_SELL_FACTOR` — const — line 232
- `NEUTRAL_SELL_PRICE_CONTEXT` — const — line 223
  - domain: settlements — neutral social standing for merchant sell pricing.
- `npcInstanceSalePrice` — function — line 306
  - domain: items-player
- `npcSalePrice` — function — line 418
  - domain: settlements — player-buys-from-NPC unit price in coins for one ordinary trade-eligible good (plan settlements-npcs-033 §5/§6). Base value reuses the same catalog as merchant stock (`merchantPrice`, falling back to `tradeValue` for kinds the merchant doesn't stock) so no profession/dialogue code hardcodes its own price.
- `offerValue` — function — line 426
- `relationshipEffect` — function — line 342
  - domain: settlements — relation tier bonus in percentage points (0.01 = 1 pp).
- `reputationEffect` — function — line 355
  - domain: settlements — weighted reputation × renown amplification (percentage points).
- `resolveInstanceSellPrice` — function — line 438
  - domain: settlements — merchant buyback for a concrete item instance — price is derived, never stored.
- `roundSellPrice` — function — line 375
  - domain: settlements — deterministic integer coin rounding shared by stack and instance pricing.
- `sellPrice` — function — line 390
  - domain: settlements — merchant buyback for a stackable kind at full condition.
- `SellPriceContext` — type — line 245
- `tradeValue` — function — line 322

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

- `applySharpnessWear` — function — line 110
- `createWeaponInstance` — function — line 94
- `getSharpnessDamageModifier` — function — line 80
- `getWeaponMaintenanceProfile` — function — line 65
- `listOwnedWeaponMaintenance` — function — line 29
- `migrateWeaponCountsToInstances` — function — line 149
- `OwnedWeaponMaintenance` — type — line 20
- `SharpenResult` — type — line 121
- `SharpenSource` — type — line 18
- `sharpenWeapon` — function — line 127
- `weaponDurabilityPercent` — function — line 99
- `WeaponMaintenanceProfile` — type — line 49
- `weaponSharpnessPercent` — function — line 103
