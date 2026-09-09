import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { resolveWeatherDrivenCondition, SLEEPING_UTILITY_SIM_WINDOW_DAYS } from '../world/sleepingUtilities'
import { createPlacedTents, TENT_CONDITION_MAX, TENT_RAIN_DECAY_PER_DAY, TENT_SNOW_DECAY_PER_DAY } from './createPlacedTents'

describe('createPlacedTents', () => {
  it('places a fresh tent at condition 100 and round-trips condition through nodes/pack', () => {
    const tents = createPlacedTents(new Scene(), () => 0, [], 1)
    const placed = tents.place(2, 3, 0.4, 5)
    expect(placed.condition).toBe(TENT_CONDITION_MAX)
    expect(placed.lastConditionUpdateAtDays).toBe(5)
    expect(tents.nodes()).toEqual([placed])
    const packed = tents.pack(placed.id, 5)
    expect(packed).toEqual({ status: 'packed', tent: placed })
    expect(tents.nodes()).toEqual([])
  })

  it('keeps a 0% tent as a world object', () => {
    const tents = createPlacedTents(new Scene(), () => 0, [{
      id: 'tent:zero',
      x: 0,
      z: 0,
      yaw: 0,
      condition: 0,
      lastConditionUpdateAtDays: 0,
    }], 1)
    expect(tents.nodes()[0]?.condition).toBe(0)
    expect(tents.conditionOf('tent:zero', 100)).toBe(0)
  })

  it('preserves carried instance id and condition on place, and blocks packing during repair', () => {
    const tents = createPlacedTents(new Scene(), () => 0, [], 1)
    const placed = tents.place(1, 2, 0, 4, { id: 'tent:kept', condition: 42 })
    expect(placed.id).toBe('tent:kept')
    expect(placed.condition).toBe(42)
    const started = tents.startRepair(
      placed.id,
      4,
      () => true,
      () => true,
      () => {},
    )
    expect(started.status).toBe('started')
    expect(tents.pack(placed.id, 4)).toEqual({ status: 'blocked' })
    expect(tents.get(placed.id)?.id).toBe('tent:kept')
  })

  it('checkpoints condition on pack when inventory can receive it', () => {
    const tents = createPlacedTents(new Scene(), () => 0, [{
      id: 'tent:pack',
      x: 0,
      z: 0,
      yaw: 0,
      condition: 80,
      lastConditionUpdateAtDays: 2,
    }], 1)
    const packed = tents.pack('tent:pack', 2)
    expect(packed).toEqual({
      status: 'packed',
      tent: {
        id: 'tent:pack',
        x: 0,
        z: 0,
        yaw: 0,
        condition: 80,
        lastConditionUpdateAtDays: 2,
      },
    })
    expect(tents.nodes()).toEqual([])
  })

  it('lazy-resolves tent condition deterministically without a per-frame tick', () => {
    const record = { condition: 100, lastConditionUpdateAtDays: 0 }
    const a = resolveWeatherDrivenCondition(record, 7, 8, 0, {
      rainDecayPerDay: TENT_RAIN_DECAY_PER_DAY,
      snowDecayPerDay: TENT_SNOW_DECAY_PER_DAY,
      simWindowDays: SLEEPING_UTILITY_SIM_WINDOW_DAYS,
    })
    const b = resolveWeatherDrivenCondition(record, 7, 8, 0, {
      rainDecayPerDay: TENT_RAIN_DECAY_PER_DAY,
      snowDecayPerDay: TENT_SNOW_DECAY_PER_DAY,
      simWindowDays: SLEEPING_UTILITY_SIM_WINDOW_DAYS,
    })
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(100)
  })
})
