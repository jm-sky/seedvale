import { describe, expect, it } from 'vitest'
import { canMergeFoodBatches, foodBatchDecomposeAtDays, getFoodBatchFreshnessStage, getFreshnessStage, isBaitCapable, isFoodBatchDecomposed, isFoodPerishable, isSpoiled, WORLD_SPOILED_FOOD_DECAY_DAYS } from './foodFreshness'

describe('foodFreshness (plan 159)', () => {
  it('never spoils a kind with no freshness definition', () => {
    expect(isFoodPerishable('honey')).toBe(false)
    expect(getFreshnessStage('honey', 0, 1000)).toBe('fresh')
    expect(getFreshnessStage('stone', 0, 1000)).toBe('fresh')
  })

  it('progresses fresh -> medium -> spoiled for a perishable kind', () => {
    expect(isFoodPerishable('berries')).toBe(true)
    expect(getFreshnessStage('berries', 0, 0)).toBe('fresh')
    expect(getFreshnessStage('berries', 0, 0.99)).toBe('fresh')
    expect(getFreshnessStage('berries', 0, 1.5)).toBe('medium')
    expect(getFreshnessStage('berries', 0, 5)).toBe('spoiled')
    expect(isSpoiled('berries', 0, 5)).toBe(true)
  })

  it('merges only batches with identical timestamps', () => {
    expect(canMergeFoodBatches(1, 1)).toBe(true)
    expect(canMergeFoodBatches(1, 1.1)).toBe(false)
    expect(canMergeFoodBatches(1, 5)).toBe(false)
  })

  it('flags bait-capable kinds by category', () => {
    expect(isBaitCapable('raw_meat')).toBe(true)
    expect(isBaitCapable('mushroom')).toBe(true)
    expect(isBaitCapable('honey')).toBe(false)
    expect(isBaitCapable('stone')).toBe(false)
  })
})

describe('foodBatchDecomposeAtDays (plan items-player-025)', () => {
  const appleBatch = {
    count: 1,
    acquiredAtDays: 10,
    accumulatedEffectiveAge: 0,
    lastCheckpointDays: 10,
    decayModifier: 1,
  }

  it('is null for non-perishable kinds', () => {
    expect(foodBatchDecomposeAtDays('stone', appleBatch)).toBeNull()
    expect(foodBatchDecomposeAtDays('honey', appleBatch)).toBeNull()
  })

  it('waits shelf life plus WORLD_SPOILED_FOOD_DECAY_DAYS of effective age', () => {
    // apple: fresh 2 + medium 2 = 4, plus 0.5 decompose
    expect(foodBatchDecomposeAtDays('apple', appleBatch)).toBeCloseTo(10 + 4 + WORLD_SPOILED_FOOD_DECAY_DAYS)
    expect(isFoodBatchDecomposed('apple', appleBatch, 14)).toBe(false)
    expect(getFoodBatchFreshnessStage('apple', appleBatch, 14.1)).toBe('spoiled')
    expect(isFoodBatchDecomposed('apple', appleBatch, 14.1)).toBe(false)
    expect(isFoodBatchDecomposed('apple', appleBatch, 14.5)).toBe(true)
  })

  it('uses accumulated effective age and decay modifier, not acquiredAtDays + durations', () => {
    const stored = {
      count: 1,
      acquiredAtDays: 0,
      accumulatedEffectiveAge: 3,
      lastCheckpointDays: 20,
      decayModifier: 0.5,
    }
    // remaining effective = (4 + 0.5) - 3 = 1.5; calendar = 1.5 / 0.5 = 3
    expect(foodBatchDecomposeAtDays('apple', stored)).toBeCloseTo(23)
  })
})
