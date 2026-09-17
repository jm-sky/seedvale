import type { AnimalDef, AnimalRole } from './animalDefs'

/** Prey ordinary-walk slowdown at night vs day (matches `AnimalAgent`). */
export const NIGHT_PREY_WALK_MULT = 0.5

/**
 * Species baseline for ordinary local wander (plan fauna-038).
 * Falls back to `walkSpeed` when `calmWalkSpeed` is absent.
 *
 * @domain fauna
 */
export function calmWanderWalkBaseline(
  def: Pick<AnimalDef, 'walkSpeed' | 'calmWalkSpeed'>,
): number {
  return def.calmWalkSpeed ?? def.walkSpeed
}

/**
 * Shared autonomous walk modifiers: prey night slowdown + variant speed.
 * Used by both purposeful `walkSpeedNow` and calm ordinary wander.
 *
 * @domain fauna
 */
export function resolveAutonomousWalkSpeed(
  baseSpeed: number,
  opts: {
    isNight: boolean
    role: AnimalRole
    speedMultiplier: number
  },
): number {
  const nightAdjusted = opts.isNight && opts.role === 'prey'
    ? baseSpeed * NIGHT_PREY_WALK_MULT
    : baseSpeed
  return nightAdjusted * opts.speedMultiplier
}
