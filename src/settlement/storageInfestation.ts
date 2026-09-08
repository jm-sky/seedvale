/**
 * @domain settlements
 * @system storage-infestation
 * @role Authoritative settlement-owned storage infestation condition (plan
 *  quests-progression-006) — keyed by stable `settlementId`, survives
 *  settlement stream-out/in, `WorldBundle` rebuild and save/load. Not owned by
 *  `QuestManager` or Three.js props.
 */

export type StorageInfestationCondition = 'active' | 'repaired'

export type StorageInfestationRegistry = {
  isActive: (settlementId: string) => boolean
  activate: (settlementId: string) => void
  repair: (settlementId: string) => void
  serialize: () => Record<string, StorageInfestationCondition>
  clear: () => void
}

/** Per-`SettlementsManager` infestation store — same manager-lifetime registry
 *  shape as `LivestockRegistry`/`HouseholdRegistry`. */
export function createStorageInfestationRegistry(
  initial?: Record<string, StorageInfestationCondition>,
): StorageInfestationRegistry {
  const bySettlement = new Map<string, StorageInfestationCondition>(
    Object.entries(initial ?? {}),
  )

  return {
    isActive: (settlementId) => bySettlement.get(settlementId) === 'active',
    activate(settlementId) {
      bySettlement.set(settlementId, 'active')
    },
    repair(settlementId) {
      bySettlement.set(settlementId, 'repaired')
    },
    serialize: () => Object.fromEntries(bySettlement),
    clear: () => bySettlement.clear(),
  }
}
