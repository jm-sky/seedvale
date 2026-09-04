# Symbols

Generated from exported TypeScript symbols.

## `items/campBlanketProp.ts`

- `createCampBlanketProp` — function — line 9
- `disposeCampBlanketProp` — function — line 19

## `items/campfireCooking.ts`

- `COOK_DURATION_SEC` — const — line 33
- `COOKING_RECIPES` — const — line 15
- `CookingRecipe` — type — line 9
- `findCookingBatch` — function — line 59
- `findCookingRecipe` — function — line 36
- `resolveCookingCapacity` — function — line 48

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

## `items/createDroppedItems.ts`

- `createDroppedItems` — function — line 57
- `DroppedItem` — type — line 8
- `DroppedItems` — type — line 20

## `items/createItemSpawners.ts`

- `createItemSpawners` — function — line 117
- `ItemSpawners` — type — line 11

## `items/createPlacedTents.ts`

- `createPlacedTents` — function — line 24
- `PlacedTent` — type — line 6
- `PlacedTentEntry` — type — line 8
- `PlacedTents` — type — line 10

## `items/foodFreshness.ts`

- `bait` — function — line 47
- `BAIT_ITEM_PRIORITY` — const — line 58
- `canMergeFoodBatches` — function — line 43
- `FOOD_BATCH_MERGE_TOLERANCE_DAYS` — const — line 41
- `foodFreshnessDef` — function — line 12
- `FreshnessStage` — type — line 10
- `getFreshnessStage` — function — line 23
- `isBaitCapable` — function — line 51
- `isFoodPerishable` — function — line 19
- `isSpoiled` — function — line 32

## `items/foodItems.ts`

- `carryFoodClaim` — function — line 90
- `claimFoodItems` — function — line 52
- `deliverCarriedFoodClaim` — function — line 102
- `depositFoodItems` — function — line 73
- `FOOD_ITEM_KINDS` — const — line 18
- `FoodItemClaim` — type — line 45
- `foodItemCount` — function — line 24
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

- `DEFAULT_MAX_SIZE` — const — line 33
- `FoodBatch` — type — line 76
- `Inventory` — class — line 92
  - domain: items-player
  - system: inventory
  - role: Owns item ownership: stack counts, item instances and perishable food batches.
  - owns: FoodBatch
  - produces: SaveItemInstance
- `inventoryFullToastText` — function — line 482
- `ItemAmount` — type — line 38
- `SaveItemInstance` — type — line 40
- `toSaveItemInstance` — function — line 56

## `items/inventoryView.ts`

- `buildInventoryGroups` — function — line 111
- `inventoryCountsForUi` — function — line 135
- `InventoryGroupView` — type — line 26
- `InventoryInstanceRow` — type — line 16

## `items/itemCatalog.ts`

- `ARROW_DAMAGE_BONUS` — const — line 1060
- `CAPABILITY_KINDS` — const — line 1091
- `CAPABILITY_NEED_LABEL` — const — line 108
- `ConsumableNeed` — type — line 120
- `consumeNeedNoun` — function — line 189
- `consumeVerbLabel` — function — line 180
- `DefenseConfig` — type — line 40
- `hasItemCapability` — function — line 1116
- `HOLDABLE_KINDS` — const — line 1082
- `isMeleeToolKind` — function — line 1075
- `isRangedTool` — function — line 1067
- `ITEM_CATALOG` — const — line 203
  - domain: items-player
  - system: item-catalog
  - role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
  - owns: ItemCatalogEntry
- `ITEM_SYSTEM_ROADMAP` — const — line 1121
- `ItemCapability` — type — line 87
- `ItemCatalogEntry` — type — line 127
- `ItemSpawnKind` — type — line 12
- `MeleeConfig` — type — line 23
- `NON_ITEM_PROPS` — const — line 1127
- `RangedConfig` — type — line 51

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

- `cloneItemGlb` — function — line 134
- `ITEM_GLB_SPECS` — const — line 15
- `preloadItemGlbModels` — function — line 109

## `items/items.ts`

- `canCancelRestNow` — function — line 182
- `canCancelRestProgress` — function — line 153
- `createItemMesh` — function — line 966
- `hasItemCategory` — function — line 132
- `hasItemKindCategory` — function — line 136
- `ITEM_DEFS` — const — line 186
- `ITEM_SIZE_UNITS` — const — line 105
- `ItemCategory` — type — line 96
- `ItemDef` — type — line 118
- `ItemKind` — type — line 6
- `ItemSize` — type — line 101
- `itemSizeUnits` — function — line 114
- `primaryItemCategory` — function — line 143
- `REST_CANCEL_PROGRESS_THRESHOLD` — const — line 151
- `REST_CANCEL_VIGOR_THRESHOLD` — const — line 163
- `restCancelAllowedByStartVigor` — function — line 170

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

- `createPrimaryWeaponSelection` — function — line 36
- `PrimaryWeaponChoice` — type — line 6
- `PrimaryWeaponSelection` — type — line 16

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

- `isProcessComplete` — function — line 27
- `ItemStackInput` — type — line 11
- `ItemStackOutput` — type — line 12
- `processCompletedAtDays` — function — line 23
- `processProgress` — function — line 32
- `TimedProcess` — type — line 14
- `TimedProcessKind` — type — line 9

## `items/trade.ts`

- `createAcquiredInstance` — function — line 127
- `InstanceSellResult` — type — line 26
- `previewTransactionNetCoins` — function — line 234
- `selectInstancesToSell` — function — line 143
- `selectInstanceToPlace` — function — line 158
- `sellInstancesForCoins` — function — line 273
- `settleTransaction` — function — line 245
- `TradeResult` — type — line 24

## `items/tradeCatalog.ts`

- `BROKEN_SELL_MULTIPLIER` — const — line 169
- `canSell` — function — line 147
- `isMerchantStock` — function — line 131
- `MERCHANT_PRICES` — const — line 11
- `MERCHANT_STOCK` — const — line 62
- `merchantPrice` — function — line 127
- `offerValue` — function — line 156
- `resolveInstanceSellPrice` — function — line 174
- `sellPrice` — function — line 151
- `SellPriceContext` — type — line 171
- `tradeValue` — function — line 136
- `USAGE_DISCOUNT_MIN` — const — line 165
- `USAGE_DISCOUNT_RANGE` — const — line 166

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
