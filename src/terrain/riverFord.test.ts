import { describe, expect, it } from 'vitest'
import { FORD_WATER_DEPTH, fordBedHeight, fordInfluenceAt, type FordProjection } from './riverFord'

/** A square 10 m × 5 m ford footprint running along +X, centred on the origin. */
const ford: FordProjection = { x: 0, z: 0, dirX: 1, dirZ: 0, halfLength: 10, halfWidth: 5 }

describe('fordInfluenceAt', () => {
  it('is zero with no declared crossing at all', () => {
    expect(fordInfluenceAt(0, 0, [])).toBe(0)
  })

  it('is full strength on the crossing anchor', () => {
    expect(fordInfluenceAt(0, 0, [ford])).toBeCloseTo(1, 6)
  })

  it('is zero outside the declared footprint, however close the road passes', () => {
    expect(fordInfluenceAt(12, 0, [ford])).toBe(0)
    expect(fordInfluenceAt(0, 6, [ford])).toBe(0)
  })

  it('tapers monotonically toward the footprint rim rather than cutting off', () => {
    const values = [0, 2, 4, 6, 8, 9.5].map((x) => fordInfluenceAt(x, 0, [ford]))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!)
    }
    expect(values[values.length - 1]!).toBeLessThan(0.05)
    expect(values[2]!).toBeGreaterThan(0)
  })

  it('follows the road direction, not the world axes', () => {
    const rotated: FordProjection = { ...ford, dirX: 0, dirZ: 1 }
    expect(fordInfluenceAt(0, 8, [rotated])).toBeGreaterThan(0)
    expect(fordInfluenceAt(8, 0, [rotated])).toBe(0)
  })

  it('takes the strongest of overlapping crossings rather than summing them', () => {
    const other: FordProjection = { ...ford, x: 6 }
    expect(fordInfluenceAt(3, 0, [ford, other])).toBeLessThanOrEqual(1)
    expect(fordInfluenceAt(0, 0, [ford, other])).toBeCloseTo(1, 6)
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
