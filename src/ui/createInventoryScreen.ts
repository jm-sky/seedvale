import type { InventoryGroupView } from '../items/inventoryView'
import type { ItemKind } from '../items/items'
import type { TradeResult } from '../items/trade'
import type { TrapKind } from '../world/animalTraps'
import { getMountedVueUi } from '../ui-vue/mount'

export type InventoryScreenHandlers = {
  onDrop?: (kind: ItemKind) => void
  onEquip?: (kind: ItemKind) => void
  onUnequip?: () => void
  /** "Zjedz"/"Wypij" (plan 106) — only offered for consumable items. */
  onConsume?: (kind: ItemKind) => void
  onPlaceTrap?: (kind: TrapKind) => void
  onSellInstances?: (instanceIds: readonly string[]) => TradeResult
  onClose?: () => void
}

export type InventoryScreen = {
  isOpen: () => boolean
  open: () => void
  close: () => void
  toggle: () => void
  refresh: (
    counts: Partial<Record<ItemKind, number>>,
    totalWeight: number,
    maxWeight: number,
    heldTool: ItemKind | null,
    groups: readonly InventoryGroupView[],
  ) => void
  dispose: () => void
}

/** Compatibility facade. The actual inventory UI is rendered by Vue. */
export function createInventoryScreen(
  _parent: HTMLElement,
  handlers: InventoryScreenHandlers = {},
): InventoryScreen {
  let disposed = false
  let counts: Partial<Record<ItemKind, number>> = {}
  let groups: readonly InventoryGroupView[] = []
  let totalWeight = 0
  let maxWeight = 0
  let heldTool: ItemKind | null = null

  const getUi = () => getMountedVueUi()
  const isOpen = () => !disposed && (getUi()?.isInventoryOpen() ?? false)

  const open = () => {
    if (disposed) return
    getUi()?.openInventory(
      counts,
      totalWeight,
      maxWeight,
      heldTool,
      groups,
      (kind) => handlers.onDrop?.(kind),
      (kind) => handlers.onEquip?.(kind),
      () => handlers.onUnequip?.(),
      (kind) => handlers.onConsume?.(kind),
      (kind) => handlers.onPlaceTrap?.(kind),
      (ids) => handlers.onSellInstances?.(ids) ?? 'invalid_offer',
    )
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
    refresh(nextCounts, nextTotalWeight, nextMaxWeight, nextHeldTool, nextGroups) {
      if (disposed) return
      counts = { ...nextCounts }
      groups = nextGroups
      totalWeight = nextTotalWeight
      maxWeight = nextMaxWeight
      heldTool = nextHeldTool
      if (isOpen()) {
        getUi()?.refreshInventory(counts, totalWeight, maxWeight, heldTool, groups)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      getUi()?.closeInventory()
    },
  }
}
