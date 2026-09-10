/** Plan world-terrain-008 Milestone B2 — derived gameplay spatial queries
 *  over a production `CaveSdfSpatialRepresentation`.
 *
 *  The SDF field is the source of truth for cave space; this module is a
 *  cave-local, deterministic occupancy index so `PlayerController.groundAt`
 *  does not raymarch primitives per frame. Mesh/BVH are never authority.
 *  `CaveVolume` is not consulted.
 *
 *  Per column: sorted disjoint `{ floorY, ceilingY }[]` (multi-level-safe).
 *  Intervals are clipped to the analytic surface and unioned with the
 *  mouth/approach carve portal (`mouthCarve.ts`).
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { CaveSdfSpatialRepresentation } from './caveSdfField'
import type { CaveTopology } from './caveTopology'
import { openingDirection } from '../largeCaves'
import { DEFAULT_SDF_PARAMS } from './caveSdfField'
import {
  CAVE_APPROACH_OFFSET,
  CAVE_APPROACH_RADIUS,
  CAVE_MOUTH_RADIUS,
  MOUTH_INTERIOR_ALONG,
  mouthAlong,
  mouthCarveDepth,
} from './mouthCarve'

export type CaveVerticalInterval = {
  floorY: number
  ceilingY: number
  /** True when `ceilingY` is the heightfield clip, not rock overburden.
   *  PlayerController must not use it as `maxY` — the pit is open to the sky. */
  openSky?: boolean
}

export type CaveGroundHit = {
  floorY: number
  ceilingY: number
  openSky?: boolean
  /** All walkable intervals at this X/Z, lowest-first. L1 usually has one. */
  intervals: readonly CaveVerticalInterval[]
}

export type CaveSdfColumnIndex = {
  originX: number
  originZ: number
  step: number
  nx: number
  nz: number
  minY: number
  maxY: number
  /** Row-major `iz * nx + ix`. Empty array = no cave space in this column. */
  columns: readonly (readonly CaveVerticalInterval[])[]
}

/** Same order as `DEFAULT_SDF_PARAMS.cellSize` — recon's starting step. */
export const CAVE_COLUMN_STEP = DEFAULT_SDF_PARAMS.cellSize

/** How far below a reported floor an entity still belongs to that interval.
 *  Matches `caveVolume.ts`'s `FLOOR_GRACE` scale so a step/jump does not
 *  drop the player out; the ceiling bound is what separates cave from the
 *  hillside above it. Collision and camera occupancy must not use this. */
export const CAVE_FLOOR_GRACE = 2

/** Closed-interval slack for strict occupancy (collision / camera). Far
 *  smaller than `CAVE_FLOOR_GRACE` — that grace is ground continuity, not
 *  a solid test. A few centimetres covers column-floor sampling vs feet-on
 *  floor; do not add this to the clipped ceiling: `SURFACE_CLIP_EPS`
 *  already keeps a surface entity out. */
export const CAVE_OCCUPANCY_EPS = 0.05

/** Reject a void thinner than this — iso-boundary noise, not a route. */
const MIN_INTERVAL_HEIGHT = 0.45

/** Clip gameplay ceilings this far below the analytic surface so a surface
 *  entity at `y ≈ sampleBaseHeight` is not contained. Exported so a debug
 *  representation (world-terrain-018 spike) clips its columns to the surface
 *  with the same slack instead of guessing one. */
export const SURFACE_CLIP_EPS = 0.05

/** Minimum carve depth that still counts as mouth-portal space. */
const MIN_PORTAL_DEPTH = 0.05

/** `sampleHeight - playerY` above this is an underground miss, not a
 *  legitimate cave→surface exit (mouth exit has the two heights meeting). */
export const CAVE_UNDERGROUND_MISS = 1.5

const Y_SCAN_STEP = CAVE_COLUMN_STEP
const ZERO_CROSSING_ITERS = 8

export type SurfaceHeightSampler = (x: number, z: number) => number

function snapDown(value: number, step: number): number {
  return Math.floor(value / step) * step
}

