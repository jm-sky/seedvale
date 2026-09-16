import { describe, expect, it } from 'vitest'
import {
  classifyReputationLevel,
  reputationPresentation,
  type ReputationTone,
} from './reputationPresentation'

const LEVEL_BY_VALUE: ReadonlyArray<{ value: number, level: ReputationTone }> = [
  { value: -100, level: 'strong-negative' },
  { value: -50, level: 'strong-negative' },
  { value: -49, level: 'negative' },
  { value: -10, level: 'negative' },
  { value: -9, level: 'neutral' },
  { value: 0, level: 'neutral' },
  { value: 9, level: 'neutral' },
  { value: 10, level: 'positive' },
  { value: 49, level: 'positive' },
  { value: 50, level: 'strong-positive' },
  { value: 100, level: 'strong-positive' },
]

const RANGE_COUNTS: Record<ReputationTone, number> = {
  'strong-negative': 51,
  negative: 40,
  neutral: 19,
  positive: 40,
  'strong-positive': 51,
}

describe('classifyReputationLevel', () => {
  it('maps inclusive threshold edges to the plan levels', () => {
    for (const { value, level } of LEVEL_BY_VALUE) {
      expect(classifyReputationLevel(value), String(value)).toBe(level)
    }
  })

  it('assigns every allowed value to exactly one level', () => {
    const counts: Record<ReputationTone, number> = {
      'strong-negative': 0,
      negative: 0,
      neutral: 0,
      positive: 0,
      'strong-positive': 0,
    }
    for (let value = -100; value <= 100; value++) {
      counts[classifyReputationLevel(value)]++
    }
    expect(counts).toEqual(RANGE_COUNTS)
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(201)
  })
})

describe('reputationPresentation', () => {
  it('uses neuter labels for trust / Zaufanie', () => {
    expect(reputationPresentation(-50, 'neuter').label).toBe('Bardzo niskie')
    expect(reputationPresentation(-10, 'neuter').label).toBe('Niskie')
    expect(reputationPresentation(0, 'neuter').label).toBe('Neutralne')
    expect(reputationPresentation(10, 'neuter').label).toBe('Wysokie')
    expect(reputationPresentation(50, 'neuter').label).toBe('Bardzo wysokie')
  })

  it('uses feminine labels for the remaining dimensions', () => {
    expect(reputationPresentation(-50, 'feminine').label).toBe('Bardzo niska')
    expect(reputationPresentation(-10, 'feminine').label).toBe('Niska')
    expect(reputationPresentation(0, 'feminine').label).toBe('Neutralna')
    expect(reputationPresentation(10, 'feminine').label).toBe('Wysoka')
    expect(reputationPresentation(50, 'feminine').label).toBe('Bardzo wysoka')
  })
})
