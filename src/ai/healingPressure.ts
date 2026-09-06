/**
 * Healable-physical-injury → pressure mapping (plan npc-002). A pure
 * pressure producer, deliberately kept separate from `Needs.ts`'s
 * `generateNeedPressures`: an injury is a health problem, not a `NeedId`
 * (mirrors `weatherPressure.ts`'s `weatherShelterPressure` — a second
 * independent pressure producer competing in the same `NpcDecisionTarget`
 * arbitration via its own `'heal'` target, instead of a second scoring
 * engine or a `health` `NeedId`).
 *
 * @domain npc
 */

/** Severity (injury / maxHp) at or below this reads as a scratch that
 *  shouldn't compete for attention on its own — matches the plan's "lekki
 *  uraz może przegrać z bieżącą aktywnością" without a hard on/off cutoff
 *  right at `injury > 0`. */
const MIN_SEVERITY = 0.05

/** Scales severity up a little past 1:1 so a genuinely serious injury (high
 *  severity, medicine in hand) can outscore ordinary need pressures the same
 *  way `Needs.ts`'s own multipliers (1.1-1.4) do — not tuned against a
 *  specific threshold, just kept in the same order of magnitude. */
const PRESSURE_MULT = 1.15

/**
 * Bounded to `[0, 1]`, same convention as `Needs.ts`'s pressures and
 * `weatherShelterPressure`, so it competes directly against them in one
 * `pickActionKind` call. `0` whenever there is no healable injury or no
 * usable health consumable on hand — an unmedicated NPC never becomes a
 * healing candidate (plan requirement: "injury bez medicine → brak
 * wykonalnego healing"), and a dead/uninjured NPC never does either.
 */
export function healingPressure(injury: number, maxHp: number, hasHealthConsumable: boolean): number {
  if (injury <= 0 || !hasHealthConsumable || maxHp <= 0) return 0
  const severity = injury / maxHp
  if (severity <= MIN_SEVERITY) return 0
  return Math.min(1, severity * PRESSURE_MULT)
}

/**
 * Injury accounting deltas (plan npc-002 §4) — pure arithmetic so
 * `NpcAgent.takeDamage()`/the `heal` action's `onComplete` just call these
 * instead of duplicating the clamp invariant inline. `injury` only ever
 * tracks *healable physical* HP loss/gain, never derived from
 * `maxHp - currentHp` (that would conflate it with future non-physical
 * deprivation damage, see the plan's "Kluczowa zasada").
 */
export function increaseInjuryFromDamage(injury: number, actualHpLoss: number): number {
  if (actualHpLoss <= 0) return injury
  return injury + actualHpLoss
}

/** Clamps at 0 — an over-heal (restoring more HP than the outstanding
 *  injury, e.g. a strong consumable on a nearly-healed NPC) never drives
 *  injury negative. */
export function decreaseInjuryFromHeal(injury: number, actualHpRestored: number): number {
  if (actualHpRestored <= 0) return injury
  return Math.max(0, injury - actualHpRestored)
}