function refineZeroCrossing(
  sampleY: (y: number) => number,
  yLo: number,
  yHi: number,
  negativeAtHi: boolean,
): number {
  let lo = yLo
  let hi = yHi
  for (let i = 0; i < ZERO_CROSSING_ITERS; i++) {
    const mid = (lo + hi) * 0.5
    if ((sampleY(mid) < 0) === negativeAtHi) hi = mid
    else lo = mid
  }
  return (lo + hi) * 0.5
}

function scanSdfIntervals(
  sample: (x: number, y: number, z: number) => number,
  x: number,
  z: number,
  minY: number,
  maxY: number,
  surfaceY: number,
): CaveVerticalInterval[] {
  const top = Math.min(maxY, surfaceY - SURFACE_CLIP_EPS)
  if (top <= minY) return []
  const sampleY = (y: number): number => sample(x, y, z)
  const out: CaveVerticalInterval[] = []
  let inside = sampleY(minY) < 0
  let runStart = minY
  let prevY = minY
  for (let y = minY + Y_SCAN_STEP; y <= top + 1e-9; y += Y_SCAN_STEP) {
    const yClamped = Math.min(y, top)
    const voidHere = sampleY(yClamped) < 0
    if (voidHere && !inside) {
      inside = true
      runStart = refineZeroCrossing(sampleY, prevY, yClamped, true)
    } else if (!voidHere && inside) {
      inside = false
      const floorY = runStart
      const ceilingY = refineZeroCrossing(sampleY, prevY, yClamped, false)
      if (ceilingY - floorY >= MIN_INTERVAL_HEIGHT) {
        out.push({ floorY, ceilingY })
      }
    }
    prevY = yClamped
    if (yClamped >= top) break
  }
  if (inside) {
    const floorY = runStart
    const ceilingY = top
    if (ceilingY - floorY >= MIN_INTERVAL_HEIGHT) {
      // Heightfield clip is a roof bound, not an open-sky portal. Tagging
      // these intervals `openSky` made the 12 m camera boom treat interior
      // overburden as a mouth exit (~5 m into Grota Czarnego Kamienia).
      out.push({ floorY, ceilingY })
    }
  }
  return out
}

function portalInterval(x: number, z: number, entrance: CaveEntrance, surfaceY: number): CaveVerticalInterval | null {
  const depth = mouthCarveDepth(x, z, entrance)
  if (depth < MIN_PORTAL_DEPTH) return null
  const floorY = surfaceY - depth
  const ceilingY = surfaceY - SURFACE_CLIP_EPS
  if (ceilingY - floorY < MIN_INTERVAL_HEIGHT) return null
  return { floorY, ceilingY, openSky: true }
}

function expandBoundsForMouth(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  entrance: CaveEntrance,
  pad: number,
): { minX: number, maxX: number, minZ: number, maxZ: number } {
  const out = openingDirection(entrance.yaw)
  const ax = entrance.x + out.dx * CAVE_APPROACH_OFFSET
  const az = entrance.z + out.dz * CAVE_APPROACH_OFFSET
  return {
    minX: Math.min(minX, entrance.x - CAVE_MOUTH_RADIUS, ax - CAVE_APPROACH_RADIUS) - pad,
    maxX: Math.max(maxX, entrance.x + CAVE_MOUTH_RADIUS, ax + CAVE_APPROACH_RADIUS) + pad,
    minZ: Math.min(minZ, entrance.z - CAVE_MOUTH_RADIUS, az - CAVE_APPROACH_RADIUS) - pad,
    maxZ: Math.max(maxZ, entrance.z + CAVE_MOUTH_RADIUS, az + CAVE_APPROACH_RADIUS) + pad,
  }
}

function combinePortalAndSdf(
  sdf: readonly CaveVerticalInterval[],
  portal: CaveVerticalInterval | null,
): CaveVerticalInterval[] {
  // SDF void is the interior. The portal is only the open-sky carved recess
  // where the closed ellipsoid is *not* indexed (outward of the mouth plane).
  // Unioning them stacked a fake mid-ceiling shorter than the player and
  // clamped them through the floor (seed 1136726869, along ≈ −0.4).
  if (sdf.length > 0) {
    return sdf.map((interval) => ({
      floorY: interval.floorY,
      ceilingY: interval.ceilingY,
      ...(interval.openSky ? { openSky: true } : {}),
    }))
  }
  if (!portal) return []
  return [{ floorY: portal.floorY, ceilingY: portal.ceilingY, openSky: true }]
}

