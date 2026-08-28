import type { EconomicKind } from '../economy/kinds'
import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { SaveItemInstance } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import { EconomicStock } from '../economy/stock'
import { Inventory } from '../items/Inventory'

/**
 * NPC household resource layer (plan 069). One family/home has one
 * household; households sit between NPC carrying and `SettlementEconomy` —
 * see the implementation notes next to plan 069 for the ownership model.
 *
 * @domain settlements-npcs
 * @system household
 * @role Owns one family's own food/wood/water stock, between NPC carrying and `SettlementEconomy`.
 * @owns Household
 * @uses SettlementEconomy
 */
export type HouseholdId = string

/** Water stays source-based (well/`WaterSource`) for 069 — see plan 069
 *  implementation notes §9. Only food/wood become household stock — a
 *  household is a family pantry, not a village depot. Deliberately *not*
 *  derived from `EconomicKind` anymore (plan 131): `iron`/`coal`/`gold`
 *  are settlement-level raw resource stock and must not automatically
 *  become household-storable just because they're `EconomicKind`s. */
export type HouseholdResourceKind = 'food' | 'wood'

const INITIAL_HOUSEHOLD_STOCK: Record<string, number> = {
  water: 4,
  food: 3,
  wood: 2,
}

const INITIAL_HOUSEHOLD_RANDOM_OFFSET: Record<string, number> = {
  water: 3,
  food: 3,
  wood: 2,
}

const HOUSEHOLD_KINDS: readonly HouseholdResourceKind[] = ['food', 'wood']

type HouseholdPolicy = {
  /** Below this, the household has an urgent shortage. */
  minimum: number
  /** Below this, acquiring more is desirable but not urgent. */
  target: number
  /** Room runs out here — anything gathered beyond it should go to the
   *  settlement's shared stock instead (plan 069 §3: full limit is a
   *  sufficient signal, no separate "surplus" concept). */
  capacity: number
}

/** Deterministic constants, not an economic planner (plan 069 §14) —
 *  intentionally small so a household reads as a real family pantry, not a
 *  depot. */
const HOUSEHOLD_POLICY: Record<HouseholdResourceKind, HouseholdPolicy> = {
  food: { minimum: 1, target: 3, capacity: 7 },
  wood: { minimum: 1, target: 3, capacity: 5 },
}

/** Household water reserve (plan 122) — deliberately not an `EconomicKind`
 *  (implementation notes §4: no production/trade needs water yet). Same
 *  minimum/target/capacity shape as `HOUSEHOLD_POLICY` for consistency, but
 *  kept as its own small state instead of routing through `EconomicStock` —
 *  fed by `WaterBarrel`/well fetching, drained by NPC + animal drinking. One
 *  reserve backs both the `WaterBarrel` (NPC) and `AnimalTrough` (livestock)
 *  presentation props — implementation notes §5: one authoritative owner,
 *  not duplicated quantities. */
const WATER_POLICY: HouseholdPolicy = { minimum: 1, target: 3, capacity: 7 }

export type WaterReserve = {
  readonly current: number
  readonly capacity: number
  has: (amount: number) => boolean
  /** > 0 when below the urgent minimum. */
  shortage: () => number
  /** True while stock is below target (worth fetching, not urgent). */
  shouldFetch: () => boolean
  add: (amount: number) => void
  remove: (amount: number) => void
}

function createWaterReserve(initial: number): WaterReserve {
  let current = Math.min(WATER_POLICY.capacity, initial)
  return {
    get current() {
      return current
    },
    capacity: WATER_POLICY.capacity,
    has: (amount) => current >= amount,
    shortage: () => Math.max(0, WATER_POLICY.minimum - current),
    shouldFetch: () => current < WATER_POLICY.target,
    add: (amount) => {
      current = Math.min(WATER_POLICY.capacity, current + amount)
    },
    remove: (amount) => {
      current = Math.max(0, current - amount)
    },
  }
}

