/** UI click / panel-open one-shots. Sources: public/sounds/README.md. */

/** Kenney metalClick — short, quiet confirm (not the unused bird-flute open). */
export const UI_CLICK_SOUND_URL = '/sounds/ui-click-01.ogg'

const UI_CLICK_VOLUME = 0.24
const UI_OPEN_VOLUME = 0.22

type PlayOnce = (url: string, volume?: number) => void

export function playUiClick(playOnce: PlayOnce): void {
  playOnce(UI_CLICK_SOUND_URL, UI_CLICK_VOLUME)
}

export function playUiOpen(playOnce: PlayOnce): void {
  playOnce(UI_CLICK_SOUND_URL, UI_OPEN_VOLUME)
}
