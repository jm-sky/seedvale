import { describe, expect, it } from 'vitest'
import { effectiveNoticeRange, isPlayerNoticed, type NoticeParams } from './playerAwareness'

const base: NoticeParams = {
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

describe('isPlayerNoticed', () => {
  it('always notices within the panic range, regardless of facing', () => {
    expect(isPlayerNoticed({ ...base, distance: 2, facingDot: -1 })).toBe(true)
  })

  it('notices within the effective range while facing the player', () => {
    expect(isPlayerNoticed({ ...base, distance: 10, facingDot: 0.5 })).toBe(true)
  })

  it('does not notice a player behind it, even within range', () => {
    expect(isPlayerNoticed({ ...base, distance: 10, facingDot: -0.5 })).toBe(false)
  })

  it('does not notice beyond the effective range even when facing the player', () => {
    expect(isPlayerNoticed({ ...base, distance: 20, facingDot: 1 })).toBe(false)
  })

  it('shrinks the facing-gated range at night, past which even a facing check fails', () => {
    // effectiveNoticeRange(15, 0, 0) = 7.5 — distance 10 is inside the base
    // daytime range but outside the nighttime one.
    expect(isPlayerNoticed({ ...base, distance: 10, facingDot: 1, dayFactor: 0 })).toBe(false)
  })
})