/** Plain-data carry snapshot — mirrors `SettlementEconomy.snapshot()`. Used
 *  to seed a freshly-constructed `HouseholdRegistry` across a `WorldBundle`
 *  rebuild (plan 197 §8), the same `initial*`/`serialize()` idiom
 *  `EconomyRegistry` already uses for the settlement-level stock it sits
 *  next to. Not part of `SaveData` — plan 197 scopes this to the confirmed
 *  in-session rebuild gap only, not full household persistence. */
export type HouseholdSnapshot = {
  stock: Partial<Record<HouseholdResourceKind, number>>
  water: number
  /** Generic item storage (plan 178) — arbitrary `ItemKind`s a household
   *  holds (hunted meat/hide, arrows, bandages, …), distinct from `stock`'s
   *  scalar food/wood economic counters. Optional so older in-session
   *  snapshots without it still hydrate (a fresh empty `Inventory`). */
  items?: { counts: Partial<Record<ItemKind, number>>, instances: readonly SaveItemInstance[] }
}

/** Household starting supply (plan 178 §11) — only ever seeded once, on a
 *  household's genuinely first construction, for a household containing a
 *  `hunter` (see `createSettlement.ts`'s `hasHunter` computation). Not a
 *  general household starting-item mechanism. */
const HUNTER_STARTING_BANDAGES = 5

export type Household = {
  readonly id: HouseholdId
  readonly settlementId: string
  /** The `Place.id` of this household's home. */
  readonly homeId: string
  readonly stock: EconomicStock
  /** Water reserve backing this household's `WaterBarrel`/`AnimalTrough`
   *  (plan 122) — separate from `stock` since water is not an `EconomicKind`. */
  readonly water: WaterReserve
  /** Generic item storage (plan 178) — reuses the same `Inventory` class as
   *  player/NPC carrying, unbounded weight/size (a house, not a backpack).
   *  Owns arbitrary discrete items (hunted meat/hide, crafted arrows,
   *  bandages) that `stock`'s scalar `EconomicStock` was deliberately never
   *  meant to represent (implementation notes §7 — do not add item-instance
   *  fields to `stock`, this is the generic seam for that instead). */
  readonly items: Inventory
  has: (kind: EconomicKind, amount: number) => boolean
  /** > 0 when stock is below the resource's minimum (urgent). */
  shortage: (kind: HouseholdResourceKind) => number
  /** True while stock is below the resource's target (worth acquiring, not urgent). */
  shouldAcquire: (kind: HouseholdResourceKind) => boolean
  /** > 0 when stock is above the resource's target — genuinely spare amount
   *  a helper NPC (plan 167) may deliver elsewhere without touching the
   *  household's own reserve. Distinct from `capacity` overflow (plan 069
   *  §3), which only ever matters at gather time. */
  surplus: (kind: HouseholdResourceKind) => number
  /**
   * Deposits gathered resource, capped at the household's capacity. Any
   * remainder is routed to `economy` when given, otherwise dropped — mirrors
   * plan 069 §3/§6 (full household -> village storage).
   */
  deposit: (kind: HouseholdResourceKind, amount: number, economy?: SettlementEconomy | null) => void
  snapshot: () => HouseholdSnapshot
}

export function householdIdFor(settlementId: string, familyIndex: number): HouseholdId {
  return `${settlementId}:household:${familyIndex}`
}

