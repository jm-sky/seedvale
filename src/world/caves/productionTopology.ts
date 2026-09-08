/** Plan world-terrain-008 Milestone B1 — production `CaveTopology` builder.
 *  Replaces the Milestone-A `buildSpikeTestTopology()` runtime path: same
 *  archetype shape (entrance → transition → irregular passage →
 *  widening/bend → main chamber → shelf|overhang, optional short branch) but
 *  with production cross-sections, per-cave deterministic RNG (never one
 *  world-seed-only stream shared by every cave — see `caveRng.ts`), and
 *  local/topology-aware terrain adaptation instead of one uniform
 *  `sinkUnderTerrain()` drop.
 *
 *  Reuses `pickLargeCaveSites()` for placement (siting/filtering stays owned
 *  by `largeCaves.ts`) and `makeCaveId()` for identity — this module owns
 *  only topology generation and acceptance from here on; V1's tunnel/chamber
 *  `CaveDefinition` graph (`caveGenerator.ts`) is no longer in the loop.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { CaveTopology, CaveTopologyFeature, CaveTopologyNode, CaveTopologyPoint, CaveTopologySegment } from './caveTopology'
import type { SurfaceHeightSampler } from './clipBelowSurface'
import { CAVE_MOUTH_DEPTH } from '../caveGenerator'
import { LARGE_CAVE_MOUTH_WIDTH, type LargeCaveSite, tunnelDirection } from '../largeCaves'
import { makeCaveId } from './caveIdentity'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'
import { mouthOverburdenRequirement } from './mouthOverburden'
import { minSurfaceOverFootprint } from './terrainFootprint'
import { PROXY_MARGIN } from './topologyAdapter'

const ENTRANCE_HEIGHT = 2.6

// Plan §7 starting cross-section ranges — width/height, metres. Production
// caves are wider/taller than the Milestone-A spike, mainly in cross-section,
// not route length.
const PASSAGE_WIDTH: readonly [number, number] = [3.5, 4.5]
const PASSAGE_HEIGHT: readonly [number, number] = [4.5, 5.5]
const WIDENING_WIDTH: readonly [number, number] = [5, 6]
const WIDENING_HEIGHT: readonly [number, number] = [5.5, 6.5]
const CHAMBER_WIDTH: readonly [number, number] = [9, 10]
const CHAMBER_HEIGHT: readonly [number, number] = [9, 11]

/** Baseline floor descent even where terrain is generous — keeps caves
 *  reading as a route going *into* the hill rather than a flat corridor.
 *  Actual descent is topology-aware on top of this (see `adaptStation`). */
const NOMINAL_DESCENT_PER_METER = 0.12
/** Slack on top of the required overburden, covering the gap between the
 *  station spacing below and an arbitrarily dense check of the same
 *  envelope (same role as `spikeTestCave.ts`'s `OVERBURDEN_SAFETY`, slightly
 *  larger since production stations are coarser). */
const STATION_SAFETY = 0.35
/** Total floor drop (metres) below the mouth beyond which the route is
 *  rejected outright rather than forced arbitrarily deep under the hill. */
const MAX_TOTAL_DROP = 12
/** Extra drop cap applied to a chamber feature (shelf/overhang) alone —
 *  never worth rejecting a whole cave over a decorative appendage. */
const MAX_FEATURE_DROP = 3

const BRANCH_CHANCE = 0.35
/** Minimum surface-to-surface gap (metres) a branch must keep from every
 *  main-route station outside the shared junction's own footprint — must
 *  clear the SDF `smoothK` (`DEFAULT_SDF_PARAMS.smoothK`, 0.9 m) by a safe
 *  margin so a smooth union can never accidentally bridge two logically
 *  disconnected passages (plan §9's "accidental unions"). */
export const MIN_DISCONNECTED_CLEARANCE = 1.5

