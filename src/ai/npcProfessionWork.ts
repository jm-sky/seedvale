import type { ItemKind } from '../items/items'
import type { HeightSampler } from '../player/PlayerController'
import type { Household, HouseholdResourceKind } from '../settlement/household'
import type { HouseholdExchangeHooks } from '../settlement/householdExchange'
import type { Place } from '../settlement/places'
import type { SettlementLandmarks } from '../settlement/props'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { TransportOrders } from '../world/createTransportOrders'
import type { CropId } from '../world/cropLifecycle'
import type { SettlementFoodSourceHooks } from '../world/foodSources'
import type { TransportOrder } from '../world/transportOrder'
import type { Role } from './characters'
import type { NpcPlannedAction } from './npcAction'
import {
  claimHouseholdSurplus,
  commitHunterArrowProduction,
  type SettlementEconomy,
  tryAdvanceDevelopment,
} from '../economy'
import { WOOL_YIELD } from '../fauna/livestockProduction'
import {
  ownedFlockCentroid,
  selectReadyOwnedSheep,
  selectSeparatedOwnedSheep,
  type ShepherdFlockHooks,
} from '../fauna/shepherdFlock'
import { claimFoodItems, FOOD_ITEM_KINDS } from '../items/foodItems'
import { Inventory } from '../items/Inventory'
import { isWeaponItemInstance, WEAPON_MAINTENANCE_KIND_LIST, type WeaponItemInstance } from '../items/itemInstances'
import { sharpenWeapon } from '../items/weaponMaintenance'
import { physicalWorkDuration } from '../player/physicalWorkStrength'
import {
  householdStorageDestination,
  resolveHouseholdWoodStorage,
  settlementStorageDestination,
} from '../settlement/storageDestinations'
import { copyVec3 } from '../simulation'
import { MINE_DURATION_SEC, ORE_ITEM, oreEconomicKind } from '../terrain/depositMining'
import { type CultivationAnchor, resolveCultivationAnchor } from '../world/cultivationAnchor'
import { FISHING_CAST_DURATION_SEC, fishingSpotId, rollFishingCatch } from '../world/fishing'
import { CROP_SEED_ITEM } from '../world/plantedCrops'
import { executeTransportPickup, executeTransportUnload } from '../world/transportTransactions'
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
  npcId: string
  /** World-owned transport commitments (plan settlements-npcs-018). Null in
   *  isolated fallbacks — trader collection then cannot run. */
  transportOrders: TransportOrders | null
  /** Already-resolved human Strength (`resolveHumanStrengthProfile()`), the
   *  same value melee uses — not raw base SPEA. Physical-work planners
   *  (currently ore mining) read this; generic `rollWorkDurationSec()` does
   *  not. Neutral `0.5` preserves legacy durations. */
  strength: number
  /** Optional cultivation target (plan world-019) — a future settlement
   *  bootstrap can supply a Player-built garden through the same Farmer
   *  planner. Absent, the planner resolves the settlement garden landmark. */
  cultivationAnchor?: CultivationAnchor | null
  /** Absolute world days for wool readiness (plan fauna-004). */
  nowDays?: () => number
  shepherdFlock?: ShepherdFlockHooks | null
  hasShearingTool?: () => boolean
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
    durationSec: physicalWorkDuration(MINE_DURATION_SEC * ctx.waitMultiplier, ctx.strength),
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
      commitHunterArrowProduction(household, ctx.simTime())
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
  const garden = resolveCultivationAnchor({
    supplied: ctx.cultivationAnchor,
    settlementAnchors: ctx.landmarks.cultivationAnchors,
    fallbackGarden: ctx.landmarks.garden
      ? { x: ctx.landmarks.garden.x, z: ctx.landmarks.garden.z }
      : null,
  })
  if (!garden) return null
  const target = foodSources.queryHarvestableCrop(garden.position.x, garden.position.z, FARM_WORK_RADIUS)
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
  const spot = foodSources.findPlantSpot(garden.position.x, garden.position.z, FARM_PLANT_SEARCH_RADIUS)
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
      destination: copyVec3(householdStorageDestination(
        'food',
        ctx.home,
        resolveHouseholdWoodStorage(ctx.home, ctx.landmarks),
      )),
      durationSec: 0.8 * ctx.waitMultiplier,
      onComplete: () => {
        if (ctx.household) depositCarriedItems(ctx.carried, ctx.household, FISH_YIELD_KINDS, ctx.simTime())
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
 * Deterministic first-slice cargo for a Trader `TransportOrder` — one
 * concrete food `ItemKind` from live surplus, bounded to the existing
 * household-exchange cap and whatever currently fits in `carrier`.
 * Catalog order (`FOOD_ITEM_KINDS`), never `Math.random()`.
 */
export function selectTraderCollectionGoods(
  household: Household,
  carrier: Inventory,
  maxTransfer = HOUSEHOLD_EXCHANGE_MAX_TRANSFER.food,
): { kind: ItemKind, quantity: number } | null {
  const surplus = household.surplus('food')
  if (surplus <= 0) return null
  const cap = Math.min(surplus, maxTransfer)
  for (const kind of FOOD_ITEM_KINDS) {
    const available = household.items.count(kind)
    if (available <= 0) continue
    let quantity = Math.min(available, cap)
    while (quantity > 0 && !carrier.canAdd(kind, quantity)) quantity -= 1
    if (quantity > 0) return { kind, quantity }
  }
  return null
}

function planTransportOrderExecution(
  ctx: NpcWorkContext,
  economy: SettlementEconomy,
  order: TransportOrder,
): NpcPlannedAction | null {
  const orders = ctx.transportOrders
  const hooks = ctx.householdExchange
  if (!orders || !ctx.npcId) return null
  const unloadDestination = copyVec3(settlementStorageDestination(
    'food',
    ctx.landmarks.stockpile,
    ctx.landmarks.settlementStorage,
  ))
  const unload: NpcPlannedAction = {
    kind: 'deposit',
    destination: unloadDestination,
    durationSec: 0.8 * ctx.waitMultiplier,
    onComplete: () => {
      const current = orders.find(order.id)
      if (!current || current.state !== 'in-transit') return
      if (current.destination.type !== 'settlement-storage') return
      if (economy.settlementId !== current.destination.settlementId) return
      const result = executeTransportUnload({
        orders,
        orderId: order.id,
        carrierNpcId: ctx.npcId,
        carrier: ctx.carried,
        destination: economy.items,
        nowDays: ctx.simTime(),
      })
      if (result.ok) tryAdvanceDevelopment(economy)
    },
  }
  if (order.state === 'in-transit') return unload
  if (order.state !== 'assigned' || order.source.type !== 'household') return null
  const source = hooks?.findById(order.source.householdId)
  if (!source) {
    orders.fail(order.id)
    return null
  }
  return {
    kind: 'work',
    destination: copyVec3({
      x: source.position.x,
      y: ctx.sampleHeight(source.position.x, source.position.z),
      z: source.position.z,
    }),
    durationSec: 1.2 * ctx.waitMultiplier,
    onComplete: () => {
      const current = orders.find(order.id)
      if (!current || current.state !== 'assigned') return
      if (current.source.type !== 'household') {
        orders.fail(order.id)
        return
      }
      const live = hooks?.findById(current.source.householdId)
      if (!live) {
        orders.fail(order.id)
        return
      }
      executeTransportPickup({
        orders,
        orderId: order.id,
        carrierNpcId: ctx.npcId,
        carrier: ctx.carried,
        source: live.household.items,
        liveTransferableQuantity: Math.min(
          live.household.items.count(current.itemKind),
          live.household.surplus('food'),
        ),
        nowDays: ctx.simTime(),
      })
    },
    next: unload,
  }
}

/**
 * Trader cross-household collection (plan settlements-npcs-014, migrated
 * onto `TransportOrder` by settlements-npcs-018) — a bounded, same-settlement
 * pickup of *another* household's real food surplus, physically carried to
 * the settlement's storage. Source discovery stays on
 * `HouseholdExchangeHooks.findSurplusSource`; the commitment itself is a
 * world-owned order executed by this NPC's existing action chain. Temporary
 * interruption resumes the same non-terminal order instead of creating a
 * replacement.
 */
function planTraderCollection(ctx: NpcWorkContext, household: Household, economy: SettlementEconomy): NpcPlannedAction | null {
  const hooks = ctx.householdExchange
  const orders = ctx.transportOrders
  if (!hooks || !orders || !ctx.npcId) return null
  const existing = orders.findByCarrier(ctx.npcId)
  if (existing) return planTransportOrderExecution(ctx, economy, existing)
  const source = hooks.findSurplusSource(household.id, 'food', ctx.home)
  if (!source) return null
  const goods = selectTraderCollectionGoods(source.household, ctx.carried)
  if (!goods) return null
  const order = orders.create({
    source: { type: 'household', householdId: source.household.id },
    destination: { type: 'settlement-storage', settlementId: economy.settlementId },
    itemKind: goods.kind,
    requestedQuantity: goods.quantity,
    carrierNpcId: ctx.npcId,
  })
  if (!order) return null
  return planTransportOrderExecution(ctx, economy, order)
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
        const claimed = claimFoodItems(household.items, household.surplus('food'), ctx.simTime())
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

const WOOL_YIELD_KINDS: readonly ItemKind[] = ['wool']
const SHEARING_DURATION_SEC = 2.4

function planWoolDeposit(ctx: NpcWorkContext): NpcPlannedAction | null {
  const household = ctx.household
  if (!household || ctx.carried.count('wool') <= 0) return null
  return {
    kind: 'deposit',
    destination: copyVec3(ctx.home),
    durationSec: 0.8 * ctx.waitMultiplier,
    onComplete: () => depositCarriedItems(ctx.carried, household, WOOL_YIELD_KINDS, ctx.simTime()),
  }
}

function planShepherdWork(ctx: NpcWorkContext): NpcPlannedAction | null {
  const flock = ctx.shepherdFlock
  const household = ctx.household
  if (!flock || !household) return null
  const ownerHouseId = household.homeId
  const sheep = flock.listOwned(ownerHouseId)
  const ready = selectReadyOwnedSheep(sheep, ownerHouseId)
  const canShear = ctx.hasShearingTool?.() === true
  if (ready && canShear && ctx.carried.canAdd('wool', WOOL_YIELD)) {
    const sheepId = ready.animalId
    return {
      kind: 'shear',
      destination: copyVec3({ x: ready.x, y: ctx.sampleHeight(ready.x, ready.z), z: ready.z }),
      durationSec: SHEARING_DURATION_SEC * ctx.waitMultiplier,
      followAnimalId: sheepId,
      onComplete: () => {
        if (ctx.hasShearingTool?.() !== true) return
        if (!ctx.carried.canAdd('wool', WOOL_YIELD)) return
        const live = flock.resolve(sheepId)
        if (!live || !live.isAlive || live.ownerHouseId !== ownerHouseId || !live.woolReady) return
        if (!live.shear(ctx.nowDays?.() ?? 0)) return
        ctx.carried.add('wool', WOOL_YIELD)
      },
      next: planWoolDeposit(ctx) ?? {
        kind: 'deposit',
        destination: copyVec3(ctx.home),
        durationSec: 0.8 * ctx.waitMultiplier,
        onComplete: () => depositCarriedItems(ctx.carried, household, WOOL_YIELD_KINDS, ctx.simTime()),
      },
    }
  }
  const deposit = planWoolDeposit(ctx)
  if (deposit) return deposit
  const separated = selectSeparatedOwnedSheep(sheep, ownerHouseId, ctx.home.x, ctx.home.z)
  if (separated) {
    return {
      kind: 'work',
      destination: copyVec3({
        x: separated.x,
        y: ctx.sampleHeight(separated.x, separated.z),
        z: separated.z,
      }),
      durationSec: ctx.rollWorkDurationSec(),
      followAnimalId: separated.animalId,
      onComplete: () => {},
    }
  }
  const centroid = ownedFlockCentroid(sheep, ownerHouseId)
  const stay = centroid ?? { x: ctx.home.x, z: ctx.home.z }
  return {
    kind: 'work',
    destination: copyVec3({ x: stay.x, y: ctx.sampleHeight(stay.x, stay.z), z: stay.z }),
    durationSec: ctx.rollWorkDurationSec(),
    onComplete: () => {},
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
    case 'shepherd': return planShepherdWork(ctx)
    case 'trader': return planTraderWork(ctx)
    default: return null
  }
}
