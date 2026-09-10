import { describe, expect, it } from 'vitest'
import {
  infestationReplenishmentRoll,
  RAT_INFESTATION_FLOOR,
  RAT_INFESTATION_PRESSURE_BONUS,
  RAT_MIN_REPRODUCTION_MULTIPLIER,
  RAT_POPULATION_CAP,
  ratDogReproductionMultiplier,
  ratNormalPopulationTarget,
  ratPopulationTarget,
  ratReconcileAction,
  shouldInfestationReplenish,
} from './rats'

describe('ratPopulationTarget (plan fauna-016 §7 / quests-progression-013)', () => {
  it('is zero with no food available', () => {
    expect(ratPopulationTarget({ householdFoodCount: 0, settlementFoodCount: 0 })).toBe(0)
  })

  it('grows with more available food', () => {
    const low = ratPopulationTarget({ householdFoodCount: 6, settlementFoodCount: 0 })
    const high = ratPopulationTarget({ householdFoodCount: 60, settlementFoodCount: 0 })
    expect(high).toBeGreaterThan(low)
  })

  it('clamps to a small population even with abundant food', () => {
    const target = ratPopulationTarget({ householdFoodCount: 1000, settlementFoodCount: 1000 })
    expect(target).toBeLessThanOrEqual(RAT_POPULATION_CAP)
  })

  it('does not change the normal target when dogs are present', () => {
    const inputs = { householdFoodCount: 30, settlementFoodCount: 0 }
    expect(ratNormalPopulationTarget(inputs)).toBe(ratPopulationTarget(inputs, false))
    expect(ratDogReproductionMultiplier(3)).toBeLessThan(1)
  })

  it('combines household and settlement food toward the same pressure', () => {
    const combined = ratPopulationTarget({ householdFoodCount: 15, settlementFoodCount: 15 })
    const householdOnly = ratPopulationTarget({ householdFoodCount: 15, settlementFoodCount: 0 })
    expect(combined).toBeGreaterThan(householdOnly)
  })
})

describe('ratPopulationTarget infestation contract (plan quests-progression-013 §2)', () => {
  const inputs = { householdFoodCount: 30, settlementFoodCount: 0 }

  it('uses max(normalTarget + 3, 7) while storage is damaged', () => {
    const normal = ratNormalPopulationTarget(inputs)
    expect(ratPopulationTarget(inputs, true)).toBe(Math.max(normal + RAT_INFESTATION_PRESSURE_BONUS, RAT_INFESTATION_FLOOR))
  })

  it('returns to the normal formula once storage is repaired', () => {
    expect(ratPopulationTarget(inputs, false)).toBe(ratNormalPopulationTarget(inputs))
    expect(ratPopulationTarget(inputs, true)).toBeGreaterThan(ratPopulationTarget(inputs, false))
  })

  it('does not let dog count change the infestation target either', () => {
    expect(ratPopulationTarget(inputs, true)).toBe(
      Math.max(ratNormalPopulationTarget(inputs) + RAT_INFESTATION_PRESSURE_BONUS, RAT_INFESTATION_FLOOR),
    )
  })
})

describe('ratDogReproductionMultiplier (plan quests-progression-013 §4)', () => {
  it('is 1.00 at zero dogs and floors at 0.50 for 5+', () => {
    expect(ratDogReproductionMultiplier(0)).toBe(1)
    expect(ratDogReproductionMultiplier(1)).toBeCloseTo(0.9)
    expect(ratDogReproductionMultiplier(2)).toBeCloseTo(0.8)
    expect(ratDogReproductionMultiplier(3)).toBeCloseTo(0.7)
    expect(ratDogReproductionMultiplier(4)).toBeCloseTo(0.6)
    expect(ratDogReproductionMultiplier(5)).toBe(RAT_MIN_REPRODUCTION_MULTIPLIER)
    expect(ratDogReproductionMultiplier(9)).toBe(RAT_MIN_REPRODUCTION_MULTIPLIER)
  })
})

describe('infestation replenishment (plan quests-progression-013 §3/§5)', () => {
  const rollArgs = { settlementId: 'home', settlementSeed: 42, dayBucket: 10 }

  it('always succeeds at zero dogs', () => {
    expect(shouldInfestationReplenish({ ...rollArgs, dogCount: 0 })).toBe(true)
  })

  it('is deterministic for the same inputs', () => {
    const a = infestationReplenishmentRoll(rollArgs.settlementId, rollArgs.settlementSeed, rollArgs.dayBucket)
    const b = infestationReplenishmentRoll(rollArgs.settlementId, rollArgs.settlementSeed, rollArgs.dayBucket)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })

  it('applies the dog multiplier against the deterministic roll', () => {
    const roll = infestationReplenishmentRoll(rollArgs.settlementId, rollArgs.settlementSeed, rollArgs.dayBucket)
    expect(shouldInfestationReplenish({ ...rollArgs, dogCount: 5 })).toBe(roll < RAT_MIN_REPRODUCTION_MULTIPLIER)
  })
})

describe('ratReconcileAction (plan quests-progression-013 §3/§6)', () => {
  it('does not spawn at or above the applicable target', () => {
    expect(ratReconcileAction({
      alive: 7,
      normalTarget: 2,
      storageDamaged: true,
      nestDestroyed: false,
      infestationReplenish: true,
    })).toBe('none')
  })

  it('enables infestation replenishment only with an intact nest', () => {
    expect(ratReconcileAction({
      alive: 3,
      normalTarget: 2,
      storageDamaged: true,
      nestDestroyed: false,
      infestationReplenish: true,
    })).toBe('spawn-infestation')
    expect(ratReconcileAction({
      alive: 3,
      normalTarget: 2,
      storageDamaged: true,
      nestDestroyed: false,
      infestationReplenish: false,
    })).toBe('none')
  })

  it('blocks infestation replenishment when the nest is destroyed', () => {
    expect(ratReconcileAction({
      alive: 3,
      normalTarget: 2,
      storageDamaged: true,
      nestDestroyed: true,
      infestationReplenish: true,
    })).toBe('none')
  })

  it('still allows food-driven recovery below the normal target when the nest is intact but the dog roll fails', () => {
    expect(ratReconcileAction({
      alive: 1,
      normalTarget: 3,
      storageDamaged: true,
      nestDestroyed: false,
      infestationReplenish: false,
    })).toBe('spawn-normal')
  })

  it('still allows normal food-driven recovery after the nest is destroyed', () => {
    expect(ratReconcileAction({
      alive: 1,
      normalTarget: 3,
      storageDamaged: false,
      nestDestroyed: true,
      infestationReplenish: true,
    })).toBe('spawn-normal')
  })

  it('never despawns when alive exceeds the lowered target', () => {
    expect(ratReconcileAction({
      alive: 8,
      normalTarget: 2,
      storageDamaged: false,
      nestDestroyed: true,
      infestationReplenish: false,
    })).toBe('none')
  })
})
