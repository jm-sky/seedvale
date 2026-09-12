/** Plan world-terrain-020 Stage A — terrain-aware route primitives shared by
 *  every production cave recipe (`natural` in `productionTopology.ts`,
 *  `adventure` in `adventureTopology.ts`, `dungeon` in `dungeonTopology.ts`).
 *
 *  Mechanical extraction out of `productionTopology.ts`: the natural recipe's
 *  call sequence, parameters and float arithmetic are unchanged — the only
 *  new degree of freedom is `RouteContext.descentPerMeter`, which the natural
 *  recipe pins to the value it always used (`NATURAL_DESCENT_PER_METER`).
 *  A second recipe must reuse these helpers rather than growing a parallel
 *  route builder: overburden adaptation, the traversable-grade cap, the total
 *  drop limit and the disconnected-passage clearance rule all live here.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopologyFeature, CaveTopologyPoint } from './caveTopology'
import type { SurfaceHeightSampler } from './clipBelowSurface'
import { SLOPE_MAX_WALKABLE_DEG } from '../../terrain/slopeConstraint'
import { mouthOverburdenRequirement } from './mouthOverburden'
import { minSurfaceOverFootprint } from './terrainFootprint'
import { PROXY_MARGIN } from './topologyAdapter'

/** Baseline floor descent even where terrain is generous — keeps caves
 *  reading as a route going *into* the hill rather than a flat corridor.
 *  Actual descent is topology-aware on top of this (see `walkSegment`).
 *  This is the rate the natural recipe has always used; a longer recipe may
 *  pick a gentler one so `MAX_TOTAL_DROP` still bounds the whole route. */
export const NATURAL_DESCENT_PER_METER = 0.12

/**
 * Max |Δfloor|/Δxz between consecutive topology stations. 40° — below
 * `SLOPE_MAX_WALKABLE_DEG` (55°) so the representation's rim blend / detail
 * noise still leaves a ramp the player can walk both ways without a
 * climb-stat buff.
 */
const TRAVERSABLE_FLOOR_ANGLE_DEG = Math.min(40, SLOPE_MAX_WALKABLE_DEG - 10)
export const MAX_TRAVERSABLE_FLOOR_GRADE = Math.tan((TRAVERSABLE_FLOOR_ANGLE_DEG * Math.PI) / 180)
/** Centerline sample spacing for descent ramps (metres of XZ). */
export const FLOOR_RAMP_STATION_SPACING = 1.5
/** Slack on top of the required overburden, covering the gap between the
 *  station spacing below and an arbitrarily dense check of the same
 *  envelope (same role as `spikeTestCave.ts`'s `OVERBURDEN_SAFETY`, slightly
 *  larger since production stations are coarser). */
const STATION_SAFETY = 0.35
/** Total floor drop (metres) below the mouth beyond which the route is
 *  rejected outright rather than forced arbitrarily deep under the hill. */
export const MAX_TOTAL_DROP = 12
/** Extra drop cap applied to a chamber feature (shelf/overhang) alone —
 *  never worth rejecting a whole cave over a decorative appendage. */
const MAX_FEATURE_DROP = 3

/** Minimum surface-to-surface gap (metres) two logically disconnected
 *  passages must keep outside their shared junction's own footprint — must
 *  clear the representation's rim / smooth-union reach (heightfield
 *  `SMOOTH_K` 0.7 m + rim band) by a safe margin so a smooth union can never
 *  accidentally bridge them (plan world-terrain-008 §9's "accidental
 *  unions"). */
export const MIN_DISCONNECTED_CLEARANCE = 1.5

/** What every production recipe needs to build and accept a topology. */
export type CaveRecipeInput = {
  seed: number
  site: LargeCaveSite
  /** Chunk-tile height, matching the deterministic mouth recess
   *  `createCaves.ts` carves (`chunkManager.sampleHeight`) — the entrance
   *  floor must sit exactly where the visible carve puts it. */
  sampleHeight: SurfaceHeightSampler
  /** Deterministic analytic surface (`chunkManager.sampleBaseHeight`), used
   *  for every interior overburden check so topology never depends on which
   *  chunks happen to be resident (mesh/topology build on streaming
   *  activation, not at world build). */
  sampleBaseHeight: SurfaceHeightSampler
}

/** Everything a route walk needs that does not change between segments. */
export type RouteContext = {
  mouthFloorY: number
  entrance: CaveEntrance
  /** Deterministic analytic surface — never the chunk tile sampler. */
  sampleBaseHeight: SurfaceHeightSampler
  /** Baseline descent per metre travelled (see `NATURAL_DESCENT_PER_METER`). */
  descentPerMeter: number
}

export type Cursor = { x: number, y: number, z: number, rejected: boolean }

export type RadialStation = { x: number, z: number, radius: number }

export type WalkWobble = { perpDx: number, perpDz: number, random: () => number, amplitude: number }

