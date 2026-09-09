import { type InjurySeverity, resolveInjurySeverity } from '../shared/injurySeverity'

/**
 * Healable-physical-injury → pressure mapping (plan npc-002 / npc-025). A
 * pure pressure producer, deliberately kept separate from `Needs.ts`'s
 * `generateNeedPressures`: an injury is a health problem, not a `NeedId`
 * (mirrors `weatherPressure.ts`'s `weatherShelterPressure` — a second
 * independent pressure producer competing in the same `NpcDecisionTarget`
 * arbitration via its own `'heal'` target, instead of a second scoring
 * engine or a `health` `NeedId`).
 *
 * Severity is the shared derived vocabulary from `injurySeverity.ts` — this
 * module does not keep a second injury-band cutoff. Feasibility is catalog
 * treatment suitability, not generic `consumable.need === 'health'`.
 *
 * @domain npc
 */

export { decreaseInjuryFromHeal, increaseInjuryFromDamage } from '../shared/injurySeverity'

/** Healing-candidate scores for the existing `'heal'` pressure. Minor stays
 *  low/moderate so ordinary needs can still win; serious/critical outrank
 *  idle and typical work once a suitable treatment is in hand. */
export const HEALING_PRESSURE_BY_SEVERITY: Record<InjurySeverity, number> = {
  critical: 0.98,
  minor: 0.28,
  none: 0,
  serious: 0.72,
}

/**
 * Bounded to `[0, 1]`, same convention as `Needs.ts`'s pressures and
 * `weatherShelterPressure`, so it competes directly against them in one
 * `pickActionKind` call. `0` whenever there is no outstanding injury or no
 * catalog-suitable treatment on hand — passive natural recovery is not a
 * `'heal'` action (plan npc-025: no retry loop without a real treatment).
 */
export function healingPressure(injury: number, maxHp: number, hasSuitableTreatment: boolean): number {
  if (!hasSuitableTreatment || injury <= 0 || maxHp <= 0) return 0
  return HEALING_PRESSURE_BY_SEVERITY[resolveInjurySeverity(injury, maxHp)]
}
