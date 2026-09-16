import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { createTransportOrders } from '../world/createTransportOrders'
import {
  matchInterSettlementFoodOpportunity,
  selectConcreteFoodGoods,
} from './interSettlementFoodTransport'
import { createSettlementEconomy } from './settlementEconomy'

function surplusEconomy(id: string, food: number, target = 2) {
  const economy = createSettlementEconomy(id, {}, [{ kind: 'food', target }])
  if (food > 0) economy.depositFood('carrot', food, 0)
  return economy
}

function shortageEconomy(id: string, target: number, food = 0) {
  const economy = createSettlementEconomy(id, {}, [{ kind: 'food', target }])
  if (food > 0) economy.depositFood('bread', food, 0)
  return economy
}

describe('selectConcreteFoodGoods', () => {
  it('picks the first catalog food kind with uncommitted stock', () => {
    const inventory = new Inventory()
    inventory.add('fish', 6)
    inventory.add('carrot', 6)
    const picked = selectConcreteFoodGoods(inventory, 8, new Inventory(), 3)
    expect(picked).not.toBeNull()
    expect(picked!.quantity).toBeGreaterThan(0)
    expect(picked!.quantity).toBeLessThanOrEqual(3)
    expect(selectConcreteFoodGoods(inventory, 8, new Inventory(), 3)).toEqual(picked)
  })

  it('honours per-kind commitments and carrier capacity', () => {
    const inventory = new Inventory()
    inventory.add('carrot', 3)
    inventory.add('fish', 4)
    const committed = selectConcreteFoodGoods(
      inventory,
      6,
      new Inventory(),
      3,
      (kind) => (kind === 'carrot' ? 3 : 0),
    )
    expect(committed?.kind).toBe('fish')
    expect(committed?.quantity).toBe(3)

    const tightCarrier = new Inventory({}, 0.12)
    const reduced = selectConcreteFoodGoods(inventory, 6, tightCarrier, 3)
    expect(reduced?.kind).toBe('carrot')
    expect(reduced?.quantity).toBe(1)
  })
})

describe('matchInterSettlementFoodOpportunity', () => {
  it('creates one A→B opportunity from surplus and uncovered shortage', () => {
    const source = surplusEconomy('a', 8)
    const dest = shortageEconomy('b', 6)
    const match = matchInterSettlementFoodOpportunity({
      sourceSettlementId: 'a',
      sourceX: 0,
      sourceZ: 0,
      sourceEconomy: source,
      carrier: new Inventory(),
      orders: [],
      knownSettlements: [
        { settlementId: 'a', x: 0, z: 0 },
        { settlementId: 'b', x: 40, z: 0 },
      ],
      getEconomy: (id) => (id === 'a' ? source : id === 'b' ? dest : undefined),
      maxTransfer: 3,
    })
    expect(match).toEqual({
      destinationSettlementId: 'b',
      itemKind: 'carrot',
      quantity: 3,
    })
  })

  it('never matches A→A even when both surplus and shortage bookkeeping are present', () => {
    const source = surplusEconomy('a', 8)
    expect(matchInterSettlementFoodOpportunity({
      sourceSettlementId: 'a',
      sourceX: 0,
      sourceZ: 0,
      sourceEconomy: source,
      carrier: new Inventory(),
      orders: [],
      knownSettlements: [{ settlementId: 'a', x: 0, z: 0 }],
      getEconomy: () => source,
      maxTransfer: 3,
    })).toBeNull()
  })

  it('does not match when incoming commitments already cover destination demand', () => {
    const source = surplusEconomy('a', 8)
    const dest = shortageEconomy('b', 5)
    const orders = createTransportOrders()
    orders.create({
      source: { type: 'settlement-storage', settlementId: 'a' },
      destination: { type: 'settlement-storage', settlementId: 'b' },
      itemKind: 'carrot',
      requestedQuantity: 5,
      carrierNpcId: 'npc:other',
    })
    expect(matchInterSettlementFoodOpportunity({
      sourceSettlementId: 'a',
      sourceX: 0,
      sourceZ: 0,
      sourceEconomy: source,
      carrier: new Inventory(),
      orders: orders.list(),
      knownSettlements: [
        { settlementId: 'a', x: 0, z: 0 },
        { settlementId: 'b', x: 40, z: 0 },
      ],
      getEconomy: (id) => (id === 'a' ? source : dest),
      maxTransfer: 3,
    })).toBeNull()
  })

  it('caps a new commitment at uncommitted source surplus', () => {
    const source = surplusEconomy('a', 7, 2) // surplus 5
    const dest = shortageEconomy('b', 8)
    const orders = createTransportOrders()
    orders.create({
      source: { type: 'settlement-storage', settlementId: 'a' },
      destination: { type: 'settlement-storage', settlementId: 'b' },
      itemKind: 'carrot',
      requestedQuantity: 4,
      carrierNpcId: 'npc:other',
    })
    const match = matchInterSettlementFoodOpportunity({
      sourceSettlementId: 'a',
      sourceX: 0,
      sourceZ: 0,
      sourceEconomy: source,
      carrier: new Inventory(),
      orders: orders.list(),
      knownSettlements: [
        { settlementId: 'a', x: 0, z: 0 },
        { settlementId: 'b', x: 40, z: 0 },
      ],
      getEconomy: (id) => (id === 'a' ? source : dest),
      maxTransfer: 3,
    })
    expect(match?.quantity).toBe(1)
  })

  it('prefers nearer destination then stable settlement id', () => {
    const source = surplusEconomy('a', 8)
    const near = shortageEconomy('c-near', 4)
    const far = shortageEconomy('b-far', 4)
    const equalA = shortageEconomy('dest-a', 4)
    const equalB = shortageEconomy('dest-b', 4)
    const nearer = matchInterSettlementFoodOpportunity({
      sourceSettlementId: 'a',
      sourceX: 0,
      sourceZ: 0,
      sourceEconomy: source,
      carrier: new Inventory(),
      orders: [],
      knownSettlements: [
        { settlementId: 'b-far', x: 80, z: 0 },
        { settlementId: 'c-near', x: 10, z: 0 },
      ],
      getEconomy: (id) => (id === 'c-near' ? near : far),
      maxTransfer: 3,
    })
    expect(nearer?.destinationSettlementId).toBe('c-near')

    const tied = matchInterSettlementFoodOpportunity({
      sourceSettlementId: 'a',
      sourceX: 0,
      sourceZ: 0,
      sourceEconomy: source,
      carrier: new Inventory(),
      orders: [],
      knownSettlements: [
        { settlementId: 'dest-b', x: 20, z: 0 },
        { settlementId: 'dest-a', x: 20, z: 0 },
      ],
      getEconomy: (id) => (id === 'dest-a' ? equalA : equalB),
      maxTransfer: 3,
    })
    expect(tied?.destinationSettlementId).toBe('dest-a')
  })
})
