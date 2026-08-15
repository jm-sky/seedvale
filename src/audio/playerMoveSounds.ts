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

export const FOOTSTEP_PACK_IDS = ['anton', 'legacy', 'mayra'] as const
export type FootstepPackId = (typeof FOOTSTEP_PACK_IDS)[number]

function numbered(prefix: string, count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `/sounds/${prefix}-${String(i + 1).padStart(2, '0')}.ogg`)
}

/** Per-surface walking/sprinting variants (S01). `anton` is the wired default
 *  (plan 121); `legacy` / `mayra` stay in the tree for A/B (`?footsteps=` or
 *  lil-gui Audio). Attribution: `public/sounds/README.md` "Footsteps (terrain)". */
const FOOTSTEP_PACK_URLS: Record<FootstepPackId, Record<FootstepSurface, readonly string[]>> = {
  anton: {
    grass: numbered('footstep-grass', 7),
    road: numbered('footstep-road', 10),
    dirt: numbered('footstep-sand', 7),
    sand: numbered('footstep-sand', 7),
    stone: numbered('footstep-stone', 7),
  },
  legacy: {
    grass: numbered('footstep-grass-legacy', 9),
    road: numbered('footstep-road', 10),
    dirt: numbered('footstep-dirt-legacy', 9),
    sand: numbered('footstep-sand-legacy', 6),
    stone: numbered('footstep-stone-legacy', 6),
  },
  mayra: {
    grass: [
      '/sounds/footstep-grass-alt-mayra-01.ogg',
      '/sounds/footstep-grass-alt-mayra-run-01.ogg',
      '/sounds/footstep-forest-alt-mayra-01.ogg',
      '/sounds/footstep-forest-alt-mayra-02.ogg',
    ],
    road: [
      '/sounds/footstep-gravel-alt-mayra-01.ogg',
      '/sounds/footstep-gravel-alt-mayra-run-01.ogg',
    ],
    dirt: [
      '/sounds/footstep-forest-alt-mayra-01.ogg',
      '/sounds/footstep-forest-alt-mayra-02.ogg',
    ],
    sand: ['/sounds/footstep-sand-alt-mayra-01.ogg'],
    stone: [
      '/sounds/footstep-stone-alt-mayra-01.ogg',
      '/sounds/footstep-stone-alt-mayra-02.ogg',
    ],
  },
}

let activePack: FootstepPackId = 'anton'
let lastSurface: FootstepSurface | null = null

export function getFootstepPack(): FootstepPackId {
  return activePack
}

export function setFootstepPack(pack: FootstepPackId): void {
  activePack = pack
}

export function getLastFootstepSurface(): FootstepSurface | null {
  return lastSurface
}

/** `?footsteps=anton|legacy|mayra` — no-op when the param is missing/unknown. */
export function applyFootstepPackFromUrl(search = typeof window === 'undefined' ? '' : window.location.search): FootstepPackId {
  const raw = new URLSearchParams(search.startsWith('?') || search.length === 0 ? search : `?${search}`).get('footsteps')
  const id = raw?.trim().toLowerCase()
  if (id === 'anton' || id === 'legacy' || id === 'mayra') {
    activePack = id
  }
  return activePack
}

export function footstepUrlsFor(surface: FootstepSurface, pack: FootstepPackId = activePack): readonly string[] {
  return FOOTSTEP_PACK_URLS[pack][surface]
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

/** Sand/dirt stay a bit hotter after peak-norm — they have less low-end thump
 *  than stone, so equal peak still reads quieter in play. */
const SURFACE_VOLUME: Record<FootstepSurface, number> = {
  grass: 1,
  road: 1,
  dirt: 1.15,
  sand: 1.25,
  stone: 0.9,
}

function randomFootstepUrl(): string {
  return FOOTSTEP_SOUND_URLS[Math.floor(Math.random() * FOOTSTEP_SOUND_URLS.length)]!
}

function randomSurfaceFootstepUrl(surface: FootstepSurface): string {
  const urls = footstepUrlsFor(surface)
  return urls[Math.floor(Math.random() * urls.length)]!
}

export function playFootstep(playAt: PlayAt, position: WorldSoundPosition, sprinting: boolean, surface: FootstepSurface): void {
  lastSurface = surface
  const base = sprinting ? FOOTSTEP_SPRINT_VOLUME : FOOTSTEP_VOLUME
  playAt(randomSurfaceFootstepUrl(surface), position, base * SURFACE_VOLUME[surface])
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
