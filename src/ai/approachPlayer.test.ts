import { describe, expect, it } from 'vitest'
import {
  isPlayerApproachArrived,
  isPlayerLocallyEligible,
  PLAYER_APPROACH_ARRIVE_RANGE,
  PLAYER_APPROACH_LOCAL_RANGE,
} from './approachPlayer'

describe('approachPlayer locality', () => {
  it('treats a nearby player as locally eligible and an arrived talk target', () => {
    expect(isPlayerLocallyEligible(0, 0, 10, 0)).toBe(true)
    expect(isPlayerLocallyEligible(0, 0, PLAYER_APPROACH_LOCAL_RANGE + 0.1, 0)).toBe(false)
    expect(isPlayerApproachArrived(0, 0, PLAYER_APPROACH_ARRIVE_RANGE, 0)).toBe(true)
    expect(isPlayerApproachArrived(0, 0, PLAYER_APPROACH_ARRIVE_RANGE + 0.1, 0)).toBe(false)
  })
})
