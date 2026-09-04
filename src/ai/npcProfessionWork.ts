import type { ItemKind } from '../items/items'
import type { HeightSampler } from '../player/PlayerController'
import type { Household, HouseholdResourceKind } from '../settlement/household'
import type { HouseholdExchangeHooks } from '../settlement/householdExchange'
import type { Place } from '../settlement/places'
import type { SettlementLandmarks } from '../settlement/props'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { CropId } from '../world/cropLifecycle'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { Role } from './characters'
import type { NpcPlannedAction } from './npcAction'
import {
  claimHouseholdSurplus,
  commitHunterArrowProduction,
  type SettlementEconomy,
  tryAdvanceDevelopment,
} from '../economy'
import { carryFoodClaim, claimFoodItems, type FoodItemClaim } from '../items/foodItems'
import { Inventory } from '../items/Inventory'
import { isWeaponItemInstance, WEAPON_MAINTENANCE_KIND_LIST, type WeaponItemInstance } from '../items/itemInstances'
import { sharpenWeapon } from '../items/weaponMaintenance'
import { householdStorageDestination, settlementStorageDestination } from '../settlement/storageDestinations'
import { copyVec3 } from '../simulation'
import { MINE_DURATION_SEC, ORE_ITEM, oreEconomicKind } from '../terrain/depositMining'
import { FISHING_CAST_DURATION_SEC, fishingSpotId, rollFishingCatch } from '../world/fishing'
import { CROP_SEED_ITEM } from '../world/plantedCrops'
import { depositCarriedItems, HOUSEHOLD_EXCHANGE_MAX_TRANSFER } from './npcLogistics'
import type { Vector3 } from 'three'

/**
 * Owns the eight profession `work`-block planners (review 2026-09-03 §5 E2)
 * that used to live inside `NpcAgent` as `begin*Work` methods, dispatched by
 * a `this.role === 'x' && this.beginXWork()` ladder. Each planner is a pure
 * decision + world-query producing an `NpcPlannedAction`; none needs the
 * FSM, the mesh, the mixer or the watchdog. `NpcAgent` builds a fresh
 * `NpcWorkContext` and calls `planProfessionWork(ctx)`, falling back to the
 * generic `commitRoleWork` workplace stand on `null` exactly as before.
 */

/** Blacksmith work (plan settlements-npcs-002 §8) — a weapon instance below
 *  this sharpness genuinely "requires maintenance"; at/above it, sharpening
 *  would be busywork for negligible gain. */
export const BLACKSMITH_SHARPEN_THRESHOLD = 0.9

/** Farm work (plan settlements-npcs-002 §3) — how far from the settlement
 *  garden a harvestable crop is still considered "this farmer's field". */
const FARM_WORK_RADIUS = 20
const FARM_PLANT_SEARCH_RADIUS = 3
/** Deterministic seed priority (mirrors `HUNTER_ARROW_PRODUCTIONS`' branch-
 *  before-beam priority) — a farmer plants whichever of these it already has
 *  a seed for, checked in this fixed order. */
const FARM_SEED_PRIORITY: readonly CropId[] = ['carrot', 'potato', 'cabbage']

/** Fisher work (plan settlements-npcs-002 §4) — the fish yield delivered
 *  home, same shape as `npcLogistics.ts`'s `HUNT_YIELD_KINDS`. */
const FISH_YIELD_KINDS: readonly ItemKind[] = ['fish']

/** Trader work (plan settlements-npcs-002 §7) — a trader only ever moves
 *  kinds both `Household` and `SettlementEconomy` actually share; `iron`/
 *  `coal`/`gold` stay settlement-only (plan 131), water stays a `Household`-
 *  only reserve (plan 122), so `food`/`wood` are the only eligible pair. */
const TRADER_TRANSFER_KINDS: readonly HouseholdResourceKind[] = ['food', 'wood']

/** Blacksmith work (plan settlements-npcs-002 §8/§10) — the first (stable,
 *  lowest-id) `WeaponItemInstance` across every `WEAPON_MAINTENANCE_KIND_LIST`
 *  kind whose sharpness is below `BLACKSMITH_SHARPEN_THRESHOLD`, or `null`
 *  when nothing in `inventory` needs it. Pure/deterministic — never a random
 *  pick, mirrors `selectInstancesToSell`'s stable-id tie-break. */