export type ProductionTopologyInput = {
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

function rotateXZ(dx: number, dz: number, angle: number): { dx: number, dz: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { dx: dx * cos - dz * sin, dz: dx * sin + dz * cos }
}

function pick(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t
}

type Cursor = { x: number, y: number, z: number, rejected: boolean }

/** Advances `cursor` to `(x, z)`, choosing the lowest `y` that satisfies
 *  both a baseline descent trend and the local terrain overburden — the
 *  local, topology-aware replacement for Milestone A's one uniform
 *  `sinkUnderTerrain()` drop (implementation notes §3 "Uniform terrain sink
 *  is spike-only"). Monotonic by construction (`y` only ever decreases),
 *  so the route never yo-yos back toward the surface mid-passage. Rejects
 *  (`cursor.rejected = true`) once the cumulative drop from the mouth
 *  exceeds `MAX_TOTAL_DROP` rather than forcing an arbitrarily deep route. */
function adaptStation(
  cursor: Cursor,
  mouthFloorY: number,
  entrance: CaveEntrance,
  sampleBaseHeight: SurfaceHeightSampler,
  x: number,
  z: number,
  width: number,
  height: number,
): void {
  if (cursor.rejected) return
  const stepDist = Math.hypot(x - cursor.x, z - cursor.z)
  let y = cursor.y - NOMINAL_DESCENT_PER_METER * stepDist
  const distanceFromMouth = Math.hypot(x - entrance.x, z - entrance.z)
  const required = mouthOverburdenRequirement(entrance, distanceFromMouth, PROXY_MARGIN)
  if (required !== null) {
    const radius = width / 2 + PROXY_MARGIN
    const allowedCeiling = minSurfaceOverFootprint(sampleBaseHeight, x, z, radius) - required - STATION_SAFETY
    y = Math.min(y, allowedCeiling - height)
  }
  if (mouthFloorY - y > MAX_TOTAL_DROP) {
    cursor.rejected = true
    return
  }
  cursor.x = x
  cursor.y = y
  cursor.z = z
}

type InteriorPoint = { xz: { x: number, z: number }, t: number }

function walkSegment(
  cursor: Cursor,
  mouthFloorY: number,
  entrance: CaveEntrance,
  sampleBaseHeight: SurfaceHeightSampler,
  fromWidth: number,
  fromHeight: number,
  toXZ: { x: number, z: number },
  toWidth: number,
  toHeight: number,
  interior: readonly InteriorPoint[],
): { interiorPoints: CaveTopologyPoint[], toPoint: CaveTopologyPoint } {
  const interiorPoints: CaveTopologyPoint[] = []
  for (const pt of interior) {
    const width = fromWidth + (toWidth - fromWidth) * pt.t
    const height = fromHeight + (toHeight - fromHeight) * pt.t
    adaptStation(cursor, mouthFloorY, entrance, sampleBaseHeight, pt.xz.x, pt.xz.z, width, height)
    interiorPoints.push({ x: pt.xz.x, y: cursor.y, z: pt.xz.z })
  }
  adaptStation(cursor, mouthFloorY, entrance, sampleBaseHeight, toXZ.x, toXZ.z, toWidth, toHeight)
  return { interiorPoints, toPoint: { x: toXZ.x, y: cursor.y, z: toXZ.z } }
}

function irregularXZ(
  from: { x: number, z: number },
  to: { x: number, z: number },
  perpDx: number,
  perpDz: number,
  count: number,
  wobbleRandom: () => number,
): InteriorPoint[] {
  const out: InteriorPoint[] = []
  const steps = count + 1
  for (let i = 1; i <= count; i++) {
    const t = i / steps
    const baseX = from.x + (to.x - from.x) * t
    const baseZ = from.z + (to.z - from.z) * t
    const wobble = (wobbleRandom() - 0.5) * 1.8
    out.push({ xz: { x: baseX + perpDx * wobble, z: baseZ + perpDz * wobble }, t })
  }
  return out
}

type RadialStation = { x: number, z: number, radius: number }

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

function lowerFeatureIfNeeded(
  feature: CaveTopologyFeature,
  entrance: CaveEntrance,
  sampleBaseHeight: SurfaceHeightSampler,
): CaveTopologyFeature {
  const distanceFromMouth = Math.hypot(feature.position.x - entrance.x, feature.position.z - entrance.z)
  const required = mouthOverburdenRequirement(entrance, distanceFromMouth, PROXY_MARGIN)
  if (required === null) return feature
  const radius = Math.max(feature.size.width, feature.size.depth) / 2 + PROXY_MARGIN
  const top = feature.position.y + feature.size.height / 2
  const allowedCeiling = minSurfaceOverFootprint(sampleBaseHeight, feature.position.x, feature.position.z, radius) - required - STATION_SAFETY
  const neededDrop = Math.min(MAX_FEATURE_DROP, Math.max(0, top - allowedCeiling))
  if (neededDrop <= 0) return feature
  return { ...feature, position: { ...feature.position, y: feature.position.y - neededDrop } }
}

/**
 * Builds the production Cave V2 topology for `input.site`, or `null` if no
 * reasonable route fits under the local terrain (the site is rejected
 * outright rather than forced above the surface — plan §8).
 *
 * @domain world-terrain
 */
export function buildProductionCaveTopology(input: ProductionTopologyInput): CaveTopology | null {
  const { seed, site, sampleHeight, sampleBaseHeight } = input
  const caveId = makeCaveId(seed, site)
  const structureRandom = createCaveRandom(caveId, CAVE_RNG_SALT.structure)
  const featureRandom = createCaveRandom(caveId, CAVE_RNG_SALT.feature)
  const centerlineRandom = createCaveRandom(caveId, CAVE_RNG_SALT.centerline)
  const branchRandom = createCaveRandom(caveId, CAVE_RNG_SALT.branch)

  const into = tunnelDirection(site.yaw)
  const perp = { dx: -into.dz, dz: into.dx }

  const mouthFloorY = sampleHeight(site.x, site.z) - CAVE_MOUTH_DEPTH
  const entrance: CaveEntrance = { x: site.x, y: mouthFloorY, z: site.z, yaw: site.yaw, width: LARGE_CAVE_MOUTH_WIDTH, height: ENTRANCE_HEIGHT }
  const entrancePoint: CaveTopologyPoint = { x: entrance.x, y: mouthFloorY, z: entrance.z }

  const transitionLength = 3.5 + structureRandom() * 1
  const passageLength = 6 + structureRandom() * 2
  const bendLength = 5 + structureRandom() * 1.5
  const chamberOffsetLength = 6 + structureRandom() * 2

  const bendSign = structureRandom() < 0.5 ? -1 : 1
  const bendAngle = bendSign * ((16 + structureRandom() * 20) * Math.PI) / 180
  const bendDir = rotateXZ(into.dx, into.dz, bendAngle)
  const chamberDir = rotateXZ(bendDir.dx, bendDir.dz, bendAngle * 0.35)

  const transitionWidth = pick(PASSAGE_WIDTH, structureRandom())
  const transitionHeight = pick(PASSAGE_HEIGHT, structureRandom())
  const passageWidth = pick(PASSAGE_WIDTH, structureRandom())
  const passageHeight = pick(PASSAGE_HEIGHT, structureRandom())
  const bendWidth = pick(WIDENING_WIDTH, structureRandom())
  const bendHeight = pick(WIDENING_HEIGHT, structureRandom())
  const chamberWidth = pick(CHAMBER_WIDTH, structureRandom())
  const chamberHeight = pick(CHAMBER_HEIGHT, structureRandom())

  const transitionXZ = { x: entrance.x + into.dx * transitionLength, z: entrance.z + into.dz * transitionLength }
  const passageXZ = { x: transitionXZ.x + into.dx * passageLength, z: transitionXZ.z + into.dz * passageLength }
  const bendXZ = { x: passageXZ.x + bendDir.dx * bendLength, z: passageXZ.z + bendDir.dz * bendLength }
  const chamberXZ = { x: bendXZ.x + chamberDir.dx * chamberOffsetLength, z: bendXZ.z + chamberDir.dz * chamberOffsetLength }

  const cursor: Cursor = { x: entrance.x, y: mouthFloorY, z: entrance.z, rejected: false }

  const seg1 = walkSegment(cursor, mouthFloorY, entrance, sampleBaseHeight, entrance.width, entrance.height, transitionXZ, transitionWidth, transitionHeight, [])
  if (cursor.rejected) return null
  const transitionPoint = seg1.toPoint

  const passageInterior = irregularXZ(transitionXZ, passageXZ, perp.dx, perp.dz, 2, centerlineRandom)
  const seg2 = walkSegment(cursor, mouthFloorY, entrance, sampleBaseHeight, transitionWidth, transitionHeight, passageXZ, passageWidth, passageHeight, passageInterior)
  if (cursor.rejected) return null
  const passagePoint = seg2.toPoint

  const seg3 = walkSegment(cursor, mouthFloorY, entrance, sampleBaseHeight, passageWidth, passageHeight, bendXZ, bendWidth, bendHeight, [])
  if (cursor.rejected) return null
  const bendPoint = seg3.toPoint
  const bendCursorSnapshot: Cursor = { ...cursor }

  const seg4 = walkSegment(cursor, mouthFloorY, entrance, sampleBaseHeight, bendWidth, bendHeight, chamberXZ, chamberWidth, chamberHeight, [])
  if (cursor.rejected) return null
  const chamberPoint = seg4.toPoint

  const nodes: CaveTopologyNode[] = [
    { id: 'entrance', kind: 'entrance', position: entrancePoint, targetWidth: entrance.width, targetHeight: entrance.height },
    { id: 'transition', kind: 'passage', position: transitionPoint, targetWidth: transitionWidth, targetHeight: transitionHeight },
    { id: 'passage', kind: 'passage', position: passagePoint, targetWidth: passageWidth, targetHeight: passageHeight },
    { id: 'widening-bend', kind: 'widening', position: bendPoint, targetWidth: bendWidth, targetHeight: bendHeight },
    { id: 'chamber', kind: 'chamber', position: chamberPoint, targetWidth: chamberWidth, targetHeight: chamberHeight },
  ]

  const segments: CaveTopologySegment[] = [
    { id: 'seg-transition', from: 'entrance', to: 'transition', centerline: [entrancePoint, transitionPoint] },
    { id: 'seg-passage', from: 'transition', to: 'passage', centerline: [transitionPoint, ...seg2.interiorPoints, passagePoint] },
    { id: 'seg-bend', from: 'passage', to: 'widening-bend', centerline: [passagePoint, bendPoint] },
    { id: 'seg-chamber', from: 'widening-bend', to: 'chamber', centerline: [bendPoint, chamberPoint] },
  ]

  const wantsShelf = featureRandom() < 0.5
  const featureOffset = rotateXZ(chamberDir.dx, chamberDir.dz, Math.PI / 2)
  const chamberRadius = chamberWidth / 2
  const feature = lowerFeatureIfNeeded(
    wantsShelf
      ? {
          id: 'chamber-shelf',
          kind: 'shelf',
          anchorNodeId: 'chamber',
          position: {
            x: chamberPoint.x + featureOffset.dx * chamberRadius * 0.55,
            y: chamberPoint.y + chamberHeight * 0.35,
            z: chamberPoint.z + featureOffset.dz * chamberRadius * 0.55,
          },
          size: { width: 2.6 + featureRandom() * 1.2, height: 0.4 + featureRandom() * 0.5, depth: 1.8 + featureRandom() * 0.8 },
        }
      : {
          id: 'chamber-overhang',
          kind: 'overhang',
          anchorNodeId: 'chamber',
          position: {
            x: chamberPoint.x - featureOffset.dx * chamberRadius * 0.4,
            y: chamberPoint.y + chamberHeight * 0.68,
            z: chamberPoint.z - featureOffset.dz * chamberRadius * 0.4,
          },
          size: { width: 3.0 + featureRandom() * 1.2, height: 1.0 + featureRandom() * 0.6, depth: 2.0 + featureRandom() * 0.8 },
        },
    entrance,
    sampleBaseHeight,
  )

  // Optional short branch (plan §7/§8: stress capability, never required for
  // L1). Dropped silently — never rejects the whole site — if it can't reach
  // a valid depth or would come close enough to the main route to risk an
  // accidental smooth-union bridge.
  if (branchRandom() < BRANCH_CHANCE) {
    const branchAngle = (branchRandom() < 0.5 ? -1 : 1) * ((45 + branchRandom() * 25) * Math.PI) / 180
    const branchDir = rotateXZ(bendDir.dx, bendDir.dz, branchAngle)
    const branchLength = 5 + branchRandom() * 3
    const branchWidth = pick(PASSAGE_WIDTH, branchRandom())
    const branchHeight = pick(PASSAGE_HEIGHT, branchRandom())
    const branchXZ = { x: bendPoint.x + branchDir.dx * branchLength, z: bendPoint.z + branchDir.dz * branchLength }

    const branchCursor: Cursor = { ...bendCursorSnapshot }
    const branchWalk = walkSegment(branchCursor, mouthFloorY, entrance, sampleBaseHeight, bendWidth, bendHeight, branchXZ, branchWidth, branchHeight, [])
    if (!branchCursor.rejected) {
      const branchPoint = branchWalk.toPoint
      const mainStations: RadialStation[] = [
        { x: entrancePoint.x, z: entrancePoint.z, radius: entrance.width / 2 },
        { x: transitionPoint.x, z: transitionPoint.z, radius: transitionWidth / 2 },
        ...seg2.interiorPoints.map((p, i) => ({
          x: p.x,
          z: p.z,
          radius: (transitionWidth + (passageWidth - transitionWidth) * ((i + 1) / 3)) / 2,
        })),
        { x: passagePoint.x, z: passagePoint.z, radius: passageWidth / 2 },
        { x: bendPoint.x, z: bendPoint.z, radius: bendWidth / 2 },
        { x: chamberPoint.x, z: chamberPoint.z, radius: chamberWidth / 2 },
      ]
      const branchStations: RadialStation[] = [
        { x: bendPoint.x, z: bendPoint.z, radius: bendWidth / 2 },
        { x: branchPoint.x, z: branchPoint.z, radius: branchWidth / 2 },
      ]
      const minGap = minGapBetweenPaths(mainStations, branchStations, bendPoint, bendWidth / 2 + 1)
      if (minGap >= MIN_DISCONNECTED_CLEARANCE) {
        nodes.push({ id: 'branch-chamber', kind: 'chamber', position: branchPoint, targetWidth: branchWidth, targetHeight: branchHeight })
        segments.push({ id: 'seg-branch', from: 'widening-bend', to: 'branch-chamber', centerline: [bendPoint, branchPoint] })
      }
    }
  }

  return {
    caveId,
    seed,
    entrance,
    nodes,
    segments,
    features: [feature],
    minClearance: 2.4,
  }
}
