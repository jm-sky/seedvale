import type { HeightSampler } from '../player/PlayerController'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import type { FamilyDef, VillageSize } from './families'
import {
  type CorridorSegment2D,
  pointHitsCorridor,
  segmentHitsCorridor,
  yawToward,
} from '../math/segment'
import { type PropPlacement } from '../render/instancedProps'
import { footprintOverlapsRiver } from '../terrain/riverNetwork'
import { createSeededRandom } from '../world/parseSeed'
import { PASTURE_WELL_TROUGH_BUCKET_REACH } from './pastureWater'
import { pathIsDry, SETTLEMENT_WATER_MARGIN } from './pathDryness'
import {
  PASTURE_ID,
  pasturePathId,
  type VillageBoundary,
  type VillageCenter,
  type VillageEntrance,
  type VillageIdentity,
  type VillagePastureAnchor,
  type VillagePastureFenceSegment,
  type VillagePasturePlan,
  type VillagePathPlan,
  type VillagePlot,
} from './villagePlan'

/**
 * Deterministic satellite pasture placement (plan settlements-009).
 * Independent of `pickPlot()` — that scorer penalizes positions outside
 * `VillageBoundary` and its last-resort fallback can ignore gates. Pasture
 * is a required outskirts area for MD/LG/XL when a dry candidate exists,
 * and is omitted rather than forced onto water or core plots.
 *
 * @domain settlements
 */

const PASTURE_SEED_SALT = 0x50415354
const LOCAL_SLOPE_STEP = 2.2
const PLOT_RIVER_MARGIN = 1
const PASTURE_BOUNDARY_GAP = 2.5
const WELL_RADIUS = 2.4
const TROUGH_RADIUS = 1.2
/** Distance from the well anchor the trough is placed at — a fixed offset
 *  within `PASTURE_WELL_TROUGH_BUCKET_REACH` (plan settlements-npcs-046) so
 *  a valid pasture satisfies the reach by construction, never by a runtime
 *  correction. `WELL_RADIUS`/`TROUGH_RADIUS` stay independent
 *  terrain/plot/corridor clearance radii — this offset intentionally sits
 *  well inside their sum, since well+trough are now one local pair rather
 *  than two mutually-exclusive footprints. */
const TROUGH_OFFSET_FROM_WELL = PASTURE_WELL_TROUGH_BUCKET_REACH * 0.8
const FENCE_CLEARANCE = 0.9
/** Matches `PALISADE_WALL_HALF_DEPTH` — physical fence footprint vs corridors. */
const FENCE_CORRIDOR_CLEARANCE = 0.3
const MAX_SLOPE = 3.2
const MAX_SPREAD = 4.5
const ANGLE_CANDIDATES = 16
const DIST_STEPS = [0, 4, 9]
const ENTRANCE_AVOID_RAD = 0.55
const PATH_HALF_WIDTH = 1.5
const RING_OUTER_PAD = 14

const BASE_RADIUS: Record<VillageSize, number | null> = {
  OUTPOST: null,
  SM: null,
  MD: 11,
  LG: 15,
  XL: 20,
}

export function settlementWantsPasture(size: VillageSize): boolean {
  return BASE_RADIUS[size] != null
}

/**
 * Base pasture radius from `VillageSize`, with a small family-count nudge as
 * a deterministic livestock-count proxy (plan generation runs before live
 * `AnimalAgent` spawn, so runtime flock size must not change the layout).
 */
export function pastureRadiusFor(size: VillageSize, familyCount: number): number | null {
  const base = BASE_RADIUS[size]
  if (base == null) return null
  const boost = Math.max(-1, Math.min(2.5, (familyCount - 4) * 0.35))
  return base + boost
}

