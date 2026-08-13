import type { DevelopmentDef, DevelopmentStatus } from './development'
import type { EconomicKind } from './kinds'
import type { ProductionDef } from './production'
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

export type SettlementEconomy = {
  readonly settlementId: string
  add: (kind: EconomicKind, amount: number) => void
  remove: (kind: EconomicKind, amount: number) => boolean
  query: (kind: EconomicKind) => number
  produce: (def: ProductionDef) => boolean
  reserve: (goods: readonly StockAmount[]) => string | null
  consumeReservation: (id: string) => boolean
  releaseReservation: (id: string) => boolean
  shortage: (kind: EconomicKind) => number
  surplus: (kind: EconomicKind) => number
  hasShortage: (kind: EconomicKind) => boolean
  hasSurplus: (kind: EconomicKind) => boolean
  developmentStatus: (id: string) => DevelopmentStatus
  reserveDevelopment: (def: DevelopmentDef) => boolean
  payDevelopment: (def: DevelopmentDef) => boolean
  snapshot: () => Partial<Record<EconomicKind, number>>
}

export function createSettlementEconomy(
  settlementId: string,
  initial: Partial<Record<EconomicKind, number>>,
  demands: readonly SettlementDemand[],
): SettlementEconomy {
  const stock = new EconomicStock(initial)
  const demandByKind = new Map<EconomicKind, number>()
  for (const demand of demands) demandByKind.set(demand.kind, demand.target)

  const reservations = new Map<string, Reservation>()
  const developments = new Map<string, { reservationId: string | null, status: DevelopmentStatus }>()
  let nextReservation = 1

  function targetOf(kind: EconomicKind): number {
    return demandByKind.get(kind) ?? 0
  }

  return {
    settlementId,
    add(kind, amount) {
      stock.add(kind, amount)
    },
    remove(kind, amount) {
      return stock.remove(kind, amount)
    },
    query(kind) {
      return stock.query(kind)
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
      return Math.max(0, targetOf(kind) - stock.query(kind))
    },
    surplus(kind) {
      return Math.max(0, stock.query(kind) - targetOf(kind))
    },
    hasShortage(kind) {
      return this.shortage(kind) > 0
    },
    hasSurplus(kind) {
      return this.surplus(kind) > 0
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
      return stock.toJSON()
    },
  }
}
