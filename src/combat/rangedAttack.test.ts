import { describe, expect, it } from 'vitest'
import type { RangedConfig } from '../items/itemCatalog'
import { rangedAccuracy, rangedDeviationRoll, resolveRangedDirection } from './rangedAttack'

const CONFIG: RangedConfig = {
  damage: 20,
  range: 15,
  projectileSpeed: 30,
  drawTime: 0.4,
  recovery: 0.3,
  staminaCost: 8,
  accuracy: 0.7,
  ammoKinds: ['arrow'],
}

describe('rangedAccuracy', () => {
  it('adds a skill bonus on top of the base accuracy', () => {
    expect(rangedAccuracy(CONFIG, 1)).toBeGreaterThan(rangedAccuracy(CONFIG, 0))
  })

  it('never exceeds 1', () => {
    expect(rangedAccuracy({ ...CONFIG, accuracy: 1 }, 1)).toBeLessThanOrEqual(1)
  })

  it('never drops below the config value at zero skill', () => {
    expect(rangedAccuracy(CONFIG, 0)).toBeGreaterThanOrEqual(CONFIG.accuracy)
  })
})

describe('rangedDeviationRoll', () => {
  it('is deterministic for the same inputs', () => {
    expect(rangedDeviationRoll('player', 3)).toBe(rangedDeviationRoll('player', 3))
  })

  it('stays within [-1, 1]', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const roll = rangedDeviationRoll('player', attempt)
      expect(roll).toBeGreaterThanOrEqual(-1)
      expect(roll).toBeLessThanOrEqual(1)
    }
  })
})

describe('resolveRangedDirection', () => {
  it('fires straight along aimYaw at accuracy 1 (zero deviation)', () => {
    const { dirX, dirZ } = resolveRangedDirection(0, 1, 1)
    expect(dirX).toBeCloseTo(0)
    expect(dirZ).toBeCloseTo(-1)
  })

  it('deviates more at lower accuracy for the same roll', () => {
    const low = resolveRangedDirection(0, 0.2, 1)
    const high = resolveRangedDirection(0, 0.9, 1)
    expect(Math.abs(low.dirX)).toBeGreaterThan(Math.abs(high.dirX))
  })

  it('returns a unit-length direction', () => {
    const { dirX, dirZ } = resolveRangedDirection(0.7, 0.5, -0.3)
    expect(Math.hypot(dirX, dirZ)).toBeCloseTo(1)
  })
})
