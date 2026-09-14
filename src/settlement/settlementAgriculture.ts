import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { FamilyDef } from './families'
import type { Household, HouseholdStartingContext } from './household'
import { CROP_DEFS, resolveCultivatedSeedRecovery } from '../world/cropLifecycle'
import { CROP_SEED_ITEM, FARM_SEED_PRIORITY } from '../world/plantedCrops'
import { adultProfessionCoverage } from './professionStaffing'

/**
 * Non-home settlement agriculture v1 (plan settlements-npcs-030) plus
 * cultivated seed recovery (plan settlements-npcs-031). Capacity and
 * off-screen catch-up are derived from deterministic family composition
 * plus existing `CROP_DEFS` — not a second crop lifecycle or profession
 * registry. Seed reserve/surplus is derived from real `Household.items`,
 * never a persisted second stock.
 *
 * @domain settlements-npcs
 * @system household
 */

export function householdAgriculturalCapacity(family: FamilyDef): number {
  return adultProfessionCoverage([family]).farmer
}

export function householdStartingContextFromFamily(family: FamilyDef): HouseholdStartingContext {
  return {
    hasHunter: family.members.some((member) => member.character.role === 'hunter'),
    adultFarmerCount: householdAgriculturalCapacity(family),
  }
}

/** Sowing units needed to fully plant the next production round. */
export function householdSeedReserveRequirement(capacity: number): number {
  return Math.max(0, capacity)
}

/** Real seed stock across every cultivated `seed_*` ItemKind. */
export function householdSeedStockCount(household: Household): number {
  let n = 0
  for (const cropId of FARM_SEED_PRIORITY) n += household.items.count(CROP_SEED_ITEM[cropId])
  return n
}

/**
 * Surplus sowing units above the next-round reserve. Classification only —
 * does not discard recovered seeds or mint a second inventory.
 */
export function householdSeedSurplusCount(household: Household, capacity: number): number {
  return Math.max(0, householdSeedStockCount(household) - householdSeedReserveRequirement(capacity))
}

/**
 * Closed-form completed sowing batches for one crop kind. Cost is O(1) in
 * elapsed time: recovery that at least replaces the consumed seed lifts the
 * seed-count cap, so a long unloaded interval cannot expand into a
 * per-cycle loop.
 */
export function completedAgricultureBatches(input: {
  availableSeeds: number
  recoveredPerHarvest: number
  farmerDays: number
  cycleDays: number
}): number {
  const { availableSeeds, recoveredPerHarvest, farmerDays, cycleDays } = input
  if (availableSeeds <= 0 || farmerDays <= 0 || cycleDays <= 0) return 0
  const maxByTime = Math.floor(farmerDays / cycleDays)
  if (maxByTime <= 0) return 0
  if (recoveredPerHarvest >= 1) return maxByTime
  return Math.min(availableSeeds, maxByTime)
}

/**
 * Bounded off-screen production for one household. Cost is proportional to
 * crop kinds (currently 3), not elapsed world days. Mutates real
 * `Household.items` through `depositFood` so capacity/overflow stay on the
 * existing Household → SettlementEconomy path. Recovered seed is applied as
 * a net change to the same inventory (never by replaying historical cycles).
 */
export function resolveUnloadedHouseholdAgriculture(input: {
  household: Household
  capacity: number
  nowDays: number
  economy?: SettlementEconomy | null
}): void {
  const { household, capacity, nowDays, economy = null } = input
  const lastResolvedAtDays = household.agricultureLastResolvedAtDays()
  const elapsedDays = lastResolvedAtDays === undefined ? 0 : Math.max(0, nowDays - lastResolvedAtDays)
  if (capacity <= 0 || elapsedDays <= 0) {
    household.markAgricultureResolved(nowDays)
    return
  }

  let remainingFarmerDays = elapsedDays * capacity
  for (const cropId of FARM_SEED_PRIORITY) {
    if (remainingFarmerDays <= 0) break
    const def = CROP_DEFS[cropId]
    const cycleDays = def.matureAfterDays
    if (cycleDays <= 0) continue
    const seedKind = CROP_SEED_ITEM[cropId]
    const available = household.items.count(seedKind)
    if (available <= 0) continue
    const recoveredPerHarvest = resolveCultivatedSeedRecovery(def, def.yieldCount)
    const batches = completedAgricultureBatches({
      availableSeeds: available,
      recoveredPerHarvest,
      farmerDays: remainingFarmerDays,
      cycleDays,
    })
    if (batches <= 0) continue
    household.depositFood(def.harvestItem, batches * def.yieldCount, economy, nowDays)
    const netSeeds = batches * (recoveredPerHarvest - 1)
    if (netSeeds > 0) household.items.add(seedKind, netSeeds)
    else if (netSeeds < 0) household.items.remove(seedKind, -netSeeds)
    remainingFarmerDays -= batches * cycleDays
  }

  household.markAgricultureResolved(nowDays)
}

/**
 * Stream-in catch-up for every household of one settlement. Home stays on
 * the detailed Farmer path and never produces through this aggregate.
 */
export function resolveSettlementAgricultureCatchUp(input: {
  isHome: boolean
  families: readonly FamilyDef[]
  households: readonly Household[]
  nowDays: number
  economy?: SettlementEconomy | null
}): void {
  const { isHome, families, households, nowDays, economy = null } = input
  if (isHome) {
    for (const household of households) household.markAgricultureResolved(nowDays)
    return
  }
  for (let i = 0; i < households.length; i++) {
    const household = households[i]!
    const family = families[i]
    const capacity = family ? householdAgriculturalCapacity(family) : 0
    resolveUnloadedHouseholdAgriculture({ household, capacity, nowDays, economy })
  }
}
