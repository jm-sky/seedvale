import { describe, expect, it } from 'vitest'
import { villageSizeConfig } from './families'
import { findSettlementSite, SITE_SCORE_WEIGHTS } from './findSettlementSite'

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

describe('findSettlementSite footprint scoring (plan 047 §6)', () => {
  it('exposes a single central weight table including resource attraction', () => {
    expect(SITE_SCORE_WEIGHTS.resourceAttraction).toBe(3)
    expect(SITE_SCORE_WEIGHTS.footprintDryRatio).toBeGreaterThan(0)
    expect(SITE_SCORE_WEIGHTS.pathDryRatio).toBeGreaterThan(0)
  })

  it('is deterministic for the same seed/height field', () => {
    const height = (x: number, z: number) => 10 + Math.sin(x * 0.05) * 0.2 + Math.cos(z * 0.05) * 0.2
    const a = findSettlementSite(height, WATER, HALF, 123, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)
    const b = findSettlementSite(height, WATER, HALF, 123, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)
    expect(a).toEqual(b)
  })

  it('prefers the flat dry plateau over a steep slope when footprint is scored', () => {
    // Left half: steep (local flatness often fails; ring deltas large).
    // Right half: flat plateau. Search margin (±24) covers both.
    const height = (x: number, _z: number) => (x < 0 ? 10 + (-x) * 0.55 : 10)
    const site = findSettlementSite(height, WATER, HALF, 42, { x: 0, z: 0 }, undefined, XL_FOOTPRINT)
    expect(site.x).toBeGreaterThan(0)
  })

  it('avoids centering a village where most of the footprint is open water', () => {
    // +X half is underwater; dry land is on −X. Footprint samples on the wet
    // side destroy dryRatio / pathDryRatio for candidates near +X.
    const height = (x: number, _z: number) => (x > 4 ? WATER - 1 : 12)
    const site = findSettlementSite(height, WATER, HALF, 7, { x: 0, z: 0 }, undefined, MD_FOOTPRINT)
    expect(site.x).toBeLessThan(0)
    expect(site.y).toBeGreaterThan(WATER + 0.8)
  })

  it('still rejects wet plaza centers even without footprint hint', () => {
    const height = (x: number, z: number) => (Math.hypot(x, z) < 8 ? WATER - 1 : 12)
    const site = findSettlementSite(height, WATER, HALF, 99, { x: 0, z: 0 })
    // Search can only accept candidates outside the wet disc, or fall back to
    // center (wet). With 80 tries in ±24, at least one dry local-flat spot
    // should win.
    expect(Math.hypot(site.x, site.z)).toBeGreaterThan(7)
    expect(site.y).toBeGreaterThan(WATER + 0.8)
  })

  it('resource attraction ranks among already-accepted dry candidates only', () => {
    const height = () => 12
    const pullEast = (x: number, _z: number) => (x > 5 ? 1 : 0)
    const site = findSettlementSite(height, WATER, HALF, 11, { x: 0, z: 0 }, pullEast, MD_FOOTPRINT)
    expect(site.x).toBeGreaterThan(0)
  })
})
