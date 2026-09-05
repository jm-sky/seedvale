import { describe, expect, it } from 'vitest'
import { lakeProximityAt, nearestShoreProbePoint, resolveWaterBodyKind, shoreProbeHits } from './waterBodyKind'

describe('shoreProbeHits (plan 094)', () => {
  const flatAt = (h: number) => () => h

  it('is 0 for a point far from any water (all probes above threshold)', () => {
    expect(shoreProbeHits(0, 0, flatAt(10), 0)).toBe(0)
  })

  it('is 4 for a point fully submerged (all probes at/below threshold)', () => {
    expect(shoreProbeHits(0, 0, flatAt(-1), 0)).toBe(4)
  })

  it('is between 0 and 4 for a point straddling the shoreline', () => {
    // Water to the +x side only, dry land to -x/+z/-z.
    const sampleHeight = (x: number) => (x > 0 ? -1 : 10)
    const hits = shoreProbeHits(0, 0, sampleHeight, 0)
    expect(hits).toBeGreaterThan(0)
    expect(hits).toBeLessThan(4)
  })
})

describe('nearestShoreProbePoint (plan ui-input-006 ocean fishing fix)', () => {
  const flatAt = (h: number) => () => h

  it('is null for a point far from any water', () => {
    expect(nearestShoreProbePoint(5, -5, flatAt(10), 0)).toBeNull()
  })

  it('returns a real point distinct from the query position when water is nearby', () => {
    const point = nearestShoreProbePoint(5, -5, flatAt(-1), 0)
    expect(point).not.toBeNull()
    expect(point).not.toEqual({ x: 5, z: -5 })
    // Must be one of the actual probe offsets, not an arbitrary point.
    expect(Math.hypot(point!.x - 5, point!.z - (-5))).toBeCloseTo(1.5, 5)
  })

  it('only returns a point that actually reads as water', () => {
    // Water only on the +x side.
    const sampleHeight = (x: number) => (x > 5 ? -1 : 10)
    const point = nearestShoreProbePoint(5, 0, sampleHeight, 0)
    expect(point).toEqual({ x: 6.5, z: 0 })
  })
})

describe('resolveWaterBodyKind (plan ui-input-006)', () => {
  it('is lake when the shore probe hits and the point reads inland', () => {
    expect(resolveWaterBodyKind(true, 0, null)).toBe('lake')
  })

  it('is ocean when the shore probe hits and the point reads oceanic', () => {
    expect(resolveWaterBodyKind(true, 1, null)).toBe('ocean')
  })

  it('is river when within the shore margin of a river bank, even with no lake/ocean probe hit', () => {
    expect(resolveWaterBodyKind(false, 0, 0)).toBe('river')
    expect(resolveWaterBodyKind(false, 0, 1.5)).toBe('river')
  })

  it('is null away from any shoreline', () => {
    expect(resolveWaterBodyKind(false, 0, null)).toBeNull()
    expect(resolveWaterBodyKind(false, 0, 1.51)).toBeNull()
  })

  it('prefers the lake/ocean probe over a river reading at the same point', () => {
    expect(resolveWaterBodyKind(true, 0, 0)).toBe('lake')
  })
})

describe('lakeProximityAt (plan world-016)', () => {
  const region = { oceanThreshold: 0.3, coastThreshold: 0.5 }
  const inlandSamplers = (waterLevel: number, sampleHeight: (x: number, z: number) => number) => ({
    sampleHeight,
    sampleContinentalness: () => 1, // well inland, never ocean
    waterLevel,
    region,
  })

  it('is 0 with no water anywhere nearby', () => {
    const s = inlandSamplers(0, () => 10)
    expect(lakeProximityAt(0, 0, s)).toBe(0)
  })

  it('is 1 standing at/inside the lake', () => {
    const s = inlandSamplers(0, () => -1)
    expect(lakeProximityAt(0, 0, s)).toBe(1)
  })

  it('rises as the listener approaches a lake shore', () => {
    // Water beyond x = 30 only.
    const sampleHeight = (x: number) => (x > 30 ? -1 : 10)
    const s = inlandSamplers(0, sampleHeight)
    const far = lakeProximityAt(0, 0, s)
    const near = lakeProximityAt(20, 0, s)
    expect(far).toBe(0)
    expect(near).toBeGreaterThan(far)
    expect(near).toBeLessThanOrEqual(1)
  })

  it('is 0 near the ocean even where the shore-probe height check would read as water', () => {
    const s = {
      sampleHeight: () => -1,
      sampleContinentalness: () => 0, // unambiguously oceanic
      waterLevel: 0,
      region,
    }
    expect(lakeProximityAt(0, 0, s)).toBe(0)
  })
})
