import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { FamilyDef } from './families'
import type { Household, HouseholdStartingContext } from './household'
import { CROP_DEFS } from '../world/cropLifecycle'
import { CROP_SEED_ITEM, FARM_SEED_PRIORITY } from '../world/plantedCrops'
import { adultProfessionCoverage } from './professionStaffing'

/**
 * Non-home settlement agriculture v1 (plan settlements-npcs-030).
 * Capacity and off-screen catch-up are derived from deterministic family
 * composition plus existing `CROP_DEFS` — not a second crop lifecycle or
 * profession registry.
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

/**
 * Bounded off-screen production for one household. Cost is proportional to
 * crop kinds (currently 3), not elapsed world days. Mutates real
 * `Household.items` through `depositFood` so capacity/overflow stay on the
 * existing Household → SettlementEconomy path.
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
    const batches = Math.min(available, Math.floor(remainingFarmerDays / cycleDays))
    if (batches <= 0) continue
    if (!household.items.remove(seedKind, batches, nowDays)) continue
    household.depositFood(def.harvestItem, batches * def.yieldCount, economy, nowDays)
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
