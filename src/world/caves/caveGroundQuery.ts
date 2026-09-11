/** Representation-neutral cave ground contract (world-terrain-019, lifted
 *  out of `caveSdfQuery.ts` when player ground moved to the heightfield).
 *
 *  Owns the *gameplay* half of a cave ground query — what a hit looks like,
 *  how far below a floor an entity still belongs to it, and the per-entity
 *  continuity rule for a single-frame miss. Nothing here knows how the
 *  interval was found: `caveHeightfieldQuery.ts` (production ground) and
 *  `caveSdfQuery.ts` (transitional strict occupancy / interior) both build
 *  on these types.
 *
 * @domain world-terrain
 */

export type CaveVerticalInterval = {
  floorY: number
  ceilingY: number
  /** True when `ceilingY` is the surface clip, not rock overburden — the
   *  void reaches the sky (mouth / portal). PlayerController must not use
   *  it as `maxY`. */
  openSky?: boolean
}

export type CaveGroundHit = {
  floorY: number
  ceilingY: number
  openSky?: boolean
  /** All walkable intervals at this X/Z, lowest-first. The heightfield
   *  carries exactly one; the SDF column index may carry several. */
  intervals: readonly CaveVerticalInterval[]
}

/** How far below a reported floor an entity still belongs to that interval.
 *  Matches `caveVolume.ts`'s `FLOOR_GRACE` scale so a step/jump does not
 *  drop the player out; the ceiling bound is what separates cave from the
 *  hillside above it. Collision and camera occupancy must not use this. */
export const CAVE_FLOOR_GRACE = 2

/** `sampleHeight - playerY` above this is an underground miss, not a
 *  legitimate cave→surface exit (mouth exit has the two heights meeting). */
export const CAVE_UNDERGROUND_MISS = 1.5

export type CaveGroundHysteresis = {
  hit: CaveGroundHit | null
  remember: CaveGroundHit | null
}

/**
 * Continuity policy for a single-frame query miss. An underground miss
 * (`surfaceY - y` clearly larger than a mouth-exit) keeps the last cave
 * interval so `groundAt` does not fall through to `sampleHeight` and
 * teleport the player up. A surface entity (`surfaceY ≈ y`) is never
 * assigned to a cave below them. A fresh hit always wins.
 *
 * Per-entity state: callers keep `remember` for *one* entity's next query.
 *
 * @domain world-terrain
 */
export function applyCaveGroundHysteresis(
  hit: CaveGroundHit | null,
  y: number,
  surfaceY: number,
  lastHit: CaveGroundHit | null,
): CaveGroundHysteresis {
  if (hit) return { hit, remember: hit }
  if (lastHit && surfaceY - y > CAVE_UNDERGROUND_MISS) {
    return { hit: lastHit, remember: lastHit }
  }
  return { hit: null, remember: null }
}
