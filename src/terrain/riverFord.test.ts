import { describe, expect, it } from 'vitest'
import { FORD_WATER_DEPTH, fordBedHeight, fordStrength } from './riverFord'

describe('fordStrength', () => {
  it('is zero away from any road corridor', () => {
    expect(fordStrength(0, 2)).toBe(0)
    expect(fordStrength(-0.1, 2)).toBe(0)
  })

  it('fords a small stream crossing at full corridor strength', () => {
    expect(fordStrength(1, 1.5)).toBeCloseTo(1, 5)
  })

  it('never fords a wide river, however strong the corridor', () => {
    expect(fordStrength(1, 9)).toBe(0)
    expect(fordStrength(1, 11)).toBe(0)
  })

  it('fades out smoothly with channel width rather than switching off', () => {
    const widths = [5, 6, 6.5, 7, 8, 8.5, 9]
    const values = widths.map((w) => fordStrength(1, w))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!)
    }
    expect(values[2]!).toBeGreaterThan(0)
    expect(values[2]!).toBeLessThan(1)
  })

  it('is monotonic in corridor falloff, so a crossing has no lateral jump', () => {
    const falloffs = [0.1, 0.25, 0.4, 0.6, 0.8, 1]
    const values = falloffs.map((f) => fordStrength(f, 2))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!)
    }
  })
})

describe('fordBedHeight', () => {
  it('leaves the bed untouched with no ford', () => {
    expect(fordBedHeight(-2, 0, 0)).toBe(-2)
  })

  it('raises a fully forded bed to a shallow water column below the surface', () => {
    expect(fordBedHeight(-2, 0, 1)).toBeCloseTo(-FORD_WATER_DEPTH, 6)
  })

  it('keeps the bed strictly below the (unchanged) water surface', () => {
    for (const ford of [0.05, 0.3, 0.7, 1]) {
      expect(fordBedHeight(-2, 0, ford)).toBeLessThan(0)
    }
  })

  it('never lowers a bed that is already shallower than the ford target', () => {
    // Bed only 0.05 below the surface — shallower than FORD_WATER_DEPTH.
    expect(fordBedHeight(-0.05, 0, 1)).toBe(-0.05)
  })

  it('interpolates monotonically with ford strength', () => {
    const values = [0, 0.2, 0.5, 0.8, 1].map((f) => fordBedHeight(-2, 0, f))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!)
    }
  })
})
