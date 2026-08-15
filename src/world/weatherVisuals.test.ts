import { describe, expect, it } from 'vitest'
import { createWeatherState } from './weather'
import { applyWeatherOverlay } from './weatherVisuals'

const baseFog = { fogColor: 0x6a93b0, fogNear: 160, fogFar: 230 }

describe('applyWeatherOverlay', () => {
  it('leaves fog/light untouched for clear weather (intensity 0)', () => {
    const overlay = applyWeatherOverlay(baseFog, createWeatherState({ type: 'clear', intensity: 0 }))
    expect(overlay.lightScale).toBe(1)
    expect(overlay.fogColor).toBe(baseFog.fogColor)
    expect(overlay.fogNear).toBe(baseFog.fogNear)
    expect(overlay.fogFar).toBe(baseFog.fogFar)
  })

  it('dims light and shrinks fog distance for rain', () => {
    const overlay = applyWeatherOverlay(baseFog, createWeatherState({ type: 'rain', intensity: 1 }))
    expect(overlay.lightScale).toBeLessThan(1)
    expect(overlay.fogNear).toBeLessThan(baseFog.fogNear)
    expect(overlay.fogFar).toBeLessThan(baseFog.fogFar)
  })

  it('fog weather shrinks visibility further than rain at equal intensity', () => {
    const rain = applyWeatherOverlay(baseFog, createWeatherState({ type: 'rain', intensity: 1 }))
    const fog = applyWeatherOverlay(baseFog, createWeatherState({ type: 'fog', intensity: 1 }))
    expect(fog.fogFar).toBeLessThan(rain.fogFar)
  })

  it('never lets fogNear/fogFar collapse to an invalid range', () => {
    const overlay = applyWeatherOverlay(baseFog, createWeatherState({ type: 'fog', intensity: 1 }))
    expect(overlay.fogNear).toBeGreaterThan(0)
    expect(overlay.fogFar).toBeGreaterThan(overlay.fogNear)
  })

  it('scales overlay strength by intensity', () => {
    const half = applyWeatherOverlay(baseFog, createWeatherState({ type: 'rain', intensity: 0.5 }))
    const full = applyWeatherOverlay(baseFog, createWeatherState({ type: 'rain', intensity: 1 }))
    expect(half.lightScale).toBeGreaterThan(full.lightScale)
  })
})
