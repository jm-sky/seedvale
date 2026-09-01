import { describe, expect, it } from 'vitest'
import {
  BLOOD_GLOBAL_CAP,
  BLOOD_LOCAL_CAP,
  BLOOD_MAX_LIFETIME_DAYS,
  BLOOD_MAX_SIZE,
  BLOOD_MIN_LIFETIME_DAYS,
  BLOOD_MIN_SIZE,
  bloodTraceRemainingFraction,
  bloodTracesNear,
  computeBloodTraceSize,
  createBloodTraceWorldState,
  pruneBloodTraces,
  recordBloodTrace,
} from './bloodTraces'

const SEED = 12345

describe('computeBloodTraceSize (plan world-009 §2)', () => {
  it('stays within [BLOOD_MIN_SIZE, BLOOD_MAX_SIZE] across a wide damage range', () => {
    for (const damage of [0.01, 0.5, 1, 5, 25, 100, 10000]) {
      const size = computeBloodTraceSize(1.75, damage)
      expect(size).toBeGreaterThanOrEqual(BLOOD_MIN_SIZE)
      expect(size).toBeLessThanOrEqual(BLOOD_MAX_SIZE)
    }
  })

  it('is monotonically non-decreasing with damage for a fixed victim size', () => {
    let prev = 0
    for (const damage of [0.1, 1, 5, 20, 80]) {
      const size = computeBloodTraceSize(1.75, damage)
      expect(size).toBeGreaterThanOrEqual(prev)
      prev = size
    }
  })

  it('handles very small (fractional starvation-style) damage without collapsing to 0', () => {
    expect(computeBloodTraceSize(1.75, 0.05)).toBeGreaterThanOrEqual(BLOOD_MIN_SIZE)
  })

  it('scales with victim size', () => {
    const small = computeBloodTraceSize(0.6, 10)
    const large = computeBloodTraceSize(2.5, 10)
    expect(large).toBeGreaterThan(small)
  })
})

describe('recordBloodTrace (plan world-009 §1/§7)', () => {
  it('does not create a trace for zero or negative damage', () => {
    const state = createBloodTraceWorldState()
    expect(recordBloodTrace(state, SEED, 0, 0, 0, 1.75, 0)).toBeNull()
    expect(recordBloodTrace(state, SEED, 0, 0, 0, 1.75, -5)).toBeNull()
    expect(state.traces).toHaveLength(0)
  })

  it('creates one trace at the given position for positive damage', () => {
    const state = createBloodTraceWorldState()
    const trace = recordBloodTrace(state, SEED, 2, 10, -4, 1.75, 8)
    expect(trace).not.toBeNull()
    expect(state.traces).toHaveLength(1)
    expect(trace!.x).toBe(10)
    expect(trace!.z).toBe(-4)
    expect(trace!.lifetimeDays).toBeGreaterThanOrEqual(BLOOD_MIN_LIFETIME_DAYS)
    expect(trace!.lifetimeDays).toBeLessThanOrEqual(BLOOD_MAX_LIFETIME_DAYS)
  })

  it('caps local accumulation instead of growing unbounded near one spot', () => {
    const state = createBloodTraceWorldState()
    for (let i = 0; i < BLOOD_LOCAL_CAP + 10; i++) {
      recordBloodTrace(state, SEED, i * 0.001, 0, 0, 1.75, 5)
    }
    const nearby = bloodTracesNear(state, 0, 0, 2)
    expect(nearby.length).toBeLessThanOrEqual(BLOOD_LOCAL_CAP)
  })

  it('enforces a hard global cap even when hits are spread out', () => {
    const state = createBloodTraceWorldState()
    for (let i = 0; i < BLOOD_GLOBAL_CAP + 20; i++) {
      recordBloodTrace(state, SEED, i * 0.001, i * 50, i * 50, 1.75, 5)
    }
    expect(state.traces.length).toBeLessThanOrEqual(BLOOD_GLOBAL_CAP)
  })
})

describe('bloodTraceRemainingFraction / pruneBloodTraces (plan world-009 §5/§6)', () => {
  it('is fresh (1) right after creation and fades toward 0 with age', () => {
    const state = createBloodTraceWorldState()
    const trace = recordBloodTrace(state, SEED, 0, 0, 0, 1.75, 20)!
    expect(bloodTraceRemainingFraction(trace, SEED, 0)).toBe(1)
    const mid = bloodTraceRemainingFraction(trace, SEED, trace.lifetimeDays / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(bloodTraceRemainingFraction(trace, SEED, trace.lifetimeDays + 1)).toBe(0)
  })

  it('prune removes a trace once its lifetime has fully elapsed', () => {
    const state = createBloodTraceWorldState()
    const trace = recordBloodTrace(state, SEED, 0, 0, 0, 1.75, 20)!
    expect(pruneBloodTraces(state, SEED, trace.lifetimeDays + 1)).toBe(true)
    expect(state.traces).toHaveLength(0)
  })

  it('prune is a no-op (returns false) while every trace is still alive', () => {
    const state = createBloodTraceWorldState()
    recordBloodTrace(state, SEED, 0, 0, 0, 1.75, 20)
    expect(pruneBloodTraces(state, SEED, 0.01)).toBe(false)
    expect(state.traces).toHaveLength(1)
  })
})
