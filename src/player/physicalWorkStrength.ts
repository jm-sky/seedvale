/**
 * Shared Strength → physical-work-speed rule (plan npc-020) — the single
 * pure mapping both the player's timed physical actions and NPC ore mining
 * use. Linear, neutral at `Strength = 0.5` (preserves legacy duration
 * exactly):
 *
 * ```text
 * speedMultiplier = 0.75 + strength * 0.5
 * duration        = baseDuration / speedMultiplier
 * 0.00 -> ×0.75
 * 0.50 -> ×1.00
 * 0.60 -> ×1.05
 * 1.00 -> ×1.25
 * ```
 *
 * This is a physical-work consumer rule, not a `PhysicalAttributes` method —
 * the shared attribute primitive stays work-agnostic. Callers opt in
 * explicitly; `BusyAction` and `rollWorkDurationSec()` stay Strength-neutral.
 *
 * @domain items-player
 * @system physical-work-strength
 * @role Maps resolved Strength onto existing physical-work duration.
 */

/** The shared SPEA neutral/reference point (`docs/world/species-physical-reference.md`) —
 *  Strength at this value must leave physical-work duration unchanged. */
export const PHYSICAL_WORK_STRENGTH_NEUTRAL = 0.5

export function physicalWorkSpeedMultiplier(strength: number): number {
  return 0.75 + strength * 0.5
}

/** Scales an already-resolved physical-work base duration by Strength.
 *  Yield, stamina-per-second and completion callbacks are the caller's. */
export function physicalWorkDuration(baseDurationSec: number, strength: number): number {
  return baseDurationSec / physicalWorkSpeedMultiplier(strength)
}
