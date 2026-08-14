/** Player locomotion one-shots (footsteps, jump stand-in, splash candidate). */

import type { FootstepSurface } from '../terrain/footstepSurface'
import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

/** Generic hard-surface set (Kenney) — kept only for the jump-land thud;
 *  walking/sprinting footsteps use the terrain-classified sets below. */
export const FOOTSTEP_SOUND_URLS = [
  '/sounds/footstep-01.ogg',
  '/sounds/footstep-02.ogg',
  '/sounds/footstep-03.ogg',
  '/sounds/footstep-04.ogg',
] as const

/** Per-surface walking/sprinting footstep variants (S01) — see
 *  `public/sounds/README.md` "Footsteps (terrain)" for attribution. */
const FOOTSTEP_SURFACE_URLS: Record<FootstepSurface, readonly string[]> = {
  grass: Array.from({ length: 9 }, (_, i) => `/sounds/footstep-grass-${String(i + 1).padStart(2, '0')}.ogg`),
  road: Array.from({ length: 10 }, (_, i) => `/sounds/footstep-road-${String(i + 1).padStart(2, '0')}.ogg`),
  dirt: Array.from({ length: 9 }, (_, i) => `/sounds/footstep-dirt-${String(i + 1).padStart(2, '0')}.ogg`),
  sand: Array.from({ length: 6 }, (_, i) => `/sounds/footstep-sand-${String(i + 1).padStart(2, '0')}.ogg`),
  stone: Array.from({ length: 6 }, (_, i) => `/sounds/footstep-stone-${String(i + 1).padStart(2, '0')}.ogg`),
}

/** Kenney cloth whoosh — stand-in until a dedicated jump clip exists (S17). */
export const JUMP_CLOTH_SOUND_URL = '/sounds/action-jump-cloth-01.ogg'
/** Gentle lap — candidate only, not a true splash/wade (S02). */
export const WATER_LAP_SOUND_URL = '/sounds/water-lap-01.ogg'

const FOOTSTEP_VOLUME = 0.14
const FOOTSTEP_SPRINT_VOLUME = 0.2
const JUMP_VOLUME = 0.32
const LAND_VOLUME = 0.42
const SPLASH_VOLUME = 0.4

function randomFootstepUrl(): string {
  return FOOTSTEP_SOUND_URLS[Math.floor(Math.random() * FOOTSTEP_SOUND_URLS.length)]!
}

function randomSurfaceFootstepUrl(surface: FootstepSurface): string {
  const urls = FOOTSTEP_SURFACE_URLS[surface]
  return urls[Math.floor(Math.random() * urls.length)]!
}

export function playFootstep(playAt: PlayAt, position: WorldSoundPosition, sprinting: boolean, surface: FootstepSurface): void {
  playAt(randomSurfaceFootstepUrl(surface), position, sprinting ? FOOTSTEP_SPRINT_VOLUME : FOOTSTEP_VOLUME)
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
