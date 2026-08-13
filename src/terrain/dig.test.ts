import { describe, expect, it } from 'vitest'
import {
  canLevelAt,
  DIG_DEPTH_ROCK,
  type DigEnv,
  getDigProfileAt,
  getRockDigProfileAt,
  isRockGround,
  resolveDigStone,
  STONE_CHANCE_ROCK,
  STONE_NOTICE_CHANCE,
} from './dig'

const WATER_LEVEL = 2

function env(overrides: Partial<DigEnv> = {}): DigEnv {
  return {
    sampleHeight: () => WATER_LEVEL + 2,
    sampleMountainRidge: () => 0,
    waterLevel: WATER_LEVEL,
    seed: 42,
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

  it('tags ordinary dry land as soil', () => {
    expect(getDigProfileAt(0, 0, env())?.surface).toBe('soil')
  })
})

describe('getRockDigProfileAt', () => {
  it('returns a rock profile on mountain ridges', () => {
    const profile = getRockDigProfileAt(0, 0, env({ sampleMountainRidge: () => 0.5 }))
    expect(profile).toEqual({
      depth: DIG_DEPTH_ROCK,
      stoneChance: STONE_CHANCE_ROCK,
      surface: 'rock',
    })
  })

  it('rejects soil, sand, water and foothills', () => {
    expect(getRockDigProfileAt(0, 0, env())).toBeNull()
    expect(getRockDigProfileAt(0, 0, env({ sampleMountainRidge: () => 0.1 }))).toBeNull()
    expect(getRockDigProfileAt(0, 0, env({
      sampleHeight: () => WATER_LEVEL - 1,
      sampleMountainRidge: () => 0.9,
    }))).toBeNull()
  })
})

describe('isRockGround', () => {
  it('matches the shovel-reject ridge threshold', () => {
    expect(isRockGround(0, 0, env({ sampleMountainRidge: () => 0.3 }))).toBe(false)
    expect(isRockGround(0, 0, env({ sampleMountainRidge: () => 0.31 }))).toBe(true)
  })
})

describe('canLevelAt', () => {
  it('is true when runtime height is below base by more than LEVEL_EPS', () => {
    expect(canLevelAt(0, 0, { sampleHeight: () => 9.5, sampleBaseHeight: () => 10 })).toBe(true)
  })

  it('is false when nearly at base', () => {
    expect(canLevelAt(0, 0, { sampleHeight: () => 9.98, sampleBaseHeight: () => 10 })).toBe(false)
  })
})

describe('resolveDigStone', () => {
  it('returns none when the find roll fails', () => {
    expect(resolveDigStone(0.5, true, () => 0.9)).toEqual({ kind: 'none' })
  })

  it('drops on the ground when inventory is full', () => {
    expect(resolveDigStone(1, false, () => 0)).toEqual({ kind: 'ground', reason: 'full' })
  })

  it('drops unnoticed when notice roll fails', () => {
    const rolls = [0, STONE_NOTICE_CHANCE]
    expect(resolveDigStone(1, true, () => rolls.shift()!)).toEqual({ kind: 'ground', reason: 'unnoticed' })
  })

  it('adds to inventory when found and noticed', () => {
    const rolls = [0, 0]
    expect(resolveDigStone(1, true, () => rolls.shift()!)).toEqual({ kind: 'inventory' })
  })
})
