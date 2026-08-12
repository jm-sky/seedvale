import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyRoadTint,
  landBlendForSandBand,
  SAND_BAND_MAX,
  SAND_BAND_MIN,
  sandBandAt,
} from './biomeColors'

describe('sandBandAt', () => {
  it('stays within [SAND_BAND_MIN, SAND_BAND_MAX]', () => {
    const seed = 42
    for (let i = 0; i < 80; i++) {
      const wx = (i % 10) * 173.5 - 400
      const wz = Math.floor(i / 10) * 211.25 - 500
      const band = sandBandAt(wx, wz, seed)
      expect(band).toBeGreaterThanOrEqual(SAND_BAND_MIN)
      expect(band).toBeLessThanOrEqual(SAND_BAND_MAX)
    }
  })

  it('is deterministic for the same seed and world point', () => {
    const a = sandBandAt(120.5, -80.25, 7)
    const b = sandBandAt(120.5, -80.25, 7)
    expect(a).toBe(b)
  })

  it('varies spatially and across seeds', () => {
    const seed = 1337
    const near = sandBandAt(0, 0, seed)
    const far = sandBandAt(900, -700, seed)
    const otherSeed = sandBandAt(0, 0, seed + 1)
    // Not a hard requirement that every pair differs, but across these samples
    // at least one difference should appear for a working noise field.
    expect(near !== far || near !== otherSeed || far !== otherSeed).toBe(true)
  })

  it('grows land blend with wider beaches', () => {
    expect(landBlendForSandBand(SAND_BAND_MIN)).toBeCloseTo(0.35, 5)
    expect(landBlendForSandBand(SAND_BAND_MAX)).toBeGreaterThan(landBlendForSandBand(SAND_BAND_MIN))
  })
})

describe('applyRoadTint', () => {
  it('leaves color unchanged at zero tint', () => {
    const c = new Color(0x4f9a3e)
    const before = c.getHex()
    applyRoadTint(c, 0)
    expect(c.getHex()).toBe(before)
  })

  it('soft-onsets: mid tint moves toward dirt without fully replacing meadow', () => {
    const meadow = new Color(0x4f9a3e)
    const mid = meadow.clone()
    applyRoadTint(mid, 0.35, 10, 20)
    // Still some green left vs a hard lerp to dirt at the same strength.
    expect(mid.g).toBeGreaterThan(mid.r)
    expect(mid.getHex()).not.toBe(meadow.getHex())
  })

  it('is deterministic for the same world point', () => {
    const a = new Color(0x4f9a3e)
    const b = new Color(0x4f9a3e)
    applyRoadTint(a, 0.8, 12.5, -3.25)
    applyRoadTint(b, 0.8, 12.5, -3.25)
    expect(a.r).toBeCloseTo(b.r, 5)
    expect(a.g).toBeCloseTo(b.g, 5)
    expect(a.b).toBeCloseTo(b.b, 5)
  })
})
