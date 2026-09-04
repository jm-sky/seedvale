import type { ItemKind } from '../items/items'
import type { HeightSampler } from '../player/PlayerController'
import type { Household, HouseholdResourceKind } from '../settlement/household'
import type { HouseholdExchangeHooks } from '../settlement/householdExchange'
import type { SettlementLandmarks } from '../settlement/props'
import type { HelperDeliveryHooks } from '../world/helperDeliveryHooks'
import type { HelperAssignment } from './helperAssignment'
import type { ActionId, NpcPlannedAction } from './npcAction'
import {
  claimEconomySurplus,
  claimHouseholdSurplus,
  commitWoodcutterDeposit,
  type SettlementEconomy,
  tryAdvanceDevelopment,
} from '../economy'
import { carryFoodClaim, claimFoodItems, deliverCarriedFoodClaim, type FoodItemClaim } from '../items/foodItems'
import { Inventory } from '../items/Inventory'
import { settlementStorageDestination } from '../settlement/storageDestinations'
import { copyVec3, type Vec3 } from '../simulation'
import { FOOD_THRESHOLD_NORMAL, type NeedState, relieveNeed } from './Needs'

/**
 * Owns the "claim at a source → carry → deposit at a destination" two-leg
 * pattern (review 2026-09-03 §5 E3) that used to be written out seven times
 * across `NpcAgent`'s economy-withdraw/household-exchange/player-storage
 * flows. Composes the existing owners
 * (`economy/localExchange.ts`, `items/foodItems.ts`,
 * `settlement/storageDestinations.ts`, `settlement/householdExchange.ts`) —
 * it does not re-implement claims.
 */

/** Local resource exchange (plan settlements-npcs-005) — the amount a single
 *  shortage-resupply trip tries to bring home in one go, whether the source
 *  is `SettlementEconomy` village storage or another household's surplus.
 *  Same order of magnitude as each kind's own `target` in `household.ts`'s
 *  `HOUSEHOLD_POLICY` (not exported) — a resupply tops the household up
 *  toward its usual comfortable level, not a full village/neighbour drain in
 *  one visit. */
export const HOUSEHOLD_EXCHANGE_MAX_TRANSFER: Record<HouseholdResourceKind, number> = { food: 3, wood: 3 }

/** Helper resource delivery (plan 167) — the concrete `ItemKind` a
 *  household's real (mixed-kind, since plan settlements-npcs-008) food
 *  surplus is presented as while carried/deposited into a player `Container`,
 *  rather than the exact mixed kinds actually claimed. `bread` already exists
 *  as a plain, non-species-specific staple (catalog notes: "prepared for
 *  future/emergency use"), so this reuses it rather than widening
 *  `HelperDeliveryHooks.deposit` to a per-kind list. One trip moves at most
 *  `HELPER_DELIVERY_MAX_CARRY` units — comfortably under
 *  `NPC_CARRY_MAX_WEIGHT` alongside this NPC's role weapon. */
export const HELPER_DELIVERY_ITEM_KIND: ItemKind = 'bread'
export const HELPER_DELIVERY_MAX_CARRY = 3

/** Household item kinds a completed hunt delivers home (plan §6/§7) — meat +
 *  hide only; equipment (bow/arrows/knife) stays with the hunter. */
export const HUNT_YIELD_KINDS: readonly ItemKind[] = [
  'raw_meat', 'deer_meat', 'wolf_meat', 'boar_meat', 'rabbit_meat', 'beef', 'hide',
]

/** Household resource flow (plan 069). `WOOD_HARVEST_AMOUNT` mirrors the old
 *  settlement-only wood yield now flowing through a household first;
 *  `FOOD_GATHER_AMOUNT` is the abstract garden-gather equivalent. */
const FOOD_GATHER_AMOUNT = 2

/** Shared inputs every logistics planner reads. Built fresh by `NpcAgent`
 *  right before calling a planner — `simTime` is a getter, not a captured
 *  number, so an `onComplete` closure that runs later (once the action
 *  completes) reads the NPC's *current* sim clock, matching what the
 *  pre-extraction inline closures did by capturing `this` (review §10 R3). */
