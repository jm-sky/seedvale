/** UI open / click one-shots (inventory, pause, dialog). Sources: public/sounds/README.md. */

export const UI_CLICK_SOUND_URLS = [
  '/sounds/ui-click-01.ogg',
  '/sounds/ui-click-02.ogg',
  '/sounds/ui-click-03.ogg',
] as const

export const UI_OPEN_SOUND_URL = '/sounds/ui-open-01.ogg'

const UI_CLICK_VOLUME = 0.28
const UI_OPEN_VOLUME = 0.32

type PlayOnce = (url: string, volume?: number) => void

export function playUiClick(playOnce: PlayOnce): void {
  const url = UI_CLICK_SOUND_URLS[Math.floor(Math.random() * UI_CLICK_SOUND_URLS.length)]
  if (url) playOnce(url, UI_CLICK_VOLUME)
}

export function playUiOpen(playOnce: PlayOnce): void {
  playOnce(UI_OPEN_SOUND_URL, UI_OPEN_VOLUME)
}
