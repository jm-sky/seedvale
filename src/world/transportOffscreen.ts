import type { SettlementEconomy } from '../economy/settlementEconomy'
import type { Inventory } from '../items/Inventory'
import type { Household, HouseholdId } from '../settlement/household'
import type { NpcAuthoritativeState, NpcId } from '../settlement/npcState'
import type { TransportOrders } from './createTransportOrders'
import type { TransportEndpointRef } from './transportOrder'
import { tryAdvanceDevelopment } from '../economy/npcWork'
import { creditDeliveredOreToStock, sourcedDeliveryProvenance } from '../economy/oreTransportDemand'
import { realSecondsToGameDays } from './timeConversion'
import { executeTransportUnload } from './transportTransactions'

/**
 * World-owned off-screen transport progression (plan settlements-npcs-019).
 *
 * Only ever resolves an `in-transit` order's arrival — an `assigned` order
 * abstracted before pickup simply stays `assigned` with no execution
 * metadata (see `transportOrder.ts`'s `TransportExecution` doc) and resumes
 * ordinary detailed pickup once a live carrier exists again, so this module
 * never needs to reach into a source. Both endpoint lookups here (household/
 * settlement-storage) resolve through `SettlementsManager`'s manager-lifetime
 * registries, which survive settlement stream-out/in independently of any
 * Never a second storage abstraction. Resource-site sources resolve through
 * the world-owned site inventory store (plan settlements-npcs-021) and do
 * not require a loaded deposit instance.
 *
 * @domain settlements-npcs
 */

/** Off-screen travel speed — matches `NpcAgent`'s own `WALK_SPEED`, the
 *  movement model an off-screen carrier is assumed to keep using. Duplicated
 *  (not imported) so this module stays independent of `NpcAgent.ts`'s heavy
 *  runtime/THREE dependencies — keep this in sync with `NpcAgent.ts`'s
 *  `WALK_SPEED` if that ever changes. */
const OFFSCREEN_TRAVEL_SPEED = 2.4

/** Simplest deterministic estimate consistent with the current movement
 *  model (plan settlements-npcs-019 "Travel duration") — straight-line
 *  remaining distance over a flat effective speed. Never reconstructs a
 *  path or exact off-screen position; called once at handoff time while the
 *  carrier's live position is still known. */
export function estimateOffscreenTravelDays(
  from: { x: number, z: number },
  to: { x: number, z: number },
  dayLengthSec: number,
): number {
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  return realSecondsToGameDays(distance / OFFSCREEN_TRAVEL_SPEED, dayLengthSec)
}

/** Manager-lifetime endpoint lookups (`SettlementsManager.getHousehold`/
 *  `getEconomy`) — resolve fresh every call, independent of whether the
 *  owning settlement is currently streamed in. Resource-site inventories
 *  are world-owned (plan settlements-npcs-021) and do not require a loaded
 *  `ResourceDeposits` render instance. */
export type TransportEndpointLookup = {
  getHousehold: (id: HouseholdId) => Household | undefined
  getEconomy: (settlementId: string) => SettlementEconomy | undefined
  getResourceSiteInventory?: (resourceId: string) => Inventory | undefined
}

/** Resolves a `TransportEndpointRef` to its authoritative `Inventory`, or
 *  `null` when that endpoint doesn't (yet) exist. */
export function resolveTransportEndpointInventory(
  ref: TransportEndpointRef,
  lookup: TransportEndpointLookup,
): Inventory | null {
  if (ref.type === 'household') return lookup.getHousehold(ref.householdId)?.items ?? null
  if (ref.type === 'settlement-storage') return lookup.getEconomy(ref.settlementId)?.items ?? null
  return lookup.getResourceSiteInventory?.(ref.resourceId) ?? null
}

export type OffscreenTransportLookup = TransportEndpointLookup & {
  /** `SettlementsManager.getNpcState` — the carrier's authoritative state
   *  (and its `transportCargo`), independent of whether a live `NpcAgent`
   *  currently exists for it. */
  getNpcState: (id: NpcId) => NpcAuthoritativeState | undefined
}

/**
 * Legacy `TransportOrder.execution` owns same-settlement / resource-site
 * travel clocks (plan settlements-npcs-019). Cross-settlement legs whose
 * carrier already has `travel.purpose.kind === 'transport'` for this order
 * must not also receive that clock (plan settlements-npcs-037).
 *
 * @domain settlements-npcs
 */
export function shouldUseLegacyTransportExecutionHandoff(
  order: { id: string, state: string, execution?: unknown },
  carrierTravel: { purpose?: { kind: string, orderId?: string } } | null | undefined,
): boolean {
  if (order.state !== 'in-transit' || order.execution) return false
  if (
    carrierTravel?.purpose?.kind === 'transport'
    && carrierTravel.purpose.orderId === order.id
  ) {
    return false
  }
  return true
}

/**
 * Settlement-storage handoff target (plan settlements-npcs-037). Honors
 * `ref.settlementId` instead of assuming the currently unloading settlement.
 * Returns `null` when the referenced settlement cannot be resolved.
 *
 * @domain settlements-npcs
 */
export function resolveSettlementStorageHandoffPosition(
  settlementId: string,
  currentSettlementId: string,
  currentStorage: { x: number, z: number },
  resolveOther: (settlementId: string) => { x: number, z: number } | null,
): { x: number, z: number } | null {
  if (settlementId === currentSettlementId) return currentStorage
  return resolveOther(settlementId)
}

/**
 * Resolves every off-screen, `in-transit` order whose captured travel
 * commitment has logically elapsed by `nowDays` — bounded to active orders
 * only, never a per-frame or per-settlement scan. Reuses
 * `executeTransportUnload`, the same transactional seam detailed execution
 * already uses, so a resolvable destination either completes the delivery
 * exactly once or leaves cargo + order untouched for the next checkpoint.
 * Idempotent: calling this again before the next real elapsed interval is a
 * no-op for every order it already resolved (terminal state, or `nowDays`
 * still short of `arrivesAtDays`).
 *
 * A missing carrier state or unresolvable destination leaves the order
 * `in-transit` with cargo still on the carrier — never refunded to source,
 * never minted at destination (plan's "Failure recovery principle").
 *
 * Called from bounded simulation checkpoints only (settlement stream
 * transitions, time-skip completion) — never per frame.
 */
export function resolveOffscreenTransportArrivals(
  orders: TransportOrders,
  lookup: OffscreenTransportLookup,
  nowDays: number,
): void {
  for (const order of orders.list()) {
    if (order.state !== 'in-transit') continue
    if (!order.execution || order.execution.mode !== 'off-screen') continue
    if (nowDays < order.execution.arrivesAtDays) continue
    if (!order.carrierNpcId) continue
    const carrierState = lookup.getNpcState(order.carrierNpcId)
    if (!carrierState) continue
    const destination = resolveTransportEndpointInventory(order.destination, lookup)
    if (!destination) continue
    const result = executeTransportUnload({
      orders,
      orderId: order.id,
      carrierNpcId: order.carrierNpcId,
      carrier: carrierState.transportCargo,
      destination,
      nowDays,
    })
    if (result.ok && order.destination.type === 'settlement-storage') {
      const economy = lookup.getEconomy(order.destination.settlementId)
      if (economy) {
        creditDeliveredOreToStock(economy, order.itemKind, result.delivered, nowDays, sourcedDeliveryProvenance(order))
        tryAdvanceDevelopment(economy)
      }
    }
  }
}