export type NpcLogisticsCtx = {
  household: Household | null
  economy: SettlementEconomy | null
  householdExchange: HouseholdExchangeHooks | null
  helperDelivery: HelperDeliveryHooks | null
  helperAssignment: HelperAssignment | null
  needs: NeedState
  home: Vec3
  landmarks: SettlementLandmarks
  carried: Inventory
  waitMultiplier: number
  simTime: () => number
  sampleHeight: HeightSampler
}

/** Chop → deposit completion, household-aware. A household caps how much of
 *  the harvest it keeps (see `Household.deposit`); anything over that still
 *  reaches the settlement economy, so `tryAdvanceDevelopment` (woodshed)
 *  keeps working the same way it did before households existed. No
 *  household (isolated fallback) reproduces the old settlement-only path.
 *  `amount` is 0 when the chop step's `harvestWorldTreeFully` call failed
 *  (tree already harvested by someone else, etc., plan 131) — a no-op guard
 *  so a failed harvest never still mints wood at deposit time. */
export function depositWoodHarvest(household: Household | null, economy: SettlementEconomy | null, amount: number, simTime: number): void {
  if (amount <= 0) return
  if (household) {
    household.deposit('wood', amount, economy, simTime)
    if (economy) tryAdvanceDevelopment(economy)
  } else if (economy) {
    commitWoodcutterDeposit(economy)
  }
}

/** Garden visit gathers a small amount of food into the household (capped,
 *  overflow to the settlement economy) before the NPC eats from it — the
 *  personal-need equivalent of `depositWoodHarvest`. No-op without a
 *  household (isolated fallback) — matches the pre-069 behaviour where
 *  eating did not touch any resource pool. The abstract garden gather has no
 *  producer-known `ItemKind` (plan settlements-npcs-008 §5 — this is
 *  deliberately *not* a real crop/hunt/fish yield), so it reuses
 *  `HELPER_DELIVERY_ITEM_KIND`'s existing "abstract food, no specific
 *  producer kind" convention rather than inventing a new mapping. */
export function depositFoodHarvest(household: Household | null, economy: SettlementEconomy | null, simTime: number): void {
  household?.depositFood(HELPER_DELIVERY_ITEM_KIND, FOOD_GATHER_AMOUNT, economy, simTime)
}

/** Generic carried-item → household-item-storage delivery (plan 178 §6/§7,
 *  generalized for settlements-npcs-002 §12 rather than adding a
 *  per-profession `depositFish()`/`depositTraderGoods()`): moves every one of
 *  `kinds` from `carried` into the household's generic item storage. Unlike
 *  `depositWoodHarvest`/`depositFoodHarvest` there's no capacity cap/economy
 *  overflow here: `Household.items` (an `Inventory`, not `EconomicStock`) is
 *  unbounded, same as any other physical storage building. Used by the
 *  hunter's meat/hide delivery and the fisher's fish delivery alike. */
export function depositCarriedItems(carried: Inventory, household: Household, kinds: readonly ItemKind[]): void {
  for (const kind of kinds) {
    const n = carried.count(kind)
    if (n <= 0) continue
    carried.remove(kind, n)
    household.items.add(kind, n)
  }
}

/** Applies the same per-kind need relief `beginNeed`'s existing branches
 *  already use on a successful local-exchange resupply (plan
 *  settlements-npcs-005) — `food` also consumes one unit right away (the
 *  NPC eats from what it just brought home, mirroring
 *  `beginRealFoodGathering`/the abstract garden-gather fallback); `wood`'s
 *  `woodDuty` is a household chore, not personal consumption, so only the
 *  duty pressure itself eases. */
export function satisfyHouseholdResourceNeed(needs: NeedState, household: Household, kind: HouseholdResourceKind, simTime: number): void {
  if (kind === 'food') {
    household.takeFood(simTime)
    relieveNeed(needs, 'food')
  } else {
    relieveNeed(needs, 'wood')
  }
}

/** The `goTo`(pickup) → `execute` → `next: deposit` shape shared by every
 *  claim/carry/deposit flow below (review §5 E3) — same `1.2` claim /
 *  `0.8` deposit `waitMultiplier`-scaled durations every hand-written copy
 *  used. */
