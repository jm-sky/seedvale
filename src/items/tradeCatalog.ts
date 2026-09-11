import type { RelationLevel } from '../quests/quests'
import { NEUTRAL_REPUTATION, type Reputation } from '../reputation/ReputationManager'
import { isTentItemInstance, isTrapItemInstance, type ItemInstance } from './itemInstances'
import { ITEM_DEFS, type ItemKind } from './items'
import { trapConditionRatio } from './trapItemInstances'

/**
 * Central merchant price list (plan 090, unit = `coin` since issue 035) —
 * coin cost to buy each stocked item. Also used as that item's `tradeValue`
 * for barter. Not sold: raw materials (stone, branches, ores, forage) except
 * `herb`, stocked as a reachability fallback (plan quests-progression-018).
 * Shells stay barter-only (`canSell('shell')` is false).
 */
export const MERCHANT_PRICES: Readonly<Partial<Record<ItemKind, number>>> = {
  firestarter: 8,
  wooden_torch: 8,
  blanket: 10,
  knife: 12,
  pitchfork: 12,
  sickle: 12,
  shovel: 20,
  axe: 25,
  pickaxe: 30,
  tent: 30,
  trap_simple: 14,
  trap_good: 36,
  pan: 15,
  iron_rod: 8,
  long_sword: 50,
  spear: 32,
  short_sword: 40,
  damascus_knife: 90,
  damascus_short_sword: 140,
  masterwork_sword: 160,
  battle_axe: 110,
  waterskin_small: 8,
  waterskin_medium: 14,
  waterskin_large: 22,
  wooden_bucket: 12,
  bread: 6,
  cheese: 8,
  dried_meat: 10,
  bandage: 10,
  // Plan quests-progression-018 — buyable fallback for `ziola-dla-anny`.
  // Priced above the quest reward (3×5=15 > 8) so gathering stays better.
  herb: 5,
  fishing_rod: 18,
  whetstone: 6,
  sewing_kit: 18,
  short_bow: 45,
  hunting_bow: 75,
  long_bow: 120,
  arrow: 1,
  broadhead_arrow: 2,
  war_arrow: 3,
  chest: 25,
  backpack: 70,
  saddlebags: 55,
  tree_seed: 6,
  seed_carrot: 4,
  seed_potato: 4,
  seed_cabbage: 4,
  // Plan world-012 — knowledge-delivery tokens (§9/§10), priced by range.
  map_near: 15,
  map_far: 35,
  // Plan world-004 — needed to use (not build) a deep player-built well.
  rope: 10,
  // Plan items-player-016 — skill books, priced by tier (30/60/120 riding,
  // 25/55/110 archery/defense, 20/50/100 survival/traps/sneak per the plan).
  book_riding_basic: 30,
  book_riding_intermediate: 60,
  book_riding_advanced: 120,
  book_archery_basic: 25,
  book_archery_intermediate: 55,
  book_archery_advanced: 110,
  book_survival_basic: 20,
  book_survival_intermediate: 50,
  book_survival_advanced: 100,
  book_traps_basic: 20,
  book_traps_intermediate: 50,
  book_traps_advanced: 100,
  book_sneak_basic: 20,
  book_sneak_intermediate: 50,
  book_sneak_advanced: 100,
  book_defense_basic: 25,
  book_defense_intermediate: 55,
  book_defense_advanced: 110,
}

/** Display order for the trade screen — matches the plan 090 mockup. */
export const MERCHANT_STOCK: readonly ItemKind[] = [
  'knife',
  'firestarter',
  'blanket',
  'shovel',
  'axe',
  'pitchfork',
  'sickle',
  'wooden_torch',
  'pickaxe',
  'tent',
  'trap_simple',
  'trap_good',
  'pan',
  'iron_rod',
  'long_sword',
  'spear',
  'short_sword',
  'damascus_knife',
  'damascus_short_sword',
  'masterwork_sword',
  'battle_axe',
  'waterskin_small',
  'waterskin_medium',
  'waterskin_large',
  'wooden_bucket',
  'bread',
  'cheese',
  'dried_meat',
  'bandage',
  'herb',
  'fishing_rod',
  'whetstone',
  'sewing_kit',
  'short_bow',
  'hunting_bow',
  'long_bow',
  'arrow',
  'broadhead_arrow',
  'war_arrow',
  'chest',
  'backpack',
  'saddlebags',
  'tree_seed',
  'seed_carrot',
  'seed_potato',
  'seed_cabbage',
  'map_near',
  'map_far',
  'rope',
  'book_riding_basic',
  'book_riding_intermediate',
  'book_riding_advanced',
  'book_archery_basic',
  'book_archery_intermediate',
  'book_archery_advanced',
  'book_survival_basic',
  'book_survival_intermediate',
  'book_survival_advanced',
  'book_traps_basic',
  'book_traps_intermediate',
  'book_traps_advanced',
  'book_sneak_basic',
  'book_sneak_intermediate',
  'book_sneak_advanced',
  'book_defense_basic',
  'book_defense_intermediate',
  'book_defense_advanced',
]

