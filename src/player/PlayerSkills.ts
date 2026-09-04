/**
 * Player skills (plan 124 foundation, progression added by plan 128).
 * Deliberately not a registry/framework: two skills, one shared XP curve, no
 * levels, no perks, no points to spend. `xp` is the authoritative progression
 * state (the only thing persisted); `value` is always derived from it through
 * `xpToSkillValue` so the two can never drift apart.
 *
 * @domain items-player
 * @system player-skills
 * @role Owns the player's skill XP curve and the single award path.
 * @owns PlayerSkills
 */
export type SkillId = 'sneak' | 'survival' | 'traps' | 'defense' | 'archery' | 'riding'

/** Shared Polish display name per skill — single source for the Skills
 *  screen and any other UI naming a skill (plan items-player-016's book
 *  details/toasts), so a skill's display name never has to be duplicated
 *  per screen. */
export const SKILL_LABEL: Record<SkillId, string> = {
  sneak: 'Skradanie się',
  survival: 'Sztuka przetrwania',
  traps: 'Pułapki',
  defense: 'Obrona',
  archery: 'Łucznictwo',
  riding: 'Jeździectwo',
}

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
 *  save, or a book's `raiseSkillToValue` target). Returns 0 for anything at
 *  or below the floor. `value` is capped just short of 1 before inverting —
 *  the curve is asymptotic, so exact mastery has no finite XP; returning
 *  `Infinity` here would poison `xpToSkillValue` (`!Number.isFinite` back to
 *  the floor) for any caller that clamps a target up to 1. */
