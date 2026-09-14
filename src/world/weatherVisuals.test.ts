import { describe, expect, it } from 'vitest'
import type { WeatherState } from './weather'
import {
  applyLightningFlash,
  applyWeatherOverlay,
  applyWeatherSkyOverlay,
  fogColorLuminance,
  GRASS_WIND_AMP_MAX,
  grassWindAmpFor,
  resolveSceneFog,
} from './weatherVisuals'

const baseFog = { fogColor: 0x6a93b0, fogNear: 160, fogFar: 230 }

function weather(overrides: Partial<WeatherState>): WeatherState {
  return { type: 'clear', intensity: 0, temperature: 12, startedAt: 0, endsAt: 0.3, ...overrides }
}

describe('applyWeatherOverlay', () => {
  it('leaves fog/light untouched for clear weather (intensity 0)', () => {
    const overlay = applyWeatherOverlay(baseFog, weather({ type: 'clear', intensity: 0 }))
    expect(overlay.lightScale).toBe(1)
    expect(overlay.fogColor).toBe(baseFog.fogColor)
    expect(overlay.fogNear).toBe(baseFog.fogNear)
    expect(overlay.fogFar).toBe(baseFog.fogFar)
  })

  it('dims light and shrinks fog distance for rain', () => {
    const overlay = applyWeatherOverlay(baseFog, weather({ type: 'rain', intensity: 1 }))
    expect(overlay.lightScale).toBeLessThan(1)
    expect(overlay.fogNear).toBeLessThan(baseFog.fogNear)
    expect(overlay.fogFar).toBeLessThan(baseFog.fogFar)
  })

  it('fog weather shrinks visibility further than rain at equal intensity', () => {
    const rain = applyWeatherOverlay(baseFog, weather({ type: 'rain', intensity: 1 }))
    const fog = applyWeatherOverlay(baseFog, weather({ type: 'fog', intensity: 1 }))
    expect(fog.fogFar).toBeLessThan(rain.fogFar)
  })

  it('never lets fogNear/fogFar collapse to an invalid range', () => {
    const overlay = applyWeatherOverlay(baseFog, weather({ type: 'fog', intensity: 1 }))
    expect(overlay.fogNear).toBeGreaterThan(0)
    expect(overlay.fogFar).toBeGreaterThan(overlay.fogNear)
  })

  it('scales overlay strength by intensity', () => {
    const half = applyWeatherOverlay(baseFog, weather({ type: 'rain', intensity: 0.5 }))
    const full = applyWeatherOverlay(baseFog, weather({ type: 'rain', intensity: 1 }))
    expect(half.lightScale).toBeGreaterThan(full.lightScale)
  })

  it('makes storm darker than rain at equal intensity', () => {
    const rain = applyWeatherOverlay(baseFog, weather({ type: 'rain', intensity: 1 }))
    const storm = applyWeatherOverlay(baseFog, weather({ type: 'storm', intensity: 1 }))
    expect(storm.lightScale).toBeLessThan(rain.lightScale)
  })
})

describe('applyLightningFlash', () => {
  it('boosts light without mutating the base overlay object', () => {
    const storm = applyWeatherOverlay(baseFog, weather({ type: 'storm', intensity: 1 }))
    const flashed = applyLightningFlash(storm, 0.8)
    expect(flashed.lightScale).toBeGreaterThan(storm.lightScale)
    expect(applyLightningFlash(storm, 0)).toBe(storm)
  })
})

