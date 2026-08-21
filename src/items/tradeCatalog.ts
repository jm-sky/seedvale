import { isTrapItemInstance, type ItemInstance } from './itemInstances'
import { ITEM_DEFS, type ItemKind } from './items'
import { trapConditionRatio } from './trapItemInstances'

/**
 * Central merchant price list (plan 090, unit = `coin` since issue 035) —
 * coin cost to buy each stocked item. Also used as that item's `tradeValue`
 * for barter. Not sold: raw materials (stone, branches, ores, forage).
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
  long_sword: 50,
  spear: 32,
  short_sword: 40,
  damascus_knife: 90,
  damascus_short_sword: 140,
  masterwork_sword: 160,
  battle_axe: 110,
  waterskin_empty: 10,
  bread: 6,
  cheese: 8,
  dried_meat: 10,
  bandage: 10,
  fishing_rod: 18,
  whetstone: 6,
  short_bow: 45,
  hunting_bow: 75,
  long_bow: 120,
  arrow: 1,
  broadhead_arrow: 2,
  war_arrow: 3,
  chest: 25,
  backpack: 70,
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
  'long_sword',
  'spear',
  'short_sword',
  'damascus_knife',
  'damascus_short_sword',
  'masterwork_sword',
  'battle_axe',
  'waterskin_empty',
  'bread',
  'cheese',
  'dried_meat',
  'bandage',
  'fishing_rod',
  'whetstone',
  'short_bow',
  'hunting_bow',
  'long_bow',
  'arrow',
  'broadhead_arrow',
  'war_arrow',
  'chest',
  'backpack',
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
  damascus_long_sword: 240,
  obsidian_sword: 320,
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

/** Player → merchant sell price in coins. Half of `tradeValue`, at least 1.
 *  `shell` and `coin` cannot be sold (review 105 trade; issue 035 keeps shells
 *  as barter-only so they do not convert 1:1 into coins). */
export function canSell(kind: ItemKind): boolean {
  return kind !== 'shell' && kind !== 'coin'
}

export function sellPrice(kind: ItemKind): number | null {
  if (!canSell(kind)) return null
  return Math.max(1, Math.floor(tradeValue(kind) * 0.5))
}

export function offerValue(offer: Partial<Record<ItemKind, number>>): number {
  let total = 0
  for (const [kind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count > 0) total += tradeValue(kind) * count
  }
  return total
}

/** Central condition discount range (plan 155) — 10–25% off base value. */
export const USAGE_DISCOUNT_MIN = 0.10
export const USAGE_DISCOUNT_RANGE = 0.15

/** Broken trap sell multiplier vs `tradeValue` (plan 155). */
export const BROKEN_SELL_MULTIPLIER = 0.05

export type SellPriceContext = Record<string, never>

/** Merchant buyback for a concrete item instance — price is derived, never stored. */
export function resolveInstanceSellPrice(
  instance: ItemInstance,
  _context?: SellPriceContext,
): number | null {
  if (!canSell(instance.kind)) return null
  const base = tradeValue(instance.kind)
  if (!isTrapItemInstance(instance)) {
    return sellPrice(instance.kind)
  }
  if (instance.durability <= 0) {
    return Math.max(1, Math.floor(base * BROKEN_SELL_MULTIPLIER))
  }
  const condition = trapConditionRatio(instance)
  const usageDiscount = USAGE_DISCOUNT_MIN + USAGE_DISCOUNT_RANGE * (1 - condition)
  const adjusted = base * (1 - usageDiscount)
  return Math.max(1, Math.floor(adjusted * 0.5))
}
