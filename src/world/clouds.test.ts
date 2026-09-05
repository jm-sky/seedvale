import { describe, expect, it } from 'vitest'
import type { WeatherState } from './weather'
import { cloudAppearanceFor, cloudCategoryWeightsFor } from './clouds'

function weather(overrides: Partial<WeatherState>): WeatherState {
  return { type: 'clear', intensity: 0, temperature: 12, startedAt: 0, endsAt: 0.3, ...overrides }
}

/** Full noon elevation — day/night multiplier is a no-op here, so existing
 *  weather-only assertions below stay meaningful. */
const NOON = 1

describe('cloudAppearanceFor', () => {
  it('reads as sparse for clear weather (intensity always 0)', () => {
    const appearance = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), NOON)
    expect(appearance.coverage).toBeCloseTo(0.15)
    expect(appearance.tint).toBe(0xffffff)
  })

  it('treats fog the same as the baseline (no special cloud behaviour)', () => {
    const fog = cloudAppearanceFor(weather({ type: 'fog', intensity: 1 }), NOON)
    const clear = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), NOON)
    expect(fog.coverage).toBeCloseTo(clear.coverage)
    expect(fog.tint).toBe(clear.tint)
  })

  it('increases coverage and darkens tint for rain, scaled by intensity', () => {
    const half = cloudAppearanceFor(weather({ type: 'rain', intensity: 0.5 }), NOON)
    const full = cloudAppearanceFor(weather({ type: 'rain', intensity: 1 }), NOON)
    expect(full.coverage).toBeGreaterThan(half.coverage)
    expect(half.coverage).toBeGreaterThan(0.15)
    expect(full.tint).toBeLessThan(half.tint)
  })

  it('makes cloudy and snow read lighter than rain at equal intensity', () => {
    const rain = cloudAppearanceFor(weather({ type: 'rain', intensity: 1 }), NOON)
    const cloudy = cloudAppearanceFor(weather({ type: 'cloudy', intensity: 1 }), NOON)
    const snow = cloudAppearanceFor(weather({ type: 'snow', intensity: 1 }), NOON)
    expect(cloudy.coverage).toBeLessThan(rain.coverage)
    expect(snow.coverage).toBeLessThan(rain.coverage)
  })

  it('leaves daytime tint unchanged (elev at/above the day breakpoint)', () => {
    const noon = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), 0.3)
    expect(noon.tint).toBe(0xffffff)
  })

  it('darkens and cools clear-sky clouds at night instead of leaving them white', () => {
    const night = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), -1)
    const day = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), NOON)
    expect(night.tint).not.toBe(0xffffff)
    expect(night.tint).toBeLessThan(day.tint)
    const r = (night.tint >> 16) & 0xff
    const g = (night.tint >> 8) & 0xff
    const b = night.tint & 0xff
    // Still visible (not black) and cool-toned (blue channel strongest).
    expect(r + g + b).toBeGreaterThan(0)
    expect(b).toBeGreaterThanOrEqual(r)
  })

  it('transitions smoothly through dusk rather than snapping', () => {
    const day = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), 0.3)
    const dusk = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), 0.15)
    const night = cloudAppearanceFor(weather({ type: 'clear', intensity: 0 }), -1)
    expect(dusk.tint).toBeLessThanOrEqual(day.tint)
    expect(dusk.tint).toBeGreaterThanOrEqual(night.tint)
  })

  it('still darkens rain clouds at night relative to their daytime tint', () => {
    const dayRain = cloudAppearanceFor(weather({ type: 'rain', intensity: 1 }), NOON)
    const nightRain = cloudAppearanceFor(weather({ type: 'rain', intensity: 1 }), -1)
    expect(nightRain.tint).toBeLessThan(dayRain.tint)
    expect(nightRain.tint).toBeGreaterThan(0)
  })
})

describe('cloudCategoryWeightsFor', () => {
  it('is strongly light for clear weather', () => {
    const weights = cloudCategoryWeightsFor(weather({ type: 'clear', intensity: 0 }))
    expect(weights.light).toBeGreaterThan(weights.dense)
  })

  it('is mixed but dense-biased for cloudy weather at full intensity', () => {
    const weights = cloudCategoryWeightsFor(weather({ type: 'cloudy', intensity: 1 }))
    expect(weights.dense).toBeGreaterThan(weights.light)
    expect(weights.light).toBeGreaterThan(0.1)
  })

  it('becomes increasingly dense for rain as intensity rises', () => {
    const low = cloudCategoryWeightsFor(weather({ type: 'rain', intensity: 0.2 }))
    const high = cloudCategoryWeightsFor(weather({ type: 'rain', intensity: 1 }))
    expect(high.dense).toBeGreaterThan(low.dense)
  })

  it('is dense-biased for snow', () => {
    const weights = cloudCategoryWeightsFor(weather({ type: 'snow', intensity: 1 }))
    expect(weights.dense).toBeGreaterThan(weights.light)
  })

  it('keeps the low-coverage fog profile light-biased like clear', () => {
    const fog = cloudCategoryWeightsFor(weather({ type: 'fog', intensity: 1 }))
    const clear = cloudCategoryWeightsFor(weather({ type: 'clear', intensity: 0 }))
    expect(fog.light).toBeCloseTo(clear.light)
  })

  it('always normalizes to sum to 1', () => {
    for (const type of ['clear', 'cloudy', 'rain', 'fog', 'snow'] as const) {
      for (const intensity of [0, 0.3, 0.7, 1]) {
        const weights = cloudCategoryWeightsFor(weather({ type, intensity }))
        expect(weights.light + weights.dense).toBeCloseTo(1)
      }
    }
  })

  it('applies a small seasonal bias without flipping weather as the primary signal', () => {
    const summer = cloudCategoryWeightsFor(weather({ type: 'clear', intensity: 0 }), 'summer')
    const winter = cloudCategoryWeightsFor(weather({ type: 'clear', intensity: 0 }), 'winter')
    expect(summer.light).toBeGreaterThan(winter.light)
    expect(winter.light).toBeGreaterThan(winter.dense)
  })
})
