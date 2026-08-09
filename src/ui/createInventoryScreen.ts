import type { ItemKind } from '../items/items'
import { getMountedVueUi } from '../ui-vue/mount'

export type InventoryScreenHandlers = {
  onDrop?: (kind: ItemKind) => void
  onClose?: () => void
}

export type InventoryScreen = {
  isOpen: () => boolean
  open: () => void
  close: () => void
  toggle: () => void
  refresh: (counts: Partial<Record<ItemKind, number>>, totalWeight: number, maxWeight: number) => void
  dispose: () => void
}

/**
 * Compatibility facade for the old createApp API.
 *
 * The actual inventory UI is now rendered by Vue (`ui-vue/InventoryScreen.vue`).
 * Keeping this small facade lets the game/application layer migrate without
 * mixing DOM manipulation back into createApp.ts. It can be removed once all
 * callers use VueUi directly.
 */
export function createInventoryScreen(
  _parent: HTMLElement,
  handlers: InventoryScreenHandlers = {},
): InventoryScreen {
  let disposed = false
  let openState = false

  const getUi = () => getMountedVueUi()

  const close = () => {
    if (!openState) return
    openState = false
    getUi()?.closeInventory()
    handlers.onClose?.()
  }

  return {
    isOpen: () => openState && !disposed,
    open() {
      if (disposed) return
      openState = true
    },
    close,
    toggle() {
      if (disposed) return
      if (openState) {
        close()
        return
      }
      openState = true
    },
    refresh(counts, totalWeight, maxWeight) {
      if (disposed) return
      const ui = getUi()
      if (!ui) return
      if (openState) {
        ui.openInventory(counts, totalWeight, maxWeight, (kind) => handlers.onDrop?.(kind))
      } else {
        ui.refreshInventory(counts, totalWeight, maxWeight)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      openState = false
      getUi()?.closeInventory()
    },
  }
}
