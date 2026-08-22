import { canMergeFoodBatches, isFoodPerishable } from './foodFreshness'
import { CAPABILITY_KINDS, ITEM_CATALOG, type ItemCapability } from './itemCatalog'
import {
  clamp01,
  cloneItemInstance,
  isTrapItemInstance,
  isWeaponItemInstance,
  isWeaponMaintenanceKind,
  type ItemInstance,
  type TrapItemInstance,
  type WeaponItemInstance,
} from './itemInstances'
import { ITEM_DEFS, type ItemKind, itemSizeUnits } from './items'

/** Default carry limit (kg) — see plan `2026-08-08--043`. Not persisted (the
 *  plan keeps weight/limit derived from config/definitions, not save data);
 *  a future equipment system (backpacks) would vary this per player instead.
 *  Callers other than the player pass their own `maxWeight` (see `NpcAgent`'s
 *  small carry cap, plan 131). */
const DEFAULT_MAX_WEIGHT = 20

/** Default gabarite capacity (plan 164), independent of `maxWeight` — see
 *  `ItemSize`. Only the player's own inventory uses this default (passed
 *  explicitly by `createApp.ts`, since the constructor's own default stays
 *  `Infinity` for every other caller — NPC carrying, container contents,
 *  pre-164 tests). */
export const DEFAULT_MAX_SIZE = 60

export type SaveItemInstance = {
  id: string
  kind: ItemKind
  durability?: number
  /** Plan 161 — weapon-maintenance kinds only; absent/invalid → `1`. */
  sharpness?: number
}

/** `ItemInstance` → its persisted-row shape — the single conversion used by
 *  `instancesToJSON()` and by anywhere else (dropped-item world records,
 *  plan 199) that needs to hand an instance's condition across a boundary
 *  that only speaks plain data, not live class instances. */
export function toSaveItemInstance(instance: ItemInstance): SaveItemInstance {
  const row: SaveItemInstance = { id: instance.id, kind: instance.kind }
  if (isTrapItemInstance(instance)) row.durability = instance.durability
  if (isWeaponItemInstance(instance)) {
    row.durability = instance.durability
    row.sharpness = instance.sharpness
  }
  return row
}

/** Plan 159 — a stack-level freshness batch for one perishable `ItemKind`.
 *  Freshness belongs to the stack, not to an individual food unit: a kind's
 *  total `count` (still tracked in `counts` for every existing caller) is
 *  split across one or more batches by acquisition day, so two pickups with
 *  incompatible ages stay distinguishable without ever creating one
 *  `ItemInstance` per food unit. */
