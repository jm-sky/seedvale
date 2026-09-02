import { describe, expect, it } from 'vitest'
import { densityLodFraction, grassFillerLodFraction, grassGeometryLodTier } from './distanceLod'

describe('densityLodFraction', () => {
  it('keeps full density in the near field', () => {
    expect(densityLodFraction(0, 2, 1)).toBe(1)
    expect(densityLodFraction(0.7, 2, 1)).toBe(1)
  })

  it('reduces density at mid range and floors far chunks', () => {
    const mid = densityLodFraction(1.2, 2, 1)
    const far = densityLodFraction(2, 2, 1)
    expect(mid).toBeLessThan(1)
    expect(mid).toBeGreaterThan(far)
    expect(far).toBeCloseTo(0.08)
  })

  it('scales with lodScale without dropping below the far floor', () => {
    expect(densityLodFraction(0, 2, 0.5)).toBe(0.5)
    expect(densityLodFraction(2, 2, 0.5)).toBe(0.08)
  })
})

describe('grassFillerLodFraction', () => {
  it('is only drawn in the near ring when radius is 1 (coverage disabled)', () => {
    expect(grassFillerLodFraction(0, 1, 1)).toBe(1)
    expect(grassFillerLodFraction(1, 1, 1)).toBe(0)
    expect(grassFillerLodFraction(2, 1, 1)).toBe(0)
  })

  it('extends across a larger radius (grassFillerCoverage > 0)', () => {
    expect(grassFillerLodFraction(0, 3, 1)).toBe(1)
    const mid = grassFillerLodFraction(1.5, 3, 1)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(grassFillerLodFraction(3, 3, 1)).toBe(0)
  })

  it('scales with lodScale and treats radius <= 0 as fully off', () => {
    expect(grassFillerLodFraction(0, 2, 0.5)).toBe(0.5)
    expect(grassFillerLodFraction(0, 0, 1)).toBe(0)
  })
})

describe('grassGeometryLodTier', () => {
  it('shares densityLodFraction\'s near-field breakpoint', () => {
    expect(grassGeometryLodTier(0, 2)).toBe('near')
    expect(grassGeometryLodTier(0.7, 2)).toBe('near') // t = 0.35
  })

  it('steps down through mid before far', () => {
    expect(grassGeometryLodTier(1.2, 2)).toBe('mid') // t = 0.6
    expect(grassGeometryLodTier(1.4, 2)).toBe('mid') // t = 0.7, boundary is inclusive
    expect(grassGeometryLodTier(1.5, 2)).toBe('far') // t = 0.75
    expect(grassGeometryLodTier(2, 2)).toBe('far')
  })

  it('is independent of lodScale (only distance/radius matter)', () => {
    expect(grassGeometryLodTier(0, 2)).toBe('near')
    expect(grassGeometryLodTier(2, 2)).toBe('far')
  })
})
