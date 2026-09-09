import { describe, expect, it } from 'vitest'
import {
  applyConditionDelta,
  checkpointCondition,
  clampCondition,
  CONDITION_MAX,
  resolveCondition,
} from './condition'

describe('clampCondition / applyConditionDelta', () => {
  it('clamps onto 0..100', () => {
    expect(clampCondition(-4)).toBe(0)
    expect(clampCondition(0)).toBe(0)
    expect(clampCondition(50)).toBe(50)
    expect(clampCondition(CONDITION_MAX)).toBe(CONDITION_MAX)
    expect(clampCondition(140)).toBe(CONDITION_MAX)
  })

  it('applies positive and negative deltas without leaving 0..100', () => {
    expect(applyConditionDelta(40, 25)).toBe(65)
    expect(applyConditionDelta(40, -15)).toBe(25)
    expect(applyConditionDelta(10, -40)).toBe(0)
    expect(applyConditionDelta(90, 40)).toBe(CONDITION_MAX)
  })
})

describe('checkpointCondition', () => {
  it('commits the resolved value and advances the anchor', () => {
    expect(checkpointCondition(73.2, 12)).toEqual({
      condition: 73.2,
      lastConditionUpdateAtDays: 12,
    })
  })

  it('clamps the committed value', () => {
    expect(checkpointCondition(200, 3).condition).toBe(CONDITION_MAX)
    expect(checkpointCondition(-1, 3).condition).toBe(0)
  })
})

describe('resolveCondition', () => {
  const state = { condition: 100, lastConditionUpdateAtDays: 0 }

  it('returns the stored condition when nowDays is at or before the anchor', () => {
    expect(resolveCondition({ state, nowDays: 0, decay: { passivePerDay: 5 } })).toBe(100)
    expect(resolveCondition({ state, nowDays: -2, decay: { passivePerDay: 5 } })).toBe(100)
  })

  it('applies passive decay over the full elapsed interval', () => {
    expect(resolveCondition({ state, nowDays: 10, decay: { passivePerDay: 4 } })).toBe(60)
  })

  it('uses an explicit passiveDays span instead of elapsed when provided', () => {
    expect(resolveCondition({
      state,
      nowDays: 10,
      passiveDays: 2,
      decay: { passivePerDay: 4 },
    })).toBe(92)
  })

  it('applies rain and snow exposure independently of passive wear', () => {
    expect(resolveCondition({
      state,
      nowDays: 1,
      rainExposureDays: 2,
      snowExposureDays: 1,
      decay: { rainPerExposureDay: 10, snowPerExposureDay: 8 },
    })).toBe(72)
  })

  it('combines passive + weather and never goes negative', () => {
    expect(resolveCondition({
      state,
      nowDays: 50,
      rainExposureDays: 20,
      snowExposureDays: 10,
      decay: { passivePerDay: 4, rainPerExposureDay: 6, snowPerExposureDay: 5 },
    })).toBe(0)
  })

  it('treats negative caller exposure as zero rather than healing', () => {
    expect(resolveCondition({
      state: { condition: 50, lastConditionUpdateAtDays: 5 },
      nowDays: 5,
      rainExposureDays: -4,
      snowExposureDays: -2,
      decay: { rainPerExposureDay: 10, snowPerExposureDay: 10 },
    })).toBe(50)
  })

  it('is deterministic for the same inputs', () => {
    const params = {
      state,
      nowDays: 7,
      rainExposureDays: 1.5,
      snowExposureDays: 0.25,
      decay: { passivePerDay: 2, rainPerExposureDay: 6, snowPerExposureDay: 5 },
    }
    expect(resolveCondition(params)).toBe(resolveCondition(params))
  })
})
