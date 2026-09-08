import {
  CARRIED_FOOD_DECAY,
  checkpointFoodBatch,
  cloneFoodBatch,
  compareFoodBatchesFifo,
  createFoodBatch,
  type FoodBatch,
  foodBatchesMergeEqual,
  type FoodSourceSpecies,
  isFoodPerishable,
  normalizeFoodBatch,
  sourceSpeciesForMeatKind,
} from './foodFreshness'
import { CAPABILITY_KINDS, CONSUMABLE_KINDS_BY_NEED, type ConsumableNeed, ITEM_CATALOG, type ItemCapability } from './itemCatalog'
import {
  clamp01,
  cloneItemInstance,
  isLiquidContainerInstance,
  isLiquidContainerKind,
  isTrapItemInstance,
  isTrapKind,
  isWeaponItemInstance,
  isWeaponMaintenanceKind,
  type ItemInstance,
  type LiquidContainerItemInstance,
  type LiquidContent,
  type TrapItemInstance,
  type WeaponItemInstance,
} from './itemInstances'
import { ITEM_DEFS, type ItemKind, itemSizeUnits } from './items'
import { LIQUID_DENSITY_KG_PER_LITRE } from './liquidContainer'

/** Default carry limit (kg) — the Strength = 0.5 human baseline (plan
 *  npc-020). Not persisted (weight/limit stay derived from config, not save
 *  data). The player's inventory is constructed with a Strength-derived
 *  base instead (`humanBodyCarryCapacityKg`); other callers pass their own
 *  `maxWeight` (see `NpcAgent`'s logistics cap). Equipment
 *  `carryCapacityBonus` (backpacks) is added by the `maxWeight` getter, not
 *  this default. */
const DEFAULT_MAX_WEIGHT = 20

/** Default gabarite capacity (plan 164), independent of `maxWeight` — see
 *  `ItemSize`. Only the player's own inventory uses this default (passed
 *  explicitly by `createApp.ts`, since the constructor's own default stays
 *  `Infinity` for every other caller — NPC carrying, container contents,
 *  pre-164 tests). */
export const DEFAULT_MAX_SIZE = 60

/** Plain item quantity — the `Inventory` counterpart of `economy/stock.ts`'s
 *  `StockAmount`, for recipes whose inputs/outputs are held items rather than
 *  settlement `EconomicKind` stock (settlements-npcs-003). */
export type ItemAmount = { kind: ItemKind, amount: number }

export type SaveItemInstance = {
  id: string
  kind: ItemKind
  durability?: number
  /** Plan 161 — weapon-maintenance kinds only; absent/invalid → `1`. */
  sharpness?: number
  /** Plan items-player-001 — liquid-container kinds only. Absent/`0`
   *  `amountLitres` means empty; `liquid` is meaningless (and omitted) then. */
  liquid?: LiquidContent
  amountLitres?: number
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
  if (isLiquidContainerInstance(instance) && instance.liquid && instance.amountLitres > 0) {
    row.liquid = instance.liquid
    row.amountLitres = instance.amountLitres
  }
  return row
}

export type { FoodBatch, FoodSourceSpecies } from './foodFreshness'

