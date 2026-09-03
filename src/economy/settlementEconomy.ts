import type { SettlementHistoryEvent } from '../debug/settlementHistory'
import type { SaveItemInstance } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { DevelopmentDef, DevelopmentStatus } from './development'
import type { EconomicKind } from './kinds'
import type { ProductionDef } from './production'
import { createSequenceAllocator } from '../debug/domainHistory'
import { createSettlementHistoryBuffer } from '../debug/settlementHistory'
import { claimFoodItems, type FoodItemClaim, foodItemCount } from '../items/foodItems'
import { type FoodBatch, Inventory } from '../items/Inventory'
import { EconomicStock, type StockAmount } from './stock'

export type SettlementDemand = {
  kind: EconomicKind
  /** Target available stock. Shortage/surplus is vs this, not a rate. */
  target: number
}

type Reservation = {
  id: string
  goods: readonly StockAmount[]
}

/** Plain-data carry snapshot — mirrors `settlement/household.ts`'s
 *  `HouseholdSnapshot` shape (plan settlements-npcs-008): `stock` is the
 *  existing bulk `EconomicKind` quantities (never `food`, see `items`
 *  below), `food` is the settlement's own concrete-item store. Used both to
 *  seed a freshly-constructed `EconomyRegistry` across a `WorldBundle`
 *  rebuild and, since this plan, as `SaveData.settlementEconomies`'
 *  per-settlement record. */
export type SettlementEconomySnapshot = {
  stock: Partial<Record<EconomicKind, number>>
  food: { counts: Partial<Record<ItemKind, number>>, instances: readonly SaveItemInstance[] }
}

/**
 * @domain settlements
 * @system settlement-economy
 * @role Owns a settlement's bulk stock, demand-driven shortage/surplus and reservations. Not player `Inventory`.
 * @owns SettlementEconomy
 */
export type SettlementEconomy = {
  readonly settlementId: string
  /** Concrete food storage (plan settlements-npcs-008) — the settlement-level
   *  counterpart of `Household.items`, reusing the same `Inventory` class.
   *  The sole authoritative owner of settlement food; `query`/`shortage`/
   *  `surplus`/`hasShortage`/`hasSurplus` derive `'food'` from this instead
   *  of `EconomicStock`. Mutate through `depositFood`/`withdrawFood`, not
   *  directly — `add`/`remove` below no-op for `'food'` (no `ItemKind` to
   *  carry). */
  readonly items: Inventory
  /** `simTime` (plan settlements-npcs-013) — the caller's own clock (an
   *  `NpcAgent`'s `simClock` in every current call site), recorded verbatim
   *  into `history()`; defaults to `0` for callers with no meaningful clock. */
  add: (kind: EconomicKind, amount: number, simTime?: number) => void
  remove: (kind: EconomicKind, amount: number, simTime?: number) => boolean
  query: (kind: EconomicKind) => number
  produce: (def: ProductionDef) => boolean
  reserve: (goods: readonly StockAmount[]) => string | null
  consumeReservation: (id: string) => boolean
  releaseReservation: (id: string) => boolean
  shortage: (kind: EconomicKind) => number
  surplus: (kind: EconomicKind) => number
  hasShortage: (kind: EconomicKind) => boolean
  hasSurplus: (kind: EconomicKind) => boolean
  /** Concrete-food deposit — the mutation entry point every food producer/
   *  transfer must use instead of `add('food', amount)`. `batches` (plan
   *  settlements-npcs-014) replays a claim's original freshness instead of
   *  `Inventory.add()`'s day-0 default — omit it for genuinely new food
   *  (production), pass a claim's `batches` for a transfer. */
  depositFood: (kind: ItemKind, amount: number, simTime?: number, batches?: readonly FoodBatch[]) => void
  /** Claims up to `amount` food units, deterministic kind order (may span
   *  multiple kinds) — the settlement-storage half of a food transfer,
   *  mirroring `economy/localExchange.ts`'s claim seam for bulk goods. */
  withdrawFood: (amount: number, simTime?: number) => readonly FoodItemClaim[]
  developmentStatus: (id: string) => DevelopmentStatus
  reserveDevelopment: (def: DevelopmentDef) => boolean
  payDevelopment: (def: DevelopmentDef) => boolean
  snapshot: () => SettlementEconomySnapshot
  /** Bounded settlement-level mutation history (plan settlements-npcs-013) —
   *  see `debug/settlementHistory.ts`. */
  history: () => readonly SettlementHistoryEvent[]
}

