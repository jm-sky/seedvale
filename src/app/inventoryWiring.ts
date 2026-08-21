import type { createWorldAudio } from '../audio/createWorldAudio'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { InventoryGroupView } from '../items/inventoryView'
import type { ItemKind } from '../items/items'
import type { TradeResult } from '../items/trade'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { VueUi } from '../ui-vue/mount'
import type { Hud } from '../ui/createHud'
import type { Toast } from '../ui/createToast'
import type { WorldBundle } from './worldBundle'
import { playInventoryDrop } from '../audio/inventorySounds'
import { askGuardForSword } from '../items/guardSword'
import { buildInventoryGroups, inventoryCountsForUi } from '../items/inventoryView'
import { isInstanceBackedKind } from '../items/itemInstances'
import { ITEM_DEFS } from '../items/items'
import { buyWithBarter, buyWithCoins, selectInstancesToSell, sellForCoins, sellInstancesForCoins } from '../items/trade'
import { resolveInstanceSellPrice, sellPrice } from '../items/tradeCatalog'
import { type SharpenResult, sharpenWeapon } from '../items/weaponMaintenance'

export type MerchantInventoryView = {
  counts: Partial<Record<ItemKind, number>>
  groups: InventoryGroupView[]
}

/** Player-inventory screen and home-trader wiring: the handlers behind
 *  "Wyrzuć"/"Załóż"/"Naostrz" and every buy/sell path of `MerchantScreen`,
 *  plus the guard's sword line in the NPC dialogue menu (which shares the same
 *  `Inventory`/relation state).
 *
 *  It is deliberately *not* a `PlayerActionContext` consumer: these are UI
 *  handlers over `Inventory` + `vueUi`, not world interactions, and they never
 *  open a busy channel. */
export type InventoryWiring = {
  /** Counts + grouped view the merchant screen renders the player bag from. */
  merchantInventoryView: () => MerchantInventoryView
  /** Re-pushes the player bag into an already-open merchant screen. */
  syncMerchantIfOpen: () => void
  sellInventoryInstances: (instanceIds: readonly string[]) => TradeResult
  sharpenInventoryWeapon: (instanceId: string) => SharpenResult
  /** Drops the whole carried stack of `kind` back into the world. */
  dropItemStack: (kind: ItemKind) => void
  equipTool: (kind: ItemKind) => void
  unequipTool: () => void
}

export type InventoryWiringDeps = {
  bundle: WorldBundle
  player: PlayerController
  inventory: Inventory
  heldTool: HeldTool
  playerTorch: PlayerTorch
  hud: Hud
  toast: Toast
  vueUi: VueUi
  questManager: QuestManager
  /** Persisted one-shot world flags (`SaveData.worldFlags`) — the guard's
   *  sword gift is the only consumer today. Mutated in place. */
  worldFlags: { guardSwordGifted: boolean }
  playOnce: ReturnType<typeof createWorldAudio>['playOnce']
  /** Adds an acquired item (creating an `ItemInstance` when the kind needs
   *  one) and re-syncs HUD/held tool — owned by `createApp.ts` because quest
   *  rewards use the same entry point. */
  grantItem: (kind: ItemKind, count: number) => void
  syncHeldHud: () => void
  syncQuickActionAvailability: () => void
  refreshInventoryScreen: () => void
}

