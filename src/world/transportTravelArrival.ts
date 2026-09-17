import type { NpcAuthoritativeState } from '../settlement/npcState'
import type { TransportOrders } from './createTransportOrders'
import { observeNpcTravelArrival } from '../ai/npcTravel'
import { tryAdvanceDevelopment } from '../economy/npcWork'
import { creditDeliveredOreToStock } from '../economy/oreTransportDemand'
import { advanceMerchantJourneyToVisiting } from '../settlement/merchantJourney'
import {
  type OffscreenTransportLookup,
  resolveTransportEndpointInventory,
} from './transportOffscreen'
import { isTransportOrderTerminal } from './transportOrder'
import { executeTransportUnload } from './transportTransactions'

/**
 * Cargo completion for a transport-purpose generic NPC travel arrival
 * (plan settlements-npcs-037). Spatial arrival is owned by
 * `NpcTravelContinuity`; this observer commits `executeTransportUnload`
 * exactly once and only then clears travel.
 *
 * Bounded checkpoint, never a per-frame traveller scan. Destination
 * rejection or a missing economy leaves cargo + in-transit order +
 * `arrival: reached` for a later retry. Terminal or missing orders clean
 * stale transport-purpose travel without minting or re-delivering cargo.
 *
 * @domain settlements-npcs
 */
export function resolveTransportTravelArrivals(
  orders: TransportOrders,
  lookup: OffscreenTransportLookup,
  nowDays: number,
  forEachState: (fn: (state: NpcAuthoritativeState, id: string) => void) => void,
): void {
  forEachState((state, id) => {
    const travel = state.travel
    if (travel?.purpose?.kind !== 'transport') return
    const order = orders.find(travel.purpose.orderId)
    if (!order || isTransportOrderTerminal(order.state)) {
      if (travel.arrival === 'reached') observeNpcTravelArrival(state)
      else state.travel = null
      return
    }
    if (travel.arrival !== 'reached') return
    if (travel.blocked) return
    if (order.state !== 'in-transit') return
    if (order.carrierNpcId !== id) return
    const destination = resolveTransportEndpointInventory(order.destination, lookup)
    if (!destination) return
    const result = executeTransportUnload({
      orders,
      orderId: order.id,
      carrierNpcId: order.carrierNpcId,
      carrier: state.transportCargo,
      destination,
      nowDays,
    })
    if (!result.ok) return
    if (order.destination.type === 'settlement-storage') {
      const economy = lookup.getEconomy(order.destination.settlementId)
      if (economy) {
        creditDeliveredOreToStock(economy, order.itemKind, result.delivered, nowDays)
        tryAdvanceDevelopment(economy)
      }
    }
    observeNpcTravelArrival(state)
    advanceMerchantJourneyToVisiting(state, order.id, nowDays)
  })
}
