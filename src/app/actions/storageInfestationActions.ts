import type { Inventory } from '../../items/Inventory'
import type { QuestManager } from '../../quests/QuestManager'
import type { Hud } from '../../ui/createHud'
import type { Toast } from '../../ui/createToast'
import type { WorldBundle } from '../worldBundle'
import { hasItemCapability } from '../../items/itemCatalog'
import { ITEM_DEFS } from '../../items/items'
import {
  applyRepresentedPhysicalEffortVigor,
  physicalEffortStaminaCostPerSec,
} from '../../player/PlayerNeeds'
import { RAT_NEST_DESTROY_DURATION_SEC } from '../../settlement/ratInfestation'
import {
  SETTLEMENT_STORAGE_REPAIR_BEAM_COST,
  SETTLEMENT_STORAGE_REPAIR_DURATION_SEC,
} from '../../settlement/storageRepair'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

type StorageInfestationActionDeps = {
  ctx: PlayerActionContext
  bundle: WorldBundle
  inventory: Inventory
  hud: Hud
  toast: Toast
  questManager: QuestManager
  onInventoryChanged: () => void
}

export function createStorageInfestationActions(deps: StorageInfestationActionDeps) {
  const { ctx, bundle, inventory, hud, toast, questManager, onInventoryChanged } = deps

  const repairSettlementStorage = (settlementId: string): void => {
    if (isActionBlocked(ctx)) return
    if (!bundle.settlementsManager.isStorageDamaged(settlementId)) return
    if (!inventory.has('beam', SETTLEMENT_STORAGE_REPAIR_BEAM_COST)) {
      toast.show(
        `Potrzebujesz ${SETTLEMENT_STORAGE_REPAIR_BEAM_COST}× ${ITEM_DEFS.beam.label}.`,
        'error',
      )
      return
    }
    ctx.busy.start(SETTLEMENT_STORAGE_REPAIR_DURATION_SEC, 'Naprawa magazynu…', () => {
      if (!inventory.has('beam', SETTLEMENT_STORAGE_REPAIR_BEAM_COST)) return
      if (!inventory.remove('beam', SETTLEMENT_STORAGE_REPAIR_BEAM_COST)) return
      bundle.settlementsManager.repairStorageInfestation(settlementId)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      questManager.pollSettlementRatInfestationObjectives()
      toast.show('Magazyn został zabezpieczony.')
    }, {
      staminaCostPerSec: physicalEffortStaminaCostPerSec('moderate'),
      onCancel: () => {
        applyRepresentedPhysicalEffortVigor(ctx.player.needs.vigor, 'moderate', 0.25)
      },
    })
  }

  const destroyRatNest = (settlementId: string): void => {
    if (isActionBlocked(ctx)) return
    if (!bundle.settlementsManager.hasActiveNest(settlementId)) return
    if (!hasItemCapability(ctx.heldTool.held(), 'soil_digging')) {
      toast.show('Potrzebujesz narzędzia do kopania, żeby zniszczyć gniazdo.', 'error')
      return
    }
    ctx.busy.start(RAT_NEST_DESTROY_DURATION_SEC, 'Niszczenie gniazda szczurów…', () => {
      if (!bundle.settlementsManager.hasActiveNest(settlementId)) return
      if (!hasItemCapability(ctx.heldTool.held(), 'soil_digging')) return
      bundle.settlementsManager.destroyRatNest(settlementId)
      questManager.pollSettlementRatInfestationObjectives()
      toast.show('Gniazdo szczurów zostało zniszczone.')
    }, {
      staminaCostPerSec: physicalEffortStaminaCostPerSec('moderate'),
      onCancel: () => {
        applyRepresentedPhysicalEffortVigor(ctx.player.needs.vigor, 'moderate', 0.25)
      },
    })
  }

  return { repairSettlementStorage, destroyRatNest }
}
