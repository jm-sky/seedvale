import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { TransportOrders } from './createTransportOrders'

/**
 * Inventory + TransportOrder transaction seam (plan settlements-npcs-018).
 *
 * Pickup and unload are each one domain transaction. Order lifecycle is
 * mutated only after the inventory transfer actually succeeds. Duplicate
 * callbacks against a committed state are no-ops with no inventory change.
 *
 * `TransportOrder` never stores freshness batches — those travel with the
 * inventories via `removeWithFreshness` / `addWithFreshness`.
 */

/** Moves `amount` of `kind` from `source` to `destination` with freshness
 *  intact. Checks destination capacity before removing from source; if add
 *  still fails, rolls the exact batches back onto source. */
export function transferInventoryItems(
  source: Inventory,
  destination: Inventory,
  kind: ItemKind,
  amount: number,
  nowDays = 0,
): boolean {
  if (amount <= 0) return false
  if (source.count(kind) < amount) return false
  if (!destination.canAdd(kind, amount)) return false
  const batches = source.removeWithFreshness(kind, amount, nowDays)
  if (!batches) return false
  if (destination.addWithFreshness(kind, amount, batches, nowDays)) return true
  source.addWithFreshness(kind, amount, batches, nowDays)
  return false
}

export type TransportPickupResult =
  | { ok: true, claimed: number }
  | { ok: false, claimed: 0, reason: 'rejected' | 'failed' | 'capacity' }

/**
 * `source → carrier` for an `assigned` order. `liveTransferableQuantity` is
 * the caller's live revalidation (surplus, kind count, request cap) — this
 * function never scans the world.
 *
 * Zero transferable quantity fails the order. Carrier capacity failure
 * leaves the order `assigned` so the same commitment can retry.
 */
export function executeTransportPickup(args: {
  orders: TransportOrders
  orderId: string
  carrierNpcId: string
  carrier: Inventory
  source: Inventory
  liveTransferableQuantity: number
  nowDays?: number
}): TransportPickupResult {
  const { orders, orderId, carrierNpcId, carrier, source, nowDays = 0 } = args
  const order = orders.find(orderId)
  if (!order || order.state !== 'assigned' || order.carrierNpcId !== carrierNpcId) {
    return { ok: false, claimed: 0, reason: 'rejected' }
  }
  if (order.claimedQuantity !== 0) return { ok: false, claimed: 0, reason: 'rejected' }

  const actual = Math.min(order.requestedQuantity, Math.max(0, Math.floor(args.liveTransferableQuantity)))
  if (actual <= 0) {
    orders.fail(orderId)
    return { ok: false, claimed: 0, reason: 'failed' }
  }
  if (!carrier.canAdd(order.itemKind, actual)) {
    return { ok: false, claimed: 0, reason: 'capacity' }
  }
  if (!transferInventoryItems(source, carrier, order.itemKind, actual, nowDays)) {
    return { ok: false, claimed: 0, reason: 'capacity' }
  }
  const committed = orders.completePickup(orderId, carrierNpcId, actual)
  if (!committed) {
    transferInventoryItems(carrier, source, order.itemKind, actual, nowDays)
    return { ok: false, claimed: 0, reason: 'rejected' }
  }
  return { ok: true, claimed: actual }
}

export type TransportUnloadResult =
  | { ok: true, delivered: number }
  | { ok: false, delivered: 0, reason: 'rejected' | 'destination' }

/**
 * `carrier → destination` for an `in-transit` order. Destination rejection
 * keeps cargo on the carrier and the order `in-transit`. Missing carrier
 * cargo is an invariant violation: no mint, no complete.
 */
export function executeTransportUnload(args: {
  orders: TransportOrders
  orderId: string
  carrierNpcId: string
  carrier: Inventory
  destination: Inventory
  nowDays?: number
}): TransportUnloadResult {
  const { orders, orderId, carrierNpcId, carrier, destination, nowDays = 0 } = args
  const order = orders.find(orderId)
  if (!order || order.state !== 'in-transit' || order.carrierNpcId !== carrierNpcId) {
    return { ok: false, delivered: 0, reason: 'rejected' }
  }
  if (!(order.claimedQuantity > 0) || order.deliveredQuantity !== 0) {
    return { ok: false, delivered: 0, reason: 'rejected' }
  }
  if (carrier.count(order.itemKind) < order.claimedQuantity) {
    return { ok: false, delivered: 0, reason: 'rejected' }
  }
  if (!destination.canAdd(order.itemKind, order.claimedQuantity)) {
    return { ok: false, delivered: 0, reason: 'destination' }
  }
  if (!transferInventoryItems(carrier, destination, order.itemKind, order.claimedQuantity, nowDays)) {
    return { ok: false, delivered: 0, reason: 'destination' }
  }
  const committed = orders.completeDelivery(orderId, carrierNpcId)
  if (!committed) {
    transferInventoryItems(destination, carrier, order.itemKind, order.claimedQuantity, nowDays)
    return { ok: false, delivered: 0, reason: 'rejected' }
  }
  return { ok: true, delivered: order.claimedQuantity }
}
