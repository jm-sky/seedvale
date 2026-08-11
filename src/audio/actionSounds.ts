/** Action one-shots (shovel dig, axe chop, etc.). Sources/licenses: public/sounds/README.md. */

export const ACTION_DIG_SOUND_URLS = [
  '/sounds/action-dig-01.wav',
  '/sounds/action-dig-02.wav',
  '/sounds/action-dig-03.wav',
  '/sounds/action-dig-04.wav',
] as const

export const ACTION_CHOP_SOUND_URL = '/sounds/action-wood-chop-01.wav'

const ACTION_DIG_SFX_VOLUME = 0.45
const ACTION_CHOP_SFX_VOLUME = 0.5

type PlayOnce = (url: string, volume?: number) => void

/** Random ~2 s shovel-dig clip — matches `DIG_DURATION_SEC`; play when digging starts. */
export function playActionDig(playOnce: PlayOnce): void {
  const url = ACTION_DIG_SOUND_URLS[Math.floor(Math.random() * ACTION_DIG_SOUND_URLS.length)]
  if (url) playOnce(url, ACTION_DIG_SFX_VOLUME)
}

/** Axe wood-chop one-shot — play when the chop channel starts (plan 057). */
export function playActionChop(playOnce: PlayOnce): void {
  playOnce(ACTION_CHOP_SOUND_URL, ACTION_CHOP_SFX_VOLUME)
}
