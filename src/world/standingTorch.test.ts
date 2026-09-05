import { describe, expect, it } from 'vitest'
import {
  isStandingTorchConstructionComplete,
  STANDING_TORCH_REQUIRED_WORK,
  standingTorchRemainingWork,
} from './standingTorch'

describe('standing torch construction progress (plan items-player-017)', () => {
  it('is incomplete and reports full remaining work at 0 progress', () => {
    const record = { completedWork: 0 }
    expect(isStandingTorchConstructionComplete(record)).toBe(false)
    expect(standingTorchRemainingWork(record)).toBe(STANDING_TORCH_REQUIRED_WORK)
  })

  it('is complete exactly at the required-work threshold, with zero remaining', () => {
    const record = { completedWork: STANDING_TORCH_REQUIRED_WORK }
    expect(isStandingTorchConstructionComplete(record)).toBe(true)
    expect(standingTorchRemainingWork(record)).toBe(0)
  })

  it('never reports negative remaining work past the threshold', () => {
    const record = { completedWork: STANDING_TORCH_REQUIRED_WORK + 5 }
    expect(isStandingTorchConstructionComplete(record)).toBe(true)
    expect(standingTorchRemainingWork(record)).toBe(0)
  })
})
