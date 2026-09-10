import { describe, expect, it } from 'vitest'
import { createFoodBatch } from '../items/foodFreshness'
import { Inventory } from '../items/Inventory'
import { createTransportOrders } from './createTransportOrders'
import {
  executeTransportPickup,
  executeTransportUnload,
  transferInventoryItems,
} from './transportTransactions'

const sourceRef = { type: 'household' as const, householdId: 'h-source' }
const destRef = { type: 'settlement-storage' as const, settlementId: 's1' }

function totals(source: Inventory, carrier: Inventory, destination: Inventory, kind: 'carrot' | 'bread' = 'carrot') {
  return source.count(kind) + carrier.count(kind) + destination.count(kind)
}

describe('transferInventoryItems', () => {
  it('moves exact quantity with freshness batches intact', () => {
    const source = new Inventory()
    const destination = new Inventory()
    source.addWithFreshness('carrot', 4, [createFoodBatch(4, 2, 1)], 2)
    expect(transferInventoryItems(source, destination, 'carrot', 3, 2)).toBe(true)
    expect(source.count('carrot')).toBe(1)
    expect(destination.count('carrot')).toBe(3)
    expect(destination.getFoodBatches('carrot', 2)[0]?.acquiredAtDays).toBe(2)
  })

  it('does not remove from source when destination lacks capacity', () => {
    const source = new Inventory()
    const destination = new Inventory(undefined, 0.001)
    source.add('carrot', 3)
    expect(transferInventoryItems(source, destination, 'carrot', 3)).toBe(false)
    expect(source.count('carrot')).toBe(3)
    expect(destination.count('carrot')).toBe(0)
  })
})

