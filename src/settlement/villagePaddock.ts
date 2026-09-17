import type { HeightSampler } from '../player/PlayerController'
import type { RiverChannelSegment } from '../terrain/chunkHeightmap'
import type { VillageSize } from './families'
import { pointHitsCorridor, segmentHitsCorridor, type CorridorSegment2D } from '../math/segment'
import { type PropPlacement } from '../render/instancedProps'
import { footprintOverlapsRiver } from '../terrain/riverNetwork'
import { createSeededRandom } from '../world/parseSeed'
import { pathIsDry, SETTLEMENT_WATER_MARGIN } from './pathDryness'
import { fenceSegmentPlacements } from './villagePasture'
import {
  PADDOCK_ID,
  paddockPathId,
  type VillageBoundary,
  type VillageCenter,
  type VillageEntrance,
  type VillageIdentity,
  type VillagePaddockPlan,
  type VillagePastureAnchor,
  type VillagePastureFenceSegment,
  type VillagePasturePlan,
  type VillagePathPlan,
  type VillagePlot,
} from './villagePlan'

/**
 * Deterministic horse-vendor paddock placement (plan settlements-013).
 * Reuses pasture satellite spacing/dryness/fence conventions; the paddock
 * itself is a separate VillagePlan contract with a functional fence gap.
 *
 * @domain settlements
 */

const PADDOCK_SETUP_SALT = 0x48525644
const PADDOCK_PLACE_SALT = 0x50444b4c
const LOCAL_SLOPE_STEP = 2.2
const PLOT_RIVER_MARGIN = 1
const BOUNDARY_GAP = 2.2
const TROUGH_RADIUS = 1.2
const HAY_RADIUS = 1.4
const FENCE_CLEARANCE = 0.9
/** Matches `PALISADE_WALL_HALF_DEPTH` — physical fence footprint vs corridors. */
const FENCE_CORRIDOR_CLEARANCE = 0.3
const MAX_SLOPE = 3.2
const MAX_SPREAD = 4.2
const ANGLE_CANDIDATES = 16
const DIST_STEPS = [0, 3, 7]
const ENTRANCE_AVOID_RAD = 0.5
const PATH_HALF_WIDTH = 1.5
const RING_OUTER_PAD = 12
const PASTURE_CLEARANCE = 3

const BASE_RADIUS: Record<VillageSize, number | null> = {
  OUTPOST: null,
  SM: null,
  MD: 8,
  LG: 11,
  XL: 14,
}

const SETUP_CHANCE: Record<VillageSize, number> = {
  OUTPOST: 0,
  SM: 0,
  MD: 0.1,
  LG: 0.5,
  XL: 0.8,
}

export function horseVendorSetupChance(size: VillageSize): number {
  return SETUP_CHANCE[size]
}

/**
 * Settlement-level horse-vendor/paddock setup roll. Isolated salt so this
 * does not consume livestock / merchant-profile RNG.
 */
export function settlementRollsHorseVendor(size: VillageSize, seedForCell: number): boolean {
  const chance = SETUP_CHANCE[size]
  if (chance <= 0) return false
  return createSeededRandom(seedForCell ^ PADDOCK_SETUP_SALT)() < chance
}

export function paddockRadiusFor(size: VillageSize): number | null {
  return BASE_RADIUS[size]
}

/** Capacity is a pure function of accepted footprint, not a magic LG=N rule. */
export function paddockSlotCountForRadius(radius: number): number {
  return Math.max(2, Math.min(6, Math.floor(radius / 3.6)))
}

export function vendorHorseAnimalId(settlementId: string, slotIndex: number): string {
  return `vendor-horse-${settlementId}-${slotIndex}`
}

