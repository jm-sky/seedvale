import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import type { WeatherState } from './weather'
import { formatWorldDayClock, skyParamsFromTime, sunDirectionalColorFromSunY } from './dayNight'
import { applyWeatherOverlay } from './weatherVisuals'

describe('formatWorldDayClock', () => {
  it('labels the first world day as Dzień 1', () => {
    expect(formatWorldDayClock(0, 0.32)).toBe('Dzień 1 · 07:40')
    expect(formatWorldDayClock(0.99, 0)).toBe('Dzień 1 · 00:00')
  })

  it('uses elapsedDays plus one for later days', () => {
    expect(formatWorldDayClock(1, 0.5)).toBe('Dzień 2 · 12:00')
    expect(formatWorldDayClock(4.2, 0.75)).toBe('Dzień 5 · 18:00')
  })
})

const INTENSITY_EPS = 0.08

function weatherClear(): WeatherState {
  return { type: 'clear', intensity: 0, temperature: 12, startedAt: 0, endsAt: 0.3 }
}

describe('skyParamsFromTime', () => {
  it('returns bounded non-negative light intensities at key times', () => {
    for (const timeOfDay of [0, 0.25, 0.5, 0.75]) {
      const p = skyParamsFromTime(timeOfDay)
      expect(p.sunIntensity).toBeGreaterThanOrEqual(0)
      expect(p.ambientIntensity).toBeGreaterThanOrEqual(0)
      expect(p.hemiIntensity).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(p.sunIntensity)).toBe(true)
    }
  })

  it('keeps direct light dominant over indirect at noon', () => {
    const p = skyParamsFromTime(0.5)
    expect(p.sunIntensity).toBeGreaterThan(p.ambientIntensity)
    expect(p.sunIntensity).toBeGreaterThan(p.hemiIntensity)
  })

  it('matches dawn and dusk intensities (symmetric elevation)', () => {
    const dawn = skyParamsFromTime(0.25)
    const dusk = skyParamsFromTime(0.75)
    expect(dawn.sunIntensity).toBeCloseTo(dusk.sunIntensity, 5)
    expect(dawn.ambientIntensity).toBeCloseTo(dusk.ambientIntensity, 5)
    expect(dawn.hemiIntensity).toBeCloseTo(dusk.hemiIntensity, 5)
  })

  it('changes smoothly across dawn and dusk thresholds', () => {
    const beforeDawn = skyParamsFromTime(0.249)
    const afterDawn = skyParamsFromTime(0.251)
    expect(Math.abs(beforeDawn.sunIntensity - afterDawn.sunIntensity)).toBeLessThan(INTENSITY_EPS)
    expect(Math.abs(beforeDawn.ambientIntensity - afterDawn.ambientIntensity)).toBeLessThan(INTENSITY_EPS)

    const beforeDusk = skyParamsFromTime(0.749)
    const afterDusk = skyParamsFromTime(0.751)
    expect(Math.abs(beforeDusk.sunIntensity - afterDusk.sunIntensity)).toBeLessThan(INTENSITY_EPS)
    expect(Math.abs(beforeDusk.ambientIntensity - afterDusk.ambientIntensity)).toBeLessThan(INTENSITY_EPS)
  })

  it('still composes with weather lightScale as a multiplier', () => {
    const base = skyParamsFromTime(0.5)
    const overlay = applyWeatherOverlay(
      { fogColor: base.fogColor, fogNear: base.fogNear, fogFar: base.fogFar },
      { ...weatherClear(), type: 'storm', intensity: 1 },
    )
    expect(overlay.lightScale).toBeLessThan(1)
    expect(base.sunIntensity * overlay.lightScale).toBeLessThan(base.sunIntensity)
  })
})

describe('sunDirectionalColorFromSunY', () => {
  const low = new Color()
  const high = new Color()

  it('warms low sun and stays in gamut', () => {
    sunDirectionalColorFromSunY(0.05, low)
    sunDirectionalColorFromSunY(0.95, high)
    expect(low.b).toBeLessThan(high.b)
    expect(low.g).toBeLessThan(high.g)
    for (const c of [low, high]) {
      expect(c.r).toBeGreaterThanOrEqual(0)
      expect(c.r).toBeLessThanOrEqual(1)
      expect(c.g).toBeGreaterThanOrEqual(0)
      expect(c.g).toBeLessThanOrEqual(1)
      expect(c.b).toBeGreaterThanOrEqual(0)
      expect(c.b).toBeLessThanOrEqual(1)
    }
  })
})
