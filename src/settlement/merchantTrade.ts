import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource } from '../terrain/naturalResources'
import type { VillageSize } from './families'
import type { NpcId } from './npcState'
import { createArmorInstance, isArmorKind } from '../items/armorItemInstances'
import { Inventory } from '../items/Inventory'
import {
  ARMOR_QUALITIES,
  type ArmorKind,
  type ArmorQuality,
  isInstanceBackedKind,
} from '../items/itemInstances'
import { hasItemKindCategory, type ItemKind } from '../items/items'
import { createAcquiredInstance } from '../items/trade'
import { MERCHANT_STOCK } from '../items/tradeCatalog'
import { createSeededRandom } from '../world/parseSeed'

/** Isolated from staffing / family / plaza seed streams (plan settlements-012). */
const MERCHANT_PROFILE_SALT = 0x4d535043
const MERCHANT_PREMIUM_SALT = 0x50524d4d
const MERCHANT_ASSORTMENT_SALT = 0x41534f52
/** Isolated from profile / assortment / premium streams (plan items-player-040). */
const MERCHANT_ARMOR_QUALITY_SALT = 0x4152514c

/**
 * Merchant assortment preference — not a `Role`. Traders stay `trader`.
 *
 * @domain settlements
 */
export type MerchantSpecialization =
  | 'general'
  | 'weapons-tools'
  | 'food-materials'
  | 'imports-luxury'

export const MERCHANT_SPECIALIZATIONS: readonly MerchantSpecialization[] = [
  'general',
  'weapons-tools',
  'food-materials',
  'imports-luxury',
]

export type MerchantProfile = {
  npcId: NpcId
  specialization: MerchantSpecialization
  stallIndex: number
}

export type MerchantAssortmentContext = {
  size: VillageSize
  terrain: SettlementTerrain
  seed: number
  dominantResource?: NaturalResource | null
  /** Home/start settlement (`SettlementDef.isHome`) — first merchant gets a starter overlay. */
  isHome?: boolean
}

/**
 * Explicit premium/high-quality classification over existing catalog kinds.
 * Not inferred from price (plan settlements-012 implementation notes).
 */
export const PREMIUM_MERCHANT_KINDS: readonly ItemKind[] = [
  'damascus_knife',
  'damascus_short_sword',
  'masterwork_sword',
  'battle_axe',
  'chainmail',
  'hunting_bow',
  'long_bow',
  'war_arrow',
  'trap_good',
  'map_far',
  'book_riding_advanced',
  'book_archery_advanced',
  'book_survival_advanced',
  'book_traps_advanced',
  'book_sneak_advanced',
  'book_defense_advanced',
]

const PREMIUM_KIND_SET = new Set<ItemKind>(PREMIUM_MERCHANT_KINDS)

/**
 * Guaranteed survival/travel stock on the first home-settlement merchant
 * (`stallIndex === 0`). Overlay after regional assortment — does not replace it.
 */
export const HOME_STARTER_MERCHANT_KINDS: readonly ItemKind[] = [
  'backpack',
  'tent',
  'firestarter',
  'blanket',
  'waterskin_small',
  'knife',
  'axe',
  'pickaxe',
  'bandage',
]

const METAL_KINDS = new Set<ItemKind>([
  'axe',
  'battle_axe',
  'chainmail',
  'damascus_knife',
  'damascus_short_sword',
  'iron_rod',
  'knife',
  'long_sword',
  'masterwork_sword',
  'pan',
  'pickaxe',
  'pitchfork',
  'shears',
  'short_sword',
  'shovel',
  'sickle',
  'spear',
  'whetstone',
])

const HUNTING_KINDS = new Set<ItemKind>([
  'arrow',
  'broadhead_arrow',
  'dried_meat',
  'hunting_bow',
  'knife',
  'leather_armor',
  'long_bow',
  'short_bow',
  'trap_good',
  'trap_simple',
  'war_arrow',
])