export function createInventoryWiring(deps: InventoryWiringDeps): InventoryWiring {
  const {
    bundle, player, inventory, heldTool, playerTorch, hud, toast, vueUi,
    questManager, worldFlags, playOnce, grantItem,
  } = deps

  const merchantInventoryView = () => ({
    counts: inventoryCountsForUi(inventory),
    groups: buildInventoryGroups(inventory),
  })

  const syncMerchantIfOpen = (): void => {
    if (vueUi.isMerchantOpen()) {
      const view = merchantInventoryView()
      vueUi.refreshMerchant(view.counts, view.groups)
    }
  }

  const sellInventoryInstances = (instanceIds: readonly string[]) => {
    const result = sellInstancesForCoins(inventory, instanceIds)
    if (result.result === 'ok') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      heldTool.syncWithInventory()
      deps.syncHeldHud()
      deps.syncQuickActionAvailability()
      syncMerchantIfOpen()
      deps.refreshInventoryScreen()
      toast.show(`+${result.totalCoins} monet`, 'pickup')
      return 'ok' as const
    }
    return result.result
  }

  const sharpenInventoryWeapon = (instanceId: string): SharpenResult => {
    const result = sharpenWeapon(inventory, instanceId, 'whetstone')
    if (result === 'ok') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      deps.refreshInventoryScreen()
      toast.show('Naostrzono broń.', 'pickup')
    }
    return result
  }

  /** Drops the whole carried stack of `kind` back into the world at the
   *  player's feet, scattered slightly — the "Wyrzuć" action in
   *  `createInventoryScreen.ts`. Re-`refresh()`es the (already-open) screen
   *  immediately since world simulation is frozen while it's open (see the
   *  tick loop's modal-gating in `gameLoop.ts`) — nothing else will update it. */
  const dropItemStack = (kind: ItemKind): void => {
    if (isInstanceBackedKind(kind)) return
    const count = inventory.count(kind)
    if (count <= 0) return
    inventory.remove(kind, count)
    heldTool.syncWithInventory()
    if (playerTorch.isLit() && playerTorch.source() === 'wooden_torch' && heldTool.held() !== 'wooden_torch') {
      playerTorch.extinguish()
    }
    for (let i = 0; i < count; i++) {
      const angle = i * ((Math.PI * 2) / count)
      bundle.droppedItems.drop(
        kind,
        player.mesh.position.x + Math.cos(angle) * 0.6,
        player.mesh.position.z + Math.sin(angle) * 0.6,
      )
    }
    playInventoryDrop(playOnce)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    deps.syncHeldHud()
    deps.syncQuickActionAvailability()
    deps.refreshInventoryScreen()
  }

  const equipTool = (kind: ItemKind): void => {
    if (playerTorch.isLit()) playerTorch.extinguish()
    if (!heldTool.equip(kind)) return
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
  }

  const unequipTool = (): void => {
    if (playerTorch.isLit()) playerTorch.extinguish()
    heldTool.unequip()
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
  }

  /** Shared by every merchant buy/sell path: weight/held-tool/quick-action
   *  resync plus a full merchant re-render. */
  const afterTrade = (): void => {
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    heldTool.syncWithInventory()
    deps.syncHeldHud()
    deps.syncQuickActionAvailability()
    const view = merchantInventoryView()
    vueUi.refreshMerchant(view.counts, view.groups)
  }

  vueUi.configureMerchant({
    onBuyCoins: (kind, count = 1) => {
      const result = buyWithCoins(inventory, kind, count)
      if (result === 'ok') {
        afterTrade()
        toast.show(`+${count} ${ITEM_DEFS[kind].label}`, 'pickup')
      }
      return result
    },
    onBuyBarter: (kind, offer, count = 1) => {
      const result = buyWithBarter(inventory, kind, offer, count)
      if (result === 'ok') {
        afterTrade()
        toast.show(`+${count} ${ITEM_DEFS[kind].label}`, 'pickup')
      }
      return result
    },
    onSellCoins: (kind) => {
      const expectedCoins = isInstanceBackedKind(kind)
        ? (() => {
            const ids = selectInstancesToSell(inventory.getInstances(kind), 1)
            const inst = ids[0] ? inventory.getInstance(ids[0]) : null
            return inst ? resolveInstanceSellPrice(inst) : null
          })()
        : sellPrice(kind)
      const result = sellForCoins(inventory, kind)
      if (result === 'ok') {
        afterTrade()
        toast.show(`+${expectedCoins ?? sellPrice(kind)} monet`, 'pickup')
      }
      return result
    },
    onSellInstances: sellInventoryInstances,
  })

  vueUi.configureNpcDialogueMenu({
    onAskSword: () => {
      const result = askGuardForSword({
        alreadyGifted: worldFlags.guardSwordGifted,
        guardQuestComplete: questManager.getState('woda-dla-marka') === 'complete',
        relation: questManager.getRelation('Marek'),
        alreadyHasSword: inventory.holdsAny('long_sword'),
      })
      if (result.grant) {
        worldFlags.guardSwordGifted = true
        grantItem('long_sword', 1)
        toast.show('+1 Miecz', 'pickup')
      }
      return result.line
    },
    getCanAskSword: () => !worldFlags.guardSwordGifted,
    onOpenTrade: () => {
      const view = merchantInventoryView()
      vueUi.openMerchantFromDialogue(view.counts, view.groups)
    },
  })

  return {
    merchantInventoryView,
    syncMerchantIfOpen,
    sellInventoryInstances,
    sharpenInventoryWeapon,
    dropItemStack,
    equipTool,
    unequipTool,
  }
}
