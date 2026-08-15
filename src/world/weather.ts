/** Plan 040 — deterministic seasons + weather, layered on the existing world
 *  clock (`dayNight.ts`). Season and weather are both **pure functions** of
 *  `elapsedDays` (weather also takes the world `seed`) — no runtime history
 *  to replay, so time-skip and save/load both just call these again instead
 *  of needing persisted weather state (plan §7/§19: "Generator powinien
 *  umożliwiać bezpośrednie wyznaczenie pogody dla dowolnego momentu świata"). */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow'

const SEASON_ORDER: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']
const WEATHER_TYPES: readonly WeatherType[] = ['clear', 'cloudy', 'rain', 'fog', 'snow']

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Wiosna',
  summer: 'Lato',
  autumn: 'Jesień',
  winter: 'Zima',
}

export const WEATHER_LABELS: Record<WeatherType, string> = {
  clear: 'Bezchmurnie',
  cloudy: 'Pochmurno',
  rain: 'Deszcz',
  fog: 'Mgła',
  snow: 'Śnieg',
}

/** Plan §4 default: 7 world-days per season, 28-day year. Season is a pure
 *  function of `elapsedDays` — no separate season counter/clock. */
export const DAYS_PER_SEASON = 7

export function getSeason(elapsedDays: number): Season {
  const idx = Math.floor(elapsedDays / DAYS_PER_SEASON)
  return SEASON_ORDER[((idx % 4) + 4) % 4]
}

/** 0..1 progress through the current season. */
export function getSeasonProgress(elapsedDays: number): number {
  const idx = elapsedDays / DAYS_PER_SEASON
  return idx - Math.floor(idx)
}

/** Weighted odds per plan §8 ("wagi, a nie twarde reguły") — a weight of 0
 *  means "never in this season" (no snow in summer). */
const SEASON_WEATHER_WEIGHTS: Record<Season, Record<WeatherType, number>> = {
  spring: { clear: 3, cloudy: 4, rain: 4, fog: 3, snow: 0 },
  summer: { clear: 6, cloudy: 3, rain: 2, fog: 0.5, snow: 0 },
  autumn: { clear: 2, cloudy: 4, rain: 4, fog: 3, snow: 0.5 },
  winter: { clear: 2, cloudy: 3.5, rain: 0.5, fog: 1.5, snow: 4 },
}

/** Informational baseline °C per season (plan §9); weather nudges it further. */
const SEASON_BASE_TEMPERATURE: Record<Season, number> = {
  spring: 12,
  summer: 23,
  autumn: 9,
  winter: -3,
}

const WEATHER_TEMPERATURE_DELTA: Record<WeatherType, number> = {
  clear: 2,
  cloudy: -1,
  rain: -2,
  fog: -1,
  snow: -4,
}

export function temperatureFor(season: Season, type: WeatherType): number {
  return SEASON_BASE_TEMPERATURE[season] + WEATHER_TEMPERATURE_DELTA[type]
}

/** Fixed-length weather "cycle" (in `elapsedDays`) — the bucket
 *  `computeWeather` hashes on, so any moment's weather can be derived
 *  directly (plan §7) instead of simulating/replaying intermediate
 *  transitions. ~2.4 real minutes at the default `dayLengthSec = 480`. */
const WEATHER_CYCLE_DAYS = 0.3

/** Deterministic per-(seed, cycle, salt) hash → [0,1) — same Wang-style
 *  integer mix as `terrain/worleyNoise.ts`'s private `hash01`, reimplemented
 *  here rather than imported since that module's helper isn't exported and
 *  is conceptually terrain-noise-specific. No allocation, no RNG object. */
function hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

function pickWeightedWeather(season: Season, roll01: number): WeatherType {
  const weights = SEASON_WEATHER_WEIGHTS[season]
  const total = WEATHER_TYPES.reduce((sum, type) => sum + weights[type], 0)
  let roll = roll01 * total
  for (const type of WEATHER_TYPES) {
    roll -= weights[type]
    if (roll <= 0) return type
  }
  return 'clear'
}

export type WeatherState = {
  type: WeatherType
  /** 0..1 — strength of the current weather (rain heaviness, fog thickness…). 0 for `clear`. */
  intensity: number
  /** Informational °C, season + weather derived. */
  temperature: number
  /** `elapsedDays` when this weather cycle began. */
  startedAt: number
  /** `elapsedDays` when this weather cycle ends and the next is due. */
  endsAt: number
}

