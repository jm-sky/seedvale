import type { HouseholdHistoryEvent } from '../debug/householdHistory'
import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { ItemKind } from '../items/items'
import { createSequenceAllocator } from '../debug/domainHistory'
import { createHouseholdHistoryBuffer } from '../debug/householdHistory'
import { STORED_FOOD_DECAY } from '../items/foodFreshness'
import {
  claimableWoodSurplusValue,
  householdWoodCountFromItems,
  householdWoodItemValue,
  type HouseholdWoodItemBatch,
  type HouseholdWoodItemKind,
  selectClaimableWoodItems,
} from './householdWood'
import { foodItemCount, skipBatchCount, takeBatchCount, takeOneFoodItem } from '../items/foodItems'
import { type FoodBatch, Inventory, type SaveItemInstance } from '../items/Inventory'

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

/** Amount kept in the household vs routed to settlement overflow — returned
 *  by `deposit` / `depositFood` (plan settlements-npcs-032). Units are
 *  household resource units (food item units or scalar wood). */
export type HouseholdDepositResult = {
  storedInHousehold: number
  overflowedToSettlement: number
}

/** Water stays source-based (well/`WaterSource`) for 069 — see plan 069
 *  implementation notes §9. `wood` stays household stock — a household is a
 *  family pantry, not a village depot. Deliberately *not* derived from
 *  `EconomicKind` anymore (plan 131): `iron`/`coal`/`gold` are
 *  settlement-level raw resource stock and must not automatically become
 *  household-storable just because they're `EconomicKind`s.
 *
 *  `food` stays part of this union for every existing shortage/surplus/
 *  exchange call site (plan settlements-npcs-008) — but, unlike `wood`, it is
 *  no longer backed by `stock`. `has`/`shortage`/`shouldAcquire`/`surplus`
 *  derive it from concrete food `ItemKind`s in `items` instead
 *  (`items/foodItems.ts`'s `foodItemCount`); see `deposit`/`depositFood`
 *  below for why the two kinds need separate mutation entry points. */
export type HouseholdResourceKind = 'food' | 'wood'

const INITIAL_HOUSEHOLD_WATER = 4
const INITIAL_HOUSEHOLD_WATER_RANDOM_OFFSET = 3

/** Starting branch count — same jittered magnitude the old scalar `stock.wood` used (plan settlements-npcs-034). */
const INITIAL_HOUSEHOLD_WOOD_BRANCHES = 2
const INITIAL_HOUSEHOLD_WOOD_BRANCH_RANDOM_OFFSET = 2

/** Starting concrete food (plan settlements-npcs-008) — same jittered
 *  magnitude the old scalar `stock.food` used, converted to a concrete item.
 *  `bread` is the existing "abstract food surplus, no specific producer
 *  kind" convention (see `NpcAgent.ts`'s `HELPER_DELIVERY_ITEM_KIND`),
 *  reused here rather than inventing a new starting-food mapping. */
const INITIAL_HOUSEHOLD_FOOD_KIND: ItemKind = 'bread'
const INITIAL_HOUSEHOLD_FOOD: Record<string, number> = {
  food: 3,
}
const INITIAL_HOUSEHOLD_FOOD_RANDOM_OFFSET: Record<string, number> = {
  food: 3,
}

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
 *  depot. `food`'s thresholds are concrete food-item unit counts since plan
 *  settlements-npcs-008 (same numbers, new meaning). */
const HOUSEHOLD_POLICY: Record<HouseholdResourceKind, HouseholdPolicy> = {
  food: { minimum: 1, target: 3, capacity: 7 },
  wood: { minimum: 1, target: 3, capacity: 20 },
}

/** Reserve target for wood surplus/claim (branch-equivalent units). */
export const HOUSEHOLD_WOOD_RESERVE_TARGET = HOUSEHOLD_POLICY.wood.target

/** Household water reserve (plan 122) — deliberately not an `EconomicKind`
 *  (implementation notes §4: no production/trade needs water yet). Same
 *  minimum/target/capacity shape as `HOUSEHOLD_POLICY` for consistency, but
 *  kept as its own small state instead of routing through `EconomicStock` —
 *  fed by `WaterBarrel`/well fetching, drained by NPC + animal drinking. One
 *  reserve backs both the `WaterBarrel` (NPC) and `AnimalTrough` (livestock)
 *  presentation props — implementation notes §5: one authoritative owner,
 *  not duplicated quantities. */
