/**
 * Player skills (plan 124 foundation, progression added by plan 128).
 * Deliberately not a registry/framework: two skills, one shared XP curve, no
 * levels, no perks, no points to spend. `xp` is the authoritative progression
 * state (the only thing persisted); `value` is always derived from it through
 * `xpToSkillValue` so the two can never drift apart.
 */
export type SkillId = 'sneak' | 'survival' | 'traps' | 'defense'

export type SkillState = {
  /** [0,1] — derived from `xp`, never assigned independently. */
  value: number
  /** Accumulated experience; the persisted progression source. */
  xp: number
  /** Whether the skill's effect is currently switched on. Only `sneak` uses
   *  this today; `survival` is passive and stays `false`. */
  active: boolean
}

export type PlayerSkills = Record<SkillId, SkillState>

/** Floor of the derived value: a brand-new character is a novice, not
 *  literally incapable — a 0 floor would make Sneak strictly worse than not
 *  sneaking (slower, zero stealth gain), so the use→XP loop could never
 *  start. */
export const SKILL_MIN_VALUE = 0.2

/** XP at which half of the remaining range above `SKILL_MIN_VALUE` is earned.
 *  Small enough that the first gains are quickly felt, large enough that the
 *  top of the curve stays a long grind (diminishing returns). */
export const SKILL_XP_HALF_VALUE = 120

/** Monotonic, bounded, deterministic: `SKILL_MIN_VALUE` at 0 xp, asymptotic
 *  to 1. Shared by both skills — no per-skill curve tuning. */
export function xpToSkillValue(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return SKILL_MIN_VALUE
  const fraction = xp / (xp + SKILL_XP_HALF_VALUE)
  return SKILL_MIN_VALUE + (1 - SKILL_MIN_VALUE) * fraction
}

/** Inverse of `xpToSkillValue` — only used to express a target *value* as the
 *  XP that produces it (e.g. the legacy fixed Sneak level in a migrated
 *  save). Returns 0 for anything at or below the floor. */
export function xpForSkillValue(value: number): number {
  const above = (value - SKILL_MIN_VALUE) / (1 - SKILL_MIN_VALUE)
  if (!Number.isFinite(above) || above <= 0) return 0
  if (above >= 1) return Number.POSITIVE_INFINITY
  return (SKILL_XP_HALF_VALUE * above) / (1 - above)
}

/** Plan 124 shipped Sneak as a flat 0.5. Saves written before progression
 *  existed restore to exactly that level (`persistence/saveData.ts`'s
 *  v14 → v15 migration). */
export const SNEAK_LEGACY_VALUE = 0.5
export const SNEAK_LEGACY_XP = xpForSkillValue(SNEAK_LEGACY_VALUE)

function createSkillState(xp = 0): SkillState {
  return { value: xpToSkillValue(xp), xp, active: false }
}

export function createPlayerSkills(): PlayerSkills {
  return {
    sneak: createSkillState(),
    survival: createSkillState(),
    traps: createSkillState(),
    defense: createSkillState(),
  }
}

/**
 * The single mutation path for progression — awards XP for a *completed*
 * action and re-derives `value`. Ignores non-positive/malformed amounts so a
 * cancelled or degenerate action can never move (or corrupt) a skill.
 */
export function awardSkillXp(skills: PlayerSkills, id: SkillId, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  const state = skills[id]
  state.xp += amount
  state.value = xpToSkillValue(state.xp)
}

/** Overlays validated persisted XP onto a freshly created skill set. Clamps
 *  defensively (a hand-edited save must not push NaN into movement/fauna
 *  math) and never restores `active` — that is runtime state. */
export function restorePersistedSkills(
  skills: PlayerSkills,
  saved: Partial<Record<SkillId, { xp: number }>>,
): void {
  for (const id of Object.keys(skills) as SkillId[]) {
    const xp = saved[id]?.xp
    const safe = Number.isFinite(xp) && (xp as number) > 0 ? (xp as number) : 0
    skills[id].xp = safe
    skills[id].value = xpToSkillValue(safe)
    skills[id].active = false
  }
}

export function toggleSneak(skills: PlayerSkills): void {
  skills.sneak.active = !skills.sneak.active
}

/** XP granted by each completed action (plan 128 §1 "rozwój przez używanie").
 *  Never awarded per frame — every entry hangs off a success branch. */
export const SKILL_XP_AWARD = {
  /** Per `SNEAK_XP_DISTANCE_M` actually moved while sneaking. */
  sneakDistance: 3,
  igniteFire: 8,
  pitchTent: 10,
  cookMeat: 6,
  campRest: 12,
  /** Plan 141 §1 — awarded only for a *confirmed* trap capture, never for
   *  placing, arming, disarming or an animal evading the trap. Single award
   *  site: `world/createPlacedTraps.ts`'s capture path via `onCapture`. */
  captureTrap: 14,
  /** Plan 150 — awarded on a successful full or partial block. */
  defenseBlock: 8,
} as const

/** Metres of real sneaking movement per XP award — the "significant completed
 *  action" unit for a continuous mechanic. */
export const SNEAK_XP_DISTANCE_M = 15

/**
 * Folds one frame's travelled distance into the sneak-use accumulator and
 * awards XP for every whole interval crossed. Returns the new accumulator
 * (the caller owns it, so nothing is persisted and it resets naturally when
 * Sneak switches off). Pure apart from the XP award.
 */
export function accumulateSneakUse(
  skills: PlayerSkills,
  accumulated: number,
  distance: number,
): number {
  if (!Number.isFinite(distance) || distance <= 0) return accumulated
  let total = accumulated + distance
  while (total >= SNEAK_XP_DISTANCE_M) {
    total -= SNEAK_XP_DISTANCE_M
    awardSkillXp(skills, 'sneak', SKILL_XP_AWARD.sneakDistance)
  }
  return total
}

/** Flat slowdown while Sneak is active — applies the same way to walk and
 *  sprint speed (plan 124 §3: 30-50% slower across all movement tiers), so
 *  the caller just feeds in whatever base speed it already computed. */
export const SNEAK_SPEED_MULTIPLIER = 0.65

export function applySneakSpeedModifier(baseSpeed: number, sneakActive: boolean): number {
  return sneakActive ? baseSpeed * SNEAK_SPEED_MULTIPLIER : baseSpeed
}

/** Strongest speed-up Survival can give a camp chore at value 1 (plan 128
 *  §"Balans": noticeable, never instant). */
const SURVIVAL_MAX_DURATION_CUT = 0.4

/**
 * Multiplier for an existing busy-channel duration (ignite, tent setup).
 * Evaluated once when the action starts — a running channel is never
 * retimed. Monotonically decreasing in `value`, bounded to
 * `[1 - SURVIVAL_MAX_DURATION_CUT, 1]`.
 */
export function survivalDurationMultiplier(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return 1 - SURVIVAL_MAX_DURATION_CUT * v
}

/** Extra nutrition an experienced survivalist gets out of the same
 *  `roasted_meat` at value 1 (plan 128 §4 — one item, better handling). */
const SURVIVAL_MAX_FOOD_BONUS = 0.5

/** Multiplier applied to cooked meat's hunger relief at consumption time. */
export function survivalFoodMultiplier(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return 1 + SURVIVAL_MAX_FOOD_BONUS * v
}
