/**
 * Read-only settlement lighting snapshot for quest objectives (plan
 * quests-progression-021). Quest code never imports `Settlement` or
 * `VillageTorch` directly.
 *
 * @domain quests-progression
 */
export type SettlementLightStatus = 'satisfied' | 'pending' | 'unavailable'

export type SettlementLightSnapshot = {
  torchLit: Readonly<Record<string, boolean>>
  campfireLit: boolean
  status: SettlementLightStatus
}

export type SettlementLightLookup = {
  getSnapshot: (settlementId: string, torchIds: readonly string[], requireCampfire: boolean) => SettlementLightSnapshot
}

export function evaluateSettlementLightsObjective(
  snapshot: SettlementLightSnapshot,
  torchIds: readonly string[],
  requireCampfire: boolean,
): boolean {
  if (snapshot.status === 'unavailable') return false
  if (requireCampfire && !snapshot.campfireLit) return false
  return torchIds.every((id) => snapshot.torchLit[id] === true)
}
