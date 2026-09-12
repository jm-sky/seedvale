import { describe, expect, it } from 'vitest'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { Inventory } from '../items/Inventory'
import { createHousehold, createHouseholdRegistry, householdIdFor } from './household'
import {
  householdWoodValue,
  transferableHouseholdItemKinds,
  transferResourceToHousehold,
} from './householdResourceTransfer'

function emptyHouseholdFood(h: ReturnType<typeof createHousehold>): void {
  for (const kind of ['bread', 'carrot', 'fish', 'egg'] as const) {
    const n = h.items.count(kind)
    if (n > 0) h.items.remove(kind, n)
  }
}

describe('householdWoodValue', () => {
  it('maps branch and beam through catalog fuel values', () => {
    expect(householdWoodValue('branch')).toBe(1)
    expect(householdWoodValue('beam')).toBe(2)
    expect(householdWoodValue('cone')).toBeNull()
  })
})

describe('transferResourceToHousehold', () => {
  it('deposits food into the target household only', () => {
    const registry = createHouseholdRegistry()
    const a = registry.getOrCreate(householdIdFor('s', 0), 's', 's:home:0')
    const b = registry.getOrCreate(householdIdFor('s', 1), 's', 's:home:1')
    emptyHouseholdFood(a)
    emptyHouseholdFood(b)
    const source = new Inventory({ carrot: 4 })
    const economy = createSettlementEconomy('s', {}, [])
    const result = transferResourceToHousehold({
      source,
      household: a,
      economy,
      request: { resource: 'food', itemKind: 'carrot', amount: 3 },
      nowDays: 1,
    })
    expect(result.status).toBe('transferred')
    expect(a.foodCount()).toBe(3)
    expect(b.foodCount()).toBe(0)
    expect(source.count('carrot')).toBe(1)
  })

  it('deposits wood from branch items with conversion', () => {
    const household = createHousehold('h', 's', 'home')
    const beforeWood = household.stock.query('wood')
    const source = new Inventory({ branch: 2 })
    const economy = createSettlementEconomy('s', {}, [])
    const result = transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'wood', itemKind: 'branch', amount: 2 },
      nowDays: 0,
    })
    expect(result).toMatchObject({
      status: 'transferred',
      resource: 'wood',
      sourceAmount: 2,
      resourceAmount: 2,
      storedInHousehold: 2,
    })
    expect(household.stock.query('wood')).toBe(beforeWood + 2)
    expect(source.count('branch')).toBe(0)
  })

  it('converts beam to two wood units per item', () => {
    const household = createHousehold('h', 's', 'home')
    emptyHouseholdFood(household)
    household.items.remove('bread', household.items.count('bread'))
    const source = new Inventory({ beam: 1 })
    const economy = createSettlementEconomy('s', {}, [])
    const result = transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'wood', itemKind: 'beam', amount: 1 },
      nowDays: 0,
    })
    expect(result).toMatchObject({ status: 'transferred', resourceAmount: 2 })
  })

  it('rejects unsupported items and leaves owners unchanged', () => {
    const household = createHousehold('h', 's', 'home')
    const foodBefore = household.foodCount()
    const woodBefore = household.stock.query('wood')
    const source = new Inventory({ arrow: 2 })
    const economy = createSettlementEconomy('s', {}, [])
    const result = transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'food', itemKind: 'arrow', amount: 1 },
      nowDays: 0,
    })
    expect(result.status).toBe('invalid_resource_item')
    expect(household.foodCount()).toBe(foodBefore)
    expect(household.stock.query('wood')).toBe(woodBefore)
    expect(source.count('arrow')).toBe(2)
  })

  it('rejects source shortage without mutating household', () => {
    const household = createHousehold('h', 's', 'home')
    const before = household.foodCount()
    const source = new Inventory({ carrot: 1 })
    const economy = createSettlementEconomy('s', {}, [])
    const result = transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'food', itemKind: 'carrot', amount: 2 },
      nowDays: 0,
    })
    expect(result.status).toBe('source_shortage')
    expect(household.foodCount()).toBe(before)
    expect(source.count('carrot')).toBe(1)
  })

  it('preserves perishable food batch provenance', () => {
    const household = createHousehold('h', 's', 'home')
    const source = new Inventory()
    const batch = { count: 2, acquiredAtDays: 3, accumulatedEffectiveAge: 0.5, lastCheckpointDays: 3, decayModifier: 1 }
    source.addWithFreshness('berries', 2, [batch], 3)
    const economy = createSettlementEconomy('s', {}, [])
    transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'food', itemKind: 'berries', amount: 2 },
      nowDays: 4,
    })
    const stored = household.items.foodBatchesToJSON().berries
    expect(stored?.[0]).toMatchObject({ acquiredAtDays: 3, count: 2 })
  })

  it('routes food overflow to settlement economy without loss', () => {
    const household = createHousehold('h', 's', 'home')
    emptyHouseholdFood(household)
    household.depositFood('carrot', 6)
    const source = new Inventory({ carrot: 5 })
    const economy = createSettlementEconomy('s', {}, [])
    const result = transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'food', itemKind: 'carrot', amount: 5 },
      nowDays: 0,
    })
    expect(result).toMatchObject({ status: 'transferred', overflowedToSettlement: expect.any(Number) })
    if (result.status !== 'transferred') return
    expect(result.overflowedToSettlement).toBeGreaterThan(0)
    expect(household.foodCount() + economy.query('food')).toBe(6 + 5)
  })

  it('routes wood overflow to settlement economy', () => {
    const household = createHousehold('h', 's', 'home')
    const room = 5 - household.stock.query('wood')
    household.deposit('wood', room)
    const source = new Inventory({ branch: 4 })
    const economy = createSettlementEconomy('s', {}, [])
    const result = transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'wood', itemKind: 'branch', amount: 4 },
      nowDays: 0,
    })
    expect(result).toMatchObject({ status: 'transferred', storedInHousehold: 0, overflowedToSettlement: 4 })
    expect(economy.query('wood')).toBe(4)
  })

  it('clears food shortage and records shortage.resolved', () => {
    const household = createHousehold('h', 's', 'home')
    emptyHouseholdFood(household)
    expect(household.shortage('food')).toBeGreaterThan(0)
    const source = new Inventory({ carrot: 3 })
    const economy = createSettlementEconomy('s', {}, [])
    transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'food', itemKind: 'carrot', amount: 3 },
      nowDays: 2,
    })
    expect(household.shortage('food')).toBe(0)
    expect(household.history().some((e) => e.type === 'shortage.resolved' && e.kind === 'food')).toBe(true)
  })

  it('round-trips transferred state through household snapshot', () => {
    const id = householdIdFor('s', 0)
    const registry = createHouseholdRegistry()
    const household = registry.getOrCreate(id, 's', 's:home:0')
    emptyHouseholdFood(household)
    const source = new Inventory({ branch: 1, carrot: 2 })
    const economy = createSettlementEconomy('s', {}, [])
    transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'wood', itemKind: 'branch', amount: 1 },
      nowDays: 0,
    })
    transferResourceToHousehold({
      source,
      household,
      economy,
      request: { resource: 'food', itemKind: 'carrot', amount: 2 },
      nowDays: 0,
    })
    const snap = registry.serialize()
    const restored = createHouseholdRegistry(snap).getOrCreate(id, 's', 's:home:0')
    expect(restored.foodCount()).toBe(2)
    expect(restored.stock.query('wood')).toBe(household.stock.query('wood'))
  })
})

describe('transferableHouseholdItemKinds', () => {
  it('lists held food and household wood kinds only', () => {
    const source = new Inventory({ carrot: 1, branch: 2, arrow: 1, cone: 1 })
    const kinds = transferableHouseholdItemKinds(source)
    expect(kinds).toContain('carrot')
    expect(kinds).toContain('branch')
    expect(kinds).not.toContain('arrow')
    expect(kinds).not.toContain('cone')
  })
})
