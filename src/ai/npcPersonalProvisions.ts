import type { Inventory } from '../items/Inventory'
import type { Household } from '../settlement/household'
import type { NeedState } from './Needs'
import { claimFoodItems, depositFoodItems, foodItemCount } from '../items/foodItems'
import {
  isLiquidContainerInstance,
  type LiquidContainerItemInstance,
} from '../items/itemInstances'
import {
  canDrinkFromLiquidContainer,
  fillLiquidContainer,
  LIQUID_DRINK_PORTION_LITRES,
} from '../items/liquidContainer'
import { realSecondsToGameHours } from '../world/timeConversion'
import {
  expectedCandidateWork,
  type ExpeditionEscortTerms,
  type MeasurableWorkContractRecord,
} from '../world/workContract'
import { NEED_SATISFY_AMOUNT } from './Needs'

/**
 * Personal food/water helpers and bounded work-contract provisioning (plan
 * npc-017). Keeps durable provisions on `NpcAuthoritativeState.personalInventory`
 * and reuses existing food-transfer and liquid-container APIs — no parallel
 * worker-survival store.
 *
 * @domain npc
 */

/** One-way travel shorter than this is treated as "local" — the worker can
 *  rely on ordinary home sources during need interrupts instead of packing
 *  extra personal supplies. */
export const LOCAL_CONTRACT_TRAVEL_HOURS = 1.5

/** Conservative hunger/thirst buffers used when estimating how many eat/drink
 *  cycles a remote contract might need — deliberately below the critical
 *  interrupt thresholds so provisioning errs on the side of packing more. */
const PROVISION_HUNGER_BUFFER = 0.1
const PROVISION_THIRST_BUFFER = 0.1

/** Coin-equivalent penalty per missing estimated food unit when scoring a
 *  remote contract — large enough to reject obviously impossible trips
 *  without dominating reward on its own. */
export const CONTRACT_MISSING_FOOD_UNIT_PENALTY = 8
/** Same role for missing drink portions. */
export const CONTRACT_MISSING_DRINK_PENALTY = 6

/** Total concrete food units held in `personalInventory`. */
export function countPersonalFood(inventory: Inventory): number {
  return foodItemCount(inventory)
}

/** Drink portions currently held in personal liquid containers (water only). */
export function countPersonalDrinkPortions(inventory: Inventory): number {
  let portions = 0
  for (const kind of ['waterskin_small', 'waterskin_medium', 'waterskin_large'] as const) {
    for (const instance of inventory.getInstances(kind)) {
      if (isLiquidContainerInstance(instance) && instance.liquid === 'water') {
        portions += Math.floor(instance.amountLitres / LIQUID_DRINK_PORTION_LITRES)
      }
    }
  }
  return portions
}

/** Deterministic first personal container holding enough water to drink. */
export function findDrinkablePersonalWaterContainer(inventory: Inventory): LiquidContainerItemInstance | null {
  for (const kind of ['waterskin_small', 'waterskin_medium', 'waterskin_large'] as const) {
    for (const instance of inventory.getInstances(kind)) {
      if (isLiquidContainerInstance(instance) && canDrinkFromLiquidContainer(instance)) return instance
    }
  }
  return null
}

/** Deterministic first personal waterskin that can still accept water. */
export function findFillablePersonalWaterskin(inventory: Inventory): LiquidContainerItemInstance | null {
  for (const kind of ['waterskin_small', 'waterskin_medium', 'waterskin_large'] as const) {
    for (const instance of inventory.getInstances(kind)) {
      if (isLiquidContainerInstance(instance) && fillLiquidContainer(instance, 'water') != null) return instance
    }
  }
  return null
}

export function hasFillablePersonalWaterskin(inventory: Inventory): boolean {
  return findFillablePersonalWaterskin(inventory) != null
}

export type ContractProvisionEstimate = {
  awayHours: number
  travelHours: number
  workHours: number
  foodUnitsNeeded: number
  drinkPortionsNeeded: number
  skipProvisioning: boolean
}

/** Reusable core (plan npc-030 §25) — every caller ultimately estimates from
 *  one `awayHours` figure; only how that figure is derived differs
 *  (construction: travel + expected measurable work; escort: duration/
 *  bounded destination estimate, see `estimateEscortProvisionNeed`). */
function estimateAwayProvisionNeed(
  awayHours: number,
  hunger: number,
  thirst: number,
  skipProvisioning: boolean,
): Omit<ContractProvisionEstimate, 'travelHours' | 'workHours'> {
  const hungerRise = awayHours / 10
  const thirstRise = awayHours / 8
  const projectedHunger = Math.min(1, hunger + hungerRise)
  const projectedThirst = Math.min(1, thirst + thirstRise)
  const foodUnitsNeeded = skipProvisioning
    ? 0
    : Math.ceil(Math.max(0, projectedHunger - PROVISION_HUNGER_BUFFER) / NEED_SATISFY_AMOUNT.food)
  const drinkPortionsNeeded = skipProvisioning
    ? 0
    : Math.ceil(Math.max(0, projectedThirst - PROVISION_THIRST_BUFFER) / NEED_SATISFY_AMOUNT.water)
  return { awayHours, foodUnitsNeeded, drinkPortionsNeeded, skipProvisioning }
}