export type PasturePlanArgs = {
  identity: Pick<VillageIdentity, 'size'>
  center: VillageCenter
  boundary: VillageBoundary
  plots: readonly VillagePlot[]
  families: readonly FamilyDef[]
  entrances: readonly VillageEntrance[]
  seedForCell: number
  sampleHeight: HeightSampler
  waterLevel: number
  riverSegments: readonly RiverChannelSegment[]
  /** Final local path/road corridors (`pathPlansToCorridorData`). When set,
   *  fence segments must clear these in addition to entrance spokes. */
  pathCorridors?: readonly CorridorSegment2D[]
}

function localSlope(x: number, z: number, y: number, sampleHeight: HeightSampler): number {
  const step = LOCAL_SLOPE_STEP
  const samples = [
    sampleHeight(x + step, z),
    sampleHeight(x - step, z),
    sampleHeight(x, z + step),
    sampleHeight(x, z - step),
  ]
  return Math.max(...samples.map((h) => Math.abs(h - y)))
}

function heightSpread(x: number, z: number, radius: number, sampleHeight: HeightSampler): number {
  const pts: readonly [number, number][] = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ]
  let min = Infinity
  let max = -Infinity
  for (const [dx, dz] of pts) {
    const h = sampleHeight(x + dx, z + dz)
    if (h < min) min = h
    if (h > max) max = h
  }
  return max - min
}

function wetOrRiver(
  x: number,
  z: number,
  radius: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  riverSegments: readonly RiverChannelSegment[],
): boolean {
  if (sampleHeight(x, z) <= waterLevel + SETTLEMENT_WATER_MARGIN) return true
  return riverSegments.length > 0
    && footprintOverlapsRiver(riverSegments, x, z, radius + PLOT_RIVER_MARGIN)
}

function overlapsPlots(x: number, z: number, radius: number, plots: readonly VillagePlot[]): boolean {
  for (const plot of plots) {
    if (Math.hypot(x - plot.x, z - plot.z) < radius + plot.radius + 0.8) return true
  }
  return false
}

function entranceCorridors(
  center: VillageCenter,
  entrances: readonly VillageEntrance[],
): Array<{ ax: number, az: number, bx: number, bz: number, halfWidth: number }> {
  return entrances.map((entrance) => ({
    ax: center.x,
    az: center.z,
    bx: entrance.x,
    bz: entrance.z,
    halfWidth: entrance.kind === 'road' ? 2.4 : PATH_HALF_WIDTH,
  }))
}

function sampleAnchor(
  x: number,
  z: number,
  sampleHeight: HeightSampler,
): VillagePastureAnchor {
  return { x, z, y: sampleHeight(x, z) }
}

function segmentClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  well: { x: number, z: number },
  trough: { x: number, z: number },
  connection: { x: number, z: number },
  plots: readonly VillagePlot[],
  corridors: readonly CorridorSegment2D[],
  sampleHeight: HeightSampler,
  waterLevel: number,
  riverSegments: readonly RiverChannelSegment[],
): boolean {
  if (segmentHitsCorridor(ax, az, bx, bz, corridors, FENCE_CORRIDOR_CLEARANCE)) return false
  const samples = 5
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const x = ax + (bx - ax) * t
    const z = az + (bz - az) * t
    if (wetOrRiver(x, z, FENCE_CLEARANCE, sampleHeight, waterLevel, riverSegments)) return false
    if (overlapsPlots(x, z, FENCE_CLEARANCE, plots)) return false
    if (Math.hypot(x - well.x, z - well.z) < WELL_RADIUS + FENCE_CLEARANCE) return false
    if (Math.hypot(x - trough.x, z - trough.z) < TROUGH_RADIUS + FENCE_CLEARANCE) return false
    if (Math.hypot(x - connection.x, z - connection.z) < 1.6) return false
  }
  return true
}

