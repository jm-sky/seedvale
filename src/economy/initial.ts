import type { VillageSize } from '../settlement/families'
import type { FoodSourceType } from '../settlement/villagePlan'
import type { NaturalResource } from '../terrain/naturalResources'
import type { EconomicKind } from './kinds'
import type { SettlementDemand } from './settlementEconomy'

export type SettlementEconomySeed = {
  id: string
  size: VillageSize
  foodSourceType: FoodSourceType
  familyCount: number
  dominantResource: NaturalResource | null
}

const BASE_WOOD: Record<VillageSize, number> = {
  LG: 5,
  MD: 4,
  OUTPOST: 2,
  SM: 3,
  XL: 6,
}

const BASE_FOOD: Record<FoodSourceType, number> = {
  field: 5,
  fishing: 4,
  foraging: 3,
  garden: 3,
}

const WOOD_TARGET = 8
const WATER_TARGET = 6
const WATER_INITIAL = 4

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministic starting stock from settlement identity. Modest on purpose —
 * must not look like an infinite depot. Jitter is a 0–2 hash of `id`, not
 * `Math.random()`.
 */
export function initialStockFor(
  seed: SettlementEconomySeed,
): Partial<Record<EconomicKind, number>> {
  const jitter = hashString(seed.id) % 3
  const foodBonus =
    seed.dominantResource?.type === 'fertile_soil' || seed.dominantResource?.type === 'fish'
      ? 1
      : 0
  return {
    food: BASE_FOOD[seed.foodSourceType] + foodBonus,
    water: WATER_INITIAL,
    wood: BASE_WOOD[seed.size] + jitter,
  }
}

export function demandsFor(seed: SettlementEconomySeed): readonly SettlementDemand[] {
  const foodTarget = 4 + Math.min(8, seed.familyCount)
  return [
    { kind: 'wood', target: WOOD_TARGET },
    { kind: 'food', target: foodTarget },
    { kind: 'water', target: WATER_TARGET },
  ]
}
