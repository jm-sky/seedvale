import { describe, expect, it } from 'vitest'
import type { WeatherState } from '../world/weather'
import { pickActionKind } from '../simulation'
import { createNeedState, generateNeedPressures, type NeedState } from './Needs'
import {
  type NpcDecisionTarget,
  WEATHER_SEVERE_SHELTER_THRESHOLD,
  weatherShelterPressure,
} from './weatherPressure'

function weather(overrides: Partial<WeatherState>): WeatherState {
  return { type: 'clear', intensity: 0, temperature: 15, startedAt: 0, endsAt: 1, ...overrides }
}

describe('weatherShelterPressure', () => {
  it('never generates pressure for clear/cloudy/fog, regardless of intensity or temperature', () => {
    expect(weatherShelterPressure(weather({ type: 'clear', intensity: 0, temperature: -20 }))).toBe(0)
    expect(weatherShelterPressure(weather({ type: 'cloudy', intensity: 1, temperature: -20 }))).toBe(0)
    expect(weatherShelterPressure(weather({ type: 'fog', intensity: 1, temperature: -20 }))).toBe(0)
  })

  it('produces no pressure for light rain', () => {
    expect(weatherShelterPressure(weather({ type: 'rain', intensity: 0.4, temperature: 10 }))).toBe(0)
  })

  it('produces meaningful, intensity-scaled pressure for stronger rain', () => {
    const light = weatherShelterPressure(weather({ type: 'rain', intensity: 0.6, temperature: 10 }))
    const heavy = weatherShelterPressure(weather({ type: 'rain', intensity: 1.0, temperature: 10 }))
    expect(light).toBeGreaterThan(0)
    expect(heavy).toBeGreaterThan(light)
  })

  it('scores snow higher than rain at the same intensity', () => {
    const rain = weatherShelterPressure(weather({ type: 'rain', intensity: 0.8, temperature: 10 }))
    const snow = weatherShelterPressure(weather({ type: 'snow', intensity: 0.8, temperature: 10 }))
    expect(snow).toBeGreaterThan(rain)
  })

  it('applies a cold floor once temperature is genuinely low, even for otherwise-light precipitation', () => {
    const warmLightRain = weatherShelterPressure(weather({ type: 'rain', intensity: 0.4, temperature: 5 }))
    const coldLightRain = weatherShelterPressure(weather({ type: 'rain', intensity: 0.4, temperature: -10 }))
    expect(warmLightRain).toBe(0)
    expect(coldLightRain).toBeGreaterThan(0)
  })

  it('stays bounded to [0, 1]', () => {
    expect(weatherShelterPressure(weather({ type: 'snow', intensity: 1, temperature: -30 }))).toBeLessThanOrEqual(1)
  })

  it('is deterministic for identical inputs', () => {
    const w = weather({ type: 'rain', intensity: 0.72, temperature: 3 })
    expect(weatherShelterPressure(w)).toBe(weatherShelterPressure(w))
  })

  it('only heavy rain/snow cross the severe critical-interrupt threshold', () => {
    expect(weatherShelterPressure(weather({ type: 'rain', intensity: 0.6, temperature: 10 })))
      .toBeLessThan(WEATHER_SEVERE_SHELTER_THRESHOLD)
    expect(weatherShelterPressure(weather({ type: 'rain', intensity: 1.0, temperature: 10 })))
      .toBeGreaterThanOrEqual(WEATHER_SEVERE_SHELTER_THRESHOLD)
  })
})

/** Mirrors `NpcAgent.choose()`'s own arbitration composition (append a
 *  `seekShelter` candidate to the existing need-pressure list, then
 *  `pickActionKind` over both) — verified here as a pure function so weather
 *  vs. need competition doesn't require constructing a real `NpcAgent`. */
function decide(needs: NeedState, weatherPressure: number): NpcDecisionTarget {
  const pressures = generateNeedPressures(needs)
  return pickActionKind<NpcDecisionTarget>(
    [
      ...pressures.map((p) => ({ kind: p.target, score: p.value })),
      { kind: 'seekShelter', score: weatherPressure },
    ],
    'idle',
  )
}

describe('weather vs. need arbitration (mirrors NpcAgent.choose())', () => {
  it('lets heavy-rain shelter pressure win over a fresh NPC\'s idle baseline', () => {
    const heavyRain = weatherShelterPressure({ type: 'rain', intensity: 1, temperature: 5, startedAt: 0, endsAt: 1 })
    expect(decide(createNeedState(), heavyRain)).toBe('seekShelter')
  })

  it('leaves a fresh NPC idle under light rain (no interruption of ordinary activity)', () => {
    const lightRain = weatherShelterPressure({ type: 'rain', intensity: 0.4, temperature: 10, startedAt: 0, endsAt: 1 })
    expect(decide(createNeedState(), lightRain)).toBe('idle')
  })

  it('still lets a genuinely urgent physiological need win over heavy-rain shelter pressure', () => {
    const needs = createNeedState()
    needs.thirst = 0.95
    const heavyRain = weatherShelterPressure({ type: 'rain', intensity: 1, temperature: 5, startedAt: 0, endsAt: 1 })
    expect(decide(needs, heavyRain)).toBe('water')
  })
})
