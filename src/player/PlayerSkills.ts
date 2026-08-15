/**
 * Player skills foundation (plan 124). Deliberately minimal: no registry, no
 * XP/levelling — just identity (`SkillId`) separated from a skill's current
 * value and, for `sneak`, whether it's actively toggled on. Extend `SkillId`
 * and `PlayerSkills` when a second skill is implemented; don't build a
 * generic framework ahead of that need.
 */
export type SkillId = 'sneak'

export type SkillState = {
  /** [0,1] — fixed for now (no progression system yet, see plan 124 §1). */
  value: number
  /** Whether the skill's effect is currently switched on. Only `sneak` uses
   *  this today; a future passive-only skill could leave it always `false`. */
  active: boolean
}

export type PlayerSkills = Record<SkillId, SkillState>

/** Sneak is fixed at 50% until a progression system exists (out of scope,
 *  plan 124 §"Out of scope"). */
export const SNEAK_FIXED_VALUE = 0.5

export function createPlayerSkills(): PlayerSkills {
  return { sneak: { value: SNEAK_FIXED_VALUE, active: false } }
}

export function toggleSneak(skills: PlayerSkills): void {
  skills.sneak.active = !skills.sneak.active
}

/** Flat slowdown while Sneak is active — applies the same way to walk and
 *  sprint speed (plan 124 §3: 30-50% slower across all movement tiers), so
 *  the caller just feeds in whatever base speed it already computed. */
export const SNEAK_SPEED_MULTIPLIER = 0.65

export function applySneakSpeedModifier(baseSpeed: number, sneakActive: boolean): number {
  return sneakActive ? baseSpeed * SNEAK_SPEED_MULTIPLIER : baseSpeed
}
