import { describe, expect, it } from 'vitest'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { createHousehold, createHouseholdRegistry, householdIdFor } from './household'

describe('createHousehold', () => {
  it('starts with a small deterministic reserve', () => {
    const a = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    const again = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    expect(a.stock.query('food')).toEqual(again.stock.query('food'))
    expect(a.stock.query('food')).toBeGreaterThan(0)
    expect(a.stock.query('food')).toBeLessThan(5)
    expect(a.stock.query('wood')).toBeGreaterThan(0)
  })

  it('reports shortage/shouldAcquire relative to policy, not raw amounts', () => {
    const household = createHousehold('h', 's', 'home')
    household.stock.remove('food', household.stock.query('food'))
    expect(household.shortage('food')).toBeGreaterThan(0)
    expect(household.shouldAcquire('food')).toBe(true)
    household.deposit('food', 10)
    expect(household.shortage('food')).toBe(0)
    expect(household.shouldAcquire('food')).toBe(false)
  })

  it('caps deposits at capacity and routes the remainder to the settlement economy', () => {
    const household = createHousehold('h', 's', 'home')
    household.stock.remove('food', household.stock.query('food'))
    const economy = createSettlementEconomy('s', {}, [])
    household.deposit('food', 20, economy)
    expect(household.stock.query('food')).toBeLessThan(20)
    expect(economy.query('food')).toBeGreaterThan(0)
    expect(household.stock.query('food') + economy.query('food')).toBe(20)
  })

  it('drops the remainder when no economy is given to absorb overflow', () => {
    const household = createHousehold('h', 's', 'home')
    const before = household.stock.query('wood')
    household.deposit('wood', 100)
    expect(household.stock.query('wood')).toBeLessThan(100 + before)
  })

  it('never removes more than available (reuses EconomicStock invariants)', () => {
    const household = createHousehold('h', 's', 'home')
    const amount = household.stock.query('food')
    expect(household.stock.remove('food', amount + 1)).toBe(false)
    expect(household.stock.query('food')).toBe(amount)
  })
})

describe('household water reserve (plan 122)', () => {
  it('starts with a small deterministic reserve, same idiom as food/wood', () => {
    const a = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    const again = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    expect(a.water.current).toEqual(again.water.current)
    expect(a.water.current).toBeGreaterThan(0)
    expect(a.water.current).toBeLessThan(a.water.capacity)
  })

  it('reports shortage/shouldFetch relative to policy, not raw amounts', () => {
    const household = createHousehold('h', 's', 'home')
    household.water.remove(household.water.current)
    expect(household.water.shortage()).toBeGreaterThan(0)
    expect(household.water.shouldFetch()).toBe(true)
    household.water.add(10)
    expect(household.water.shortage()).toBe(0)
    expect(household.water.shouldFetch()).toBe(false)
  })

  it('caps additions at capacity — a well trip cannot overfill the barrel/trough', () => {
    const household = createHousehold('h', 's', 'home')
    household.water.add(100)
    expect(household.water.current).toBe(household.water.capacity)
  })

  it('never drains below zero', () => {
    const household = createHousehold('h', 's', 'home')
    household.water.remove(household.water.current + 5)
    expect(household.water.current).toBe(0)
    expect(household.water.has(1)).toBe(false)
  })

  it('is independent of the food/wood EconomicStock (not an EconomicKind)', () => {
    const household = createHousehold('h', 's', 'home')
    const waterBefore = household.water.current
    household.deposit('wood', 5)
    expect(household.water.current).toBe(waterBefore)
  })
})

describe('householdIdFor', () => {
  it('is stable and namespaced per settlement/family', () => {
    expect(householdIdFor('0_0', 0)).toBe(householdIdFor('0_0', 0))
    expect(householdIdFor('0_0', 0)).not.toBe(householdIdFor('0_0', 1))
    expect(householdIdFor('0_0', 0)).not.toBe(householdIdFor('1_0', 0))
  })
})

describe('createHouseholdRegistry', () => {
  it('reuses the same household when a settlement streams back in', () => {
    const registry = createHouseholdRegistry()
    const id = householdIdFor('0_0', 0)
    const first = registry.getOrCreate(id, '0_0', '0_0:home:0')
    first.deposit('wood', 5)
    const again = registry.getOrCreate(id, '0_0', '0_0:home:0')
    expect(again).toBe(first)
    expect(again.stock.query('wood')).toBe(first.stock.query('wood'))
    expect(again.water.current).toBe(first.water.current)
  })

  it('keeps different families in the same settlement on separate stock', () => {
    const registry = createHouseholdRegistry()
    const a = registry.getOrCreate(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    const b = registry.getOrCreate(householdIdFor('0_0', 1), '0_0', '0_0:home:1')
    a.deposit('wood', 5)
    expect(b.stock.query('wood')).not.toBe(a.stock.query('wood'))
  })
})
