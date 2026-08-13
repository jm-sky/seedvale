import { ITEM_DEFS, type ItemKind } from './items'

/**
 * Central merchant price list (plan 090) — shell cost to buy each stocked
 * item. Also used as that item's `tradeValue` for barter. Not sold: raw
 * materials (stone, branches, ores, forage).
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
  long_sword: 50,
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
  'long_sword',
]

/** Fallback shell-equivalent for items the merchant does not stock. */
const RESOURCE_TRADE_VALUE: Partial<Record<ItemKind, number>> = {
  shell: 1,
  stone: 1,
  branch: 1,
  cone: 1,
  mushroom: 2,
  flower: 2,
  coal: 4,
  iron: 6,
  gold: 20,
}

export function merchantPrice(kind: ItemKind): number | null {
  return MERCHANT_PRICES[kind] ?? null
}

export function isMerchantStock(kind: ItemKind): boolean {
  return merchantPrice(kind) != null
}

/** Shared barter value in shells. Stocked goods use their list price. */
export function tradeValue(kind: ItemKind): number {
  const listed = MERCHANT_PRICES[kind]
  if (listed != null) return listed
  const resource = RESOURCE_TRADE_VALUE[kind]
  if (resource != null) return resource
  return Math.max(1, Math.round(ITEM_DEFS[kind].weight * 4))
}

export function offerValue(offer: Partial<Record<ItemKind, number>>): number {
  let total = 0
  for (const [kind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count > 0) total += tradeValue(kind) * count
  }
  return total
}
