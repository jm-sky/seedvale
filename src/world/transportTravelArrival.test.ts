import { describe, expect, it } from 'vitest'
import { markNpcTravelReached } from '../ai/npcTravel'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import { createTransportOrders } from './createTransportOrders'
import {
  assignTransportOrder,
  completeTransportPickup,
  createTransportOrderRecord,
} from './transportOrder'
import { resolveTransportTravelArrivals } from './transportTravelArrival'

describe('resolveTransportTravelArrivals', () => {
  function setup() {
    const dest = createSettlementEconomy('b', {}, [{ kind: 'food', target: 6 }])
    const carrier = createNpcAuthoritativeState('npc:carrier', 0)
    carrier.transportCargo.add('carrot', 3)
    const orders = createTransportOrders([
      completeTransportPickup(
        assignTransportOrder(
          createTransportOrderRecord({
            id: 'order:1',
            source: { type: 'settlement-storage', settlementId: 'a' },
            destination: { type: 'settlement-storage', settlementId: 'b' },
            itemKind: 'carrot',
            requestedQuantity: 3,
          }),
          'npc:carrier',
        )!,
        'npc:carrier',
        3,
      )!,
    ])
    carrier.travel = markNpcTravelReached({
      destination: { x: 40, z: 0 },
      lastPosition: { x: 40, z: 0 },
      purpose: { kind: 'transport', orderId: 'order:1' },
    })
    const lookup = {
      getHousehold: () => undefined,
      getEconomy: (id: string) => (id === 'b' ? dest : undefined),
      getNpcState: (id: string) => (id === 'npc:carrier' ? carrier : undefined),
    }
    return { dest, carrier, orders, lookup }
  }

  it('unloads cargo exactly once when transport-purpose travel has reached', () => {
    const { dest, carrier, orders, lookup } = setup()
    resolveTransportTravelArrivals(orders, lookup, 10, (fn) => fn(carrier, 'npc:carrier'))
    expect(orders.find('order:1')?.state).toBe('completed')
    expect(carrier.transportCargo.count('carrot')).toBe(0)
    expect(dest.items.count('carrot')).toBe(3)
    expect(carrier.travel).toBeNull()
    resolveTransportTravelArrivals(orders, lookup, 11, (fn) => fn(carrier, 'npc:carrier'))
    expect(dest.items.count('carrot')).toBe(3)
  })

  it('keeps cargo and reached travel when the destination cannot resolve', () => {
    const { dest, carrier, orders, lookup } = setup()
    resolveTransportTravelArrivals(
      orders,
      { ...lookup, getEconomy: () => undefined },
      10,
      (fn) => fn(carrier, 'npc:carrier'),
    )
    expect(orders.find('order:1')?.state).toBe('in-transit')
    expect(carrier.transportCargo.count('carrot')).toBe(3)
    expect(dest.items.count('carrot')).toBe(0)
    expect(carrier.travel?.arrival).toBe('reached')
  })

  it('does not treat blocked travel as arrival', () => {
    const { dest, carrier, orders, lookup } = setup()
    carrier.travel = { ...carrier.travel!, blocked: true }
    resolveTransportTravelArrivals(orders, lookup, 10, (fn) => fn(carrier, 'npc:carrier'))
    expect(orders.find('order:1')?.state).toBe('in-transit')
    expect(carrier.transportCargo.count('carrot')).toBe(3)
    expect(dest.items.count('carrot')).toBe(0)
  })

  it('cleans stale transport-purpose travel when the order is already terminal', () => {
    const { dest, carrier, orders, lookup } = setup()
    orders.completeDelivery('order:1', 'npc:carrier')
    carrier.transportCargo.remove('carrot', 3)
    dest.depositFood('carrot', 3, 0)
    resolveTransportTravelArrivals(orders, lookup, 10, (fn) => fn(carrier, 'npc:carrier'))
    expect(carrier.travel).toBeNull()
    expect(dest.items.count('carrot')).toBe(3)
  })
})
