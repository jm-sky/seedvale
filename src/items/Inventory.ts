import type { ItemKind } from './items'

/** Player-carried item counters. In-memory + persisted via `toJSON()`/the
 *  constructor's `initial` param — see `persistence/saveData.ts`. */
export class Inventory {
  private readonly counts = new Map<ItemKind, number>()

  constructor(initial?: Partial<Record<ItemKind, number>>) {
    if (!initial) return
    for (const [kind, count] of Object.entries(initial) as [ItemKind, number][]) {
      if (count > 0) this.counts.set(kind, count)
    }
  }

  add(kind: ItemKind, n = 1): void {
    this.counts.set(kind, this.count(kind) + n)
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

  toJSON(): Partial<Record<ItemKind, number>> {
    return Object.fromEntries(this.counts) as Partial<Record<ItemKind, number>>
  }
}
