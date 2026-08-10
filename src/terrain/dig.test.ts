import { describe, expect, it } from 'vitest'
import { type DigEnv, getDigProfileAt } from './dig'

const WATER_LEVEL = 2

function env(overrides: Partial<DigEnv> = {}): DigEnv {
  return {
    sampleHeight: () => WATER_LEVEL + 2,
    sampleMountainRidge: () => 0,
    waterLevel: WATER_LEVEL,
    ...overrides,
  }
}

describe('getDigProfileAt', () => {
  it('returns a soil profile on ordinary dry land', () => {
    const profile = getDigProfileAt(0, 0, env())
    expect(profile).not.toBeNull()
  })

  it('returns a shallower, lower-chance profile near the shoreline (sand)', () => {
    const soil = getDigProfileAt(0, 0, env())!
    const sand = getDigProfileAt(0, 0, env({ sampleHeight: () => WATER_LEVEL + 0.3 }))!
    expect(sand).not.toBeNull()
    expect(sand.depth).toBeLessThan(soil.depth)
    expect(sand.stoneChance).toBeLessThan(soil.stoneChance)
  })

  it('rejects water/seabed', () => {
    expect(getDigProfileAt(0, 0, env({ sampleHeight: () => WATER_LEVEL - 1 }))).toBeNull()
  })

  it('rejects the immediate shoreline margin', () => {
    expect(getDigProfileAt(0, 0, env({ sampleHeight: () => WATER_LEVEL + 0.05 }))).toBeNull()
  })

  it('rejects mountain rock regardless of height', () => {
    expect(getDigProfileAt(0, 0, env({ sampleMountainRidge: () => 0.5 }))).toBeNull()
  })

  it('allows gentle foothills below the rock threshold', () => {
    expect(getDigProfileAt(0, 0, env({ sampleMountainRidge: () => 0.1 }))).not.toBeNull()
  })
})
