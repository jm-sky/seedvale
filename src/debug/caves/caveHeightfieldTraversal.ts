/** Experimental cave heightfield spike — traversal / collision queries
 *  derived from the same 2.5D field as the mesh, resolved through the
 *  *production* Cave V2 ground contract. Not production cave collision
 *  ownership.
 *
 *  Ground resolution deliberately mirrors `createCaves().queryGround` +
 *  `PlayerController.groundAt`:
 *
 *  ```text
 *  column intervals (surface-clipped)
 *      ↓ pickInterval(y)              ← production, Y-disambiguated
 *  applyCaveGroundHysteresis(...)     ← production, underground-miss guard
 *      ↓
 *  floorY / ceilingY  |  outdoor surface
 *  ```
 *
 *  That chain is what stops the outdoor heightmap from taking over ground
 *  while the player is stably inside a cave (snap / "swim" over the cave
 *  floor). The spike reuses the production helpers instead of re-deriving
 *  the rule, so the harness can actually detect the regression.
 *
 *  There is no separate collision geometry: presentation and traversal read
 *  the same two heightfields. Lateral containment is a push-out of the
 *  `gap = HEIGHTFIELD_MIN_STANDING_GAP` contour, not of a footprint mask —
 *  with a rounded cross-section the player is stopped by the rising floor
 *  and the falling ceiling, which is what the geometry actually shows.
 *
 * @domain world-terrain
 */

import { integrateVerticalMotion } from '../../player/verticalMotion'
import {
  applyCaveGroundHysteresis,
  CAVE_OCCUPANCY_EPS,
  type CaveGroundHit,
  type CaveVerticalInterval,
  pickInterval,
  SURFACE_CLIP_EPS,
} from '../../world/caves/caveSdfQuery'
import {
  type CaveHeightfield,
  heightfieldGapGradient,
  type HeightfieldSample,
  sampleHeightfieldAt,
  type SurfaceSampler,
} from './caveHeightfieldRepresentation'

/** Mirrors `PlayerController`'s `PLAYER_COLLISION_RADIUS` / `PLAYER_HEIGHT`.
 *  Duplicated rather than imported so `?caveHeightfieldTest` does not pull
 *  the whole gameplay/WorldBundle module graph into the harness bundle;
 *  `caveHeightfieldTraversal.test.ts` asserts the two never drift. */
export const HEIGHTFIELD_PLAYER_RADIUS = 0.35
export const HEIGHTFIELD_PLAYER_HEIGHT = 1.8

/** Clearance the player capsule needs to occupy a column. The rounded fringe
 *  below this is geometry the player looks at, not geometry they stand in. */
export const HEIGHTFIELD_MIN_STANDING_GAP = HEIGHTFIELD_PLAYER_HEIGHT + 0.1

export type { SurfaceSampler }

export type HeightfieldSpaceQuery = HeightfieldSample & {
  /** The player capsule cannot occupy this column. */
  blocked: boolean
}

/**
 * A reported cave ceiling is rock overburden, not the open sky above a
 * mouth/approach pit. Same rule (and same guard) as
 * `PlayerController.rockCeilingMaxY`, parameterised by player height.
 *
 * @domain world-terrain
 */
export function heightfieldRockCeilingMaxY(
  ceilingY: number | null | undefined,
  floorY: number,
  playerHeight = HEIGHTFIELD_PLAYER_HEIGHT,
): number | undefined {
  if (ceilingY == null) return undefined
  const maxY = ceilingY - playerHeight
  if (maxY < floorY - 1e-6) return undefined
  return maxY
}

/**
 * Space query used by Walk mode and unit tests. `blocked` is true wherever
 * the column cannot hold a standing player — solid rock and the low rounded
 * fringe alike.
 *
 * @domain world-terrain
 */
export function queryHeightfieldSpace(
  field: CaveHeightfield,
  x: number,
  z: number,
  minGap = HEIGHTFIELD_MIN_STANDING_GAP,
): HeightfieldSpaceQuery {
  const sample = sampleHeightfieldAt(field, x, z)
  return { ...sample, blocked: sample.gap < minGap && !sample.openSky }
}

