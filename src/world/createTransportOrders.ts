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
 * World-owned runtime store for `TransportOrder` commitments (plan
 * settlements-npcs-018). Lookup by id and bounded lookup of the one active
 * order per carrier — no tick, no matching, no pathfinding.
 *
 * Active/non-terminal orders carry across an in-session `WorldBundle`
 * rebuild and persist as `SaveData.transportOrders` (plan
 * settlements-npcs-019) via `createTransportOrders(initial)`'s seed param —
 * no separate restore API. Cargo itself never lives here; see
 * `transportOrder.ts`'s doc.
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
  const records: TransportOrder[] = [...initial]

  const indexOf = (id: string): number => records.findIndex((r) => r.id === id)

  /** Collision-free by construction (plan settlements-npcs-019 §3) —
   *  restored orders seed `records` directly (not through `nextId`'s
   *  counter), so a fresh id must be checked against them rather than
   *  trusted from `Date.now()` uniqueness alone. */
  const nextId = (): string => {
    let id: string
    do {
      id = `transportOrder:${Date.now()}:${nextTransportOrderId++}`
    } while (indexOf(id) !== -1)
    return id
  }

  const findByCarrier = (npcId: string): TransportOrder | undefined => {
    for (const order of records) {
      if (order.carrierNpcId === npcId && isTransportOrderActive(order.state)) return order
    }
    return undefined
  }

  const replace = (id: string, updated: TransportOrder | null): TransportOrder | null => {
    if (!updated) return null
    const index = indexOf(id)
    if (index === -1) return null
    records[index] = updated
    return updated
  }

  return {
    list: () => records,
    find: (id) => records.find((r) => r.id === id),
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
      records.push(record)
      return record
    },
    assign(id, carrierNpcId) {
      if (findByCarrier(carrierNpcId)) return null
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, assignTransportOrder(records[index]!, carrierNpcId))
    },
    completePickup(id, carrierNpcId, claimedQuantity) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, completeTransportPickup(records[index]!, carrierNpcId, claimedQuantity))
    },
    completeDelivery(id, carrierNpcId) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, completeTransportDelivery(records[index]!, carrierNpcId))
    },
    fail(id) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, failTransportOrder(records[index]!))
    },
    cancel(id) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, cancelTransportOrder(records[index]!))
    },
    beginOffscreenExecution(id, arrivesAtDays) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, beginOffscreenTransportExecution(records[index]!, arrivesAtDays))
    },
    clearExecution(id) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, clearTransportExecution(records[index]!))
    },
    dispose() {
      records.length = 0
    },
  }
}