const WATER_POLICY: HouseholdPolicy = { minimum: 1, target: 3, capacity: 7 }

/** Temporary renewable hay source (plan fauna-010 §6) — a placeholder for
 *  the eventual `grass/crop → cutting → drying → hay` pipeline, kept as a
 *  small per-household lazy trickle so herbivore diet/household-feed (§7)
 *  has something real to consume today without any NPC labor (explicitly
 *  out of scope for this plan) or new player-interaction plumbing. Resolved
 *  lazily against `nowDays` whenever a hungry herbivore's `findDietTarget()`
 *  checks its household's pantry (`AnimalAgent.ts`) — never a per-frame
 *  timer — so it survives streaming/reload/time-skip for free, the same
 *  "resolve on next query" idiom as `livestockProduction.ts`. Swapping this
 *  out later for real cutting/drying only ever touches this constant/
 *  function pair, never `hay` itself, animal diet, or the consumption path. */
const HAY_SOURCE_MAX_PORTIONS_PER_DAY = 4
/** In-game days between one portion becoming available and the next — small
 *  enough that a full day's 4 portions actually spread out instead of all
 *  landing on the very first query of the day. */
const HAY_SOURCE_PORTION_INTERVAL_DAYS = 0.2
const HAY_SOURCE_ITEM_KIND: ItemKind = 'hay'

export type HayForageState = {
  /** Absolute `elapsedDays` anchor the next portion becomes available at. */
  nextPortionAtDays: number
  /** Portions already granted since `dayAnchor`'s calendar day. */
  portionsToday: number
  /** `elapsedDays` the current day's count started counting from — reset
   *  (with `portionsToday`) whenever `nowDays` crosses into a new day. */
  dayAnchor: number
}

/** Pure resolver (plan fauna-010 §6) — given the current state and
 *  `nowDays`, returns the advanced state plus how many hay portions became
 *  newly available. Unit-testable without a `Household` instance, same
 *  technique as `livestockProduction.ts`'s pure day-anchor math. A day
 *  rollover resets the daily counter before granting; grants are capped at
 *  `HAY_SOURCE_MAX_PORTIONS_PER_DAY` even after a very large time skip. */
export function resolveHayForage(state: HayForageState, nowDays: number): { state: HayForageState, portionsGranted: number } {
  let { nextPortionAtDays, portionsToday, dayAnchor } = state
  if (Math.floor(nowDays) !== Math.floor(dayAnchor)) {
    portionsToday = 0
    dayAnchor = nowDays
  }
  let portionsGranted = 0
  while (portionsToday < HAY_SOURCE_MAX_PORTIONS_PER_DAY && nowDays >= nextPortionAtDays) {
    portionsToday += 1
    portionsGranted += 1
    nextPortionAtDays += HAY_SOURCE_PORTION_INTERVAL_DAYS
  }
  return { state: { nextPortionAtDays, portionsToday, dayAnchor }, portionsGranted }
}

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
 *  rebuild (plan 197 §8) and persisted in `SaveData.households` (sparse/
 *  optional), the same `initial*`/`serialize()` idiom `EconomyRegistry`
 *  already uses for the settlement-level stock it sits next to. */
export type HouseholdAgricultureState = {
  /** True once starter seeds have been evaluated (granted or ineligible).
   *  Distinct from "currently holding zero seeds" — depletion is a valid
   *  later state and must not re-trigger bootstrap. */
  starterSeedsGranted: boolean
  /** World-day the last agricultural resolve (detailed handoff or aggregate
   *  catch-up) closed at. Absent means this household has never been
   *  resolved; catch-up then treats elapsed as 0 rather than the whole
   *  world history. */
  lastResolvedAtDays?: number
}

