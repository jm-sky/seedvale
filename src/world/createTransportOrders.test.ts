import { describe, expect, it } from 'vitest'
import { createTransportOrders } from './createTransportOrders'
import { createTransportOrderRecord } from './transportOrder'

const source = { type: 'household' as const, householdId: 'h-source' }
const destination = { type: 'settlement-storage' as const, settlementId: 's1' }

function makeParams(overrides: Partial<Parameters<ReturnType<typeof createTransportOrders>['create']>[0]> = {}) {
  return {
    source,
    destination,
    itemKind: 'carrot' as const,
    requestedQuantity: 4,
    ...overrides,
  }
}

describe('createTransportOrders', () => {
  it('creates a pending order with a stable id', () => {
    const orders = createTransportOrders()
    const record = orders.create(makeParams())!
    expect(record.state).toBe('pending')
    expect(record.carrierNpcId).toBeNull()
    expect(record.id.startsWith('transportOrder:')).toBe(true)
    expect(orders.find(record.id)).toEqual(record)
    expect(orders.list()).toEqual([record])
  })

  it('creates an already-assigned order when a carrier is supplied', () => {
    const orders = createTransportOrders()
    const record = orders.create(makeParams({ carrierNpcId: 'npc:1' }))!
    expect(record.state).toBe('assigned')
    expect(record.carrierNpcId).toBe('npc:1')
    expect(orders.findByCarrier('npc:1')).toEqual(record)
  })

  it('rejects create when requestedQuantity is not positive', () => {
    const orders = createTransportOrders()
    expect(orders.create(makeParams({ requestedQuantity: 0 }))).toBeNull()
    expect(orders.create(makeParams({ requestedQuantity: -1 }))).toBeNull()
    expect(orders.list()).toEqual([])
  })

  it('enforces at most one non-terminal order per carrier', () => {
    const orders = createTransportOrders()
    const first = orders.create(makeParams({ carrierNpcId: 'npc:1' }))
    expect(first).not.toBeNull()
    expect(orders.create(makeParams({ carrierNpcId: 'npc:1' }))).toBeNull()
    expect(orders.assign(orders.create(makeParams())!.id, 'npc:1')).toBeNull()
    expect(orders.list()).toHaveLength(2)
  })

  it('allows a new order for a carrier after the previous one completes', () => {
    const orders = createTransportOrders()
    const first = orders.create(makeParams({ carrierNpcId: 'npc:1' }))!
    expect(orders.completePickup(first.id, 'npc:1', 4)).not.toBeNull()
    expect(orders.completeDelivery(first.id, 'npc:1')).not.toBeNull()
    expect(orders.findByCarrier('npc:1')).toBeUndefined()
    const second = orders.create(makeParams({ carrierNpcId: 'npc:1' }))
    expect(second?.state).toBe('assigned')
  })

  it('lookup by carrier ignores terminal orders', () => {
    const orders = createTransportOrders()
    const failed = orders.create(makeParams({ carrierNpcId: 'npc:1' }))!
    orders.fail(failed.id)
    expect(orders.findByCarrier('npc:1')).toBeUndefined()
  })

  it('unknown ids are no-ops', () => {
    const orders = createTransportOrders()
    expect(orders.assign('nope', 'npc:1')).toBeNull()
    expect(orders.completePickup('nope', 'npc:1', 1)).toBeNull()
    expect(orders.completeDelivery('nope', 'npc:1')).toBeNull()
    expect(orders.fail('nope')).toBeNull()
    expect(orders.cancel('nope')).toBeNull()
  })

  it('can seed from initial records without inventing a second identity', () => {
    const existing = createTransportOrderRecord({
      id: 'transportOrder:seed',
      source,
      destination,
      itemKind: 'bread',
      requestedQuantity: 2,
    })
    const orders = createTransportOrders([existing])
    expect(orders.find('transportOrder:seed')?.itemKind).toBe('bread')
  })

  it('dispose clears the registry', () => {
    const orders = createTransportOrders()
    orders.create(makeParams({ carrierNpcId: 'npc:1' }))
    orders.dispose()
    expect(orders.list()).toEqual([])
    expect(orders.findByCarrier('npc:1')).toBeUndefined()
  })

  it('never reuses an id already present in seeded/restored records (plan settlements-npcs-019 §3)', () => {
    // The very next id this counter/clock sequence would naturally produce —
    // seeding it as an already-restored record simulates the exact collision
    // risk a fresh page load + old save could hit.
    const probe = createTransportOrders()
    const first = probe.create(makeParams())!
    const [, ms, counter] = first.id.split(':')
    const collidingId = `transportOrder:${ms}:${Number(counter) + 1}`
    const seeded = createTransportOrderRecord({
      id: collidingId,
      source,
      destination,
      itemKind: 'bread',
      requestedQuantity: 1,
    })
    const orders = createTransportOrders([seeded])
    const created = orders.create(makeParams())!
    expect(created.id).not.toBe(collidingId)
    const ids = orders.list().map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('beginOffscreenExecution/clearExecution round-trip through the registry', () => {
    const orders = createTransportOrders()
    const assigned = orders.create(makeParams({ carrierNpcId: 'npc:1' }))!
    orders.completePickup(assigned.id, 'npc:1', 2)

    expect(orders.beginOffscreenExecution(assigned.id, 10)?.execution).toEqual({
      mode: 'off-screen',
      arrivesAtDays: 10,
    })
    expect(orders.find(assigned.id)?.execution).toEqual({ mode: 'off-screen', arrivesAtDays: 10 })

    expect(orders.clearExecution(assigned.id)?.execution).toBeUndefined()
    expect(orders.find(assigned.id)?.execution).toBeUndefined()
    // Resuming detailed execution never touches state/quantities.
    expect(orders.find(assigned.id)?.state).toBe('in-transit')
    expect(orders.find(assigned.id)?.claimedQuantity).toBe(2)
  })

  it('beginOffscreenExecution on an unknown id is a no-op', () => {
    const orders = createTransportOrders()
    expect(orders.beginOffscreenExecution('nope', 10)).toBeNull()
    expect(orders.clearExecution('nope')).toBeNull()
  })
})
