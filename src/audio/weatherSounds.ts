/** Weather ambience — a single shared, non-positional rain loop; gain tracks
 *  rain intensity. Mirrors `fireSounds.ts::createFireAudio`'s "one shared
 *  loop, lazily created on first non-zero gain" pattern. */

import type { WeatherState } from '../world/weather'
import type { AudioLoopHandle, WorldAudio } from './createWorldAudio'

export const AMBIENT_RAIN_LOOP_URL = '/sounds/ambient-rain-loop-01.ogg'

const RAIN_LOOP_MAX_VOLUME = 0.45

export type WeatherAudio = {
  update: (weather: WeatherState) => void
  dispose: () => void
}

/** No snow ambience asset exists yet (`docs/assets/SOUNDS.md` S08, status
 *  `needed`) — snow stays visual-only in Etap 1. */
export function createWeatherAudio(worldAudio: WorldAudio): WeatherAudio {
  let rainLoop: AudioLoopHandle | null = null

  function update(weather: WeatherState): void {
    const gain = weather.type === 'rain' ? weather.intensity : 0
    if (!rainLoop && gain > 0.02) {
      rainLoop = worldAudio.createLoop(AMBIENT_RAIN_LOOP_URL)
    }
    rainLoop?.setTargetGain(gain * RAIN_LOOP_MAX_VOLUME)
  }

  function dispose(): void {
    rainLoop?.dispose()
    rainLoop = null
  }

  return { update, dispose }
}
