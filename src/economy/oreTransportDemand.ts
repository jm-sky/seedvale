import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { EconomicSourceId } from './kinds'
import type { SettlementEconomy } from './settlementEconomy'
import { tradeValue } from '../items/tradeCatalog'
import { isMineableOre, oreEconomicKind } from '../terrain/depositMining'
import { isTransportOrderActive, type TransportOrder } from '../world/transportOrder'

/**
 * Derived remote-ore transport accounting (plan settlements-npcs-021).
 *
 * Uncovered blacksmith stock shortages and uncommitted resource-site supply
 * are computed from live `SettlementEconomy` / site `Inventory` plus active
 * `TransportOrder` records. Not a registry and not persisted.
 *
 * @domain settlements-npcs
 */

/** Iron then coal — the stock inputs `BLACKSMITH_IRON_ROD_PRODUCTION` can
 *  actually block on. Gold/copper sit at the site until a later demand. */
export const ORE_TRANSPORT_KINDS = ['iron', 'coal'] as const
export type OreTransportKind = (typeof ORE_TRANSPORT_KINDS)[number]

/** Same bound as household food collection, so one Trader trip stays small. */
export const ORE_TRANSPORT_MAX_TRANSFER = 3

export function isOreTransportKind(kind: string): kind is OreTransportKind {
  return kind === 'iron' || kind === 'coal'
}

function isOreOrder(order: TransportOrder): boolean {
  return isMineableOre(order.itemKind)
}

function isResourceSiteSource(order: TransportOrder, resourceId: string): boolean {
  return order.source.type === 'resource-site' && order.source.resourceId === resourceId
}

/** Quantity still expected to arrive at `settlementId` as the given ore kind
 *  (or any mineable ore when `itemKind` is omitted). Pre-pickup orders count
 *  `requestedQuantity`; in-transit orders count `claimedQuantity`. */
export function committedIncomingOre(
  orders: readonly TransportOrder[],
  settlementId: string,
  itemKind?: ItemKind,
): number {
  let total = 0
  for (const order of orders) {
    if (!isTransportOrderActive(order.state)) continue
    if (order.destination.type !== 'settlement-storage') continue
    if (order.destination.settlementId !== settlementId) continue
    if (!isOreOrder(order)) continue
    if (itemKind && order.itemKind !== itemKind) continue
    total += order.state === 'in-transit' ? order.claimedQuantity : order.requestedQuantity
  }
  return total
}

/** Quantity still reserved for pickup from `resourceId`. Only `pending` /
 *  `assigned` ore orders count. `excludeOrderId` skips the caller's own
 *  commitment (pickup revalidation). */
export function committedOutgoingOre(
  orders: readonly TransportOrder[],
  resourceId: string,
  excludeOrderId?: string,
  itemKind?: ItemKind,
): number {
  let total = 0
  for (const order of orders) {
    if (excludeOrderId && order.id === excludeOrderId) continue
    if (order.state !== 'pending' && order.state !== 'assigned') continue
    if (!isResourceSiteSource(order, resourceId)) continue
    if (!isOreOrder(order)) continue
    if (itemKind && order.itemKind !== itemKind) continue
    total += order.requestedQuantity
  }
  return total
}

/** First iron/coal stock shortage that incoming commitments do not yet cover.
 *  Quantity is one transfer bound, not a recipe solver. */
export function uncoveredOreProductionNeed(
  economy: SettlementEconomy,
  orders: readonly TransportOrder[],
): { kind: OreTransportKind, quantity: number } | null {
  for (const kind of ORE_TRANSPORT_KINDS) {
    const hasShortage = economy.productionShortages().some(
      (row) => row.category === 'stock' && row.kind === kind,
    )
    if (!hasShortage) continue
    if (committedIncomingOre(orders, economy.settlementId, kind) > 0) continue
    return { kind, quantity: ORE_TRANSPORT_MAX_TRANSFER }
  }
  return null
}

/** `max(0, site count - pre-pickup outgoing of this kind from this site)`. */
export function uncommittedResourceSiteOre(
  inventory: Inventory,
  orders: readonly TransportOrder[],
  resourceId: string,
  excludeOrderId?: string,
  itemKind?: ItemKind,
): number {
  if (itemKind) {
    return Math.max(
      0,
      inventory.count(itemKind) - committedOutgoingOre(orders, resourceId, excludeOrderId, itemKind),
    )
  }
  let available = 0
  for (const kind of ORE_TRANSPORT_KINDS) {
    available += Math.max(
      0,
      inventory.count(kind) - committedOutgoingOre(orders, resourceId, excludeOrderId, kind),
    )
  }
  return available
}

/** Delivery-time source provenance (plan settlements-004) — resolved once at
 *  order-creation time and carried on the order itself; see
 *  `sourcedDeliveryProvenance`. */
export type SourcedOreDeliveryProvenance = {
  economicSourceId: EconomicSourceId
  /** Exact-once realization key — one delivery, one `TransportOrder`, so the
   *  order's own id is a safe idempotency key. */
  eventId: string
}

/** `undefined` for household/settlement-storage sources and for a
 *  resource-site order whose deposit carries no `economicSourceId` — those
 *  keep crediting through plain `add()`. */
export function sourcedDeliveryProvenance(
  order: Pick<TransportOrder, 'id' | 'source'>,
): SourcedOreDeliveryProvenance | undefined {
  if (order.source.type !== 'resource-site' || !order.source.economicSourceId) return undefined
  return { economicSourceId: order.source.economicSourceId, eventId: order.id }
}

/**
 * After `executeTransportUnload` into `SettlementEconomy.items`, move delivered
 * mineable ore into bulk stock so existing production queries (`query` /
 * `remove` / blacksmith recipes) observe it. No-op for non-ore kinds.
 *
 * When `provenance` is set (sourced gold, see `sourcedDeliveryProvenance`),
 * credits through `addAttributed` instead of `add` and immediately realizes
 * the same delivered quantity — gold has no other stock use, so a settlement
 * economically realizes attributed gold exactly once, at delivery, the same
 * way for detailed and off-screen carriers (plan settlements-004).
 *
 * @domain settlements-npcs
 */
export function creditDeliveredOreToStock(
  economy: SettlementEconomy,
  itemKind: ItemKind,
  amount: number,
  simTime = 0,
  provenance?: SourcedOreDeliveryProvenance,
): void {
  if (!isMineableOre(itemKind) || amount <= 0) return
  if (!economy.items.remove(itemKind, amount)) return
  const kind = oreEconomicKind(itemKind)
  if (!provenance) {
    economy.add(kind, amount, simTime)
    return
  }
  economy.addAttributed(kind, amount, provenance.economicSourceId, simTime)
  economy.realizeAttributed({
    kind,
    sourceId: provenance.economicSourceId,
    amount,
    unitValue: tradeValue(itemKind),
    eventId: provenance.eventId,
    simTime,
  })
}
