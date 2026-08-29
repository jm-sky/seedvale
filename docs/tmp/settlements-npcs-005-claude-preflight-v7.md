# SEEDVALE — IMPLEMENTATION PREFLIGHT

## Target
Plan: `docs/plans/settlements-npcs-005-local-resource-exchange.md`
Implementation notes: `docs/plans/implementation-notes/settlements-npcs-005-local-resource-exchange-implementation-notes.md`
HEAD: efffef9 | branch: main
Working tree: HAS CHANGES — preserve them

## Relevant files

- `docs/plans/README.md`
- `src/items/trade.ts`
- `docs/STATE.md`
- `src/economy/localExchange.ts`
- `src/settlement/householdExchange.ts`

## Dependencies

### `items/trade.ts` — src/items/trade.ts
- imports: `items/Inventory.ts`, `items/itemInstances.ts`, `items/items.ts`, `items/liquidContainer.ts`, `items/tradeCatalog.ts`, `items/trapItemInstances.ts`, +1 more
- imported by: `app/actions/groundActions.ts`, `app/actions/placementActions.ts`, `app/createApp.ts`, `app/gameLoop.ts`, `app/inventoryWiring.ts`, `items/trade.test.ts`, +3 more

### `claimHouseholdSurplus` — src/economy/localExchange.ts
- imports: `economy/kinds.ts`, `economy/settlementEconomy.ts`, `settlement/household.ts`
- imported by: `economy/index.ts`, `economy/localExchange.test.ts`

### `HouseholdExchangeHooks` — src/settlement/householdExchange.ts
- imports: `settlement/household.ts`
- imported by: `ai/NpcAgent.ts`, `settlement/createSettlement.ts`, `settlement/householdExchange.test.ts`

## Implementation anchors

### `HouseholdExchangeHooks` — src/settlement/householdExchange.ts:55
```ts
export type HouseholdExchangeHooks = {
  findSurplusSource: (
    excludeHouseholdId: HouseholdId,
    kind: HouseholdResourceKind,
    near: { x: number, z: number },
  ) => HouseholdSurplusCandidate | null
}

```

### `createHouseholdExchangeHooks` — src/settlement/householdExchange.ts:67
```ts
export function createHouseholdExchangeHooks(candidates: readonly HouseholdSurplusCandidate[]): HouseholdExchangeHooks {
  return {
    findSurplusSource: (excludeHouseholdId, kind, near) =>
      selectHouseholdSurplusSource(candidates, excludeHouseholdId, kind, near),
  }
}

```

### `claimHouseholdSurplus` — src/economy/localExchange.ts:24
```ts
export function claimHouseholdSurplus(household: Household, kind: HouseholdResourceKind, amount: number): number {
  const available = Math.min(household.surplus(kind), amount)
  if (available <= 0) return 0
  return household.stock.remove(kind, available) ? available : 0
}

/** Claims up to `amount` from a settlement economy's current surplus of
 *  `kind` — mirrors `claimHouseholdSurplus` for the village-storage side of
```

## Limited text-search fallback

- `SettlementEconomy`
  - src/ai/NpcAgent.ts:48:  type SettlementEconomy,
  - src/ai/NpcAgent.ts:640:function depositWoodHarvest(household: Household | null, economy: SettlementEconomy | null, amount: number): void {
  - src/ai/NpcAgent.ts:655:function depositFoodHarvest(household: Household | null, economy: SettlementEconomy | null): void {
- `EconomicKind`
  - src/app/worldBundle.ts:5:import type { EconomicKind } from '../economy/kinds'
  - src/app/worldBundle.ts:204:  initialEconomies?: Record<string, Partial<Record<EconomicKind, number>>>,
  - src/app/worldBundle.ts:408:  economies?: Record<string, Partial<Record<EconomicKind, number>>>
- `Household`
  - src/ai/Needs.ts:9:  /** Household water-fetching chore (plan 122) — mirrors `woodDuty`: a
  - src/ai/Needs.ts:60:  /** Household water reserve below target — same light bias as `woodShortage`. */
  - src/ai/NpcAgent.ts:11:import type { Household, HouseholdResourceKind } from '../settlement/household'
- `Inventory`
  - src/ai/NpcAgent.ts:52:import { Inventory } from '../items/Inventory'
  - src/ai/NpcAgent.ts:667:function depositCarriedItems(carried: Inventory, household: Household, kinds: readonly ItemKind[]): void {
  - src/ai/NpcAgent.ts:681:export function findWeaponNeedingMaintenance(inventory: Inventory): WeaponItemInstance | null {

## Rules
Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.