export type ResourceTransferPlan = {
  pickupKind: ActionId
  pickup: Vec3
  deposit: Vec3
  onPickup: () => void
  onDeposit: () => void
}

export function buildTransferAction(plan: ResourceTransferPlan, waitMultiplier: number): NpcPlannedAction {
  return {
    kind: plan.pickupKind,
    destination: plan.pickup,
    durationSec: 1.2 * waitMultiplier,
    onComplete: plan.onPickup,
    next: {
      kind: 'deposit',
      destination: plan.deposit,
      durationSec: 0.8 * waitMultiplier,
      onComplete: plan.onDeposit,
    },
  }
}

/**
 * Local resource exchange (plan settlements-npcs-005) — this household's
 * `SettlementEconomy` village storage currently has real surplus of `kind`
 * while this household has a real shortage (existing
 * `Household.shortage`/`SettlementEconomy.surplus`, no new need model).
 * Read-only; `planEconomyWithdraw` re-validates live at claim time.
 */
export function canWithdrawFromEconomy(ctx: NpcLogisticsCtx, kind: HouseholdResourceKind): boolean {
  if (!ctx.household || !ctx.economy) return false
  if (ctx.household.shortage(kind) <= 0) return false
  return ctx.economy.hasSurplus(kind)
}

/**
 * Local resource exchange — a same-settlement household currently has real
 * surplus of `kind` this household's real shortage can claim
 * (`HouseholdExchangeHooks`, built once per settlement from its own
 * `households` array — never a world-wide scan). Read-only;
 * `planHouseholdExchange` re-validates live at claim time since another
 * NPC/actor may consume the source's surplus first.
 */
export function canExchangeWithHousehold(ctx: NpcLogisticsCtx, kind: HouseholdResourceKind): boolean {
  if (!ctx.household || !ctx.householdExchange) return false
  if (ctx.household.shortage(kind) <= 0) return false
  return ctx.householdExchange.findSurplusSource(ctx.household.id, kind, ctx.home) != null
}

/**
 * Village-storage withdrawal (plan settlements-npcs-005) — visits the
 * settlement's stockpile, claims the settlement economy's current surplus
 * of `kind` (atomic, revalidated against the economy's *current* surplus,
 * never the value read at decision time), then carries the claim home and
 * deposits it. Mirrors `planPlayerStorageDelivery`'s two-leg
 * `goTo`/`execute`/`next` chain: a claim made but not yet deposited (this
 * NPC cancelled/killed mid-trip) is lost rather than duplicated — the same
 * accepted tradeoff `beginNeed`'s existing chop→deposit/mine→deposit
 * chains already make for the brief window between their own two legs.
 */
export function planEconomyWithdraw(ctx: NpcLogisticsCtx, kind: HouseholdResourceKind): NpcPlannedAction | null {
  const { economy, household } = ctx
  if (!household || !economy) return null
  if (household.shortage(kind) <= 0) return null
  const maxTransfer = HOUSEHOLD_EXCHANGE_MAX_TRANSFER[kind]
  const pickup = copyVec3(settlementStorageDestination(kind, ctx.landmarks.stockpile, ctx.landmarks.settlementStorage))
  const deposit = copyVec3(ctx.home)
  if (kind === 'food') {
    const requested = Math.min(economy.surplus('food'), maxTransfer)
    if (requested <= 0) return null
    // Claim → `carried` → deposit (plan settlements-npcs-014 implementation
    // notes §3): a claim used to live only in this closure, an implicit and
    // losable "in transit" state between the two legs. Routing it through
    // the NPC's own cargo `Inventory` instead means an interruption after
    // claim no longer silently drops the goods — they stay physically
    // carried until a later trip delivers them, same accepted semantics as
    // ore-gathering's mine→deposit chain.
    let carriedClaim: readonly FoodItemClaim[] = []
    return buildTransferAction({
      pickupKind: 'exchange',
      pickup,
      deposit,
      onPickup: () => {
        const claimed = economy.withdrawFood(requested, ctx.simTime())
        carriedClaim = carryFoodClaim(ctx.carried, claimed, economy.items)
      },
      onDeposit: () => {
        if (carriedClaim.length === 0) return
        deliverCarriedFoodClaim(ctx.carried, carriedClaim, household.items)
        satisfyHouseholdResourceNeed(ctx.needs, household, 'food', ctx.simTime())
      },
    }, ctx.waitMultiplier)
  }
  const requested = Math.min(economy.surplus(kind), maxTransfer)
  if (requested <= 0) return null
  let claimed = 0
  return buildTransferAction({
    pickupKind: 'exchange',
    pickup,
    deposit,
    onPickup: () => {
      claimed = claimEconomySurplus(economy, kind, requested, ctx.simTime())
    },
    onDeposit: () => {
      if (claimed <= 0) return
      household.deposit(kind, claimed, economy, ctx.simTime())
      satisfyHouseholdResourceNeed(ctx.needs, household, kind, ctx.simTime())
    },
  }, ctx.waitMultiplier)
}

