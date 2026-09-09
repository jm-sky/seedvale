import { describe, expect, it } from 'vitest'
import {
  RAT_INFESTATION_FLOOR,
  RAT_INFESTATION_PRESSURE_BONUS,
  RAT_POPULATION_CAP,
  ratNormalPopulationTarget,
  ratPopulationTarget,
} from './rats'

describe('ratPopulationTarget (plan fauna-016 §7 — settlement rat pressure)', () => {
  it('is zero with no food available', () => {
    expect(ratPopulationTarget({ householdFoodCount: 0, settlementFoodCount: 0, dogCount: 0 })).toBe(0)
  })

  it('grows with more available food', () => {
    const low = ratPopulationTarget({ householdFoodCount: 6, settlementFoodCount: 0, dogCount: 0 })
    const high = ratPopulationTarget({ householdFoodCount: 60, settlementFoodCount: 0, dogCount: 0 })
    expect(high).toBeGreaterThan(low)
  })

  it('clamps to a small population even with abundant food', () => {
    const target = ratPopulationTarget({ householdFoodCount: 1000, settlementFoodCount: 1000, dogCount: 0 })
    expect(target).toBeLessThanOrEqual(RAT_POPULATION_CAP)
  })

  it('decreases under dog pressure', () => {
    const withoutDogs = ratPopulationTarget({ householdFoodCount: 30, settlementFoodCount: 0, dogCount: 0 })
    const withDogs = ratPopulationTarget({ householdFoodCount: 30, settlementFoodCount: 0, dogCount: 3 })
    expect(withDogs).toBeLessThan(withoutDogs)
  })

  it('never goes negative even with heavy dog pressure and little food', () => {
    expect(ratPopulationTarget({ householdFoodCount: 2, settlementFoodCount: 0, dogCount: 5 })).toBe(0)
  })

  it('combines household and settlement food toward the same pressure', () => {
    const combined = ratPopulationTarget({ householdFoodCount: 15, settlementFoodCount: 15, dogCount: 0 })
    const householdOnly = ratPopulationTarget({ householdFoodCount: 15, settlementFoodCount: 0, dogCount: 0 })
    expect(combined).toBeGreaterThan(householdOnly)
  })
})

describe('ratPopulationTarget infestation contract (plan quests-progression-006)', () => {
  const inputs = { householdFoodCount: 30, settlementFoodCount: 0, dogCount: 0 }

  it('uses max(normalTarget + 3, 7) while infestation is active', () => {
    const normal = ratNormalPopulationTarget(inputs)
    expect(ratPopulationTarget(inputs, true)).toBe(Math.max(normal + RAT_INFESTATION_PRESSURE_BONUS, RAT_INFESTATION_FLOOR))
  })

  it('returns to the normal formula once infestation is inactive', () => {
    expect(ratPopulationTarget(inputs, false)).toBe(ratNormalPopulationTarget(inputs))
    expect(ratPopulationTarget(inputs, true)).toBeGreaterThan(ratPopulationTarget(inputs, false))
  })

  it('still applies dog suppression to the normal portion before infestation bonus', () => {
    const infestedWithDogs = ratPopulationTarget({ ...inputs, dogCount: 3 }, true)
    const infestedWithoutDogs = ratPopulationTarget(inputs, true)
    expect(infestedWithDogs).toBeLessThanOrEqual(infestedWithoutDogs)
  })
})
