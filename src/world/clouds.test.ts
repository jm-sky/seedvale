import { describe, expect, it } from 'vitest'
import type { WeatherState } from './weather'
import { cloudAppearanceFor } from './clouds'

function weather(overrides: Partial<WeatherState>): WeatherState {
  return { type: 'clear', intensity: 0, temperature: 12, startedAt: 0, endsAt: 0.3, ...overrides }
}

describe('cloudAppearanceFor', () => {
  it('reads as sparse for clear weather (intensity always 0)', () => {
    const appearance = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }))
    expect(appearance.coverage).toBeCloseTo(0.15)
    expect(appearance.tint).toBe(0xffffff)
  })

  it('treats fog the same as the baseline (no special cloud behaviour)', () => {
    const fog = cloudAppearanceFor(weather({ type: 'fog', intensity: 1 }))
    const clear = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }))
    expect(fog.coverage).toBeCloseTo(clear.coverage)
    expect(fog.tint).toBe(clear.tint)
  })

  it('increases coverage and darkens tint for rain, scaled by intensity', () => {
    const half = cloudAppearanceFor(weather({ type: 'rain', intensity: 0.5 }))
    const full = cloudAppearanceFor(weather({ type: 'rain', intensity: 1 }))
    expect(full.coverage).toBeGreaterThan(half.coverage)
    expect(half.coverage).toBeGreaterThan(0.15)
    expect(full.tint).toBeLessThan(half.tint)
  })

  it('makes cloudy and snow read lighter than rain at equal intensity', () => {
    const rain = cloudAppearanceFor(weather({ type: 'rain', intensity: 1 }))
    const cloudy = cloudAppearanceFor(weather({ type: 'cloudy', intensity: 1 }))
    const snow = cloudAppearanceFor(weather({ type: 'snow', intensity: 1 }))
    expect(cloudy.coverage).toBeLessThan(rain.coverage)
    expect(snow.coverage).toBeLessThan(rain.coverage)
  })
})