export type FoodBatch = { count: number, acquiredAtDays: number }

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
  /** Only populated for kinds with `ItemCatalogEntry.food.freshness` — see
   *  `isFoodPerishable()`. Every entry's batches always sum to `counts.get(kind)`. */
  private readonly foodBatches = new Map<ItemKind, FoodBatch[]>()
  private readonly baseMaxWeight: number
  /** Gabarite capacity (plan 164), independent of `maxWeight` — see
   *  `ItemSize`/`itemSizeUnits`. `Infinity` (the default for every caller
   *  that doesn't pass one — NPC temporary carrying, pre-164 tests) means
   *  "no size gate", matching pre-existing behaviour exactly. */
  readonly maxSize: number

  constructor(
    initial?: Partial<Record<ItemKind, number>>,
    maxWeight = DEFAULT_MAX_WEIGHT,
    initialInstances?: readonly ItemInstance[],
    initialFoodBatches?: Partial<Record<ItemKind, readonly FoodBatch[]>>,
    maxSize = Infinity,
  ) {
    this.baseMaxWeight = maxWeight
    this.maxSize = maxSize
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
    if (initialFoodBatches) {
      for (const [kind, batches] of Object.entries(initialFoodBatches) as [ItemKind, readonly FoodBatch[]][]) {
        if (!isFoodPerishable(kind) || !batches || batches.length === 0) continue
        const clamped = batches
          .filter((b) => b.count > 0)
          .map((b) => ({ count: b.count, acquiredAtDays: b.acquiredAtDays }))
        if (clamped.length > 0) this.foodBatches.set(kind, clamped)
      }
    }
  }

  /** Effective carry-weight limit (plan 186): the constructor's base plus
   *  `carryCapacityBonus` summed over every currently-held unit that
   *  declares one (backpacks) — derived, never persisted, same as the old
   *  plain `maxWeight` field it replaces. Computed on every access rather
   *  than cached so `add()`/`remove()` never have to remember to refresh it. */
  get maxWeight(): number {
    let bonus = 0
    for (const [kind, n] of this.counts) {
      const perUnit = ITEM_CATALOG[kind].carryCapacityBonus
      if (perUnit) bonus += perUnit * n
    }
    return this.baseMaxWeight + bonus
  }

  private addFoodBatch(kind: ItemKind, n: number, acquiredAtDays: number): void {
    const batches = this.foodBatches.get(kind) ?? []
    const compatible = batches.find((b) => canMergeFoodBatches(b.acquiredAtDays, acquiredAtDays))
    if (compatible) {
      // Weighted-average acquisition day keeps the merged batch's deadline
      // representative of both contributions instead of always snapping to
      // whichever pickup happened first/last.
      const total = compatible.count + n
      compatible.acquiredAtDays = (compatible.acquiredAtDays * compatible.count + acquiredAtDays * n) / total
      compatible.count = total
    } else {
      batches.push({ count: n, acquiredAtDays })
    }
    this.foodBatches.set(kind, batches)
  }

  /** Removes `n` units from `kind`'s batches, oldest (most spoiled) first —
   *  matches the "use it before it spoils" intuition and keeps whichever
   *  batch a consumer just read (e.g. `oldestAcquiredAtDays`) consistent with
   *  what actually gets removed next. */
  private removeFoodBatch(kind: ItemKind, n: number): void {
    const batches = this.foodBatches.get(kind)
    if (!batches || batches.length === 0) return
    batches.sort((a, b) => a.acquiredAtDays - b.acquiredAtDays)
    let remaining = n
    while (remaining > 0 && batches.length > 0) {
      const first = batches[0]!
      if (first.count <= remaining) {
        remaining -= first.count
        batches.shift()
      } else {
        first.count -= remaining
        remaining = 0
      }
    }
    if (batches.length === 0) this.foodBatches.delete(kind)
  }

  /** Read-only snapshot of `kind`'s freshness batches, oldest first. Empty
   *  for non-perishable kinds or kinds never added with a batch. */
  getFoodBatches(kind: ItemKind): readonly FoodBatch[] {
    const batches = this.foodBatches.get(kind)
    if (!batches) return []
    return [...batches].sort((a, b) => a.acquiredAtDays - b.acquiredAtDays).map((b) => ({ ...b }))
  }

  /** Acquisition day of the batch that would be consumed/eaten next (oldest
   *  first), or null when `kind` isn't perishable or isn't held. Consumption
   *  paths (player `consumeItem`, NPC eating) use this to resolve the
   *  freshness stage of "the" item about to be used. */
  oldestAcquiredAtDays(kind: ItemKind): number | null {
    const batches = this.foodBatches.get(kind)
    if (!batches || batches.length === 0) return null
    return batches.reduce((min, b) => Math.min(min, b.acquiredAtDays), Infinity)
  }

  totalWeight(): number {
    let total = 0
    for (const [kind, n] of this.counts) total += ITEM_DEFS[kind].weight * n
    for (const instance of this.instances.values()) {
      total += ITEM_DEFS[instance.kind].weight
    }
    return total
  }

  /** Gabarite occupied right now (plan 164) — `weight`'s independent
   *  counterpart. A stack occupies `count × itemSizeUnits(kind)` (one
   *  physical item's size per unit, implementation notes §11 — never
   *  "a stack is one slot"). */
  totalSize(): number {
    let total = 0
    for (const [kind, n] of this.counts) total += itemSizeUnits(kind) * n
    for (const instance of this.instances.values()) total += itemSizeUnits(instance.kind)
    return total
  }

  /** Whether `n` more of `kind` would still fit under `maxWeight` alone. */
  hasWeightRoom(kind: ItemKind, n = 1): boolean {
    return this.totalWeight() + ITEM_DEFS[kind].weight * n <= this.maxWeight + 1e-9
  }

  /** Whether `n` more of `kind` would still fit under `maxSize` alone. */
  hasSizeRoom(kind: ItemKind, n = 1): boolean {
    return this.totalSize() + itemSizeUnits(kind) * n <= this.maxSize + 1e-9
  }

  /** Whether `n` more of `kind` would still fit under both `maxWeight` and
   *  `maxSize` — independent constraints (plan 164 §10): a small heavy item
   *  can fail only the weight check, a large light one only the size check. */
  canAdd(kind: ItemKind, n = 1): boolean {
    return this.hasWeightRoom(kind, n) && this.hasSizeRoom(kind, n)
  }

  canAddInstance(instance: ItemInstance): boolean {
    return this.hasWeightRoom(instance.kind, 1) && this.hasSizeRoom(instance.kind, 1)
  }

  /** Adds `n` of `kind` if it fits under `maxWeight`; a no-op (returns false)
   *  otherwise — callers are expected to check first via `canAdd()` when they
   *  need to leave the item's world representation in place on failure (see
   *  `app/createApp.ts`'s pickup handling). `acquiredAtDays` (plan 159) is
   *  only meaningful — and only recorded — for perishable kinds
   *  (`isFoodPerishable`); every other call site can omit it. */
  add(kind: ItemKind, n = 1, acquiredAtDays?: number): boolean {
    if (!this.canAdd(kind, n)) return false
    this.counts.set(kind, this.count(kind) + n)
    if (isFoodPerishable(kind)) this.addFoodBatch(kind, n, acquiredAtDays ?? 0)
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

  /** True when the player holds at least one unit of `kind`, whether it's a
   *  plain stackable count or an instance-backed kind (plan 161) — callers
   *  that only care about presence (gating a tool-availability check, a
   *  branch-yield bonus) don't need to know which storage a kind uses. */
  holdsAny(kind: ItemKind): boolean {
    return this.count(kind) > 0 || this.countInstances(kind) > 0
  }

  /** Does the carrier hold *any* item able to perform `capability`
   *  (plan 184)? Replaces per-tool `has('shovel', 1)` /
   *  `holdsAny('knife') || holdsAny('damascus_knife')` gates, so a new
   *  compatible kind only has to declare the capability in `ITEM_CATALOG`. */
  hasCapability(capability: ItemCapability): boolean {
    return this.findWithCapability(capability) !== null
  }

  /** The best held item able to perform `capability`, or null — for callers
   *  that must name the kind (auto-equip). "Best" is `CAPABILITY_KINDS`'
   *  documented order, so e.g. a damascus knife wins over a plain one. */
  findWithCapability(capability: ItemCapability): ItemKind | null {
    for (const kind of CAPABILITY_KINDS[capability]) {
      if (this.holdsAny(kind)) return kind
    }
    return null
  }

  getInstance(id: string): ItemInstance | null {
    const instance = this.instances.get(id)
    return instance ? cloneItemInstance(instance) : null
  }

  /** Controlled mutation for callers that need to change one instance's own
   *  state (durability/sharpness wear, sharpening) without exposing the
   *  backing `Map` (plan 161 — `getInstance`/`getInstances` only ever return
   *  clones). `updater` receives a clone and returns the next state; the
   *  returned object is stored as-is, so callers own their own clamping.
   *  Returns false (no-op) when `id` isn't held. */
  updateInstance(id: string, updater: (current: ItemInstance) => ItemInstance): boolean {
    const instance = this.instances.get(id)
    if (!instance) return false
    const next = updater(cloneItemInstance(instance))
    if (next.id !== id) return false
    this.instances.set(id, cloneItemInstance(next))
    return true
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
    if (isFoodPerishable(kind)) this.removeFoodBatch(kind, n)
    return true
  }

  removeInstance(id: string): boolean {
    return this.instances.delete(id)
  }

  clear(): void {
    this.counts.clear()
    this.instances.clear()
    this.foodBatches.clear()
  }

  toJSON(): Partial<Record<ItemKind, number>> {
    return Object.fromEntries(this.counts) as Partial<Record<ItemKind, number>>
  }

  /** Persists only what can't be re-derived: perishable kinds' batch counts +
   *  acquisition days. Non-perishable kinds never appear here. */
  foodBatchesToJSON(): Partial<Record<ItemKind, FoodBatch[]>> {
    const out: Partial<Record<ItemKind, FoodBatch[]>> = {}
    for (const [kind, batches] of this.foodBatches) {
      if (batches.length > 0) out[kind] = batches.map((b) => ({ ...b }))
    }
    return out
  }

  instancesToJSON(): SaveItemInstance[] {
    return [...this.instances.values()].map(toSaveItemInstance)
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
      if (isWeaponMaintenanceKind(row.kind)) {
        const weapon: WeaponItemInstance = {
          id: row.id,
          kind: row.kind,
          durability: typeof row.durability === 'number' ? clamp01(row.durability) : 1,
          sharpness: typeof row.sharpness === 'number' ? clamp01(row.sharpness) : 1,
        }
        out.push(weapon)
        continue
      }
      out.push({ id: row.id, kind: row.kind })
    }
    return out
  }
}

/** Toast text for a failed `canAdd`/`canAddInstance` — picks wording by
 *  which cap actually blocked (weight/size are independent, plan 164 §10),
 *  so callers stop always naming weight regardless of the real reason. */
export function inventoryFullToastText(inventory: Inventory, kind: ItemKind, n = 1): string {
  const weightOk = inventory.hasWeightRoom(kind, n)
  const sizeOk = inventory.hasSizeRoom(kind, n)
  if (!weightOk && !sizeOk) return 'Ekwipunek jest za ciężki albo za mały.'
  if (!weightOk) return 'Ekwipunek jest za ciężki.'
  return 'Ekwipunek jest za mały.'
}
