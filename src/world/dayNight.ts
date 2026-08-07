import type { SkyParams } from './createSky'

export type DayNightState = {
  /** 0 = midnight, 0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk */
  timeOfDay: number
  /** Real seconds for a full day cycle at multiplier = 1. */
  dayLengthSec: number
  /** Speed scale: 1 = normal, 2 = 2× faster, 0.5 = half speed. */
  timeMultiplier: number
  enabled: boolean
}

export function createDayNightState(
  overrides?: Partial<DayNightState>,
): DayNightState {
  return {
    timeOfDay: 0.32,
    dayLengthSec: 480,
    timeMultiplier: 1,
    enabled: true,
    ...overrides,
  }
}

export function tickDayNight(state: DayNightState, dt: number): void {
  if (!state.enabled) return
  const len = Math.max(30, state.dayLengthSec)
  const mult = Math.max(0, state.timeMultiplier)
  state.timeOfDay = (state.timeOfDay + (dt * mult) / len) % 1
}

/** Preetham-ish params + light hints from clock. */
export function skyParamsFromTime(timeOfDay: number): SkyParams & {
  sunIntensity: number
  ambientIntensity: number
  hemiIntensity: number
  fogNear: number
  fogFar: number
  fogColor: number
  /** 0 = full night, 1 = full day — shared by lights/fog/water. */
  dayFactor: number
} {
  // elev: -1 night … 0 horizon … +1 noon
  const elev = Math.sin((timeOfDay - 0.25) * Math.PI * 2)
  const dayFactor = Math.max(0, elev)

  const inclination = 0.5 - elev * 0.18
  const azimuth = 0.22 + timeOfDay * 0.15

  // Sky.js's own default rayleigh is 1 — pushing it much higher (as this code
  // used to, up to 2.6-3.4 at noon) drives the shader's extinction term
  // toward 0 across the whole dome, saturating every channel and erasing the
  // per-wavelength falloff that reads as "blue" instead of washed-out white.
  // Keep rayleigh close to that native scale; use turbidity for the
  // warm/hazy horizon look at low sun angles instead.
  let turbidity = 1.6 + (1 - Math.abs(elev)) * 2.8
  let rayleigh = 0.85 + dayFactor * 0.95
  if (elev < -0.15) {
    turbidity = 1.2
    rayleigh = 0.6
  }

  const sunIntensity = 0.15 + dayFactor * 1.35
  const ambientIntensity = 0.12 + dayFactor * 0.28
  const hemiIntensity = 0.15 + dayFactor * 0.45

  const fogNear = 70 + dayFactor * 40
  const fogFar = 180 + dayFactor * 80
  const fogColor = elev < 0 ? 0x1a2233 : elev < 0.25 ? 0xc4876a : 0x9ec5e0

  return {
    inclination,
    azimuth,
    turbidity,
    rayleigh,
    sunIntensity,
    ambientIntensity,
    hemiIntensity,
    fogNear,
    fogFar,
    fogColor,
    dayFactor,
  }
}

export function formatClock(timeOfDay: number): string {
  const minutes = Math.floor(timeOfDay * 24 * 60)
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function phaseName(timeOfDay: number): string {
  if (timeOfDay < 0.2 || timeOfDay >= 0.85) return 'noc'
  if (timeOfDay < 0.3) return 'świt'
  if (timeOfDay < 0.7) return 'dzień'
  return 'zmierzch'
}
