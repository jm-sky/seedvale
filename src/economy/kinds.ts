/**
 * Settlement bulk goods (plan 071). Distinct from player `ItemKind` —
 * inventory items and village stock have different semantics. Map between
 * them later where a player interaction actually needs it.
 *
 * `iron`/`coal`/`gold` (plan 131) are settlement-level raw resource stock —
 * NPC ore mining lands here, not in `Household` (see `household.ts`'s
 * `HouseholdResourceKind`, deliberately not derived from this union anymore).
 * They deliberately share their literal names with the matching `ItemKind`
 * (`items/items.ts`) so an NPC's carried ore maps to economy stock by
 * identity, no lookup table needed.
 */
export type EconomicKind = 'coal' | 'copper_ore' | 'food' | 'gold' | 'iron' | 'water' | 'wood'

export const ECONOMIC_KINDS: readonly EconomicKind[] = ['food', 'water', 'wood', 'iron', 'coal', 'gold', 'copper_ore']

export function isEconomicKind(value: string): value is EconomicKind {
  return (ECONOMIC_KINDS as readonly string[]).includes(value)
}

/**
 * Stable identity for a real-world economic production source (a mine,
 * later other extraction sites) that attributed `SettlementEconomy` stock
 * can be traced back to (plan settlements-004). Never a quest id and never
 * a `ResourceDeposit`/deposit-slot id — one source id is shared by every
 * deposit slot belonging to the same source. Deliberately a plain string so
 * world-generation code (`terrain/`) can assign one without importing any
 * economy runtime.
 */
export type EconomicSourceId = string
