import { describe, expect, it } from 'vitest'
import {
  gameDaysToGameHours,
  gameDaysToRealSeconds,
  gameHoursToGameDays,
  gameHoursToRealSeconds,
  realSecondsToGameDays,
  realSecondsToGameHours,
} from './timeConversion'

const DAY_LENGTHS = [480, 600, 240]

describe('gameHoursToGameDays / gameDaysToGameHours', () => {
  it('are unrelated to dayLengthSec — 24 game hours is always 1 game day', () => {
    expect(gameHoursToGameDays(24)).toBe(1)
    expect(gameDaysToGameHours(1)).toBe(24)
    expect(gameHoursToGameDays(0)).toBe(0)
    expect(gameHoursToGameDays(12)).toBe(0.5)
  })

  it('round-trips', () => {
    expect(gameDaysToGameHours(gameHoursToGameDays(24))).toBe(24)
    expect(gameHoursToGameDays(gameDaysToGameHours(2.5))).toBe(2.5)
  })
})

describe('realSecondsToGameDays / gameDaysToRealSeconds', () => {
  for (const dayLengthSec of DAY_LENGTHS) {
    describe(`dayLengthSec = ${dayLengthSec}`, () => {
      it('0 real seconds is 0 game days', () => {
        expect(realSecondsToGameDays(0, dayLengthSec)).toBe(0)
      })

      it('dayLengthSec real seconds is exactly 1 game day', () => {
        expect(realSecondsToGameDays(dayLengthSec, dayLengthSec)).toBeCloseTo(1, 10)
      })

      it('half of dayLengthSec real seconds is exactly 0.5 game days', () => {
        expect(realSecondsToGameDays(dayLengthSec / 2, dayLengthSec)).toBeCloseTo(0.5, 10)
      })

      it('1 game day is exactly dayLengthSec real seconds', () => {
        expect(gameDaysToRealSeconds(1, dayLengthSec)).toBe(dayLengthSec)
      })

      it('round-trips real-seconds -> game-days -> real-seconds', () => {
        const realSeconds = 123.45
        const days = realSecondsToGameDays(realSeconds, dayLengthSec)
        expect(gameDaysToRealSeconds(days, dayLengthSec)).toBeCloseTo(realSeconds, 9)
      })
    })
  }
})

describe('realSecondsToGameHours / gameHoursToRealSeconds', () => {
  for (const dayLengthSec of DAY_LENGTHS) {
    describe(`dayLengthSec = ${dayLengthSec}`, () => {
      it('1 game hour is dayLengthSec / 24 real seconds', () => {
        expect(gameHoursToRealSeconds(1, dayLengthSec)).toBeCloseTo(dayLengthSec / 24, 10)
      })

      it('24 game hours is exactly dayLengthSec real seconds (one full day)', () => {
        expect(gameHoursToRealSeconds(24, dayLengthSec)).toBeCloseTo(dayLengthSec, 10)
      })

      it('dayLengthSec real seconds is exactly 24 game hours', () => {
        expect(realSecondsToGameHours(dayLengthSec, dayLengthSec)).toBeCloseTo(24, 10)
      })

      it('round-trips game-hours -> real-seconds -> game-hours', () => {
        const hours = 5.5
        const realSeconds = gameHoursToRealSeconds(hours, dayLengthSec)
        expect(realSecondsToGameHours(realSeconds, dayLengthSec)).toBeCloseTo(hours, 9)
      })
    })
  }

  it('the same game-time duration takes more real seconds the longer dayLengthSec is', () => {
    const shortDay = gameHoursToRealSeconds(1, 240)
    const longDay = gameHoursToRealSeconds(1, 600)
    expect(longDay).toBeGreaterThan(shortDay)
  })
})