export type PaddockPlanArgs = {
  identity: Pick<VillageIdentity, 'size'>
  center: VillageCenter
  boundary: VillageBoundary
  plots: readonly VillagePlot[]
  entrances: readonly VillageEntrance[]
  seedForCell: number
  sampleHeight: HeightSampler
  waterLevel: number
  riverSegments: readonly RiverChannelSegment[]
  pasture?: VillagePasturePlan
  /** Final local path/road corridors (`pathPlansToCorridorData`). When set,
   *  fence ring segments must clear these in addition to entrance spokes. */
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

function overlapsPasture(
  x: number,
  z: number,
  radius: number,
  pasture: VillagePasturePlan | undefined,
): boolean {
  if (!pasture) return false
  return Math.hypot(x - pasture.x, z - pasture.z) < radius + pasture.radius + PASTURE_CLEARANCE
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

function sampleAnchor(x: number, z: number, sampleHeight: HeightSampler): VillagePastureAnchor {
  return { x, z, y: sampleHeight(x, z) }
}

function angularDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2)
  if (d > Math.PI) d = Math.PI * 2 - d
  return d
}

function candidateScore(
  x: number,
  z: number,
  radius: number,
  preferredDist: number,
  center: VillageCenter,
  sampleHeight: HeightSampler,
): number | null {
  const y = sampleHeight(x, z)
  const slope = localSlope(x, z, y, sampleHeight)
  if (slope > MAX_SLOPE) return null
  const spread = heightSpread(x, z, radius, sampleHeight)
  if (spread > MAX_SPREAD) return null
  const dist = Math.hypot(x - center.x, z - center.z)
  return 40 - Math.abs(dist - preferredDist) - slope * 4 - spread * 3
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
): Omit<VillagePaddockPlan, 'id' | 'outsideCore' | 'x' | 'z' | 'y' | 'radius'> | null {
  const inward = Math.atan2(center.z - cz, center.x - cx)
  const entrance = {
    x: cx + Math.cos(inward) * radius,
    z: cz + Math.sin(inward) * radius,
  }
  const troughPos = {
    x: cx + Math.cos(inward + 2.1) * radius * 0.58,
    z: cz + Math.sin(inward + 2.1) * radius * 0.58,
  }
  const hayPos = {
    x: cx + Math.cos(inward - 2.1) * radius * 0.58,
    z: cz + Math.sin(inward - 2.1) * radius * 0.58,
  }
  const workPos = {
    x: cx + Math.cos(inward) * radius * 0.42,
    z: cz + Math.sin(inward) * radius * 0.42,
  }

  const anchors = [entrance, troughPos, hayPos, workPos]
  for (const pos of anchors) {
    if (wetOrRiver(pos.x, pos.z, TROUGH_RADIUS, sampleHeight, waterLevel, riverSegments)) return null
    if (overlapsPlots(pos.x, pos.z, TROUGH_RADIUS, plots)) return null
    if (pointHitsCorridor(pos.x, pos.z, corridors, TROUGH_RADIUS)) return null
  }
  if (Math.hypot(troughPos.x - hayPos.x, troughPos.z - hayPos.z) < TROUGH_RADIUS + HAY_RADIUS + 0.8) {
    return null
  }
  if (!pathIsDry(cx, cz, troughPos.x, troughPos.z, waterLevel, sampleHeight)) return null
  if (!pathIsDry(cx, cz, hayPos.x, hayPos.z, waterLevel, sampleHeight)) return null

  const gapHalf = Math.min(0.42, Math.max(0.28, 2.6 / radius))
  const fenceSegments: VillagePastureFenceSegment[] = []
  const steps = 12
  for (let i = 0; i < steps; i++) {
    const t0 = (i / steps) * Math.PI * 2
    const t1 = ((i + 1) / steps) * Math.PI * 2
    const mid = (t0 + t1) / 2
    const fromInward = angularDelta(mid, inward)
    if (fromInward < gapHalf) continue
    const ax = cx + Math.cos(t0) * radius
    const az = cz + Math.sin(t0) * radius
    const bx = cx + Math.cos(t1) * radius
    const bz = cz + Math.sin(t1) * radius
    if (wetOrRiver((ax + bx) / 2, (az + bz) / 2, FENCE_CLEARANCE, sampleHeight, waterLevel, riverSegments)) {
      return null
    }
    if (overlapsPlots((ax + bx) / 2, (az + bz) / 2, FENCE_CLEARANCE, plots)) return null
    if (segmentHitsCorridor(ax, az, bx, bz, corridors, FENCE_CORRIDOR_CLEARANCE)) return null
    fenceSegments.push({
      id: `paddock-fence-${fenceSegments.length}`,
      ax,
      az,
      bx,
      bz,
    })
  }
  if (fenceSegments.length < 6) return null

  const slotCount = paddockSlotCountForRadius(radius)
  const horseSlots: VillagePastureAnchor[] = []
  for (let i = 0; i < slotCount; i++) {
    const t = (i + 0.5) / slotCount
    const angle = inward + Math.PI + (t - 0.5) * Math.PI * 0.9
    const dist = radius * 0.32
    const x = cx + Math.cos(angle) * dist
    const z = cz + Math.sin(angle) * dist
    if (wetOrRiver(x, z, 1.1, sampleHeight, waterLevel, riverSegments)) return null
    if (Math.hypot(x - troughPos.x, z - troughPos.z) < 2.0) return null
    if (Math.hypot(x - hayPos.x, z - hayPos.z) < 2.0) return null
    if (Math.hypot(x - entrance.x, z - entrance.z) < 2.2) return null
    horseSlots.push(sampleAnchor(x, z, sampleHeight))
  }

  const entranceWidth = Math.min(4.2, Math.max(2.6, radius * 0.32))
  return {
    trough: sampleAnchor(troughPos.x, troughPos.z, sampleHeight),
    haystack: sampleAnchor(hayPos.x, hayPos.z, sampleHeight),
    work: sampleAnchor(workPos.x, workPos.z, sampleHeight),
    entrance: sampleAnchor(entrance.x, entrance.z, sampleHeight),
    entranceWidth,
    fenceSegments,
    horseSlots,
  }
}

