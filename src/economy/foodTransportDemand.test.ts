import { describe, expect, it } from 'vitest'
import { createHousehold } from '../settlement/household'
import { createTransportOrders } from '../world/createTransportOrders'
import {
  committedIncomingFood,
  committedOutgoingFood,
  committedOutgoingSettlementFood,
  uncommittedHouseholdFoodSurplus,
  uncommittedSettlementFoodSurplus,
  uncoveredSettlementFoodShortage,
} from './foodTransportDemand'
import { createSettlementEconomy } from './settlementEconomy'

const source = { type: 'household' as const, householdId: 'source' }
const destination = { type: 'settlement-storage' as const, settlementId: 's' }

function householdWithFood(id: string, amount: number) {
  const household = createHousehold(id, 's', `home:${id}`)
  household.items.remove('bread', household.items.count('bread'))
  if (amount > 0) household.depositFood('carrot', amount)
  return household
}

describe('food transport demand (settlements-npcs-020)', () => {
  it('creates no uncovered demand when the settlement has enough food', () => {
    const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 4 }])
    economy.depositFood('bread', 4, 0)
    const orders = createTransportOrders()
    expect(economy.shortage('food')).toBe(0)
    expect(uncoveredSettlementFoodShortage(economy, orders.list())).toBe(0)
  })

  it('treats current shortage as uncovered when nothing is in transit', () => {
    const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 6 }])
    expect(economy.shortage('food')).toBe(6)
    expect(uncoveredSettlementFoodShortage(economy, [])).toBe(6)
  })

  it('subtracts incoming assigned and in-transit food from uncovered demand', () => {
    const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 5 }])
    const orders = createTransportOrders()
    orders.create({
      source, destination, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })
    const incoming = orders.create({
      source: { type: 'household', householdId: 'other' },
      destination,
      itemKind: 'fish',
      requestedQuantity: 2,
      carrierNpcId: 'npc:b',
    })!
    orders.completePickup(incoming.id, 'npc:b', 2)
    expect(committedIncomingFood(orders.list(), 's')).toBe(5)
    expect(uncoveredSettlementFoodShortage(economy, orders.list())).toBe(0)
  })

  it('leaves a partial uncovered remainder when incoming does not cover shortage', () => {
    const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 5 }])
    const orders = createTransportOrders()
    orders.create({
      source, destination, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })
    expect(uncoveredSettlementFoodShortage(economy, orders.list())).toBe(2)
  })

  it('ignores terminal and non-food orders on the destination side', () => {
    const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 5 }])
    const orders = createTransportOrders()
    const failed = orders.create({
      source, destination, itemKind: 'carrot', requestedQuantity: 4, carrierNpcId: 'npc:a',
    })!
    orders.fail(failed.id)
    orders.create({
      source,
      destination: { type: 'settlement-storage', settlementId: 'other' },
      itemKind: 'carrot',
      requestedQuantity: 4,
      carrierNpcId: 'npc:b',
    })
    expect(committedIncomingFood(orders.list(), 's')).toBe(0)
    expect(uncoveredSettlementFoodShortage(economy, orders.list())).toBe(5)
  })

  it('counts only pre-pickup outgoing against household surplus', () => {
    const household = householdWithFood('source', 7) // target 3 → surplus 4
    const orders = createTransportOrders()
    orders.create({
      source, destination, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })
    expect(committedOutgoingFood(orders.list(), 'source')).toBe(3)
    expect(uncommittedHouseholdFoodSurplus(household, orders.list())).toBe(1)
  })

  it('stops counting a source commitment after pickup', () => {
    const household = householdWithFood('source', 7)
    const orders = createTransportOrders()
    const order = orders.create({
      source, destination, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })!
    orders.completePickup(order.id, 'npc:a', 3)
    expect(committedOutgoingFood(orders.list(), 'source')).toBe(0)
    expect(uncommittedHouseholdFoodSurplus(household, orders.list())).toBe(household.surplus('food'))
  })

  it('can exclude the caller\'s own order when revalidating pickup', () => {
    const household = householdWithFood('source', 7)
    const orders = createTransportOrders()
    const own = orders.create({
      source, destination, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })!
    orders.create({
      source,
      destination,
      itemKind: 'carrot',
      requestedQuantity: 1,
      carrierNpcId: 'npc:b',
    })
    expect(uncommittedHouseholdFoodSurplus(household, orders.list(), own.id)).toBe(3)
  })

  it('can count pre-pickup outgoing for one concrete food kind', () => {
    const orders = createTransportOrders()
    orders.create({
      source, destination, itemKind: 'carrot', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })
    orders.create({
      source, destination, itemKind: 'fish', requestedQuantity: 2, carrierNpcId: 'npc:b',
    })
    expect(committedOutgoingFood(orders.list(), 'source', undefined, 'carrot')).toBe(3)
    expect(committedOutgoingFood(orders.list(), 'source', undefined, 'fish')).toBe(2)
    expect(committedOutgoingFood(orders.list(), 'source')).toBe(5)
  })
})

