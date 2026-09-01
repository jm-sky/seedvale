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
export const WEATHER_CYCLE_DAYS = 0.3

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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Plan 133 — how long damp ground takes to read fully dry again once rain
 *  (or snowmelt) stops feeding it. */
export const WETNESS_DRY_WINDOW_DAYS = 0.75
/** How long into an active rain cycle wetness takes to reach its target. */
const WETNESS_RISE_DAYS = 0.08
/** How long continuous snowfall takes to reach full visual coverage. */
export const SNOW_ACCUMULATE_WINDOW_DAYS = 1.1
/** How long snow cover takes to fully melt at a comfortably-above-freezing
 *  temperature (scales down as temperature approaches 0°C; frozen = no melt). */
export const SNOW_MELT_WINDOW_DAYS = 2.2
/** Bounded lookback for `computeSurfaceWeather`'s cycle-by-cycle simulation —
 *  covers the slowest of the windows above with margin, so a save/load or a
 *  multi-day time-skip resolves in a fixed number of steps instead of
 *  replaying every weather cycle since world start (plan 040's "any moment
 *  re-derives directly" guarantee, extended to the surface visuals). */
const SURFACE_SIM_WINDOW_DAYS = SNOW_ACCUMULATE_WINDOW_DAYS + SNOW_MELT_WINDOW_DAYS + 0.3

export type SurfaceWeatherState = {
  /** 0..1 — how wet/dark the terrain surface reads (rain, plus residual
   *  snowmelt). Global/shared, not per-chunk — see `buildChunkGeometry.ts`. */
  wetness: number
  /** 0..1 — visual snow coverage. Global/shared, not per-chunk. */
  snowAmount: number
}

/** Pure — same `(seed, elapsedDays)` always yields the same wetness/snow
 *  pair, independent of actual play history. Simulates forward one weather
 *  cycle at a time from a fixed-size lookback window (not from world start),
 *  so cost is O(`SURFACE_SIM_WINDOW_DAYS` / `WEATHER_CYCLE_DAYS`) regardless
 *  of how large `elapsedDays` is — cheap enough to call every frame, no
 *  per-chunk or per-particle state involved (plan 133). `wetness`/
 *  `snowAmount` are visual presentation only, not a soil/snow simulation. */
export function computeSurfaceWeather(seed: number, elapsedDays: number): SurfaceWeatherState {
  const currentCycle = Math.floor(elapsedDays / WEATHER_CYCLE_DAYS)
  const windowCycles = Math.ceil(SURFACE_SIM_WINDOW_DAYS / WEATHER_CYCLE_DAYS)
  const startCycle = Math.max(0, currentCycle - windowCycles)

  let wetness = 0
  let snow = 0
  for (let cycle = startCycle; cycle <= currentCycle; cycle++) {
    const cycleStart = cycle * WEATHER_CYCLE_DAYS
    const cycleSeason = getSeason(cycleStart)
    const w = computeWeather(seed, cycleStart, cycleSeason)
    const stepDays =
      cycle === currentCycle
        ? clamp01((elapsedDays - cycleStart) / WEATHER_CYCLE_DAYS) * WEATHER_CYCLE_DAYS
        : WEATHER_CYCLE_DAYS

    // Rain raises wetness toward an intensity-scaled target; anything else
    // (including snow — snow feeds wetness only through melt, below) lets it
    // decay back toward dry over the drying window.
    if (w.type === 'rain') {
      const target = clamp01(0.35 + w.intensity * 0.65)
      wetness = Math.max(wetness, target * clamp01(stepDays / WETNESS_RISE_DAYS))
    } else {
      wetness = Math.max(0, wetness * (1 - stepDays / WETNESS_DRY_WINDOW_DAYS))
    }

    // Snow accumulates while it keeps snowing; otherwise it melts at a rate
    // gated by temperature (frozen = no melt), feeding the melted amount
    // back into wetness so `snow → melting → wet ground` reads as one curve
    // instead of snow just vanishing.
    if (w.type === 'snow') {
      snow = snow + (1 - snow) * clamp01(stepDays / SNOW_ACCUMULATE_WINDOW_DAYS)
    } else if (snow > 0) {
      const meltRate = clamp01(w.temperature / 6)
      const melted = snow * meltRate * clamp01(stepDays / SNOW_MELT_WINDOW_DAYS)
      snow = Math.max(0, snow - melted)
      if (melted > 0) wetness = clamp01(Math.max(wetness, melted * 0.6))
    }
  }

  return { wetness: clamp01(wetness), snowAmount: clamp01(snow) }
}

/** Cumulative rain "intensity-days" between two `elapsedDays` timestamps —
 *  `world/bloodTraces.ts`'s weather-accelerated fading helper (plan
 *  world-009). Deliberately its own small function rather than reusing
 *  `computeSurfaceWeather`: that one replays a *fixed* bounded lookback
 *  window ending at "now" for a visual wetness/snow blend, whereas this
 *  needs the exact `[fromDays, toDays)` span of one blood trace's own life
 *  (already bounded to a few days by the trace's own lifetime, so no lookback
 *  window is needed — cost is just the number of weather cycles the span
 *  covers). Pure — same inputs always yield the same exposure, independent of
 *  when it's actually called (time-skip/save-load safe, same guarantee as
 *  `computeWeather` itself). */
export function computeRainExposureDays(seed: number, fromDays: number, toDays: number): number {
  if (toDays <= fromDays) return 0
  const startCycle = Math.floor(fromDays / WEATHER_CYCLE_DAYS)
  const endCycle = Math.floor(toDays / WEATHER_CYCLE_DAYS)
  let exposure = 0
  for (let cycle = startCycle; cycle <= endCycle; cycle++) {
    const cycleStart = cycle * WEATHER_CYCLE_DAYS
    const cycleEnd = cycleStart + WEATHER_CYCLE_DAYS
    const overlapDays = Math.min(cycleEnd, toDays) - Math.max(cycleStart, fromDays)
    if (overlapDays <= 0) continue
    const w = computeWeather(seed, cycleStart, getSeason(cycleStart))
    if (w.type === 'rain') exposure += overlapDays * w.intensity
  }
  return exposure
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
