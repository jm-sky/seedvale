import type { Inventory } from './Inventory'
import { createArmorInstance, isArmorKind } from './armorItemInstances'
import {
  createKeyInstance,
  createTentInstance,
  isInstanceBackedKind,
  isLiquidContainerKind,
  isTentItemInstance,
  isTrapItemInstance,
  isTrapKind,
  isWeaponItemInstance,
  isWeaponMaintenanceKind,
  type ItemInstance,
  type TrapItemInstance,
} from './itemInstances'
import { ITEM_DEFS, type ItemKind, itemSizeUnits } from './items'
import { createLiquidContainerInstance } from './liquidContainer'
import {
  canSell,
  merchantPrice,
  NEUTRAL_SELL_PRICE_CONTEXT,
  resolveInstanceSellPrice,
  sellPrice,
  type SellPriceContext,
  tradeValue,
} from './tradeCatalog'
import { createTrapInstance, trapConditionRatio } from './trapItemInstances'
import { createWeaponInstance } from './weaponMaintenance'

export type TradeResult = 'ok' | 'cannot_afford' | 'full' | 'not_sold' | 'invalid_offer'

export type InstanceSellResult =
  | { result: 'ok', totalCoins: number, soldIds: readonly string[] }
  | { result: Exclude<TradeResult, 'ok'> }

export type OfferBuybackResolution = {
  buybackValue: number
  nonSellableBarterValue: number
  instanceIdsByKind: Partial<Record<ItemKind, readonly string[]>>
}

/** Weight and gabarite are independent caps (plan 164 §10) — a trade must
 *  clear both after removing payment/offer and adding the purchased kind, or
 *  `Inventory.add`/`addInstance` silently no-ops post-payment (coins/offer
 *  already gone, nothing received). */
function wouldFitAfter(
  inventory: Inventory,
  removeWeight: number,
  removeSize: number,
  addKind: ItemKind,
  addCount = 1,
): boolean {
  const nextWeight = inventory.totalWeight() - removeWeight + ITEM_DEFS[addKind].weight * addCount
  const nextSize = inventory.totalSize() - removeSize + itemSizeUnits(addKind) * addCount
  return nextWeight <= inventory.maxWeight + 1e-9 && nextSize <= inventory.maxSize + 1e-9
}

/** Total weight/size carried by a kind→count record (an offer or a purchase
 *  list) — shared by `wouldFitAfterTransaction` for both directions. */
function recordWeight(record: Partial<Record<ItemKind, number>>): number {
  let total = 0
  for (const [kind, count] of Object.entries(record) as [ItemKind, number][]) {
    if (count > 0) total += ITEM_DEFS[kind].weight * count
  }
  return total
}

function recordSize(record: Partial<Record<ItemKind, number>>): number {
  let total = 0
  for (const [kind, count] of Object.entries(record) as [ItemKind, number][]) {
    if (count > 0) total += itemSizeUnits(kind) * count
  }
  return total
}

/** Generalized `wouldFitAfter` for `settleTransaction` — nets weight/size
 *  deltas across every offer removal, every purchase addition and the coin
 *  settlement in one pass, instead of one remove-kind/one-add-kind. */
