import { demandsFor, initialStockFor, type SettlementEconomySeed } from './initial'
import { createSettlementEconomy, type SettlementEconomy } from './settlementEconomy'

/**
 * Per-manager economy map. Lives on `SettlementsManager`, not a process
 * singleton — streaming a settlement out/in reuses the same object so stock
 * does not reset. A world rebuild constructs a new registry.
 */
export type EconomyRegistry = {
  getOrCreate: (seed: SettlementEconomySeed) => SettlementEconomy
  get: (id: string) => SettlementEconomy | undefined
  clear: () => void
}

export function createEconomyRegistry(): EconomyRegistry {
  const byId = new Map<string, SettlementEconomy>()
  return {
    getOrCreate(seed) {
      const existing = byId.get(seed.id)
      if (existing) return existing
      const created = createSettlementEconomy(
        seed.id,
        initialStockFor(seed),
        demandsFor(seed),
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
  }
}
