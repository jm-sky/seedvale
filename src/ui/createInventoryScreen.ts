import type { InventoryGroupView } from '../items/inventoryView'
import type { PrimaryWeaponChoice } from '../items/primaryWeapons'
import type { ItemKind } from '../items/items'
import type { TradeResult } from '../items/trade'
import type { SharpenResult } from '../items/weaponMaintenance'
import type { TrapKind } from '../world/animalTraps'
import { getMountedVueUi } from '../ui-vue/mount'

export type InventoryScreenHandlers = {
  onDrop?: (kind: ItemKind) => void
  onEquip?: (kind: ItemKind) => void
  onUnequip?: () => void
  /** "Zjedz"/"Wypij" (plan 106) — only offered for consumable items. */
  onConsume?: (kind: ItemKind) => void
  /** "Czytaj" (plan items-player-016) — only offered for `ITEM_CATALOG[kind].book` items. */
  onRead?: (kind: ItemKind) => void
  onPlaceTrap?: (kind: TrapKind) => void
  onSellInstances?: (instanceIds: readonly string[]) => TradeResult
  /** Sharpen one weapon instance with a `whetstone` from inventory (plan 161). */
  onSharpen?: (instanceId: string) => SharpenResult
  /** "Postaw" (plan 164) — places a purchased `chest` in the world. */
  onPlaceContainer?: () => void
  onSetPrimaryMelee?: (kind: ItemKind, instanceId: string | null) => void
  onSetPrimaryRanged?: (kind: ItemKind, instanceId: string | null) => void
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
    totalSize: number,
    maxSize: number,
    heldTool: ItemKind | null,
    groups: readonly InventoryGroupView[],
    primaryMelee: PrimaryWeaponChoice | null,
    primaryRanged: PrimaryWeaponChoice | null,
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
  let totalSize = 0
  let maxSize = 0
  let heldTool: ItemKind | null = null
  let primaryMelee: PrimaryWeaponChoice | null = null
  let primaryRanged: PrimaryWeaponChoice | null = null

  const getUi = () => getMountedVueUi()
  const isOpen = () => !disposed && (getUi()?.isInventoryOpen() ?? false)

  const open = () => {
    if (disposed) return
    getUi()?.openInventory(
      counts,
      totalWeight,
      maxWeight,
      totalSize,
      maxSize,
      heldTool,
      groups,
      primaryMelee,
      primaryRanged,
      (kind) => handlers.onDrop?.(kind),
      (kind) => handlers.onEquip?.(kind),
      () => handlers.onUnequip?.(),
      (kind) => handlers.onConsume?.(kind),
      (kind) => handlers.onRead?.(kind),
      (kind) => handlers.onPlaceTrap?.(kind),
      (ids) => handlers.onSellInstances?.(ids) ?? 'invalid_offer',
      (id) => handlers.onSharpen?.(id) ?? 'invalid',
      () => handlers.onPlaceContainer?.(),
      (kind, instanceId) => handlers.onSetPrimaryMelee?.(kind, instanceId),
      (kind, instanceId) => handlers.onSetPrimaryRanged?.(kind, instanceId),
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
    refresh(nextCounts, nextTotalWeight, nextMaxWeight, nextTotalSize, nextMaxSize, nextHeldTool, nextGroups, nextPrimaryMelee, nextPrimaryRanged) {
      if (disposed) return
      counts = { ...nextCounts }
      groups = nextGroups
      totalWeight = nextTotalWeight
      maxWeight = nextMaxWeight
      totalSize = nextTotalSize
      maxSize = nextMaxSize
      heldTool = nextHeldTool
      primaryMelee = nextPrimaryMelee
      primaryRanged = nextPrimaryRanged
      if (isOpen()) {
        getUi()?.refreshInventory(counts, totalWeight, maxWeight, totalSize, maxSize, heldTool, groups, primaryMelee, primaryRanged)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      getUi()?.closeInventory()
    },
  }
}