export function createSettlementEconomy(
  settlementId: string,
  initial: Partial<Record<EconomicKind, number>>,
  demands: readonly SettlementDemand[],
  /** Carried across a `WorldBundle` rebuild / loaded from `SaveData`, same
   *  contract as `initial` above — omitted for a genuinely new settlement. */
  initialFood?: { counts: Partial<Record<ItemKind, number>>, instances: readonly SaveItemInstance[] },
): SettlementEconomy {
  const stock = new EconomicStock(initial)
  const items = new Inventory(
    initialFood?.counts,
    Infinity,
    initialFood ? Inventory.instancesFromJSON(initialFood.instances) : undefined,
  )
  const demandByKind = new Map<EconomicKind, number>()
  for (const demand of demands) demandByKind.set(demand.kind, demand.target)

  const reservations = new Map<string, Reservation>()
  const developments = new Map<string, { reservationId: string | null, status: DevelopmentStatus }>()
  let nextReservation = 1

  // Domain history (plan settlements-npcs-013) — bounded ring + local
  // sequence counter, recorded only at this economy's own mutation methods
  // below (first vertical slice: bulk stock add/remove + concrete food
  // deposit/withdraw; development reservation/completion is out of scope).
  const historyBuf = createSettlementHistoryBuffer()
  const seq = createSequenceAllocator()

  function targetOf(kind: EconomicKind): number {
    return demandByKind.get(kind) ?? 0
  }

  return {
    settlementId,
    items,
    add(kind, amount, simTime = 0) {
      if (kind === 'food') return
      stock.add(kind, amount)
      historyBuf.record({ simTime, seq: seq.next(), type: 'stock.added', kind, amount })
    },
    remove(kind, amount, simTime = 0) {
      if (kind === 'food') return false
      const ok = stock.remove(kind, amount)
      if (ok) historyBuf.record({ simTime, seq: seq.next(), type: 'stock.removed', kind, amount })
      return ok
    },
    query(kind) {
      return kind === 'food' ? foodItemCount(items) : stock.query(kind)
    },
    produce(def) {
      return stock.applyRecipe(def.inputs, def.outputs)
    },
    reserve(goods) {
      if (!stock.hasAll(goods)) return null
      for (const { kind, amount } of goods) stock.remove(kind, amount)
      const id = `res:${nextReservation++}`
      reservations.set(id, { id, goods })
      return id
    },
    consumeReservation(id) {
      return reservations.delete(id)
    },
    releaseReservation(id) {
      const reservation = reservations.get(id)
      if (!reservation) return false
      reservations.delete(id)
      for (const { kind, amount } of reservation.goods) stock.add(kind, amount)
      return true
    },
    shortage(kind) {
      return Math.max(0, targetOf(kind) - this.query(kind))
    },
    surplus(kind) {
      return Math.max(0, this.query(kind) - targetOf(kind))
    },
    hasShortage(kind) {
      return this.shortage(kind) > 0
    },
    hasSurplus(kind) {
      return this.surplus(kind) > 0
    },
    depositFood(kind, amount, simTime = 0, batches) {
      if (amount > 0) {
        items.addWithFreshness(kind, amount, batches ?? [])
        historyBuf.record({ simTime, seq: seq.next(), type: 'food.deposited', kind, amount })
      }
    },
    withdrawFood(amount, simTime = 0) {
      const claimed = claimFoodItems(items, amount)
      const total = claimed.reduce((sum, c) => sum + c.amount, 0)
      if (total > 0) historyBuf.record({ simTime, seq: seq.next(), type: 'food.withdrawn', amount: total })
      return claimed
    },
    developmentStatus(id) {
      return developments.get(id)?.status ?? 'unmet'
    },
    reserveDevelopment(def) {
      const current = developments.get(def.id)
      if (current && current.status !== 'unmet') return false
      const reservationId = this.reserve(def.required)
      if (!reservationId) return false
      developments.set(def.id, { reservationId, status: 'reserved' })
      return true
    },
    payDevelopment(def) {
      const current = developments.get(def.id)
      if (!current || current.status !== 'reserved' || !current.reservationId) return false
      if (!this.consumeReservation(current.reservationId)) return false
      developments.set(def.id, { reservationId: null, status: 'complete' })
      return true
    },
    snapshot() {
      return { stock: stock.toJSON(), food: { counts: items.toJSON(), instances: items.instancesToJSON() } }
    },
    history: () => historyBuf.history(),
  }
}
