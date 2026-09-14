# Symbols

Generated from exported TypeScript symbols.

## `economy/development.ts`

- `DevelopmentDef` — type — line 5
- `DevelopmentStatus` — type — line 3
- `WOODSHED_DEVELOPMENT` — const — line 14

## `economy/foodTransportDemand.ts`

- `committedIncomingFood` — function — line 26
- `committedOutgoingFood` — function — line 47
- `uncommittedHouseholdFoodSurplus` — function — line 76
- `uncoveredSettlementFoodShortage` — function — line 68

## `economy/initial.ts`

- `demandsFor` — function — line 77
- `initialFoodFor` — function — line 68
- `initialStockFor` — function — line 50
- `SettlementEconomySeed` — type — line 8

## `economy/kinds.ts`

- `ECONOMIC_KINDS` — const — line 15
- `EconomicKind` — type — line 13
- `isEconomicKind` — function — line 17

## `economy/localExchange.ts`

- `claimEconomySurplus` — function — line 34
- `claimHouseholdSurplus` — function — line 24

## `economy/npcWork.ts`

- `commitBlacksmithProduction` — function — line 56
  - domain: settlements-npcs
- `commitDressingProduction` — function — line 101
  - domain: settlements-npcs
- `commitHunterArrowProduction` — function — line 46
- `commitRoleWork` — function — line 32
- `commitTextileWorkProduction` — function — line 92
  - domain: settlements-npcs
- `commitWoodcutterDeposit` — function — line 21
- `commitWoolMaterialProduction` — function — line 79
  - domain: settlements-npcs
- `tryAdvanceDevelopment` — function — line 109

## `economy/oreTransportDemand.ts`

- `committedIncomingOre` — function — line 40
- `committedOutgoingOre` — function — line 60
- `creditDeliveredOreToStock` — function — line 126
  - domain: settlements-npcs
- `isOreTransportKind` — function — line 25
- `ORE_TRANSPORT_KINDS` — const — line 19
  - domain: settlements-npcs
- `ORE_TRANSPORT_MAX_TRANSFER` — const — line 23
- `OreTransportKind` — type — line 20
- `uncommittedResourceSiteOre` — function — line 96
- `uncoveredOreProductionNeed` — function — line 80

## `economy/production.ts`

- `ARROWS_FROM_BEAM_PRODUCTION` — const — line 75
- `ARROWS_FROM_BRANCH_PRODUCTION` — const — line 66
- `BLACKSMITH_IRON_ROD_PRODUCTION` — const — line 143
  - domain: settlements-npcs
- `DRESSING_PRODUCTION` — const — line 152
- `FARMING_PRODUCTION` — const — line 36
- `FISHING_PRODUCTION` — const — line 43
- `FLAX_LINEN_PRODUCTION` — const — line 109
- `HUNTER_ARROW_PRODUCTIONS` — const — line 85
- `LINEN_BANDAGE_PRODUCTION` — const — line 119
- `MINING_PRODUCTION` — const — line 50
- `produceFirstAvailableItemRecipe` — function — line 166
- `ProductionDef` — type — line 10
- `productionDefById` — function — line 205
- `productionForRole` — function — line 184
- `TEXTILE_WORKER_PRODUCTIONS` — const — line 129
- `WOODCUTTING_PRODUCTION` — const — line 25
- `WOOL_MATERIAL_PRODUCTION` — const — line 99
  - domain: settlements-npcs

## `economy/productionExecutor.ts`

- `executeProduction` — function — line 122
  - domain: settlements-npcs
- `preflightProductionInputs` — function — line 62
  - domain: settlements-npcs
- `ProductionBlockedCategory` — type — line 23
- `ProductionContext` — type — line 14
  - domain: settlements-npcs
- `ProductionFailureReason` — type — line 25
- `ProductionResult` — type — line 37
  - domain: settlements-npcs

## `economy/productionShortage.ts`

- `applyProductionOutcome` — function — line 91
  - domain: settlements-npcs
- `clearProductionShortageByRecipe` — function — line 73
- `isProductionShortagePersistent` — function — line 41
- `loadProductionShortages` — function — line 182
- `observeProductionShortage` — function — line 53
  - domain: settlements-npcs
- `PRODUCTION_SHORTAGE_PERSISTENCE_SEC` — const — line 30
- `productionShortageKey` — function — line 32
- `ProductionShortageRecord` — type — line 19
  - domain: settlements-npcs
- `ProductionShortageRevalidateContext` — type — line 111
- `revalidateProductionShortages` — function — line 124
  - domain: settlements-npcs
- `snapshotProductionShortages` — function — line 176

## `economy/registry.ts`

- `createEconomyRegistry` — function — line 19
- `EconomyRegistry` — type — line 9

## `economy/settlementEconomy.ts`

- `createSettlementEconomy` — function — line 104
- `SettlementDemand` — type — line 21
- `SettlementEconomy` — type — line 56
  - domain: settlements
  - system: settlement-economy
  - role: Owns a settlement's bulk stock, demand-driven shortage/surplus and reservations. Not player `Inventory`.
  - owns: SettlementEconomy
- `SettlementEconomySnapshot` — type — line 39

## `economy/stock.ts`

- `EconomicStock` — class — line 12
- `StockAmount` — type — line 3
