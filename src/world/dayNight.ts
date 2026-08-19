import { Color } from 'three'
import type { SkyParams } from './createSky'

const NIGHT_FOG = new Color(0x1a2233)
const DUSK_FOG = new Color(0xc4876a)
/** Midday fog used to be `0x9ec5e0` — light enough that ACES+bloom read it as a
 *  white wall once distant terrain mixed toward it. Deeper blue-grey keeps
 *  atmospheric perspective without bleaching the horizon. */
const DAY_FOG = new Color(0x6a93b0)
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
  /** Absolute game-days elapsed since world start — advances with the clock
   *  (including time skip) and never wraps. Used by lazy systems such as tree
   *  growth (`world/treeLifecycle.ts`) that must survive chunk unload and save. */
  elapsedDays: number
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
    elapsedDays: 0,
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
  const advance = (dt * mult) / len
  state.elapsedDays += advance
  state.timeOfDay = (state.timeOfDay + advance) % 1
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
  // Cap midday ~1.15 — even 1.8 still bleached the dome white under bloom
  // (plan 066 whiteout screenshot @ ~12:00).
  let turbidity = 1.4 + (1 - Math.abs(elev)) * 2.4
  let rayleigh = 0.7 + dayFactor * 0.45
  if (elev < -0.15) {
    turbidity = 1.1
    rayleigh = 0.55
  }

  const sunIntensity = 0.15 + dayFactor * 1.15
  const ambientIntensity = 0.12 + dayFactor * 0.25
  const hemiIntensity = 0.15 + dayFactor * 0.38

  // Start fog further out so mid-ground hills stay readable; `fogFar` still
  // covers the chunk stream-in edge (~unloadRadius × chunkSize).
  const fogNear = 160 + dayFactor * 50
  const fogFar = 230 + dayFactor * 70
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

const TIME_PRESETS: Record<string, number> = {
  night: 0,
  noc: 0,
  midnight: 0,
  dawn: 0.25,
  swit: 0.25,
  świt: 0.25,
  day: 0.5,
  noon: 0.5,
  dzien: 0.5,
  dzień: 0.5,
  poludnie: 0.5,
  południe: 0.5,
  dusk: 0.75,
  zmierzch: 0.75,
  evening: 0.75,
}

function parseClockHour(raw: string): number | null {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 23) return null
  return n / 24
}

function parseTimeToken(raw: string): number | null {
  const token = raw.trim().toLowerCase()
  if (token === '') return null
  if (Object.prototype.hasOwnProperty.call(TIME_PRESETS, token)) {
    return TIME_PRESETS[token]
  }
  const clock = /^(\d{1,2}):(\d{2})$/.exec(token)
  if (clock) {
    const h = Number(clock[1])
    const m = Number(clock[2])
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return null
    }
    return (h + m / 60) / 24
  }
  const n = Number(token)
  if (!Number.isFinite(n)) return null
  if (Number.isInteger(n) && n >= 0 && n <= 23) return n / 24
  if (n >= 0 && n < 1) return n
  return null
}

/**
 * `?hour=0-23` wins over `?time=` (named / HH:MM / 0–23 / 0–1 fraction).
 * Missing or invalid → `null` (caller keeps save/default clock).
 */
export function parseTimeOfDayFromUrl(
  search = typeof window === 'undefined' ? '' : window.location.search,
): number | null {
  const params = new URLSearchParams(
    search.startsWith('?') || search.length === 0 ? search : `?${search}`,
  )
  const hourRaw = params.get('hour')
  if (hourRaw != null && hourRaw.trim() !== '') {
    const fromHour = parseClockHour(hourRaw.trim())
    if (fromHour != null) return fromHour
  }
  const timeRaw = params.get('time')
  if (timeRaw == null || timeRaw.trim() === '') return null
  return parseTimeToken(timeRaw)
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
