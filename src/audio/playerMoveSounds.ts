/** Player locomotion one-shots (footsteps, jump stand-in, splash candidate). */

import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

export const FOOTSTEP_SOUND_URLS = [
  '/sounds/footstep-01.ogg',
  '/sounds/footstep-02.ogg',
  '/sounds/footstep-03.ogg',
  '/sounds/footstep-04.ogg',
] as const

/** Kenney cloth whoosh — stand-in until a dedicated jump clip exists (S17). */
export const JUMP_CLOTH_SOUND_URL = '/sounds/action-jump-cloth-01.ogg'
/** Gentle lap — candidate only, not a true splash/wade (S02). */
export const WATER_LAP_SOUND_URL = '/sounds/water-lap-01.ogg'

const FOOTSTEP_VOLUME = 0.28
const FOOTSTEP_SPRINT_VOLUME = 0.34
const JUMP_VOLUME = 0.32
const LAND_VOLUME = 0.42
const SPLASH_VOLUME = 0.4

function randomFootstepUrl(): string {
  return FOOTSTEP_SOUND_URLS[Math.floor(Math.random() * FOOTSTEP_SOUND_URLS.length)]!
}

export function playFootstep(playAt: PlayAt, position: WorldSoundPosition, sprinting: boolean): void {
  playAt(randomFootstepUrl(), position, sprinting ? FOOTSTEP_SPRINT_VOLUME : FOOTSTEP_VOLUME)
}

export function playJumpTakeoff(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(JUMP_CLOTH_SOUND_URL, position, JUMP_VOLUME)
}

/** Louder footstep thud — no dedicated land clip in staging. */
export function playJumpLand(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(randomFootstepUrl(), position, LAND_VOLUME)
}

export function playWaterLap(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(WATER_LAP_SOUND_URL, position, SPLASH_VOLUME)
}
