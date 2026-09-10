/** Experimental cave heightfield spike — traversal / collision queries
 *  derived from the same 2.5D representation as the mesh, resolved through
 *  the *production* Cave V2 ground contract. Not production cave collision
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
import { mouthAlong, mouthLateral } from '../../world/caves/mouthCarve'
import {
  type CaveHeightfieldRepresentation,
  type HeightfieldSample,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'

/** Mirrors `PlayerController`'s `PLAYER_COLLISION_RADIUS` / `PLAYER_HEIGHT`.
 *  Duplicated rather than imported so `?caveHeightfieldTest` does not pull
 *  the whole gameplay/WorldBundle module graph into the harness bundle;
 *  `caveHeightfieldTraversal.test.ts` asserts the two never drift. */
export const HEIGHTFIELD_PLAYER_RADIUS = 0.35
export const HEIGHTFIELD_PLAYER_HEIGHT = 1.8

export type SurfaceSampler = (x: number, z: number) => number

export type HeightfieldSpaceQuery = HeightfieldSample & {
  blocked: boolean
}

const SD_EPS = 1e-4

function isMouthCorridor(representation: CaveHeightfieldRepresentation, x: number, z: number, pad: number): boolean {
  const along = mouthAlong(x, z, representation.entrance)
  const lateral = mouthLateral(x, z, representation.entrance)
  return along > -0.55 && Math.abs(lateral) < representation.entrance.width * 0.55 + pad
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
 * Space query used by Walk mode and unit tests. `blocked` is true in solid
 * rock beyond the footprint, false in the doorway/approach corridor.
 *
 * @domain world-terrain
 */
export function queryHeightfieldSpace(
  representation: CaveHeightfieldRepresentation,
  x: number,
  z: number,
  radius = HEIGHTFIELD_PLAYER_RADIUS,
): HeightfieldSpaceQuery {
  const sample = sampleHeightfieldAt(representation, x, z)
  const mouth = isMouthCorridor(representation, x, z, radius)
  const blocked = sample.signedDistance > -radius + SD_EPS && !mouth
  return { ...sample, blocked }
}

function signedDistanceGradient(
  representation: CaveHeightfieldRepresentation,
  x: number,
  z: number,
): { gx: number, gz: number } {
  const e = Math.max(0.08, representation.cellSize * 0.35)
  const dx = sampleHeightfieldAt(representation, x + e, z).signedDistance
    - sampleHeightfieldAt(representation, x - e, z).signedDistance
  const dz = sampleHeightfieldAt(representation, x, z + e).signedDistance
    - sampleHeightfieldAt(representation, x, z - e).signedDistance
  return { gx: dx / (2 * e), gz: dz / (2 * e) }
}

/**
 * Pushes an XZ capsule out of heightfield rock. The doorway/approach is
 * left open so Walk mode can enter from the surface fixture.
 *
 * @domain world-terrain
 */
export function resolveHeightfieldHorizontal(
  representation: CaveHeightfieldRepresentation,
  x: number,
  z: number,
  radius = HEIGHTFIELD_PLAYER_RADIUS,
): { x: number, z: number } {
  let px = x
  let pz = z
  for (let iter = 0; iter < 24; iter++) {
    const sample = sampleHeightfieldAt(representation, px, pz)
    if (isMouthCorridor(representation, px, pz, radius) && sample.signedDistance > -radius) {
      return { x: px, z: pz }
    }
    const penetration = sample.signedDistance + radius
    if (penetration <= SD_EPS) return { x: px, z: pz }
    const { gx, gz } = signedDistanceGradient(representation, px, pz)
    const len = Math.hypot(gx, gz)
    const step = Math.min(Math.max(penetration, representation.cellSize * 0.25), 2.5)
    if (len < 1e-6) {
      px += Math.sign(representation.entrance.x - px || 0) * step
      pz += Math.sign(representation.entrance.z - pz || 0) * step
      continue
    }
    const push = step / len
    px -= gx * push
    pz -= gz * push
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
  representation: CaveHeightfieldRepresentation,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  z: number,
): CaveVerticalInterval[] {
  const sample = sampleHeightfieldAt(representation, x, z)
  if (sample.signedDistance >= 0) return []
  const surfaceY = baseSurfaceAt(x, z)
  const clipped = surfaceY - SURFACE_CLIP_EPS
  const ceilingY = Math.min(sample.ceilingY, clipped)
  if (ceilingY <= sample.floorY) return []
  const openSky = sample.openSky || sample.ceilingY > clipped
  return [{ floorY: sample.floorY, ceilingY, openSky }]
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
  representation: CaveHeightfieldRepresentation,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
): CaveGroundHit | null {
  const intervals = heightfieldColumnIntervals(representation, baseSurfaceAt, x, z)
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
  representation: CaveHeightfieldRepresentation,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
): CaveVerticalInterval | null {
  const intervals = heightfieldColumnIntervals(representation, baseSurfaceAt, x, z)
  for (const interval of intervals) {
    if (y >= interval.floorY - CAVE_OCCUPANCY_EPS && y <= interval.ceilingY) return interval
  }
  return null
}

/** Cave floor at `(x, z)` ignoring Y — the `sampleCaveFloor` half of
 *  `withCaveFloorFallback`. `null` where the column carries no cave space. */
export function heightfieldFloorAt(
  representation: CaveHeightfieldRepresentation,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  z: number,
): number | null {
  const intervals = heightfieldColumnIntervals(representation, baseSurfaceAt, x, z)
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
  representation: CaveHeightfieldRepresentation,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
  height: number,
): boolean {
  const hit = queryHeightfieldColumn(representation, baseSurfaceAt, x, y, z)
  if (!hit || hit.openSky) return false
  return y + height > hit.ceilingY + 1e-4
}
