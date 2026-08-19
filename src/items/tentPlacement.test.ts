import { describe, expect, it } from 'vitest'
import { evaluateTentPlacement } from './tentPlacement'

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
})
