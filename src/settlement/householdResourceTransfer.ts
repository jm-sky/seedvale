import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { Inventory } from '../items/Inventory'
import type { Household } from './household'
import { FOOD_ITEM_KINDS } from '../items/foodItems'
import { fuelValue } from '../items/itemFuel'
import { hasItemKindCategory, type ItemKind } from '../items/items'

/**
 * Actor-neutral source-inventory → household resource transfer (plan
 * settlements-npcs-032). Player delivery, NPC helpers and future gift flows
 * share this operation; no quest/UI/player types here.
 *
 * @domain settlements-npcs
 * @system household
 */

export const HOUSEHOLD_WOOD_ITEM_KINDS = ['branch', 'beam'] as const satisfies readonly ItemKind[]

export type HouseholdWoodItemKind = (typeof HOUSEHOLD_WOOD_ITEM_KINDS)[number]

/** Catalog-driven wood contribution per inventory item — only explicit
 *  household-wood kinds; fuel items like `cone` stay excluded. */
export function householdWoodValue(kind: ItemKind): number | null {
  if (kind !== 'branch' && kind !== 'beam') return null
  return fuelValue(kind)
}

export type HouseholdTransferRequest =
  | { resource: 'food', itemKind: ItemKind, amount: number }
  | { resource: 'wood', itemKind: ItemKind, amount: number }

export type HouseholdTransferResult =
  | {
      status: 'transferred'
      resource: 'food' | 'wood'
      itemKind: ItemKind
      sourceAmount: number
      resourceAmount: number
      storedInHousehold: number
      overflowedToSettlement: number
    }
  | { status: 'invalid_resource_item' }
  | { status: 'invalid_amount' }
  | { status: 'source_shortage' }

function isPositiveInteger(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && Math.floor(amount) === amount
}

/** Item kinds the player may offer from `source` in the household transfer UI. */
export function transferableHouseholdItemKinds(source: Inventory): ItemKind[] {
  const out: ItemKind[] = []
  for (const kind of FOOD_ITEM_KINDS) {
    if (source.count(kind) > 0) out.push(kind)
  }
  for (const kind of HOUSEHOLD_WOOD_ITEM_KINDS) {
    if (source.count(kind) > 0) out.push(kind)
  }
  return out
}

export function householdTransferSummary(household: Household): { food: number, wood: number, water: number } {
  return {
    food: household.foodCount(),
    wood: household.stock.query('wood'),
    water: household.water.current,
  }
}

/**
 * Moves food or supported wood items from `source` into `household`, using the
 * same capacity/overflow/history path as NPC deposits. Requires a live
 * settlement `economy` so overflow is never dropped on player transfer.
 */
export function transferResourceToHousehold(input: {
  source: Inventory
  household: Household
  economy: SettlementEconomy
  request: HouseholdTransferRequest
  nowDays: number
}): HouseholdTransferResult {
  const { source, household, economy, request, nowDays } = input
  const amount = request.amount
  if (!isPositiveInteger(amount)) return { status: 'invalid_amount' }

  if (request.resource === 'food') {
    if (!hasItemKindCategory(request.itemKind, 'food')) return { status: 'invalid_resource_item' }
    if (!source.has(request.itemKind, amount)) return { status: 'source_shortage' }
    const batches = source.removeWithFreshness(request.itemKind, amount, nowDays)
    if (batches == null) return { status: 'source_shortage' }
    const { storedInHousehold, overflowedToSettlement } = household.depositFood(
      request.itemKind,
      amount,
      economy,
      nowDays,
      batches.length > 0 ? batches : undefined,
    )
    return {
      status: 'transferred',
      resource: 'food',
      itemKind: request.itemKind,
      sourceAmount: amount,
      resourceAmount: amount,
      storedInHousehold,
      overflowedToSettlement,
    }
  }

  const woodPerItem = householdWoodValue(request.itemKind)
  if (woodPerItem == null) return { status: 'invalid_resource_item' }
  if (!source.has(request.itemKind, amount)) return { status: 'source_shortage' }
  if (!source.remove(request.itemKind, amount)) return { status: 'source_shortage' }
  const resourceAmount = woodPerItem * amount
  const { storedInHousehold, overflowedToSettlement } = household.deposit('wood', resourceAmount, economy, nowDays)
  return {
    status: 'transferred',
    resource: 'wood',
    itemKind: request.itemKind,
    sourceAmount: amount,
    resourceAmount,
    storedInHousehold,
    overflowedToSettlement,
  }
}
