import type { Inventory } from './Inventory'
import { ITEM_DEFS, type ItemKind } from './items'
import { merchantPrice, offerValue, sellPrice } from './tradeCatalog'

export type TradeResult = 'ok' | 'cannot_afford' | 'full' | 'not_sold' | 'invalid_offer'

function wouldFitAfter(
  inventory: Inventory,
  removeWeight: number,
  addKind: ItemKind,
  addCount = 1,
): boolean {
  const next = inventory.totalWeight() - removeWeight + ITEM_DEFS[addKind].weight * addCount
  return next <= inventory.maxWeight + 1e-9
}

function offerWeight(offer: Partial<Record<ItemKind, number>>): number {
  let total = 0
  for (const [kind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count > 0) total += ITEM_DEFS[kind].weight * count
  }
  return total
}

function isValidOffer(
  inventory: Inventory,
  offer: Partial<Record<ItemKind, number>>,
): boolean {
  let any = false
  for (const [kind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (!Number.isInteger(count) || count < 0) return false
    if (count === 0) continue
    any = true
    if (!inventory.has(kind, count)) return false
  }
  return any
}

/** Pay `price` shells for one `kind`. Atomic: verify, then remove+add. */
export function buyWithShells(inventory: Inventory, kind: ItemKind): TradeResult {
  const price = merchantPrice(kind)
  if (price == null) return 'not_sold'
  if (!inventory.has('shell', price)) return 'cannot_afford'
  const paymentWeight = ITEM_DEFS.shell.weight * price
  if (!wouldFitAfter(inventory, paymentWeight, kind)) return 'full'
  inventory.remove('shell', price)
  inventory.add(kind, 1)
  return 'ok'
}

/**
 * Swap offered items for one `kind` when combined `tradeValue` covers the
 * list price. Atomic: verify counts + value + weight, then remove+add.
 */
export function buyWithBarter(
  inventory: Inventory,
  kind: ItemKind,
  offer: Partial<Record<ItemKind, number>>,
): TradeResult {
  const price = merchantPrice(kind)
  if (price == null) return 'not_sold'
  if (!isValidOffer(inventory, offer)) return 'invalid_offer'
  if (offerValue(offer) < price) return 'cannot_afford'
  if (!wouldFitAfter(inventory, offerWeight(offer), kind)) return 'full'
  for (const [offerKind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count > 0) inventory.remove(offerKind, count)
  }
  inventory.add(kind, 1)
  return 'ok'
}

/** Sell one `kind` to the merchant for `sellPrice` shells. Atomic. */
export function sellForShells(inventory: Inventory, kind: ItemKind): TradeResult {
  const price = sellPrice(kind)
  if (price == null) return 'not_sold'
  if (!inventory.has(kind, 1)) return 'invalid_offer'
  const removeWeight = ITEM_DEFS[kind].weight
  if (!wouldFitAfter(inventory, removeWeight, 'shell', price)) return 'full'
  inventory.remove(kind, 1)
  inventory.add('shell', price)
  return 'ok'
}