export function findWeaponNeedingMaintenance(inventory: Inventory): WeaponItemInstance | null {
  let best: WeaponItemInstance | null = null
  for (const kind of WEAPON_MAINTENANCE_KIND_LIST) {
    for (const instance of inventory.getInstances(kind)) {
      if (!isWeaponItemInstance(instance) || instance.sharpness >= BLACKSMITH_SHARPEN_THRESHOLD) continue
      if (!best || instance.id < best.id) best = instance
    }
  }
  return best
}

/** Every input a profession planner reads (review §5 E2). Built fresh by
 *  `NpcAgent` right before calling `planProfessionWork` — `simTime` is a
 *  getter and `rollWorkDurationSec` a callback (not captured values), same
 *  staleness discipline as `npcLogistics.ts`'s `NpcLogisticsCtx` (review §10
 *  R3): an `onComplete` closure that runs later reads the NPC's current sim
 *  clock, and each planner call gets its own fresh random work duration
 *  roll, not one reused across profession candidates. `guardPatrolIndex`/
 *  `fishAttempt` are read-only; `advanceGuardPatrol`/`nextFishAttempt` write
 *  the NPC's real counters back (never a returned tuple). */
export type NpcWorkContext = {
  role: Role
  x: number
  z: number
  waitMultiplier: number
  simTime: () => number
  /** Rolls a fresh `randRange(WORK_DURATION_RANGE) * waitMultiplier` — kept
   *  in `NpcAgent` so every RNG call site in the file stays visible there
   *  (P10 loose end), rather than duplicating the roll here. */
  rollWorkDurationSec: () => number
  home: Vector3
  landmarks: SettlementLandmarks
  workplace: Place | null
  household: Household | null
  economy: SettlementEconomy | null
  carried: Inventory
  guardPatrolIndex: number
  advanceGuardPatrol: () => void
  fishAttempt: number
  nextFishAttempt: () => number
  sampleHeight: HeightSampler
  mining: SettlementMiningHooks | null
  foodSources: SettlementFoodSourceHooks | null
  householdExchange: HouseholdExchangeHooks | null
}

/**
 * Miner's `work` schedule block tries a real ore extraction before falling
 * back to the idle workplace stand (plan 131) — reuses the same
 * `ResourceDeposits` the player's pickaxe mines (via the injected `mining`
 * hooks), so extraction/depletion keeps one owner; no NPC-only ore
 * registry. Ore is settlement-level raw stock (implementation notes §3),
 * not household — `Household` stays a family food/wood pantry. `null` when
 * there's no mining hooks, no loaded deposit nearby, or no carry room, so
 * the caller falls back to the pre-131 idle-work stand (plan 131 §7:
 * profession is a preference, not the only way to act).
 */
const ORE_SEARCH_RADIUS = 80

function planOreGathering(ctx: NpcWorkContext): NpcPlannedAction | null {
  const { carried, economy, mining } = ctx
  if (!mining || !economy) return null
  const target = mining.queryNearest(ctx.x, ctx.z, ORE_SEARCH_RADIUS)
  if (!target) return null
  const itemKind = ORE_ITEM[target.type]
  if (!carried.canAdd(itemKind, 1)) return null

  // Set by the `mine` step's onComplete, consumed by the chained `deposit`
  // step's onComplete: depletion (another NPC/the player got there first)
  // must not still credit the settlement economy.
  let minedCount = 0
  return {
    kind: 'mine',
    destination: copyVec3({ x: target.x, y: ctx.sampleHeight(target.x, target.z), z: target.z }),
    durationSec: MINE_DURATION_SEC * ctx.waitMultiplier,
    onComplete: () => {
      const result = mining.mine(target.id)
      if (result.ok && carried.add(result.yield.kind, result.yield.count)) {
        minedCount = result.yield.count
      }
    },
    next: {
      kind: 'deposit',
      destination: copyVec3(ctx.landmarks.stockpile),
      durationSec: 0.8 * ctx.waitMultiplier,
      onComplete: () => {
        if (minedCount <= 0) return
        carried.remove(itemKind, minedCount)
        economy.add(oreEconomicKind(target.type), minedCount, ctx.simTime())
      },
    },
  }
}

