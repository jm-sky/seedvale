/**
 * Riding stability model (plan fauna-003 §11/§14) — combines mount stamina,
 * current gait, terrain slope and mount HP condition into a per-second fall
 * probability, reduced by the player's `riding` skill. Species-agnostic (no
 * `AnimalKind` here at all): every input is a plain ratio the riding system
 * derives from whichever mount is currently ridden. Pure/deterministic given
 * an injected `random`, so it's unit-testable independent of `AnimalAgent`/
 * `PlayerController`.
 */

export type StabilityInput = {
  /** Mount's current/max stamina, 0-1. */
  staminaRatio: number
  /** Mount's current gait — sprinting is the main risk driver. */
  sprinting: boolean
  /** Terrain steepness under the mount, 0 (flat) - 1 (unwalkably steep). */
  slopeRatio: number
  /** Mount's current/max HP, 0-1 — an injured mount is a shakier ride. */
  conditionRatio: number
  /** Player's `riding` skill value (`SKILL_MIN_VALUE`..1). */
  ridingSkill: number
}

const BASE_RISK_PER_SEC = 0.004
const SPRINT_RISK_MULTIPLIER = 3
/** Below this stamina ratio, low stamina starts adding risk. */
const LOW_STAMINA_THRESHOLD = 0.3
/** Below this HP ratio, mount condition starts adding risk. */
const LOW_CONDITION_THRESHOLD = 0.4
/** Slope ratio below which terrain is ignored entirely. */
const CALM_SLOPE_THRESHOLD = 0.15

/** Per-second chance of a fall under the given conditions. Calm riding
 *  (walking, well-rested mount, flat ground) is exactly zero risk — the
 *  plan's "przy spokojnym ruchu i wysokiej staminie ryzyko powinno być
 *  praktycznie zerowe" — regardless of `ridingSkill`, so a brand-new rider
 *  never falls off just standing around. */
export function fallRiskPerSecond(input: StabilityInput): number {
  if (!input.sprinting && input.staminaRatio > LOW_STAMINA_THRESHOLD && input.slopeRatio < CALM_SLOPE_THRESHOLD) {
    return 0
  }
  let risk = BASE_RISK_PER_SEC
  if (input.sprinting) risk *= SPRINT_RISK_MULTIPLIER
  risk *= 1 + Math.max(0, LOW_STAMINA_THRESHOLD - input.staminaRatio) * 6
  risk *= 1 + Math.max(0, LOW_CONDITION_THRESHOLD - input.conditionRatio) * 4
  risk *= 1 + input.slopeRatio * 2
  // Riding skill sits in [SKILL_MIN_VALUE, 1] (see `PlayerSkills.ts`) —
  // reduces risk down to a 30% floor at mastery, never to zero.
  risk *= Math.max(0.3, 1 - (input.ridingSkill - 0.2) * 0.9)
  return Math.max(0, risk)
}

/** Rolls whether a fall happens this tick, given `dt` seconds since the last
 *  roll. `random` is injectable for deterministic tests. */
export function rollFall(input: StabilityInput, dt: number, random: () => number = Math.random): boolean {
  const risk = fallRiskPerSecond(input)
  if (risk <= 0) return false
  return random() < risk * dt
}

/** Fall damage (plan fauna-003 §14) — speed + a random severity roll +
 *  terrain, reduced by riding skill. Routed through the player's existing
 *  HP/damage pipeline by the caller; never a separate mount-only damage
 *  path. */
export function fallDamage(speedRatio: number, slopeRatio: number, ridingSkill: number, severityRoll: number): number {
  const base = 6 + speedRatio * 14 + slopeRatio * 10
  const severity = 0.5 + severityRoll
  const skillReduction = Math.max(0.4, 1 - (ridingSkill - 0.2) * 0.6)
  return Math.max(1, Math.round(base * severity * skillReduction))
}
