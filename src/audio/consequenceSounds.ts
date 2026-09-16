/** Temporary negative-consequence one-shot (plan items-player-042).
 *  `ui-click-03.ogg` is a placeholder until a dedicated low tudum lands. */

export const NEGATIVE_CONSEQUENCE_SOUND_URL = '/sounds/ui-click-03.ogg'

const NEGATIVE_CONSEQUENCE_VOLUME = 0.32

type PlayOnce = (url: string, volume?: number) => void

/**
 * @domain items-player
 * @role Plays the shared negative-consequence feedback one-shot. Call only
 *  after a social/trade penalty actually commits.
 */
export function playNegativeConsequence(playOnce: PlayOnce): void {
  playOnce(NEGATIVE_CONSEQUENCE_SOUND_URL, NEGATIVE_CONSEQUENCE_VOLUME)
}
