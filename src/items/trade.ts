import type { Inventory } from './Inventory'
import { isInstanceBackedKind, isTrapItemInstance, type ItemInstance, type TrapItemInstance } from './itemInstances'
import { ITEM_DEFS, type ItemKind } from './items'
import {
  merchantPrice,
  offerValue,
  resolveInstanceSellPrice,
  sellPrice,
} from './tradeCatalog'
import { createTrapInstance, trapConditionRatio } from './trapItemInstances'

export type TradeResult = 'ok' | 'cannot_afford' | 'full' | 'not_sold' | 'invalid_offer'

export type InstanceSellResult =
  | { result: 'ok', totalCoins: number, soldIds: readonly string[] }
  | { result: Exclude<TradeResult, 'ok'> }

function wouldFitAfter(
  inventory: Inventory,
  removeWeight: number,
  addKind: ItemKind,
  addCount = 1,
): boolean {
  const next = inventory.totalWeight() - removeWeight + ITEM_DEFS[addKind].weight * addCount
  return next <= inventory.maxWeight + 1e-9
}

function wouldFitAfterInstance(
  inventory: Inventory,
  removeWeight: number,
  instance: ItemInstance,
): boolean {
  const next = inventory.totalWeight() - removeWeight + ITEM_DEFS[instance.kind].weight
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

function createPurchasedInstance(kind: ItemKind): ItemInstance | null {
  if (kind === 'trap_simple' || kind === 'trap_good') return createTrapInstance(kind)
  return null
}

/** Ascending condition — worst first; tie-break on stable id. */
export function selectInstancesToSell(
  instances: readonly ItemInstance[],
  count: number,
): string[] {
  if (count <= 0) return []
  const sorted = [...instances].sort((a, b) => {
    const ca = isTrapItemInstance(a) ? trapConditionRatio(a) : 1
    const cb = isTrapItemInstance(b) ? trapConditionRatio(b) : 1
    if (ca !== cb) return ca - cb
    return a.id.localeCompare(b.id)
  })
  return sorted.slice(0, count).map((inst) => inst.id)
}

/** Pick a placeable trap instance — prefer lowest durability (use worn traps first). */
export function selectInstanceToPlace(instances: readonly TrapItemInstance[]): TrapItemInstance | null {
  const placeable = instances.filter((inst) => inst.durability > 0)
  if (placeable.length === 0) return null
  const sorted = [...placeable].sort((a, b) => {
    const diff = trapConditionRatio(a) - trapConditionRatio(b)
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
  return sorted[0] ?? null
}

/** Pay `price` coins for one `kind`. Atomic: verify, then remove+add. */
export function buyWithCoins(inventory: Inventory, kind: ItemKind): TradeResult {
  const price = merchantPrice(kind)
  if (price == null) return 'not_sold'
  if (!inventory.has('coin', price)) return 'cannot_afford'
  const paymentWeight = ITEM_DEFS.coin.weight * price
  const purchased = createPurchasedInstance(kind)
  if (purchased) {
    if (!wouldFitAfterInstance(inventory, paymentWeight, purchased)) return 'full'
    inventory.remove('coin', price)
    if (!inventory.addInstance(purchased)) return 'full'
    return 'ok'
  }
  if (!wouldFitAfter(inventory, paymentWeight, kind)) return 'full'
  inventory.remove('coin', price)
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
  const purchased = createPurchasedInstance(kind)
  if (purchased) {
    if (!wouldFitAfterInstance(inventory, offerWeight(offer), purchased)) return 'full'
    for (const [offerKind, count] of Object.entries(offer) as [ItemKind, number][]) {
      if (count > 0) inventory.remove(offerKind, count)
    }
    if (!inventory.addInstance(purchased)) return 'full'
    return 'ok'
  }
  if (!wouldFitAfter(inventory, offerWeight(offer), kind)) return 'full'
  for (const [offerKind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count > 0) inventory.remove(offerKind, count)
  }
  inventory.add(kind, 1)
  return 'ok'
}

/** Sell one `kind` to the merchant for `sellPrice` coins. Atomic. */
export function sellForCoins(inventory: Inventory, kind: ItemKind): TradeResult {
  if (isInstanceBackedKind(kind)) {
    const ids = selectInstancesToSell(inventory.getInstances(kind), 1)
    if (ids.length === 0) return 'invalid_offer'
    return sellInstancesForCoins(inventory, ids).result
  }
  const price = sellPrice(kind)
  if (price == null) return 'not_sold'
  if (!inventory.has(kind, 1)) return 'invalid_offer'
  const removeWeight = ITEM_DEFS[kind].weight
  if (!wouldFitAfter(inventory, removeWeight, 'coin', price)) return 'full'
  inventory.remove(kind, 1)
  inventory.add('coin', price)
  return 'ok'
}

/** Sell concrete instances by id. Validates and prices before any mutation. */
export function sellInstancesForCoins(
  inventory: Inventory,
  instanceIds: readonly string[],
): InstanceSellResult {
  if (instanceIds.length === 0) return { result: 'invalid_offer' }
  const unique = [...new Set(instanceIds)]
  const instances: ItemInstance[] = []
  let totalCoins = 0
  let removeWeight = 0
  for (const id of unique) {
    const instance = inventory.getInstance(id)
    if (!instance) return { result: 'invalid_offer' }
    const price = resolveInstanceSellPrice(instance)
    if (price == null) return { result: 'not_sold' }
    instances.push(instance)
    totalCoins += price
    removeWeight += ITEM_DEFS[instance.kind].weight
  }
  if (!wouldFitAfter(inventory, removeWeight, 'coin', totalCoins)) {
    return { result: 'full' }
  }
  for (const id of unique) {
    if (!inventory.removeInstance(id)) return { result: 'invalid_offer' }
  }
  inventory.add('coin', totalCoins)
  return { result: 'ok', totalCoins, soldIds: unique }
}
