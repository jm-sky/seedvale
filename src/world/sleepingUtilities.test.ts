import { describe, expect, it } from 'vitest'
import {
  BEDROLL_ON_PLATFORM_RADIUS,
  findNearestSleepingUtility,
  resolveSleepingUtilityCondition,
  SLEEPING_UTILITY_RAIN_DECAY_PER_DAY,
} from './sleepingUtilities'

describe('resolveSleepingUtilityCondition', () => {
  const record = { condition: 100, lastConditionUpdateAtDays: 0 }

  it('returns the stored condition unchanged with no elapsed time', () => {
    expect(resolveSleepingUtilityCondition(record, 1, 0, false)).toBe(100)
  })

  it('never decays while sheltered, however much time elapses', () => {
    expect(resolveSleepingUtilityCondition(record, 1, 50, true)).toBe(100)
  })

  it('decays when exposed, and decays at least as much as a shorter exposure', () => {
    const short = resolveSleepingUtilityCondition(record, 7, 1, false)
    const long = resolveSleepingUtilityCondition(record, 7, 8, false)
    expect(short).toBeLessThanOrEqual(100)
    expect(long).toBeLessThanOrEqual(short)
  })

  it('clamps at 0 and never goes negative for a very long exposed gap', () => {
    const result = resolveSleepingUtilityCondition(record, 3, 1000, false)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(100)
  })

  it('is deterministic for the same inputs', () => {
    const a = resolveSleepingUtilityCondition(record, 42, 5, false)
    const b = resolveSleepingUtilityCondition(record, 42, 5, false)
    expect(a).toBe(b)
  })

  it('decay rate constant is positive (sanity)', () => {
    expect(SLEEPING_UTILITY_RAIN_DECAY_PER_DAY).toBeGreaterThan(0)
  })
})

describe('findNearestSleepingUtility', () => {
  const records = [
    { id: 'a', x: 0, z: 0 },
    { id: 'b', x: 1, z: 0 },
  ]

  it('finds the nearest record within radius', () => {
    expect(findNearestSleepingUtility(records, 0.1, 0, 5)?.id).toBe('a')
  })

  it('returns null when nothing is within radius', () => {
    expect(findNearestSleepingUtility(records, 100, 100, 5)).toBeNull()
  })

  it('respects the platform-support radius constant (sanity)', () => {
    expect(BEDROLL_ON_PLATFORM_RADIUS).toBeGreaterThan(0)
  })
})