/** Generic item carrier: counters + a weight limit. Originally player-only;
 *  reused by `NpcAgent` (plan 131) as a brief hold between extracting a
 *  world resource and delivering it, not a persistent belongings system. The
 *  player's own instance is in-memory + persisted via `toJSON()`/the
 *  constructor's `initial` param — see `persistence/saveData.ts`.
 *  `maxWeight` itself is never persisted (derived on every load) — see plan
 *  `043` §3/§11.
 *
 * @domain items-player
 * @system inventory
 * @role Owns item ownership: stack counts, item instances and perishable food batches.
 * @owns FoodBatch
 * @produces SaveItemInstance
 */
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
  /** Storage decay applied to perishable food while it sits here
   *  (plan items-player-002). 1.0× carried, 0.5× chest/household/settlement. */
  readonly decayModifier: number

  constructor(
    initial?: Partial<Record<ItemKind, number>>,
    maxWeight = DEFAULT_MAX_WEIGHT,
    initialInstances?: readonly ItemInstance[],
    initialFoodBatches?: Partial<Record<ItemKind, readonly FoodBatch[]>>,
    maxSize = Infinity,
    decayModifier = CARRIED_FOOD_DECAY,
  ) {
    this.baseMaxWeight = maxWeight
    this.maxSize = maxSize
    this.decayModifier = decayModifier
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
          .map((b) => normalizeFoodBatch(b, decayModifier))
        if (clamped.length > 0) this.foodBatches.set(kind, clamped)
      }
    }
    this.ensureFoodBatchCoverage()
  }

  /** Effective carry-weight limit: the constructor's base (for the player,
   *  the Strength-derived human body capacity) plus `carryCapacityBonus`
   *  summed over every currently-held unit that declares one (backpacks) —
   *  derived, never persisted. Computed on every access rather than cached
   *  so `add()`/`remove()` never have to remember to refresh it. Strength
   *  does not multiply these equipment bonuses. */
  get maxWeight(): number {
    let bonus = 0
    for (const [kind, n] of this.counts) {
      const perUnit = ITEM_CATALOG[kind].carryCapacityBonus
      if (perUnit) bonus += perUnit * n
    }
    return this.baseMaxWeight + bonus
  }

  /** Perishable counts without batches (old container/household snapshots)
   *  get a day-0 batch rather than a silently untracked stack. */
  private ensureFoodBatchCoverage(): void {
    for (const [kind, count] of this.counts) {
      if (!isFoodPerishable(kind) || count <= 0) continue
      const batches = this.foodBatches.get(kind) ?? []
      const covered = batches.reduce((sum, b) => sum + b.count, 0)
      if (covered >= count) continue
      batches.push(createFoodBatch(count - covered, 0, this.decayModifier, sourceSpeciesForMeatKind(kind)))
      this.foodBatches.set(kind, batches)
    }
  }

  private sortFifo(kind: ItemKind, batches: FoodBatch[], nowDays: number): void {
    const indexed = batches.map((batch, index) => ({ batch, index }))
    indexed.sort((a, b) => {
      const cmp = compareFoodBatchesFifo(kind, nowDays, a.batch, b.batch)
      return cmp !== 0 ? cmp : a.index - b.index
    })
    for (let i = 0; i < indexed.length; i++) batches[i] = indexed[i]!.batch
  }

  private addFoodBatch(kind: ItemKind, incoming: FoodBatch): void {
    const batch = cloneFoodBatch({ ...incoming, decayModifier: incoming.decayModifier })
    const batches = this.foodBatches.get(kind) ?? []
    const compatible = batches.find((b) => foodBatchesMergeEqual(b, batch))
    if (compatible) compatible.count += batch.count
    else batches.push(batch)
    this.foodBatches.set(kind, batches)
  }

  /** Removes `n` units FIFO by remaining effective shelf-life at `nowDays`.
   *  Returned batches are checkpointed at `nowDays` under this inventory's
   *  decay so a transfer can continue under the destination modifier. */
  private removeFoodBatch(kind: ItemKind, n: number, nowDays: number): FoodBatch[] {
    const consumed: FoodBatch[] = []
    const batches = this.foodBatches.get(kind)
    if (!batches || batches.length === 0) return consumed
    this.sortFifo(kind, batches, nowDays)
    let remaining = n
    while (remaining > 0 && batches.length > 0) {
      const first = batches[0]!
      const take = Math.min(first.count, remaining)
      consumed.push(checkpointFoodBatch({ ...cloneFoodBatch(first), count: take }, nowDays, this.decayModifier))
      first.count -= take
      remaining -= take
      if (first.count <= 0) batches.shift()
    }
    if (batches.length === 0) this.foodBatches.delete(kind)
    return consumed
  }

  /** Read-only snapshot of `kind`'s freshness batches, FIFO at `nowDays`. */
  getFoodBatches(kind: ItemKind, nowDays = 0): readonly FoodBatch[] {
    const batches = this.foodBatches.get(kind)
    if (!batches) return []
    const copy = batches.map(cloneFoodBatch)
    this.sortFifo(kind, copy, nowDays)
    return copy
  }

  /** The batch that would be consumed next at `nowDays`, or null. */
  fifoFoodBatch(kind: ItemKind, nowDays = 0): FoodBatch | null {
    return this.getFoodBatches(kind, nowDays)[0] ?? null
  }

  /** Acquisition day of the FIFO batch — kept for callers that only need
   *  the provenance timestamp of whatever would be used next. */
  oldestAcquiredAtDays(kind: ItemKind, nowDays = 0): number | null {
    return this.fifoFoodBatch(kind, nowDays)?.acquiredAtDays ?? null
  }

  /** Held liquid mass (plan items-player-001 §13, resolved now that content
   *  is real per-instance state) adds on top of a liquid container's own
   *  `ITEM_DEFS.weight` — a full 10 l bucket is meaningfully heavier than an
   *  empty one, not "faked away" by leaving `ITEM_DEFS.weight` static. */
  totalWeight(): number {
    let total = 0
    for (const [kind, n] of this.counts) total += ITEM_DEFS[kind].weight * n
    for (const instance of this.instances.values()) {
      total += ITEM_DEFS[instance.kind].weight
      if (isLiquidContainerInstance(instance)) total += instance.amountLitres * LIQUID_DENSITY_KG_PER_LITRE
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
   *  `app/createApp.ts`'s pickup handling). `acquiredAtDays` (plan 159 /
   *  items-player-002) is only recorded for perishable kinds; every other
   *  call site can omit it. New perishable units start at effective age 0
   *  under this inventory's storage decay. */
  add(kind: ItemKind, n = 1, acquiredAtDays?: number, sourceSpecies?: FoodSourceSpecies): boolean {
    if (!this.canAdd(kind, n)) return false
    this.counts.set(kind, this.count(kind) + n)
    if (isFoodPerishable(kind)) {
      const acquired = acquiredAtDays ?? 0
      this.addFoodBatch(kind, createFoodBatch(
        n,
        acquired,
        this.decayModifier,
        sourceSpecies ?? sourceSpeciesForMeatKind(kind),
      ))
    }
    return true
  }

  /** Receiving half of a food transfer: incoming batches are checkpointed
   *  onto this inventory's decay at `nowDays` (when provided) so a chest /
   *  household / settlement never silently continues a carried 1.0× clock.
   *  Falls back to plain `add()` when `batches` is empty. */
  addWithFreshness(kind: ItemKind, n: number, batches: readonly FoodBatch[], nowDays?: number): boolean {
    if (batches.length === 0) return this.add(kind, n, nowDays)
    if (!this.canAdd(kind, n)) return false
    this.counts.set(kind, this.count(kind) + n)
    if (isFoodPerishable(kind)) {
      for (const batch of batches) {
        const incoming = nowDays == null ? cloneFoodBatch(batch) : checkpointFoodBatch(batch, nowDays, this.decayModifier)
        this.addFoodBatch(kind, incoming)
      }
    }
    return true
  }

  /** Claiming half of a food transfer — FIFO at `nowDays`, returning
   *  checkpointed batches ready for `addWithFreshness` on the destination.
   *  `null` when there isn't `n` held; `[]` for a non-perishable kind. */
  removeWithFreshness(kind: ItemKind, n: number, nowDays = 0): readonly FoodBatch[] | null {
    const current = this.count(kind)
    if (current < n) return null
    this.counts.set(kind, current - n)
    return isFoodPerishable(kind) ? this.removeFoodBatch(kind, n, nowDays) : []
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

  /** The best held item satisfying `need` (plan npc-002), or null — the
   *  catalog-driven counterpart of `findWithCapability` for consumables, so
   *  NPC healing never hardcodes a specific item kind. "Best" is
   *  `CONSUMABLE_KINDS_BY_NEED`'s documented highest-relief-first order. */
  findConsumableForNeed(need: ConsumableNeed): ItemKind | null {
    for (const kind of CONSUMABLE_KINDS_BY_NEED[need]) {
      if (this.count(kind) > 0) return kind
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

  /** Atomic item recipe (settlements-npcs-003) — mirrors
   *  `EconomicStock.applyRecipe`'s all-or-nothing shape, but against this
   *  plain-item inventory instead of settlement stock: false and unchanged
   *  when any input is short, otherwise every input is removed and every
   *  output added. Generic — not arrow/hunter specific. */
  applyRecipe(inputs: readonly ItemAmount[], outputs: readonly ItemAmount[]): boolean {
    for (const { kind, amount } of inputs) {
      if (!this.has(kind, amount)) return false
    }
    for (const { kind, amount } of inputs) this.remove(kind, amount)
    for (const { kind, amount } of outputs) this.add(kind, amount)
    return true
  }

  remove(kind: ItemKind, n: number, nowDays = 0): boolean {
    const current = this.count(kind)
    if (current < n) return false
    this.counts.set(kind, current - n)
    if (isFoodPerishable(kind)) this.removeFoodBatch(kind, n, nowDays)
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

  /** Persists perishable kinds' batch provenance and lazy decay state. */
  foodBatchesToJSON(): Partial<Record<ItemKind, FoodBatch[]>> {
    const out: Partial<Record<ItemKind, FoodBatch[]>> = {}
    for (const [kind, batches] of this.foodBatches) {
      if (batches.length > 0) out[kind] = batches.map(cloneFoodBatch)
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
      if (isTrapKind(row.kind)) {
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
      if (isLiquidContainerKind(row.kind)) {
        const capacity = ITEM_CATALOG[row.kind].container?.capacityLiters ?? 0
        const rawLitres = typeof row.amountLitres === 'number' && Number.isFinite(row.amountLitres) ? row.amountLitres : 0
        const amountLitres = Math.max(0, Math.min(capacity, rawLitres))
        const liquid = amountLitres > 0 && (row.liquid === 'water' || row.liquid === 'milk') ? row.liquid : null
        const container: LiquidContainerItemInstance = {
          id: row.id,
          kind: row.kind,
          liquid,
          amountLitres: liquid ? amountLitres : 0,
        }
        out.push(container)
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
