import { describe, expect, it } from 'vitest'
import { SKILL_MIN_VALUE } from '../player/PlayerSkills'
import {
  type CampRestContext,
  campRestQuality,
  hasTentNear,
  hasWarmFireNear,
  TENT_SHELTER_RADIUS,
  WARM_FIRE_RADIUS,
} from './campRest'

const fire = (x: number, z: number, lit: boolean) => ({ x, z, fire: { isLit: () => lit } })

const context = (over: Partial<CampRestContext> = {}): CampRestContext => ({
  hasBlanket: true,
  hasTent: false,
  hasWarmFire: false,
  ...over,
})

describe('hasWarmFireNear', () => {
  it('finds a lit fire inside the radius', () => {
    expect(hasWarmFireNear([fire(2, 1, true)], 0, 0)).toBe(true)
  })

  it('ignores an extinguished fire however close it is', () => {
    expect(hasWarmFireNear([fire(0, 0, false)], 0, 0)).toBe(false)
  })

  it('ignores a lit fire beyond the radius', () => {
    expect(hasWarmFireNear([fire(WARM_FIRE_RADIUS + 1, 0, true)], 0, 0)).toBe(false)
  })

  it('is false with no fires at all', () => {
    expect(hasWarmFireNear([], 0, 0)).toBe(false)
  })
})

describe('hasTentNear', () => {
  it('accepts a tent inside the shelter radius and rejects a distant one', () => {
    expect(hasTentNear([{ x: 1, z: 1 }], 0, 0)).toBe(true)
    expect(hasTentNear([{ x: TENT_SHELTER_RADIUS + 1, z: 0 }], 0, 0)).toBe(false)
  })
})

describe('campRestQuality', () => {
  const survival = 0

  it('ranks the four plan 128 §6 combinations', () => {
    const blanket = campRestQuality(context(), survival)
    const blanketFire = campRestQuality(context({ hasWarmFire: true }), survival)
    const blanketTent = campRestQuality(context({ hasTent: true }), survival)
    const full = campRestQuality(context({ hasTent: true, hasWarmFire: true }), survival)

    expect(blanket).toBeLessThan(blanketFire)
    expect(blanketFire).toBeLessThan(blanketTent)
    expect(blanketTent).toBeLessThan(full)
    expect(full).toBe(1)
  })

  it('gives the worst outcome to no bedding at all', () => {
    expect(campRestQuality(context({ hasBlanket: false }), survival))
      .toBeLessThan(campRestQuality(context(), survival))
  })

  it('lets Survival reduce, but never erase, the blanket-only penalty', () => {
    const novice = campRestQuality(context(), SKILL_MIN_VALUE)
    const expert = campRestQuality(context(), 1)
    expect(expert).toBeGreaterThan(novice)
    expect(expert).toBeLessThan(1)
  })

  it('keeps a full camp at 1 regardless of Survival', () => {
    const full = context({ hasTent: true, hasWarmFire: true })
    expect(campRestQuality(full, 0)).toBe(1)
    expect(campRestQuality(full, 1)).toBe(1)
  })

  it('stays inside [0,1] for out-of-range Survival input', () => {
    for (const value of [-5, 0, 0.5, 5]) {
      const quality = campRestQuality(context(), value)
      expect(quality).toBeGreaterThan(0)
      expect(quality).toBeLessThanOrEqual(1)
    }
  })
})
