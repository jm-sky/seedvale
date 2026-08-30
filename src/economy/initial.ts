import type { ItemKind } from '../items/items'
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
 * `Math.random()`. `food` moved to `initialFoodFor` (plan
 * settlements-npcs-008) — it's no longer an `EconomicKind` bulk quantity.
 */
export function initialStockFor(
  seed: SettlementEconomySeed,
): Partial<Record<EconomicKind, number>> {
  const jitter = hashString(seed.id) % 3
  return {
    water: WATER_INITIAL,
    wood: BASE_WOOD[seed.size] + jitter,
  }
}

/** Starting concrete settlement food (plan settlements-npcs-008) — same
 *  `BASE_FOOD`/`dominantResource` magnitude the old scalar `food` used,
 *  converted to a concrete item. `bread` is the existing "abstract food, no
 *  specific producer kind" convention (see `NpcAgent.ts`'s
 *  `HELPER_DELIVERY_ITEM_KIND`), reused here rather than inventing a new
 *  starting-food mapping. Only consulted for a genuinely new settlement
 *  (`EconomyRegistry.getOrCreate` when no carried/saved food snapshot
 *  exists). */
export function initialFoodFor(seed: SettlementEconomySeed): Partial<Record<ItemKind, number>> {
  const foodBonus =
    seed.dominantResource?.type === 'fertile_soil' || seed.dominantResource?.type === 'fish'
      ? 1
      : 0
  const jitter = hashString(`${seed.id}:food`) % 3
  return { bread: BASE_FOOD[seed.foodSourceType] + foodBonus + jitter }
}

export function demandsFor(seed: SettlementEconomySeed): readonly SettlementDemand[] {
  const foodTarget = 4 + Math.min(8, seed.familyCount)
  return [
    { kind: 'wood', target: WOOD_TARGET },
    { kind: 'food', target: foodTarget },
    { kind: 'water', target: WATER_TARGET },
  ]
}
