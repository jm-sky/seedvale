/** Action one-shots (shovel dig, etc.). Sources/licenses: public/sounds/README.md. */

export const ACTION_DIG_SOUND_URLS = [
  '/sounds/action-dig-01.wav',
  '/sounds/action-dig-02.wav',
  '/sounds/action-dig-03.wav',
  '/sounds/action-dig-04.wav',
] as const

const ACTION_DIG_SFX_VOLUME = 0.45

type PlayOnce = (url: string, volume?: number) => void

/** Random ~2 s shovel-dig clip — matches `DIG_DURATION_SEC`; play when digging starts. */
export function playActionDig(playOnce: PlayOnce): void {
  const url = ACTION_DIG_SOUND_URLS[Math.floor(Math.random() * ACTION_DIG_SOUND_URLS.length)]
  if (url) playOnce(url, ACTION_DIG_SFX_VOLUME)
}
