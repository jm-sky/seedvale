/** Inventory pick-up / drop one-shots. Sources/licenses: public/sounds/README.md. */

export const INVENTORY_PICK_UP_SOUND_URLS = [
  '/sounds/inventory-pick-up-01.ogg',
  '/sounds/inventory-pick-up-02.ogg',
  '/sounds/inventory-pick-up-03.ogg',
  '/sounds/inventory-pick-up-04.ogg',
] as const

export const INVENTORY_DROP_SOUND_URL = '/sounds/inventory-drop-01.ogg'

const INVENTORY_SFX_VOLUME = 0.4

type PlayOnce = (url: string, volume?: number) => void

/** Random short pick-up click — ground collect, tree branch, dig stone. */
export function playInventoryPickUp(playOnce: PlayOnce): void {
  const url = INVENTORY_PICK_UP_SOUND_URLS[Math.floor(Math.random() * INVENTORY_PICK_UP_SOUND_URLS.length)]
  if (url) playOnce(url, INVENTORY_SFX_VOLUME)
}

/** Single drop clip — UI „Wyrzuć” or quick-drop, once per action. */
export function playInventoryDrop(playOnce: PlayOnce): void {
  playOnce(INVENTORY_DROP_SOUND_URL, INVENTORY_SFX_VOLUME)
}
