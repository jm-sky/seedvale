import type { EconomicKind } from '../economy/kinds'
import type { SettlementEconomy } from '../economy/settlementEconomy'
import { EconomicStock } from '../economy/stock'

/**
 * NPC household resource layer (plan 069). One family/home has one
 * household; households sit between NPC carrying and `SettlementEconomy` —
 * see the implementation notes next to plan 069 for the ownership model.
 */
export type HouseholdId = string

/** Water stays source-based (well/`WaterSource`) for 069 — see plan 069
 *  implementation notes §9. Only food/wood become household stock. */
export type HouseholdResourceKind = Exclude<EconomicKind, 'water'>

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
  food: { minimum: 1, target: 3, capacity: 5 },
  wood: { minimum: 1, target: 3, capacity: 5 },
}

export type Household = {
  readonly id: HouseholdId
  readonly settlementId: string
  /** The `Place.id` of this household's home. */
  readonly homeId: string
  readonly stock: EconomicStock
  has: (kind: EconomicKind, amount: number) => boolean
  /** > 0 when stock is below the resource's minimum (urgent). */
  shortage: (kind: HouseholdResourceKind) => number
  /** True while stock is below the resource's target (worth acquiring, not urgent). */
  shouldAcquire: (kind: HouseholdResourceKind) => boolean
  /**
   * Deposits gathered resource, capped at the household's capacity. Any
   * remainder is routed to `economy` when given, otherwise dropped — mirrors
   * plan 069 §3/§6 (full household -> village storage).
   */
  deposit: (kind: HouseholdResourceKind, amount: number, economy?: SettlementEconomy | null) => void
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
    out[kind] = 1 + (hashString(`${id}:${kind}`) % 2)
  }
  return out
}

export function createHousehold(id: HouseholdId, settlementId: string, homeId: string): Household {
  const stock = new EconomicStock(initialHouseholdStock(id))
  return {
    id,
    settlementId,
    homeId,
    stock,
    has: (kind, amount) => stock.has(kind, amount),
    shortage: (kind) => Math.max(0, HOUSEHOLD_POLICY[kind].minimum - stock.query(kind)),
    shouldAcquire: (kind) => stock.query(kind) < HOUSEHOLD_POLICY[kind].target,
    deposit: (kind, amount, economy) => {
      if (amount <= 0) return
      const capacity = HOUSEHOLD_POLICY[kind].capacity
      const room = Math.max(0, capacity - stock.query(kind))
      const toHousehold = Math.min(amount, room)
      if (toHousehold > 0) stock.add(kind, toHousehold)
      const overflow = amount - toHousehold
      if (overflow > 0 && economy) economy.add(kind, overflow)
    },
  }
}

/**
 * Per-manager household map (mirrors `economy/registry.ts`'s
 * `EconomyRegistry`). Lives on `SettlementsManager`, not per-`Settlement` —
 * streaming a settlement out/in must reuse the same households so stock
 * does not reset (plan 069 §22).
 */
export type HouseholdRegistry = {
  getOrCreate: (id: HouseholdId, settlementId: string, homeId: string) => Household
  get: (id: HouseholdId) => Household | undefined
  clear: () => void
}

export function createHouseholdRegistry(): HouseholdRegistry {
  const byId = new Map<HouseholdId, Household>()
  return {
    getOrCreate(id, settlementId, homeId) {
      const existing = byId.get(id)
      if (existing) return existing
      const created = createHousehold(id, settlementId, homeId)
      byId.set(id, created)
      return created
    },
    get(id) {
      return byId.get(id)
    },
    clear() {
      byId.clear()
    },
  }
}
