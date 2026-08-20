/**
 * Shared critical-hit resolver (plan 162) — a small pure modifier stage any
 * attack pipeline can opt into between "successful hit" and "existing target
 * defense", not a parallel damage system. Ranged (bows) is the first real
 * consumer; melee opts in with its own flat baseline (see
 * `player/playerMelee.ts` callers) instead of a second bespoke roll.
 */

/** Deterministic 0..1 roll for one resolved hit — same hash shape as
 *  `combat/defenseResolver.ts`'s `defenseBlockRoll` (same inputs always
 *  produce the same outcome; not a shared export since each roll's inputs
 *  are conceptually attempt-scoped to its own domain). */
export function criticalRoll(attackerId: string, attackKey: string, attempt: number): number {
  let h = Math.imul(hashString(attackerId) ^ hashString(attackKey), 2654435761)
  h = Math.imul(h ^ (attempt + 0x9e3779b9), 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type CriticalOutcome = {
  critical: boolean
  /** `baseDamage`, or `baseDamage * multiplier` on a critical. */
  damage: number
}

/** Evaluated once per resolved hit, before target defense — a critical never
 *  mutates HP directly and never bypasses `resolveDefense()` (`final damage`
 *  still flows through the existing defense boundary). */
export function resolveCriticalHit(
  baseDamage: number,
  chance: number,
  multiplier: number,
  attackerId: string,
  attackKey: string,
  attempt: number,
): CriticalOutcome {
  if (baseDamage <= 0 || chance <= 0) return { critical: false, damage: baseDamage }
  const roll = criticalRoll(attackerId, attackKey, attempt)
  if (roll < Math.min(1, chance)) {
    return { critical: true, damage: baseDamage * Math.max(1, multiplier) }
  }
  return { critical: false, damage: baseDamage }
}

/** Baseline chance/multiplier melee opts into (plan 162 §Cel — critical must
 *  be "możliwa do wykorzystania także przez melee"). Deliberately not part of
 *  `MeleeConfig`: every melee weapon shares the same small baseline instead
 *  of a per-weapon tuning knob, keeping the melee catalog untouched. */
export const MELEE_CRITICAL_CHANCE = 0.08
export const MELEE_CRITICAL_MULTIPLIER = 1.6