/** Hunting expedition (plan 178) — arrow-crafting cap, shared with
 *  `NpcAgent`'s own hunt-resupply target so both agree on "topped up". */
const HUNTER_ARROW_STOCK_CAP = 24

/**
 * Arrow production (settlements-npcs-003, completing plan 178 §9) —
 * `hunter`'s `work` schedule block tries this before falling back to the
 * idle workplace stand, mirroring `planOreGathering`'s "real work before
 * idle stand" shape exactly. A thin adapter to the generic item-recipe
 * mechanism (`commitHunterArrowProduction`/`HUNTER_ARROW_PRODUCTIONS`) —
 * this holds no recipe details itself. `null` (idle stand instead) when the
 * household is already at `HUNTER_ARROW_STOCK_CAP` or has neither `branch`
 * nor `beam` to spend, so a hunter never crafts forever nor starts a work
 * action that can't produce anything.
 */
function planArrowCrafting(ctx: NpcWorkContext): NpcPlannedAction | null {
  const { household, workplace } = ctx
  if (!household || !workplace) return null
  if (household.items.count('arrow') >= HUNTER_ARROW_STOCK_CAP) return null
  if (!household.items.has('branch', 1) && !household.items.has('beam', 1)) return null
  return {
    kind: 'work',
    destination: copyVec3(workplace.position),
    durationSec: ctx.rollWorkDurationSec(),
    onComplete: () => {
      commitHunterArrowProduction(household)
    },
  }
}

/**
 * Farmer's `work` schedule block (plan settlements-npcs-002 §3) — tries a
 * real crop harvest before falling back to the pre-plan idle stand, same
 * "real work before idle stand" shape as `planOreGathering`. Priority
 * matches the plan: a harvestable crop near the settlement garden always
 * wins over planting (an empty/plantable spot is only interesting once
 * there's nothing ready to bring in). Planting only ever runs when the
 * household already holds a real seed item (`FARM_SEED_PRIORITY`) — never
 * mints one.
 */
function planFarmWork(ctx: NpcWorkContext): NpcPlannedAction | null {
  const { foodSources, household } = ctx
  if (!foodSources) return null
  const garden = ctx.landmarks.garden
  const target = foodSources.queryHarvestableCrop(garden.x, garden.z, FARM_WORK_RADIUS)
  if (target) {
    const economy = ctx.economy
    return {
      kind: 'harvest',
      destination: copyVec3({ x: target.x, y: ctx.sampleHeight(target.x, target.z), z: target.z }),
      durationSec: ctx.rollWorkDurationSec(),
      onComplete: () => {
        const result = foodSources.harvest(target)
        if (result && result.count > 0) household?.depositFood(result.kind, result.count, economy, ctx.simTime())
      },
    }
  }
  if (!household) return null
  const seedCropId = FARM_SEED_PRIORITY.find((id) => household.items.has(CROP_SEED_ITEM[id], 1))
  if (!seedCropId) return null
  const spot = foodSources.findPlantSpot(garden.x, garden.z, FARM_PLANT_SEARCH_RADIUS)
  if (!spot) return null
  const seedKind = CROP_SEED_ITEM[seedCropId]
  return {
    kind: 'plant',
    destination: copyVec3({ x: spot.x, y: ctx.sampleHeight(spot.x, spot.z), z: spot.z }),
    durationSec: ctx.rollWorkDurationSec(),
    onComplete: () => {
      if (!household.items.remove(seedKind, 1)) return
      if (!foodSources.plant(spot.x, spot.z, seedCropId)) household.items.add(seedKind, 1)
    },
  }
}

/**
 * Fisher's `work` schedule block (plan settlements-npcs-002 §4) — casts at
 * the settlement's real dock (`landmarks.dock`) using the same
 * deterministic `(spot, attempt)` catch rule `world/fishing.ts` already
 * defines for the player, never the player's own busy-channel action code.
 * `landmarks.dock` only exists for near-coast settlements — that fallback is
 * deliberately *not* a valid fishing target (plan §6/§14: "never fish at a
 * well"), so this returns `null` and the caller falls back to the normal
 * idle work stand instead of inventing a water source.
 */
