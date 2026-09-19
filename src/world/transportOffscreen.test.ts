import { describe, expect, it } from 'vitest'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { Inventory } from '../items/Inventory'
import { createHousehold } from '../settlement/household'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import { createTransportOrders } from './createTransportOrders'
import {
  estimateOffscreenTravelDays,
  type OffscreenTransportLookup,
  resolveOffscreenTransportArrivals,
  resolveSettlementStorageHandoffPosition,
  resolveTransportEndpointInventory,
  shouldUseLegacyTransportExecutionHandoff,
} from './transportOffscreen'
import {
  assignTransportOrder,
  completeTransportPickup,
  createTransportOrderRecord,
} from './transportOrder'

describe('estimateOffscreenTravelDays', () => {
  it('is zero for the same position', () => {
    expect(estimateOffscreenTravelDays({ x: 0, z: 0 }, { x: 0, z: 0 }, 600)).toBe(0)
  })

  it('grows with distance and shrinks with a longer day', () => {
    const near = estimateOffscreenTravelDays({ x: 0, z: 0 }, { x: 10, z: 0 }, 600)
    const far = estimateOffscreenTravelDays({ x: 0, z: 0 }, { x: 100, z: 0 }, 600)
    expect(far).toBeGreaterThan(near)
    const slowerDay = estimateOffscreenTravelDays({ x: 0, z: 0 }, { x: 10, z: 0 }, 1200)
    expect(slowerDay).toBeLessThan(near)
  })
})

function makeLookup(overrides: Partial<OffscreenTransportLookup> = {}): OffscreenTransportLookup {
  return {
    getHousehold: () => undefined,
    getEconomy: () => undefined,
    getNpcState: () => undefined,
    ...overrides,
  }
}

describe('resolveTransportEndpointInventory', () => {
  it('resolves a household endpoint through getHousehold', () => {
    const household = createHousehold('h1', 's1', 'home:h1')
    const inv = resolveTransportEndpointInventory(
      { type: 'household', householdId: 'h1' },
      makeLookup({ getHousehold: (id) => (id === 'h1' ? household : undefined) }),
    )
    expect(inv).toBe(household.items)
  })

  it('resolves a settlement-storage endpoint through getEconomy', () => {
    const economy = createSettlementEconomy('s1', {}, [])
    const inv = resolveTransportEndpointInventory(
      { type: 'settlement-storage', settlementId: 's1' },
      makeLookup({ getEconomy: (id) => (id === 's1' ? economy : undefined) }),
    )
    expect(inv).toBe(economy.items)
  })

  it('returns null for an endpoint that does not (yet) resolve', () => {
    expect(resolveTransportEndpointInventory({ type: 'household', householdId: 'missing' }, makeLookup())).toBeNull()
    expect(resolveTransportEndpointInventory({ type: 'settlement-storage', settlementId: 'missing' }, makeLookup())).toBeNull()
    expect(resolveTransportEndpointInventory({ type: 'resource-site', resourceId: 'missing' }, makeLookup())).toBeNull()
  })

  it('resolves a resource-site endpoint through getResourceSiteInventory', () => {
    const site = new Inventory({}, Infinity, undefined, undefined, Infinity)
    site.add('iron', 4)
    const inv = resolveTransportEndpointInventory(
      { type: 'resource-site', resourceId: 'resource_1_2' },
      makeLookup({ getResourceSiteInventory: (id) => (id === 'resource_1_2' ? site : undefined) }),
    )
    expect(inv).toBe(site)
  })
})

