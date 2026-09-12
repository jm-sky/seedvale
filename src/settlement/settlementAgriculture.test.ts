import { describe, expect, it } from 'vitest'
import type { Role } from '../ai/characters'
import type { FamilyDef, FamilyMember } from './families'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { CROP_DEFS } from '../world/cropLifecycle'
import { createHousehold, FARMER_STARTING_SEED_COUNT } from './household'
import {
  householdAgriculturalCapacity,
  householdStartingContextFromFamily,
  resolveSettlementAgricultureCatchUp,
  resolveUnloadedHouseholdAgriculture,
} from './settlementAgriculture'

const PERSONALITY = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
}

function member(opts: { name: string, role: Role, age: number }): FamilyMember {
  return {
    name: opts.name,
    lastName: 'Test',
    relation: opts.age < 18 ? 'child' : 'single',
    character: {
      name: opts.name,
      lastName: 'Test',
      gender: 'male',
      role: opts.role,
      personality: PERSONALITY,
      traits: ['curious'],
    },
    scale: opts.age < 18 ? 0.6 : 1,
    age: opts.age,
  }
}

function family(members: FamilyMember[]): FamilyDef {
  return { id: 'family-0', members }
}

describe('settlementAgriculture (plan settlements-npcs-030)', () => {
  it('counts only adult farmers toward agricultural capacity', () => {
    expect(householdAgriculturalCapacity(family([
      member({ name: 'Ada', role: 'farmer', age: 30 }),
      member({ name: 'Kid', role: 'farmer', age: 9 }),
    ]))).toBe(1)
    expect(householdAgriculturalCapacity(family([
      member({ name: 'Kid', role: 'farmer', age: 9 }),
    ]))).toBe(0)
    expect(householdAgriculturalCapacity(family([
      member({ name: 'Jan', role: 'hunter', age: 40 }),
    ]))).toBe(0)
  })

  it('builds starting context from hunter membership and adult farmer coverage', () => {
    expect(householdStartingContextFromFamily(family([
      member({ name: 'Ada', role: 'farmer', age: 30 }),
      member({ name: 'Kid', role: 'farmer', age: 8 }),
      member({ name: 'Jan', role: 'hunter', age: 40 }),
    ]))).toEqual({ hasHunter: true, adultFarmerCount: 1 })
  })

  it('does not count a child farmer toward agricultural capacity or starter seeds', () => {
    expect(householdStartingContextFromFamily(family([
      member({ name: 'Kid', role: 'farmer', age: 9 }),
    ]))).toEqual({ hasHunter: false, adultFarmerCount: 0 })
  })

  it('keeps hunter bandages independent of age', () => {
    expect(householdStartingContextFromFamily(family([
      member({ name: 'Kid', role: 'hunter', age: 9 }),
    ]))).toEqual({ hasHunter: true, adultFarmerCount: 0 })
  })

  it('does not produce for a home settlement even with seeds and elapsed time', () => {
    const household = createHousehold('h', 's', 'home', undefined, { adultFarmerCount: 1 })
    household.markAgricultureResolved(1)
    const foodBefore = household.foodCount()
    const seedsBefore = household.items.count('seed_carrot')
    resolveSettlementAgricultureCatchUp({
      isHome: true,
      families: [family([member({ name: 'Ada', role: 'farmer', age: 30 })])],
      households: [household],
      nowDays: 20,
    })
    expect(household.foodCount()).toBe(foodBefore)
    expect(household.items.count('seed_carrot')).toBe(seedsBefore)
    expect(household.agricultureLastResolvedAtDays()).toBe(20)
  })

  it('produces concrete crop items from real seeds using CROP_DEFS timing', () => {
    const household = createHousehold('h', 's', 'home', undefined, { adultFarmerCount: 1 })
    household.markAgricultureResolved(0)
    const cycle = CROP_DEFS.carrot.matureAfterDays
    resolveUnloadedHouseholdAgriculture({
      household,
      capacity: 1,
      nowDays: cycle * 2,
    })
    expect(household.items.count('seed_carrot')).toBe(FARMER_STARTING_SEED_COUNT - 2)
    expect(household.items.count('carrot')).toBe(2 * CROP_DEFS.carrot.yieldCount)
    expect(household.agricultureLastResolvedAtDays()).toBe(cycle * 2)
  })

  it('produces nothing without seeds and does not invent a refill', () => {
    const household = createHousehold('h', 's', 'home')
    household.markAgricultureResolved(0)
    const foodBefore = household.foodCount()
    resolveUnloadedHouseholdAgriculture({ household, capacity: 1, nowDays: 100 })
    expect(household.foodCount()).toBe(foodBefore)
    expect(household.items.count('carrot')).toBe(0)
  })

  it('is a no-op when resolved again at the same world day', () => {
    const household = createHousehold('h', 's', 'home', undefined, { adultFarmerCount: 1 })
    household.markAgricultureResolved(0)
    resolveUnloadedHouseholdAgriculture({ household, capacity: 1, nowDays: 3 })
    const food = household.foodCount()
    const carrotSeeds = household.items.count('seed_carrot')
    resolveUnloadedHouseholdAgriculture({ household, capacity: 1, nowDays: 3 })
    expect(household.foodCount()).toBe(food)
    expect(household.items.count('seed_carrot')).toBe(carrotSeeds)
  })

  it('overflows household food capacity into SettlementEconomy', () => {
    const household = createHousehold('h', 's', 'home', undefined, { adultFarmerCount: 1 })
    household.markAgricultureResolved(0)
    const economy = createSettlementEconomy('s', {}, [])
    resolveUnloadedHouseholdAgriculture({
      household,
      capacity: 1,
      nowDays: 20,
      economy,
    })
    expect(household.foodCount()).toBeLessThanOrEqual(7)
    expect(economy.query('food') + household.foodCount()).toBeGreaterThan(7)
  })

  it('keeps catch-up cost bounded for a very large elapsed interval', () => {
    const household = createHousehold('h', 's', 'home', undefined, { adultFarmerCount: 1 })
    household.markAgricultureResolved(0)
    const started = performance.now()
    resolveUnloadedHouseholdAgriculture({ household, capacity: 1, nowDays: 1_000_000 })
    expect(performance.now() - started).toBeLessThan(50)
    expect(household.items.count('seed_carrot')).toBe(0)
    expect(household.items.count('seed_potato')).toBe(0)
    expect(household.items.count('seed_cabbage')).toBe(0)
  })

  it('does not consume seeds already spent on a remaining detailed crop', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('seed_carrot', 1)
    household.markAgricultureResolved(0)
    resolveUnloadedHouseholdAgriculture({ household, capacity: 1, nowDays: 10 })
    expect(household.items.count('seed_carrot')).toBe(0)
    expect(household.items.count('carrot')).toBe(1)
    household.markAgricultureResolved(10)
    resolveUnloadedHouseholdAgriculture({ household, capacity: 1, nowDays: 20 })
    expect(household.items.count('carrot')).toBe(1)
  })
})
