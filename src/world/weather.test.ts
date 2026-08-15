import { describe, expect, it } from 'vitest'
import {
  computeClimate,
  computeWeather,
  createClimateState,
  DAYS_PER_SEASON,
  getSeason,
  getSeasonProgress,
  temperatureFor,
  tickClimate,
} from './weather'

describe('getSeason / getSeasonProgress', () => {
  it('cycles spring/summer/autumn/winter every DAYS_PER_SEASON days', () => {
    expect(getSeason(0)).toBe('spring')
    expect(getSeason(DAYS_PER_SEASON - 0.1)).toBe('spring')
    expect(getSeason(DAYS_PER_SEASON)).toBe('summer')
    expect(getSeason(DAYS_PER_SEASON * 2)).toBe('autumn')
    expect(getSeason(DAYS_PER_SEASON * 3)).toBe('winter')
    expect(getSeason(DAYS_PER_SEASON * 4)).toBe('spring')
  })

  it('reports 0..1 progress through the current season', () => {
    expect(getSeasonProgress(0)).toBe(0)
    expect(getSeasonProgress(DAYS_PER_SEASON / 2)).toBeCloseTo(0.5)
    expect(getSeasonProgress(DAYS_PER_SEASON)).toBe(0)
  })
})

describe('computeWeather', () => {
  it('is a pure function of (seed, elapsedDays, season) — same inputs, same output', () => {
    const a = computeWeather(42, 3.14, 'spring')
    const b = computeWeather(42, 3.14, 'spring')
    expect(a).toEqual(b)
  })

  it('gives the same weather for any elapsedDays within one cycle', () => {
    const a = computeWeather(1, 1.0, 'winter')
    const b = computeWeather(1, 1.05, 'winter')
    expect(a).toEqual(b)
  })

  it('can differ for a different seed at the same elapsedDays', () => {
    const results = new Set(
      Array.from({ length: 20 }, (_, seed) => computeWeather(seed, 5, 'spring').type),
    )
    // Not a strict guarantee for any hash, but with 20 seeds across 5 weighted
    // types it would be a suspicious coincidence for every seed to agree.
    expect(results.size).toBeGreaterThan(1)
  })

  it('never picks snow in summer (weight 0)', () => {
    for (let cycle = 0; cycle < 100; cycle++) {
      expect(computeWeather(7, cycle * 0.3, 'summer').type).not.toBe('snow')
    }
  })

  it('gives clear weather 0 intensity', () => {
    for (let cycle = 0; cycle < 200; cycle++) {
      const w = computeWeather(3, cycle * 0.3, 'summer')
      if (w.type === 'clear') expect(w.intensity).toBe(0)
    }
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

describe('computeClimate', () => {
  it('bundles season/seasonProgress/weather consistently', () => {
    const climate = computeClimate(5, DAYS_PER_SEASON + 1)
    expect(climate.season).toBe(getSeason(DAYS_PER_SEASON + 1))
    expect(climate.weather).toEqual(computeWeather(5, DAYS_PER_SEASON + 1, climate.season))
  })
})

describe('tickClimate', () => {
  it('re-derives the same weather after a large elapsedDays jump (time-skip)', () => {
    const seed = 9
    const state = createClimateState(seed, 0)
    tickClimate(state, seed, 40)
    expect(state.weather).toEqual(computeWeather(seed, 40, getSeason(40)))
  })

  it('forced overrides the deterministic weather immediately', () => {
    const state = createClimateState(1, 0)
    state.forced = 'snow'
    tickClimate(state, 1, 0)
    expect(state.weather.type).toBe('snow')
    expect(state.weather.intensity).toBeGreaterThan(0)
  })

  it('resumes deterministic weather once forced is set back to auto', () => {
    const seed = 2
    const state = createClimateState(seed, 10)
    state.forced = 'fog'
    tickClimate(state, seed, 10)
    expect(state.weather.type).toBe('fog')
    state.forced = 'auto'
    tickClimate(state, seed, 10)
    expect(state.weather).toEqual(computeWeather(seed, 10, getSeason(10)))
  })
})
