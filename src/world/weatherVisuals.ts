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
  cloudy: { lightScale: 0.8, fogNearMul: 0.9, fogFarMul: 0.85, fogTint: 0x8a97a3, fogTintStrength: 0.35 },
  rain: { lightScale: 0.62, fogNearMul: 0.55, fogFarMul: 0.55, fogTint: 0x5c6b78, fogTintStrength: 0.55 },
  fog: { lightScale: 0.75, fogNearMul: 0.22, fogFarMul: 0.3, fogTint: 0xc7cdd2, fogTintStrength: 0.75 },
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
