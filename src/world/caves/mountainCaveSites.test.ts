/** Plan world-terrain-017 — dedicated mountain-site query reuses shared safety. */

import { describe, expect, it } from 'vitest'
import { caveSiteSafetyOk, pickLargeCaveSites } from '../largeCaves'
import { pickMountainCaveSite } from './mountainCaveSites'

const hill = (x: number, z: number) => 20 + x * 0.3 + z * 0.05

const baseInput = {
  seed: 42,
  sampleHeight: hill,
  sampleContinentalness: () => 0.8,
  sampleMountainRidge: () => 0.7,
  waterLevel: 0,
  coastThreshold: 0.45,
  roadsNear: () => [],
  villages: [{ x: 0, z: 0, radius: 48 }],
}

describe('pickMountainCaveSite', () => {
  it('can place a site on strong ridge terrain that generic siting rejects', () => {
    expect(pickLargeCaveSites({ ...baseInput, count: 8 })).toEqual([])
    const site = pickMountainCaveSite(baseInput, 400, 0, [])
    expect(site).not.toBeNull()
    expect(Math.hypot(site!.x, site!.z)).toBeGreaterThan(110)
    expect(caveSiteSafetyOk(site!.x, site!.z, baseInput, [], { allowMountainRidge: true })).toBe(true)
  })

  it('is deterministic for the same massif centre', () => {
    const a = pickMountainCaveSite(baseInput, 360, 40, [])
    const b = pickMountainCaveSite(baseInput, 360, 40, [])
    expect(a).toEqual(b)
  })
})
