/** Campfire / torch ignite + extinguish, plus a single distance-faded burn loop. */

import type { AudioLoopHandle, PlayAt, WorldAudio, WorldSoundPosition } from './createWorldAudio'
import { DISTANCE_GAIN_EPS, distanceGain } from './createWorldAudio'

export const ACTION_FIRE_IGNITE_SOUND_URL = '/sounds/action-fire-ignite-01.ogg'
export const ACTION_FIRE_EXTINGUISH_SOUND_URL = '/sounds/action-fire-extinguish-01.ogg'
export const AMBIENT_FIRE_LOOP_URL = '/sounds/ambient-fire-loop-01.ogg'

const IGNITE_VOLUME = 0.5
const EXTINGUISH_VOLUME = 0.45
const FIRE_LOOP_MAX_VOLUME = 0.38

export function playActionFireIgnite(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(ACTION_FIRE_IGNITE_SOUND_URL, position, IGNITE_VOLUME)
}

export function playActionFireExtinguish(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(ACTION_FIRE_EXTINGUISH_SOUND_URL, position, EXTINGUISH_VOLUME)
}

export type FireAudio = {
  /** `fires` = currently lit campfires (not the handheld torch). */
  update: (playerX: number, playerZ: number, fires: readonly WorldSoundPosition[]) => void
  dispose: () => void
}

/** One shared crackle loop, gain = distance to the nearest lit fire. */
export function createFireAudio(worldAudio: WorldAudio): FireAudio {
  let loop: AudioLoopHandle | null = null

  function update(playerX: number, playerZ: number, fires: readonly WorldSoundPosition[]): void {
    let best = 0
    for (const fire of fires) {
      const gain = distanceGain(Math.hypot(fire.x - playerX, fire.z - playerZ))
      if (gain > best) best = gain
    }
    if (!loop && best > DISTANCE_GAIN_EPS) {
      loop = worldAudio.createLoop(AMBIENT_FIRE_LOOP_URL)
    }
    loop?.setTargetGain(best * FIRE_LOOP_MAX_VOLUME)
  }

  function dispose(): void {
    loop?.dispose()
    loop = null
  }

  return { update, dispose }
}