function layoutOnCandidate(
  cx: number,
  cz: number,
  radius: number,
  center: VillageCenter,
  plots: readonly VillagePlot[],
  corridors: readonly CorridorSegment2D[],
  sampleHeight: HeightSampler,
  waterLevel: number,
  riverSegments: readonly RiverChannelSegment[],
): { well: VillagePastureAnchor, trough: VillagePastureAnchor, connection: VillagePastureAnchor, fenceSegments: VillagePastureFenceSegment[] } | null {
  const inward = Math.atan2(center.z - cz, center.x - cx)
  const outward = inward + Math.PI
  const tangent = inward + Math.PI / 2

  const connection = {
    x: cx + Math.cos(inward) * radius * 0.82,
    z: cz + Math.sin(inward) * radius * 0.82,
  }
  const wellPos = {
    x: cx + Math.cos(inward - 0.7) * radius * 0.28,
    z: cz + Math.sin(inward - 0.7) * radius * 0.28,
  }
  // Trough is placed relative to the already-computed well anchor, at a
  // fixed offset within `PASTURE_WELL_TROUGH_BUCKET_REACH` (plan
  // settlements-npcs-046) — well+trough are one local infrastructure pair,
  // not two independently-placed radial anchors, so a valid pasture
  // satisfies the reach by construction rather than a runtime correction.
  const wellTangent = inward - 0.7 + Math.PI / 2
  const troughPos = {
    x: wellPos.x + Math.cos(wellTangent) * TROUGH_OFFSET_FROM_WELL,
    z: wellPos.z + Math.sin(wellTangent) * TROUGH_OFFSET_FROM_WELL,
  }

  if (wetOrRiver(wellPos.x, wellPos.z, WELL_RADIUS, sampleHeight, waterLevel, riverSegments)) return null
  if (wetOrRiver(troughPos.x, troughPos.z, TROUGH_RADIUS, sampleHeight, waterLevel, riverSegments)) return null
  if (wetOrRiver(connection.x, connection.z, 1.2, sampleHeight, waterLevel, riverSegments)) return null
  if (overlapsPlots(wellPos.x, wellPos.z, WELL_RADIUS, plots)) return null
  if (overlapsPlots(troughPos.x, troughPos.z, TROUGH_RADIUS, plots)) return null
  if (pointHitsCorridor(wellPos.x, wellPos.z, corridors, WELL_RADIUS)) return null
  if (pointHitsCorridor(troughPos.x, troughPos.z, corridors, TROUGH_RADIUS)) return null
  if (!pathIsDry(cx, cz, wellPos.x, wellPos.z, waterLevel, sampleHeight)) return null
  if (!pathIsDry(cx, cz, troughPos.x, troughPos.z, waterLevel, sampleHeight)) return null

  const gap = Math.min(7, Math.max(5.2, radius * 0.45))
  const longLen = Math.min(24, Math.max(12, radius * 1.2))
  const shortLen = Math.min(12, Math.max(8, radius * 0.55))
  const corner = {
    x: connection.x + Math.cos(tangent) * (gap * 0.5),
    z: connection.z + Math.sin(tangent) * (gap * 0.5),
  }
  const twoSeg: VillagePastureFenceSegment[] = [
    {
      id: 'pasture-fence-a',
      ax: corner.x,
      az: corner.z,
      bx: corner.x + Math.cos(tangent) * longLen,
      bz: corner.z + Math.sin(tangent) * longLen,
    },
    {
      id: 'pasture-fence-b',
      ax: corner.x,
      az: corner.z,
      bx: corner.x + Math.cos(outward) * shortLen,
      bz: corner.z + Math.sin(outward) * shortLen,
    },
  ]
  const flippedCorner = {
    x: connection.x - Math.cos(tangent) * (gap * 0.5),
    z: connection.z - Math.sin(tangent) * (gap * 0.5),
  }
  const flipped: VillagePastureFenceSegment[] = [
    {
      id: 'pasture-fence-a',
      ax: flippedCorner.x,
      az: flippedCorner.z,
      bx: flippedCorner.x - Math.cos(tangent) * longLen,
      bz: flippedCorner.z - Math.sin(tangent) * longLen,
    },
    {
      id: 'pasture-fence-b',
      ax: flippedCorner.x,
      az: flippedCorner.z,
      bx: flippedCorner.x + Math.cos(outward) * shortLen,
      bz: flippedCorner.z + Math.sin(outward) * shortLen,
    },
  ]
  const oneSeg: VillagePastureFenceSegment[] = [
    {
      id: 'pasture-fence-a',
      ax: connection.x + Math.cos(tangent) * (gap * 0.5),
      az: connection.z + Math.sin(tangent) * (gap * 0.5),
      bx: connection.x + Math.cos(tangent) * (gap * 0.5 + longLen),
      bz: connection.z + Math.sin(tangent) * (gap * 0.5 + longLen),
    },
  ]

  const tryLayout = (segments: VillagePastureFenceSegment[]): boolean =>
    segments.every((seg) =>
      segmentClear(
        seg.ax,
        seg.az,
        seg.bx,
        seg.bz,
        wellPos,
        troughPos,
        connection,
        plots,
        corridors,
        sampleHeight,
        waterLevel,
        riverSegments,
      ),
    )

  const fenceSegments = tryLayout(twoSeg)
    ? twoSeg
    : tryLayout(flipped)
      ? flipped
      : tryLayout(oneSeg)
        ? oneSeg
        : null
  if (!fenceSegments) return null

  return {
    well: sampleAnchor(wellPos.x, wellPos.z, sampleHeight),
    trough: sampleAnchor(troughPos.x, troughPos.z, sampleHeight),
    connection: sampleAnchor(connection.x, connection.z, sampleHeight),
    fenceSegments,
  }
}

