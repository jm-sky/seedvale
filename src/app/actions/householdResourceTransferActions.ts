import type { SettlementEconomy } from '../../economy/settlementEconomy'
import type { Household } from '../../settlement/household'
import {
  householdTransferSummary,
  householdWoodValue,
  transferableHouseholdItemKinds,
  transferResourceToHousehold,
} from '../../settlement/householdResourceTransfer'
import { exitGamePointerLock } from '../../input/MouseLook'
import { buildInventoryGroups, inventoryCountsForUi } from '../../items/inventoryView'
import { hasItemKindCategory, ITEM_DEFS, type ItemKind } from '../../items/items'
import type { VueUi } from '../../ui-vue/mount'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

export type HouseholdResourceTransferActions = {
  openHouseholdResourceTransfer: (household: Household) => void
}

export type HouseholdResourceTransferDeps = {
  vueUi: VueUi
  rendererElement: HTMLElement
}

function transferRequestResource(kind: ItemKind): 'food' | 'wood' | null {
  if (householdWoodValue(kind) != null) return 'wood'
  if (hasItemKindCategory(kind, 'food')) return 'food'
  return null
}

export function createHouseholdResourceTransferActions(
  ctx: PlayerActionContext,
  deps: HouseholdResourceTransferDeps,
): HouseholdResourceTransferActions {
  const { bundle, inventory, hud, toast, dayNight, onInventoryChanged } = ctx
  const { vueUi, rendererElement } = deps

  let activeHousehold: Household | null = null

  const resolveEconomy = (household: Household): SettlementEconomy | undefined =>
    bundle.settlementsManager.getEconomy(household.settlementId)

  const refreshScreen = (): void => {
    if (!activeHousehold) return
    const kinds = transferableHouseholdItemKinds(inventory)
    const groups = buildInventoryGroups(inventory, dayNight.elapsedDays).filter((g) => kinds.includes(g.kind))
    vueUi.refreshHouseholdTransferScreen(
      householdTransferSummary(activeHousehold),
      inventoryCountsForUi(inventory),
      groups,
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  const deposit = (kind: ItemKind, amount: number): void => {
    const household = activeHousehold
    if (!household) return
    const economy = resolveEconomy(household)
    if (!economy) {
      toast.show('Nie można przekazać zasobów — brak magazynu osady.', 'error')
      return
    }
    const resource = transferRequestResource(kind)
    if (!resource) {
      toast.show('Tego przedmiotu nie można tu przekazać.', 'error')
      return
    }
    const result = transferResourceToHousehold({
      source: inventory,
      household,
      economy,
      request: { resource, itemKind: kind, amount },
      nowDays: dayNight.elapsedDays,
    })
    if (result.status === 'transferred') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      refreshScreen()
      const overflowNote = result.overflowedToSettlement > 0
        ? ` Nadmiar (${result.overflowedToSettlement}) trafił do magazynu osady.`
        : ''
      toast.show(`Przekazano ${ITEM_DEFS[kind].label} ×${result.sourceAmount}.${overflowNote}`, 'pickup')
      return
    }
    if (result.status === 'source_shortage') toast.show('Nie masz tylu przedmiotów.', 'error')
    else if (result.status === 'invalid_resource_item') toast.show('Tego przedmiotu nie można tu przekazać.', 'error')
    else toast.show('Nieprawidłowa ilość.', 'error')
  }

  vueUi.configureHouseholdTransferScreen({ onDeposit: deposit })

  return {
    openHouseholdResourceTransfer: (household: Household) => {
      if (isActionBlocked(ctx)) return
      if (!resolveEconomy(household)) {
        toast.show('Nie można przekazać zasobów — brak magazynu osady.', 'error')
        return
      }
      exitGamePointerLock(rendererElement)
      activeHousehold = household
      const kinds = transferableHouseholdItemKinds(inventory)
      const groups = buildInventoryGroups(inventory, dayNight.elapsedDays).filter((g) => kinds.includes(g.kind))
      vueUi.openHouseholdTransferScreen(
        'Magazyn domowy',
        householdTransferSummary(household),
        inventoryCountsForUi(inventory),
        groups,
        inventory.totalWeight(),
        inventory.maxWeight,
      )
    },
  }
}
