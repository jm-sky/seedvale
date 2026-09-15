import { Color } from 'three'
import type { TerrainVisualHorizon } from '../terrain/terrainVisualHorizon'
import type { WeatherState, WeatherType } from './weather'

/** Weather → fog/light/sky-dome overlay applied on top of `skyParamsFromTime`'s
 *  day/night result (`gameLoop.ts`'s `applyDayNight`). `dayFactor` / `elev` /
 *  sun angles stay weather-independent so grass/water/ocean day-night shading
 *  and god rays keep a single time-of-day signal; the Sky.js dome's
 *  turbidity/rayleigh and the fog/light intensities are the weather layer.
 *  Billboard clouds live in `clouds.ts`; grass wind amplitude is `grassWindAmpFor`. */
export type WeatherVisualOverlay = {
  fogColor: number
  fogNear: number
  fogFar: number
  /** Multiplies sun/ambient/hemi intensity. */
  lightScale: number
}

type WeatherVisualProfile = {
  lightScale: number
  fogNearMul: number
  fogFarMul: number
  fogTint: number | null
  fogTintStrength: number
}

const WEATHER_VISUAL_PROFILES: Record<WeatherType, WeatherVisualProfile> = {
  clear: { lightScale: 1, fogNearMul: 1, fogFarMul: 1, fogTint: null, fogTintStrength: 0 },
  cloudy: { lightScale: 0.8, fogNearMul: 0.8, fogFarMul: 0.85, fogTint: 0x8a97a3, fogTintStrength: 0.35 },
  rain: { lightScale: 0.62, fogNearMul: 0.45, fogFarMul: 0.55, fogTint: 0x5c6b78, fogTintStrength: 0.55 },
  storm: { lightScale: 0.4, fogNearMul: 0.32, fogFarMul: 0.4, fogTint: 0x3a4654, fogTintStrength: 0.72 },
  fog: { lightScale: 0.75, fogNearMul: 0.12, fogFarMul: 0.32, fogTint: 0xc7cdd2, fogTintStrength: 0.75 },
  snow: { lightScale: 0.78, fogNearMul: 0.6, fogFarMul: 0.65, fogTint: 0xdfe6ec, fogTintStrength: 0.5 },
}

const tmpFogColor = new Color()
const tmpTintColor = new Color()

/** Pure — `intensity` (0 for `clear`) linearly blends profile onto `base`. */
export function applyWeatherOverlay(
  base: { fogColor: number, fogNear: number, fogFar: number },
  weather: WeatherState,
): WeatherVisualOverlay {
  const profile = WEATHER_VISUAL_PROFILES[weather.type]
  const t = weather.intensity
  const lightScale = 1 - (1 - profile.lightScale) * t
  const fogNear = base.fogNear * (1 - (1 - profile.fogNearMul) * t)
  const fogFar = base.fogFar * (1 - (1 - profile.fogFarMul) * t)
  let fogColor = base.fogColor
  if (profile.fogTint !== null && t > 0) {
    tmpFogColor.setHex(base.fogColor)
    tmpTintColor.setHex(profile.fogTint)
    tmpFogColor.lerp(tmpTintColor, profile.fogTintStrength * t)
    fogColor = tmpFogColor.getHex()
  }
  const clampedNear = Math.max(8, fogNear)
  return {
    fogColor,
    fogNear: clampedNear,
    fogFar: Math.max(clampedNear + 6, fogFar),
    lightScale,
  }
}

/** Caps outdoor fog distances by the terrain visual horizon (plan
 *  world-terrain-035) so terrain-dependent meshes fade out before
 *  unsupported streamed terrain can be exposed. Never weakens weather fog —
 *  only pulls `fogNear`/`fogFar` nearer, matching `horizon`'s own
 *  `fadeStart`/`opaqueAt` clamp style so near stays below far. Fog color is
 *  untouched, keeping day/night/weather as the only atmospheric-color source.
 *
 * @domain world-terrain
 */
export function capOutdoorFogToTerrainHorizon(
  overlay: WeatherVisualOverlay,
  horizon: TerrainVisualHorizon,
): WeatherVisualOverlay {
  const fogFar = Math.min(overlay.fogFar, horizon.opaqueAt)
  const fogNear = Math.min(overlay.fogNear, horizon.fadeStart, Math.max(8, fogFar - 6))
  return { ...overlay, fogNear, fogFar }
}

export type WeatherSkyOverlay = {
  turbidity: number
  rayleigh: number
}