/**
 * Pushes an XZ capsule out of rock and out of the low fringe, along the
 * gradient of `gap`. The mouth/approach stays open because the aperture
 * column is `openSky` there, not because of a special case.
 *
 * @domain world-terrain
 */
export function resolveHeightfieldHorizontal(
  field: CaveHeightfield,
  x: number,
  z: number,
  y: number | null = null,
  radius = HEIGHTFIELD_PLAYER_RADIUS,
  minGap = HEIGHTFIELD_MIN_STANDING_GAP,
): { x: number, z: number } {
  let px = x
  let pz = z
  for (let iter = 0; iter < 24; iter++) {
    const sample = sampleHeightfieldAt(field, px, pz)
    // Outdoors the terrain owns containment, exactly as production cave
    // colliders only exist underground (`colliderActiveAtY`). Without this an
    // entity walking the hillside would be dragged toward the mouth by the
    // gap gradient. Beyond the cave-local grid there is no cave at all.
    if (sample.outsideGrid) return { x: px, z: pz }
    if (y != null && y > sample.surfaceY - SURFACE_CLIP_EPS) return { x: px, z: pz }
    if (sample.openSky) return { x: px, z: pz }
    const deficit = minGap - sample.gap
    if (deficit <= 1e-4) return { x: px, z: pz }
    const { gx, gz } = heightfieldGapGradient(field, px, pz)
    const len = Math.hypot(gx, gz)
    if (len < 1e-6) {
      // Flat gap field (deep rock): fall back toward the entrance so a
      // capsule that starts outside the cave is not stranded.
      const dx = field.entrance.x - px
      const dz = field.entrance.z - pz
      const dl = Math.hypot(dx, dz) || 1
      px += (dx / dl) * field.cellSize
      pz += (dz / dl) * field.cellSize
      continue
    }
    // Move up-gradient (toward more clearance) by the shortfall, damped by
    // the local gradient magnitude and capped to keep the step stable.
    const step = Math.min(Math.max(deficit / len, field.cellSize * 0.25), radius + 1.5)
    px += (gx / len) * step
    pz += (gz / len) * step
  }
  return { x: px, z: pz }
}

/**
 * Walkable vertical intervals in the heightfield column at `(x, z)`, clipped
 * to the analytic surface exactly as `buildCaveSdfColumnIndex` clips SDF
 * columns (`SURFACE_CLIP_EPS`). 2.5D means at most one interval — the
 * multi-level limitation the spike must not hide.
 *
 * @domain world-terrain
 */
export function heightfieldColumnIntervals(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  z: number,
): CaveVerticalInterval[] {
  const sample = sampleHeightfieldAt(field, x, z)
  if (sample.gap <= 0) return []
  const clipped = baseSurfaceAt(x, z) - SURFACE_CLIP_EPS
  const ceilingY = Math.min(sample.ceilY, clipped)
  if (ceilingY <= sample.floorY) return []
  return [{ floorY: sample.floorY, ceilingY, openSky: sample.ceilY > clipped }]
}

/**
 * Y-aware gameplay query over the heightfield column — the spike's
 * counterpart of `queryColumnIndex`, sharing production's `pickInterval`
 * (and its `CAVE_FLOOR_GRACE`). Returns `null` outside cave space,
 * including for a surface entity standing on the hillside above a tunnel.
 *
 * @domain world-terrain
 */
export function queryHeightfieldColumn(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
): CaveGroundHit | null {
  const intervals = heightfieldColumnIntervals(field, baseSurfaceAt, x, z)
  const picked = pickInterval(intervals, y)
  if (!picked) return null
  return {
    floorY: picked.floorY,
    ceilingY: picked.ceilingY,
    openSky: Boolean(picked.openSky),
    intervals,
  }
}

/**
 * Strict void interval — no floor grace, the collision/camera occupancy
 * test. Mirrors `occupancyIntervalAt` (`CAVE_OCCUPANCY_EPS`) so the spike's
 * camera boom sees the same "is this rock?" answer production does.
 *
 * @domain world-terrain
 */