function intervalsForColumn(
  representation: CaveSdfSpatialRepresentation,
  entrance: CaveEntrance,
  surfaceHeightAt: SurfaceHeightSampler,
  x: number,
  z: number,
  minY: number,
  maxY: number,
): CaveVerticalInterval[] {
  const surfaceY = surfaceHeightAt(x, z)
  // Closed entrance ellipsoids occupy the approach pit. That void is not
  // cave interior — only the carved portal is, and its floor is the recess,
  // not the ellipsoid's bottom.
  const sdf = mouthAlong(x, z, entrance) > MOUTH_INTERIOR_ALONG
    ? []
    : scanSdfIntervals(representation.sample, x, z, minY, maxY, surfaceY)
  const portal = portalInterval(x, z, entrance, surfaceY)
  return combinePortalAndSdf(sdf, portal)
}

/**
 * Builds a cave-local column index from an SDF representation. Deterministic:
 * same representation + topology + surface sampler + step → identical columns.
 * Origin is snapped to a fixed world multiple of `step`, not `bounds.min`.
 *
 * @domain world-terrain
 */
export function buildCaveSdfColumnIndex(
  representation: CaveSdfSpatialRepresentation,
  topology: CaveTopology,
  surfaceHeightAt: SurfaceHeightSampler,
  step: number = CAVE_COLUMN_STEP,
): CaveSdfColumnIndex {
  const pad = step
  const xz = expandBoundsForMouth(
    representation.bounds.minX,
    representation.bounds.maxX,
    representation.bounds.minZ,
    representation.bounds.maxZ,
    topology.entrance,
    pad,
  )
  const originX = snapDown(xz.minX, step)
  const originZ = snapDown(xz.minZ, step)
  const nx = Math.max(1, Math.floor((xz.maxX - originX) / step) + 1)
  const nz = Math.max(1, Math.floor((xz.maxZ - originZ) / step) + 1)
  const minY = representation.bounds.minY
  const maxY = representation.bounds.maxY
  const columns: CaveVerticalInterval[][] = new Array(nx * nz)
  for (let iz = 0; iz < nz; iz++) {
    const z = originZ + iz * step
    for (let ix = 0; ix < nx; ix++) {
      const x = originX + ix * step
      columns[iz * nx + ix] = intervalsForColumn(
        representation,
        topology.entrance,
        surfaceHeightAt,
        x,
        z,
        minY,
        maxY,
      )
    }
  }
  return { originX, originZ, step, nx, nz, minY, maxY, columns }
}

export function columnIntervalsAt(
  index: CaveSdfColumnIndex,
  x: number,
  z: number,
): readonly CaveVerticalInterval[] {
  const ix = Math.round((x - index.originX) / index.step)
  const iz = Math.round((z - index.originZ) / index.step)
  if (ix < 0 || iz < 0 || ix >= index.nx || iz >= index.nz) return []
  return index.columns[iz * index.nx + ix] ?? []
}

/**
 * Picks the vertical interval that contains `y`. Never `Math.min` across
 * stacked intervals — that is the multi-level blocker this contract replaces.
 *
 * @domain world-terrain
 */
export function pickInterval(
  intervals: readonly CaveVerticalInterval[],
  y: number,
): CaveVerticalInterval | null {
  if (intervals.length === 0) return null
  const containing: CaveVerticalInterval[] = []
  for (const interval of intervals) {
    if (y >= interval.floorY - CAVE_FLOOR_GRACE && y <= interval.ceilingY) containing.push(interval)
  }
  if (containing.length === 1) return containing[0]!
  if (containing.length > 1) {
    const strict = containing.filter((interval) => y >= interval.floorY && y <= interval.ceilingY)
    if (strict.length === 1) return strict[0]!
    let best = containing[0]!
    let bestDist = Math.abs(best.floorY - y)
    for (let i = 1; i < containing.length; i++) {
      const interval = containing[i]!
      const dist = Math.abs(interval.floorY - y)
      if (dist < bestDist) {
        best = interval
        bestDist = dist
      }
    }
    return best
  }
  return null
}

