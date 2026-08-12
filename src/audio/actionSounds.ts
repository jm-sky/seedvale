/** Action one-shots (shovel dig, axe chop, melee, well, etc.). Sources/licenses: public/sounds/README.md. */

import type { PlayAt, WorldSoundPosition } from './createWorldAudio'

export const ACTION_DIG_SOUND_URLS = [
  '/sounds/action-dig-01.ogg',
  '/sounds/action-dig-02.ogg',
  '/sounds/action-dig-03.ogg',
  '/sounds/action-dig-04.ogg',
] as const

export const ACTION_CHOP_SOUND_URL = '/sounds/action-wood-chop-01.ogg'
export const ACTION_MELEE_HIT_SOUND_URL = '/sounds/action-melee-hit-01.ogg'
export const ACTION_MELEE_KILL_SOUND_URL = '/sounds/action-melee-kill-01.ogg'
export const ACTION_WELL_SOUND_URL = '/sounds/action-well-01.ogg'

const ACTION_DIG_SFX_VOLUME = 0.45
const ACTION_CHOP_SFX_VOLUME = 0.5
const ACTION_MELEE_HIT_SFX_VOLUME = 0.5
const ACTION_MELEE_KILL_SFX_VOLUME = 0.55
/** Quiet — the clip is a deep well echo and reads as “inside” if loud. */
const ACTION_WELL_SFX_VOLUME = 0.18

type PlayOnce = (url: string, volume?: number) => void

/** Random ~2 s shovel-dig clip — matches `DIG_DURATION_SEC`; play when digging starts. */
export function playActionDig(playOnce: PlayOnce): void {
  const url = ACTION_DIG_SOUND_URLS[Math.floor(Math.random() * ACTION_DIG_SOUND_URLS.length)]
  if (url) playOnce(url, ACTION_DIG_SFX_VOLUME)
}

/** Axe wood-chop one-shot at the tree — play when the chop channel starts (plan 057). */
export function playActionChop(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(ACTION_CHOP_SOUND_URL, position, ACTION_CHOP_SFX_VOLUME)
}

/** Short melee impact — player tool hit on an animal that stays up. */
export function playActionMeleeHit(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(ACTION_MELEE_HIT_SOUND_URL, position, ACTION_MELEE_HIT_SFX_VOLUME)
}

/** Melee finishing blow (impact + body fall) — when the hit kills the animal. */
export function playActionMeleeKill(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(ACTION_MELEE_KILL_SOUND_URL, position, ACTION_MELEE_KILL_SFX_VOLUME)
}

/** Well / draw-water one-shot — player interact or NPC drink at the well. */
export function playActionWell(playAt: PlayAt, position: WorldSoundPosition): void {
  playAt(ACTION_WELL_SOUND_URL, position, ACTION_WELL_SFX_VOLUME)
}
