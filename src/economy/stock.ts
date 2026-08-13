import type { EconomicKind } from './kinds'

export type StockAmount = {
  kind: EconomicKind
  amount: number
}

/**
 * Settlement-owned bulk quantities. No weight/capacity in v1 — those belong
 * to player `Inventory` and (later) household limits in plan 069.
 */
export class EconomicStock {
  private readonly amounts = new Map<EconomicKind, number>()

  constructor(initial?: Partial<Record<EconomicKind, number>>) {
    if (!initial) return
    for (const [kind, amount] of Object.entries(initial) as [EconomicKind, number][]) {
      if (amount > 0) this.amounts.set(kind, amount)
    }
  }

  query(kind: EconomicKind): number {
    return this.amounts.get(kind) ?? 0
  }

  add(kind: EconomicKind, amount: number): void {
    if (amount <= 0) return
    this.amounts.set(kind, this.query(kind) + amount)
  }

  /** False and unchanged when available stock is insufficient. */
  remove(kind: EconomicKind, amount: number): boolean {
    if (amount <= 0) return amount === 0
    const current = this.query(kind)
    if (current < amount) return false
    this.amounts.set(kind, current - amount)
    return true
  }

  has(kind: EconomicKind, amount: number): boolean {
    return this.query(kind) >= amount
  }

  hasAll(goods: readonly StockAmount[]): boolean {
    for (const { kind, amount } of goods) {
      if (!this.has(kind, amount)) return false
    }
    return true
  }

  /**
   * Remove every input then add every output. Returns false and leaves stock
   * unchanged when any input is missing.
   */
  applyRecipe(inputs: readonly StockAmount[], outputs: readonly StockAmount[]): boolean {
    if (!this.hasAll(inputs)) return false
    for (const { kind, amount } of inputs) {
      this.remove(kind, amount)
    }
    for (const { kind, amount } of outputs) {
      this.add(kind, amount)
    }
    return true
  }

  toJSON(): Partial<Record<EconomicKind, number>> {
    const out: Partial<Record<EconomicKind, number>> = {}
    for (const [kind, amount] of this.amounts) {
      if (amount > 0) out[kind] = amount
    }
    return out
  }
}
