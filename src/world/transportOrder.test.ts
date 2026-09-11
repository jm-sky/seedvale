import { describe, expect, it } from 'vitest'
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
  isTransportOrderTerminal,
  type TransportOrder,
} from './transportOrder'

function makeOrder(overrides: Partial<TransportOrder> = {}): TransportOrder {
  return {
    ...createTransportOrderRecord({
      id: 'transportOrder:1',
      source: { type: 'household', householdId: 'h-source' },
      destination: { type: 'settlement-storage', settlementId: 's1' },
      itemKind: 'carrot',
      requestedQuantity: 5,
    }),
    ...overrides,
  }
}

describe('createTransportOrderRecord', () => {
  it('starts pending with stable endpoint refs and zero claimed/delivered', () => {
    const order = makeOrder()
    expect(order.state).toBe('pending')
    expect(order.carrierNpcId).toBeNull()
    expect(order.source).toEqual({ type: 'household', householdId: 'h-source' })
    expect(order.destination).toEqual({ type: 'settlement-storage', settlementId: 's1' })
    expect(order.itemKind).toBe('carrot')
    expect(order.requestedQuantity).toBe(5)
    expect(order.claimedQuantity).toBe(0)
    expect(order.deliveredQuantity).toBe(0)
  })

  it('does not store runtime household or economy object references', () => {
    const order = makeOrder()
    expect(order.source).not.toHaveProperty('household')
    expect(order.destination).not.toHaveProperty('economy')
    expect(Object.keys(order.source)).toEqual(['type', 'householdId'])
    expect(Object.keys(order.destination)).toEqual(['type', 'settlementId'])
  })

  it('floors requestedQuantity and clamps negatives to 0', () => {
    expect(createTransportOrderRecord({
      id: 't',
      source: { type: 'household', householdId: 'h' },
      destination: { type: 'settlement-storage', settlementId: 's' },
      itemKind: 'bread',
      requestedQuantity: 3.9,
    }).requestedQuantity).toBe(3)
    expect(createTransportOrderRecord({
      id: 't',
      source: { type: 'household', householdId: 'h' },
      destination: { type: 'settlement-storage', settlementId: 's' },
      itemKind: 'bread',
      requestedQuantity: -2,
    }).requestedQuantity).toBe(0)
  })
})

