import { describe, expect, it } from 'vitest'
import {
  assessHealthRatio,
  assessStaminaRatio,
  formatPhysicalAssessment,
  observationRangeScale,
  resolveObservationLevel,
  resolveStableObservationLevel,
  stabilizeObservationLevel,
} from './observation'

describe('observationRangeScale', () => {
  it('anchors neutral perception at 1.0', () => {
    expect(observationRangeScale(0.5)).toBe(1)
  })

  it('gives player 0.6 only a modest advantage over neutral', () => {
    expect(observationRangeScale(0.6)).toBeCloseTo(1.04)
    expect(observationRangeScale(0.6) - observationRangeScale(0.5)).toBeLessThan(0.1)
  })

  it('clamps at 0.0 and 1.0 bounds', () => {
    expect(observationRangeScale(0)).toBe(0.8)
    expect(observationRangeScale(1)).toBeCloseTo(1.2)
    expect(observationRangeScale(-5)).toBe(0.8)
    expect(observationRangeScale(5)).toBeCloseTo(1.2)
  })
})

describe('resolveObservationLevel', () => {
  it('uses neutral baselines at perception 0.5', () => {
    expect(resolveObservationLevel({ perception: 0.5, distance: 20 })).toBe('detailed')
    expect(resolveObservationLevel({ perception: 0.5, distance: 26 })).toBe('assessed')
    expect(resolveObservationLevel({ perception: 0.5, distance: 32 })).toBe('basic')
    expect(resolveObservationLevel({ perception: 0.5, distance: 32.01 })).toBe('none')
  })

  it('improves capability with higher perception', () => {
    expect(resolveObservationLevel({ perception: 0.6, distance: 20.5 })).toBe('detailed')
    expect(resolveObservationLevel({ perception: 0.5, distance: 20.5 })).toBe('assessed')
  })

  it('reduces capability with lower perception', () => {
    expect(resolveObservationLevel({ perception: 0.0, distance: 16 })).toBe('detailed')
    expect(resolveObservationLevel({ perception: 0.5, distance: 16 })).toBe('detailed')
    expect(resolveObservationLevel({ perception: 0.0, distance: 20.8 })).toBe('assessed')
  })

  it('is monotonic with distance at fixed perception', () => {
    const levels = [0, 10, 20, 24, 28, 32, 40].map((distance) =>
      resolveObservationLevel({ perception: 0.5, distance }),
    )
    for (let i = 1; i < levels.length; i++) {
      const prevRank = ['none', 'basic', 'assessed', 'detailed'].indexOf(levels[i - 1]!)
      const nextRank = ['none', 'basic', 'assessed', 'detailed'].indexOf(levels[i]!)
      expect(nextRank).toBeLessThanOrEqual(prevRank)
    }
  })
})

describe('stabilizeObservationLevel', () => {
  const input = { perception: 0.5, distance: 20.5 }

  it('promotes immediately when entering a better range', () => {
    expect(stabilizeObservationLevel('detailed', 'assessed', { perception: 0.5, distance: 19 })).toBe('detailed')
  })

  it('delays downgrade near the detailed boundary', () => {
    expect(stabilizeObservationLevel('assessed', 'detailed', input)).toBe('detailed')
    expect(stabilizeObservationLevel('assessed', 'detailed', { perception: 0.5, distance: 20.76 })).toBe('assessed')
  })

  it('delays downgrade near the assessed boundary', () => {
    expect(stabilizeObservationLevel('basic', 'assessed', { perception: 0.5, distance: 26.5 })).toBe('assessed')
    expect(stabilizeObservationLevel('basic', 'assessed', { perception: 0.5, distance: 26.76 })).toBe('basic')
  })

  it('delays downgrade near the basic boundary', () => {
    expect(stabilizeObservationLevel('none', 'basic', { perception: 0.5, distance: 32.5 })).toBe('basic')
    expect(stabilizeObservationLevel('none', 'basic', { perception: 0.5, distance: 32.76 })).toBe('none')
  })
})

describe('resolveStableObservationLevel', () => {
  it('combines resolve + stabilize', () => {
    expect(resolveStableObservationLevel({ perception: 0.5, distance: 20 }, null)).toBe('detailed')
    expect(resolveStableObservationLevel({ perception: 0.5, distance: 20.5 }, 'detailed')).toBe('detailed')
    expect(resolveStableObservationLevel({ perception: 0.5, distance: 20.8 }, 'detailed')).toBe('assessed')
  })
})

describe('qualitative physical assessment', () => {
  it('classifies health at threshold edges', () => {
    expect(assessHealthRatio(0.75)).toBe('healthy')
    expect(assessHealthRatio(0.749)).toBe('hurt')
    expect(assessHealthRatio(0.40)).toBe('hurt')
    expect(assessHealthRatio(0.399)).toBe('badlyWounded')
    expect(assessHealthRatio(0.15)).toBe('badlyWounded')
    expect(assessHealthRatio(0.149)).toBe('critical')
  })

  it('classifies stamina at threshold edges', () => {
    expect(assessStaminaRatio(0.60)).toBe('fresh')
    expect(assessStaminaRatio(0.599)).toBe('tired')
    expect(assessStaminaRatio(0.25)).toBe('tired')
    expect(assessStaminaRatio(0.249)).toBe('exhausted')
  })

  it('formats assessed presentation text without exact numbers', () => {
    expect(formatPhysicalAssessment(0.8, 0.7)).toBe('Zdrowy · Wypoczęty')
    expect(formatPhysicalAssessment(0.1, 0.1)).toBe('Krytyczny · Wyczerpany')
    expect(formatPhysicalAssessment(1, 1)).not.toMatch(/\d/)
  })
})
