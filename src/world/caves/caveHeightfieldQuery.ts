/** Production cave spatial queries over the heightfield (world-terrain-019):
 *  ground, strict occupancy, interior and horizontal containment — the one
 *  spatial authority for caves.
 *
 *  The rendered floor and the floor the player stands on are the same
 *  numbers: `sampleHeightfieldAt(field, x, z).floorY`. No column index, no
 *  collider beads — a 2.5D field carries at most one vertical interval per
 *  `(x, z)`, so every query is a bilinear sample plus the neutral contract
 *  from `caveGroundQuery.ts`.
 *
 *  Lateral containment is a push-out of the `gap = required clearance`
 *  contour, not of a footprint mask or a wall mesh: with a rounded
 *  cross-section the entity is stopped by the rising floor and the falling
 *  ceiling, which is what the geometry actually shows. Accepted in the
 *  `?caveHeightfieldTest` harness (world-terrain-018) and productionised
 *  unchanged; the harness now imports these helpers.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { CaveGroundHit, CaveVerticalInterval } from './caveGroundQuery'
import type {
  CaveHeightfieldRepresentation,
  HeightfieldSample,
  SurfaceSampler,
} from './caveHeightfieldRepresentation'
import { CAVE_FLOOR_GRACE, CAVE_OCCUPANCY_EPS } from './caveGroundQuery'
import { heightfieldGapGradient, sampleHeightfieldAt } from './caveHeightfieldRepresentation'
import { SURFACE_CLIP_EPS } from './caveSurface'
import { MOUTH_INTERIOR_ALONG, mouthAlong } from './mouthCarve'

/** Extra clearance above an entity's height a column must carry before the
 *  entity may stand in it. The rounded fringe below `height + margin` is
 *  geometry the entity looks at, not geometry it stands in. */
export const CAVE_STANDING_CLEARANCE_MARGIN = 0.1

/** `gap` a column needs to hold a standing entity of `entityHeight`. */
export function heightfieldStandingClearance(entityHeight: number): number {
  return entityHeight + CAVE_STANDING_CLEARANCE_MARGIN
}

/** How far below the field's cached walk surface an entity may still be a
 *  *surface* entity for horizontal containment — the mouth-exit half of the
 *  portal semantic.
 *
 *  A cave entity next to a wall stands in a closed standable column, where
 *  `ceilY < surfaceY` and `ceilY - floorY >= minGap`, so it is at least
 *  `minGap` (≈ 1.9 m for the player) below the cached surface, and both
 *  numbers come from the same field — that side needs no slack. A surface
 *  entity's Y is the terrain tile sampler (1 m tiles) one frame behind its
 *  XZ, while `surfaceY` is the 0.3 m field cache of the analytic walk
 *  surface; over the mouth pit wall the two disagree by decimetres, so
 *  `SURFACE_CLIP_EPS` (5 cm) is not a sampler-agreement bound. Below it a
 *  legitimately exiting entity read as underground rock and was pushed up
 *  the `gap` gradient back into the mouth (world-terrain-019 snap-back).
 *  Must stay below `minGap - JUMP_HEIGHT` for any jumping entity so a jump
 *  at the doorway flank cannot pass through the rim. */
export const CAVE_SURFACE_ENTITY_SLACK = 0.75

/**
 * The one walkable interval of the heightfield column at `(x, z)`, or
 * `null` where there is no cave void (`outsideGrid`, `gap <= 0`, or void
 * entirely above the analytic surface clip).
 *
 * The ceiling is clipped to `surfaceHeightAt - SURFACE_CLIP_EPS`, so a
 * surface entity standing on the hillside above a tunnel
 * (`y ≈ surfaceY > ceilingY`) is never inside the interval. `openSky` is the representation's own mouth semantic — the void
 * reaches the walk surface — and is what makes the mouth a portal instead
 * of a rock ceiling for `PlayerController`.
 *
 * Y-blind: `Caves.sampleFloor` / `sampleCeiling` read this; player ground
 * goes through `queryHeightfieldGround`, strict occupancy through
 * `heightfieldOccupancyAt` — one column definition for all of them.
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

/**
 * Strict void interval at `(x, y, z)` — the collision / camera / swim
 * occupancy test. No `CAVE_FLOOR_GRACE`, no hysteresis: `y` must sit inside
 * the column's clipped interval (`CAVE_OCCUPANCY_EPS` below the floor is
 * still floor). `null` in rock, outside the grid, for a surface entity above
 * an underground tunnel (ceiling clip) and above a closed ceiling. At the
 * mouth the interval is `openSky`.
 *
 * Stateless — safe for camera marches and torch / audio callers that must
 * not touch the player's ground hysteresis.
 *
 * @domain world-terrain
 */