describe('executeTransportPickup / executeTransportUnload', () => {
  it('transfers a full request and completes the order', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory()
    const destination = new Inventory()
    source.add('carrot', 8)
    destination.add('carrot', 3)
    const before = totals(source, carrier, destination)
    const order = orders.create({
      source: sourceRef,
      destination: destRef,
      itemKind: 'carrot',
      requestedQuantity: 5,
      carrierNpcId: 'npc:1',
    })!
    expect(executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 8,
    })).toEqual({ ok: true, claimed: 5 })
    expect(orders.find(order.id)?.state).toBe('in-transit')
    expect(totals(source, carrier, destination)).toBe(before)
    expect(executeTransportUnload({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, destination,
    })).toEqual({ ok: true, delivered: 5 })
    expect(source.count('carrot')).toBe(3)
    expect(carrier.count('carrot')).toBe(0)
    expect(destination.count('carrot')).toBe(8)
    expect(orders.find(order.id)?.state).toBe('completed')
    expect(orders.find(order.id)?.deliveredQuantity).toBe(5)
    expect(totals(source, carrier, destination)).toBe(before)
  })

  it('records a partial live claim and does not mint the remainder', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory()
    const destination = new Inventory()
    source.add('carrot', 4)
    destination.add('carrot', 7)
    const before = totals(source, carrier, destination)
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 6, carrierNpcId: 'npc:1',
    })!
    expect(executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 4,
    })).toEqual({ ok: true, claimed: 4 })
    executeTransportUnload({ orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, destination })
    expect(source.count('carrot')).toBe(0)
    expect(destination.count('carrot')).toBe(11)
    expect(orders.find(order.id)?.claimedQuantity).toBe(4)
    expect(orders.find(order.id)?.requestedQuantity).toBe(6)
    expect(totals(source, carrier, destination)).toBe(before)
  })

  it('fails the order when live availability is zero — no cargo, not in-transit', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory()
    source.add('carrot', 2)
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:1',
    })!
    expect(executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 0,
    })).toEqual({ ok: false, claimed: 0, reason: 'failed' })
    expect(source.count('carrot')).toBe(2)
    expect(carrier.count('carrot')).toBe(0)
    expect(orders.find(order.id)?.state).toBe('failed')
    expect(orders.find(order.id)?.claimedQuantity).toBe(0)
  })

  it('refunds source and stays assigned when the carrier cannot hold the claim', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory(undefined, 0.001)
    source.add('carrot', 5)
    const before = source.count('carrot')
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 5, carrierNpcId: 'npc:1',
    })!
    expect(executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 5,
    })).toEqual({ ok: false, claimed: 0, reason: 'capacity' })
    expect(source.count('carrot')).toBe(before)
    expect(carrier.count('carrot')).toBe(0)
    expect(orders.find(order.id)?.state).toBe('assigned')
    expect(orders.find(order.id)?.claimedQuantity).toBe(0)
  })

  it('preserves perishable batches across a capacity-failed pickup', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory(undefined, 0.001)
    const batch = createFoodBatch(3, 4, 1)
    source.addWithFreshness('carrot', 3, [batch], 4)
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:1',
    })!
    executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 3, nowDays: 4,
    })
    expect(source.getFoodBatches('carrot', 4)).toEqual([expect.objectContaining({ acquiredAtDays: 4, count: 3 })])
  })

  it('keeps cargo on the carrier when destination rejects the unload', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory()
    const destination = new Inventory(undefined, 0.001)
    source.add('carrot', 6)
    destination.add('carrot', 0)
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:1',
    })!
    executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 3,
    })
    const before = totals(source, carrier, destination)
    expect(executeTransportUnload({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, destination,
    })).toEqual({ ok: false, delivered: 0, reason: 'destination' })
    expect(carrier.count('carrot')).toBe(3)
    expect(destination.count('carrot')).toBe(0)
    expect(orders.find(order.id)?.state).toBe('in-transit')
    expect(orders.find(order.id)?.deliveredQuantity).toBe(0)
    expect(totals(source, carrier, destination)).toBe(before)
  })

  it('rejects duplicate pickup and unload without mutating inventories', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory()
    const destination = new Inventory()
    source.add('carrot', 4)
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 2, carrierNpcId: 'npc:1',
    })!
    executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 4,
    })
    expect(executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 2,
    })).toEqual({ ok: false, claimed: 0, reason: 'rejected' })
    expect(source.count('carrot')).toBe(2)
    expect(carrier.count('carrot')).toBe(2)
    executeTransportUnload({ orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, destination })
    const after = { source: source.count('carrot'), carrier: carrier.count('carrot'), destination: destination.count('carrot') }
    expect(executeTransportUnload({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, destination,
    })).toEqual({ ok: false, delivered: 0, reason: 'rejected' })
    expect(source.count('carrot')).toBe(after.source)
    expect(carrier.count('carrot')).toBe(after.carrier)
    expect(destination.count('carrot')).toBe(after.destination)
    expect(orders.find(order.id)?.state).toBe('completed')
  })

  it('does not mint missing carrier cargo and does not complete', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory()
    const destination = new Inventory()
    source.add('carrot', 5)
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:1',
    })!
    executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 3,
    })
    carrier.remove('carrot', 3)
    expect(executeTransportUnload({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, destination,
    })).toEqual({ ok: false, delivered: 0, reason: 'rejected' })
    expect(destination.count('carrot')).toBe(0)
    expect(orders.find(order.id)?.state).toBe('in-transit')
  })

  it('lets two orders claim the same source live, without duplicating goods', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrierA = new Inventory()
    const carrierB = new Inventory()
    source.add('carrot', 7)
    const a = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 5, carrierNpcId: 'npc:a',
    })!
    const b = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 5, carrierNpcId: 'npc:b',
    })!
    executeTransportPickup({
      orders, orderId: a.id, carrierNpcId: 'npc:a', carrier: carrierA, source, liveTransferableQuantity: source.count('carrot'),
    })
    executeTransportPickup({
      orders, orderId: b.id, carrierNpcId: 'npc:b', carrier: carrierB, source, liveTransferableQuantity: source.count('carrot'),
    })
    expect(orders.find(a.id)?.claimedQuantity).toBe(5)
    expect(orders.find(b.id)?.claimedQuantity).toBe(2)
    expect(source.count('carrot') + carrierA.count('carrot') + carrierB.count('carrot')).toBe(7)
  })

  it('interruption after pickup leaves cargo on the carrier and the order in-transit', () => {
    const orders = createTransportOrders()
    const source = new Inventory()
    const carrier = new Inventory()
    const destination = new Inventory()
    source.add('carrot', 6)
    destination.add('carrot', 1)
    const before = totals(source, carrier, destination)
    const order = orders.create({
      source: sourceRef, destination: destRef, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:1',
    })!
    executeTransportPickup({
      orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, source, liveTransferableQuantity: 3,
    })
    expect(orders.find(order.id)?.state).toBe('in-transit')
    expect(carrier.count('carrot')).toBe(3)
    expect(totals(source, carrier, destination)).toBe(before)
    executeTransportUnload({ orders, orderId: order.id, carrierNpcId: 'npc:1', carrier, destination })
    expect(destination.count('carrot')).toBe(4)
    expect(totals(source, carrier, destination)).toBe(before)
  })
})
