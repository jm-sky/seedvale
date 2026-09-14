import type { ItemKind } from '../items/items'
import type { Household } from '../settlement/household'
import type { Role } from './characters'
import { HUNT_RESUPPLY_ARROW_TARGET } from './NpcAgent'

/**
 * One `ItemKind` an ordinary NPC's household can currently sell to the
 * player from its real owned stock, plus how much is actually surplus to
 * the household's own needs (plan settlements-npcs-033 §2/§3).
 *
 * @domain settlements-npcs
 */
export type NpcTradeOffer = {
  kind: ItemKind
  /** Live sellable quantity — owned quantity minus the protected reserve, if any. */
  quantity: number
}

/** Minimal NPC shape this module needs — decoupled from the full `NpcAgent`
 *  class (household membership + profession role are all reserve policy
 *  ever looks at) so it stays unit-testable with plain objects; a real
 *  `NpcAgent` satisfies this structurally without any adapter. */
export type TradeReserveNpc = {
  household: Household | null
  role: Role
}

/** Reserve resolver for one trade-eligible `ItemKind` — owned quantity minus
 *  this is what's actually offered to the player. Kept separate per kind so
 *  each reserve rule stays legible and reuses its own domain's semantics
 *  instead of a shared "surplus" formula that would fit none of them well. */
type ReserveResolver = (household: Household, settlementNpcs: readonly TradeReserveNpc[]) => number

/** Hunter arrow reserve (plan settlements-npcs-033 §3) — reuses
 *  `HUNT_RESUPPLY_ARROW_TARGET`, the same per-hunter resupply target
 *  `NpcAgent.attemptHuntKill` already tops carried arrows up to, rather than
 *  a second independent trade-only magic number. Scales with the number of
 *  actual Hunter members sharing this household so trade never starves a
 *  multi-hunter household's combined resupply demand; zero when the
 *  household has no hunter (nothing to protect the stock for). */
function hunterArrowReserve(household: Household, settlementNpcs: readonly TradeReserveNpc[]): number {
  const hunterCount = settlementNpcs.filter((npc) => npc.household === household && npc.role === 'hunter').length
  return hunterCount * HUNT_RESUPPLY_ARROW_TARGET
}

/** Intentionally narrow (plan settlements-npcs-033 §2) — only kinds with an
 *  explicit, safe eligibility + reserve rule are ever offered. Every other
 *  `ItemKind` a household happens to hold stays invisible to player trade,
 *  even at a large quantity. Extending this to a future profession's output
 *  is meant to be exactly one new entry here — no new UI, no new
 *  transaction engine (plan §13). */
const HOUSEHOLD_TRADE_RESERVES: Partial<Record<ItemKind, ReserveResolver>> = {
  arrow: hunterArrowReserve,
}

/** Live sellable quantity of one `ItemKind` from `household.items` — owned
 *  quantity minus the kind's protected reserve (0 for an ineligible kind).
 *  Called both to build the trade offer preview and again, on the current
 *  live state, right before commit (see the plan's live revalidation
 *  contract) — never cached.
 *
 * @domain settlements-npcs
 */
export function npcTradeQuantityAvailable(
  kind: ItemKind,
  household: Household,
  settlementNpcs: readonly TradeReserveNpc[],
): number {
  const reserveOf = HOUSEHOLD_TRADE_RESERVES[kind]
  if (!reserveOf) return 0
  const owned = household.items.count(kind)
  if (owned <= 0) return 0
  return Math.max(0, owned - reserveOf(household, settlementNpcs))
}

/** Every currently sellable good for one household — what the "Handel"
 *  dialogue action and the trade screen's BUY column are built from.
 *
 * @domain settlements-npcs
 */
export function resolveNpcTradeOffers(
  household: Household,
  settlementNpcs: readonly TradeReserveNpc[],
): readonly NpcTradeOffer[] {
  const offers: NpcTradeOffer[] = []
  for (const kind of Object.keys(HOUSEHOLD_TRADE_RESERVES) as ItemKind[]) {
    const quantity = npcTradeQuantityAvailable(kind, household, settlementNpcs)
    if (quantity > 0) offers.push({ kind, quantity })
  }
  return offers
}
