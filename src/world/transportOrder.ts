import type { ItemKind } from '../items/items'
import type { HouseholdId } from '../settlement/household'

/**
 * Physical goods transport commitment (plan settlements-npcs-018).
 *
 * A `TransportOrder` is the authoritative record of a transport obligation —
 * what, from where, to where, by whom, how much, and which stage. It is never
 * a cargo owner. Real goods stay in existing inventories:
 *
 * ```
 * before pickup:  source owns goods
 * after pickup:   carrier owns goods (`NpcAgent.carried`)
 * after unload:   destination owns goods
 * ```
 *
 * Pure domain record: no `THREE`, no runtime object refs. World-owned
 * registry lives in `createTransportOrders.ts`. 018 does not persist
 * in-transit orders — `NpcAgent.carried` is still transient.
 *
 * @domain settlements-npcs
 */

export type TransportOrderState =
  | 'pending'
  | 'assigned'
  | 'in-transit'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** First-slice endpoints. Position is a projection resolved from landmarks,
 *  never part of endpoint identity. */
export type TransportEndpointRef =
  | {
      type: 'household'
      householdId: HouseholdId
    }
  | {
      type: 'settlement-storage'
      settlementId: string
    }

export type TransportOrder = {
  id: string
  source: TransportEndpointRef
  destination: TransportEndpointRef
  itemKind: ItemKind
  /** Immutable after creation. */
  requestedQuantity: number
  /** Set exactly once on successful pickup. */
  claimedQuantity: number
  /** Set exactly once on successful unload. */
  deliveredQuantity: number
  carrierNpcId: string | null
  state: TransportOrderState
}

const TERMINAL_STATES: ReadonlySet<TransportOrderState> = new Set([
  'cancelled',
  'completed',
  'failed',
])

const ACTIVE_STATES: ReadonlySet<TransportOrderState> = new Set([
  'assigned',
  'in-transit',
  'pending',
])

export function isTransportOrderTerminal(state: TransportOrderState): boolean {
  return TERMINAL_STATES.has(state)
}

export function isTransportOrderActive(state: TransportOrderState): boolean {
  return ACTIVE_STATES.has(state)
}

export function createTransportOrderRecord(params: {
  id: string
  source: TransportEndpointRef
  destination: TransportEndpointRef
  itemKind: ItemKind
  requestedQuantity: number
}): TransportOrder {
  return {
    id: params.id,
    source: params.source,
    destination: params.destination,
    itemKind: params.itemKind,
    requestedQuantity: Math.max(0, Math.floor(params.requestedQuantity)),
    claimedQuantity: 0,
    deliveredQuantity: 0,
    carrierNpcId: null,
    state: 'pending',
  }
}

/** `pending` → `assigned` with exactly one carrier. */
export function assignTransportOrder(
  order: TransportOrder,
  carrierNpcId: string,
): TransportOrder | null {
  if (order.state !== 'pending') return null
  if (order.carrierNpcId != null) return null
  if (order.claimedQuantity !== 0 || order.deliveredQuantity !== 0) return null
  if (!carrierNpcId) return null
  return { ...order, state: 'assigned', carrierNpcId }
}

/** `assigned` → `in-transit` after the carrier actually took `claimedQuantity`. */
export function completeTransportPickup(
  order: TransportOrder,
  carrierNpcId: string,
  claimedQuantity: number,
): TransportOrder | null {
  if (order.state !== 'assigned') return null
  if (order.carrierNpcId !== carrierNpcId) return null
  if (order.claimedQuantity !== 0 || order.deliveredQuantity !== 0) return null
  if (!(claimedQuantity > 0) || claimedQuantity > order.requestedQuantity) return null
  return {
    ...order,
    state: 'in-transit',
    claimedQuantity,
  }
}

/** `in-transit` → `completed` after destination accepted the claimed cargo. */
export function completeTransportDelivery(
  order: TransportOrder,
  carrierNpcId: string,
): TransportOrder | null {
  if (order.state !== 'in-transit') return null
  if (order.carrierNpcId !== carrierNpcId) return null
  if (!(order.claimedQuantity > 0) || order.deliveredQuantity !== 0) return null
  return {
    ...order,
    state: 'completed',
    deliveredQuantity: order.claimedQuantity,
  }
}

/** Terminal pre-pickup failure — source missing or live claim is zero.
 *  Rejected after pickup so in-transit cargo cannot be orphaned. */
export function failTransportOrder(order: TransportOrder): TransportOrder | null {
  if (order.state !== 'pending' && order.state !== 'assigned') return null
  if (order.claimedQuantity !== 0 || order.deliveredQuantity !== 0) return null
  return { ...order, state: 'failed' }
}

/** Conscious withdrawal before cargo changes owner. Clears assignment. */
export function cancelTransportOrder(order: TransportOrder): TransportOrder | null {
  if (order.state !== 'pending' && order.state !== 'assigned') return null
  if (order.claimedQuantity !== 0 || order.deliveredQuantity !== 0) return null
  return { ...order, state: 'cancelled', carrierNpcId: null }
}
