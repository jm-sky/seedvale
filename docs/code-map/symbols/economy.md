# Symbols

Generated from exported TypeScript symbols.

## `economy/development.ts`

- `DevelopmentDef` — type — line 5
- `DevelopmentStatus` — type — line 3
- `WOODSHED_DEVELOPMENT` — const — line 14

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

- `claimEconomySurplus` — function — line 33
- `claimHouseholdSurplus` — function — line 24

## `economy/npcWork.ts`

- `commitHunterArrowProduction` — function — line 43
- `commitRoleWork` — function — line 29
- `commitWoodcutterDeposit` — function — line 18
- `commitWoolMaterialProduction` — function — line 56
  - domain: settlements-npcs
- `tryAdvanceDevelopment` — function — line 64

## `economy/production.ts`

- `ARROWS_FROM_BEAM_PRODUCTION` — const — line 75
- `ARROWS_FROM_BRANCH_PRODUCTION` — const — line 66
- `FARMING_PRODUCTION` — const — line 36
- `FISHING_PRODUCTION` — const — line 43
- `HUNTER_ARROW_PRODUCTIONS` — const — line 85
- `MINING_PRODUCTION` — const — line 50
- `produceFirstAvailableItemRecipe` — function — line 113
- `ProductionDef` — type — line 10
- `productionForRole` — function — line 131
- `WOODCUTTING_PRODUCTION` — const — line 25
- `WOOL_MATERIAL_PRODUCTION` — const — line 99
  - domain: settlements-npcs

## `economy/productionExecutor.ts`

- `executeProduction` — function — line 64
  - domain: settlements-npcs
- `ProductionBlockedCategory` — type — line 23
- `ProductionContext` — type — line 14
  - domain: settlements-npcs
- `ProductionFailureReason` — type — line 25
- `ProductionResult` — type — line 37
  - domain: settlements-npcs

## `economy/registry.ts`

- `createEconomyRegistry` — function — line 19
- `EconomyRegistry` — type — line 9

## `economy/settlementEconomy.ts`

- `createSettlementEconomy` — function — line 92
- `SettlementDemand` — type — line 14
- `SettlementEconomy` — type — line 47
  - domain: settlements
  - system: settlement-economy
  - role: Owns a settlement's bulk stock, demand-driven shortage/surplus and reservations. Not player `Inventory`.
  - owns: SettlementEconomy
- `SettlementEconomySnapshot` — type — line 32

## `economy/stock.ts`

- `EconomicStock` — class — line 12
- `StockAmount` — type — line 3
