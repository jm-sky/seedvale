import type { ItemKind } from '../items/items'
import type { HouseholdResourceKind } from '../settlement/household'
import { type BoundedHistoryBuffer, createBoundedHistoryBuffer } from './domainHistory'

/**
 * Household-level history events (plan settlements-npcs-013) — a bounded
 * ring of `Household`'s own authoritative mutations, mirroring
 * `npcTrace.ts`'s NPC trace at the household scope. Recorded only inside
 * `Household`'s own mutation methods (`settlement/household.ts`), never
 * derived by polling — the debug history is an observer, not a second owner
 * of household state.
 *
 * A resource mutation caused by an NPC action shows up here as the
 * household-side effect (e.g. `food.deposited`); the NPC's own decision/
 * action trace (`npcTrace.ts`) is a distinct, separately-owned record of the
 * same causal chain, not a duplicate.
 */
export type HouseholdHistoryEvent =
  | { simTime: number, seq: number, type: 'wood.deposited', amount: number, overflowed: number }
  | { simTime: number, seq: number, type: 'food.deposited', itemKind: ItemKind, amount: number, overflowed: number }
  | { simTime: number, seq: number, type: 'food.taken', itemKind: ItemKind }
  /** Fires only on the shortage-crossing transition (`shortage(kind)` going
   *  from `0` to `>0`), never per-tick while the shortage persists. */
  | { simTime: number, seq: number, type: 'shortage.detected', kind: HouseholdResourceKind, amount: number }
  /** Fires only on the `>0` to `0` transition. */
  | { simTime: number, seq: number, type: 'shortage.resolved', kind: HouseholdResourceKind }

export type HouseholdHistoryEventType = HouseholdHistoryEvent['type']

/** Smaller than `NPC_TRACE_CAPACITY` (`npcTrace.ts`) — household mutations
 *  are far less frequent than NPC decision-cycle events. */
export const HOUSEHOLD_HISTORY_CAPACITY = 60

export type HouseholdHistoryBuffer = BoundedHistoryBuffer<HouseholdHistoryEvent>

export function createHouseholdHistoryBuffer(capacity = HOUSEHOLD_HISTORY_CAPACITY): HouseholdHistoryBuffer {
  return createBoundedHistoryBuffer<HouseholdHistoryEvent>(capacity)
}
