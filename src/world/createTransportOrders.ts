import type { ItemKind } from '../items/items'
import {
  assignTransportOrder,
  beginOffscreenTransportExecution,
  cancelTransportOrder,
  clearTransportExecution,
  completeTransportDelivery,
  completeTransportPickup,
  createTransportOrderRecord,
  failTransportOrder,
  isTransportOrderActive,
  type TransportEndpointRef,
  type TransportOrder,
} from './transportOrder'

export type CreateTransportOrderParams = {
  source: TransportEndpointRef
  destination: TransportEndpointRef
  itemKind: ItemKind
  requestedQuantity: number
  /** When set, the order is created already `assigned` to this NPC. */
  carrierNpcId?: string | null
}

/**
 * World-owned runtime store for active `TransportOrder` commitments (plan
 * settlements-npcs-018; active-only registry plan settlements-npcs-053).
 * Lookup by id and by carrier — no tick, no matching, no pathfinding.
 *
 * Only non-terminal orders live here. Terminal transitions return the final
 * record to the caller but remove it from this store immediately.
 *
 * Active orders carry across an in-session `WorldBundle` rebuild and persist
 * as `SaveData.transportOrders` (plan settlements-npcs-019) via
 * `createTransportOrders(initial)`'s seed param — no separate restore API.
 * Cargo itself never lives here; see `transportOrder.ts`'s doc.
 *
 * @domain settlements-npcs
 */
export type TransportOrders = {
  list: () => readonly TransportOrder[]
  find: (id: string) => TransportOrder | undefined
  /** The one non-terminal order for `npcId`, if any. */
  findByCarrier: (npcId: string) => TransportOrder | undefined
  /** Creates a `pending` (or immediately `assigned`) order. `null` when
   *  `requestedQuantity` is not positive, or when `carrierNpcId` already
   *  has a non-terminal order. */
  create: (params: CreateTransportOrderParams) => TransportOrder | null
  assign: (id: string, carrierNpcId: string) => TransportOrder | null
  completePickup: (id: string, carrierNpcId: string, claimedQuantity: number) => TransportOrder | null
  completeDelivery: (id: string, carrierNpcId: string) => TransportOrder | null
  fail: (id: string) => TransportOrder | null
  cancel: (id: string) => TransportOrder | null
  /** Detailed → off-screen handoff (plan settlements-npcs-019) — see
   *  `beginOffscreenTransportExecution`'s doc. */
  beginOffscreenExecution: (id: string, arrivesAtDays: number) => TransportOrder | null
  /** Off-screen → detailed handoff — see `clearTransportExecution`'s doc. */
  clearExecution: (id: string) => TransportOrder | null
  dispose: () => void
}

let nextTransportOrderId = 0

export function createTransportOrders(
  initial: readonly TransportOrder[] = [],
): TransportOrders {
  const activeById = new Map<string, TransportOrder>()
  const carrierToOrderId = new Map<string, string>()

  for (const order of initial) {
    if (!isTransportOrderActive(order.state)) continue
    if (activeById.has(order.id)) continue
    const carrierId = order.carrierNpcId
    if (carrierId && carrierToOrderId.has(carrierId)) continue
    activeById.set(order.id, order)
    if (carrierId) carrierToOrderId.set(carrierId, order.id)
  }

  /** Collision-free by construction (plan settlements-npcs-019 §3) —
   *  restored orders seed the active map directly (not through `nextId`'s
   *  counter), so a fresh id must be checked against them rather than
   *  trusted from `Date.now()` uniqueness alone. */
  const nextId = (): string => {
    let id: string
    do {
      id = `transportOrder:${Date.now()}:${nextTransportOrderId++}`
    } while (activeById.has(id))
    return id
  }

  const findByCarrier = (npcId: string): TransportOrder | undefined => {
    const orderId = carrierToOrderId.get(npcId)
    if (!orderId) return undefined
    return activeById.get(orderId)
  }

  const applyTransition = (
    id: string,
    transition: (order: TransportOrder) => TransportOrder | null,
  ): TransportOrder | null => {
    const current = activeById.get(id)
    if (!current) return null
    const updated = transition(current)
    if (!updated) return null
    if (isTransportOrderActive(updated.state)) {
      activeById.set(id, updated)
      if (current.carrierNpcId !== updated.carrierNpcId) {
        if (current.carrierNpcId) carrierToOrderId.delete(current.carrierNpcId)
        if (updated.carrierNpcId) carrierToOrderId.set(updated.carrierNpcId, id)
      }
      return updated
    }
    activeById.delete(id)
    if (current.carrierNpcId) carrierToOrderId.delete(current.carrierNpcId)
    return updated
  }

  return {
    list: () => Array.from(activeById.values()),
    find: (id) => activeById.get(id),
    findByCarrier,
    create(params) {
      if (!(params.requestedQuantity > 0)) return null
      const carrierNpcId = params.carrierNpcId ?? null
      if (carrierNpcId && findByCarrier(carrierNpcId)) return null
      let record = createTransportOrderRecord({
        id: nextId(),
        source: params.source,
        destination: params.destination,
        itemKind: params.itemKind,
        requestedQuantity: params.requestedQuantity,
      })
      if (carrierNpcId) {
        const assigned = assignTransportOrder(record, carrierNpcId)
        if (!assigned) return null
        record = assigned
      }
      activeById.set(record.id, record)
      if (record.carrierNpcId) carrierToOrderId.set(record.carrierNpcId, record.id)
      return record
    },
    assign(id, carrierNpcId) {
      if (findByCarrier(carrierNpcId)) return null
      return applyTransition(id, (order) => assignTransportOrder(order, carrierNpcId))
    },
    completePickup(id, carrierNpcId, claimedQuantity) {
      return applyTransition(id, (order) =>
        completeTransportPickup(order, carrierNpcId, claimedQuantity))
    },
    completeDelivery(id, carrierNpcId) {
      return applyTransition(id, (order) =>
        completeTransportDelivery(order, carrierNpcId))
    },
    fail(id) {
      return applyTransition(id, (order) => failTransportOrder(order))
    },
    cancel(id) {
      return applyTransition(id, (order) => cancelTransportOrder(order))
    },
    beginOffscreenExecution(id, arrivesAtDays) {
      return applyTransition(id, (order) =>
        beginOffscreenTransportExecution(order, arrivesAtDays))
    },
    clearExecution(id) {
      return applyTransition(id, (order) => clearTransportExecution(order))
    },
    dispose() {
      activeById.clear()
      carrierToOrderId.clear()
    },
  }
}
