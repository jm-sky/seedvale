import type { HeightSampler } from '../player/PlayerController'

/**
 * Slope-based movement constraint (plan 183) — shared by `PlayerController`,
 * `NpcAgent` and `AnimalAgent` so steep terrain slows/blocks uphill movement
 * the same way for every walking agent, instead of three parallel systems.
 * Pure, no `THREE`: operates on a per-frame XZ movement vector and returns
 * the constrained vector — it never touches position directly.
 */

/** Below this angle, terrain has no effect on movement speed. */
export const SLOPE_FALLOFF_START_DEG = 35
/** At/above this angle, the uphill component of movement is fully removed —
 *  across-slope and downhill movement are never affected by this limit. */
export const SLOPE_MAX_WALKABLE_DEG = 55
/** Finite-difference probe offset (meters). Small enough to stay within the
 *  terrain apron margin (`chunkHeightmap.ts`'s 1-texel seam-safe border at
 *  default resolution), so sampling near a chunk edge stays continuous
 *  without special-casing. */
export const SLOPE_SAMPLE_STEP = 1.2

const FALLOFF_START_RAD = (SLOPE_FALLOFF_START_DEG * Math.PI) / 180
const MAX_WALKABLE_RAD = (SLOPE_MAX_WALKABLE_DEG * Math.PI) / 180

/** Smoothstep (derivative 0 at both ends) — mirrors `playerEncumbrance.ts`'s
 *  falloff so the band edges never produce a visible speed pop. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

export interface SlopeSample {
  /** Slope angle from horizontal, in radians. */
  angleRad: number
  /** Unit vector pointing uphill in the XZ plane; `(0, 0)` on flat ground. */
  upX: number
  upZ: number
}

/** Central-difference slope probe at `(x, z)` — the same finite-difference
 *  idiom as `settlement/villagePlanner.ts`'s `localSlope()`, generalized to
 *  return a signed uphill direction instead of just a magnitude. */
export function sampleSlope(
  x: number,
  z: number,
  sampleHeight: HeightSampler,
  step = SLOPE_SAMPLE_STEP,
): SlopeSample {
  const dHdx = (sampleHeight(x + step, z) - sampleHeight(x - step, z)) / (2 * step)
  const dHdz = (sampleHeight(x, z + step) - sampleHeight(x, z - step)) / (2 * step)
  const gradLen = Math.hypot(dHdx, dHdz)
  if (gradLen < 1e-6) return { angleRad: 0, upX: 0, upZ: 0 }
  return {
    angleRad: Math.atan(gradLen),
    upX: dHdx / gradLen,
    upZ: dHdz / gradLen,
  }
}

/**
 * Projects `(wishX, wishZ)` against a sampled slope: the component climbing
 * uphill is scaled down (smoothstep) between `SLOPE_FALLOFF_START_DEG` and
 * `SLOPE_MAX_WALKABLE_DEG`, and fully removed at/beyond it. Downhill and
 * across-slope components always pass through unchanged, so a diagonal wish
 * still slides sideways along a too-steep slope instead of stopping dead.
 */
export function constrainToSlope(
  wishX: number,
  wishZ: number,
  slope: SlopeSample,
): { x: number, z: number } {
  if (slope.angleRad <= FALLOFF_START_RAD) return { x: wishX, z: wishZ }
  const uphill = wishX * slope.upX + wishZ * slope.upZ
  if (uphill <= 0) return { x: wishX, z: wishZ }
  const t = Math.min(1, (slope.angleRad - FALLOFF_START_RAD) / (MAX_WALKABLE_RAD - FALLOFF_START_RAD))
  const multiplier = 1 - smoothstep(t)
  const removed = uphill - uphill * multiplier
  return { x: wishX - slope.upX * removed, z: wishZ - slope.upZ * removed }
}

/** Convenience wrapper: sample + constrain in one call — the entry point
 *  `PlayerController`/`NpcAgent`/`AnimalAgent` call once per moving frame. */
export function applySlopeMovementConstraint(
  wishX: number,
  wishZ: number,
  x: number,
  z: number,
  sampleHeight: HeightSampler,
): { x: number, z: number } {
  return constrainToSlope(wishX, wishZ, sampleSlope(x, z, sampleHeight))
}

/**
 * One slope-constrained movement step with the shared 3-tier collision
 * fallback (`NpcAgent.steerTo` / `AnimalAgent.steerToward`, plan 202): try
 * the full diagonal step, then X-only, then Z-only, so a mover sliding along
 * an obstacle still makes partial progress instead of stopping dead. `dirX`/
 * `dirZ` must already be a unit vector — this only scales by `speed * dt`
 * and applies the slope constraint, it does not normalize. Returns the
 * resulting position and whether it actually changed (a fully-blocked or
 * fully slope-cancelled step reports `moved: false`); callers that need
 * their own "moving" flag semantics (e.g. `AnimalAgent`, which sets it
 * unconditionally before attempting the step) can ignore `moved`.
 */
export function stepWithSlopeAndCollision(params: {
  x: number
  z: number
  dirX: number
  dirZ: number
  speed: number
  dt: number
  sampleHeight: HeightSampler
  isWalkable: (x: number, z: number) => boolean
}): { x: number, z: number, moved: boolean } {
  const { x, z, dirX, dirZ, speed, dt, sampleHeight, isWalkable } = params
  const step = applySlopeMovementConstraint(dirX * speed * dt, dirZ * speed * dt, x, z, sampleHeight)
  let nx = x
  let nz = z
  if (isWalkable(x + step.x, z + step.z)) {
    nx = x + step.x
    nz = z + step.z
  } else if (isWalkable(x + step.x, z)) {
    nx = x + step.x
  } else if (isWalkable(x, z + step.z)) {
    nz = z + step.z
  }
  return { x: nx, z: nz, moved: nx !== x || nz !== z }
}
