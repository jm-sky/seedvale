import { describe, expect, it } from 'vitest'
import { createDayNightState } from './dayNight'
import {
  createWeatherState,
  pickWeightedWeather,
  seasonFromElapsedDays,
  temperatureFor,
  tickWeather,
} from './weather'

describe('seasonFromElapsedDays', () => {
  it('cycles spring/summer/autumn/winter every DAYS_PER_SEASON days', () => {
    expect(seasonFromElapsedDays(0, 3)).toBe('spring')
    expect(seasonFromElapsedDays(2.9, 3)).toBe('spring')
    expect(seasonFromElapsedDays(3, 3)).toBe('summer')
    expect(seasonFromElapsedDays(6, 3)).toBe('autumn')
    expect(seasonFromElapsedDays(9, 3)).toBe('winter')
    expect(seasonFromElapsedDays(12, 3)).toBe('spring')
  })
})

describe('pickWeightedWeather', () => {
  it('never picks snow in summer (weight 0)', () => {
    for (let i = 0; i < 200; i++) {
      expect(pickWeightedWeather('summer', () => i / 200)).not.toBe('snow')
    }
  })

  it('respects an injected rand function deterministically', () => {
    // Weights for spring: clear 3, cloudy 4, rain 4, fog 3, snow 0 (total 14).
    expect(pickWeightedWeather('spring', () => 0)).toBe('clear')
    expect(pickWeightedWeather('spring', () => 0.999)).toBe('fog')
  })
})

describe('temperatureFor', () => {
  it('is colder in winter than summer for the same weather', () => {
    expect(temperatureFor('winter', 'clear')).toBeLessThan(temperatureFor('summer', 'clear'))
  })

  it('rain is colder than clear in the same season', () => {
    expect(temperatureFor('spring', 'rain')).toBeLessThan(temperatureFor('spring', 'clear'))
  })
})

describe('tickWeather', () => {
  it('keeps the same weather type until duration elapses', () => {
    const dayNight = createDayNightState({ elapsedDays: 0 })
    const weather = createWeatherState({ type: 'clear', startedAt: 0, duration: 1 })
    dayNight.elapsedDays = 0.5
    tickWeather(weather, dayNight, 'spring')
    expect(weather.type).toBe('clear')
    expect(weather.startedAt).toBe(0)
  })

  it('transitions once duration elapses', () => {
    const dayNight = createDayNightState({ elapsedDays: 0 })
    const weather = createWeatherState({ type: 'clear', startedAt: 0, duration: 1 })
    dayNight.elapsedDays = 1.5
    tickWeather(weather, dayNight, 'spring')
    expect(weather.startedAt).toBe(1.5)
    expect(weather.duration).toBeGreaterThan(0)
  })

  it('forced overrides natural transitions immediately', () => {
    const dayNight = createDayNightState({ elapsedDays: 0 })
    const weather = createWeatherState({ type: 'clear', startedAt: 0, duration: 100, forced: 'snow' })
    tickWeather(weather, dayNight, 'winter')
    expect(weather.type).toBe('snow')
    expect(weather.intensity).toBeGreaterThan(0)
  })
})