/**
 * Household ↔ household local exchange (plan settlements-npcs-005) — the
 * main new flow: this household's shortage pulls from a same-settlement
 * household's real surplus, found by `HouseholdExchangeHooks` (nearest
 * first, household id as a deterministic tie-break — never
 * `Math.random()`). Same two-leg chain / claim-then-deposit tradeoff as
 * `planEconomyWithdraw` above.
 */
export function planHouseholdExchange(ctx: NpcLogisticsCtx, kind: HouseholdResourceKind): NpcPlannedAction | null {
  const { household, householdExchange } = ctx
  if (!household || !householdExchange) return null
  if (household.shortage(kind) <= 0) return null
  const source = householdExchange.findSurplusSource(household.id, kind, ctx.home)
  if (!source) return null
  const maxTransfer = HOUSEHOLD_EXCHANGE_MAX_TRANSFER[kind]
  const sourceHousehold = source.household
  const pickup = copyVec3({
    x: source.position.x,
    y: ctx.sampleHeight(source.position.x, source.position.z),
    z: source.position.z,
  })
  const deposit = copyVec3(ctx.home)
  if (kind === 'food') {
    const requested = Math.min(sourceHousehold.surplus('food'), maxTransfer)
    if (requested <= 0) return null
    // Claim → `carried` → deposit, same ownership fix as
    // `planEconomyWithdraw` above.
    let carriedClaim: readonly FoodItemClaim[] = []
    return buildTransferAction({
      pickupKind: 'exchange',
      pickup,
      deposit,
      onPickup: () => {
        const claimed = claimFoodItems(sourceHousehold.items, requested)
        carriedClaim = carryFoodClaim(ctx.carried, claimed, sourceHousehold.items)
      },
      onDeposit: () => {
        if (carriedClaim.length === 0) return
        deliverCarriedFoodClaim(ctx.carried, carriedClaim, household.items)
        satisfyHouseholdResourceNeed(ctx.needs, household, 'food', ctx.simTime())
      },
    }, ctx.waitMultiplier)
  }
  const requested = Math.min(sourceHousehold.surplus(kind), maxTransfer)
  if (requested <= 0) return null
  const economy = ctx.economy
  let claimed = 0
  return buildTransferAction({
    pickupKind: 'exchange',
    pickup,
    deposit,
    onPickup: () => {
      claimed = claimHouseholdSurplus(sourceHousehold, kind, requested)
    },
    onDeposit: () => {
      if (claimed <= 0) return
      household.deposit(kind, claimed, economy, ctx.simTime())
      satisfyHouseholdResourceNeed(ctx.needs, household, kind, ctx.simTime())
    },
  }, ctx.waitMultiplier)
}

/**
 * Helper resource delivery availability (plan 167) — read-only, mirrors
 * `computeFoodStrategyCandidates`'s hunt/nearbyFoodSource checks in
 * `NpcAgent`: an active/enabled assignment, this NPC not genuinely hungry
 * right now (own real hunger stays authoritative, plan §9 —
 * `FOOD_THRESHOLD_NORMAL` is the same bar `generateNeedPressures` uses for
 * "worth eating over" absent any shortage/duty bias), real household surplus
 * to give away (plan §6/§7 — never the household's own reserve), and a
 * target `Container` that currently exists and has room. Never mutates
 * world state; `planPlayerStorageDelivery` re-validates for real when it
 * runs.
 */
