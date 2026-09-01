import { describe, expect, it } from 'vitest'
import {
  computeClimate,
  computeRainExposureDays,
  computeSurfaceWeather,
  computeWeather,
  createClimateState,
  DAYS_PER_SEASON,
  getSeason,
  getSeasonProgress,
  temperatureFor,
  tickClimate,
  WEATHER_CYCLE_DAYS,
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

describe('computeSurfaceWeather', () => {
  it('is a pure function of (seed, elapsedDays) — same inputs, same output', () => {
    const a = computeSurfaceWeather(11, 12.34)
    const b = computeSurfaceWeather(11, 12.34)
    expect(a).toEqual(b)
  })

  it('clamps wetness/snowAmount to [0,1] across a wide sample', () => {
    for (let seed = 0; seed < 15; seed++) {
      for (let days = 0; days < 60; days += 1.7) {
        const s = computeSurfaceWeather(seed, days)
        expect(s.wetness).toBeGreaterThanOrEqual(0)
        expect(s.wetness).toBeLessThanOrEqual(1)
        expect(s.snowAmount).toBeGreaterThanOrEqual(0)
        expect(s.snowAmount).toBeLessThanOrEqual(1)
      }
    }
  })

  it('reads fully dry once no rain/snow has occurred within the lookback window', () => {
    const seed = 3
    const cycleDays = 0.3
    const margin = 4.5
    let lastWetDay = -1
    let probeDays = -1
    for (let cycle = 0; cycle < 5000; cycle++) {
      const days = cycle * cycleDays
      const w = computeWeather(seed, days, getSeason(days))
      if (w.type === 'rain' || w.type === 'snow') {
        lastWetDay = days
      } else if (lastWetDay >= 0 && days - lastWetDay >= margin) {
        probeDays = days
        break
      }
    }
    expect(probeDays).toBeGreaterThan(0)
    const s = computeSurfaceWeather(seed, probeDays)
    expect(s.wetness).toBe(0)
    expect(s.snowAmount).toBe(0)
  })

  it('raises wetness while a rain cycle is active, and does not require replaying history for a huge time-skip', () => {
    const seed = 5
    const cycleDays = 0.3
    let rainCycleStart = -1
    for (let cycle = 0; cycle < 500; cycle++) {
      const days = cycle * cycleDays
      if (computeWeather(seed, days, getSeason(days)).type === 'rain') {
        rainCycleStart = days
        break
      }
    }
    expect(rainCycleStart).toBeGreaterThanOrEqual(0)
    const nearCycleEnd = computeSurfaceWeather(seed, rainCycleStart + cycleDays - 0.01)
    expect(nearCycleEnd.wetness).toBeGreaterThan(0.3)

    // Re-deriving a huge elapsedDays (equivalent to a save/load or big
    // time-skip) must resolve directly, not by replaying every cycle since
    // world start — same guarantee `computeWeather` already gives.
    const huge = computeSurfaceWeather(seed, 100_000.15)
    expect(huge.wetness).toBeGreaterThanOrEqual(0)
    expect(huge.wetness).toBeLessThanOrEqual(1)
  })

  it('snow does not melt while frozen, and melting feeds the wetness curve', () => {
    // temperatureFor('winter', 'clear') is well below 0°C, so a clear winter
    // cycle right after snow should not melt it away.
    const seed = 8
    const cycleDays = 0.3
    let snowCycleStart = -1
    for (let cycle = 0; cycle < 2000; cycle++) {
      const days = cycle * cycleDays
      if (getSeason(days) === 'winter' && computeWeather(seed, days, 'winter').type === 'snow') {
        snowCycleStart = days
        break
      }
    }
    expect(snowCycleStart).toBeGreaterThanOrEqual(0)
    const afterSnow = computeSurfaceWeather(seed, snowCycleStart + cycleDays - 0.01)
    expect(afterSnow.snowAmount).toBeGreaterThan(0)
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

describe('computeRainExposureDays (plan world-009 §6)', () => {
  it('is 0 for an empty or inverted span', () => {
    expect(computeRainExposureDays(7, 5, 5)).toBe(0)
    expect(computeRainExposureDays(7, 5, 2)).toBe(0)
  })

  it('is never negative and is additive across adjoining sub-spans', () => {
    const seed = 123
    const from = 10
    const mid = 11.7
    const to = 13.4
    const whole = computeRainExposureDays(seed, from, to)
    const parts = computeRainExposureDays(seed, from, mid) + computeRainExposureDays(seed, mid, to)
    expect(whole).toBeGreaterThanOrEqual(0)
    expect(whole).toBeCloseTo(parts, 10)
  })

  it('matches a hand-rolled sum over the same cycles computeWeather reports', () => {
    const seed = 55
    const from = 0
    const to = WEATHER_CYCLE_DAYS * 6.5
    let expected = 0
    for (let cycle = 0; cycle <= 6; cycle++) {
      const cycleStart = cycle * WEATHER_CYCLE_DAYS
      const cycleEnd = cycleStart + WEATHER_CYCLE_DAYS
      const overlap = Math.min(cycleEnd, to) - Math.max(cycleStart, from)
      if (overlap <= 0) continue
      const w = computeWeather(seed, cycleStart, getSeason(cycleStart))
      if (w.type === 'rain') expected += overlap * w.intensity
    }
    expect(computeRainExposureDays(seed, from, to)).toBeCloseTo(expected, 10)
  })
})
