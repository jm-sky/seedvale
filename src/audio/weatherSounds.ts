/** Weather ambience — shared non-positional rain/storm loops plus delayed
 *  thunder one-shots keyed to the world lightning event. Cave interior uses
 *  the same `Caves.queryInterior` flag as `createAmbientAudio`. */

import type { LightningThunderCue } from '../world/lightningEvents'
import type { AudioLoopHandle, WorldAudio } from './createWorldAudio'
import { isRainWeather, type WeatherState } from '../world/weather'

export const AMBIENT_RAIN_LOOP_URL = '/sounds/ambient-rain-loop-01.ogg'
export const AMBIENT_STORM_WIND_LOOP_URL = '/sounds/ambient-rain-storm-01.ogg'

/** Thunder one-shots picked from simulated strike distance (`docs/assets/SOUNDS.md` S28). */
export const THUNDER_SOUND_URLS = {
  veryClose: '/sounds/thunder-very-close.ogg',
  mid: '/sounds/thunder-mid.ogg',
  distant: '/sounds/thunder-distant.ogg',
} as const

export type ThunderClip = keyof typeof THUNDER_SOUND_URLS

/** Inclusive upper bound (m) for the very-close crack. */
export const THUNDER_VERY_CLOSE_DISTANCE_M = 220
/** Inclusive upper bound (m) for the mid rumble; farther is distant. */
export const THUNDER_MID_DISTANCE_M = 850

const RAIN_LOOP_MAX_VOLUME = 0.45
const STORM_RAIN_LOOP_MAX_VOLUME = 0.72
const STORM_WIND_LOOP_MAX_VOLUME = 0.5
const THUNDER_MAX_VOLUME: Record<ThunderClip, number> = {
  veryClose: 0.95,
  mid: 0.68,
  distant: 0.4,
}
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

/**
 * Distance band for a thunder one-shot. Pure — same metres always pick the same clip.
 *
 * @domain audio
 */
export function thunderClipFor(distanceM: number): ThunderClip {
  if (distanceM <= THUNDER_VERY_CLOSE_DISTANCE_M) return 'veryClose'
  if (distanceM <= THUNDER_MID_DISTANCE_M) return 'mid'
  return 'distant'
}

export function thunderSoundUrl(distanceM: number): string {
  return THUNDER_SOUND_URLS[thunderClipFor(distanceM)]
}

export function thunderVolume(cue: LightningThunderCue, inCaveInterior: boolean): number {
  const clip = thunderClipFor(cue.simulatedDistanceM)
  const distanceFalloff = 1 / (1 + cue.simulatedDistanceM / 420)
  const volume = cue.strength * THUNDER_MAX_VOLUME[clip] * (0.45 + distanceFalloff * 0.55)
  return inCaveInterior ? volume * THUNDER_CAVE_VOLUME : volume
}

/** No snow ambience asset exists yet (`docs/assets/SOUNDS.md` S21, status
 *  `needed`) — snow stays visual-only. */
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
      worldAudio.playOnce(
        thunderSoundUrl(thunder.simulatedDistanceM),
        thunderVolume(thunder, inCaveInterior),
        'sfx',
      )
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
