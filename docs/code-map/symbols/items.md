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

- `ARROW_DAMAGE_BONUS` — const — line 1276
- `BookTier` — type — line 130
- `CAPABILITY_KINDS` — const — line 1307
- `CAPABILITY_NEED_LABEL` — const — line 109
- `ConsumableNeed` — type — line 121
- `consumeNeedNoun` — function — line 207
- `consumeVerbLabel` — function — line 198
- `DefenseConfig` — type — line 41
- `hasItemCapability` — function — line 1332
- `HOLDABLE_KINDS` — const — line 1298
- `isMeleeToolKind` — function — line 1291
- `isRangedTool` — function — line 1283
- `ITEM_CATALOG` — const — line 221
  - domain: items-player
  - system: item-catalog
  - role: Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
  - owns: ItemCatalogEntry
- `ITEM_SYSTEM_ROADMAP` — const — line 1337
- `ItemCapability` — type — line 88
- `ItemCatalogEntry` — type — line 132
- `ItemSpawnKind` — type — line 13
- `MeleeConfig` — type — line 24
- `NON_ITEM_PROPS` — const — line 1343
- `RangedConfig` — type — line 52

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

- `BROKEN_SELL_MULTIPLIER` — const — line 210
- `canSell` — function — line 188
- `isMerchantStock` — function — line 172
- `MERCHANT_PRICES` — const — line 11
- `MERCHANT_STOCK` — const — line 84
- `merchantPrice` — function — line 168
- `offerValue` — function — line 197
- `resolveInstanceSellPrice` — function — line 215
- `sellPrice` — function — line 192
- `SellPriceContext` — type — line 212
- `tradeValue` — function — line 177
- `USAGE_DISCOUNT_MIN` — const — line 206
- `USAGE_DISCOUNT_RANGE` — const — line 207

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
