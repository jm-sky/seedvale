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

/** Compatibility facade. The actual inventory UI is rendered by Vue. */
export function createInventoryScreen(
  _parent: HTMLElement,
  handlers: InventoryScreenHandlers = {},
): InventoryScreen {
  let disposed = false
  let counts: Partial<Record<ItemKind, number>> = {}
  let totalWeight = 0
  let maxWeight = 0

  const getUi = () => getMountedVueUi()
  const isOpen = () => !disposed && (getUi()?.isInventoryOpen() ?? false)

  const open = () => {
    if (disposed) return
    getUi()?.openInventory(counts, totalWeight, maxWeight, (kind) => handlers.onDrop?.(kind))
  }

  const close = () => {
    if (!isOpen()) return
    getUi()?.closeInventory()
    handlers.onClose?.()
  }

  return {
    isOpen,
    open,
    close,
    toggle() {
      if (isOpen()) close()
      else open()
    },
    refresh(nextCounts, nextTotalWeight, nextMaxWeight) {
      if (disposed) return
      counts = { ...nextCounts }
      totalWeight = nextTotalWeight
      maxWeight = nextMaxWeight
      if (isOpen()) {
        getUi()?.refreshInventory(counts, totalWeight, maxWeight)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      getUi()?.closeInventory()
    },
  }
}
