import type { SettlementHistoryEvent } from '../debug/settlementHistory'
import type { ItemKind } from '../items/items'
import type { DevelopmentDef, DevelopmentStatus } from './development'
import type { EconomicKind, EconomicSourceId } from './kinds'
import type { ProductionDef } from './production'
import { createSequenceAllocator } from '../debug/domainHistory'
import { createSettlementHistoryBuffer } from '../debug/settlementHistory'
import { STORED_FOOD_DECAY } from '../items/foodFreshness'
import { claimFoodItems, type FoodItemClaim, foodItemCount } from '../items/foodItems'
import { type FoodBatch, Inventory, type SaveItemInstance } from '../items/Inventory'
import { executeProduction, type ProductionResult } from './productionExecutor'
import {
  applyProductionOutcome,
  loadProductionShortages,
  type ProductionShortageRecord,
  revalidateProductionShortages,
  snapshotProductionShortages,
} from './productionShortage'
import {
  type ClaimResult,
  createSourceAccounting,
  type EstablishEntitlementInput,
  type RealizationResult,
  type RealizeAttributedInput,
  type SourceAccountingSnapshot,
  type SourceEntitlement,
} from './sourceLedger'
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
  food: {
    counts: Partial<Record<ItemKind, number>>
    instances: readonly SaveItemInstance[]
    foodBatches?: Partial<Record<ItemKind, readonly FoodBatch[]>>
  }
  /** Compact blocked-recipe observations (plan settlements-npcs-017). Absent = none. */
  productionShortages?: readonly ProductionShortageRecord[]
  /** Source-attribution ledger, exact-once realizations and entitlement
   *  accrual (plan settlements-004). Absent = no source-attributed activity
   *  yet — restores as empty, never reconstructed from stock/inventory. */
  sourceAccounting?: SourceAccountingSnapshot
}

/**
 * @domain settlements
 * @system settlement-economy
 * @role Owns a settlement's bulk stock, demand-driven shortage/surplus,
 *   reservations and (plan settlements-004) source-attributed stock,
 *   realization and entitlement accrual. Not player `Inventory`.
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
  /** Attributed mutation path (plan settlements-004) — atomically increases
   *  aggregate stock (like `add`) and the source-unrealized ledger for
   *  `(sourceId, kind)`. Use only for real delivered production from a
   *  known `EconomicSourceId`; ordinary stock keeps using `add`. */
  addAttributed: (kind: EconomicKind, amount: number, sourceId: EconomicSourceId, simTime?: number) => void
  /** Unrealized attributed quantity still owed to `sourceId` for `kind`. */
  sourceUnrealized: (sourceId: EconomicSourceId, kind: EconomicKind) => number
  /** Exact-once economic realization of already-attributed stock — removes
   *  `amount` from both aggregate stock and the source ledger, then accrues
   *  matching entitlements off the resulting gross value. A repeated
   *  `eventId` replays the original result without mutating anything. */
  realizeAttributed: (input: RealizeAttributedInput) => RealizationResult
  /** Idempotent for the `(sourceId, beneficiary)` agreement identity — a
   *  repeat returns the existing entitlement instead of creating another. */
  establishEntitlement: (input: EstablishEntitlementInput) => SourceEntitlement
  entitlement: (entitlementId: string) => SourceEntitlement | undefined
  /** Accrued whole coins not yet claimed — read side of the claim boundary. */
  claimableEntitlement: (entitlementId: string) => number
  /** Write side of the claim boundary — callers grant the coin through the
   *  existing player reward path first, then commit with a stable
   *  `operationId` so a retry cannot lose or duplicate accrued coins. */
  commitEntitlementClaim: (entitlementId: string, operationId: string, amount: number) => ClaimResult
  /** Stock-only adapter to `executeProduction`. Recipes with item rows fail
   *  (no item owner is passed). `simTime` is recorded on stock history. */
  produce: (def: ProductionDef, simTime?: number) => boolean
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
  observeProductionOutcome: (result: ProductionResult, simTime?: number, householdId?: string) => void
  revalidateProductionShortages: (simTime: number, itemOwner?: { householdId: string, inventory: Inventory }) => void
  productionShortages: () => readonly ProductionShortageRecord[]
}