export function heightfieldOccupancyAt(
  field: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  x: number,
  y: number,
  z: number,
): CaveVerticalInterval | null {
  const interval = heightfieldGroundColumn(field, surfaceHeightAt, x, z)
  if (!interval) return null
  if (y < interval.floorY - CAVE_OCCUPANCY_EPS || y > interval.ceilingY) return null
  return interval
}

/**
 * True when the sample is cave *interior* — strict occupancy on the inward
 * side of the mouth plane. The carved approach is void for walking / camera
 * look-out but it is not interior (surface ambience, rain). Stateless; the
 * per-entity two-sample confirmation is `applyCaveInteriorHysteresis`.
 *
 * @domain world-terrain
 */
export function heightfieldInteriorAt(
  field: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'>,
  x: number,
  y: number,
  z: number,
): boolean {
  if (mouthAlong(x, z, entrance) > MOUTH_INTERIOR_ALONG) return false
  return heightfieldOccupancyAt(field, surfaceHeightAt, x, y, z) !== null
}

export type HeightfieldSpaceQuery = HeightfieldSample & {
  /** A standing entity needing `minGap` cannot occupy this column. */
  blocked: boolean
}

/**
 * Y-blind space query: `blocked` is true wherever the column cannot hold a
 * standing entity of the given clearance — solid rock and the low rounded
 * fringe alike. The mouth aperture is `openSky` and never blocked.
 *
 * @domain world-terrain
 */
export function queryHeightfieldSpace(
  field: CaveHeightfieldRepresentation,
  x: number,
  z: number,
  minGap: number,
): HeightfieldSpaceQuery {
  const sample = sampleHeightfieldAt(field, x, z)
  return { ...sample, blocked: sample.gap < minGap && !sample.openSky }
}

const HORIZONTAL_RESOLVE_ITERS = 24

/**
 * Entity-neutral horizontal cave containment: pushes an XZ capsule out of
 * rock and out of the low fringe along the gradient of `gap`, until the
 * column carries at least `minGap` (`heightfieldStandingClearance(height)`).
 *
 * Identity — the cave does not interfere — when:
 * - the point is beyond the cave-local grid (`outsideGrid`);
 * - the entity is a surface entity (`y > surfaceY - CAVE_SURFACE_ENTITY_SLACK`),
 *   so someone walking the hillside above a tunnel, or stepping out of the
 *   mouth onto the terrain beyond the open-sky contour, is never dragged
 *   toward the mouth by the gap gradient (`y == null` skips this rule:
 *   Y-blind probe);
 * - the column is `openSky` (mouth / approach), which is what keeps the
 *   portal open without a special case.
 *
 * Deterministic, stateless, no teleport-back: a capsule that starts in the
 * blocked fringe walks up-gradient into standable space; only deep in flat
 * rock (no gradient) does it fall back toward the entrance so it is not
 * stranded. `radius` bounds the per-iteration step.
 *
 * @domain world-terrain
 */
export function resolveHeightfieldHorizontal(
  field: CaveHeightfieldRepresentation,
  x: number,
  z: number,
  y: number | null,
  radius: number,
  minGap: number,
): { x: number, z: number } {
  let px = x
  let pz = z
  for (let iter = 0; iter < HORIZONTAL_RESOLVE_ITERS; iter++) {
    const sample = sampleHeightfieldAt(field, px, pz)
    if (sample.outsideGrid) return { x: px, z: pz }
    if (y != null && y > sample.surfaceY - CAVE_SURFACE_ENTITY_SLACK) return { x: px, z: pz }
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