export function heightfieldOccupancyAt(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
): CaveVerticalInterval | null {
  const intervals = heightfieldColumnIntervals(field, baseSurfaceAt, x, z)
  for (const interval of intervals) {
    if (y >= interval.floorY - CAVE_OCCUPANCY_EPS && y <= interval.ceilingY) return interval
  }
  return null
}

/** Cave floor at `(x, z)` ignoring Y — the `sampleCaveFloor` half of
 *  `withCaveFloorFallback`. `null` where the column carries no cave space. */
export function heightfieldFloorAt(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  z: number,
): number | null {
  const intervals = heightfieldColumnIntervals(field, baseSurfaceAt, x, z)
  return intervals.length > 0 ? intervals[0]!.floorY : null
}

export type DebugCaveColumnQuery = (x: number, y: number, z: number) => CaveGroundHit | null

export type DebugCaveGround = {
  /** Ground the entity actually stands on. */
  height: number
  /** Rock ceiling, or `null` under open sky / outdoors. */
  ceiling: number | null
  /** Resolved cave floor, or `null` when the outdoor surface owns ground. */
  caveFloorY: number | null
}

/**
 * Per-entity ground resolver shared by both spike variants — the harness's
 * minimal stand-in for `createCaves().queryGround` + `groundAt()`. It owns
 * exactly one piece of state, the remembered cave hit that production's
 * `applyCaveGroundHysteresis` needs, and nothing else: no movement, no
 * cave-state machine, no second player controller.
 *
 * Call `resolve()` once per frame with the entity's own position — the
 * hysteresis is per-entity continuity, so probing it at arbitrary sample
 * points (slope probes, camera boom) would corrupt it. Those use
 * `withCaveFloorFallback` on the returned `caveFloorY` instead.
 *
 * @domain world-terrain
 */
export function createDebugCaveGroundResolver(
  queryColumn: DebugCaveColumnQuery,
  walkSurfaceAt: SurfaceSampler,
): { resolve: (x: number, y: number, z: number) => DebugCaveGround, reset: () => void } {
  let lastHit: CaveGroundHit | null = null
  return {
    reset: () => { lastHit = null },
    resolve: (x, y, z) => {
      const surfaceY = walkSurfaceAt(x, z)
      const raw = queryColumn(x, y, z)
      const resolved = applyCaveGroundHysteresis(raw, y, surfaceY, lastHit)
      lastHit = resolved.remember
      const hit = resolved.hit
      if (!hit) return { height: surfaceY, ceiling: null, caveFloorY: null }
      return {
        height: hit.floorY,
        ceiling: hit.openSky ? null : hit.ceilingY,
        caveFloorY: hit.floorY,
      }
    },
  }
}

export type HeightfieldVerticalState = {
  y: number
  verticalVelocity: number
  grounded: boolean
}

/**
 * One frame of gravity / ground-stick / ceiling clamp over already-resolved
 * ground. Thin wrapper over production `integrateVerticalMotion` — the
 * spike adds nothing to the motion model itself.
 *
 * @domain world-terrain
 */
export function integrateDebugVertical(
  ground: DebugCaveGround,
  state: HeightfieldVerticalState,
  dt: number,
  jumpRequested: boolean,
  playerHeight = HEIGHTFIELD_PLAYER_HEIGHT,
): HeightfieldVerticalState {
  const next = integrateVerticalMotion({
    y: state.y,
    verticalVelocity: state.verticalVelocity,
    grounded: state.grounded,
    groundY: ground.height,
    dt,
    jumpRequested,
    maxY: heightfieldRockCeilingMaxY(ground.ceiling, ground.height, playerHeight),
  })
  return { y: next.y, verticalVelocity: next.verticalVelocity, grounded: next.grounded }
}

/**
 * Axis-aligned capsule vs ceiling test used by unit tests. Returns true
 * when the capsule top would sit above rock ceiling.
 *
 * @domain world-terrain
 */
export function heightfieldCapsuleHitsCeiling(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
  height: number,
): boolean {
  const hit = queryHeightfieldColumn(field, baseSurfaceAt, x, y, z)
  if (!hit || hit.openSky) return false
  return y + height > hit.ceilingY + 1e-4
}