export function createSettlementEconomy(
  settlementId: string,
  initial: Partial<Record<EconomicKind, number>>,
  demands: readonly SettlementDemand[],
  /** Carried across a `WorldBundle` rebuild / loaded from `SaveData`, same
   *  contract as `initial` above — omitted for a genuinely new settlement. */
  initialFood?: {
    counts: Partial<Record<ItemKind, number>>
    instances: readonly SaveItemInstance[]
    foodBatches?: Partial<Record<ItemKind, readonly FoodBatch[]>>
  },
  initialShortages?: readonly ProductionShortageRecord[],
  initialSourceAccounting?: SourceAccountingSnapshot,
): SettlementEconomy {
  const stock = new EconomicStock(initial)
  const items = new Inventory(
    initialFood?.counts,
    Infinity,
    initialFood ? Inventory.instancesFromJSON(initialFood.instances) : undefined,
    initialFood?.foodBatches,
    Infinity,
    STORED_FOOD_DECAY,
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
  const productionShortages = loadProductionShortages(initialShortages)
  const sourceAccounting = createSourceAccounting(initialSourceAccounting)

  function targetOf(kind: EconomicKind): number {
    return demandByKind.get(kind) ?? 0
  }

  const created: SettlementEconomy = {
    settlementId,
    items,
    add(kind, amount, simTime = 0) {
      if (kind === 'food') return
      stock.add(kind, amount)
      historyBuf.record({ simTime, seq: seq.next(), type: 'stock.added', kind, amount })
    },
    addAttributed(kind, amount, sourceId, simTime = 0) {
      if (kind === 'food' || amount <= 0) return
      stock.add(kind, amount)
      sourceAccounting.addAttributed(kind, amount, sourceId)
      historyBuf.record({ simTime, seq: seq.next(), type: 'stock.added', kind, amount })
    },
    sourceUnrealized: (sourceId, kind) => sourceAccounting.unrealized(sourceId, kind),
    realizeAttributed(input) {
      const result = sourceAccounting.realize(stock, input)
      if (result.ok && !result.replay) {
        historyBuf.record({
          simTime: input.simTime ?? 0,
          seq: seq.next(),
          type: 'stock.removed',
          kind: result.kind,
          amount: result.amount,
        })
      }
      return result
    },
    establishEntitlement: (input) => sourceAccounting.establishEntitlement(input),
    entitlement: (entitlementId) => sourceAccounting.entitlement(entitlementId),
    claimableEntitlement: (entitlementId) => sourceAccounting.claimable(entitlementId),
    commitEntitlementClaim: (entitlementId, operationId, amount) =>
      sourceAccounting.commitClaim(entitlementId, operationId, amount),
    remove(kind, amount, simTime = 0) {
      if (kind === 'food') return false
      const ok = stock.remove(kind, amount)
      if (ok) historyBuf.record({ simTime, seq: seq.next(), type: 'stock.removed', kind, amount })
      return ok
    },
    query(kind) {
      return kind === 'food' ? foodItemCount(items) : stock.query(kind)
    },
    produce(def, simTime = 0) {
      return executeProduction(def, { economy: this, simTime }).ok
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
        items.addWithFreshness(kind, amount, batches ?? [], simTime)
        historyBuf.record({ simTime, seq: seq.next(), type: 'food.deposited', kind, amount })
      }
    },
    withdrawFood(amount, simTime = 0) {
      const claimed = claimFoodItems(items, amount, simTime)
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
      const shortages = snapshotProductionShortages(productionShortages)
      const sourceAccountingSnapshot = sourceAccounting.snapshot()
      return {
        stock: stock.toJSON(),
        food: {
          counts: items.toJSON(),
          instances: items.instancesToJSON(),
          foodBatches: items.foodBatchesToJSON(),
        },
        ...(shortages.length > 0 ? { productionShortages: shortages } : {}),
        ...(sourceAccountingSnapshot ? { sourceAccounting: sourceAccountingSnapshot } : {}),
      }
    },
    history: () => historyBuf.history(),
    observeProductionOutcome(result, simTime = 0, householdId) {
      applyProductionOutcome(productionShortages, result, simTime, householdId)
    },
    revalidateProductionShortages(simTime, itemOwner) {
      revalidateProductionShortages(productionShortages, {
        simTime,
        economy: this,
        itemOwner,
      })
    },
    productionShortages: () => snapshotProductionShortages(productionShortages),
  }

  created.revalidateProductionShortages(0)
  return created
}