describe('resolveOffscreenTransportArrivals', () => {
  function setupInTransitOrder(arrivesAtDays: number) {
    const economy = createSettlementEconomy('s1', {}, [])
    const carrierState = createNpcAuthoritativeState('npc:carrier', 0)
    carrierState.transportCargo.add('carrot', 3)
    const orders = createTransportOrders([
      {
        ...completeTransportPickup(
          assignTransportOrder(
            createTransportOrderRecord({
              id: 'order:1',
              source: { type: 'household', householdId: 'h1' },
              destination: { type: 'settlement-storage', settlementId: 's1' },
              itemKind: 'carrot',
              requestedQuantity: 3,
            }),
            'npc:carrier',
          )!,
          'npc:carrier',
          3,
        )!,
        execution: { mode: 'off-screen', arrivesAtDays },
      },
    ])
    const lookup: OffscreenTransportLookup = {
      getHousehold: () => undefined,
      getEconomy: (id) => (id === 's1' ? economy : undefined),
      getNpcState: (id) => (id === 'npc:carrier' ? carrierState : undefined),
    }
    return { orders, economy, carrierState, lookup }
  }

  it('does nothing before the captured arrival time', () => {
    const { orders, economy, carrierState, lookup } = setupInTransitOrder(10)
    resolveOffscreenTransportArrivals(orders, lookup, 5)
    expect(orders.find('order:1')?.state).toBe('in-transit')
    expect(carrierState.transportCargo.count('carrot')).toBe(3)
    expect(economy.items.count('carrot')).toBe(0)
  })

  it('completes delivery exactly once the arrival time has elapsed', () => {
    const { orders, economy, carrierState, lookup } = setupInTransitOrder(10)
    resolveOffscreenTransportArrivals(orders, lookup, 10)
    expect(orders.find('order:1')).toBeUndefined()
    expect(carrierState.transportCargo.count('carrot')).toBe(0)
    expect(economy.items.count('carrot')).toBe(3)
  })

  it('is idempotent — a repeated checkpoint after completion changes nothing further', () => {
    const { orders, economy, carrierState, lookup } = setupInTransitOrder(10)
    resolveOffscreenTransportArrivals(orders, lookup, 10)
    resolveOffscreenTransportArrivals(orders, lookup, 20)
    expect(orders.find('order:1')).toBeUndefined()
    expect(carrierState.transportCargo.count('carrot')).toBe(0)
    expect(economy.items.count('carrot')).toBe(3)
  })

  it('leaves cargo on the carrier and the order in-transit when the destination cannot resolve', () => {
    const { orders, carrierState, lookup } = setupInTransitOrder(10)
    const noDestination: OffscreenTransportLookup = { ...lookup, getEconomy: () => undefined }
    resolveOffscreenTransportArrivals(orders, noDestination, 10)
    expect(orders.find('order:1')?.state).toBe('in-transit')
    expect(carrierState.transportCargo.count('carrot')).toBe(3)
  })

  it('leaves cargo and the order untouched when the carrier state is missing', () => {
    const { orders, economy, lookup } = setupInTransitOrder(10)
    const noCarrier: OffscreenTransportLookup = { ...lookup, getNpcState: () => undefined }
    resolveOffscreenTransportArrivals(orders, noCarrier, 10)
    expect(orders.find('order:1')?.state).toBe('in-transit')
    expect(economy.items.count('carrot')).toBe(0)
  })

  it('never touches an order that has no off-screen execution metadata (detailed execution owns it)', () => {
    const economy = createSettlementEconomy('s1', {}, [])
    const carrierState = createNpcAuthoritativeState('npc:carrier', 0)
    carrierState.transportCargo.add('carrot', 3)
    const orders = createTransportOrders([
      completeTransportPickup(
        assignTransportOrder(
          createTransportOrderRecord({
            id: 'order:1',
            source: { type: 'household', householdId: 'h1' },
            destination: { type: 'settlement-storage', settlementId: 's1' },
            itemKind: 'carrot',
            requestedQuantity: 3,
          }),
          'npc:carrier',
        )!,
        'npc:carrier',
        3,
      )!,
    ])
    resolveOffscreenTransportArrivals(orders, {
      getHousehold: () => undefined,
      getEconomy: (id) => (id === 's1' ? economy : undefined),
      getNpcState: (id) => (id === 'npc:carrier' ? carrierState : undefined),
    }, 999)
    expect(orders.find('order:1')?.state).toBe('in-transit')
    expect(carrierState.transportCargo.count('carrot')).toBe(3)
  })

  it('credits delivered ore into settlement stock, not leftover items', () => {
    const economy = createSettlementEconomy('s1', { iron: 0 }, [])
    const carrierState = createNpcAuthoritativeState('npc:carrier', 0)
    carrierState.transportCargo.add('iron', 2)
    const orders = createTransportOrders([
      {
        ...completeTransportPickup(
          assignTransportOrder(
            createTransportOrderRecord({
              id: 'order:ore',
              source: { type: 'resource-site', resourceId: 'resource_1_2' },
              destination: { type: 'settlement-storage', settlementId: 's1' },
              itemKind: 'iron',
              requestedQuantity: 2,
            }),
            'npc:carrier',
          )!,
          'npc:carrier',
          2,
        )!,
        execution: { mode: 'off-screen', arrivesAtDays: 4 },
      },
    ])
    resolveOffscreenTransportArrivals(orders, {
      getHousehold: () => undefined,
      getEconomy: (id) => (id === 's1' ? economy : undefined),
      getNpcState: (id) => (id === 'npc:carrier' ? carrierState : undefined),
    }, 5)
    expect(orders.find('order:ore')).toBeUndefined()
    expect(carrierState.transportCargo.count('iron')).toBe(0)
    expect(economy.items.count('iron')).toBe(0)
    expect(economy.query('iron')).toBe(2)
  })
})

describe('legacy transport execution handoff (settlements-npcs-037)', () => {
  it('skips TransportOrder.execution when the carrier already has transport-purpose travel', () => {
    expect(shouldUseLegacyTransportExecutionHandoff(
      { id: 'order:1', state: 'in-transit' },
      { purpose: { kind: 'transport', orderId: 'order:1' } },
    )).toBe(false)
  })

  it('still hands off same-settlement in-transit orders without transport-purpose travel', () => {
    expect(shouldUseLegacyTransportExecutionHandoff(
      { id: 'order:1', state: 'in-transit' },
      { purpose: { kind: 'expedition' } },
    )).toBe(true)
    expect(shouldUseLegacyTransportExecutionHandoff(
      { id: 'order:1', state: 'in-transit' },
      null,
    )).toBe(true)
  })

  it('honors the referenced destination settlement id', () => {
    const current = { x: 1, z: 2 }
    const other = { x: 40, z: 8 }
    expect(resolveSettlementStorageHandoffPosition('a', 'a', current, () => other)).toEqual(current)
    expect(resolveSettlementStorageHandoffPosition('b', 'a', current, (id) => (id === 'b' ? other : null))).toEqual(other)
  })

  it('does not invent a zero-duration target when the destination cannot resolve', () => {
    expect(resolveSettlementStorageHandoffPosition('missing', 'a', { x: 1, z: 2 }, () => null)).toBeNull()
  })
})
