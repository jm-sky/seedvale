/** Experimental cave heightfield spike — the one traversal surface Walk mode
 *  talks to, built once per variant (heightfield or production SDF).
 *
 *  Both variants are wired through the *same* production ground contract
 *  (`pickInterval` → `applyCaveGroundHysteresis`) and the same
 *  `withCaveFloorFallback` height sampler, so a Walk-mode difference between
 *  them is a difference in the representation, not in the debug controller.
 *
 * @domain world-terrain
 */

import type { CaveVerticalInterval } from '../../world/caves/caveSdfQuery'
import type { CaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import {
  type CaveSdfColumnIndex,
  lowestFloorAt,
  occupancyIntervalAt,
  queryColumnIndex,
} from '../../world/caves/caveSdfQuery'
import { type Collider, colliderActiveAtY, resolvePosition } from '../../world/collision'
import {
  createDebugCaveGroundResolver,
  type DebugCaveGround,
  HEIGHTFIELD_PLAYER_RADIUS,
  heightfieldFloorAt,
  heightfieldOccupancyAt,
  queryHeightfieldColumn,
  resolveHeightfieldHorizontal,
  type SurfaceSampler,
} from './caveHeightfieldTraversal'

export type CaveWalkWorld = {
  variant: 'heightfield' | 'sdf'
  /** Walkable/rendered outdoor surface (analytic base minus mouth recess). */
  walkSurfaceAt: SurfaceSampler
  /** Per-entity, per-frame cave-aware ground. Stateful by design — see
   *  `createDebugCaveGroundResolver`. */
  resolveGround: (x: number, y: number, z: number) => DebugCaveGround
  resetGround: () => void
  /** Cave floor at `(x, z)` ignoring Y — `withCaveFloorFallback` input. */
  caveFloorAt: (x: number, z: number) => number | null
  /** Strict void occupancy for `resolveCameraBoom`. */
  occupancyAt: (x: number, y: number, z: number) => CaveVerticalInterval | null
  /** XZ wall response at the entity's current Y. */
  resolveHorizontal: (x: number, z: number, y: number) => { x: number, z: number }
  /** Colliders the camera boom may treat as occluders (SDF variant only). */
  boomCollidersAt: (y: number) => readonly Collider[]
}

/**
 * Walk world over the experimental 2.5D representation.
 *
 * @domain world-terrain
 */
export function createHeightfieldWalkWorld(
  representation: CaveHeightfieldRepresentation,
  baseSurfaceAt: SurfaceSampler,
  walkSurfaceAt: SurfaceSampler,
): CaveWalkWorld {
  const ground = createDebugCaveGroundResolver(
    (x, y, z) => queryHeightfieldColumn(representation, baseSurfaceAt, x, y, z),
    walkSurfaceAt,
  )
  return {
    variant: 'heightfield',
    walkSurfaceAt,
    resolveGround: ground.resolve,
    resetGround: ground.reset,
    caveFloorAt: (x, z) => heightfieldFloorAt(representation, baseSurfaceAt, x, z),
    occupancyAt: (x, y, z) => heightfieldOccupancyAt(representation, baseSurfaceAt, x, y, z),
    resolveHorizontal: (x, z) => resolveHeightfieldHorizontal(representation, x, z, HEIGHTFIELD_PLAYER_RADIUS),
    boomCollidersAt: () => [],
  }
}

/**
 * Walk world over the production SDF column index / colliders — the spike's
 * quality and traversal baseline.
 *
 * @domain world-terrain
 */
export function createSdfWalkWorld(
  index: CaveSdfColumnIndex,
  colliders: readonly Collider[],
  walkSurfaceAt: SurfaceSampler,
): CaveWalkWorld {
  const ground = createDebugCaveGroundResolver(
    (x, y, z) => queryColumnIndex(index, x, y, z),
    walkSurfaceAt,
  )
  return {
    variant: 'sdf',
    walkSurfaceAt,
    resolveGround: ground.resolve,
    resetGround: ground.reset,
    caveFloorAt: (x, z) => lowestFloorAt(index, x, z),
    occupancyAt: (x, y, z) => occupancyIntervalAt(index, x, y, z),
    resolveHorizontal: (x, z, y) => resolvePosition(
      x,
      z,
      HEIGHTFIELD_PLAYER_RADIUS,
      colliders.filter((c) => colliderActiveAtY(c, y)),
    ),
    boomCollidersAt: (y) => colliders.filter((c) => colliderActiveAtY(c, y)),
  }
}