export function xpForSkillValue(value: number): number {
  const above = (value - SKILL_MIN_VALUE) / (1 - SKILL_MIN_VALUE)
  if (!Number.isFinite(above) || above <= 0) return 0
  const capped = Math.min(above, 1 - 1e-9)
  return (SKILL_XP_HALF_VALUE * capped) / (1 - capped)
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
    archery: createSkillState(),
    riding: createSkillState(),
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

export type RaiseSkillResult = { changed: boolean, previousValue: number, value: number }

/**
 * The single write path for a *knowledge-driven* skill increase (plan
 * items-player-016 — books): raises `id` straight to `targetValue` through
 * the existing XP curve rather than awarding a flat amount like
 * `awardSkillXp`. A no-op whenever `targetValue` is not strictly above the
 * skill's current value, and never lowers XP even if rounding through
 * `xpForSkillValue`/`xpToSkillValue` would otherwise nudge it down — a book
 * read below its own target, or read again afterwards, can only ever leave
 * the skill unchanged.
 */
export function raiseSkillToValue(skills: PlayerSkills, id: SkillId, targetValue: number): RaiseSkillResult {
  const state = skills[id]
  const previousValue = state.value
  if (!Number.isFinite(targetValue) || targetValue <= previousValue) {
    return { changed: false, previousValue, value: previousValue }
  }
  const targetXp = xpForSkillValue(Math.min(targetValue, 1))
  if (targetXp <= state.xp) return { changed: false, previousValue, value: previousValue }
  state.xp = targetXp
  state.value = xpToSkillValue(state.xp)
  return { changed: true, previousValue, value: state.value }
}

/** Dev-console-only direct set (plan items-player-016's Debug API) — unlike
 *  `raiseSkillToValue`, this *can* lower a skill, so a test can arrange a
 *  state like "riding = 0.39" below a book's requirement. Never used by real
 *  gameplay; `debug/npcDebugApi.ts`'s `skills.setSkillValue` is the only
 *  caller, kept here so it never has to poke `xp`/`value` directly. */
export function setSkillValueForDebug(skills: PlayerSkills, id: SkillId, value: number): void {
  const clamped = Math.max(SKILL_MIN_VALUE, Math.min(1, value))
  const state = skills[id]
  state.xp = xpForSkillValue(clamped)
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
  /** Plan 162 — awarded once per arrow that actually hits a target, never
   *  per shot fired (a clean miss teaches nothing). */
  rangedHit: 6,
  /** Per `RIDING_XP_DISTANCE_M` actually covered while mounted (plan
   *  fauna-003 §12), same "use → XP" shape as `sneakDistance`. */
  ridingDistance: 3,
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

/** Metres of mounted travel per XP award (plan fauna-003 §12) — mirrors
 *  `SNEAK_XP_DISTANCE_M`'s "significant completed action" unit. */
export const RIDING_XP_DISTANCE_M = 20

/** Folds one frame's mounted travel distance into the riding-use
 *  accumulator and awards XP for every whole interval crossed — same shape
 *  as `accumulateSneakUse`, just keyed to distance the *mount* covered
 *  rather than the player's own steps. */
export function accumulateRidingUse(
  skills: PlayerSkills,
  accumulated: number,
  distance: number,
): number {
  if (!Number.isFinite(distance) || distance <= 0) return accumulated
  let total = accumulated + distance
  while (total >= RIDING_XP_DISTANCE_M) {
    total -= RIDING_XP_DISTANCE_M
    awardSkillXp(skills, 'riding', SKILL_XP_AWARD.ridingDistance)
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

/** [0,1] progress from `SKILL_MIN_VALUE` (a brand-new rider) to mastery
 *  (value 1) — unlike `survivalDurationMultiplier`/`survivalFoodMultiplier`
 *  (which already have some effect right at the floor), Riding's mounted
 *  speed/stamina mappings must be an exact no-op at minimum skill (plan
 *  fauna-008: "Every rideable horse must always be faster than the human
 *  player, even at minimum Riding skill" — the base `AnimalDef` speeds alone
 *  carry that invariant, so skill can only ever add on top, never subtract). */
function ridingSkillProgress(value: number): number {
  const v = Math.max(SKILL_MIN_VALUE, Math.min(1, value))
  return (v - SKILL_MIN_VALUE) / (1 - SKILL_MIN_VALUE)
}

/** Strongest mounted speed-up Riding can give at value 1 (plan fauna-008) —
 *  a moderate on-top bonus; the horse-over-human ordering itself comes from
 *  the rideable species' base speed, not from this. */
const RIDING_MAX_SPEED_BONUS = 0.15

/** Multiplier applied to the mount's effective walk/sprint speed while
 *  player-driven (`mountActions.ts` resolves this and passes it into
 *  `AnimalAgent.driveMounted()`). `1` at `SKILL_MIN_VALUE` (unmodified
 *  species baseline), monotonically increasing to `1 + RIDING_MAX_SPEED_BONUS`
 *  at mastery. Never applied to free-roaming AI movement. */
export function ridingSpeedMultiplier(value: number): number {
  return 1 + RIDING_MAX_SPEED_BONUS * ridingSkillProgress(value)
}

/** Largest fraction of the baseline riding stamina drain Riding can cut at
 *  value 1 (plan fauna-008) — halves it at mastery, never eliminates it
 *  (riding stays an effective but non-free way to travel). */
const RIDING_MAX_STAMINA_DRAIN_CUT = 0.5

/** Multiplier applied to `PlayerNeeds.ts`'s `RIDING_STAMINA_DRAIN_PER_SEC`
 *  while the mount is actually moving. `1` at `SKILL_MIN_VALUE` (preserves
 *  the existing 3/s baseline exactly), monotonically decreasing to
 *  `1 - RIDING_MAX_STAMINA_DRAIN_CUT` at mastery. Stationary regeneration is
 *  untouched — this only scales the drain branch. */
export function ridingStaminaDrainMultiplier(value: number): number {
  return 1 - RIDING_MAX_STAMINA_DRAIN_CUT * ridingSkillProgress(value)
}

/** Extra nutrition an experienced survivalist gets out of the same
 *  `roasted_meat` at value 1 (plan 128 §4 — one item, better handling). */
const SURVIVAL_MAX_FOOD_BONUS = 0.5

/** Multiplier applied to cooked meat's hunger relief at consumption time. */
export function survivalFoodMultiplier(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return 1 + SURVIVAL_MAX_FOOD_BONUS * v
}
