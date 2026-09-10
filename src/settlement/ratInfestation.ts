/**
 * @domain settlements
 * @system rat-infestation
 * @role Authoritative settlement-owned rat infestation state (plan
 *  quests-progression-013) — keyed by stable `settlementId`, survives
 *  settlement stream-out/in, `WorldBundle` rebuild and save/load. Owns
 *  independent storage-damage and nest-destroyed facts. Not owned by
 *  `QuestManager` or Three.js props.
 */

export type RatInfestationState = {
  storageDamaged: boolean
  nestDestroyed: boolean
}

/** Default for a settlement with no infestation record — no storage damage
 *  and no nest to interact with. */
export const NO_RAT_INFESTATION: RatInfestationState = {
  storageDamaged: false,
  nestDestroyed: true,
}

/** Authored V1 home-infestation seed (plan quests-progression-013) —
 *  damaged storage and an intact nest. */
export const SEEDED_RAT_INFESTATION: RatInfestationState = {
  storageDamaged: true,
  nestDestroyed: false,
}

/** Wall-clock busy duration for destroying the infestation nest. */
export const RAT_NEST_DESTROY_DURATION_SEC = 3

export type RatInfestationRegistry = {
  get: (settlementId: string) => RatInfestationState
  isStorageDamaged: (settlementId: string) => boolean
  isNestDestroyed: (settlementId: string) => boolean
  hasActiveNest: (settlementId: string) => boolean
  seed: (settlementId: string) => void
  repairStorage: (settlementId: string) => void
  destroyNest: (settlementId: string) => void
  serialize: () => Record<string, RatInfestationState>
  clear: () => void
}

/** Per-`SettlementsManager` infestation store — same manager-lifetime registry
 *  shape as `LivestockRegistry`/`HouseholdRegistry`. */
export function createRatInfestationRegistry(
  initial?: Record<string, RatInfestationState>,
): RatInfestationRegistry {
  const bySettlement = new Map<string, RatInfestationState>(
    Object.entries(initial ?? {}),
  )

  function recorded(settlementId: string): RatInfestationState | undefined {
    return bySettlement.get(settlementId)
  }

  return {
    get: (settlementId) => recorded(settlementId) ?? NO_RAT_INFESTATION,
    isStorageDamaged: (settlementId) => recorded(settlementId)?.storageDamaged === true,
    isNestDestroyed: (settlementId) => recorded(settlementId)?.nestDestroyed !== false,
    hasActiveNest: (settlementId) => recorded(settlementId)?.nestDestroyed === false,
    seed(settlementId) {
      bySettlement.set(settlementId, { ...SEEDED_RAT_INFESTATION })
    },
    repairStorage(settlementId) {
      const current = recorded(settlementId)
      if (!current) return
      bySettlement.set(settlementId, { ...current, storageDamaged: false })
    },
    destroyNest(settlementId) {
      const current = recorded(settlementId)
      if (!current) return
      bySettlement.set(settlementId, { ...current, nestDestroyed: true })
    },
    serialize: () => Object.fromEntries(bySettlement),
    clear: () => bySettlement.clear(),
  }
}