function planFishingWork(ctx: NpcWorkContext): NpcPlannedAction | null {
  const dock = ctx.landmarks.dock
  if (!dock) return null
  if (!ctx.carried.canAdd('fish', 1)) return null
  const spotId = fishingSpotId(dock.x, dock.z)
  return {
    kind: 'fish',
    destination: copyVec3(dock),
    durationSec: FISHING_CAST_DURATION_SEC * ctx.waitMultiplier,
    onComplete: () => {
      const attempt = ctx.nextFishAttempt()
      if (rollFishingCatch(spotId, attempt, false) && ctx.carried.canAdd('fish', 1)) {
        ctx.carried.add('fish', 1)
      }
    },
    next: {
      kind: 'deposit',
      destination: copyVec3(householdStorageDestination('food', ctx.home, ctx.landmarks.stockpile)),
      durationSec: 0.8 * ctx.waitMultiplier,
      onComplete: () => {
        if (ctx.household) depositCarriedItems(ctx.carried, ctx.household, FISH_YIELD_KINDS)
      },
    },
  }
}

/**
 * Guard's `work` schedule block (plan settlements-npcs-002 §6) — cycles
 * through a small deterministic set of patrol points (home, the settlement
 * well as its centre, the market as a second landmark) instead of standing
 * still at one workplace anchor. Threat detection/response is unchanged —
 * `NpcAgent`'s existing critical-interrupt path applies regardless of role.
 * Always succeeds (the three points always exist), so a guard never falls
 * back to the old static well stand.
 */
function planGuardPatrol(ctx: NpcWorkContext): NpcPlannedAction | null {
  const points = [ctx.home, ctx.landmarks.well, ctx.landmarks.market]
  const point = points[ctx.guardPatrolIndex % points.length]!
  ctx.advanceGuardPatrol()
  return {
    kind: 'work',
    destination: copyVec3(point),
    durationSec: ctx.rollWorkDurationSec(),
    onComplete: () => {},
  }
}

/**
 * Trader cross-household collection (plan settlements-npcs-014) — a
 * bounded, same-settlement pickup of *another* household's real food
 * surplus, physically carried to the settlement's storage. Reuses
 * `HouseholdExchangeHooks.findSurplusSource` — the same nearest-first,
 * id-tie-break lookup `npcLogistics.ts`'s household exchange already uses —
 * but never requires this settlement to already be short of food: the
 * plan's "Model" section wants the storage buffer stocked ahead of demand,
 * not only drained reactively after a shortage appears. Never selects this
 * trader's own household (`excludeHouseholdId`). Claim → carry → deposit,
 * same conservation invariant as `npcLogistics.ts`'s flows — this trader is
 * a consumer of that same local-goods-flow mechanism, not the owner of a
 * second one (plan §3).
 */
function planTraderCollection(ctx: NpcWorkContext, household: Household, economy: SettlementEconomy): NpcPlannedAction | null {
  const hooks = ctx.householdExchange
  if (!hooks) return null
  const source = hooks.findSurplusSource(household.id, 'food', ctx.home)
  if (!source) return null
  const sourceHousehold = source.household
  const requested = Math.min(sourceHousehold.surplus('food'), HOUSEHOLD_EXCHANGE_MAX_TRANSFER.food)
  if (requested <= 0) return null
  const pickupDestination = copyVec3({
    x: source.position.x,
    y: ctx.sampleHeight(source.position.x, source.position.z),
    z: source.position.z,
  })
  let carriedClaim: readonly FoodItemClaim[] = []
  return {
    kind: 'work',
    destination: pickupDestination,
    durationSec: 1.2 * ctx.waitMultiplier,
    onComplete: () => {
      const claimed = claimFoodItems(sourceHousehold.items, requested)
      carriedClaim = carryFoodClaim(ctx.carried, claimed, sourceHousehold.items)
    },
    next: {
      kind: 'deposit',
      destination: copyVec3(settlementStorageDestination('food', ctx.landmarks.stockpile, ctx.landmarks.settlementStorage)),
      durationSec: 0.8 * ctx.waitMultiplier,
      onComplete: () => {
        if (carriedClaim.length === 0) return
        for (const claim of carriedClaim) {
          ctx.carried.remove(claim.kind, claim.amount)
          economy.depositFood(claim.kind, claim.amount, ctx.simTime(), claim.batches)
        }
        tryAdvanceDevelopment(economy)
      },
    },
  }
}

