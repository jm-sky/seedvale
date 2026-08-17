/**
 * Camp system (plan 128 §5-§7) — the glue that turns campfire + blanket +
 * tent from three unrelated items into one bivouac. Deliberately *not* a
 * manager: nothing here owns world state. It reads the existing placed
 * fires/tents at the moment rest starts and returns a derived context plus a
 * rest-quality number the existing sleep restore consumes.
 */

/** Which of the three camp ingredients the player actually has around them.
 *  Resolved once, at rest start — never polled per frame. */
export type CampRestContext = {
  /** The bedroll: `blanket` in the inventory (the quick action already
   *  requires it) or the tent-rest path's own bedding. */
  hasBlanket: boolean
  /** Sleeping inside/next to a pitched tent. */
  hasTent: boolean
  /** A *lit* fire close enough to keep the camp warm. */
  hasWarmFire: boolean
}

/** XZ metres a player campfire keeps a camp warm over. Small on purpose: a
 *  fire somewhere else in the world must never count. */
export const WARM_FIRE_RADIUS = 6

/** XZ metres from a pitched tent that still counts as sleeping under
 *  shelter — roughly the tent's own footprint plus the blanket beside it. */
export const TENT_SHELTER_RADIUS = 4

type PointLike = { x: number, z: number }

function withinRadius(point: PointLike, x: number, z: number, radius: number): boolean {
  const dx = point.x - x
  const dz = point.z - z
  return dx * dx + dz * dz <= radius * radius
}

/** True when any of `fires` is lit and inside `radius`. An extinguished or
 *  burnt-out fire never contributes warmth, however close it is. */
export function hasWarmFireNear(
  fires: readonly { x: number, z: number, fire: { isLit: () => boolean } }[],
  x: number,
  z: number,
  radius = WARM_FIRE_RADIUS,
): boolean {
  for (const entry of fires) {
    if (!entry.fire.isLit()) continue
    if (withinRadius(entry, x, z, radius)) return true
  }
  return false
}

export function hasTentNear(
  tents: readonly PointLike[],
  x: number,
  z: number,
  radius = TENT_SHELTER_RADIUS,
): boolean {
  for (const tent of tents) {
    if (withinRadius(tent, x, z, radius)) return true
  }
  return false
}

/** Fraction of max vigor a night's sleep restores, before Survival. A bare
 *  blanket on the ground is the weakest camp; each added comfort closes part
 *  of the gap to a full night (plan 128 §6's four combinations). */
const CAMP_REST_BASE_QUALITY = {
  blanket: 0.55,
  blanketFire: 0.75,
  blanketTent: 0.8,
  full: 1,
  /** No bedding at all (tent rest without a blanket) — worse than a bedroll
   *  under the stars is not the point; the tent still shelters, so this sits
   *  just below `blanketTent`. */
  tentOnly: 0.7,
  /** Nothing but the ground. */
  rough: 0.4,
} as const

/** How much of the missing quality Survival can claw back at value 1 — a
 *  seasoned survivalist sleeps almost as well on a blanket as in a full camp,
 *  but never quite (plan 128 §3.3). */
const SURVIVAL_REST_COMPENSATION = 0.6

function baseQuality(context: CampRestContext): number {
  if (context.hasTent && context.hasBlanket && context.hasWarmFire) return CAMP_REST_BASE_QUALITY.full
  if (context.hasTent && context.hasBlanket) return CAMP_REST_BASE_QUALITY.blanketTent
  if (context.hasBlanket && context.hasWarmFire) return CAMP_REST_BASE_QUALITY.blanketFire
  if (context.hasBlanket) return CAMP_REST_BASE_QUALITY.blanket
  if (context.hasTent) return CAMP_REST_BASE_QUALITY.tentOnly
  return CAMP_REST_BASE_QUALITY.rough
}

/**
 * [0,1] fraction of max vigor the finished sleep restores. Deterministic:
 * same context + same Survival value always yields the same number. Survival
 * only ever *reduces* the penalty, so a full camp stays 1 at any skill level.
 */
export function campRestQuality(context: CampRestContext, survivalValue: number): number {
  const base = baseQuality(context)
  const survival = Math.max(0, Math.min(1, survivalValue))
  return base + (1 - base) * SURVIVAL_REST_COMPENSATION * survival
}
