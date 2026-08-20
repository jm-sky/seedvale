/**
 * Ranged accuracy/aim resolution (plan 162) — the single place a bow's base
 * accuracy and the `archery` skill turn into an actual fired direction.
 * There is no separate "hit roll": accuracy only widens or narrows how far
 * the projectile's initial direction can deviate from the aim yaw, and
 * `combat/projectile.ts`'s swept collision decides the real outcome from
 * that trajectory — this keeps hit/miss geometric and deterministic instead
 * of a second probability layer duplicating what the projectile already does.
 */
import type { RangedConfig } from '../items/itemCatalog'

/** Max extra accuracy a fully trained `archery` skill adds on top of the
 *  bow's own base accuracy (mirrors `defenseResolver.ts`'s skill-bonus
 *  shape). */
const ARCHERY_MAX_ACCURACY_BONUS = 0.22

/** Widest aim deviation (radians) at zero effective accuracy — small enough
 *  that a middling bow/skill combo still reliably hits a stationary target
 *  a few metres out, wide enough that a poorly-aimed shot can visibly miss. */
const MAX_DEVIATION_RAD = 0.34

export function rangedAccuracy(config: RangedConfig, archerySkillValue: number): number {
  const skillBonus = ARCHERY_MAX_ACCURACY_BONUS * Math.max(0, Math.min(1, archerySkillValue))
  return Math.max(0, Math.min(1, config.accuracy + skillBonus))
}

/** Deterministic roll in `[-1, 1]` — same hash shape as
 *  `combat/criticalHit.ts`'s `criticalRoll`. */
export function rangedDeviationRoll(sourceId: string, attempt: number): number {
  let h = Math.imul(hashString(sourceId), 2654435761)
  h = Math.imul(h ^ (attempt + 0x9e3779b9), 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return ((h >>> 0) / 4294967296) * 2 - 1
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Fired direction — `aimYaw` is the same yaw convention `resolveMeleeHits`/
 *  `yawToward` use (`-sin(yaw)`, `-cos(yaw)`). Lower `accuracy` widens the
 *  deviation applied on top of `aimYaw`. */
export function resolveRangedDirection(
  aimYaw: number,
  accuracy: number,
  deviationRoll: number,
): { dirX: number, dirZ: number } {
  const deviation = (1 - accuracy) * MAX_DEVIATION_RAD * deviationRoll
  const yaw = aimYaw + deviation
  return { dirX: -Math.sin(yaw), dirZ: -Math.cos(yaw) }
}
