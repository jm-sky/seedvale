import type { ItemKind } from '../items/items'
import type { Household, HouseholdId } from '../settlement/household'
import type { SettlementEconomy } from './settlementEconomy'
import { hasItemKindCategory } from '../items/items'
import { isTransportOrderActive, type TransportOrder } from '../world/transportOrder'

/**
 * Derived settlement-food transport accounting (plan settlements-npcs-020).
 *
 * Uncovered destination demand and uncommitted source supply are computed
 * from live `SettlementEconomy` / `Household` state plus active
 * `TransportOrder` records. This is not a registry, not a reservation
 * store, and not persisted — after reload the same numbers recompute from
 * economy + households + orders.
 *
 * @domain settlements-npcs
 */

function isFoodOrder(order: TransportOrder): boolean {
  return hasItemKindCategory(order.itemKind, 'food')
}

/** Quantity still expected to arrive at `settlementId` as food. Pre-pickup
 *  orders count `requestedQuantity`; in-transit orders count the live
 *  `claimedQuantity`. Terminal orders contribute nothing. */
export function committedIncomingFood(
  orders: readonly TransportOrder[],
  settlementId: string,
): number {
  let total = 0
  for (const order of orders) {
    if (!isTransportOrderActive(order.state)) continue
    if (order.destination.type !== 'settlement-storage') continue
    if (order.destination.settlementId !== settlementId) continue
    if (!isFoodOrder(order)) continue
    total += order.state === 'in-transit' ? order.claimedQuantity : order.requestedQuantity
  }
  return total
}

/** Quantity still reserved for pickup from `householdId`. Only `pending` /
 *  `assigned` food orders count — after pickup the goods have left the
 *  household, so live `surplus()` already reflects them. `excludeOrderId`
 *  skips the caller's own commitment (pickup revalidation of that order).
 *  `itemKind` narrows to one concrete food kind so two orders cannot
 *  double-promise the same stack. */
export function committedOutgoingFood(
  orders: readonly TransportOrder[],
  householdId: HouseholdId,
  excludeOrderId?: string,
  itemKind?: ItemKind,
): number {
  let total = 0
  for (const order of orders) {
    if (excludeOrderId && order.id === excludeOrderId) continue
    if (order.state !== 'pending' && order.state !== 'assigned') continue
    if (order.source.type !== 'household') continue
    if (order.source.householdId !== householdId) continue
    if (!isFoodOrder(order)) continue
    if (itemKind && order.itemKind !== itemKind) continue
    total += order.requestedQuantity
  }
  return total
}

/** `max(0, currentShortage - incoming food still committed toward this
 *  settlement)`. `<= 0` means no further `TransportOrder` should be created. */
export function uncoveredSettlementFoodShortage(
  economy: SettlementEconomy,
  orders: readonly TransportOrder[],
): number {
  return Math.max(0, economy.shortage('food') - committedIncomingFood(orders, economy.settlementId))
}

/** `max(0, currentSurplus - pre-pickup outgoing food from this household)`. */
export function uncommittedHouseholdFoodSurplus(
  household: Household,
  orders: readonly TransportOrder[],
  excludeOrderId?: string,
): number {
  return Math.max(0, household.surplus('food') - committedOutgoingFood(orders, household.id, excludeOrderId))
}
