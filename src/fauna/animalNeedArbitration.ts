import { NEED_ELEVATED_THRESHOLD } from './AnimalLife'

/** Thirst/hunger above this may interrupt lead/follow leash (critical need). */
export const NEED_CRITICAL_THRESHOLD = 0.88

/** Player-owned Follow / lead: autonomous food/water targets must stay within
 *  this distance of the player control point. */
export const OWNED_NEED_LEASH_RADIUS = 32

/** Stay mode: needs may be satisfied only near the stay anchor. */
export const STAY_NEED_LEASH_RADIUS = 18

export function isNeedCritical(hunger: number, thirst: number): boolean {
  return hunger >= NEED_CRITICAL_THRESHOLD || thirst >= NEED_CRITICAL_THRESHOLD
}

/** Active lead defers ordinary elevated needs unless they are critical. */
export function shouldDeferNeedsForLead(hunger: number, thirst: number): boolean {
  const elevated = hunger > NEED_ELEVATED_THRESHOLD || thirst > NEED_ELEVATED_THRESHOLD
  if (!elevated) return false
  return !isNeedCritical(hunger, thirst)
}

export function distanceXZ(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  return Math.hypot(ax - bx, az - bz)
}
