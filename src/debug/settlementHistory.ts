import type { EconomicKind } from '../economy/kinds'
import type { ItemKind } from '../items/items'
import { type BoundedHistoryBuffer, createBoundedHistoryBuffer } from './domainHistory'

/**
 * Settlement/economy-level history events (plan settlements-npcs-013) — a
 * bounded ring of `SettlementEconomy`'s own authoritative mutations, the
 * settlement-scope counterpart of `householdHistory.ts`. Recorded only
 * inside `SettlementEconomy`'s own mutation methods
 * (`economy/settlementEconomy.ts`), never derived by polling.
 *
 * First vertical slice (plan §2/§3): bulk stock add/remove and concrete-food
 * deposit/withdraw only — development reservation/completion is out of scope
 * for the household-shortage verification scenario this plan targets.
 */
export type SettlementHistoryEvent =
  | { simTime: number, seq: number, type: 'stock.added', kind: EconomicKind, amount: number }
  | { simTime: number, seq: number, type: 'stock.removed', kind: EconomicKind, amount: number }
  | { simTime: number, seq: number, type: 'food.deposited', kind: ItemKind, amount: number }
  | { simTime: number, seq: number, type: 'food.withdrawn', amount: number }

export type SettlementHistoryEventType = SettlementHistoryEvent['type']

/** Same order of magnitude as `HOUSEHOLD_HISTORY_CAPACITY` — one settlement
 *  economy aggregates mutations from every household it serves, so a bit
 *  more headroom. */
export const SETTLEMENT_HISTORY_CAPACITY = 100

export type SettlementHistoryBuffer = BoundedHistoryBuffer<SettlementHistoryEvent>

export function createSettlementHistoryBuffer(capacity = SETTLEMENT_HISTORY_CAPACITY): SettlementHistoryBuffer {
  return createBoundedHistoryBuffer<SettlementHistoryEvent>(capacity)
}
