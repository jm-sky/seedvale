import { describe, expect, it } from 'vitest'
import { cricketsTimeFactor, weatherAmbientFactor } from './createAmbientAudio'

describe('cricketsTimeFactor', () => {
  it('is silent through the day', () => {
    expect(cricketsTimeFactor(0.25)).toBe(0)
    expect(cricketsTimeFactor(0.5)).toBe(0)
    expect(cricketsTimeFactor(0.74)).toBe(0)
  })

  it('rises after dusk', () => {
    const justAfterDusk = cricketsTimeFactor(0.76)
    expect(justAfterDusk).toBeGreaterThan(0)
    expect(justAfterDusk).toBeLessThan(1)
  })

  it('is fully active in the middle of the night', () => {
    expect(cricketsTimeFactor(0.9)).toBe(1)
    expect(cricketsTimeFactor(0.0)).toBe(1)
  })

  it('tapers off before dawn to a quiet pre-dawn stretch', () => {
    const lateNight = cricketsTimeFactor(0.17)
    expect(lateNight).toBeGreaterThan(0)
    expect(lateNight).toBeLessThan(1)
    expect(cricketsTimeFactor(0.24)).toBe(0)
    expect(cricketsTimeFactor(0.2499)).toBe(0)
  })
})

describe('weatherAmbientFactor', () => {
  it('is full volume in clear weather', () => {
    expect(weatherAmbientFactor({ type: 'clear', intensity: 0, temperature: 0, startedAt: 0, endsAt: 1 }))
      .toEqual({ birds: 1, crickets: 1 })
  })

  it('silences both under snow', () => {
    expect(weatherAmbientFactor({ type: 'snow', intensity: 0.8, temperature: -5, startedAt: 0, endsAt: 1 }))
      .toEqual({ birds: 0, crickets: 0 })
  })

  it('reduces birds more than crickets under light rain, and silences both under a downpour', () => {
    const light = weatherAmbientFactor({ type: 'rain', intensity: 0.4, temperature: 10, startedAt: 0, endsAt: 1 })
    expect(light.birds).toBeLessThan(light.crickets)
    expect(light.birds).toBeGreaterThan(0)

    const heavy = weatherAmbientFactor({ type: 'rain', intensity: 1, temperature: 10, startedAt: 0, endsAt: 1 })
    expect(heavy.birds).toBeLessThanOrEqual(0)
    expect(heavy.crickets).toBeLessThanOrEqual(0)
  })
})
