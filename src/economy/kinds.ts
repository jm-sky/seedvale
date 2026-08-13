/**
 * Settlement bulk goods (plan 071). Distinct from player `ItemKind` —
 * inventory items and village stock have different semantics. Map between
 * them later where a player interaction actually needs it.
 */
export type EconomicKind = 'food' | 'water' | 'wood'

export const ECONOMIC_KINDS: readonly EconomicKind[] = ['food', 'water', 'wood']

export function isEconomicKind(value: string): value is EconomicKind {
  return (ECONOMIC_KINDS as readonly string[]).includes(value)
}
