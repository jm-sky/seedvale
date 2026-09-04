import { describe, expect, it } from 'vitest'
import { evaluateTentPlacement, PLACEMENT_WATER_MARGIN, WATER_MARGIN } from './tentPlacement'

const flat = () => 4

describe('evaluateTentPlacement (plan 090)', () => {
  const base = {
    x: 0,
    z: 0,
    sampleHeight: flat,
    waterLevel: 0,
    blockers: [] as const,
    otherTents: [] as const,
  }

  it('accepts dry, flat, empty ground', () => {
    expect(evaluateTentPlacement(base)).toBe('ok')
  })

  it('rejects water and shoreline', () => {
    expect(evaluateTentPlacement({ ...base, sampleHeight: () => 0.2, waterLevel: 0 })).toBe('water')
  })

  it('rejects a steep slope', () => {
    const slope = (x: number) => 4 + x * 0.8
    expect(evaluateTentPlacement({ ...base, sampleHeight: slope })).toBe('slope')
  })

  it('accepts a site that would sit on a road corridor (issue 035)', () => {
    expect(evaluateTentPlacement(base)).toBe('ok')
  })

  it('rejects overlap with another tent or a nearby object', () => {
    expect(evaluateTentPlacement({ ...base, otherTents: [{ x: 0.5, z: 0 }] })).toBe('tent')
    expect(evaluateTentPlacement({
      ...base,
      blockers: [{ x: 0.4, z: 0, radius: 1 }],
    })).toBe('object')
  })

  describe('placement shoreline margin (plan world-010)', () => {
    it('uses a placement-specific margin distinct from terrain preparation\'s WATER_MARGIN', () => {
      expect(PLACEMENT_WATER_MARGIN).toBeLessThan(WATER_MARGIN)
    })

    it('accepts flat ground inside the old 0.8 clearance but outside the new placement clearance', () => {
      expect(evaluateTentPlacement({ ...base, sampleHeight: () => 0.5, waterLevel: 0 })).toBe('ok')
    })

    it('rejects ground right at the new placement clearance boundary', () => {
      expect(evaluateTentPlacement({ ...base, sampleHeight: () => 0.2, waterLevel: 0 })).toBe('water')
    })

    it('rejects a footprint whose edge dips into water even though its centre is on dry land', () => {
      const waterPocket = (x: number, z: number) => (Math.hypot(x - 1, z - 1) < 0.4 ? -1 : 3)
      expect(evaluateTentPlacement({ ...base, sampleHeight: waterPocket, waterLevel: 0 })).toBe('water')
    })

    it('rejects steep ground near the shoreline as slope, not water', () => {
      const steepNearShore = (x: number) => 3 + x * 0.8
      expect(evaluateTentPlacement({ ...base, sampleHeight: steepNearShore, waterLevel: 0 })).toBe('slope')
    })
  })
})
