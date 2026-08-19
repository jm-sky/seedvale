import { describe, expect, it } from 'vitest'
import { parseTimeOfDayFromUrl } from './dayNight'

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
