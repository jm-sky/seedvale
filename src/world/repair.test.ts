import { describe, expect, it } from 'vitest'
import { applyRepairWork, isRepairComplete, type RepairProgress, repairRemainingWork } from './repair'

function progress(overrides: Partial<RepairProgress> = {}): RepairProgress {
  return {
    startedCondition: 40,
    targetCondition: 100,
    requiredWork: 3,
    completedWork: 1,
    ...overrides,
  }
}

describe('repairRemainingWork / isRepairComplete', () => {
  it('reports leftover work and completion from completed vs required', () => {
    expect(repairRemainingWork(progress({ requiredWork: 3, completedWork: 1.25 }))).toBe(1.75)
    expect(isRepairComplete(progress({ requiredWork: 3, completedWork: 1.25 }))).toBe(false)
    expect(repairRemainingWork(progress({ requiredWork: 3, completedWork: 3 }))).toBe(0)
    expect(isRepairComplete(progress({ requiredWork: 3, completedWork: 3 }))).toBe(true)
  })

  it('treats overshoot as already complete with zero remaining', () => {
    const done = progress({ requiredWork: 2, completedWork: 2.5 })
    expect(repairRemainingWork(done)).toBe(0)
    expect(isRepairComplete(done)).toBe(true)
  })
})

describe('applyRepairWork', () => {
  it('is a no-op for zero or negative contribution', () => {
    const current = progress()
    expect(applyRepairWork(current, 0)).toEqual({ progress: current, acceptedWork: 0 })
    expect(applyRepairWork(current, -4)).toEqual({ progress: current, acceptedWork: 0 })
  })

  it('accepts a partial contribution without mutating the input', () => {
    const current = progress({ requiredWork: 3, completedWork: 1 })
    expect(applyRepairWork(current, 0.5)).toEqual({
      progress: { ...current, completedWork: 1.5 },
      acceptedWork: 0.5,
    })
    expect(current.completedWork).toBe(1)
  })

  it('clamps at required work and reports the exact accepted amount', () => {
    const current = progress({ requiredWork: 3, completedWork: 2.25 })
    expect(applyRepairWork(current, 2)).toEqual({
      progress: { ...current, completedWork: 3 },
      acceptedWork: 0.75,
    })
  })

  it('accepts nothing once the episode is already complete', () => {
    const current = progress({ requiredWork: 2, completedWork: 2 })
    expect(applyRepairWork(current, 1)).toEqual({ progress: current, acceptedWork: 0 })
  })
})
