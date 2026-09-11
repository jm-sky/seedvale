/** Production cave ground over the heightfield (world-terrain-019, early
 *  gameplay migration after Milestone B).
 *
 *  The rendered floor and the floor the player stands on are the same
 *  numbers: `sampleHeightfieldAt(field, x, z).floorY`. No column index — a
 *  2.5D field carries at most one vertical interval per `(x, z)`, so the
 *  query is a single bilinear sample plus the neutral ground contract from
 *  `caveGroundQuery.ts`.
 *
 *  Strict occupancy / interior / wall colliders / camera are *not* here;
 *  they stay on the SDF column index until Milestone D.
 *
 * @domain world-terrain
 */

import type { CaveGroundHit, CaveVerticalInterval } from './caveGroundQuery'
import type { CaveHeightfieldRepresentation, SurfaceSampler } from './caveHeightfieldRepresentation'
import { CAVE_FLOOR_GRACE } from './caveGroundQuery'
import { sampleHeightfieldAt } from './caveHeightfieldRepresentation'
import { SURFACE_CLIP_EPS } from './caveSurface'

/**
 * The one walkable interval of the heightfield column at `(x, z)`, or
 * `null` where there is no cave void (`outsideGrid`, `gap <= 0`, or void
 * entirely above the analytic surface clip).
 *
 * The ceiling is clipped to `surfaceHeightAt - SURFACE_CLIP_EPS` exactly
 * like the SDF column index was, so a surface entity standing on the
 * hillside above a tunnel (`y ≈ surfaceY > ceilingY`) is never inside the
 * interval. `openSky` is the representation's own mouth semantic — the void
 * reaches the walk surface — and is what makes the mouth a portal instead
 * of a rock ceiling for `PlayerController`.
 *
 * Y-blind: `Caves.sampleFloor` / `sampleCeiling` read this; player ground
 * goes through `queryHeightfieldGround`.
 *
 * @domain world-terrain
 */
export function heightfieldGroundColumn(
  field: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  x: number,
  z: number,
): CaveVerticalInterval | null {
  const sample = sampleHeightfieldAt(field, x, z)
  if (sample.outsideGrid || sample.gap <= 0) return null
  const ceilingY = Math.min(sample.ceilY, surfaceHeightAt(x, z) - SURFACE_CLIP_EPS)
  if (ceilingY <= sample.floorY) return null
  return sample.openSky
    ? { floorY: sample.floorY, ceilingY, openSky: true }
    : { floorY: sample.floorY, ceilingY }
}

/**
 * Y-aware production ground query — the heightfield counterpart of the
 * former `queryColumnIndex`. `null` outside cave space, including for a
 * surface entity above an underground tunnel and for one above a closed
 * ceiling. `y` may sit up to `CAVE_FLOOR_GRACE` below the floor (step /
 * jump continuity); it may never sit above the interval's ceiling.
 *
 * Stateless — per-entity continuity is `applyCaveGroundHysteresis` in the
 * caller (`createCaves().queryGround`).
 *
 * @domain world-terrain
 */
export function queryHeightfieldGround(
  field: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
): CaveGroundHit | null {
  const interval = heightfieldGroundColumn(field, surfaceHeightAt, x, z)
  if (!interval) return null
  if (y < interval.floorY - CAVE_FLOOR_GRACE || y > interval.ceilingY) return null
  return {
    floorY: interval.floorY,
    ceilingY: interval.ceilingY,
    openSky: Boolean(interval.openSky),
    intervals: [interval],
  }
}
