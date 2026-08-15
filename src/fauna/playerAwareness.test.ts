import { describe, expect, it } from 'vitest'
import {
  detectionProbability,
  detectionRoll,
  effectiveNoticeRange,
  isPlayerNoticed,
  type NoticeParams,
  type PlayerStealthState,
  sneakDetectionMultiplier,
} from './playerAwareness'

const base: Omit<NoticeParams, 'roll'> = {
  distance: 5,
  facingDot: 1, // player dead ahead
  panicRange: 3,
  noticeRange: 15,
  dayFactor: 1, // full day
  forestFactor: 0, // open ground
  minFacingDot: 0.3,
}

describe('effectiveNoticeRange', () => {
  it('is unmodified in full daylight on open ground', () => {
    expect(effectiveNoticeRange(15, 1, 0)).toBe(15)
  })

  it('is halved at full night', () => {
    expect(effectiveNoticeRange(15, 0, 0)).toBeCloseTo(7.5)
  })

  it('is dampened, but never zeroed, by dense forest', () => {
    expect(effectiveNoticeRange(15, 1, 1)).toBeCloseTo(7.5)
  })

  it('combines night and forest without ever reaching zero', () => {
    expect(effectiveNoticeRange(15, 0, 1)).toBeCloseTo(3.75)
    expect(effectiveNoticeRange(15, 0, 1)).toBeGreaterThan(0)
  })
})

describe('detectionProbability', () => {
  it('is very high (~99%) at point-blank range', () => {
    expect(detectionProbability({ ...base, distance: 0 })).toBeCloseTo(0.99, 2)
  })

  it('stays very high near the panic range boundary', () => {
    expect(detectionProbability({ ...base, distance: base.panicRange })).toBeGreaterThan(0.85)
  })

  it('ignores facing entirely inside panic range — startled either way', () => {
    const front = detectionProbability({ ...base, distance: 1, facingDot: 1 })
    const behind = detectionProbability({ ...base, distance: 1, facingDot: -1 })
    expect(front).toBe(behind)
  })

  it('keeps a small but real chance far away while facing the player', () => {
    const p = detectionProbability({ ...base, distance: 14, facingDot: 1 })
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(0.1)
  })

  it('is zero at or beyond the effective notice range', () => {
    expect(detectionProbability({ ...base, distance: 15 })).toBe(0)
    expect(detectionProbability({ ...base, distance: 20 })).toBe(0)
  })

  it('decreases monotonically as distance grows beyond panic range', () => {
    const near = detectionProbability({ ...base, distance: 6 })
    const mid = detectionProbability({ ...base, distance: 9 })
    const far = detectionProbability({ ...base, distance: 12 })
    expect(near).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(far)
  })

  it('is usually low when the player is behind, even within range', () => {
    const p = detectionProbability({ ...base, distance: 10, facingDot: -1 })
    expect(p).toBeLessThan(0.05)
  })

  it('is clearly lower at the periphery than dead ahead', () => {
    const front = detectionProbability({ ...base, distance: 10, facingDot: 1 })
    const side = detectionProbability({ ...base, distance: 10, facingDot: 0 })
    const behind = detectionProbability({ ...base, distance: 10, facingDot: -1 })
    expect(front).toBeGreaterThan(side)
    expect(side).toBeGreaterThan(behind)
  })

  it('is highest when facing dead ahead, all else equal', () => {
    const p = (facingDot: number) => detectionProbability({ ...base, distance: 10, facingDot })
    expect(p(1)).toBeGreaterThan(p(0.5))
    expect(p(1)).toBeGreaterThan(p(-1))
  })

  it('night/forest still shrink the effective range past which probability is zero', () => {
    // effectiveNoticeRange(15, 0, 0) = 7.5 — distance 10 is inside the base
    // daytime range but outside the nighttime one.
    expect(detectionProbability({ ...base, distance: 10, facingDot: 1, dayFactor: 0 })).toBe(0)
  })
})

