import type { Household, HouseholdResourceKind } from '../settlement/household'
import type { EconomicKind } from './kinds'
import type { SettlementEconomy } from './settlementEconomy'

/**
 * Owner-agnostic local resource exchange (plan settlements-npcs-005) — the
 * small claim seam the plan asks for instead of a `TradeManager`/parallel
 * transport system. Both `Household` and `SettlementEconomy` already own
 * `surplus()`/atomic `remove()`; these just compose the two into one
 * "claim up to what's currently, really available" step shared by every
 * exchange direction (village storage ↔ household, household ↔ household,
 * and the existing trader work).
 *
 * Deliberately re-reads live `surplus()` here rather than trusting a caller-
 * supplied amount from an earlier decision — the implementation notes call
 * this out explicitly: a candidate marked "available" when an NPC chose this
 * strategy may be stale by the time it actually claims (another NPC/the
 * player could have consumed the source first).
 */

/** Claims up to `amount` from a household's current surplus of `kind`.
 *  Atomic: either removes exactly the returned amount or nothing at all.
 *  Returns the amount actually claimed (0 when there's no real surplus). */
export function claimHouseholdSurplus(household: Household, kind: HouseholdResourceKind, amount: number): number {
  const available = Math.min(household.surplus(kind), amount)
  if (available <= 0) return 0
  return household.stock.remove(kind, available) ? available : 0
}

/** Claims up to `amount` from a settlement economy's current surplus of
 *  `kind` — mirrors `claimHouseholdSurplus` for the village-storage side of
 *  the same exchange. */
export function claimEconomySurplus(economy: SettlementEconomy, kind: EconomicKind, amount: number, simTime = 0): number {
  const available = Math.min(economy.surplus(kind), amount)
  if (available <= 0) return 0
  return economy.remove(kind, available, simTime) ? available : 0
}