function candidateScore(
  x: number,
  z: number,
  radius: number,
  preferredDist: number,
  center: VillageCenter,
  seedForCell: number,
  sampleHeight: HeightSampler,
): number | null {
  const y = sampleHeight(x, z)
  const slope = localSlope(x, z, y, sampleHeight)
  if (slope > MAX_SLOPE) return null
  const spread = heightSpread(x, z, radius * 0.7, sampleHeight)
  if (spread > MAX_SPREAD) return null
  const dist = Math.hypot(x - center.x, z - center.z)
  const noise = ((Math.imul(seedForCell ^ Math.round(x * 10) ^ Math.round(z * 10), 0x9e3779b1) >>> 0) / 4294967295) * 0.05
  return 10 - slope * 2.2 - spread * 1.6 - Math.abs(dist - preferredDist) * 0.12 + noise
}

/**
 * Place a satellite pasture outside the village boundary, or `undefined`
 * when no candidate clears river / spacing / terrain gates. Never forces a
 * wet or overlapping fallback.
 */
export function planSettlementPasture(args: PasturePlanArgs): VillagePasturePlan | undefined {
  const radius = pastureRadiusFor(args.identity.size, args.families.length)
  if (radius == null) return undefined

  const {
    center,
    boundary,
    plots,
    entrances,
    seedForCell,
    sampleHeight,
    waterLevel,
    riverSegments,
    pathCorridors,
  } = args
  const corridors: CorridorSegment2D[] = [
    ...entranceCorridors(center, entrances),
    ...(pathCorridors ?? []),
  ]
  const minDist = boundary.radius + radius + PASTURE_BOUNDARY_GAP
  const preferredDist = minDist + 4
  const random = createSeededRandom(seedForCell ^ PASTURE_SEED_SALT)
  const angleOffset = random() * Math.PI * 2

  const blockedAngles = entrances.map((entrance) =>
    Math.atan2(entrance.z - center.z, entrance.x - center.x),
  )

  let best: { score: number, plan: VillagePasturePlan } | null = null

  for (let i = 0; i < ANGLE_CANDIDATES; i++) {
    const angle = angleOffset + (i / ANGLE_CANDIDATES) * Math.PI * 2
    if (blockedAngles.some((blocked) => angularDelta(angle, blocked) < ENTRANCE_AVOID_RAD)) {
      continue
    }
    for (const extra of DIST_STEPS) {
      const dist = Math.min(minDist + extra, minDist + RING_OUTER_PAD)
      const x = center.x + Math.cos(angle) * dist
      const z = center.z + Math.sin(angle) * dist
      if (wetOrRiver(x, z, radius, sampleHeight, waterLevel, riverSegments)) continue
      if (overlapsPlots(x, z, radius, plots)) continue
      if (pointHitsCorridor(x, z, corridors, radius * 0.35)) continue
      const footprintOutside = Math.hypot(x - boundary.x, z - boundary.z) - radius
      if (footprintOutside < boundary.radius) continue
      const score = candidateScore(x, z, radius, preferredDist, center, seedForCell, sampleHeight)
      if (score == null) continue
      const layout = layoutOnCandidate(
        x,
        z,
        radius,
        center,
        plots,
        corridors,
        sampleHeight,
        waterLevel,
        riverSegments,
      )
      if (!layout) continue
      if (best && score <= best.score) continue
      best = {
        score,
        plan: {
          id: PASTURE_ID,
          outsideCore: true,
          x,
          z,
          y: sampleHeight(x, z),
          radius,
          well: layout.well,
          trough: layout.trough,
          fenceSegments: layout.fenceSegments,
          connection: layout.connection,
        },
      }
    }
  }

  return best?.plan
}

function angularDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2)
  if (d > Math.PI) d = Math.PI * 2 - d
  return d
}

/**
 * Append a local dirt path from the nearest existing village path/entrance
 * onto the pasture gap. Uses the same `VillagePathPlan` shape as core paths.
 * No-op when the connection is wet.
 */
export function appendPasturePath(
  paths: VillagePathPlan[],
  pasture: VillagePasturePlan,
  sampleHeight: HeightSampler,
  waterLevel: number,
): void {
  const target = pasture.connection
  let nearest: { x: number, z: number } | null = null
  let nearestDist = Infinity
  for (const path of paths) {
    if (path.id === pasturePathId()) continue
    for (const point of path.points) {
      const d = Math.hypot(point.x - target.x, point.z - target.z)
      if (d < nearestDist) {
        nearestDist = d
        nearest = point
      }
    }
  }
  if (!nearest) return
  if (nearestDist < 1.5) return
  if (!pathIsDry(nearest.x, nearest.z, target.x, target.z, waterLevel, sampleHeight)) return
  const mid = {
    x: nearest.x + (target.x - nearest.x) * 0.5,
    z: nearest.z + (target.z - nearest.z) * 0.5,
  }
  paths.push({
    id: pasturePathId(),
    points: [
      { x: nearest.x, z: nearest.z },
      { x: mid.x, z: mid.z },
      { x: target.x, z: target.z },
    ],
    halfWidth: PATH_HALF_WIDTH,
    kind: 'path',
  })
}

const FENCE_POST_SPACING = 2.2
const FENCE_SCALE = 0.62

/**
 * Instanced `wall.glb` placements along planned fence segments.
 * `rotationY` uses the same local-+X `yawToward` convention as the
 * settlement palisade — `atan2(dx, dz)` would stand each post 90° off
 * the segment (the "comb" look).
 */
export function fenceSegmentPlacements(
  segments: readonly VillagePastureFenceSegment[],
  sampleHeight: HeightSampler,
): PropPlacement[] {
  const out: PropPlacement[] = []
  for (const seg of segments) {
    const dx = seg.bx - seg.ax
    const dz = seg.bz - seg.az
    const len = Math.hypot(dx, dz)
    if (len < 0.5) continue
    const yaw = yawToward(dx, dz)
    const count = Math.max(2, Math.round(len / FENCE_POST_SPACING))
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1)
      const x = seg.ax + dx * t
      const z = seg.az + dz * t
      out.push({
        speciesIndex: 0,
        x,
        z,
        groundY: sampleHeight(x, z),
        rotationY: yaw,
        scale: FENCE_SCALE,
      })
    }
  }
  return out
}

export function pastureFencePlacements(
  pasture: VillagePasturePlan,
  sampleHeight: HeightSampler,
): PropPlacement[] {
  return fenceSegmentPlacements(pasture.fenceSegments, sampleHeight)
}