/** Bounded, read-only estimate of personal supplies a remote measurable-work
 *  contract may require — does not mutate inventory and does not simulate
 *  the whole trip. */
export function estimateContractProvisionNeed(input: {
  travelHours: number
  workHours: number
  hunger: number
  thirst: number
}): ContractProvisionEstimate {
  const awayHours = input.travelHours + input.workHours
  const skipProvisioning = input.travelHours <= LOCAL_CONTRACT_TRAVEL_HOURS && awayHours <= 4
  return {
    ...estimateAwayProvisionNeed(awayHours, input.hunger, input.thirst, skipProvisioning),
    travelHours: input.travelHours,
    workHours: input.workHours,
  }
}

/** Escort counterpart of `estimateContractProvisionNeed` (plan npc-030
 *  §25) — `awayHours` comes from the agreed duration or a bounded
 *  destination travel-time estimate, never from a measurable-work target.
 *  A short-enough total absence still skips provisioning, same as a local
 *  construction contract. */
export function estimateEscortProvisionNeed(input: {
  awayHours: number
  hunger: number
  thirst: number
}): ContractProvisionEstimate {
  const skipProvisioning = input.awayHours <= 4
  return {
    ...estimateAwayProvisionNeed(input.awayHours, input.hunger, input.thirst, skipProvisioning),
    travelHours: input.awayHours,
    workHours: 0,
  }
}

export function contractTravelHours(
  contract: MeasurableWorkContractRecord,
  input: { npcX: number, npcZ: number, walkSpeed: number, dayLengthSec: number },
): number {
  const distance = Math.hypot(contract.scope.x - input.npcX, contract.scope.z - input.npcZ)
  const travelRealSeconds = input.walkSpeed > 0 ? distance / input.walkSpeed : 0
  return realSecondsToGameHours(travelRealSeconds, input.dayLengthSec)
}

export type ContractProvisionAvailability = {
  personalFoodUnits: number
  personalDrinkPortions: number
  householdFoodUnits: number
  householdWaterUnits: number
  canFillWaterskin: boolean
}

/** Read-only bounded supply picture for feasibility scoring / provisioning. */
export function readContractProvisionAvailability(
  personalInventory: Inventory,
  household: Household | null,
): ContractProvisionAvailability {
  const householdFoodUnits = household?.foodCount() ?? 0
  const householdWaterUnits = household?.water.current ?? 0
  const canFillWaterskin = hasFillablePersonalWaterskin(personalInventory) && householdWaterUnits > 0
  return {
    personalFoodUnits: countPersonalFood(personalInventory),
    personalDrinkPortions: countPersonalDrinkPortions(personalInventory),
    householdFoodUnits,
    householdWaterUnits,
    canFillWaterskin,
  }
}

/** Non-negative penalty subtracted from the base contract score. Returns
 *  `Number.POSITIVE_INFINITY` when the bounded supply picture cannot cover
 *  the conservative estimate at all (hard reject). */
export function contractProvisionFeasibilityPenalty(
  estimate: ContractProvisionEstimate,
  availability: ContractProvisionAvailability,
): number {
  if (estimate.skipProvisioning) return 0
  const foodAvailable = availability.personalFoodUnits + availability.householdFoodUnits
  const drinkAvailable = availability.personalDrinkPortions
    + (availability.canFillWaterskin ? 1 : 0)
    + Math.max(0, availability.householdWaterUnits - 1)
  const missingFood = Math.max(0, estimate.foodUnitsNeeded - foodAvailable)
  const missingDrink = Math.max(0, estimate.drinkPortionsNeeded - drinkAvailable)
  if (missingFood > 1 || missingDrink > 1) return Number.POSITIVE_INFINITY
  return missingFood * CONTRACT_MISSING_FOOD_UNIT_PENALTY + missingDrink * CONTRACT_MISSING_DRINK_PENALTY
}

export type ContractProvisionResult = {
  foodProvisioned: number
  drinksAdded: number
  failureReason: string | null
}

function transferPersonalFoodFromHousehold(
  personalInventory: Inventory,
  household: Household,
  amount: number,
  nowDays: number,
): number {
  if (amount <= 0) return 0
  const claimed = claimFoodItems(household.items, amount, nowDays)
  if (claimed.length === 0) return 0
  let transferred = 0
  const refund: typeof claimed = []
  for (const claim of claimed) {
    if (personalInventory.canAdd(claim.kind, claim.amount) && personalInventory.addWithFreshness(claim.kind, claim.amount, claim.batches, nowDays)) {
      transferred += claim.amount
    } else {
      refund.push(claim)
    }
  }
  if (refund.length > 0) depositFoodItems(household.items, refund, nowDays)
  return transferred
}

