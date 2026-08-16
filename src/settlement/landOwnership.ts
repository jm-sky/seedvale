/**
 * Persistent player land ownership (plan 129) — deliberately tiny: the only
 * possible owner in v1 is the player, so this is a sparse set of
 * `settlementId:plotId` composite keys, not a `Record<key, owner>` map. Kept
 * separate from `VillagePlan` (deterministic, regenerated on every load) and
 * separate from `Inventory`/`SettlementEconomy` — ownership isn't a stock or
 * a countable resource.
 */
export type LandOwnershipRegistry = {
  isOwned: (settlementId: string, plotId: string) => boolean
  setOwned: (settlementId: string, plotId: string) => void
  /** Sparse composite-key list for `SaveData.ownedLandPlots`. */
  toJSON: () => string[]
  /** Drops every owned plot — used only for a genuinely new world (new seed). */
  clear: () => void
}

export function landPlotKey(settlementId: string, plotId: string): string {
  return `${settlementId}:${plotId}`
}

export function createLandOwnershipRegistry(initial?: readonly string[]): LandOwnershipRegistry {
  const owned = new Set<string>(initial ?? [])
  return {
    isOwned(settlementId, plotId) {
      return owned.has(landPlotKey(settlementId, plotId))
    },
    setOwned(settlementId, plotId) {
      owned.add(landPlotKey(settlementId, plotId))
    },
    toJSON() {
      return [...owned]
    },
    clear() {
      owned.clear()
    },
  }
}