type InteriorPoint = { xz: { x: number, z: number }, t: number }

export function rotateXZ(dx: number, dz: number, angle: number): { dx: number, dz: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { dx: dx * cos - dz * sin, dz: dx * sin + dz * cos }
}

export function pick(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

function unconstrainedFloorY(
  ctx: RouteContext,
  cursorY: number,
  x: number,
  z: number,
  width: number,
  height: number,
  stepDist: number,
): { y: number, rejected: boolean } {
  let y = cursorY - ctx.descentPerMeter * stepDist
  const distanceFromMouth = Math.hypot(x - ctx.entrance.x, z - ctx.entrance.z)
  const required = mouthOverburdenRequirement(ctx.entrance, distanceFromMouth, PROXY_MARGIN)
  if (required !== null) {
    const radius = width / 2 + PROXY_MARGIN
    const allowedCeiling = minSurfaceOverFootprint(ctx.sampleBaseHeight, x, z, radius) - required - STATION_SAFETY
    y = Math.min(y, allowedCeiling - height)
  }
  return { y, rejected: ctx.mouthFloorY - y > MAX_TOTAL_DROP }
}

/** Extra XZ so a fat dest lobe (chamber/widening) cannot swallow the ramp.
 *  Passage-to-passage width changes stay on their planned length. */
function extraRunForWidening(fromWidth: number, toWidth: number): number {
  if (toWidth - fromWidth < 1.5) return 0
  return toWidth * 0.45
}

function planDestination(
  ctx: RouteContext,
  cursor: Cursor,
  toXZ: { x: number, z: number },
  fromWidth: number,
  toWidth: number,
  toHeight: number,
): { x: number, z: number } {
  let dest = toXZ
  const extra = extraRunForWidening(fromWidth, toWidth)
  for (let i = 0; i < 4; i++) {
    const dist = Math.hypot(dest.x - cursor.x, dest.z - cursor.z)
    const preview = unconstrainedFloorY(ctx, cursor.y, dest.x, dest.z, toWidth, toHeight, dist)
    const drop = Math.max(0, cursor.y - preview.y)
    const minDist = (drop > 0 ? drop / MAX_TRAVERSABLE_FLOOR_GRADE : 0) + extra
    if (dist >= minDist - 1e-6 || dist < 1e-6) return dest
    const scale = minDist / dist
    const next = {
      x: cursor.x + (dest.x - cursor.x) * scale,
      z: cursor.z + (dest.z - cursor.z) * scale,
    }
    if (Math.hypot(next.x - dest.x, next.z - dest.z) < 0.05) return next
    dest = next
  }
  return dest
}

function rampInterior(
  from: { x: number, z: number },
  to: { x: number, z: number },
  spacing: number,
  wobble?: WalkWobble,
): InteriorPoint[] {
  const dist = Math.hypot(to.x - from.x, to.z - from.z)
  const count = Math.max(0, Math.ceil(dist / spacing) - 1)
  const out: InteriorPoint[] = []
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1)
    let x = from.x + (to.x - from.x) * t
    let z = from.z + (to.z - from.z) * t
    if (wobble) {
      const offset = (wobble.random() - 0.5) * wobble.amplitude
      x += wobble.perpDx * offset
      z += wobble.perpDz * offset
    }
    out.push({ xz: { x, z }, t })
  }
  return out
}

/** |Δfloor|/Δxz between consecutive centerline samples — topology intent, not the representation's floor. */
export function maxCenterlineFloorGrade(centerline: readonly CaveTopologyPoint[]): number {
  let max = 0
  for (let i = 1; i < centerline.length; i++) {
    const a = centerline[i - 1]!
    const b = centerline[i]!
    const dist = Math.hypot(b.x - a.x, b.z - a.z)
    if (dist < 1e-6) continue
    max = Math.max(max, Math.abs(b.y - a.y) / dist)
  }
  return max
}

/** Floor Y for one station: follow the segment ramp, dump extra only when
 *  local overburden needs it, never steeper than `MAX_TRAVERSABLE_FLOOR_GRADE`. */
function rampStationY(
  cursorY: number,
  rampY: number,
  previewY: number,
  stepDist: number,
): number {
  const gradeFloor = cursorY - MAX_TRAVERSABLE_FLOOR_GRADE * Math.max(stepDist, 1e-6)
  return Math.max(gradeFloor, Math.min(rampY, previewY))
}

/**
 * Walks one segment from `cursor` toward `toXZ`, adapting the floor to local
 * overburden and never exceeding `MAX_TRAVERSABLE_FLOOR_GRADE`. Sets
 * `cursor.rejected` when the route would have to go deeper than
 * `MAX_TOTAL_DROP` below the mouth; the caller decides whether that kills the
 * whole cave (main route) or only drops an appendage (branch).
 *
 * @domain world-terrain
 */