/** Same xor/FNV idiom as `economy/initial.ts`'s settlement seeding. */
function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic small starting reserve, jittered per household id so a
 *  settlement's households don't all start identical (same spirit as
 *  `economy/initial.ts`'s `initialStockFor`). */
function initialHouseholdStock(id: HouseholdId): Partial<Record<HouseholdResourceKind, number>> {
  const out: Partial<Record<HouseholdResourceKind, number>> = {}
  for (const kind of HOUSEHOLD_KINDS) {
    out[kind] = INITIAL_HOUSEHOLD_STOCK[kind] + (hashString(`${id}:${kind}`) % INITIAL_HOUSEHOLD_RANDOM_OFFSET[kind])
  }
  return out
}

export function createHousehold(
  id: HouseholdId,
  settlementId: string,
  homeId: string,
  /** Carried across a `WorldBundle` rebuild (plan 197 §8) — a genuinely new
   *  household (first-ever construction) gets the usual jittered starting
   *  reserve instead. */
  initial?: HouseholdSnapshot,
  /** True when this household contains a `hunter` member (plan 178 §11) —
   *  only consulted on a genuinely first construction (`!initial`), same as
   *  the jittered starting stock above; a carried household never re-seeds. */
  hasHunter = false,
): Household {
  const stock = new EconomicStock(initial?.stock ?? initialHouseholdStock(id))
  const water = createWaterReserve(
    initial?.water ?? INITIAL_HOUSEHOLD_STOCK.water + (hashString(`${id}:water`) % INITIAL_HOUSEHOLD_RANDOM_OFFSET.water),
  )
  const items = new Inventory(
    initial?.items?.counts,
    Infinity,
    initial?.items ? Inventory.instancesFromJSON(initial.items.instances) : undefined,
  )
  if (!initial && hasHunter) items.add('bandage', HUNTER_STARTING_BANDAGES)
  return {
    id,
    settlementId,
    homeId,
    stock,
    water,
    items,
    has: (kind, amount) => stock.has(kind, amount),
    shortage: (kind) => Math.max(0, HOUSEHOLD_POLICY[kind].minimum - stock.query(kind)),
    shouldAcquire: (kind) => stock.query(kind) < HOUSEHOLD_POLICY[kind].target,
    surplus: (kind) => Math.max(0, stock.query(kind) - HOUSEHOLD_POLICY[kind].target),
    deposit: (kind, amount, economy) => {
      if (amount <= 0) return
      const capacity = HOUSEHOLD_POLICY[kind].capacity
      const room = Math.max(0, capacity - stock.query(kind))
      const toHousehold = Math.min(amount, room)
      if (toHousehold > 0) stock.add(kind, toHousehold)
      const overflow = amount - toHousehold
      if (overflow > 0 && economy) economy.add(kind, overflow)
    },
    snapshot: () => ({
      stock: stock.toJSON(),
      water: water.current,
      items: { counts: items.toJSON(), instances: items.instancesToJSON() },
    }),
  }
}

/**
 * Per-manager household map (mirrors `economy/registry.ts`'s
 * `EconomyRegistry`). Lives on `SettlementsManager`, not per-`Settlement` —
 * streaming a settlement out/in must reuse the same households so stock
 * does not reset (plan 069 §22).
 */
export type HouseholdRegistry = {
  getOrCreate: (id: HouseholdId, settlementId: string, homeId: string, hasHunter?: boolean) => Household
  get: (id: HouseholdId) => Household | undefined
  clear: () => void
  /** Stock-only snapshot of every household created so far — see
   *  `HouseholdSnapshot`'s doc comment. */
  serialize: () => Record<HouseholdId, HouseholdSnapshot>
}

export function createHouseholdRegistry(initial?: Record<HouseholdId, HouseholdSnapshot>): HouseholdRegistry {
  const byId = new Map<HouseholdId, Household>()
  return {
    getOrCreate(id, settlementId, homeId, hasHunter) {
      const existing = byId.get(id)
      if (existing) return existing
      const created = createHousehold(id, settlementId, homeId, initial?.[id], hasHunter)
      byId.set(id, created)
      return created
    },
    get(id) {
      return byId.get(id)
    },
    clear() {
      byId.clear()
    },
    serialize() {
      const out: Record<HouseholdId, HouseholdSnapshot> = {}
      for (const [id, household] of byId) out[id] = household.snapshot()
      return out
    },
  }
}
