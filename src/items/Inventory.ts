import { ITEM_DEFS, type ItemKind } from './items'
import { cloneItemInstance, isTrapItemInstance, type ItemInstance, type TrapItemInstance } from './itemInstances'

/** Default carry limit (kg) — see plan `2026-08-08--043`. Not persisted (the
 *  plan keeps weight/limit derived from config/definitions, not save data);
 *  a future equipment system (backpacks) would vary this per player instead.
 *  Callers other than the player pass their own `maxWeight` (see `NpcAgent`'s
 *  small carry cap, plan 131). */
const DEFAULT_MAX_WEIGHT = 20

export type SaveItemInstance = {
  id: string
  kind: ItemKind
  durability?: number
}

/** Generic item carrier: counters + a weight limit. Originally player-only;
 *  reused by `NpcAgent` (plan 131) as a brief hold between extracting a
 *  world resource and delivering it, not a persistent belongings system. The
 *  player's own instance is in-memory + persisted via `toJSON()`/the
 *  constructor's `initial` param — see `persistence/saveData.ts`.
 *  `maxWeight` itself is never persisted (derived on every load) — see plan
 *  `043` §3/§11. */
export class Inventory {
  private readonly counts = new Map<ItemKind, number>()
  private readonly instances = new Map<string, ItemInstance>()
  readonly maxWeight: number

  constructor(
    initial?: Partial<Record<ItemKind, number>>,
    maxWeight = DEFAULT_MAX_WEIGHT,
    initialInstances?: readonly ItemInstance[],
  ) {
    this.maxWeight = maxWeight
    if (initial) {
      for (const [kind, count] of Object.entries(initial) as [ItemKind, number][]) {
        if (count > 0) this.counts.set(kind, count)
      }
    }
    if (initialInstances) {
      for (const instance of initialInstances) {
        if (this.instances.has(instance.id)) continue
        this.instances.set(instance.id, cloneItemInstance(instance))
      }
    }
  }

  totalWeight(): number {
    let total = 0
    for (const [kind, n] of this.counts) total += ITEM_DEFS[kind].weight * n
    for (const instance of this.instances.values()) {
      total += ITEM_DEFS[instance.kind].weight
    }
    return total
  }

  /** Whether `n` more of `kind` would still fit under `maxWeight`. */
  canAdd(kind: ItemKind, n = 1): boolean {
    return this.totalWeight() + ITEM_DEFS[kind].weight * n <= this.maxWeight + 1e-9
  }

  canAddInstance(instance: ItemInstance): boolean {
    return this.totalWeight() + ITEM_DEFS[instance.kind].weight <= this.maxWeight + 1e-9
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

  addInstance(instance: ItemInstance): boolean {
    if (this.instances.has(instance.id)) return false
    if (!this.canAddInstance(instance)) return false
    this.instances.set(instance.id, cloneItemInstance(instance))
    return true
  }

  count(kind: ItemKind): number {
    return this.counts.get(kind) ?? 0
  }

  countInstances(kind: ItemKind): number {
    let n = 0
    for (const instance of this.instances.values()) {
      if (instance.kind === kind) n++
    }
    return n
  }

  has(kind: ItemKind, n: number): boolean {
    return this.count(kind) >= n
  }

  getInstance(id: string): ItemInstance | null {
    const instance = this.instances.get(id)
    return instance ? cloneItemInstance(instance) : null
  }

  getInstances(kind: ItemKind): readonly ItemInstance[] {
    const out: ItemInstance[] = []
    for (const instance of this.instances.values()) {
      if (instance.kind === kind) out.push(cloneItemInstance(instance))
    }
    return out
  }

  /** False as soon as any kind has a positive count — `remove()` can leave a
   *  zeroed entry in `counts` rather than deleting it, so this can't just
   *  check `counts.size`. */
  isEmpty(): boolean {
    for (const n of this.counts.values()) {
      if (n > 0) return false
    }
    return this.instances.size === 0
  }

  remove(kind: ItemKind, n: number): boolean {
    const current = this.count(kind)
    if (current < n) return false
    this.counts.set(kind, current - n)
    return true
  }

  removeInstance(id: string): boolean {
    return this.instances.delete(id)
  }

  clear(): void {
    this.counts.clear()
    this.instances.clear()
  }

  toJSON(): Partial<Record<ItemKind, number>> {
    return Object.fromEntries(this.counts) as Partial<Record<ItemKind, number>>
  }

  instancesToJSON(): SaveItemInstance[] {
    const out: SaveItemInstance[] = []
    for (const instance of this.instances.values()) {
      const row: SaveItemInstance = { id: instance.id, kind: instance.kind }
      if (isTrapItemInstance(instance)) row.durability = instance.durability
      out.push(row)
    }
    return out
  }

  static instancesFromJSON(rows: readonly SaveItemInstance[]): ItemInstance[] {
    const out: ItemInstance[] = []
    for (const row of rows) {
      if (!row.id || !row.kind) continue
      if (row.kind === 'trap_simple' || row.kind === 'trap_good') {
        if (typeof row.durability !== 'number' || !Number.isFinite(row.durability)) continue
        const trap: TrapItemInstance = {
          id: row.id,
          kind: row.kind,
          durability: Math.max(0, row.durability),
        }
        out.push(trap)
        continue
      }
      out.push({ id: row.id, kind: row.kind })
    }
    return out
  }
}