describe('detectionRoll', () => {
  it('is deterministic for the same animal/tick', () => {
    expect(detectionRoll('deer-1', 42)).toBe(detectionRoll('deer-1', 42))
  })

  it('changes across ticks for the same animal', () => {
    expect(detectionRoll('deer-1', 1)).not.toBe(detectionRoll('deer-1', 2))
  })

  it('produces a different pattern per animal', () => {
    const rolls = ['deer-1', 'deer-2', 'stag-1', 'rabbit-7'].map((id) => detectionRoll(id, 5))
    expect(new Set(rolls).size).toBe(rolls.length)
  })

  it('stays within [0, 1)', () => {
    for (let tick = 0; tick < 50; tick++) {
      const roll = detectionRoll('deer-1', tick)
      expect(roll).toBeGreaterThanOrEqual(0)
      expect(roll).toBeLessThan(1)
    }
  })
})

describe('isPlayerNoticed', () => {
  it('notices when the roll lands below the probability', () => {
    expect(isPlayerNoticed({ ...base, distance: 1, roll: 0 })).toBe(true)
  })

  it('does not notice when the roll lands at or above the probability', () => {
    expect(isPlayerNoticed({ ...base, distance: 10, facingDot: -1, roll: 0.5 })).toBe(false)
  })

  it('never notices beyond the effective range, regardless of roll', () => {
    expect(isPlayerNoticed({ ...base, distance: 20, roll: 0 })).toBe(false)
  })
})

describe('detectionProbability with stealthMultiplier (plan 124)', () => {
  it('is unaffected when stealthMultiplier is omitted', () => {
    expect(detectionProbability({ ...base, distance: 6 }))
      .toBe(detectionProbability({ ...base, distance: 6, stealthMultiplier: 1 }))
  })

  it('scales the far-range probability down', () => {
    const plain = detectionProbability({ ...base, distance: 10 })
    const stealthy = detectionProbability({ ...base, distance: 10, stealthMultiplier: 0.5 })
    expect(stealthy).toBeCloseTo(plain * 0.5)
  })

  it('also scales the close-range (panic) probability', () => {
    const plain = detectionProbability({ ...base, distance: 1 })
    const stealthy = detectionProbability({ ...base, distance: 1, stealthMultiplier: 0.5 })
    expect(stealthy).toBeCloseTo(plain * 0.5)
  })

  it('never re-opens detection beyond the effective notice range', () => {
    expect(detectionProbability({ ...base, distance: 20, stealthMultiplier: 0.1 })).toBe(0)
  })
})

describe('sneakDetectionMultiplier (plan 124 §4)', () => {
  const stealth = (overrides: Partial<PlayerStealthState>): PlayerStealthState => ({
    sneakValue: 0.5,
    sneakActive: true,
    movement: 'stationary',
    ...overrides,
  })

  it('is 1 (no effect) when Sneak is inactive, regardless of movement', () => {
    expect(sneakDetectionMultiplier(stealth({ sneakActive: false, movement: 'stationary' }))).toBe(1)
    expect(sneakDetectionMultiplier(stealth({ sneakActive: false, movement: 'sprinting' }))).toBe(1)
  })

  it('is 1 when the skill value is zero even if active', () => {
    expect(sneakDetectionMultiplier(stealth({ sneakValue: 0 }))).toBe(1)
  })

  it('reduces detection probability least while sprinting, most while stationary', () => {
    const stationary = sneakDetectionMultiplier(stealth({ movement: 'stationary' }))
    const moving = sneakDetectionMultiplier(stealth({ movement: 'moving' }))
    const sprinting = sneakDetectionMultiplier(stealth({ movement: 'sprinting' }))
    expect(stationary).toBeLessThan(moving)
    expect(moving).toBeLessThan(sprinting)
    expect(sprinting).toBeLessThan(1) // sprint still keeps some stealth benefit
  })

  it('never drops below 0 and never exceeds 1', () => {
    for (const movement of ['stationary', 'moving', 'sprinting'] as const) {
      for (const sneakValue of [0, 0.25, 0.5, 0.75, 1]) {
        const m = sneakDetectionMultiplier(stealth({ movement, sneakValue }))
        expect(m).toBeGreaterThanOrEqual(0)
        expect(m).toBeLessThanOrEqual(1)
      }
    }
  })

  it('feeding into detectionProbability makes a stationary sneaking player harder to detect', () => {
    const plain = detectionProbability({ ...base, distance: 10 })
    const withSneak = detectionProbability({
      ...base,
      distance: 10,
      stealthMultiplier: sneakDetectionMultiplier(stealth({ movement: 'stationary' })),
    })
    expect(withSneak).toBeLessThan(plain)
  })
})
