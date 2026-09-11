/** `?caveHeightfieldTest` harness — the one traversal surface Walk mode
 *  talks to, built once per fixture over the production heightfield
 *  queries. Wired through the *same* production ground contract
 *  (`queryHeightfieldGround` → `applyCaveGroundHysteresis`) and the same
 *  `withCaveFloorFallback` height sampler as the game, so a Walk-mode
 *  difference is a difference in the representation, not in the debug
 *  controller.
 *
 * @domain world-terrain
 */

import type { CaveVerticalInterval } from '../../world/caves/caveGroundQuery'
import type { CaveHeightfield } from './caveHeightfieldRepresentation'
import {
  createDebugCaveGroundResolver,
  type DebugCaveGround,
  HEIGHTFIELD_MIN_STANDING_GAP,
  HEIGHTFIELD_PLAYER_RADIUS,
  heightfieldFloorAt,
  heightfieldOccupancyAt,
  queryHeightfieldColumn,
  resolveHeightfieldHorizontal,
  type SurfaceSampler,
} from './caveHeightfieldTraversal'

export type CaveWalkWorld = {
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
  /** XZ wall response at the entity's current Y — production
   *  `resolveHeightfieldHorizontal` with the player capsule. */
  resolveHorizontal: (x: number, z: number, y: number) => { x: number, z: number }
}

/**
 * Walk world over the production 2.5D representation. There are no cave
 * colliders for the camera boom either — occupancy is the whole story.
 *
 * @domain world-terrain
 */
export function createHeightfieldWalkWorld(
  field: CaveHeightfield,
  baseSurfaceAt: SurfaceSampler,
  walkSurfaceAt: SurfaceSampler,
): CaveWalkWorld {
  const ground = createDebugCaveGroundResolver(
    (x, y, z) => queryHeightfieldColumn(field, baseSurfaceAt, x, y, z),
    walkSurfaceAt,
  )
  return {
    walkSurfaceAt,
    resolveGround: ground.resolve,
    resetGround: ground.reset,
    caveFloorAt: (x, z) => heightfieldFloorAt(field, baseSurfaceAt, x, z),
    occupancyAt: (x, y, z) => heightfieldOccupancyAt(field, baseSurfaceAt, x, y, z),
    resolveHorizontal: (x, z, y) => resolveHeightfieldHorizontal(
      field,
      x,
      z,
      y,
      HEIGHTFIELD_PLAYER_RADIUS,
      HEIGHTFIELD_MIN_STANDING_GAP,
    ),
  }
}
