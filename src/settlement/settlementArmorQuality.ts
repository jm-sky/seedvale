import type { ArmorKind, ArmorQuality } from '../items/itemInstances'
import type { VillageSize } from './families'
import { ARMOR_QUALITIES } from '../items/itemInstances'
import { createSeededRandom } from '../world/parseSeed'

/** Isolated from Merchant profile / assortment / premium streams. */
const SETTLEMENT_ARMOR_QUALITY_SALT = 0x53544151

/**
 * Size-primary armor quality weights shared by Merchant stock and specialist
 * household bootstrap (plans items-player-040 / settlements-npcs-042).
 * Each row sums to 1; no quality is hard-locked.
 *
 * @domain settlements-npcs
 */
export const SETTLEMENT_ARMOR_QUALITY_WEIGHTS: Record<VillageSize, Record<ArmorQuality, number>> = {
  OUTPOST: { poor: 0.50, common: 0.45, good: 0.04, masterwork: 0.01 },
  SM: { poor: 0.42, common: 0.48, good: 0.08, masterwork: 0.02 },
  MD: { poor: 0.18, common: 0.62, good: 0.16, masterwork: 0.04 },
  LG: { poor: 0.10, common: 0.45, good: 0.35, masterwork: 0.10 },
  XL: { poor: 0.05, common: 0.35, good: 0.40, masterwork: 0.20 },
}

export function hashArmorQualityOwner(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function normalizeArmorQualityWeights(weights: Record<ArmorQuality, number>): Record<ArmorQuality, number> {
  const total = ARMOR_QUALITIES.reduce((sum, quality) => sum + weights[quality], 0)
  if (total <= 0) return { ...SETTLEMENT_ARMOR_QUALITY_WEIGHTS.MD }
  const next: Record<ArmorQuality, number> = { poor: 0, common: 0, good: 0, masterwork: 0 }
  for (const quality of ARMOR_QUALITIES) next[quality] = weights[quality] / total
  return next
}

export function pickWeightedArmorQuality(random: () => number, weights: Record<ArmorQuality, number>): ArmorQuality {
  const normalized = normalizeArmorQualityWeights(weights)
  let roll = random()
  for (const quality of ARMOR_QUALITIES) {
    roll -= normalized[quality]
    if (roll < 0) return quality
  }
  return 'common'
}

/**
 * Deterministic settlement-size armor quality for one stocked unit.
 * Merchant-specific premium / weapons-tools bias stays in `merchantTrade.ts`.
 *
 * @domain settlements-npcs
 */
export function resolveSettlementArmorQuality(input: {
  size: VillageSize
  seed: number
  ownerId: string
  kind: ArmorKind
  unitIndex: number
}): ArmorQuality {
  const mixed = (
    input.seed
    ^ SETTLEMENT_ARMOR_QUALITY_SALT
    ^ hashArmorQualityOwner(input.ownerId)
    ^ hashArmorQualityOwner(input.kind)
    ^ Math.imul(input.unitIndex + 1, 0x9e3779b9)
  ) >>> 0
  return pickWeightedArmorQuality(createSeededRandom(mixed), SETTLEMENT_ARMOR_QUALITY_WEIGHTS[input.size])
}
