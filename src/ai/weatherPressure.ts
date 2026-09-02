import type { WeatherState } from '../world/weather'
import type { NeedId } from './Needs'

/**
 * Weather → shelter-pressure mapping (plan npc-012). A pure pressure
 * producer, deliberately kept separate from `Needs.ts`'s Need-specific
 * `generateNeedPressures`: weather is a world condition, not a `NeedId`.
 * `NpcDecisionTarget` is the small generic seam `NpcAgent.choose()` uses to
 * combine this with the existing need pressures in one arbitration, without
 * turning `weather` into a fake Need or building a second decision engine.
 *
 * @domain npc
 */
export type NpcDecisionTarget = NeedId | 'seekShelter'

/** Below this rain intensity, rain reads as "light" — no shelter pressure at
 *  all, so a lightly rained-on NPC keeps doing whatever it was doing (plan
 *  §2: "Lekki deszcz może pozostawić NPC przy obecnym działaniu"). Note
 *  `computeWeather` never returns non-clear intensity below 0.4, so this
 *  still excludes roughly the bottom quarter of rain's own intensity range. */
const RAIN_INTENSITY_THRESHOLD = 0.55
const RAIN_PRESSURE_MULT = 0.75
/** Snow reads as uncomfortable a bit sooner than rain, and scores a bit
 *  higher at the same intensity (plan §2: "snow zazwyczaj silniejszy niż
 *  lekki deszcz"). */
const SNOW_INTENSITY_THRESHOLD = 0.45
const SNOW_PRESSURE_MULT = 0.85
/** Genuinely cold — below this, rain/snow stops being just "wet" and starts
 *  being dangerous regardless of how light the precipitation itself is. */
const COLD_TEMPERATURE_THRESHOLD_C = -2
/** Pressure floor applied once it's this cold and still raining/snowing,
 *  even when the precipitation itself is too light to cross its own
 *  threshold above. */
const COLD_PRESSURE_FLOOR = 0.45

/** Severe enough to interrupt a schedule-driven action already in flight via
 *  the existing critical-interrupt path (`NpcAgent.tickCriticalInterrupt`) —
 *  meaningfully above the highest value ordinary rain/cold-floor pressure
 *  reaches, same "critical needs a stricter bar" idiom as `Needs.ts`'s
 *  `CRITICAL_*_THRESHOLD`s. Only heavy rain or moderate-to-heavy snow cross
 *  this. */
export const WEATHER_SEVERE_SHELTER_THRESHOLD = 0.65

/**
 * Pure — same `WeatherState` always yields the same score, no exposure
 * duration/body-temperature/clothing modelling (out of scope, plan §9/§out
 * of scope). `clear`/`cloudy`/`fog` never produce shelter pressure regardless
 * of temperature (plan acceptance §1). Bounded to `[0, 1]`, same convention
 * as `Needs.ts`'s pressure scores, so it can compete directly against them.
 */
export function weatherShelterPressure(weather: WeatherState): number {
  const isSnow = weather.type === 'snow'
  if (weather.type !== 'rain' && !isSnow) return 0
  const threshold = isSnow ? SNOW_INTENSITY_THRESHOLD : RAIN_INTENSITY_THRESHOLD
  const mult = isSnow ? SNOW_PRESSURE_MULT : RAIN_PRESSURE_MULT
  let pressure = weather.intensity > threshold ? weather.intensity * mult : 0
  if (weather.temperature <= COLD_TEMPERATURE_THRESHOLD_C) pressure = Math.max(pressure, COLD_PRESSURE_FLOOR)
  return Math.min(1, pressure)
}
