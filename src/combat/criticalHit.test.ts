import { describe, expect, it } from 'vitest'
import { criticalRoll, MELEE_CRITICAL_CHANCE, MELEE_CRITICAL_MULTIPLIER, resolveCriticalHit } from './criticalHit'

describe('criticalRoll', () => {
  it('is deterministic for the same inputs', () => {
    expect(criticalRoll('player', 'melee:a', 1)).toBe(criticalRoll('player', 'melee:a', 1))
  })

  it('differs across attempts', () => {
    const rolls = new Set<number>()
    for (let attempt = 0; attempt < 20; attempt++) rolls.add(criticalRoll('player', 'melee:a', attempt))
    expect(rolls.size).toBeGreaterThan(15)
  })

  it('stays within [0,1)', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const roll = criticalRoll('player', 'ranged:arrow', attempt)
      expect(roll).toBeGreaterThanOrEqual(0)
      expect(roll).toBeLessThan(1)
    }
  })
})

describe('resolveCriticalHit', () => {
  it('never rolls critical at zero chance', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = resolveCriticalHit(10, 0, 2, 'player', 'melee:a', attempt)
      expect(result.critical).toBe(false)
      expect(result.damage).toBe(10)
    }
  })

  it('always rolls critical at chance 1', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = resolveCriticalHit(10, 1, 2, 'player', 'melee:a', attempt)
      expect(result.critical).toBe(true)
      expect(result.damage).toBe(20)
    }
  })

  it('multiplies damage only on a critical', () => {
    let sawCritical = false
    let sawNormal = false
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = resolveCriticalHit(10, 0.5, 2, 'player', 'melee:a', attempt)
      if (result.critical) {
        sawCritical = true
        expect(result.damage).toBe(20)
      } else {
        sawNormal = true
        expect(result.damage).toBe(10)
      }
    }
    expect(sawCritical).toBe(true)
    expect(sawNormal).toBe(true)
  })

  it('never mutates/exceeds base damage for non-positive damage', () => {
    expect(resolveCriticalHit(0, 1, 2, 'player', 'melee:a', 0)).toEqual({ critical: false, damage: 0 })
  })

  it('exposes the melee baseline constants', () => {
    expect(MELEE_CRITICAL_CHANCE).toBeGreaterThan(0)
    expect(MELEE_CRITICAL_CHANCE).toBeLessThan(1)
    expect(MELEE_CRITICAL_MULTIPLIER).toBeGreaterThan(1)
  })
})
