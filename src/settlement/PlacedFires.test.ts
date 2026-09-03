import { describe, expect, it } from 'vitest'
import {
  HABITAT_BURN_DESPAWN_DELAY,
  isPlayerPlacedFire,
  pileBodyScale,
} from './PlacedFires'

describe('habitat-destroy fire (plan 137)', () => {
  it('is not a player camp — no [E] palenisko prompt and not saved', () => {
    expect(isPlayerPlacedFire({ habitatBurn: false })).toBe(true)
    expect(isPlayerPlacedFire({ habitatBurn: true })).toBe(false)
  })

  it('despawns the ring shortly after burnout instead of leaving a 7-day pit', () => {
    expect(HABITAT_BURN_DESPAWN_DELAY).toBe(8)
    expect(HABITAT_BURN_DESPAWN_DELAY).toBeLessThan(60)
  })
})

describe('pileBodyScale (plan items-player-015)', () => {
  it('stays at the current-campfire baseline (1) while unlit or barely fuelled', () => {
    expect(pileBodyScale(0)).toBe(1)
    expect(pileBodyScale(1)).toBe(1)
  })

  it('grows smoothly (no jumps) as fuel ratio increases past the dead zone', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 10, 100].map(pileBodyScale)
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!)
  })

  it('never exceeds the maximum bonfire scale of 3', () => {
    expect(pileBodyScale(6)).toBeCloseTo(3)
    expect(pileBodyScale(1000)).toBe(3)
  })
})
