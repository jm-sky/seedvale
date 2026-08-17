import { describe, expect, it } from 'vitest'
import {
  HABITAT_BURN_DESPAWN_DELAY,
  isPlayerPlacedFire,
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