describe('transport order lifecycle', () => {
  it('assigns a pending order to one carrier', () => {
    const assigned = assignTransportOrder(makeOrder(), 'npc:1')
    expect(assigned?.state).toBe('assigned')
    expect(assigned?.carrierNpcId).toBe('npc:1')
    expect(assigned?.claimedQuantity).toBe(0)
  })

  it('rejects assignment unless the order is pending', () => {
    expect(assignTransportOrder(makeOrder({ state: 'assigned', carrierNpcId: 'npc:1' }), 'npc:2')).toBeNull()
    expect(assignTransportOrder(makeOrder({ state: 'cancelled' }), 'npc:1')).toBeNull()
  })

  it('completes pickup into in-transit with the actually claimed quantity', () => {
    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    const inTransit = completeTransportPickup(assigned, 'npc:1', 3)
    expect(inTransit?.state).toBe('in-transit')
    expect(inTransit?.claimedQuantity).toBe(3)
    expect(inTransit?.deliveredQuantity).toBe(0)
    expect(inTransit?.requestedQuantity).toBe(5)
  })

  it('rejects pickup from the wrong carrier, zero claim, or over-request', () => {
    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    expect(completeTransportPickup(assigned, 'npc:other', 3)).toBeNull()
    expect(completeTransportPickup(assigned, 'npc:1', 0)).toBeNull()
    expect(completeTransportPickup(assigned, 'npc:1', 6)).toBeNull()
  })

  it('rejects a second pickup once in-transit', () => {
    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    const inTransit = completeTransportPickup(assigned, 'npc:1', 3)!
    expect(completeTransportPickup(inTransit, 'npc:1', 2)).toBeNull()
  })

  it('completes delivery atomically with delivered === claimed', () => {
    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    const inTransit = completeTransportPickup(assigned, 'npc:1', 4)!
    const completed = completeTransportDelivery(inTransit, 'npc:1')
    expect(completed?.state).toBe('completed')
    expect(completed?.deliveredQuantity).toBe(4)
    expect(completed?.claimedQuantity).toBe(4)
    expect(isTransportOrderTerminal(completed!.state)).toBe(true)
  })

  it('rejects a second unload on a completed order', () => {
    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    const inTransit = completeTransportPickup(assigned, 'npc:1', 4)!
    const completed = completeTransportDelivery(inTransit, 'npc:1')!
    expect(completeTransportDelivery(completed, 'npc:1')).toBeNull()
    expect(completeTransportPickup(completed, 'npc:1', 1)).toBeNull()
  })

  it('fails or cancels only before pickup', () => {
    const pending = makeOrder()
    expect(failTransportOrder(pending)?.state).toBe('failed')
    expect(cancelTransportOrder(pending)?.state).toBe('cancelled')
    expect(cancelTransportOrder(pending)?.carrierNpcId).toBeNull()

    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    expect(failTransportOrder(assigned)?.state).toBe('failed')
    expect(cancelTransportOrder(assigned)?.carrierNpcId).toBeNull()

    const inTransit = completeTransportPickup(assigned, 'npc:1', 2)!
    expect(failTransportOrder(inTransit)).toBeNull()
    expect(cancelTransportOrder(inTransit)).toBeNull()
    expect(inTransit.state).toBe('in-transit')
    expect(inTransit.carrierNpcId).toBe('npc:1')
  })

  it('keeps 0 <= delivered <= claimed <= requested across a successful path', () => {
    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    const inTransit = completeTransportPickup(assigned, 'npc:1', 2)!
    const completed = completeTransportDelivery(inTransit, 'npc:1')!
    expect(completed.deliveredQuantity).toBeLessThanOrEqual(completed.claimedQuantity)
    expect(completed.claimedQuantity).toBeLessThanOrEqual(completed.requestedQuantity)
    expect(completed.deliveredQuantity).toBeGreaterThan(0)
  })

  it('treats completed/failed/cancelled as terminal and pending/assigned/in-transit as active', () => {
    expect(isTransportOrderActive('pending')).toBe(true)
    expect(isTransportOrderActive('assigned')).toBe(true)
    expect(isTransportOrderActive('in-transit')).toBe(true)
    expect(isTransportOrderTerminal('completed')).toBe(true)
    expect(isTransportOrderTerminal('failed')).toBe(true)
    expect(isTransportOrderTerminal('cancelled')).toBe(true)
    expect(isTransportOrderActive('completed')).toBe(false)
  })
})

describe('offscreen execution handoff (plan settlements-npcs-019)', () => {
  it('only begins off-screen execution for an in-transit order', () => {
    const pending = makeOrder()
    expect(beginOffscreenTransportExecution(pending, 10)).toBeNull()

    const assigned = assignTransportOrder(makeOrder(), 'npc:1')!
    expect(beginOffscreenTransportExecution(assigned, 10)).toBeNull()

    const inTransit = completeTransportPickup(assigned, 'npc:1', 2)!
    const offscreen = beginOffscreenTransportExecution(inTransit, 10)
    expect(offscreen?.execution).toEqual({ mode: 'off-screen', arrivesAtDays: 10 })
    // State/quantities untouched — only execution metadata changes.
    expect(offscreen?.state).toBe('in-transit')
    expect(offscreen?.claimedQuantity).toBe(2)
  })

  it('is idempotent — a second handoff on an already off-screen order is a no-op', () => {
    const inTransit = completeTransportPickup(assignTransportOrder(makeOrder(), 'npc:1')!, 'npc:1', 2)!
    const offscreen = beginOffscreenTransportExecution(inTransit, 10)!
    expect(beginOffscreenTransportExecution(offscreen, 99)).toBeNull()
  })

  it('clears execution metadata without touching state/quantities — resumes detailed execution', () => {
    const inTransit = completeTransportPickup(assignTransportOrder(makeOrder(), 'npc:1')!, 'npc:1', 2)!
    const offscreen = beginOffscreenTransportExecution(inTransit, 10)!
    const detailed = clearTransportExecution(offscreen)
    expect(detailed?.execution).toBeUndefined()
    expect(detailed?.state).toBe('in-transit')
    expect(detailed?.claimedQuantity).toBe(2)
  })

  it('clearing an order with no execution metadata is a no-op', () => {
    expect(clearTransportExecution(makeOrder())).toBeNull()
  })
})