/**
 * Trader's `work` schedule block (plan settlements-npcs-002 §7) — a
 * bounded, local economic effect instead of a full market simulation: when
 * this trader's own household has real surplus (`Household.surplus`, never
 * its own reserve) in a kind the settlement's shared economy actually has a
 * shortage in, the trader carries that surplus to market and deposits it
 * into `SettlementEconomy`. Preserved as-is (plan settlements-npcs-014
 * implementation notes §6/§16 — regression baseline) as the trader's first
 * choice; when this trader's own household has nothing to bring,
 * `planTraderCollection` is the plan's new capability: a physical pickup
 * from *another* household.
 */
function planTraderWork(ctx: NpcWorkContext): NpcPlannedAction | null {
  const { household } = ctx
  const economy = ctx.economy
  if (!household || !economy || !ctx.workplace) return null
  const kind = TRADER_TRANSFER_KINDS.find((k) => household.surplus(k) > 0 && economy.hasShortage(k))
  if (!kind) return planTraderCollection(ctx, household, economy)
  const workplace = ctx.workplace
  return {
    kind: 'work',
    destination: copyVec3(workplace.position),
    durationSec: ctx.rollWorkDurationSec(),
    onComplete: () => {
      if (kind === 'food') {
        // Concrete-item counterpart of the wood claim below (plan
        // settlements-npcs-008) — this trader's full surplus is the
        // requested amount, so the cap is a no-op in practice. `batches`
        // (plan settlements-npcs-014) keeps this claim's freshness intact
        // across the transfer instead of resetting it to day 0.
        const claimed = claimFoodItems(household.items, household.surplus('food'))
        for (const { kind: itemKind, amount, batches } of claimed) economy.depositFood(itemKind, amount, ctx.simTime(), batches)
        return
      }
      // Reuses the same atomic claim seam local exchange uses
      // (`economy/localExchange.ts`) — this trader's full surplus is the
      // requested amount, so the cap is a no-op in practice, just a shared
      // claim path.
      const amount = claimHouseholdSurplus(household, kind, household.surplus(kind))
      if (amount <= 0) return
      economy.add(kind, amount, ctx.simTime())
      tryAdvanceDevelopment(economy)
    },
  }
}

/**
 * Blacksmith's `work` schedule block (plan settlements-npcs-002 §8/§10) —
 * the generic `sharpenWeapon()` maintenance operation is the single source
 * of truth for the mutation; this only finds a target and a whetstone,
 * never reproduces sharpening math. Scoped to this blacksmith's own
 * household item storage — there is no cross-household weapon-repair-
 * drop-off flow, and no generic whetstone supply into a household today
 * (both are player-tradeable-only items, plan §10 note), so this frequently
 * finds nothing and falls back to the normal idle work stand — a deliberate
 * "keep the work action unavailable until the generic dependency exists"
 * outcome, not a bug.
 */
function planBlacksmithWork(ctx: NpcWorkContext): NpcPlannedAction | null {
  const { household, workplace } = ctx
  if (!household || !workplace) return null
  if (!household.items.has('whetstone', 1)) return null
  const target = findWeaponNeedingMaintenance(household.items)
  if (!target) return null
  return {
    kind: 'sharpen',
    destination: copyVec3(workplace.position),
    durationSec: ctx.rollWorkDurationSec(),
    onComplete: () => {
      sharpenWeapon(household.items, target.id, 'whetstone')
    },
  }
}

/**
 * Dispatches to the one planner matching `ctx.role` (review §5 E2) — mirrors
 * the pre-extraction `if (this.role === 'x' && this.beginXWork()) return`
 * ladder exactly, just as a lookup instead of a hand-maintained if-chain.
 * `null` for a role with no profession planner (or when the matching
 * planner itself finds nothing to do) — the caller falls back to the
 * generic `commitRoleWork` workplace stand, unchanged.
 */
export function planProfessionWork(ctx: NpcWorkContext): NpcPlannedAction | null {
  switch (ctx.role) {
    case 'blacksmith': return planBlacksmithWork(ctx)
    case 'farmer': return planFarmWork(ctx)
    case 'fisher': return planFishingWork(ctx)
    case 'guard': return planGuardPatrol(ctx)
    case 'hunter': return planArrowCrafting(ctx)
    case 'miner': return planOreGathering(ctx)
    case 'trader': return planTraderWork(ctx)
    default: return null
  }
}