const IMPORT_FLAVOR_KINDS = new Set<ItemKind>([
  'backpack',
  'book_archery_advanced',
  'book_archery_basic',
  'book_archery_intermediate',
  'book_defense_advanced',
  'book_defense_basic',
  'book_defense_intermediate',
  'book_riding_advanced',
  'book_riding_basic',
  'book_riding_intermediate',
  'book_sneak_advanced',
  'book_sneak_basic',
  'book_sneak_intermediate',
  'book_survival_advanced',
  'book_survival_basic',
  'book_survival_intermediate',
  'book_traps_advanced',
  'book_traps_basic',
  'book_traps_intermediate',
  'chest',
  'fishing_rod',
  'map_far',
  'map_near',
  'saddlebags',
  'tent',
])

export function isPremiumMerchantGood(kind: ItemKind): boolean {
  return PREMIUM_KIND_SET.has(kind)
}

/** Settlement-level chance of at least one premium good in the merchant network. */
export function premiumAvailabilityChance(size: VillageSize): number {
  switch (size) {
    case 'LG':
      return 0.50
    case 'MD':
      return 0.22
    case 'SM':
      return 0.08
    case 'XL':
      return 0.80
    default:
      return 0
  }
}

function specializationOrder(terrain: SettlementTerrain): MerchantSpecialization[] {
  switch (terrain) {
    case 'forest':
      return ['food-materials', 'weapons-tools', 'general', 'imports-luxury']
    case 'mountain':
      return ['weapons-tools', 'general', 'food-materials', 'imports-luxury']
    case 'ocean':
      return ['imports-luxury', 'general', 'food-materials', 'weapons-tools']
    default:
      return ['general', 'weapons-tools', 'food-materials', 'imports-luxury']
  }
}

/**
 * Deterministic unique-first specialization + stall index for ordered Traders.
 * Duplicate specializations only wrap after the four profiles are used.
 *
 * @domain settlements
 */
export function resolveMerchantProfiles(
  traderNpcIds: readonly NpcId[],
  terrain: SettlementTerrain,
): MerchantProfile[] {
  const ordered = [...traderNpcIds].sort((a, b) => a.localeCompare(b))
  const order = specializationOrder(terrain)
  return ordered.map((npcId, index) => ({
    npcId,
    specialization: order[index % order.length]!,
    stallIndex: index,
  }))
}

export function merchantProfileFor(
  npcId: NpcId,
  traderNpcIds: readonly NpcId[],
  terrain: SettlementTerrain,
): MerchantProfile | null {
  return resolveMerchantProfiles(traderNpcIds, terrain).find((profile) => profile.npcId === npcId) ?? null
}

type RegionalClass = 'local' | 'neutral' | 'import'

function regionalClass(kind: ItemKind, terrain: SettlementTerrain, dominantResource: NaturalResource | null): RegionalClass {
  const metalBoost = dominantResource?.type === 'iron' || dominantResource?.type === 'gold' || dominantResource?.type === 'coal'
  if (terrain === 'mountain' || metalBoost) {
    if (METAL_KINDS.has(kind)) return 'local'
    if (HUNTING_KINDS.has(kind) && !METAL_KINDS.has(kind)) return 'import'
    if (IMPORT_FLAVOR_KINDS.has(kind)) return 'import'
    return 'neutral'
  }
  if (terrain === 'forest') {
    if (HUNTING_KINDS.has(kind)) return 'local'
    if (METAL_KINDS.has(kind) && hasItemKindCategory(kind, 'weapon')) return 'import'
    if (kind === 'chainmail' || kind === 'pickaxe') return 'import'
    return 'neutral'
  }
  if (terrain === 'ocean') {
    if (IMPORT_FLAVOR_KINDS.has(kind) || kind === 'fishing_rod') return 'local'
    if (METAL_KINDS.has(kind) && hasItemKindCategory(kind, 'weapon')) return 'import'
    return 'neutral'
  }
  return 'neutral'
}

