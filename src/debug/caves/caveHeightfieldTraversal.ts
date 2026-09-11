/** `?caveHeightfieldTest` harness — traversal over the production cave
 *  heightfield spatial queries. Not a second implementation: ground,
 *  strict occupancy, space and horizontal containment are the production
 *  helpers in `src/world/caves/caveHeightfieldQuery.ts` (world-terrain-019
 *  productionised them from this spike); what stays here is only the
 *  harness's minimal per-entity glue — a stand-in for
 *  `createCaves().queryGround` + `PlayerController.groundAt` /
 *  `updateVerticalMotion` — so Walk mode and the unit tests exercise the
 *  same containment rules the game does.
 *
 *  ```text
 *  heightfieldGroundColumn (surface-clipped)   ← production
 *      ↓ queryHeightfieldGround(y)              ← production, Y-disambiguated
 *  applyCaveGroundHysteresis(...)               ← production, underground-miss guard
 *      ↓
 *  floorY / ceilingY  |  outdoor surface
 *  ```
 *
 * @domain world-terrain
 */

import type { CaveHeightfield, SurfaceSampler } from './caveHeightfieldRepresentation'
import { PLAYER_COLLISION_RADIUS, PLAYER_HEIGHT, rockCeilingMaxY } from '../../player/playerDimensions'
import { integrateVerticalMotion } from '../../player/verticalMotion'
import { applyCaveGroundHysteresis, type CaveGroundHit } from '../../world/caves/caveGroundQuery'
import {
  heightfieldGroundColumn,
  heightfieldStandingClearance,
  queryHeightfieldGround,
} from '../../world/caves/caveHeightfieldQuery'

export {
  heightfieldOccupancyAt,
  queryHeightfieldSpace,
  resolveHeightfieldHorizontal,
} from '../../world/caves/caveHeightfieldQuery'
export type { SurfaceSampler }

/** Production player dimensions — the harness walks the same capsule. */
export const HEIGHTFIELD_PLAYER_RADIUS = PLAYER_COLLISION_RADIUS
export const HEIGHTFIELD_PLAYER_HEIGHT = PLAYER_HEIGHT

/** Clearance the player capsule needs to occupy a column
 *  (`heightfieldStandingClearance(PLAYER_HEIGHT)`). */
export const HEIGHTFIELD_MIN_STANDING_GAP = heightfieldStandingClearance(PLAYER_HEIGHT)

/** Cave floor at `(x, z)` ignoring Y — the `sampleCaveFloor` half of
 *  `withCaveFloorFallback`. `null` where the column carries no cave space. */
export function heightfieldFloorAt(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  z: number,
): number | null {
  return heightfieldGroundColumn(field, baseSurfaceAt, x, z)?.floorY ?? null
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
 * Per-entity ground resolver — the harness's minimal stand-in for
 * `createCaves().queryGround` + `groundAt()`. It owns exactly one piece of
 * state, the remembered cave hit that production's
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

/** Y-aware ground query bound to the production helper — kept as a named
 *  harness entry so `createHeightfieldWalkWorld` reads like the game's
 *  `Caves.queryGround`. */
export function queryHeightfieldColumn(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
): CaveGroundHit | null {
  return queryHeightfieldGround(field, baseSurfaceAt, x, y, z)
}

export type HeightfieldVerticalState = {
  y: number
  verticalVelocity: number
  grounded: boolean
}

/**
 * One frame of gravity / ground-stick / ceiling clamp over already-resolved
 * ground. Thin wrapper over production `integrateVerticalMotion` +
 * `rockCeilingMaxY` — the harness adds nothing to the motion model itself.
 *
 * @domain world-terrain
 */
export function integrateDebugVertical(
  ground: DebugCaveGround,
  state: HeightfieldVerticalState,
  dt: number,
  jumpRequested: boolean,
): HeightfieldVerticalState {
  const next = integrateVerticalMotion({
    y: state.y,
    verticalVelocity: state.verticalVelocity,
    grounded: state.grounded,
    groundY: ground.height,
    dt,
    jumpRequested,
    maxY: rockCeilingMaxY(ground.ceiling, ground.height),
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
