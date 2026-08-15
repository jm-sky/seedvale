import type { DayNightState } from './dayNight'

/** Plan 040 Etap 1 — season derived from world time, weather as weighted
 *  per-season state transitions. Mirrors `dayNight.ts`'s "plain mutable
 *  struct + pure tick fn" shape rather than a class — same reasoning: callers
 *  (GUI, save/restore, gameLoop) read/write fields directly. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow'

const SEASON_ORDER: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']
const WEATHER_TYPES: readonly Weather[] = ['clear', 'cloudy', 'rain', 'fog', 'snow']

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Wiosna',
  summer: 'Lato',
  autumn: 'Jesień',
  winter: 'Zima',
}

export const WEATHER_LABELS: Record<Weather, string> = {
  clear: 'Bezchmurnie',
  cloudy: 'Pochmurno',
  rain: 'Deszcz',
  fog: 'Mgła',
  snow: 'Śnieg',
}

/** Real-time days (at `dayNight.dayLengthSec`) one season lasts. A knob, not
 *  load-bearing elsewhere yet — Etap 1 has no resource/AI consumer of season
 *  length, so this only has to feel like a "season" during play. */
export const DAYS_PER_SEASON = 3

export function seasonFromElapsedDays(elapsedDays: number, daysPerSeason = DAYS_PER_SEASON): Season {
  const idx = Math.floor(elapsedDays / Math.max(0.1, daysPerSeason))
  return SEASON_ORDER[((idx % 4) + 4) % 4]
}

/** Weighted odds per plan §3 ("oparte na wagach, a nie twardych regułach") —
 *  a weight of 0 means "never in this season" (no snow in summer). */
const SEASON_WEATHER_WEIGHTS: Record<Season, Record<Weather, number>> = {
  spring: { clear: 3, cloudy: 4, rain: 4, fog: 3, snow: 0 },
  summer: { clear: 6, cloudy: 3, rain: 2, fog: 0.5, snow: 0 },
  autumn: { clear: 2, cloudy: 4, rain: 4, fog: 3, snow: 0.5 },
  winter: { clear: 2, cloudy: 3.5, rain: 0.5, fog: 1.5, snow: 4 },
}

/** Informational baseline °C per season (plan §4 — "w przyszłości ważny
 *  parametr"); weather nudges it further. No consumer yet besides the debug
 *  readout — Etap 4 is where temperature starts mattering to needs/stamina. */
const SEASON_BASE_TEMPERATURE: Record<Season, number> = {
  spring: 12,
  summer: 23,
  autumn: 9,
  winter: -3,
}

const WEATHER_TEMPERATURE_DELTA: Record<Weather, number> = {
  clear: 2,
  cloudy: -1,
  rain: -2,
  fog: -1,
  snow: -4,
}

/** Real-time-day duration range per weather type (`elapsedDays` units) —
 *  clear/cloudy stretches linger, precipitation passes through faster (plan
 *  §2: "przechodzi pomiędzy stanami w określonych odstępach czasu"). */
const WEATHER_DURATION_RANGE: Record<Weather, readonly [number, number]> = {
  clear: [0.35, 0.7],
  cloudy: [0.25, 0.5],
  rain: [0.12, 0.3],
  fog: [0.1, 0.25],
  snow: [0.15, 0.35],
}

export type WeatherState = {
  type: Weather
  /** 0..1 — strength of the current weather (rain heaviness, fog thickness…). 0 for `clear`. */
  intensity: number
  /** Informational °C, season + weather derived. */
  temperature: number
  /** `DayNightState.elapsedDays` when the current weather began. */
  startedAt: number
  /** How long (in `elapsedDays`) the current weather lasts before transitioning. */
  duration: number
  /** Debug override (`'auto'` = natural weighted transitions) — mirrors
   *  `DayNightState.enabled`-style debug fields: not persisted. */
  forced: Weather | 'auto'
}

export function pickWeightedWeather(season: Season, rand: () => number = Math.random): Weather {
  const weights = SEASON_WEATHER_WEIGHTS[season]
  const total = WEATHER_TYPES.reduce((sum, type) => sum + weights[type], 0)
  let roll = rand() * total
  for (const type of WEATHER_TYPES) {
    roll -= weights[type]
    if (roll <= 0) return type
  }
  return 'clear'
}

function pickDuration(type: Weather, rand: () => number = Math.random): number {
  const [min, max] = WEATHER_DURATION_RANGE[type]
  return min + rand() * (max - min)
}

function pickIntensity(type: Weather, rand: () => number = Math.random): number {
  if (type === 'clear') return 0
  return 0.4 + rand() * 0.6
}

export function temperatureFor(season: Season, type: Weather): number {
  return SEASON_BASE_TEMPERATURE[season] + WEATHER_TEMPERATURE_DELTA[type]
}

export function createWeatherState(overrides?: Partial<WeatherState>): WeatherState {
  const type = overrides?.type ?? 'clear'
  return {
    type,
    intensity: overrides?.intensity ?? pickIntensity(type),
    temperature: overrides?.temperature ?? temperatureFor('spring', type),
    startedAt: overrides?.startedAt ?? 0,
    duration: overrides?.duration ?? pickDuration(type),
    forced: overrides?.forced ?? 'auto',
  }
}

/** Advances weather — transitions to a new weighted type once the current
 *  one's `duration` (in `elapsedDays`) elapses. Reuses `dayNight.elapsedDays`
 *  as the time reference (not seconds/`Date.now()`) so duration survives
 *  time-skip correctly, same convention as `treeLifecycle.ts`'s
 *  `stageStartedAt`. `forced !== 'auto'` (debug GUI) short-circuits natural
 *  transitions but still recomputes `temperature` for the current season. */
export function tickWeather(state: WeatherState, dayNight: DayNightState, season: Season): void {
  if (state.forced !== 'auto') {
    if (state.type !== state.forced) {
      state.type = state.forced
      state.startedAt = dayNight.elapsedDays
      state.intensity = pickIntensity(state.forced)
    }
    state.temperature = temperatureFor(season, state.type)
    return
  }
  if (dayNight.elapsedDays - state.startedAt < state.duration) {
    state.temperature = temperatureFor(season, state.type)
    return
  }
  const next = pickWeightedWeather(season)
  state.type = next
  state.intensity = pickIntensity(next)
  state.startedAt = dayNight.elapsedDays
  state.duration = pickDuration(next)
  state.temperature = temperatureFor(season, next)
}
