/** Weather ambience — shared non-positional rain/storm loops plus delayed
 *  thunder one-shots keyed to the world lightning event. Cave interior uses
 *  the same `Caves.queryInterior` flag as `createAmbientAudio`. */

import type { LightningThunderCue } from '../world/lightningEvents'
import type { AudioLoopHandle, WorldAudio } from './createWorldAudio'
import { isRainWeather, type WeatherState } from '../world/weather'

export const AMBIENT_RAIN_LOOP_URL = '/sounds/ambient-rain-loop-01.ogg'
export const AMBIENT_STORM_WIND_LOOP_URL = '/sounds/ambient-wind-loop-01.ogg'
/** Thunder variants — clips are not in the repo yet (`docs/assets/SOUNDS.md`
 *  S28, status `needed`). Playback warns and no-ops until acquired. */
export const THUNDER_SOUND_URLS = [
  '/sounds/weather-thunder-01.ogg',
  '/sounds/weather-thunder-02.ogg',
  '/sounds/weather-thunder-03.ogg',
] as const

const RAIN_LOOP_MAX_VOLUME = 0.45
const STORM_RAIN_LOOP_MAX_VOLUME = 0.72
const STORM_WIND_LOOP_MAX_VOLUME = 0.5
const THUNDER_MAX_VOLUME = 0.95
const THUNDER_CAVE_VOLUME = 0.22

export type WeatherAudio = {
  update: (
    weather: WeatherState,
    inCaveInterior?: boolean,
    thunder?: LightningThunderCue | null,
  ) => void
  dispose: () => void
}

export function rainGainFor(weather: WeatherState, inCaveInterior: boolean): number {
  if (inCaveInterior || !isRainWeather(weather.type)) return 0
  const max = weather.type === 'storm' ? STORM_RAIN_LOOP_MAX_VOLUME : RAIN_LOOP_MAX_VOLUME
  const intensity = weather.type === 'storm'
    ? Math.min(1, 0.55 + weather.intensity * 0.45)
    : weather.intensity
  return intensity * max
}

export function stormWindGain(weather: WeatherState, inCaveInterior: boolean): number {
  if (inCaveInterior || weather.type !== 'storm') return 0
  return weather.intensity * STORM_WIND_LOOP_MAX_VOLUME
}

export function thunderVolume(cue: LightningThunderCue, inCaveInterior: boolean): number {
  const distanceFalloff = 1 / (1 + cue.simulatedDistanceM / 420)
  const volume = cue.strength * THUNDER_MAX_VOLUME * (0.45 + distanceFalloff * 0.55)
  return inCaveInterior ? volume * THUNDER_CAVE_VOLUME : volume
}

/** No snow ambience asset exists yet (`docs/assets/SOUNDS.md` S21, status
 *  `needed`) — snow stays visual-only. Thunder clips are similarly pending. */
export function createWeatherAudio(worldAudio: WorldAudio): WeatherAudio {
  let rainLoop: AudioLoopHandle | null = null
  let windLoop: AudioLoopHandle | null = null
  const playedThunder = new Set<string>()

  function update(
    weather: WeatherState,
    inCaveInterior = false,
    thunder: LightningThunderCue | null = null,
  ): void {
    const rainGain = rainGainFor(weather, inCaveInterior)
    if (!rainLoop && rainGain > 0.02) {
      rainLoop = worldAudio.createLoop(AMBIENT_RAIN_LOOP_URL)
    }
    rainLoop?.setTargetGain(rainGain)

    const windGain = stormWindGain(weather, inCaveInterior)
    if (!windLoop && windGain > 0.02) {
      windLoop = worldAudio.createLoop(AMBIENT_STORM_WIND_LOOP_URL)
    }
    windLoop?.setTargetGain(windGain)

    if (weather.type !== 'storm' && playedThunder.size > 0) playedThunder.clear()
    if (thunder && !playedThunder.has(thunder.eventId)) {
      playedThunder.add(thunder.eventId)
      const url = THUNDER_SOUND_URLS[thunder.variantIndex % THUNDER_SOUND_URLS.length]!
      worldAudio.playOnce(url, thunderVolume(thunder, inCaveInterior), 'sfx')
    }
  }

  function dispose(): void {
    rainLoop?.dispose()
    rainLoop = null
    windLoop?.dispose()
    windLoop = null
    playedThunder.clear()
  }

  return { update, dispose }
}
