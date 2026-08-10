import { Color } from 'three'
import type { SkyParams } from './createSky'

const NIGHT_FOG = new Color(0x1a2233)
const DUSK_FOG = new Color(0xc4876a)
const DAY_FOG = new Color(0x9ec5e0)
const tmpFogColor = new Color()

/** Smooth night→dusk/dawn→day fog color from sun elevation, replacing a
 *  hard 3-bucket switch that popped visibly at each threshold crossing. */
function fogColorFromElev(elev: number): number {
  if (elev <= -0.3) return NIGHT_FOG.getHex()
  if (elev >= 0.3) return DAY_FOG.getHex()
  if (elev <= 0) {
    tmpFogColor.copy(NIGHT_FOG).lerp(DUSK_FOG, (elev + 0.3) / 0.3)
  } else {
    tmpFogColor.copy(DUSK_FOG).lerp(DAY_FOG, elev / 0.3)
  }
  return tmpFogColor.getHex()
}

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
  /** Raw sun elevation: -1 night … 0 horizon … +1 noon. Unlike `dayFactor`
   *  this keeps sign/magnitude below the horizon — needed by effects that
   *  care specifically about "sun near the horizon" (god rays). */
  elev: number
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

  // `fogNear` used to start as close as 70 — on terrain with short sightlines
  // (mountain ridges/valleys) most of the visible surface already fell past
  // it, reading as "walked into a wall of fog." Pushed further out so nearby
  // terrain reads clearly; `fogFar` is left alone; it's tuned to how far
  // chunks actually stream in (`ChunkManagerConfig.unloadRadius` ×
  // `chunkSize`, ~256 by default) so the pop-in edge stays hidden.
  const fogNear = 130 + dayFactor * 50
  const fogFar = 180 + dayFactor * 80
  const fogColor = fogColorFromElev(elev)

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
    elev,
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
