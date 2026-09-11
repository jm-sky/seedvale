/** Representation-neutral cave ground / occupancy / interior contract
 *  (world-terrain-019; lifted out of the retired SDF query module when the
 *  heightfield became the spatial authority).
 *
 *  Owns the *gameplay* half of a cave spatial query — what a ground hit
 *  looks like, how far below a floor an entity still belongs to it, the
 *  strict-occupancy slack, and the per-entity continuity rules (ground
 *  underground-miss hysteresis, two-sample interior confirmation). Nothing
 *  here knows how an interval was found: `caveHeightfieldQuery.ts` builds
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

/** Closed-interval slack for strict occupancy (collision / camera). Far
 *  smaller than `CAVE_FLOOR_GRACE` — that grace is ground continuity, not
 *  a solid test. A few centimetres covers floor sampling vs feet-on-floor;
 *  do not add this to the clipped ceiling: `SURFACE_CLIP_EPS` already keeps
 *  a surface entity out. */
export const CAVE_OCCUPANCY_EPS = 0.05

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

export type CaveInteriorHysteresis = {
  interior: boolean
  rememberRaw: boolean
}

/**
 * Two-sample confirmation so a single mouth-boundary occupancy flicker does
 * not flip cave-interior state (ambience / diagnostics).
 *
 * Per-entity state: callers keep `rememberRaw` / `interior` for *one*
 * entity's next query.
 *
 * @domain world-terrain
 */
export function applyCaveInteriorHysteresis(
  sample: boolean,
  lastRaw: boolean | null,
  confirmed: boolean,
): CaveInteriorHysteresis {
  if (lastRaw === null) return { interior: sample, rememberRaw: sample }
  if (sample === lastRaw) return { interior: sample, rememberRaw: sample }
  return { interior: confirmed, rememberRaw: sample }
}
