/** Plan world-terrain-008 B2 — the mouth/approach heightmap recess that
 *  `createCaves.ts` carves with `modifyTerrain`. Gameplay spatial queries
 *  must use the same discs/depths as the terrain carve, otherwise the
 *  entrance portal and the visible pit disagree (B2 recon: Grota Mroczna).
 *
 *  Depth falloff matches `applyModificationToTile` (`smoothstep` from centre
 *  to radius). Overlapping pits add, same as sequential digs.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import { CAVE_MOUTH_DEPTH } from '../caveGenerator'
import { openingDirection } from '../largeCaves'

export { CAVE_MOUTH_DEPTH }

export const CAVE_APPROACH_RADIUS = 3.2
export const CAVE_APPROACH_DEPTH = 1.35
/** Centre of the approach pit, along `openingDirection`, from the entrance. */
export const CAVE_APPROACH_OFFSET = 2.2
export const CAVE_MOUTH_RADIUS = 1.65

/** Same Hermite smoothstep `THREE.MathUtils.smoothstep` uses, so the
 *  gameplay portal depth matches the heightmap dig without importing Three. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function pitDepth(x: number, z: number, cx: number, cz: number, radius: number, depth: number): number {
  const dist = Math.hypot(x - cx, z - cz)
  if (dist >= radius) return 0
  return depth * (1 - smoothstep(0, radius, dist))
}

function approachPitCenter(entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'>): { x: number, z: number } {
  const out = openingDirection(entrance.yaw)
  return {
    x: entrance.x + out.dx * CAVE_APPROACH_OFFSET,
    z: entrance.z + out.dz * CAVE_APPROACH_OFFSET,
  }
}

/**
 * Combined mouth+approach carve depth at `(x, z)` — the amount
 * `createCaves` subtracts from the analytic surface. Zero outside both discs.
 *
 * @domain world-terrain
 */
export function mouthCarveDepth(x: number, z: number, entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'>): number {
  const approach = approachPitCenter(entrance)
  return (
    pitDepth(x, z, entrance.x, entrance.z, CAVE_MOUTH_RADIUS, CAVE_MOUTH_DEPTH)
    + pitDepth(x, z, approach.x, approach.z, CAVE_APPROACH_RADIUS, CAVE_APPROACH_DEPTH)
  )
}
