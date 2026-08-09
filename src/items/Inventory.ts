import { ITEM_DEFS, type ItemKind } from './items'

/** Default carry limit (kg) — see plan `2026-08-08--043`. Not persisted (the
 *  plan keeps weight/limit derived from config/definitions, not save data);
 *  a future equipment system (backpacks) would vary this per player instead. */
const DEFAULT_MAX_WEIGHT = 20

/** Player-carried item counters + weight limit. In-memory + persisted via
 *  `toJSON()`/the constructor's `initial` param — see `persistence/saveData.ts`.
 *  `maxWeight` itself is never persisted (derived from `DEFAULT_MAX_WEIGHT`
 *  on every load) — see plan `043` §3/§11. */
export class Inventory {
  private readonly counts = new Map<ItemKind, number>()
  readonly maxWeight: number

  constructor(initial?: Partial<Record<ItemKind, number>>, maxWeight = DEFAULT_MAX_WEIGHT) {
    this.maxWeight = maxWeight
    if (!initial) return
    for (const [kind, count] of Object.entries(initial) as [ItemKind, number][]) {
      if (count > 0) this.counts.set(kind, count)
    }
  }

  totalWeight(): number {
    let total = 0
    for (const [kind, n] of this.counts) total += ITEM_DEFS[kind].weight * n
    return total
  }

  /** Whether `n` more of `kind` would still fit under `maxWeight`. */
  canAdd(kind: ItemKind, n = 1): boolean {
    return this.totalWeight() + ITEM_DEFS[kind].weight * n <= this.maxWeight + 1e-9
  }

  /** Adds `n` of `kind` if it fits under `maxWeight`; a no-op (returns false)
   *  otherwise — callers are expected to check first via `canAdd()` when they
   *  need to leave the item's world representation in place on failure (see
   *  `app/createApp.ts`'s pickup handling). */
  add(kind: ItemKind, n = 1): boolean {
    if (!this.canAdd(kind, n)) return false
    this.counts.set(kind, this.count(kind) + n)
    return true
  }

  count(kind: ItemKind): number {
    return this.counts.get(kind) ?? 0
  }

  has(kind: ItemKind, n: number): boolean {
    return this.count(kind) >= n
  }

  /** False as soon as any kind has a positive count — `remove()` can leave a
   *  zeroed entry in `counts` rather than deleting it, so this can't just
   *  check `counts.size`. */
  isEmpty(): boolean {
    for (const n of this.counts.values()) {
      if (n > 0) return false
    }
    return true
  }

  remove(kind: ItemKind, n: number): boolean {
    const current = this.count(kind)
    if (current < n) return false
    this.counts.set(kind, current - n)
    return true
  }

  clear(): void {
    this.counts.clear()
  }

  toJSON(): Partial<Record<ItemKind, number>> {
    return Object.fromEntries(this.counts) as Partial<Record<ItemKind, number>>
  }
}