export type HouseholdSnapshot = {
  water: number
  /** Generic item storage (plan 178) — arbitrary `ItemKind`s a household
   *  holds (hunted meat/hide, arrows, bandages, …), distinct from `stock`'s
   *  scalar food/wood economic counters. Optional so older in-session
   *  snapshots without it still hydrate (a fresh empty `Inventory`). */
  items?: {
    counts: Partial<Record<ItemKind, number>>
    instances: readonly SaveItemInstance[]
    foodBatches?: Partial<Record<ItemKind, readonly FoodBatch[]>>
  }
  /** Temporary hay-source lazy anchor (plan fauna-010 §6) — optional so an
   *  older in-session snapshot without it still hydrates (a fresh source
   *  starting from day 0, same "missing means default" contract `items`
   *  above already uses). */
  hayForage?: HayForageState
  /** One-time starter-seed marker + off-screen catch-up anchor (plan
   *  settlements-npcs-030). Optional so older snapshots still hydrate. */
  agriculture?: HouseholdAgricultureState
}

/** Profession-derived starting items (plan 178 hunter bandages, plan
 *  settlements-npcs-030 farmer seeds). Applied at first construction, and
 *  once more for a pre-plan household whose agriculture marker is still
 *  unresolved. Never a general profession-resource registry. */
export type HouseholdStartingContext = {
  /** Any hunter member, including children — same rule as the pre-plan
   *  `hasHunter` boolean. Agricultural capacity uses adult workforce; this
   *  flag must not. */
  hasHunter?: boolean
  adultFarmerCount?: number
}

const HUNTER_STARTING_BANDAGES = 5
export const FARMER_STARTING_SEED_COUNT = 2
const FARMER_STARTING_SEED_KINDS: readonly ItemKind[] = ['seed_carrot', 'seed_potato', 'seed_cabbage']

