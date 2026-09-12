import type { VueUi } from '../../ui-vue/mount'
import { exitGamePointerLock } from '../../input/MouseLook'
import { buildInventoryGroups, inventoryCountsForUi } from '../../items/inventoryView'
import { ITEM_DEFS, type ItemKind } from '../../items/items'
import { closeNpcDialogueMenu } from '../../ui-vue/store'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import { giveItemCountToNpc, giveItemInstanceToNpc } from './npcItemTransfer'

export type NpcItemTransferActions = {
  openNpcGiveItem: (npcId: string, displayName: string) => void
}

export type NpcItemTransferDeps = {
  vueUi: VueUi
  rendererElement: HTMLElement
}

/**
 * One-way Player → NPC give-item sheet (plan items-player-027). Mutation
 * stays in `npcItemTransfer`; this module only opens/refreshes UI and
 * routes confirmations through the app-layer transfer.
 *
 * @domain items-player
 */
export function createNpcItemTransferActions(
  ctx: PlayerActionContext,
  deps: NpcItemTransferDeps,
): NpcItemTransferActions {
  const { bundle, inventory, hud, toast, dayNight, onInventoryChanged } = ctx
  const { vueUi, rendererElement } = deps

  let activeNpcId: string | null = null

  const transferDeps = () => ({
    playerInventory: inventory,
    getNpcState: (id: string) => bundle.settlementsManager.getNpcState(id),
  })

  const refreshScreen = (): void => {
    if (!activeNpcId) return
    vueUi.refreshNpcGiveItemScreen(
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory, dayNight.elapsedDays),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  const feedback = (status: string): void => {
    if (status === 'ok') return
    if (status === 'destination_full') toast.show('NPC nie uniesie już więcej.', 'error')
    else if (status === 'source_missing') toast.show('Nie masz już tego przedmiotu.', 'error')
    else if (status === 'recipient_dead') toast.show('Nie możesz przekazać przedmiotu — NPC nie żyje.', 'error')
    else toast.show('Nie można teraz przekazać przedmiotu.', 'error')
  }

  const giveCount = (kind: ItemKind, amount: number): void => {
    if (!activeNpcId) return
    const result = giveItemCountToNpc(transferDeps(), {
      npcId: activeNpcId,
      kind,
      amount,
      nowDays: dayNight.elapsedDays,
    })
    if (result.status === 'ok') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      refreshScreen()
      toast.show(`Przekazano ${ITEM_DEFS[kind].label} ×${Math.floor(amount)}.`, 'pickup')
      return
    }
    feedback(result.status)
  }

  const giveInstance = (instanceId: string): void => {
    if (!activeNpcId) return
    const instance = inventory.getInstance(instanceId)
    const result = giveItemInstanceToNpc(transferDeps(), {
      npcId: activeNpcId,
      instanceId,
    })
    if (result.status === 'ok') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      refreshScreen()
      const label = instance ? ITEM_DEFS[instance.kind].label : 'przedmiot'
      toast.show(`Przekazano ${label}.`, 'pickup')
      return
    }
    feedback(result.status)
  }

  vueUi.configureNpcGiveItemScreen({
    onGive: giveCount,
    onGiveInstance: giveInstance,
  })

  return {
    openNpcGiveItem: (npcId, displayName) => {
      if (isActionBlocked(ctx)) return
      const state = bundle.settlementsManager.getNpcState(npcId)
      if (!state || state.health.dead) {
        toast.show('Nie można przekazać przedmiotu.', 'error')
        return
      }
      exitGamePointerLock(rendererElement)
      closeNpcDialogueMenu({ decline: false })
      activeNpcId = npcId
      vueUi.openNpcGiveItemScreen(
        displayName,
        inventoryCountsForUi(inventory),
        buildInventoryGroups(inventory, dayNight.elapsedDays),
        inventory.totalWeight(),
        inventory.maxWeight,
      )
    },
  }
}
