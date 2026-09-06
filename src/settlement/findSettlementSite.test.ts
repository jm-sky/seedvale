import { describe, expect, it } from 'vitest'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import { villageSizeConfig } from './families'
import { findSettlementSite, SITE_RIVER_CLEARANCE, SITE_SCORE_WEIGHTS } from './findSettlementSite'
import { SETTLEMENT_WATER_MARGIN } from './pathDryness'

const WATER = 0
const HALF = 56
const MD_FOOTPRINT = {
  footprintRadius: villageSizeConfig('MD').footprintRadius,
  houseRingMax: villageSizeConfig('MD').houseRingMax,
}
const XL_FOOTPRINT = {
  footprintRadius: villageSizeConfig('XL').footprintRadius,
  houseRingMax: villageSizeConfig('XL').houseRingMax,
}

function requireSite(...args: Parameters<typeof findSettlementSite>) {
  const site = findSettlementSite(...args)
  expect(site).not.toBeNull()
  return site!
}

describe('findSettlementSite footprint scoring (plan 047 §6)', () => {
  it('exposes a single central weight table including resource attraction', () => {
    expect(SITE_SCORE_WEIGHTS.resourceAttraction).toBe(3)
    expect(SITE_SCORE_WEIGHTS.footprintDryRatio).toBeGreaterThan(0)
    expect(SITE_SCORE_WEIGHTS.pathDryRatio).toBeGreaterThan(0)
  })

  it('is deterministic for the same seed/height field', () => {
    const height = (x: number, z: number) => 10 + Math.sin(x * 0.05) * 0.2 + Math.cos(z * 0.05) * 0.2
    const a = requireSite(height, WATER, HALF, 123, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)
    const b = requireSite(height, WATER, HALF, 123, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)
    expect(a).toEqual(b)
  })

  it('prefers the flat dry plateau over a steep slope when footprint is scored', () => {
    // Left half: steep (local flatness often fails; ring deltas large).
    // Right half: flat plateau. Search margin (±24) covers both.
    const height = (x: number, _z: number) => (x < 0 ? 10 + (-x) * 0.55 : 10)
    const site = requireSite(height, WATER, HALF, 42, { x: 0, z: 0 }, undefined, XL_FOOTPRINT)
    expect(site.x).toBeGreaterThan(0)
  })

  it('avoids centering a village where most of the footprint is open water', () => {
    // +X half is underwater; dry land is on −X. Footprint samples on the wet
    // side destroy dryRatio / pathDryRatio for candidates near +X.
    const height = (x: number, _z: number) => (x > 4 ? WATER - 1 : 12)
    const site = requireSite(height, WATER, HALF, 7, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)
    expect(site.x).toBeLessThan(0)
    expect(site.y).toBeGreaterThan(WATER + SETTLEMENT_WATER_MARGIN)
  })

  it('still rejects wet plaza centers even without footprint hint', () => {
    const height = (x: number, z: number) => (Math.hypot(x, z) < 8 ? WATER - 1 : 12)
    const site = requireSite(height, WATER, HALF, 99, { x: 0, z: 0 })
    expect(Math.hypot(site.x, site.z)).toBeGreaterThan(7)
    expect(site.y).toBeGreaterThan(WATER + SETTLEMENT_WATER_MARGIN)
  })

  it('resource attraction ranks among already-accepted dry candidates only', () => {
    const height = () => 12
    const pullEast = (x: number, _z: number) => (x > 5 ? 1 : 0)
    const site = requireSite(height, WATER, HALF, 11, { x: 0, z: 0 }, pullEast, MD_FOOTPRINT)
    expect(site.x).toBeGreaterThan(0)
  })

  it('returns null when the whole search box is underwater', () => {
    expect(findSettlementSite(() => WATER - 1, WATER, HALF, 1, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)).toBeNull()
  })
})

describe('findSettlementSite river channel avoidance', () => {
  /** Channel running along world X through the search box. Its bed (11) is far
   *  above `WATER`, so height sampling alone reads the whole box as dry land —
   *  exactly the mountain-stream case `sampleHeight + waterLevel` cannot see. */
  const riverSeg: RiverChannelSegment = {
    ax: -200,
    az: 0,
    aBedH: 11,
    aWaterH: 11.6,
    aWaterHalfWidth: 3,
    aChannelHalfWidth: 6,
    bx: 200,
    bz: 0,
    bBedH: 11,
    bWaterH: 11.6,
    bWaterHalfWidth: 3,
    bChannelHalfWidth: 6,
  }
  const flat = () => 12

  it('keeps the plaza core clear of the channel', () => {
    const site = requireSite(
      flat, WATER, HALF, 4242, { x: 0, z: 0 }, undefined, MD_FOOTPRINT, undefined, [riverSeg],
    )
    expect(Math.abs(site.z) - riverSeg.aWaterHalfWidth).toBeGreaterThanOrEqual(SITE_RIVER_CLEARANCE)
  })

  it('would otherwise happily centre on the channel', () => {
    const withRiver = requireSite(
      flat, WATER, HALF, 4242, { x: 0, z: 0 }, undefined, MD_FOOTPRINT, undefined, [riverSeg],
    )
    const withoutRiver = requireSite(flat, WATER, HALF, 4242, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)
    expect(withRiver).not.toEqual(withoutRiver)
  })

  it('stays deterministic with river segments', () => {
    const a = requireSite(flat, WATER, HALF, 77, { x: 0, z: 0 }, undefined, MD_FOOTPRINT, undefined, [riverSeg])
    const b = requireSite(flat, WATER, HALF, 77, { x: 0, z: 0 }, undefined, MD_FOOTPRINT, undefined, [riverSeg])
    expect(a).toEqual(b)
  })
})