/** 0 = ineligible, 1 = acceptable, 2 = preferred. */
export function specializationAffinity(kind: ItemKind, spec: MerchantSpecialization): 0 | 1 | 2 {
  const weaponOrTool = hasItemKindCategory(kind, 'weapon') || hasItemKindCategory(kind, 'tool') || hasItemKindCategory(kind, 'armor')
  const foodOrMaterial = hasItemKindCategory(kind, 'food')
    || kind === 'bandage' || kind === 'herb' || kind === 'iron_rod'
    || kind === 'sewing_kit' || kind === 'rope' || kind === 'whetstone'
    || kind === 'tree_seed' || kind === 'seed_carrot' || kind === 'seed_potato' || kind === 'seed_cabbage'
    || kind === 'waterskin_small' || kind === 'waterskin_medium' || kind === 'waterskin_large'
    || kind === 'wooden_bucket' || kind === 'blanket' || kind === 'firestarter'
    || kind === 'wooden_torch' || kind === 'tent' || kind === 'trap_simple' || kind === 'trap_good'
    || kind === 'fishing_rod'
  const luxury = IMPORT_FLAVOR_KINDS.has(kind) || isPremiumMerchantGood(kind)

  switch (spec) {
    case 'food-materials':
      if (foodOrMaterial) return 2
      if (kind === 'leather_armor' || kind === 'arrow') return 1
      return 0
    case 'general':
      if (isPremiumMerchantGood(kind)) return 1
      return 2
    case 'imports-luxury':
      if (luxury) return 2
      if (hasItemKindCategory(kind, 'utility')) return 1
      return 0
    case 'weapons-tools':
      if (weaponOrTool || kind === 'arrow' || kind === 'broadhead_arrow' || kind === 'war_arrow' || kind === 'whetstone') {
        return isPremiumMerchantGood(kind) ? 2 : 2
      }
      return 0
  }
}

function skuBudget(size: VillageSize): number {
  switch (size) {
    case 'LG':
      return 22
    case 'MD':
      return 16
    case 'SM':
      return 10
    case 'XL':
      return 28
    default:
      return 8
  }
}

function importChance(size: VillageSize): number {
  switch (size) {
    case 'LG':
      return 0.32
    case 'MD':
      return 0.16
    case 'SM':
      return 0.08
    case 'XL':
      return 0.48
    default:
      return 0.05
  }
}

function quantityFor(
  kind: ItemKind,
  region: RegionalClass,
  size: VillageSize,
  premium: boolean,
): number {
  if (premium) return 1
  if (kind === 'arrow' || kind === 'broadhead_arrow') {
    return size === 'XL' ? 12 : size === 'LG' ? 8 : size === 'MD' ? 5 : 3
  }
  const base = size === 'SM' ? 1 : size === 'MD' ? 2 : size === 'LG' ? 3 : 4
  if (region === 'import') return 1
  if (region === 'local') return base
  return Math.max(1, base - 1)
}