/**
 * Place a vendor paddock outside the village boundary when the settlement-
 * level setup roll succeeds and a dry, unobstructed candidate exists.
 *
 * @domain settlements
 */
export function planSettlementPaddock(args: PaddockPlanArgs): VillagePaddockPlan | undefined {
  if (!settlementRollsHorseVendor(args.identity.size, args.seedForCell)) return undefined
  const radius = paddockRadiusFor(args.identity.size)
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
    pasture,
    pathCorridors,
  } = args
  const corridors: CorridorSegment2D[] = [
    ...entranceCorridors(center, entrances),
    ...(pathCorridors ?? []),
  ]
  const minDist = boundary.radius + radius + BOUNDARY_GAP
  const preferredDist = minDist + 3
  const random = createSeededRandom(seedForCell ^ PADDOCK_PLACE_SALT)
  const angleOffset = random() * Math.PI * 2
  const blockedAngles = entrances.map((entrance) =>
    Math.atan2(entrance.z - center.z, entrance.x - center.x),
  )

  let best: { score: number, plan: VillagePaddockPlan } | null = null

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
      if (overlapsPasture(x, z, radius, pasture)) continue
      if (pointHitsCorridor(x, z, corridors, radius * 0.3)) continue
      const footprintOutside = Math.hypot(x - boundary.x, z - boundary.z) - radius
      if (footprintOutside < boundary.radius) continue
      const score = candidateScore(x, z, radius, preferredDist, center, sampleHeight)
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
          id: PADDOCK_ID,
          outsideCore: true,
          x,
          z,
          y: sampleHeight(x, z),
          radius,
          ...layout,
        },
      }
    }
  }

  return best?.plan
}

export function appendPaddockPath(
  paths: VillagePathPlan[],
  paddock: VillagePaddockPlan,
  sampleHeight: HeightSampler,
  waterLevel: number,
): void {
  const target = paddock.entrance
  let nearest: { x: number, z: number } | null = null
  let nearestDist = Infinity
  for (const path of paths) {
    if (path.id === paddockPathId()) continue
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
    id: paddockPathId(),
    points: [
      { x: nearest.x, z: nearest.z },
      { x: mid.x, z: mid.z },
      { x: target.x, z: target.z },
    ],
    halfWidth: PATH_HALF_WIDTH,
    kind: 'path',
  })
}

export function paddockFencePlacements(
  paddock: VillagePaddockPlan,
  sampleHeight: HeightSampler,
): PropPlacement[] {
  return fenceSegmentPlacements(paddock.fenceSegments, sampleHeight)
}
