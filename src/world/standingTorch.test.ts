import { describe, expect, it } from 'vitest'
import {
  isStandingTorchConstructionComplete,
  resolveStandingTorchBurnState,
  STANDING_TORCH_BURN_DURATION_DAYS,
  STANDING_TORCH_REQUIRED_WORK,
  standingTorchBurnUntilDays,
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

describe('standing torch world-time burn (plan items-player-022)', () => {
  it('stamps a six-world-hour deadline at ignition', () => {
    expect(STANDING_TORCH_BURN_DURATION_DAYS).toBe(6 / 24)
    expect(standingTorchBurnUntilDays(2)).toBe(2 + 6 / 24)
  })

  it('stays lit before the deadline and expires at equality', () => {
    const lit = { lit: true, burnUntilDays: 2.25 }
    expect(resolveStandingTorchBurnState(lit, 2.249)).toEqual(lit)
    expect(resolveStandingTorchBurnState(lit, 2.25)).toEqual({ lit: false, burnUntilDays: null })
    expect(resolveStandingTorchBurnState(lit, 3)).toEqual({ lit: false, burnUntilDays: null })
  })

  it('treats a lit record without a deadline as already expired', () => {
    expect(resolveStandingTorchBurnState({ lit: true, burnUntilDays: null }, 1)).toEqual({
      lit: false,
      burnUntilDays: null,
    })
  })
})
