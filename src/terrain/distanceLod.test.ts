import { describe, expect, it } from 'vitest'
import { densityLodFraction, grassFillerLodFraction } from './distanceLod'

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
  it('is only drawn in the near ring', () => {
    expect(grassFillerLodFraction(0, 1)).toBe(1)
    expect(grassFillerLodFraction(1, 1)).toBeGreaterThan(0)
    expect(grassFillerLodFraction(2, 1)).toBe(0)
  })
})
