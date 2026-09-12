import { Color } from 'three'
import type { WeatherState, WeatherType } from './weather'

/** Weather → fog/light overlay applied on top of `skyParamsFromTime`'s
 *  day/night result (`gameLoop.ts`'s `applyDayNight`). Deliberately leaves
 *  `dayFactor`/`elev`/the sky dome itself untouched (plan §5: "na początku
 *  nie trzeba przebudowywać materiałów całego świata") — grass/water/ocean
 *  day-night shading and god rays stay weather-independent in Etap 1. No
 *  literal cloud geometry exists yet (`docs/STATE.md` — clouds not
 *  implemented); "cloudy" reads here as dimmer light + hazier fog instead. */
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