type WeatherSkyProfile = {
  /** Multiplier on day/night turbidity. 1 = unchanged. */
  turbidityMul: number
  /** Multiplier on day/night rayleigh. Always <= 1 — raising rayleigh
   *  washes the dome white (plan 066). */
  rayleighMul: number
}

const WEATHER_SKY_PROFILES: Record<WeatherType, WeatherSkyProfile> = {
  clear: { turbidityMul: 1, rayleighMul: 1 },
  cloudy: { turbidityMul: 1, rayleighMul: 1 },
  fog: { turbidityMul: 1, rayleighMul: 1 },
  snow: { turbidityMul: 1, rayleighMul: 1 },
  rain: { turbidityMul: 1.45, rayleighMul: 0.75 },
  storm: { turbidityMul: 2.1, rayleighMul: 0.48 },
}

/** Pure — blends Sky.js turbidity/rayleigh toward the weather profile by
 *  `intensity`. Does not touch sun angles or `dayFactor`. Rayleigh is never
 *  raised above the day/night base.
 *
 * @domain world
 */
export function applyWeatherSkyOverlay(
  base: { turbidity: number, rayleigh: number },
  weather: WeatherState,
): WeatherSkyOverlay {
  const profile = WEATHER_SKY_PROFILES[weather.type]
  const t = weather.intensity
  return {
    turbidity: base.turbidity * (1 + (profile.turbidityMul - 1) * t),
    rayleigh: base.rayleigh * (1 + (profile.rayleighMul - 1) * t),
  }
}

/** Ceiling for `grassWindAmpFor` — `grassBounds.ts`'s `WIND_SWAY_PAD` must
 *  cover this displacement so frustum culling stays conservative. */
export const GRASS_WIND_AMP_MAX = 1.8

const GRASS_WIND_AMP: Record<WeatherType, number> = {
  clear: 1,
  cloudy: 1,
  fog: 1,
  snow: 1.15,
  rain: 1.35,
  storm: 1.8,
}

/** Pure — shared grass-shader `uWindAmp`. 1 is the clear-sky rest pose.
 *
 * @domain world
 */
export function grassWindAmpFor(weather: WeatherState): number {
  const profile = GRASS_WIND_AMP[weather.type]
  const amp = 1 + (profile - 1) * weather.intensity
  return amp > GRASS_WIND_AMP_MAX ? GRASS_WIND_AMP_MAX : amp
}

const tmpFlashFog = new Color()

/**
 * Short lightning flash on top of the weather overlay — does not mutate the
 * underlying day/night or weather profile, only the presentation copy.
 *
 * @domain world
 */
export function applyLightningFlash(
  overlay: WeatherVisualOverlay,
  flashAmount: number,
): WeatherVisualOverlay {
  if (flashAmount <= 0) return overlay
  const t = flashAmount > 1 ? 1 : flashAmount
  tmpFlashFog.setHex(overlay.fogColor)
  tmpFlashFog.lerp(tmpTintColor.setHex(0xf4f0e4), t * 0.55)
  return {
    fogColor: tmpFlashFog.getHex(),
    fogNear: overlay.fogNear,
    fogFar: overlay.fogFar,
    lightScale: overlay.lightScale + t * 1.85,
  }
}

/** Dark falloff for production cave interiors — replaces bright exterior/weather
 *  fog so `scene.fog` does not wash the heightfield toward sky grey. */
export const CAVE_INTERIOR_FOG_COLOR = 0x0a0806
export const CAVE_INTERIOR_FOG_NEAR = 2
export const CAVE_INTERIOR_FOG_FAR = 55

export type SceneFogParams = Pick<WeatherVisualOverlay, 'fogColor' | 'fogNear' | 'fogFar'>

/** Picks fog written to `scene.fog` after day/night + weather overlay. */
export function resolveSceneFog(
  outdoorOverlay: WeatherVisualOverlay,
  inCaveInterior: boolean,
): SceneFogParams {
  if (!inCaveInterior) {
    return {
      fogColor: outdoorOverlay.fogColor,
      fogNear: outdoorOverlay.fogNear,
      fogFar: outdoorOverlay.fogFar,
    }
  }
  return {
    fogColor: CAVE_INTERIOR_FOG_COLOR,
    fogNear: CAVE_INTERIOR_FOG_NEAR,
    fogFar: CAVE_INTERIOR_FOG_FAR,
  }
}

/** sRGB luminance proxy for tests — lower means darker fog wash. */
export function fogColorLuminance(fogColor: number): number {
  const c = tmpFogColor.setHex(fogColor)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}