export function canDeliverToPlayerStorage(ctx: NpcLogisticsCtx): boolean {
  const { helperAssignment, helperDelivery, household, needs } = ctx
  if (!helperDelivery || !household || !helperAssignment?.enabled) return false
  if (needs.hunger > FOOD_THRESHOLD_NORMAL) return false
  if (household.surplus('food') <= 0) return false
  if (!helperDelivery.findTarget(helperAssignment.targetContainerId)) return false
  return helperDelivery.hasRoom(helperAssignment.targetContainerId, HELPER_DELIVERY_ITEM_KIND)
}

/**
 * Helper resource delivery (plan 167) — the `food` need's highest-priority
 * strategy when `canDeliverToPlayerStorage` says so. Reuses the same
 * `goTo → execute → next` chain exactly like `wood`'s chop→deposit and
 * `waterDuty`'s fetch→deposit in `NpcAgent`: gather the household's real
 * surplus at home (converting the abstract `EconomicStock` amount into
 * concrete `HELPER_DELIVERY_ITEM_KIND` units carried, plan §6), then walk to
 * the target `Container` and deposit. Both steps re-validate at completion
 * time (another actor may have consumed the surplus, picked up the
 * container, or filled it in the meantime) so a stale "available" read never
 * grants a free transfer. A partial/zero accept at deposit time leaves the
 * untransferred amount with this NPC (plan §8) — the next decision cycle
 * re-evaluates from scratch, never a retry loop here.
 */
export function planPlayerStorageDelivery(ctx: NpcLogisticsCtx): NpcPlannedAction | null {
  if (!canDeliverToPlayerStorage(ctx)) return null
  const { carried, helperAssignment, helperDelivery, household } = ctx
  if (!helperDelivery || !household || !helperAssignment) return null
  const target = helperDelivery.findTarget(helperAssignment.targetContainerId)
  if (!target) return null
  const containerId = helperAssignment.targetContainerId
  const requested = Math.min(household.surplus('food'), HELPER_DELIVERY_MAX_CARRY)
  if (requested <= 0 || !carried.canAdd(HELPER_DELIVERY_ITEM_KIND, requested)) return null

  let gathered = 0
  return buildTransferAction({
    pickupKind: 'eat',
    pickup: copyVec3(ctx.home),
    deposit: copyVec3({ x: target.x, y: ctx.sampleHeight(target.x, target.z), z: target.z }),
    onPickup: () => {
      const take = Math.min(household.surplus('food'), requested)
      if (take <= 0) return
      const removed = claimFoodItems(household.items, take)
      const removedTotal = removed.reduce((n, r) => n + r.amount, 0)
      if (removedTotal > 0 && carried.add(HELPER_DELIVERY_ITEM_KIND, removedTotal)) gathered = removedTotal
    },
    onDeposit: () => {
      if (gathered <= 0) return
      const carriedAmount = carried.count(HELPER_DELIVERY_ITEM_KIND)
      if (carriedAmount <= 0) return
      const accepted = helperDelivery.deposit(containerId, HELPER_DELIVERY_ITEM_KIND, carriedAmount)
      if (accepted > 0) carried.remove(HELPER_DELIVERY_ITEM_KIND, accepted)
    },
  }, ctx.waitMultiplier)
}

/**
 * Walks the hunt yield home and moves it from `carried` into the
 * household's generic item storage (plan 178 §6/§7) — mirrors the wood/ore
 * chop→deposit chain's shape, just triggered from a kill instead of a
 * scheduled action. `null` (stays on `choose`, already set by `endCombat`)
 * when there's nothing to deliver.
 */
export function planDeliverHuntYieldHome(carried: Inventory, household: Household | null, home: Vec3, waitMultiplier: number): NpcPlannedAction | null {
  if (!household || !HUNT_YIELD_KINDS.some((kind) => carried.count(kind) > 0)) return null
  return {
    kind: 'deposit',
    destination: copyVec3(home),
    durationSec: 1.0 * waitMultiplier,
    onComplete: () => depositCarriedItems(carried, household, HUNT_YIELD_KINDS),
  }
}