function wouldFitAfterTransaction(
  inventory: Inventory,
  offer: Partial<Record<ItemKind, number>>,
  purchases: Partial<Record<ItemKind, number>>,
  netCoins: number,
): boolean {
  const coinRecord: Partial<Record<ItemKind, number>> = netCoins > 0 ? { coin: netCoins } : {}
  const receivedCoinRecord: Partial<Record<ItemKind, number>> = netCoins < 0 ? { coin: -netCoins } : {}
  const removeWeight = recordWeight(offer) + recordWeight(coinRecord)
  const removeSize = recordSize(offer) + recordSize(coinRecord)
  const addWeight = recordWeight(purchases) + recordWeight(receivedCoinRecord)
  const addSize = recordSize(purchases) + recordSize(receivedCoinRecord)
  const nextWeight = inventory.totalWeight() - removeWeight + addWeight
  const nextSize = inventory.totalSize() - removeSize + addSize
  return nextWeight <= inventory.maxWeight + 1e-9 && nextSize <= inventory.maxSize + 1e-9
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
 *  kinds give up the instances chosen during offer resolution. */
function removeOffer(
  inventory: Inventory,
  offer: Partial<Record<ItemKind, number>>,
  instanceIdsByKind: Partial<Record<ItemKind, readonly string[]>>,
): void {
  for (const [offerKind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count <= 0) continue
    if (isInstanceBackedKind(offerKind)) {
      const ids = instanceIdsByKind[offerKind] ?? selectInstancesToSell(inventory.getInstances(offerKind), count)
      for (const id of ids) inventory.removeInstance(id)
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
  if (isTrapKind(kind)) return createTrapInstance(kind)
  if (isWeaponMaintenanceKind(kind)) return createWeaponInstance(kind)
  if (isLiquidContainerKind(kind)) return createLiquidContainerInstance(kind)
  if (kind === 'tent') return createTentInstance()
  if (kind === 'key') return createKeyInstance()
  if (isArmorKind(kind)) return createArmorInstance(kind)
  return null
}

/** Overall `[0,1]` condition used only to order which instance sells/drops
 *  first — not a price input (`resolveInstanceSellPrice` decides that). */
function conditionRatio(instance: ItemInstance): number {
  if (isTrapItemInstance(instance)) return trapConditionRatio(instance)
  if (isWeaponItemInstance(instance)) return (instance.durability + instance.sharpness) / 2
  if (isTentItemInstance(instance)) return instance.condition / 100
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

/** @domain settlements — deterministic merchant buyback for one offer row, using
 *  the same worst-condition instance selection that settlement will remove. */
export function resolveOfferLineBuyback(
  inventory: Inventory,
  kind: ItemKind,
  count: number,
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): { value: number, instanceIds: readonly string[] } {
  if (count <= 0) return { value: 0, instanceIds: [] }
  if (!canSell(kind)) return { value: tradeValue(kind) * count, instanceIds: [] }
  if (isInstanceBackedKind(kind)) {
    const ids = selectInstancesToSell(inventory.getInstances(kind), count)
    let value = 0
    for (const id of ids) {
      const instance = inventory.getInstance(id)
      if (!instance) continue
      value += resolveInstanceSellPrice(instance, context) ?? 0
    }
    return { value, instanceIds: ids }
  }
  return { value: (sellPrice(kind, context) ?? 0) * count, instanceIds: [] }
}

/** @domain settlements — merchant buyback for an entire offer basket plus the
 *  concrete instance ids settlement should remove for instance-backed kinds. */
export function resolveOfferBuyback(
  inventory: Inventory,
  offer: Partial<Record<ItemKind, number>>,
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): OfferBuybackResolution {
  let buybackValue = 0
  let nonSellableBarterValue = 0
  const instanceIdsByKind: Partial<Record<ItemKind, readonly string[]>> = {}
  for (const [kind, count] of Object.entries(offer) as [ItemKind, number][]) {
    if (count <= 0) continue
    if (!canSell(kind)) {
      nonSellableBarterValue += tradeValue(kind) * count
      continue
    }
    const line = resolveOfferLineBuyback(inventory, kind, count, context)
    buybackValue += line.value
    if (line.instanceIds.length > 0) instanceIdsByKind[kind] = line.instanceIds
  }
  return { buybackValue, nonSellableBarterValue, instanceIdsByKind }
}

/**
 * Settles one mixed transaction: `purchases` (bought at `merchantPrice`) and
 * `offer` (items given up at merchant buyback value for sellable kinds, or at
 * full `tradeValue` for barter-only kinds such as `shell`) netted into a single
 * coin delta. Atomic: validate the whole transaction, then remove offer + add
 * purchases + settle coins in one pass.
 */
/** Shared coin-settlement arithmetic between `settleTransaction` (authoritative,
 *  called with a strictly-validated `totalBuyCost`) and `previewTransactionNetCoins`
 *  (UI display only, called with a leniently-summed one) — one formula, two
 *  totalBuyCost computations with different validation strictness. */
function computeNetCoins(
  totalBuyCost: number,
  resolution: OfferBuybackResolution,
): number {
  const { buybackValue, nonSellableBarterValue } = resolution
  const totalPayment = buybackValue + nonSellableBarterValue
  if (totalPayment <= totalBuyCost) return totalBuyCost - totalPayment
  const remainingAfterNonSellable = Math.max(0, totalBuyCost - nonSellableBarterValue)
  const excessBuyback = Math.max(0, buybackValue - remainingAfterNonSellable)
  return -excessBuyback
}

/** UI-preview-only net coin delta (positive = "To pay", negative = "You
 *  receive") for a not-yet-committed basket — reuses `computeNetCoins` (the
 *  same formula `settleTransaction` commits with) so the transaction summary
 *  never drifts from what `[TRADE]` will actually do. Unknown/unstocked
 *  purchase kinds count as free rather than failing, since this is display
 *  math, not a commit path — `settleTransaction` remains the authoritative
 *  validator. */
export function previewTransactionNetCoins(
  inventory: Inventory,
  purchases: Partial<Record<ItemKind, number>>,
  offer: Partial<Record<ItemKind, number>>,
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): number {
  let totalBuyCost = 0
  for (const [kind, count] of Object.entries(purchases) as [ItemKind, number][]) {
    if (count > 0) totalBuyCost += (merchantPrice(kind) ?? 0) * count
  }
  return computeNetCoins(totalBuyCost, resolveOfferBuyback(inventory, offer, context))
}

/** UI-preview net coin delta for a priced world-entity purchase (e.g. merchant
 *  horse) — same `computeNetCoins` formula as `settlePricedPurchase`. */
export function previewPricedPurchaseNetCoins(
  inventory: Inventory,
  coinPrice: number,
  offer: Partial<Record<ItemKind, number>>,
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): number {
  if (coinPrice <= 0) return 0
  return computeNetCoins(coinPrice, resolveOfferBuyback(inventory, offer, context))
}

/** Atomic priced purchase outside `MERCHANT_STOCK` — validates payment first,
 *  runs `onCommit` (e.g. fauna ownership transfer), then mutates inventory
 *  only after `onCommit` succeeds (plan quests-progression-012). */
export function settlePricedPurchase(
  inventory: Inventory,
  coinPrice: number,
  offer: Partial<Record<ItemKind, number>>,
  context: SellPriceContext,
  onCommit: () => boolean,
): TradeResult {
  if (coinPrice <= 0) return 'invalid_offer'
  const offerHasEntries = (Object.entries(offer) as [ItemKind, number][]).some(([, count]) => count > 0)
  if (!offerHasEntries) {
    if (!inventory.has('coin', coinPrice)) return 'cannot_afford'
    if (!wouldFitAfterTransaction(inventory, {}, {}, coinPrice)) return 'full'
    if (!onCommit()) return 'not_sold'
    inventory.remove('coin', coinPrice)
    return 'ok'
  }
  if (!isValidOffer(inventory, offer)) return 'invalid_offer'
  const offerResolution = resolveOfferBuyback(inventory, offer, context)
  const netCoins = computeNetCoins(coinPrice, offerResolution)
  if (netCoins > 0 && !inventory.has('coin', netCoins)) return 'cannot_afford'
  if (!wouldFitAfterTransaction(inventory, offer, {}, netCoins)) return 'full'
  if (!onCommit()) return 'not_sold'
  removeOffer(inventory, offer, offerResolution.instanceIdsByKind)
  if (netCoins > 0) inventory.remove('coin', netCoins)
  else if (netCoins < 0) inventory.add('coin', -netCoins)
  return 'ok'
}

export function settleTransaction(
  inventory: Inventory,
  purchases: Partial<Record<ItemKind, number>>,
  offer: Partial<Record<ItemKind, number>>,
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): TradeResult {
  const purchaseEntries = (Object.entries(purchases) as [ItemKind, number][]).filter(([, count]) => count > 0)
  const offerHasEntries = (Object.entries(offer) as [ItemKind, number][]).some(([, count]) => count > 0)
  if (purchaseEntries.length === 0 && !offerHasEntries) return 'invalid_offer'
  let totalBuyCost = 0
  for (const [kind, count] of purchaseEntries) {
    if (!Number.isInteger(count)) return 'not_sold'
    const unitPrice = merchantPrice(kind)
    if (unitPrice == null) return 'not_sold'
    totalBuyCost += unitPrice * count
  }
  if (offerHasEntries && !isValidOffer(inventory, offer)) return 'invalid_offer'
  const offerResolution = resolveOfferBuyback(inventory, offer, context)
  const netCoins = computeNetCoins(totalBuyCost, offerResolution)
  if (purchaseEntries.length === 0 && netCoins === 0) return 'not_sold'
  if (netCoins > 0 && !inventory.has('coin', netCoins)) return 'cannot_afford'
  if (!wouldFitAfterTransaction(inventory, offer, purchases, netCoins)) return 'full'
  removeOffer(inventory, offer, offerResolution.instanceIdsByKind)
  for (const [kind, count] of purchaseEntries) addPurchased(inventory, kind, count)
  if (netCoins > 0) inventory.remove('coin', netCoins)
  else if (netCoins < 0) inventory.add('coin', -netCoins)
  return 'ok'
}

/** Sell concrete instances by id. Validates and prices before any mutation. */
export function sellInstancesForCoins(
  inventory: Inventory,
  instanceIds: readonly string[],
  context: SellPriceContext = NEUTRAL_SELL_PRICE_CONTEXT,
): InstanceSellResult {
  if (instanceIds.length === 0) return { result: 'invalid_offer' }
  const unique = [...new Set(instanceIds)]
  const instances: ItemInstance[] = []
  let totalCoins = 0
  let removeWeight = 0
  let removeSize = 0
  for (const id of unique) {
    const instance = inventory.getInstance(id)
    if (!instance) return { result: 'invalid_offer' }
    const price = resolveInstanceSellPrice(instance, context)
    if (price == null) return { result: 'not_sold' }
    instances.push(instance)
    totalCoins += price
    removeWeight += ITEM_DEFS[instance.kind].weight
    removeSize += itemSizeUnits(instance.kind)
  }
  if (!wouldFitAfter(inventory, removeWeight, removeSize, 'coin', totalCoins)) {
    return { result: 'full' }
  }
  for (const id of unique) {
    if (!inventory.removeInstance(id)) return { result: 'invalid_offer' }
  }
  inventory.add('coin', totalCoins)
  return { result: 'ok', totalCoins, soldIds: unique }
}

export type { SellPriceContext }
