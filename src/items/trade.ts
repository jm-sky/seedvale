import type { Inventory } from './Inventory'
import {
  isInstanceBackedKind,
  isTrapItemInstance,
  isWeaponItemInstance,
  isWeaponMaintenanceKind,
  type ItemInstance,
  type TrapItemInstance,
} from './itemInstances'
import { ITEM_DEFS, type ItemKind } from './items'
import {
  merchantPrice,
  offerValue,
  resolveInstanceSellPrice,
  sellPrice,
} from './tradeCatalog'
import { createTrapInstance, trapConditionRatio } from './trapItemInstances'
import { createWeaponInstance } from './weaponMaintenance'

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

function offerWeight(offer: Partial<Record<ItemKind, number>>): number {
  let total = 0
  for (const [kind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count > 0) total += ITEM_DEFS[kind].weight * count
  }
  return total
}

/** `inventory.has()`'s stack-count check misses instance-backed kinds (knives,
 *  swords, axes, traps — plan 161 moved these into `instances`), which would
 *  otherwise make every such kind unofferable in barter despite the offer
 *  panel listing it (`inventoryCountsForUi` merges instance counts in). */
function offerHasEnough(inventory: Inventory, kind: ItemKind, count: number): boolean {
  if (isInstanceBackedKind(kind)) return inventory.countInstances(kind) >= count
  return inventory.has(kind, count)
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
    if (!offerHasEnough(inventory, kind, count)) return false
  }
  return any
}

/** Removes an already-validated offer from `inventory` — instance-backed
 *  kinds give up their worst-condition units first (mirrors
 *  `selectInstancesToSell`'s ordering for a direct coin sale). */
function removeOffer(inventory: Inventory, offer: Partial<Record<ItemKind, number>>): void {
  for (const [offerKind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count <= 0) continue
    if (isInstanceBackedKind(offerKind)) {
      for (const id of selectInstancesToSell(inventory.getInstances(offerKind), count)) {
        inventory.removeInstance(id)
      }
    } else {
      inventory.remove(offerKind, count)
    }
  }
}

/** Single dispatch point from an `ItemKind` to the instance it should become
 *  on acquisition — reused by merchant purchase (below), quest rewards and
 *  world pickups (`app/createApp.ts`'s `grantItem`, `app/gameLoop.ts`'s item
 *  pickup) so no call site hard-codes which kinds are instance-backed. */
export function createAcquiredInstance(kind: ItemKind): ItemInstance | null {
  if (kind === 'trap_simple' || kind === 'trap_good') return createTrapInstance(kind)
  if (isWeaponMaintenanceKind(kind)) return createWeaponInstance(kind)
  return null
}

/** Overall `[0,1]` condition used only to order which instance sells/drops
 *  first — not a price input (`resolveInstanceSellPrice` decides that). */
function conditionRatio(instance: ItemInstance): number {
  if (isTrapItemInstance(instance)) return trapConditionRatio(instance)
  if (isWeaponItemInstance(instance)) return (instance.durability + instance.sharpness) / 2
  return 1
}

/** Ascending condition — worst first; tie-break on stable id. */
export function selectInstancesToSell(
  instances: readonly ItemInstance[],
  count: number,
): string[] {
  if (count <= 0) return []
  const sorted = [...instances].sort((a, b) => {
    const ca = conditionRatio(a)
    const cb = conditionRatio(b)
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

/** Adds `count` freshly acquired units of `kind` to `inventory` — instance-backed
 *  kinds (weapons, traps) get `count` distinct instances, stackable kinds get
 *  a single stack bump. Assumes payment has already been validated/removed. */
function addPurchased(inventory: Inventory, kind: ItemKind, count: number): void {
  if (isInstanceBackedKind(kind)) {
    for (let i = 0; i < count; i++) {
      const purchased = createAcquiredInstance(kind)
      if (purchased) inventory.addInstance(purchased)
    }
    return
  }
  inventory.add(kind, count)
}

/** Pay `price × count` coins for `count` unit(s) of `kind`. Atomic: verify, then remove+add. */
export function buyWithCoins(inventory: Inventory, kind: ItemKind, count = 1): TradeResult {
  const unitPrice = merchantPrice(kind)
  if (unitPrice == null) return 'not_sold'
  const totalPrice = unitPrice * count
  if (!inventory.has('coin', totalPrice)) return 'cannot_afford'
  const paymentWeight = ITEM_DEFS.coin.weight * totalPrice
  if (!wouldFitAfter(inventory, paymentWeight, kind, count)) return 'full'
  inventory.remove('coin', totalPrice)
  addPurchased(inventory, kind, count)
  return 'ok'
}

/**
 * Swap offered items for `count` unit(s) of `kind` when combined `tradeValue`
 * covers `price × count`. Atomic: verify counts + value + weight, then remove+add.
 */
export function buyWithBarter(
  inventory: Inventory,
  kind: ItemKind,
  offer: Partial<Record<ItemKind, number>>,
  count = 1,
): TradeResult {
  const unitPrice = merchantPrice(kind)
  if (unitPrice == null) return 'not_sold'
  if (!isValidOffer(inventory, offer)) return 'invalid_offer'
  if (offerValue(offer) < unitPrice * count) return 'cannot_afford'
  if (!wouldFitAfter(inventory, offerWeight(offer), kind, count)) return 'full'
  removeOffer(inventory, offer)
  addPurchased(inventory, kind, count)
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