export type Household = {
  readonly id: HouseholdId
  readonly settlementId: string
  /** The `Place.id` of this household's home. */
  readonly homeId: string
  /** Water reserve backing this household's `WaterBarrel`/`AnimalTrough`
   *  (plan 122) — separate from `stock` since water is not an `EconomicKind`. */
  readonly water: WaterReserve
  /** Generic item storage (plan 178) — reuses the same `Inventory` class as
   *  player/NPC carrying, unbounded weight/size (a house, not a backpack).
   *  Owns arbitrary discrete items (hunted meat/hide, crafted arrows,
   *  bandages, and — since plan settlements-npcs-008 — every concrete food
   *  `ItemKind` too, the sole authoritative food store). */
  readonly items: Inventory
  has: (kind: HouseholdResourceKind, amount: number) => boolean
  /** > 0 when stock is below the resource's minimum (urgent). */
  shortage: (kind: HouseholdResourceKind) => number
  /** True while stock is below the resource's target (worth acquiring, not urgent). */
  shouldAcquire: (kind: HouseholdResourceKind) => boolean
  /** > 0 when stock is above the resource's target — genuinely spare amount
   *  a helper NPC (plan 167) may deliver elsewhere without touching the
   *  household's own reserve. Distinct from `capacity` overflow (plan 069
   *  §3), which only ever matters at gather time. */
  surplus: (kind: HouseholdResourceKind) => number
  /** Total branch-equivalent wood held as concrete `branch` / `beam` items. */
  woodCount: () => number
  /**
   * Deposits whole wood items, capped at household capacity (branch-equivalent).
   * Overflow converts to settlement bulk (`branch`→1, `beam`→2 wood). Drops overflow
   * when no `economy` is given.
   *
   * @domain settlements-npcs
   */
  depositWood: (
    itemKind: HouseholdWoodItemKind,
    amount: number,
    economy?: SettlementEconomy | null,
    simTime?: number,
  ) => HouseholdDepositResult
  /** Room for more wood in branch-equivalent units (whole items only at deposit). */
  woodRoom: () => number
  /** Claims up to `maxValue` surplus wood as whole items; returns value removed. */
  claimWoodSurplus: (maxValue: number) => number
  /** Like `claimWoodSurplus`, but returns the concrete item batch removed. */
  claimWoodSurplusBatch: (maxValue: number) => HouseholdWoodItemBatch[]
  /** Concrete-food counterpart of `deposit` — same capacity-cap/overflow
   *  shape, gathered/received food lands as `itemKind` units in `items`. */
  /** Concrete-food counterpart of `deposit` — same capacity-cap/overflow
   *  shape, gathered/received food lands as `itemKind` units in `items`.
   *  `batches` preserves provenance on a transfer; omit for newly produced food. */
  depositFood: (
    itemKind: ItemKind,
    amount: number,
    economy?: SettlementEconomy | null,
    simTime?: number,
    batches?: readonly FoodBatch[],
  ) => HouseholdDepositResult
  /** Removes exactly one concrete food item (deterministic kind order, see
   *  `items/foodItems.ts`) — the "eat one unit" primitive every consumption
   *  path uses instead of the old `stock.remove('food', 1)`. */
  takeFood: (simTime?: number) => ItemKind | null
  /** Total concrete food-item units currently held — the authoritative
   *  replacement for the old `stock.query('food')`. */
  foodCount: () => number
  /** Lazily resolves the temporary hay source (plan fauna-010 §6) and
   *  deposits any newly-available portions straight into `items` — call
   *  with the live `nowDays` right before reading household feed
   *  eligibility (`AnimalAgent.findDietTarget`); a no-op call costs one
   *  cheap pure comparison. */
  resolveHayForage: (nowDays: number) => void
  snapshot: () => HouseholdSnapshot
  /** Bounded household-level mutation history (plan settlements-npcs-013) —
   *  see `debug/householdHistory.ts`. Distinct from the NPC trace: this is
   *  the household-owned side effect, not the NPC's own decision/action
   *  record. */
  history: () => readonly HouseholdHistoryEvent[]
  /** World-day the last agricultural resolve closed at, if any. */
  agricultureLastResolvedAtDays: () => number | undefined
  /** Closes the current agricultural interval at `nowDays` without producing. */
  markAgricultureResolved: (nowDays: number) => void
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

function initialHouseholdWoodBranches(id: HouseholdId): number {
  return INITIAL_HOUSEHOLD_WOOD_BRANCHES
    + (hashString(`${id}:wood`) % INITIAL_HOUSEHOLD_WOOD_BRANCH_RANDOM_OFFSET)
}

function legacyWoodBranchesFromSnapshot(initial?: HouseholdSnapshot): number {
  const legacy = (initial as { stock?: { wood?: number } } | undefined)?.stock?.wood
  if (typeof legacy !== 'number' || !Number.isFinite(legacy) || legacy <= 0) return 0
  return Math.floor(legacy)
}

/** Deterministic small starting concrete food, jittered per household id —
 *  same magnitude/spirit as `initialHouseholdStock`, converted to
 *  `INITIAL_HOUSEHOLD_FOOD_KIND` units (plan settlements-npcs-008). */
function initialHouseholdFoodCounts(id: HouseholdId): Partial<Record<ItemKind, number>> {
  const amount =
    INITIAL_HOUSEHOLD_FOOD.food + (hashString(`${id}:food`) % INITIAL_HOUSEHOLD_FOOD_RANDOM_OFFSET.food)
  return amount > 0 ? { [INITIAL_HOUSEHOLD_FOOD_KIND]: amount } : {}
}

export function createHousehold(
  id: HouseholdId,
  settlementId: string,
  homeId: string,
  /** Carried across a `WorldBundle` rebuild (plan 197 §8) — a genuinely new
   *  household (first-ever construction) gets the usual jittered starting
   *  reserve instead. */
  initial?: HouseholdSnapshot,
  /** Profession-derived starting items. Consulted on first construction and
   *  on a restored household whose agriculture starter marker is still
   *  unresolved. A fully bootstrapped snapshot never re-seeds. */
  starting?: HouseholdStartingContext,
): Household {
  const water = createWaterReserve(
    initial?.water ?? INITIAL_HOUSEHOLD_WATER + (hashString(`${id}:water`) % INITIAL_HOUSEHOLD_WATER_RANDOM_OFFSET),
  )
  const initialItemCounts: Partial<Record<ItemKind, number>> = initial?.items?.counts
    ? { ...initial.items.counts }
    : (initial ? {} : { ...initialHouseholdFoodCounts(id), branch: initialHouseholdWoodBranches(id) })
  if (initial) {
    const legacyWood = legacyWoodBranchesFromSnapshot(initial)
    if (legacyWood > 0) initialItemCounts.branch = (initialItemCounts.branch ?? 0) + legacyWood
  }
  const items = new Inventory(
    Object.keys(initialItemCounts).length > 0 ? initialItemCounts : undefined,
    Infinity,
    initial?.items ? Inventory.instancesFromJSON(initial.items.instances) : undefined,
    initial?.items?.foodBatches,
    Infinity,
    STORED_FOOD_DECAY,
  )
  let hayForage: HayForageState = initial?.hayForage ?? { nextPortionAtDays: 0, portionsToday: 0, dayAnchor: 0 }
  let agriculture: HouseholdAgricultureState = initial?.agriculture
    ? {
      starterSeedsGranted: initial.agriculture.starterSeedsGranted,
      lastResolvedAtDays: initial.agriculture.lastResolvedAtDays,
    }
    : { starterSeedsGranted: false }

  if (!initial && starting?.hasHunter) items.add('bandage', HUNTER_STARTING_BANDAGES)
  if (!agriculture.starterSeedsGranted && (!initial || starting)) {
    if ((starting?.adultFarmerCount ?? 0) > 0) {
      for (const kind of FARMER_STARTING_SEED_KINDS) items.add(kind, FARMER_STARTING_SEED_COUNT)
    }
    agriculture = { ...agriculture, starterSeedsGranted: true }
  }

  // Domain history (plan settlements-npcs-013) — bounded ring + local
  // sequence counter, recorded only at this household's own mutation
  // methods below. `shortageOf` is pulled out so the shortage-crossing
  // detection in `deposit`/`depositFood`/`takeFood` can call the exact same
  // formula the public `shortage` property exposes.
  const historyBuf = createHouseholdHistoryBuffer()
  const seq = createSequenceAllocator()
  const woodPolicy = HOUSEHOLD_POLICY.wood

  function woodCount(): number {
    return householdWoodCountFromItems(items)
  }

  function woodRoom(): number {
    return Math.max(0, woodPolicy.capacity - woodCount())
  }

  function shortageOf(kind: HouseholdResourceKind): number {
    return kind === 'food'
      ? Math.max(0, HOUSEHOLD_POLICY.food.minimum - foodItemCount(items))
      : Math.max(0, woodPolicy.minimum - woodCount())
  }

  function overflowWoodToEconomy(
    itemKind: HouseholdWoodItemKind,
    count: number,
    economy: SettlementEconomy | null | undefined,
    simTime: number,
  ): number {
    if (count <= 0) return 0
    const perItem = householdWoodItemValue(itemKind) ?? 0
    const value = perItem * count
    if (value > 0 && economy) economy.add('wood', value, simTime)
    return value
  }

  return {
    id,
    settlementId,
    homeId,
    water,
    items,
    has: (kind, amount) =>
      kind === 'food' ? foodItemCount(items) >= amount : woodCount() >= amount,
    shortage: shortageOf,
    shouldAcquire: (kind) =>
      kind === 'food' ? foodItemCount(items) < HOUSEHOLD_POLICY.food.target : woodCount() < woodPolicy.target,
    surplus: (kind) =>
      kind === 'food'
        ? Math.max(0, foodItemCount(items) - HOUSEHOLD_POLICY.food.target)
        : claimableWoodSurplusValue(items, woodPolicy.target),
    woodCount,
    woodRoom,
    claimWoodSurplusBatch: (maxValue) => {
      if (maxValue <= 0) return []
      const batch = selectClaimableWoodItems(
        items,
        woodPolicy.target,
        Math.min(maxValue, claimableWoodSurplusValue(items, woodPolicy.target)),
      )
      for (const { kind, count } of batch) {
        if (!items.remove(kind, count)) return []
      }
      return batch
    },
    claimWoodSurplus: (maxValue) => {
      const batch = selectClaimableWoodItems(
        items,
        woodPolicy.target,
        Math.min(maxValue, claimableWoodSurplusValue(items, woodPolicy.target)),
      )
      if (batch.length === 0) return 0
      for (const { kind, count } of batch) {
        if (!items.remove(kind, count)) return 0
      }
      return batch.reduce((sum, { kind, count }) => sum + count * (householdWoodItemValue(kind) ?? 0), 0)
    },
    depositWood: (itemKind, amount, economy, simTime = 0) => {
      if (amount <= 0) return { storedInHousehold: 0, overflowedToSettlement: 0 }
      const before = shortageOf('wood')
      const perItem = householdWoodItemValue(itemKind)
      if (perItem == null) return { storedInHousehold: 0, overflowedToSettlement: 0 }
      let storedValue = 0
      let overflowValue = 0
      for (let i = 0; i < amount; i++) {
        if (woodCount() + perItem <= woodPolicy.capacity) {
          items.add(itemKind, 1, simTime)
          storedValue += perItem
        } else {
          overflowValue += overflowWoodToEconomy(itemKind, 1, economy, simTime)
        }
      }
      historyBuf.record({ simTime, seq: seq.next(), type: 'wood.deposited', amount: storedValue, overflowed: overflowValue })
      if (before > 0 && shortageOf('wood') === 0) {
        historyBuf.record({ simTime, seq: seq.next(), type: 'shortage.resolved', kind: 'wood' })
      }
      return { storedInHousehold: storedValue, overflowedToSettlement: overflowValue }
    },
    depositFood: (itemKind, amount, economy, simTime = 0, batches) => {
      if (amount <= 0) return { storedInHousehold: 0, overflowedToSettlement: 0 }
      const before = shortageOf('food')
      const capacity = HOUSEHOLD_POLICY.food.capacity
      const room = Math.max(0, capacity - foodItemCount(items))
      const toHousehold = Math.min(amount, room)
      if (toHousehold > 0) {
        if (batches && batches.length > 0) items.addWithFreshness(itemKind, toHousehold, takeBatchCount(batches, toHousehold), simTime)
        else items.add(itemKind, toHousehold, simTime)
      }
      const overflow = amount - toHousehold
      if (overflow > 0 && economy) {
        const overflowBatches = batches && batches.length > 0 ? skipBatchCount(batches, toHousehold) : undefined
        economy.depositFood(itemKind, overflow, simTime, overflowBatches)
      }
      historyBuf.record({ simTime, seq: seq.next(), type: 'food.deposited', itemKind, amount: toHousehold, overflowed: overflow })
      if (before > 0 && shortageOf('food') === 0) {
        historyBuf.record({ simTime, seq: seq.next(), type: 'shortage.resolved', kind: 'food' })
      }
      return { storedInHousehold: toHousehold, overflowedToSettlement: overflow }
    },
    takeFood: (simTime = 0) => {
      const before = shortageOf('food')
      const kind = takeOneFoodItem(items, simTime)
      if (kind) {
        historyBuf.record({ simTime, seq: seq.next(), type: 'food.taken', itemKind: kind })
        const after = shortageOf('food')
        if (before === 0 && after > 0) {
          historyBuf.record({ simTime, seq: seq.next(), type: 'shortage.detected', kind: 'food', amount: after })
        }
      }
      return kind
    },
    foodCount: () => foodItemCount(items),
    resolveHayForage: (nowDays) => {
      const result = resolveHayForage(hayForage, nowDays)
      hayForage = result.state
      if (result.portionsGranted > 0) items.add(HAY_SOURCE_ITEM_KIND, result.portionsGranted)
    },
    snapshot: () => ({
      water: water.current,
      items: {
        counts: items.toJSON(),
        instances: items.instancesToJSON(),
        foodBatches: items.foodBatchesToJSON(),
      },
      hayForage,
      agriculture: { ...agriculture },
    }),
    history: () => historyBuf.history(),
    agricultureLastResolvedAtDays: () => agriculture.lastResolvedAtDays,
    markAgricultureResolved: (nowDays) => {
      agriculture = { ...agriculture, lastResolvedAtDays: nowDays }
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
  getOrCreate: (id: HouseholdId, settlementId: string, homeId: string, starting?: HouseholdStartingContext) => Household
  get: (id: HouseholdId) => Household | undefined
  clear: () => void
  /** Stock-only snapshot of every household created so far — see
   *  `HouseholdSnapshot`'s doc comment. */
  serialize: () => Record<HouseholdId, HouseholdSnapshot>
}

export function createHouseholdRegistry(initial?: Record<HouseholdId, HouseholdSnapshot>): HouseholdRegistry {
  const byId = new Map<HouseholdId, Household>()
  return {
    getOrCreate(id, settlementId, homeId, starting) {
      const existing = byId.get(id)
      if (existing) return existing
      const created = createHousehold(id, settlementId, homeId, initial?.[id], starting)
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