function hashId(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Settlement-level premium outcome — one roll per settlement seed, independent
 * of Merchant count (plan settlements-012 §8).
 */
export function settlementHasPremiumOffer(context: MerchantAssortmentContext): boolean {
  if (context.size === 'OUTPOST') return false
  const random = createSeededRandom(context.seed ^ MERCHANT_PREMIUM_SALT)
  return random() < premiumAvailabilityChance(context.size)
}

/**
 * Same settlement-level premium assignment `generateMerchantAssortment` uses.
 * Pure reconstruction of that outcome — not a second premium roll.
 *
 * @domain settlements
 */
export function resolvePremiumMerchantAssignment(
  context: MerchantAssortmentContext,
  profiles: readonly MerchantProfile[],
): { npcId: NpcId, kind: ItemKind } | null {
  if (profiles.length === 0 || !settlementHasPremiumOffer(context)) return null
  const resource = context.dominantResource ?? null
  const pickRandom = createSeededRandom(context.seed ^ MERCHANT_PREMIUM_SALT ^ 0x9e3779b9)
  const candidates = PREMIUM_MERCHANT_KINDS.filter((kind) => MERCHANT_STOCK.includes(kind))
  let total = 0
  const weighted: { kind: ItemKind, weight: number }[] = []
  for (const kind of candidates) {
    const region = regionalClass(kind, context.terrain, resource)
    const bestFit = Math.max(...profiles.map((profile) => specializationAffinity(kind, profile.specialization)))
    const regionWeight = region === 'local' ? 4 : region === 'neutral' ? 2 : 1
    const weight = Math.max(1, bestFit) * regionWeight
    weighted.push({ kind, weight })
    total += weight
  }
  let roll = pickRandom() * total
  let chosen = weighted[0]?.kind ?? 'masterwork_sword'
  for (const entry of weighted) {
    roll -= entry.weight
    if (roll < 0) {
      chosen = entry.kind
      break
    }
  }
  let owner = profiles[0]!
  let best = specializationAffinity(chosen, owner.specialization)
  for (const profile of profiles) {
    const fit = specializationAffinity(chosen, profile.specialization)
    if (fit > best) {
      owner = profile
      best = fit
    }
  }
  return { npcId: owner.npcId, kind: chosen }
}

export function generateMerchantAssortment(
  context: MerchantAssortmentContext,
  profiles: readonly MerchantProfile[],
): Map<NpcId, Partial<Record<ItemKind, number>>> {
  const byNpc = new Map<NpcId, Partial<Record<ItemKind, number>>>()
  for (const profile of profiles) byNpc.set(profile.npcId, {})
  if (profiles.length === 0) return byNpc

  const resource = context.dominantResource ?? null
  const assignedPremium = resolvePremiumMerchantAssignment(context, profiles)

  for (const profile of profiles) {
    const stock: Partial<Record<ItemKind, number>> = {}
    const rng = createSeededRandom(
      context.seed ^ MERCHANT_ASSORTMENT_SALT ^ MERCHANT_PROFILE_SALT ^ hashId(profile.npcId),
    )
    const budget = skuBudget(context.size)
    const picked: ItemKind[] = []

    if (assignedPremium?.npcId === profile.npcId) {
      stock[assignedPremium.kind] = 1
      picked.push(assignedPremium.kind)
    }

    for (const kind of MERCHANT_STOCK) {
      if (picked.length >= budget) break
      if (stock[kind]) continue
      const affinity = specializationAffinity(kind, profile.specialization)
      if (affinity === 0) continue
      if (isPremiumMerchantGood(kind)) continue
      const region = regionalClass(kind, context.terrain, resource)
      if (region === 'import' && rng() >= importChance(context.size)) continue
      if (region === 'neutral' && affinity < 2 && rng() < 0.35) continue
      stock[kind] = quantityFor(kind, region, context.size, false)
      picked.push(kind)
    }

    byNpc.set(profile.npcId, stock)
  }

  if (context.isHome) {
    const first = profiles.find((profile) => profile.stallIndex === 0)
    if (first) {
      const stock = byNpc.get(first.npcId) ?? {}
      for (const kind of HOME_STARTER_MERCHANT_KINDS) {
        if ((stock[kind] ?? 0) <= 0) stock[kind] = 1
      }
      byNpc.set(first.npcId, stock)
    }
  }

  return byNpc
}

export function merchantStockQuantity(stock: Inventory, kind: ItemKind): number {
  return isInstanceBackedKind(kind) ? stock.countInstances(kind) : stock.count(kind)
}

/** Size-primary quality weights. Each row sums to 1; no quality is hard-locked. */
export const MERCHANT_ARMOR_QUALITY_WEIGHTS: Record<VillageSize, Record<ArmorQuality, number>> = {
  OUTPOST: { poor: 0.50, common: 0.45, good: 0.04, masterwork: 0.01 },
  SM: { poor: 0.42, common: 0.48, good: 0.08, masterwork: 0.02 },
  MD: { poor: 0.18, common: 0.62, good: 0.16, masterwork: 0.04 },
  LG: { poor: 0.10, common: 0.45, good: 0.35, masterwork: 0.10 },
  XL: { poor: 0.05, common: 0.35, good: 0.40, masterwork: 0.20 },
}

/** Premium-assigned armor is a distinct specimen — minimum `good`, not a second roll. */
const PREMIUM_ARMOR_QUALITY_WEIGHTS: Record<ArmorQuality, number> = {
  poor: 0,
  common: 0,
  good: 0.62,
  masterwork: 0.38,
}

export type MerchantArmorQualityContext = {
  size: VillageSize
  seed: number
  npcId: NpcId
  specialization: MerchantSpecialization
  premiumAssignedKind?: ItemKind | null
}

function normalizeQualityWeights(weights: Record<ArmorQuality, number>): Record<ArmorQuality, number> {
  const total = ARMOR_QUALITIES.reduce((sum, quality) => sum + weights[quality], 0)
  if (total <= 0) return { ...MERCHANT_ARMOR_QUALITY_WEIGHTS.MD }
  const next: Record<ArmorQuality, number> = { poor: 0, common: 0, good: 0, masterwork: 0 }
  for (const quality of ARMOR_QUALITIES) next[quality] = weights[quality] / total
  return next
}

/** Shift probability mass one step up the quality ladder — not a second roll. */
function applyWeaponsToolsQualityBias(weights: Record<ArmorQuality, number>): Record<ArmorQuality, number> {
  return normalizeQualityWeights({
    poor: weights.poor * 0.75,
    common: weights.common * 0.75 + weights.poor * 0.25,
    good: weights.good * 0.75 + weights.common * 0.25,
    masterwork: weights.masterwork + weights.good * 0.25,
  })
}

function pickArmorQuality(random: () => number, weights: Record<ArmorQuality, number>): ArmorQuality {
  const normalized = normalizeQualityWeights(weights)
  let roll = random()
  for (const quality of ARMOR_QUALITIES) {
    roll -= normalized[quality]
    if (roll < 0) return quality
  }
  return 'common'
}

/**
 * Deterministic Merchant armor quality for one stocked unit.
 * Size is the primary signal; `weapons-tools` is a bounded bias; premium
 * assignment strongly biases toward `good`/`masterwork` without a second system.
 *
 * @domain settlements
 */
export function resolveMerchantArmorQuality(input: {
  size: VillageSize
  specialization: MerchantSpecialization
  seed: number
  npcId: string
  kind: ArmorKind
  unitIndex: number
  premiumAssigned: boolean
}): ArmorQuality {
  const mixed = (
    input.seed
    ^ MERCHANT_ARMOR_QUALITY_SALT
    ^ hashId(input.npcId)
    ^ hashId(input.kind)
    ^ Math.imul(input.unitIndex + 1, 0x9e3779b9)
  ) >>> 0
  const random = createSeededRandom(mixed)
  let weights = input.premiumAssigned
    ? { ...PREMIUM_ARMOR_QUALITY_WEIGHTS }
    : { ...MERCHANT_ARMOR_QUALITY_WEIGHTS[input.size] }
  if (input.specialization === 'weapons-tools') weights = applyWeaponsToolsQualityBias(weights)
  return pickArmorQuality(random, weights)
}

export function seedMerchantStockIfNeeded(
  stock: Inventory,
  initialized: { merchantStockInitialized: boolean },
  quantities: Partial<Record<ItemKind, number>>,
  qualityContext?: MerchantArmorQualityContext,
): void {
  if (initialized.merchantStockInitialized) return
  for (const [kind, count] of Object.entries(quantities) as [ItemKind, number][]) {
    if (!count || count <= 0) continue
    if (isArmorKind(kind)) {
      for (let i = 0; i < count; i++) {
        const quality = qualityContext
          ? resolveMerchantArmorQuality({
            size: qualityContext.size,
            specialization: qualityContext.specialization,
            seed: qualityContext.seed,
            npcId: qualityContext.npcId,
            kind,
            unitIndex: i,
            premiumAssigned: qualityContext.premiumAssignedKind === kind,
          })
          : 'common'
        stock.addInstance(createArmorInstance(kind, quality))
      }
      continue
    }
    if (isInstanceBackedKind(kind)) {
      for (let i = 0; i < count; i++) {
        const instance = createAcquiredInstance(kind)
        if (instance) stock.addInstance(instance)
      }
    } else {
      stock.add(kind, count)
    }
  }
  initialized.merchantStockInitialized = true
}
