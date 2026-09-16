import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { TransportOrder } from '../world/transportOrder'
import type { SettlementEconomy } from './settlementEconomy'
import { FOOD_ITEM_KINDS } from '../items/foodItems'
import {
  committedOutgoingSettlementFood,
  uncommittedSettlementFoodSurplus,
  uncoveredSettlementFoodShortage,
} from './foodTransportDemand'

/**
 * Bounded inter-settlement food matching (plan settlements-npcs-037).
 *
 * Opportunity is derived from live economies + active `TransportOrder`s.
 * This is not a route registry, not a demand graph, and not persisted —
 * only an accepted movement becomes a `TransportOrder`.
 *
 * @domain settlements-npcs
 */

/** Manager-lifetime projection of a settlement whose economy has been
 *  materialized in this world lifetime. Position is the stable world
 *  center from `SettlementDef`, never a parsed id. */
export type KnownSettlementEconomyRef = {
  settlementId: string
  x: number
  z: number
}

/** Narrow injected seam for Trader planning/execution. Resolve live
 *  economies and storage targets fresh; do not capture them on the order. */
export type InterSettlementTransportHooks = {
  listKnownSettlements(): readonly KnownSettlementEconomyRef[]
  getEconomy(settlementId: string): SettlementEconomy | undefined
  resolveStorageTarget(settlementId: string): { x: number, z: number } | null
}

export type InterSettlementFoodOpportunity = {
  destinationSettlementId: string
  itemKind: ItemKind
  quantity: number
}

/**
 * Deterministic first concrete food kind from live inventory, bounded by
 * category surplus, per-kind pre-pickup commitments, transfer cap, and
 * carrier capacity. Catalog order (`FOOD_ITEM_KINDS`), never `Math.random()`.
 *
 * @domain settlements-npcs
 */
export function selectConcreteFoodGoods(
  inventory: Inventory,
  logicalSurplus: number,
  carrier: Inventory,
  maxTransfer: number,
  committedOfKind: (kind: ItemKind) => number = () => 0,
): { kind: ItemKind, quantity: number } | null {
  if (logicalSurplus <= 0) return null
  const cap = Math.min(logicalSurplus, maxTransfer)
  if (!(cap > 0)) return null
  for (const kind of FOOD_ITEM_KINDS) {
    const available = inventory.count(kind) - Math.max(0, committedOfKind(kind))
    if (available <= 0) continue
    let quantity = Math.min(available, cap)
    while (quantity > 0 && !carrier.canAdd(kind, quantity)) quantity -= 1
    if (quantity > 0) return { kind, quantity }
  }
  return null
}

export function isCrossSettlementStorageOrder(order: TransportOrder): boolean {
  return (
    order.source.type === 'settlement-storage'
    && order.destination.type === 'settlement-storage'
    && order.source.settlementId !== order.destination.settlementId
  )
}

/**
 * Rank known materialized destinations for one source settlement and pick
 * at most one food export. Distance then stable `settlementId` tie-break.
 *
 * @domain settlements-npcs
 */
export function matchInterSettlementFoodOpportunity(input: {
  sourceSettlementId: string
  sourceX: number
  sourceZ: number
  sourceEconomy: SettlementEconomy
  carrier: Inventory
  orders: readonly TransportOrder[]
  knownSettlements: readonly KnownSettlementEconomyRef[]
  getEconomy: (settlementId: string) => SettlementEconomy | undefined
  maxTransfer: number
}): InterSettlementFoodOpportunity | null {
  const availableSupply = uncommittedSettlementFoodSurplus(input.sourceEconomy, input.orders)
  if (availableSupply <= 0) return null

  let best: { settlementId: string, dist: number, uncovered: number } | null = null
  for (const ref of input.knownSettlements) {
    if (ref.settlementId === input.sourceSettlementId) continue
    const destEconomy = input.getEconomy(ref.settlementId)
    if (!destEconomy) continue
    const uncovered = uncoveredSettlementFoodShortage(destEconomy, input.orders)
    if (!(uncovered > 0)) continue
    const dist = Math.hypot(ref.x - input.sourceX, ref.z - input.sourceZ)
    if (
      !best
      || dist < best.dist
      || (dist === best.dist && ref.settlementId < best.settlementId)
    ) {
      best = { settlementId: ref.settlementId, dist, uncovered }
    }
  }
  if (!best) return null

  const goods = selectConcreteFoodGoods(
    input.sourceEconomy.items,
    availableSupply,
    input.carrier,
    Math.min(input.maxTransfer, availableSupply, best.uncovered),
    (kind) => committedOutgoingSettlementFood(input.orders, input.sourceSettlementId, undefined, kind),
  )
  if (!goods) return null
  return {
    destinationSettlementId: best.settlementId,
    itemKind: goods.kind,
    quantity: goods.quantity,
  }
}
