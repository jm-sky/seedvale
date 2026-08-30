import { demandsFor, initialFoodFor, initialStockFor, type SettlementEconomySeed } from './initial'
import { createSettlementEconomy, type SettlementEconomy, type SettlementEconomySnapshot } from './settlementEconomy'

/**
 * Per-manager economy map. Lives on `SettlementsManager`, not a process
 * singleton — streaming a settlement out/in reuses the same object so stock
 * does not reset. A world rebuild constructs a new registry.
 */
export type EconomyRegistry = {
  getOrCreate: (seed: SettlementEconomySeed) => SettlementEconomy
  get: (id: string) => SettlementEconomy | undefined
  clear: () => void
  /** Stock + concrete-food snapshot of every economy created so far —
   *  reservations/developments are intentionally not included, same as
   *  `snapshot()`. */
  serialize: () => Record<string, SettlementEconomySnapshot>
}

export function createEconomyRegistry(
  initialStocks?: Record<string, SettlementEconomySnapshot>,
): EconomyRegistry {
  const byId = new Map<string, SettlementEconomy>()
  return {
    getOrCreate(seed) {
      const existing = byId.get(seed.id)
      if (existing) return existing
      const snapshot = initialStocks?.[seed.id]
      const created = createSettlementEconomy(
        seed.id,
        snapshot?.stock ?? initialStockFor(seed),
        demandsFor(seed),
        snapshot?.food ?? { counts: initialFoodFor(seed), instances: [] },
      )
      byId.set(seed.id, created)
      return created
    },
    get(id) {
      return byId.get(id)
    },
    clear() {
      byId.clear()
    },
    serialize() {
      const result: Record<string, SettlementEconomySnapshot> = {}
      for (const [id, economy] of byId) result[id] = economy.snapshot()
      return result
    },
  }
}
