import { describe, expect, it } from 'vitest'
import {
  applyFishingBait,
  FISHING_BAIT_DURATION_DAYS,
  FISHING_BASE_CATCH_CHANCE,
  FISHING_MAX_CATCH_CHANCE,
  fishingCatchChance,
  fishingSpotId,
  isBaitActive,
} from './fishing'

describe('fishing (plan 159)', () => {
  it('derives a stable spot id from a coarse grid cell', () => {
    expect(fishingSpotId(10, 20)).toBe(fishingSpotId(11, 21))
    expect(fishingSpotId(10, 20)).not.toBe(fishingSpotId(30, 20))
  })

  it('bait raises catch chance, capped', () => {
    expect(fishingCatchChance(false)).toBe(FISHING_BASE_CATCH_CHANCE)
    expect(fishingCatchChance(true)).toBeGreaterThan(FISHING_BASE_CATCH_CHANCE)
    expect(fishingCatchChance(true)).toBeLessThanOrEqual(FISHING_MAX_CATCH_CHANCE)
  })

  it('applying bait sets an expiry in the future and defaults to base strength', () => {
    const bait = applyFishingBait(null, 'berries', 10)
    expect(bait.kind).toBe('berries')
    expect(bait.expiresAtDays).toBe(10 + FISHING_BAIT_DURATION_DAYS)
    expect(bait.strength).toBe(1)
    expect(isBaitActive(bait, 10)).toBe(true)
    expect(isBaitActive(bait, bait.expiresAtDays + 1)).toBe(false)
    expect(isBaitActive(null, 10)).toBe(false)
  })

  it('reapplying the same kind while active strengthens it; a different kind resets', () => {
    const first = applyFishingBait(null, 'berries', 0)
    const reapplied = applyFishingBait(first, 'berries', 1)
    expect(reapplied.strength).toBe(2)
    const switched = applyFishingBait(reapplied, 'raw_meat', 2)
    expect(switched.kind).toBe('raw_meat')
    expect(switched.strength).toBe(1)
  })
})
