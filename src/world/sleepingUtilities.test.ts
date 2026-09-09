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
    expect(resolveSleepingUtilityCondition(record, 1, 0, 0)).toBe(100)
  })

  it('never decays while fully sheltered, however much time elapses', () => {
    expect(resolveSleepingUtilityCondition(record, 1, 50, 1)).toBe(100)
  })

  it('decays when exposed, and decays at least as much as a shorter exposure', () => {
    const short = resolveSleepingUtilityCondition(record, 7, 1, 0)
    const long = resolveSleepingUtilityCondition(record, 7, 8, 0)
    expect(short).toBeLessThanOrEqual(100)
    expect(long).toBeLessThanOrEqual(short)
  })

  it('scales exposure by shelter factor: 0% / 50% / 100%', () => {
    const exposed = resolveSleepingUtilityCondition(record, 7, 8, 0)
    const half = resolveSleepingUtilityCondition(record, 7, 8, 0.5)
    const sheltered = resolveSleepingUtilityCondition(record, 7, 8, 1)
    expect(sheltered).toBe(100)
    expect(exposed).toBeLessThanOrEqual(100)
    expect(half).toBeCloseTo(100 - (100 - exposed) * 0.5)
  })

  it('clamps at 0 and never goes negative for a very long exposed gap', () => {
    const result = resolveSleepingUtilityCondition(record, 3, 1000, 0)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(100)
  })

  it('is deterministic for the same inputs', () => {
    const a = resolveSleepingUtilityCondition(record, 42, 5, 0)
    const b = resolveSleepingUtilityCondition(record, 42, 5, 0)
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
