import { describe, expect, it } from 'vitest'
import {
  createDayNightState,
  DEFAULT_TIME_OF_DAY,
  parseTimeOfDayFromUrl,
  resetDayNightForNewGame,
  tickDayNight,
} from './dayNight'

describe('parseTimeOfDayFromUrl', () => {
  it('returns null when neither time nor hour is set', () => {
    expect(parseTimeOfDayFromUrl('')).toBeNull()
    expect(parseTimeOfDayFromUrl('?debug=1')).toBeNull()
    expect(parseTimeOfDayFromUrl('?seed=7')).toBeNull()
  })

  it('maps named presets', () => {
    expect(parseTimeOfDayFromUrl('?time=night')).toBe(0)
    expect(parseTimeOfDayFromUrl('?time=noc')).toBe(0)
    expect(parseTimeOfDayFromUrl('?time=midnight')).toBe(0)
    expect(parseTimeOfDayFromUrl('?time=dawn')).toBe(0.25)
    expect(parseTimeOfDayFromUrl('?time=day')).toBe(0.5)
    expect(parseTimeOfDayFromUrl('?time=noon')).toBe(0.5)
    expect(parseTimeOfDayFromUrl('?time=dusk')).toBe(0.75)
  })

  it('parses clock strings and integer hours on time=', () => {
    expect(parseTimeOfDayFromUrl('?time=02:30')).toBe((2 + 30 / 60) / 24)
    expect(parseTimeOfDayFromUrl('?time=23')).toBe(23 / 24)
    expect(parseTimeOfDayFromUrl('?time=0')).toBe(0)
  })

  it('parses a 0–1 fraction that is not an integer hour', () => {
    expect(parseTimeOfDayFromUrl('?time=0.92')).toBe(0.92)
  })

  it('parses hour= 0–23', () => {
    expect(parseTimeOfDayFromUrl('?hour=0')).toBe(0)
    expect(parseTimeOfDayFromUrl('?hour=2')).toBe(2 / 24)
    expect(parseTimeOfDayFromUrl('?hour=23')).toBe(23 / 24)
  })

  it('lets a valid hour win over time', () => {
    expect(parseTimeOfDayFromUrl('?time=night&hour=2')).toBe(2 / 24)
  })

  it('falls back to time when hour is invalid', () => {
    expect(parseTimeOfDayFromUrl('?hour=99&time=night')).toBe(0)
    expect(parseTimeOfDayFromUrl('?hour=2.5')).toBeNull()
  })

  it('rejects unknown or out-of-range time tokens', () => {
    expect(parseTimeOfDayFromUrl('?time=')).toBeNull()
    expect(parseTimeOfDayFromUrl('?time=banana')).toBeNull()
    expect(parseTimeOfDayFromUrl('?time=24')).toBeNull()
    expect(parseTimeOfDayFromUrl('?time=12:60')).toBeNull()
  })
})

describe('resetDayNightForNewGame', () => {
  it('restores fresh-world clock after play (world-005 New Game)', () => {
    const state = createDayNightState({
      timeOfDay: (18 * 60 + 30) / (24 * 60),
      elapsedDays: 42,
    })
    resetDayNightForNewGame(state)
    expect(state.elapsedDays).toBe(0)
    expect(state.timeOfDay).toBe(DEFAULT_TIME_OF_DAY)
  })

  it('matches createDayNightState defaults so New Game and boot stay aligned', () => {
    const fresh = createDayNightState()
    const played = createDayNightState({ timeOfDay: 0.77, elapsedDays: 9 })
    resetDayNightForNewGame(played)
    expect(played.timeOfDay).toBe(fresh.timeOfDay)
    expect(played.elapsedDays).toBe(fresh.elapsedDays)
  })
})

describe('tickDayNight', () => {
  it('advances elapsedDays by exactly 1 after dayLengthSec real seconds, at any day length (plan 192)', () => {
    for (const dayLengthSec of [480, 600, 240]) {
      const state = createDayNightState({ dayLengthSec })
      tickDayNight(state, dayLengthSec)
      expect(state.elapsedDays).toBeCloseTo(1, 10)
    }
  })

  it('is independent of how the same total dt is split across ticks', () => {
    const whole = createDayNightState({ dayLengthSec: 480 })
    tickDayNight(whole, 480)

    const split = createDayNightState({ dayLengthSec: 480 })
    for (let i = 0; i < 480; i++) tickDayNight(split, 1)

    expect(split.elapsedDays).toBeCloseTo(whole.elapsedDays, 9)
  })

  it('scales by timeMultiplier', () => {
    const state = createDayNightState({ dayLengthSec: 480, timeMultiplier: 2 })
    tickDayNight(state, 240)
    expect(state.elapsedDays).toBeCloseTo(1, 10)
  })

  it('a no-op tick (dt=0) does not advance the clock', () => {
    const state = createDayNightState({ dayLengthSec: 480 })
    tickDayNight(state, 0)
    expect(state.elapsedDays).toBe(0)
  })
})
