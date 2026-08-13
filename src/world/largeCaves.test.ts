import { describe, expect, it } from 'vitest'
import { LARGE_CAVE_MIN_HOME_DIST, LARGE_CAVE_MIN_SEPARATION, pickLargeCaveSites } from './largeCaves'

describe('pickLargeCaveSites (plan 090)', () => {
  const hill = (x: number, z: number) => 12 + x * 0.25 + z * 0.05

  const input = {
    seed: 42,
    sampleHeight: hill,
    sampleContinentalness: () => 0.8,
    sampleMountainRidge: () => 0.1,
    waterLevel: 0,
    coastThreshold: 0.45,
    roadsNear: () => [],
    villages: [{ x: 0, z: 0, radius: 48 }],
    count: 8,
  }

  it('is deterministic for the same seed', () => {
    const a = pickLargeCaveSites(input)
    const b = pickLargeCaveSites(input)
    expect(a).toEqual(b)
  })

  it('keeps caves off the home village and spaced apart', () => {
    const sites = pickLargeCaveSites(input)
    expect(sites.length).toBeGreaterThan(0)
    for (const site of sites) {
      expect(Math.hypot(site.x, site.z)).toBeGreaterThanOrEqual(LARGE_CAVE_MIN_HOME_DIST)
      expect(site.length).toBeGreaterThanOrEqual(10)
      expect(site.length).toBeLessThanOrEqual(15)
    }
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const d = Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.z - sites[j]!.z)
        expect(d).toBeGreaterThanOrEqual(LARGE_CAVE_MIN_SEPARATION)
      }
    }
  })

  it('places nothing on a flat coastal plain', () => {
    const none = pickLargeCaveSites({
      ...input,
      sampleHeight: () => 1.2,
      sampleContinentalness: () => 0.2,
    })
    expect(none).toEqual([])
  })
})
