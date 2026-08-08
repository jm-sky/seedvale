/**
 * Pure "does this animal notice the player" check — kept free of `THREE`/DOM
 * so it can be unit tested (see `CLAUDE.md`'s testing split: `src/fauna/`
 * only gets vitest coverage for plain-logic files, not the `AnimalAgent`
 * class itself). Mirrors `interaction/findInteractionTarget.ts::pickInGaze`'s
 * dot-product cone check — `AnimalAgent.ts` computes `facingDot` the same
 * way (using its own `mesh.rotation.y` as forward instead of the player's).
 */
export type NoticeParams = {
  /** XZ distance between the animal and the player. */
  distance: number
  /** dot(animalForward, toPlayer) — same convention as `pickInGaze`. Ranges
   *  -1 (player directly behind) to 1 (player directly ahead). */
  facingDot: number
  /** Hard trigger radius — noticed regardless of facing (surprised at close
   *  range). */
  panicRange: number
  /** Base "vision" radius before day/night and terrain modifiers, before the
   *  facing-cone check even applies. */
  noticeRange: number
  /** 0 (full night) – 1 (full day), from `dayNight.ts::skyParamsFromTime`. */
  dayFactor: number
  /** 0 (open ground) – 1 (dense forest) — dampens noticeRange, never to zero. */
  forestFactor: number
  /** Minimum `facingDot` to count as "in the vision cone". */
  minFacingDot: number
}

/** Night halves the effective notice range at most; forest dampens it by up
 *  to half again — neither ever reaches zero, an animal can still be
 *  startled up close (panicRange) regardless of either. */
const NIGHT_RANGE_FLOOR = 0.5
const FOREST_RANGE_DAMPING = 0.5

export function effectiveNoticeRange(
  noticeRange: number,
  dayFactor: number,
  forestFactor: number,
): number {
  const dayMult = NIGHT_RANGE_FLOOR + (1 - NIGHT_RANGE_FLOOR) * dayFactor
  const forestMult = 1 - forestFactor * FOREST_RANGE_DAMPING
  return noticeRange * dayMult * forestMult
}

export function isPlayerNoticed(p: NoticeParams): boolean {
  if (p.distance <= p.panicRange) return true
  const range = effectiveNoticeRange(p.noticeRange, p.dayFactor, p.forestFactor)
  return p.distance <= range && p.facingDot >= p.minFacingDot
}
