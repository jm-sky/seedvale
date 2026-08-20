import { describe, expect, it } from 'vitest'
import { isProcessComplete, processCompletedAtDays, processProgress, type TimedProcess } from './timedProcess'

const process: TimedProcess = {
  id: 'p1',
  kind: 'drying',
  startedAtDays: 10,
  durationDays: 2,
  input: [{ kind: 'raw_meat', count: 1 }],
  output: [{ kind: 'dried_meat', count: 1 }],
}

describe('timedProcess (plan 159)', () => {
  it('derives completion day from start + duration', () => {
    expect(processCompletedAtDays(process)).toBe(12)
    expect(isProcessComplete(process, 11.9)).toBe(false)
    expect(isProcessComplete(process, 12)).toBe(true)
    expect(isProcessComplete(process, 20)).toBe(true)
  })

  it('derives clamped [0,1] progress', () => {
    expect(processProgress(process, 10)).toBe(0)
    expect(processProgress(process, 11)).toBe(0.5)
    expect(processProgress(process, 12)).toBe(1)
    expect(processProgress(process, 50)).toBe(1)
  })
})