export function walkSegment(
  ctx: RouteContext,
  cursor: Cursor,
  fromWidth: number,
  fromHeight: number,
  toXZ: { x: number, z: number },
  toWidth: number,
  toHeight: number,
  wobble?: WalkWobble,
): { interiorPoints: CaveTopologyPoint[], toPoint: CaveTopologyPoint } {
  const start = { x: cursor.x, y: cursor.y, z: cursor.z }
  const dest = planDestination(ctx, cursor, toXZ, fromWidth, toWidth, toHeight)
  const totalDist = Math.hypot(dest.x - start.x, dest.z - start.z)
  const destPreview = unconstrainedFloorY(ctx, start.y, dest.x, dest.z, toWidth, toHeight, totalDist)
  if (destPreview.rejected) {
    cursor.rejected = true
    return { interiorPoints: [], toPoint: { x: dest.x, y: start.y, z: dest.z } }
  }
  const destY = Math.max(
    destPreview.y,
    start.y - MAX_TRAVERSABLE_FLOOR_GRADE * Math.max(totalDist, 1e-6),
  )

  const stepTo = (x: number, z: number): void => {
    if (cursor.rejected) return
    const stepDist = Math.hypot(x - cursor.x, z - cursor.z)
    const traveled = Math.hypot(x - start.x, z - start.z)
    const tPath = totalDist > 1e-6 ? clamp01(traveled / totalDist) : 1
    const yRamp = start.y + (destY - start.y) * tPath
    let width = fromWidth
    let height = fromHeight
    let y = yRamp
    for (let k = 0; k < 4; k++) {
      const preview = unconstrainedFloorY(ctx, cursor.y, x, z, width, height, stepDist)
      if (preview.rejected) {
        cursor.rejected = true
        return
      }
      y = rampStationY(cursor.y, yRamp, preview.y, stepDist)
      const tShape = start.y - destY > 1e-6
        ? clamp01((start.y - y) / (start.y - destY))
        : tPath
      width = fromWidth + (toWidth - fromWidth) * tShape
      height = fromHeight + (toHeight - fromHeight) * tShape
    }
    cursor.x = x
    cursor.y = y
    cursor.z = z
  }

  const interior = rampInterior(
    { x: start.x, z: start.z },
    dest,
    FLOOR_RAMP_STATION_SPACING,
    wobble,
  )
  const interiorPoints: CaveTopologyPoint[] = []
  for (const pt of interior) {
    stepTo(pt.xz.x, pt.xz.z)
    if (cursor.rejected) break
    interiorPoints.push({ x: pt.xz.x, y: cursor.y, z: pt.xz.z })
  }
  stepTo(dest.x, dest.z)
  return { interiorPoints, toPoint: { x: dest.x, y: cursor.y, z: dest.z } }
}

/** Worst-case (smallest) surface-to-surface gap between two station sets,
 *  ignoring any station within `excludeRadius` of `exclude` (the shared
 *  junction, where closeness is expected and legitimate). Exported for the
 *  plan §9 "accidental unions" separation test. */
export function minGapBetweenPaths(
  a: readonly RadialStation[],
  b: readonly RadialStation[],
  exclude: { x: number, z: number },
  excludeRadius: number,
): number {
  let minGap = Infinity
  for (const pa of a) {
    if (Math.hypot(pa.x - exclude.x, pa.z - exclude.z) < excludeRadius) continue
    for (const pb of b) {
      if (Math.hypot(pb.x - exclude.x, pb.z - exclude.z) < excludeRadius) continue
      const gap = Math.hypot(pa.x - pb.x, pa.z - pb.z) - (pa.radius + pb.radius)
      if (gap < minGap) minGap = gap
    }
  }
  return minGap
}

/** Sinks a chamber feature far enough to keep its own overburden, but never
 *  far enough to be worth rejecting the cave over. */
export function lowerFeatureIfNeeded(
  ctx: RouteContext,
  feature: CaveTopologyFeature,
): CaveTopologyFeature {
  const distanceFromMouth = Math.hypot(feature.position.x - ctx.entrance.x, feature.position.z - ctx.entrance.z)
  const required = mouthOverburdenRequirement(ctx.entrance, distanceFromMouth, PROXY_MARGIN)
  if (required === null) return feature
  const radius = Math.max(feature.size.width, feature.size.depth) / 2 + PROXY_MARGIN
  const top = feature.position.y + feature.size.height / 2
  const allowedCeiling = minSurfaceOverFootprint(ctx.sampleBaseHeight, feature.position.x, feature.position.z, radius) - required - STATION_SAFETY
  const neededDrop = Math.min(MAX_FEATURE_DROP, Math.max(0, top - allowedCeiling))
  if (neededDrop <= 0) return feature
  return { ...feature, position: { ...feature.position, y: feature.position.y - neededDrop } }
}