/** Pure — same `(seed, elapsedDays, season)` always yields the same result,
 *  no matter how far `elapsedDays` jumped since the last call (time-skip,
 *  save/load restore). */
export function computeWeather(seed: number, elapsedDays: number, season: Season): WeatherState {
  const cycleIndex = Math.floor(elapsedDays / WEATHER_CYCLE_DAYS)
  const typeRoll = hash01(seed, cycleIndex, 0x9e3779b1)
  const intensityRoll = hash01(seed, cycleIndex, 0x517cc1b7)
  const type = pickWeightedWeather(season, typeRoll)
  return {
    type,
    intensity: type === 'clear' ? 0 : 0.4 + intensityRoll * 0.6,
    temperature: temperatureFor(season, type),
    startedAt: cycleIndex * WEATHER_CYCLE_DAYS,
    endsAt: (cycleIndex + 1) * WEATHER_CYCLE_DAYS,
  }
}

export type WorldClimateState = {
  season: Season
  seasonProgress: number
  weather: WeatherState
}

/** Pure — the single entry point other systems should read climate through
 *  (plan §5/§20), rather than knowing about `computeWeather`'s cycle-bucket
 *  implementation. */
export function computeClimate(seed: number, elapsedDays: number): WorldClimateState {
  const season = getSeason(elapsedDays)
  return { season, seasonProgress: getSeasonProgress(elapsedDays), weather: computeWeather(seed, elapsedDays, season) }
}

/** Mutable runtime cache around `computeClimate` — mirrors `dayNight.ts`'s
 *  "plain struct + pure tick fn" shape. Exists only so callers (gameLoop,
 *  debug GUI) have a stable object to read/`.listen()` on and so `weather`
 *  isn't recomputed from the hash every single frame (plan §17: "Climate
 *  state nie powinien być przeliczany co klatkę") — `tickClimate` only
 *  replaces it when `elapsedDays` crosses into a new weather cycle. Nothing
 *  here is persisted; `createClimateState`/`tickClimate` are always called
 *  with the live `(seed, elapsedDays)`, so save/load "restores" climate for
 *  free by re-deriving it (plan §19). */
export type ClimateState = {
  /** Debug-only override (lil-gui) — mirrors `DayNightState.enabled`-style
   *  fields; never persisted (plan §23: "Debug override nie powinien
   *  zmieniać deterministycznego modelu świata" — turning it back to
   *  `'auto'` simply resumes reading the deterministic function). */
  forced: WeatherType | 'auto'
  /** Internal bookkeeping — the `forced` value `tickClimate` last saw, so it
   *  can detect the auto→forced and forced→auto edges and recompute
   *  immediately instead of waiting for the next natural cycle boundary.
   *  Not meant to be read by callers. */
  lastForced: WeatherType | 'auto'
} & WorldClimateState

export function createClimateState(seed: number, elapsedDays: number): ClimateState {
  return { ...computeClimate(seed, elapsedDays), forced: 'auto', lastForced: 'auto' }
}

export function tickClimate(state: ClimateState, seed: number, elapsedDays: number): void {
  state.season = getSeason(elapsedDays)
  state.seasonProgress = getSeasonProgress(elapsedDays)
  const forcedChanged = state.forced !== state.lastForced
  state.lastForced = state.forced
  if (state.forced !== 'auto') {
    if (forcedChanged || state.weather.type !== state.forced) {
      state.weather = {
        type: state.forced,
        intensity: state.forced === 'clear' ? 0 : 0.7,
        temperature: temperatureFor(state.season, state.forced),
        startedAt: elapsedDays,
        endsAt: elapsedDays + WEATHER_CYCLE_DAYS,
      }
    } else if (state.weather.temperature !== temperatureFor(state.season, state.weather.type)) {
      state.weather = { ...state.weather, temperature: temperatureFor(state.season, state.weather.type) }
    }
    return
  }
  if (forcedChanged || elapsedDays < state.weather.startedAt || elapsedDays >= state.weather.endsAt) {
    state.weather = computeWeather(seed, elapsedDays, state.season)
  }
}