describe('settlement-storage outgoing food commitments (settlements-npcs-037)', () => {
  const storageSource = { type: 'settlement-storage' as const, settlementId: 'a' }
  const otherStorage = { type: 'settlement-storage' as const, settlementId: 'b' }

  it('counts only pending/assigned settlement-storage outgoing against surplus', () => {
    const economy = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
    economy.depositFood('carrot', 7, 0) // surplus 5
    const orders = createTransportOrders()
    orders.create({
      source: storageSource,
      destination: otherStorage,
      itemKind: 'carrot',
      requestedQuantity: 3,
      carrierNpcId: 'npc:a',
    })
    expect(committedOutgoingSettlementFood(orders.list(), 'a')).toBe(3)
    expect(uncommittedSettlementFoodSurplus(economy, orders.list())).toBe(2)
  })

  it('stops counting a settlement-storage source after pickup', () => {
    const economy = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
    economy.depositFood('carrot', 7, 0)
    const orders = createTransportOrders()
    const order = orders.create({
      source: storageSource,
      destination: otherStorage,
      itemKind: 'carrot',
      requestedQuantity: 3,
      carrierNpcId: 'npc:a',
    })!
    orders.completePickup(order.id, 'npc:a', 3)
    expect(committedOutgoingSettlementFood(orders.list(), 'a')).toBe(0)
    expect(uncommittedSettlementFoodSurplus(economy, orders.list())).toBe(economy.surplus('food'))
  })

  it('can exclude the caller\'s own order and filter by concrete kind', () => {
    const economy = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
    economy.depositFood('carrot', 5, 0)
    economy.depositFood('fish', 4, 0)
    const orders = createTransportOrders()
    const own = orders.create({
      source: storageSource,
      destination: otherStorage,
      itemKind: 'carrot',
      requestedQuantity: 3,
      carrierNpcId: 'npc:a',
    })!
    orders.create({
      source: storageSource,
      destination: otherStorage,
      itemKind: 'fish',
      requestedQuantity: 2,
      carrierNpcId: 'npc:b',
    })
    expect(committedOutgoingSettlementFood(orders.list(), 'a', own.id, 'carrot')).toBe(0)
    expect(committedOutgoingSettlementFood(orders.list(), 'a', undefined, 'carrot')).toBe(3)
    expect(committedOutgoingSettlementFood(orders.list(), 'a', undefined, 'fish')).toBe(2)
    expect(uncommittedSettlementFoodSurplus(economy, orders.list(), own.id)).toBe(5)
  })

  it('does not treat household outgoing as settlement-storage reservation', () => {
    const economy = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
    economy.depositFood('carrot', 7, 0)
    const orders = createTransportOrders()
    orders.create({
      source: { type: 'household', householdId: 'h' },
      destination: otherStorage,
      itemKind: 'carrot',
      requestedQuantity: 4,
      carrierNpcId: 'npc:a',
    })
    expect(committedOutgoingSettlementFood(orders.list(), 'a')).toBe(0)
    expect(uncommittedSettlementFoodSurplus(economy, orders.list())).toBe(5)
  })

  it('treats incoming commitments that already cover destination demand as no uncovered shortage', () => {
    const economy = createSettlementEconomy('b', {}, [{ kind: 'food', target: 5 }])
    const orders = createTransportOrders()
    orders.create({
      source: storageSource,
      destination: otherStorage,
      itemKind: 'carrot',
      requestedQuantity: 5,
      carrierNpcId: 'npc:a',
    })
    expect(committedIncomingFood(orders.list(), 'b')).toBe(5)
    expect(uncoveredSettlementFoodShortage(economy, orders.list())).toBe(0)
  })
})
