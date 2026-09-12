import type { QuestManager } from '../quests/QuestManager'
import type { SettlementLightLookup } from '../quests/settlementLightLookup'
import type { Settlement } from '../settlement/createSettlement'

/** Read-only settlement torch/campfire state for quest objectives. */
export function createSettlementLightLookup(
  getLoadedSettlements: () => readonly Settlement[],
): SettlementLightLookup {
  return {
    getSnapshot(settlementId, torchIds, requireCampfire) {
      const settlement = getLoadedSettlements().find((entry) => entry.id === settlementId)
      if (!settlement) {
        return { torchLit: {}, campfireLit: false, status: 'pending' }
      }
      const torchLit: Record<string, boolean> = {}
      let missingTorch = false
      for (const id of torchIds) {
        const entry = settlement.villageTorches.find((torch) => torch.id === id)
        if (!entry) {
          missingTorch = true
          torchLit[id] = false
        } else {
          torchLit[id] = entry.torch.isLit()
        }
      }
      if (missingTorch) {
        return {
          torchLit,
          campfireLit: settlement.fire?.isLit() ?? false,
          status: 'unavailable',
        }
      }
      if (requireCampfire && !settlement.fire) {
        return { torchLit, campfireLit: false, status: 'unavailable' }
      }
      return {
        torchLit,
        campfireLit: settlement.fire?.isLit() ?? false,
        status: 'pending',
      }
    },
  }
}

/** Applies dusk auto-light suppression from the active evening-duty quest. */
export function syncGuardEveningNightPolicies(
  questManager: QuestManager,
  getLoadedSettlements: () => readonly Settlement[],
): void {
  const duty = questManager.activeSettlementLightDuty()
  for (const settlement of getLoadedSettlements()) {
    if (!duty || duty.settlementId !== settlement.id) {
      settlement.setNightAutoLightPolicy({})
      continue
    }
    const blocked = new Set(duty.torchIds)
    settlement.setNightAutoLightPolicy({
      shouldAutoLightTorch: (torchId) => !blocked.has(torchId),
      shouldAutoLightFire: () => !duty.requireCampfire,
    })
  }
}