function fillPersonalWaterskinFromHousehold(
  personalInventory: Inventory,
  household: Household,
): boolean {
  const container = findFillablePersonalWaterskin(personalInventory)
  if (!container || !household.water.has(1)) return false
  const filled = fillLiquidContainer(container, 'water')
  if (!filled) return false
  if (!personalInventory.updateInstance(container.id, () => filled)) return false
  household.water.remove(1)
  return true
}

/** Mutates `personalInventory` / household stock after acceptance — real
 *  transfers only, atomic on destination capacity failure. */
export function provisionContractSupplies(input: {
  personalInventory: Inventory
  household: Household | null
  estimate: ContractProvisionEstimate
  availability: ContractProvisionAvailability
  nowDays: number
}): ContractProvisionResult {
  if (input.estimate.skipProvisioning || !input.household) {
    return { foodProvisioned: 0, drinksAdded: 0, failureReason: null }
  }

  const foodDeficit = Math.max(0, input.estimate.foodUnitsNeeded - input.availability.personalFoodUnits)
  const foodProvisioned = transferPersonalFoodFromHousehold(
    input.personalInventory,
    input.household,
    foodDeficit,
    input.nowDays,
  )

  let drinksAdded = 0
  let failureReason: string | null = null
  const drinkDeficit = Math.max(
    0,
    input.estimate.drinkPortionsNeeded - countPersonalDrinkPortions(input.personalInventory),
  )
  if (drinkDeficit > 0) {
    const beforeDrinks = countPersonalDrinkPortions(input.personalInventory)
    if (fillPersonalWaterskinFromHousehold(input.personalInventory, input.household)) {
      drinksAdded = countPersonalDrinkPortions(input.personalInventory) - beforeDrinks
    } else if (drinkDeficit > input.availability.personalDrinkPortions) {
      failureReason = 'insufficientPersonalWater'
    }
  }

  if (foodDeficit > 0 && foodProvisioned < foodDeficit) {
    failureReason = failureReason ?? 'insufficientPersonalFood'
  }

  return { foodProvisioned, drinksAdded, failureReason }
}

/** Convenience wrapper tying a measurable-work contract to the estimate/
 *  availability helpers. */
export function buildContractProvisionContext(input: {
  contract: MeasurableWorkContractRecord
  needs: Pick<NeedState, 'hunger' | 'thirst'>
  personalInventory: Inventory
  household: Household | null
  npcX: number
  npcZ: number
  walkSpeed: number
  dayLengthSec: number
}): {
  estimate: ContractProvisionEstimate
  availability: ContractProvisionAvailability
} {
  const travelHours = contractTravelHours(input.contract, input)
  const workHours = expectedCandidateWork(input.contract)
  return {
    estimate: estimateContractProvisionNeed({
      travelHours,
      workHours,
      hunger: input.needs.hunger,
      thirst: input.needs.thirst,
    }),
    availability: readContractProvisionAvailability(input.personalInventory, input.household),
  }
}

/** Bounded expected-away-time estimate for an expedition-escort's terms
 *  (plan npc-030 §21/§25) — duration is the primary commitment cost;
 *  destination-only terms fall back to a bounded one-way travel-time
 *  estimate to the already-resolved destination snapshot (never global
 *  pathfinding). `24` game-hours/day, matching `realSecondsToGameHours`'s
 *  own day-length convention. */
export function escortAwayHours(
  terms: ExpeditionEscortTerms,
  input: { npcX: number, npcZ: number, walkSpeed: number, dayLengthSec: number },
): number {
  if (typeof terms.durationDays === 'number') return terms.durationDays * 24
  const destination = terms.destination
  if (!destination) return 0
  const distance = Math.hypot(destination.x - input.npcX, destination.z - input.npcZ)
  const travelRealSeconds = input.walkSpeed > 0 ? distance / input.walkSpeed : 0
  return realSecondsToGameHours(travelRealSeconds, input.dayLengthSec)
}

/** Escort counterpart of `buildContractProvisionContext` (plan npc-030
 *  §25). */
export function buildEscortProvisionContext(input: {
  terms: ExpeditionEscortTerms
  needs: Pick<NeedState, 'hunger' | 'thirst'>
  personalInventory: Inventory
  household: Household | null
  npcX: number
  npcZ: number
  walkSpeed: number
  dayLengthSec: number
}): {
  estimate: ContractProvisionEstimate
  availability: ContractProvisionAvailability
} {
  return {
    estimate: estimateEscortProvisionNeed({
      awayHours: escortAwayHours(input.terms, input),
      hunger: input.needs.hunger,
      thirst: input.needs.thirst,
    }),
    availability: readContractProvisionAvailability(input.personalInventory, input.household),
  }
}
