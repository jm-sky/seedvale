import { describe, expect, it } from 'vitest'
import { SKILL_MIN_VALUE } from '../player/PlayerSkills'
import {
  CAMP_REST_BASE_QUALITY,
  type CampRestContext,
  campRestQuality,
  explainCampRest,
  hasTentNear,
  hasWarmFireNear,
  TENT_SHELTER_RADIUS,
  tentShelterFactor,
  WARM_FIRE_RADIUS,
} from './campRest'

const fire = (x: number, z: number, lit: boolean) => ({ x, z, fire: { isLit: () => lit } })

const context = (over: Partial<CampRestContext> = {}): CampRestContext => ({
  hasBlanket: true,
  hasWarmFire: false,
  tentCondition: 0,
  bedrollCondition: 0,
  platformCondition: 0,
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

describe('tentShelterFactor', () => {
  it('maps 0/50/100 to 0/0.5/1 with no thresholds', () => {
    expect(tentShelterFactor(0)).toBe(0)
    expect(tentShelterFactor(50)).toBe(0.5)
    expect(tentShelterFactor(100)).toBe(1)
  })
})

describe('campRestQuality', () => {
  const survival = 0

  it('ranks the four plan 128 §6 combinations at full tent condition', () => {
    const blanket = campRestQuality(context(), survival)
    const blanketFire = campRestQuality(context({ hasWarmFire: true }), survival)
    const blanketTent = campRestQuality(context({ tentCondition: 100 }), survival)
    const full = campRestQuality(context({ tentCondition: 100, hasWarmFire: true }), survival)

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
    const full = context({ tentCondition: 100, hasWarmFire: true })
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

  it('preserves balance endpoints at tent 0% and 100%', () => {
    expect(campRestQuality(context({ hasBlanket: false, tentCondition: 0 }), 0)).toBe(CAMP_REST_BASE_QUALITY.rough)
    expect(campRestQuality(context({ hasBlanket: false, tentCondition: 100 }), 0)).toBe(CAMP_REST_BASE_QUALITY.tentOnly)
    expect(campRestQuality(context({ tentCondition: 0 }), 0)).toBe(CAMP_REST_BASE_QUALITY.blanket)
    expect(campRestQuality(context({ tentCondition: 100 }), 0)).toBe(CAMP_REST_BASE_QUALITY.blanketTent)
    expect(campRestQuality(context({ hasWarmFire: true, tentCondition: 0 }), 0)).toBe(CAMP_REST_BASE_QUALITY.blanketFire)
    expect(campRestQuality(context({ hasWarmFire: true, tentCondition: 100 }), 0)).toBe(CAMP_REST_BASE_QUALITY.full)
  })

  it('interpolates tent 50% halfway between no-tent and full-tent endpoints', () => {
    const rough = CAMP_REST_BASE_QUALITY.rough
    const tentOnly = CAMP_REST_BASE_QUALITY.tentOnly
    expect(campRestQuality(context({ hasBlanket: false, tentCondition: 50 }), 0)).toBeCloseTo((rough + tentOnly) / 2)

    const blanket = CAMP_REST_BASE_QUALITY.blanket
    const blanketTent = CAMP_REST_BASE_QUALITY.blanketTent
    expect(campRestQuality(context({ tentCondition: 50 }), 0)).toBeCloseTo((blanket + blanketTent) / 2)

    const blanketFire = CAMP_REST_BASE_QUALITY.blanketFire
    const full = CAMP_REST_BASE_QUALITY.full
    expect(campRestQuality(context({ hasWarmFire: true, tentCondition: 50 }), 0)).toBeCloseTo((blanketFire + full) / 2)
  })

  it('treats tent 0% as exactly the no-tent result', () => {
    expect(campRestQuality(context({ tentCondition: 0 }), 0)).toBe(campRestQuality(context(), 0))
  })

  describe('bedroll bonus (plan items-player-013 / items-player-018)', () => {
    it('leaves a full camp (tent+blanket+fire) at exactly 1, bedroll or not', () => {
      const full = context({ tentCondition: 100, hasWarmFire: true })
      const fullWithBedroll = context({ tentCondition: 100, hasWarmFire: true, bedrollCondition: 100, platformCondition: 100 })
      expect(campRestQuality(full, survival)).toBe(1)
      expect(campRestQuality(fullWithBedroll, survival)).toBe(1)
    })

    it('a bedroll improves quality over the same setup without one', () => {
      const withoutBedroll = campRestQuality(context({ tentCondition: 100 }), survival)
      const withBedroll = campRestQuality(context({ tentCondition: 100, bedrollCondition: 100 }), survival)
      expect(withBedroll).toBeGreaterThan(withoutBedroll)
    })

    it('a raised bedroll (on a platform) beats the same bedroll on the ground', () => {
      const ground = campRestQuality(context({ tentCondition: 100, hasWarmFire: true, bedrollCondition: 100 }), survival)
      const raised = campRestQuality(context({ tentCondition: 100, hasWarmFire: true, bedrollCondition: 100, platformCondition: 100 }), survival)
      expect(raised).toBeGreaterThanOrEqual(ground)
    })

    it('platform 0% matches no platform; 50% is halfway; 100% is full raised', () => {
      const setup = { tentCondition: 100, bedrollCondition: 100 }
      const none = campRestQuality(context({ ...setup, platformCondition: 0 }), survival)
      const half = campRestQuality(context({ ...setup, platformCondition: 50 }), survival)
      const full = campRestQuality(context({ ...setup, platformCondition: 100 }), survival)
      expect(none).toBe(campRestQuality(context(setup), survival))
      expect(half).toBeCloseTo((none + full) / 2)
      expect(full).toBeGreaterThan(none)
    })

    it('a degraded bedroll (condition 0) contributes nothing — a platform alone never grants anything', () => {
      const withoutBedroll = campRestQuality(context({ tentCondition: 100 }), survival)
      const zeroCondition = campRestQuality(context({ tentCondition: 100, bedrollCondition: 0, platformCondition: 100 }), survival)
      expect(zeroCondition).toBe(withoutBedroll)
    })

    it('never exceeds 1 even with every bonus stacked', () => {
      const stacked = context({ tentCondition: 100, hasBlanket: true, hasWarmFire: true, bedrollCondition: 100, platformCondition: 100 })
      expect(campRestQuality(stacked, 1)).toBe(1)
    })
  })

  it('explainCampRest quality matches campRestQuality for the same context', () => {
    const ctx = context({ tentCondition: 82, hasWarmFire: true, bedrollCondition: 71, platformCondition: 63 })
    expect(explainCampRest(ctx, 0.4).quality).toBe(campRestQuality(ctx, 0.4))
  })
})