describe('resolveSceneFog (cave interior)', () => {
  it('passes outdoor fog through unchanged when not inside a cave', () => {
    const outdoor = applyWeatherOverlay(baseFog, weather({ type: 'fog', intensity: 1 }))
    expect(resolveSceneFog(outdoor, false)).toEqual({
      fogColor: outdoor.fogColor,
      fogNear: outdoor.fogNear,
      fogFar: outdoor.fogFar,
    })
  })

  it('uses a dark cave profile so weather fog does not brighten the interior', () => {
    const outdoorFog = applyWeatherOverlay(baseFog, weather({ type: 'fog', intensity: 1 }))
    const outdoorRain = applyWeatherOverlay(baseFog, weather({ type: 'rain', intensity: 1 }))
    const caveFog = resolveSceneFog(outdoorFog, true)
    const caveRain = resolveSceneFog(outdoorRain, true)
    expect(caveFog).toEqual(caveRain)
    expect(fogColorLuminance(caveFog.fogColor)).toBeLessThan(fogColorLuminance(outdoorFog.fogColor))
    expect(fogColorLuminance(caveFog.fogColor)).toBeLessThan(0.08)
  })

  it('restores the current outdoor overlay after leaving a cave (not a hardcoded default)', () => {
    const rainy = applyWeatherOverlay(baseFog, weather({ type: 'rain', intensity: 1 }))
    const afterExit = resolveSceneFog(rainy, false)
    expect(afterExit.fogColor).toBe(rainy.fogColor)
    expect(afterExit.fogNear).toBe(rainy.fogNear)
    expect(afterExit.fogFar).toBe(rainy.fogFar)
  })
})

const baseSky = { turbidity: 1.4, rayleigh: 1.15 }

describe('applyWeatherSkyOverlay', () => {
  it('leaves turbidity/rayleigh untouched for clear weather', () => {
    const overlay = applyWeatherSkyOverlay(baseSky, weather({ type: 'clear', intensity: 0 }))
    expect(overlay.turbidity).toBe(baseSky.turbidity)
    expect(overlay.rayleigh).toBe(baseSky.rayleigh)
  })

  it('raises turbidity and lowers rayleigh for storm', () => {
    const overlay = applyWeatherSkyOverlay(baseSky, weather({ type: 'storm', intensity: 1 }))
    expect(overlay.turbidity).toBeGreaterThan(baseSky.turbidity)
    expect(overlay.rayleigh).toBeLessThan(baseSky.rayleigh)
  })

  it('makes storm a stronger sky overlay than rain at equal intensity', () => {
    const rain = applyWeatherSkyOverlay(baseSky, weather({ type: 'rain', intensity: 1 }))
    const storm = applyWeatherSkyOverlay(baseSky, weather({ type: 'storm', intensity: 1 }))
    expect(storm.turbidity).toBeGreaterThan(rain.turbidity)
    expect(storm.rayleigh).toBeLessThan(rain.rayleigh)
    expect(rain.turbidity).toBeGreaterThan(baseSky.turbidity)
    expect(rain.rayleigh).toBeLessThan(baseSky.rayleigh)
  })

  it('never raises rayleigh above the day/night base for any weather type', () => {
    for (const type of ['clear', 'cloudy', 'rain', 'fog', 'snow', 'storm'] as const) {
      const overlay = applyWeatherSkyOverlay(baseSky, weather({ type, intensity: 1 }))
      expect(overlay.rayleigh).toBeLessThanOrEqual(baseSky.rayleigh)
    }
  })
})

describe('grassWindAmpFor', () => {
  it('is identity for clear weather', () => {
    expect(grassWindAmpFor(weather({ type: 'clear', intensity: 0 }))).toBe(1)
  })

  it('makes storm stronger than rain at equal intensity', () => {
    const rain = grassWindAmpFor(weather({ type: 'rain', intensity: 1 }))
    const storm = grassWindAmpFor(weather({ type: 'storm', intensity: 1 }))
    expect(rain).toBeGreaterThan(1)
    expect(storm).toBeGreaterThan(rain)
  })

  it('never exceeds GRASS_WIND_AMP_MAX', () => {
    for (const type of ['clear', 'cloudy', 'rain', 'fog', 'snow', 'storm'] as const) {
      expect(grassWindAmpFor(weather({ type, intensity: 1 }))).toBeLessThanOrEqual(GRASS_WIND_AMP_MAX)
    }
  })
})