/** Fallback coin-equivalent for items the merchant does not stock. */
const RESOURCE_TRADE_VALUE: Partial<Record<ItemKind, number>> = {
  shell: 1,
  stone: 1,
  branch: 1,
  cone: 1,
  mushroom: 2,
  flower: 2,
  herb: 3,
  coal: 4,
  iron: 6,
  gold: 20,
  ruby_small: 30,
  ruby_medium: 70,
  ruby_large: 150,
  diamond_small: 80,
  diamond_medium: 180,
  diamond_large: 400,
  damascus_long_sword: 240,
  obsidian_sword: 320,
}

/** @domain settlements — neutral social standing for merchant sell pricing. */
export const NEUTRAL_SELL_PRICE_CONTEXT: Readonly<SellPriceContext> = Object.freeze({
  relation: 0,
  relationLevel: 'stranger',
  reputation: NEUTRAL_REPUTATION,
  renown: 0,
})

/** @domain settlements — full-condition sell factor bounds (plan settlements-006). */
export const BASE_SELL_FACTOR = 0.90
export const MIN_SELL_FACTOR = 0.80
export const MAX_SELL_FACTOR = 1.05

export type SellPriceContext = {
  relation: number
  relationLevel: RelationLevel
  reputation: Readonly<Reputation>
  renown: number
}

export function merchantPrice(kind: ItemKind): number | null {
  return MERCHANT_PRICES[kind] ?? null
}

export function isMerchantStock(kind: ItemKind): boolean {
  return merchantPrice(kind) != null
}

/** Shared barter value in coins. Stocked goods use their list price. */
export function tradeValue(kind: ItemKind): number {
  const listed = MERCHANT_PRICES[kind]
  if (listed != null) return listed
  const resource = RESOURCE_TRADE_VALUE[kind]
  if (resource != null) return resource
  return Math.max(1, Math.round(ITEM_DEFS[kind].weight * 4))
}

/** Player → merchant sell price in coins. `shell` and `coin` cannot be sold
 *  (review 105 trade; issue 035 keeps shells as barter-only so they do not
 *  convert 1:1 into coins). */
export function canSell(kind: ItemKind): boolean {
  return kind !== 'shell' && kind !== 'coin'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** @domain settlements — relation tier bonus in percentage points (0.01 = 1 pp). */
export function relationshipEffect(context: SellPriceContext): number {
  if (context.relation >= 0) {
    switch (context.relationLevel) {
      case 'acquainted': return 0.01
      case 'friendly': return 0.03
      case 'trusted': return 0.05
      default: return 0
    }
  }
  return clamp(context.relation * 0.01, -0.05, 0)
}

/** @domain settlements — weighted reputation × renown amplification (percentage points). */
export function reputationEffect(context: SellPriceContext): number {
  const reputationScore =
    context.reputation.trust * 0.40
    + context.reputation.integrity * 0.40
    + context.reputation.competence * 0.20
  const reputationNormalized = reputationScore / 100
  const renownFactor = 1 + context.renown / 100
  return reputationNormalized * 0.05 * renownFactor
}

/** @domain settlements — sell factor for a full-condition item before durability scaling. */
export function fullConditionSellFactor(context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT): number {
  return clamp(
    BASE_SELL_FACTOR + relationshipEffect(context) + reputationEffect(context),
    MIN_SELL_FACTOR,
    MAX_SELL_FACTOR,
  )
}

/** @domain settlements — deterministic integer coin rounding shared by stack and instance pricing. */
export function roundSellPrice(nominalValue: number): number {
  return Math.max(1, Math.floor(nominalValue))
}

function capStockedBuyback(kind: ItemKind, price: number): number {
  const stockPrice = merchantPrice(kind)
  return stockPrice != null ? Math.min(price, stockPrice) : price
}

/** @domain settlements — merchant buyback for a stackable kind at full condition. */
export function sellPrice(
  kind: ItemKind,
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): number | null {
  if (!canSell(kind)) return null
  const nominal = tradeValue(kind)
  const raw = nominal * fullConditionSellFactor(context)
  return roundSellPrice(capStockedBuyback(kind, raw))
}

export function offerValue(offer: Partial<Record<ItemKind, number>>): number {
  let total = 0
  for (const [kind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count > 0) total += tradeValue(kind) * count
  }
  return total
}

/** Broken trap sell multiplier vs `tradeValue` (plan 155). */
export const BROKEN_SELL_MULTIPLIER = 0.05

/** @domain settlements — merchant buyback for a concrete item instance — price is derived, never stored. */
export function resolveInstanceSellPrice(
  instance: ItemInstance,
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): number | null {
  if (!canSell(instance.kind)) return null
  const nominal = tradeValue(instance.kind)
  if (isTrapItemInstance(instance)) {
    if (instance.durability <= 0) {
      return roundSellPrice(nominal * BROKEN_SELL_MULTIPLIER)
    }
    const condition = trapConditionRatio(instance)
    const raw = nominal * fullConditionSellFactor(context) * condition
    return roundSellPrice(capStockedBuyback(instance.kind, raw))
  }
  if (isTentItemInstance(instance)) {
    const condition = Math.max(0, Math.min(1, instance.condition / 100))
    const raw = nominal * fullConditionSellFactor(context) * condition
    return roundSellPrice(capStockedBuyback(instance.kind, raw))
  }
  return sellPrice(instance.kind, context)
}
