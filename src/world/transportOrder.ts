import type { ItemKind } from '../items/items'
import type { HouseholdId } from '../settlement/household'

/**
 * Physical goods transport commitment (plan settlements-npcs-018, persistent
 * & off-screen execution added by settlements-npcs-019).
 *
 * A `TransportOrder` is the authoritative record of a transport obligation —
 * what, from where, to where, by whom, how much, and which stage. It is never
 * a cargo owner. Real goods stay in existing inventories:
 *
 * ```
 * before pickup:  source owns goods
 * after pickup:   carrier owns goods (`NpcAuthoritativeState.transportCargo`)
 * after unload:   destination owns goods
 * ```
 *
 * Pure domain record: no `THREE`, no runtime object refs. World-owned
 * registry lives in `createTransportOrders.ts`. Active/non-terminal orders
 * persist as `SaveData.transportOrders` and carry across an in-session
 * `WorldBundle` rebuild; cargo itself persists separately, on the carrier's
 * own `NpcAuthoritativeState.transportCargo` (`settlement/npcState.ts`) —
 * never reconstructed from this record's quantities.
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

/** Off-screen execution metadata (plan settlements-npcs-019) — set only once
 *  an `in-transit` order's carrier stops being a live, detailed `NpcAgent`
 *  (settlement stream-out). Absent means detailed execution: the carrier's
 *  own physical action/movement flow is authoritative for progress. Never
 *  set before pickup — an `assigned` order abstracted before pickup simply
 *  stays `assigned` (goods still belong to source) and resumes the normal
 *  pickup flow once a live carrier exists again, no timing metadata needed. */
export type TransportExecution = {
  mode: 'off-screen'
  /** Absolute `dayNight.elapsedDays` at which the carrier's remaining travel
   *  commitment (captured at handoff time, while its live position was still
   *  known) completes. */
  arrivesAtDays: number
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
  /** Optional off-screen execution metadata — see `TransportExecution`. */
  execution?: TransportExecution
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

/** Detailed → off-screen handoff (plan settlements-npcs-019) — only ever an
 *  `in-transit` order (cargo already claimed): an `assigned` order abstracted
 *  before pickup stays `assigned` with no execution metadata (see
 *  `TransportExecution`'s doc). Idempotent guard: a second call against an
 *  order already off-screen is a no-op, so a caller never has to check first. */
export function beginOffscreenTransportExecution(
  order: TransportOrder,
  arrivesAtDays: number,
): TransportOrder | null {
  if (order.state !== 'in-transit') return null
  if (order.execution) return null
  return { ...order, execution: { mode: 'off-screen', arrivesAtDays } }
}

/** Off-screen → detailed handoff — stops off-screen execution ownership once
 *  a live carrier `NpcAgent` exists again. No-op (returns `null`) when the
 *  order already has no execution metadata, so a caller never has to check
 *  first. Leaves `state` untouched: a still-`in-transit` order resumes
 *  ordinary detailed pickup/delivery, never repeats pickup or unload. */
export function clearTransportExecution(order: TransportOrder): TransportOrder | null {
  if (!order.execution) return null
  const { execution: _execution, ...rest } = order
  return rest
}