/**
 * Y-aware gameplay query against a derived column index. Returns `null`
 * outside cave space (including a surface entity above a tunnel).
 *
 * @domain world-terrain
 */
export function queryColumnIndex(
  index: CaveSdfColumnIndex,
  x: number,
  y: number,
  z: number,
): CaveGroundHit | null {
  const intervals = columnIntervalsAt(index, x, z)
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
 * Strict void interval at `(x, y, z)` — `y` must sit inside some column
 * interval. No `CAVE_FLOOR_GRACE`. Empty column, y above the clipped
 * ceiling, or y below the floor is solid (returns `null`).
 *
 * Shared by body-collision derivation and camera boom occupancy. Do not
 * reuse `queryColumnIndex` / `queryGround` as a wall test.
 *
 * @domain world-terrain
 */
export function occupancyIntervalAt(
  index: CaveSdfColumnIndex,
  x: number,
  y: number,
  z: number,
): CaveVerticalInterval | null {
  const intervals = columnIntervalsAt(index, x, z)
  const containing: CaveVerticalInterval[] = []
  for (const interval of intervals) {
    if (y >= interval.floorY - CAVE_OCCUPANCY_EPS && y <= interval.ceilingY) {
      containing.push(interval)
    }
  }
  if (containing.length === 0) return null
  if (containing.length === 1) return containing[0]!
  let best = containing[0]!
  let bestDist = Math.abs((best.floorY + best.ceilingY) * 0.5 - y)
  for (let i = 1; i < containing.length; i++) {
    const interval = containing[i]!
    const dist = Math.abs((interval.floorY + interval.ceilingY) * 0.5 - y)
    if (dist < bestDist) {
      best = interval
      bestDist = dist
    }
  }
  return best
}

/** `true` when `(x, y, z)` is cave void under strict occupancy. */
export function occupancyContains(
  index: CaveSdfColumnIndex,
  x: number,
  y: number,
  z: number,
): boolean {
  return occupancyIntervalAt(index, x, y, z) !== null
}

/**
 * True when the sample is cave *interior* — occupancy on the inward side of
 * the mouth plane. The carved approach is void for walking/camera look-out,
 * but it is not interior (surface player, surface ambience).
 *
 * @domain world-terrain
 */
export function isCaveInteriorAt(
  index: CaveSdfColumnIndex,
  entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'>,
  x: number,
  y: number,
  z: number,
): boolean {
  if (mouthAlong(x, z, entrance) > MOUTH_INTERIOR_ALONG) return false
  return occupancyContains(index, x, y, z)
}

export type CaveInteriorHysteresis = {
  interior: boolean
  rememberRaw: boolean
}

/**
 * Two-sample confirmation so a single mouth-boundary occupancy flicker does
 * not flip cave-interior state (ambience / diagnostics).
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

export type CaveGroundHysteresis = {
  hit: CaveGroundHit | null
  remember: CaveGroundHit | null
}

/**
 * Continuity policy for a single-frame query miss. An underground miss
 * (`surfaceY - y` clearly larger than a mouth-exit) keeps the last cave
 * interval so `groundAt` does not fall through to `sampleHeight` and
 * teleport the player up. A surface entity (`surfaceY ≈ y`) is never
 * assigned to a cave below them.
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

/** Lowest interval floor at `(x, z)`, ignoring Y. Transitional / debug only
 *  — player ground must use `queryColumnIndex` / `queryGround`. */
export function lowestFloorAt(index: CaveSdfColumnIndex, x: number, z: number): number | null {
  const intervals = columnIntervalsAt(index, x, z)
  if (intervals.length === 0) return null
  return intervals[0]!.floorY
}

export function lowestCeilingAt(index: CaveSdfColumnIndex, x: number, z: number): number | null {
  const intervals = columnIntervalsAt(index, x, z)
  if (intervals.length === 0) return null
  return intervals[0]!.ceilingY
}
