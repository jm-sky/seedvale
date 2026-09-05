/** Plan world-terrain-008 §8 — the one shared deterministic test cave both
 *  spikes render: entrance -> wide transition -> irregular descending
 *  passage -> local widening/bend -> main chamber -> shelf|overhang, ~20-30 m
 *  route length. Anchored at `entrance` (an already-accepted V1 entrance —
 *  the carved mouth recess floor, never `sampleHeight`) so both variants sit
 *  at real terrain with the real mouth carve.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type {
  CaveTopology,
  CaveTopologyFeature,
  CaveTopologyNode,
  CaveTopologyPoint,
  CaveTopologySegment,
} from './caveTopology'
import type { SurfaceHeightSampler } from './clipBelowSurface'
import { MIN_OVERBURDEN, MOUTH_FOOTPRINT_MARGIN, MOUTH_ROOF_MIN } from '../caveGenerator'
import { createSeededRandom } from '../parseSeed'
import { PROXY_MARGIN } from './topologyAdapter'

// Distinct per-purpose RNG streams (never one shared stream consumed in a
// call-order-dependent way — toggling detail must not change structure).
const FEATURE_SEED_OFFSET = 0xca5ef1a7
const CENTERLINE_SEED_OFFSET = 0xc3702171

/** Horizontal distance from the mouth within which the leading section is
 *  held to `MOUTH_ROOF_MIN` instead of the full `MIN_OVERBURDEN` — the
 *  topology's own first segment, mirroring `caveGenerator.ts`'s
 *  `OVERBURDEN_MOUTH_SKIP` allowance for V1's leading tunnel section. */
const MOUTH_TRANSITION_RANGE = 4
/** Metres between overburden probes along the route. */
const OVERBURDEN_PROBE_STEP = 0.5
/** Slack added on top of the required overburden, covering the gap between
 *  the probe pattern below and an arbitrarily dense check of the same
 *  envelope. */
const OVERBURDEN_SAFETY = 0.2

function tunnelDirection(yaw: number): { dx: number, dz: number } {
  return { dx: -Math.sin(yaw), dz: -Math.cos(yaw) }
}

function rotateXZ(dx: number, dz: number, angle: number): { dx: number, dz: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { dx: dx * cos - dz * sin, dz: dx * sin + dz * cos }
}

function lerpPoint(a: CaveTopologyPoint, b: CaveTopologyPoint, t: number): CaveTopologyPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
}

export type SpikeTestCaveOptions = {
  /** Adds a short side branch off the widening/bend node — an optional
   *  controlled junction stress test (plan §8/§9), never required for L1. */
  includeBranch?: boolean
  /** Deterministic analytic surface height (`ChunkManager.sampleBaseHeight`).
   *  When given, the interior is sunk far enough under the local terrain
   *  profile to keep the required overburden over its whole footprint — see
   *  `sinkUnderTerrain`. Without it the topology is terrain-blind and its
   *  ceiling can stand above the meadow. */
  surfaceHeightAt?: SurfaceHeightSampler
}

/** Lowest surface height over the walkable footprint around `(x, z)` — the
 *  full cross-section, not just the centerline: a corridor crossing a slope
 *  breaks out on its downhill flank long before its centerline does. */
function minSurfaceOverFootprint(
  surfaceHeightAt: SurfaceHeightSampler,
  x: number,
  z: number,
  radius: number,
): number {
  let lowest = surfaceHeightAt(x, z)
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    for (const f of [0.4, 0.7, 1]) {
      lowest = Math.min(lowest, surfaceHeightAt(x + dx * radius * f, z + dz * radius * f))
    }
  }
  return lowest
}

/** Radius around the entrance that *is* the opening and so is legitimately
 *  roofless — the entrance node's own walkable footprint as
 *  `topologyToCaveDefinition` inflates it, plus V1's own lip past the carved
 *  recess (`MOUTH_FOOTPRINT_MARGIN - MOUTH_RADIUS`). V1 exempts its whole
 *  mouth node the same way. */
function mouthOpeningRadius(entrance: CaveEntrance): number {
  return Math.max(MOUTH_FOOTPRINT_MARGIN, entrance.width / 2 + PROXY_MARGIN + 0.35)
}

/**
 * Required clearance between the local surface and the cave ceiling at
 * `distanceFromMouth`, following V1's own mouth contract: the opening is
 * legitimately roofless, the leading section keeps a thin but positive roof,
 * everything past it keeps the full overburden. `null` = exempt.
 *
 * @domain world-terrain
 */
export function spikeOverburdenRequirement(entrance: CaveEntrance, distanceFromMouth: number): number | null {
  if (distanceFromMouth < mouthOpeningRadius(entrance)) return null
  return distanceFromMouth < MOUTH_TRANSITION_RANGE ? MOUTH_ROOF_MIN : MIN_OVERBURDEN
}

/**
 * Returns how much the whole interior has to sink so that no part of its
 * envelope — ceiling *and* the walkable cross-section around the centerline —
 * comes closer to the surface than `spikeOverburdenRequirement` allows.
 *
 * A single uniform drop, not a per-node clamp: it preserves the test cave's
 * intended shape exactly (the comparison input stays the same for both
 * spikes) while guaranteeing the invariant along the entire route. The
 * entrance node itself is exempt — it *is* the opening.
 */
function sinkUnderTerrain(topology: CaveTopology, surfaceHeightAt: SurfaceHeightSampler): number {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const entrance = topology.entrance
  const distanceFromMouth = (x: number, z: number): number => Math.hypot(x - entrance.x, z - entrance.z)

  let deficit = 0
  const consider = (x: number, y: number, z: number, height: number, radius: number): void => {
    const required = spikeOverburdenRequirement(entrance, distanceFromMouth(x, z))
    if (required === null) return
    const allowedCeiling = minSurfaceOverFootprint(surfaceHeightAt, x, z, radius) - required - OVERBURDEN_SAFETY
    deficit = Math.max(deficit, y + height - allowedCeiling)
  }

  for (const seg of topology.segments) {
    const from = nodeById.get(seg.from)
    const to = nodeById.get(seg.to)
    if (!from || !to) continue
    const pts = seg.centerline
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const span = Math.hypot(b.x - a.x, b.z - a.z)
      const steps = Math.max(1, Math.round(span / OVERBURDEN_PROBE_STEP))
      for (let s = 0; s <= steps; s++) {
        const local = s / steps
        const global = (i + local) / (pts.length - 1)
        const width = from.targetWidth + (to.targetWidth - from.targetWidth) * global
        const height = from.targetHeight + (to.targetHeight - from.targetHeight) * global
        consider(
          a.x + (b.x - a.x) * local,
          a.y + (b.y - a.y) * local,
          a.z + (b.z - a.z) * local,
          height,
          width / 2 + PROXY_MARGIN,
        )
      }
    }
  }
  for (const f of topology.features) {
    consider(f.position.x, f.position.y - f.size.height / 2, f.position.z, f.size.height, Math.max(f.size.width, f.size.depth) / 2)
  }
  return Math.max(0, deficit)
}

/** Applies `sinkUnderTerrain`'s drop to everything except the entrance node
 *  and the centerline point that coincides with it. */
function lowerInterior(topology: CaveTopology, drop: number): CaveTopology {
  if (drop <= 0) return topology
  const sink = (p: CaveTopologyPoint): CaveTopologyPoint => ({ x: p.x, y: p.y - drop, z: p.z })
  return {
    ...topology,
    nodes: topology.nodes.map((n) => (n.kind === 'entrance' ? n : { ...n, position: sink(n.position) })),
    segments: topology.segments.map((s) => ({
      ...s,
      centerline: s.centerline.map((p, i) => (s.from === 'entrance' && i === 0 ? p : sink(p))),
    })),
    features: topology.features.map((f) => ({ ...f, position: sink(f.position) })),
  }
}

/**
 * Builds the shared Milestone A test cave for `entrance` and `seed`.
 * Deterministic: identical inputs produce a structurally and numerically
 * identical topology (`caveTopology.test.ts` asserts this with `toEqual`).
 *
 * With `options.surfaceHeightAt` the interior is additionally sunk under the
 * local terrain profile so its whole cross-section keeps V1's overburden
 * contract along the entire route, not only at the entrance
 * (`sinkUnderTerrain`).
 *
 * @domain world-terrain
 */
export function buildSpikeTestTopology(
  seed: number,
  entrance: CaveEntrance,
  options: SpikeTestCaveOptions = {},
): CaveTopology {
  const featureRandom = createSeededRandom((seed ^ FEATURE_SEED_OFFSET) >>> 0)
  const centerlineRandom = createSeededRandom((seed ^ CENTERLINE_SEED_OFFSET) >>> 0)

  const into = tunnelDirection(entrance.yaw)
  const perp = { dx: -into.dz, dz: into.dx }

  const entrancePos: CaveTopologyPoint = { x: entrance.x, y: entrance.y, z: entrance.z }

  const wideTransitionPos: CaveTopologyPoint = {
    x: entrancePos.x + into.dx * 4,
    y: entrancePos.y - 0.3,
    z: entrancePos.z + into.dz * 4,
  }

  const passagePos: CaveTopologyPoint = {
    x: wideTransitionPos.x + into.dx * 6,
    y: wideTransitionPos.y - 1.4,
    z: wideTransitionPos.z + into.dz * 6,
  }

  const bendAngle = (22 * Math.PI) / 180
  const bendDir = rotateXZ(into.dx, into.dz, bendAngle)
  const wideningBendPos: CaveTopologyPoint = {
    x: passagePos.x + bendDir.dx * 6,
    y: passagePos.y - 1.0,
    z: passagePos.z + bendDir.dz * 6,
  }

  const chamberDir = rotateXZ(bendDir.dx, bendDir.dz, bendAngle * 0.4)
  const chamberPos: CaveTopologyPoint = {
    x: wideningBendPos.x + chamberDir.dx * 8,
    y: wideningBendPos.y - 1.0,
    z: wideningBendPos.z + chamberDir.dz * 8,
  }

  const nodes: CaveTopologyNode[] = [
    { id: 'entrance', kind: 'entrance', position: entrancePos, targetWidth: entrance.width, targetHeight: entrance.height },
    { id: 'wide-transition', kind: 'widening', position: wideTransitionPos, targetWidth: 4.4, targetHeight: 3.0 },
    { id: 'descending-passage', kind: 'passage', position: passagePos, targetWidth: 2.5, targetHeight: 2.4 },
    { id: 'widening-bend', kind: 'widening', position: wideningBendPos, targetWidth: 3.6, targetHeight: 2.8 },
    { id: 'main-chamber', kind: 'chamber', position: chamberPos, targetWidth: 6.5, targetHeight: 4.4 },
  ]

  const straightCenterline = (from: CaveTopologyPoint, to: CaveTopologyPoint): CaveTopologyPoint[] => [from, to]

  const irregularCenterline = (
    from: CaveTopologyPoint,
    to: CaveTopologyPoint,
    perpDx: number,
    perpDz: number,
  ): CaveTopologyPoint[] => {
    const points: CaveTopologyPoint[] = [from]
    const steps = 3
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const base = lerpPoint(from, to, t)
      const wobble = (centerlineRandom() - 0.5) * 1.6
      points.push({ x: base.x + perpDx * wobble, y: base.y, z: base.z + perpDz * wobble })
    }
    points.push(to)
    return points
  }

  const segments: CaveTopologySegment[] = [
    {
      id: 'seg-entrance-transition',
      from: 'entrance',
      to: 'wide-transition',
      centerline: straightCenterline(entrancePos, wideTransitionPos),
    },
    {
      id: 'seg-descending-passage',
      from: 'wide-transition',
      to: 'descending-passage',
      centerline: irregularCenterline(wideTransitionPos, passagePos, perp.dx, perp.dz),
    },
    {
      id: 'seg-widening-bend',
      from: 'descending-passage',
      to: 'widening-bend',
      centerline: straightCenterline(passagePos, wideningBendPos),
    },
    {
      id: 'seg-chamber',
      from: 'widening-bend',
      to: 'main-chamber',
      centerline: straightCenterline(wideningBendPos, chamberPos),
    },
  ]

  const wantsShelf = featureRandom() < 0.5
  const featureOffset = rotateXZ(chamberDir.dx, chamberDir.dz, Math.PI / 2)
  const feature: CaveTopologyFeature = wantsShelf
    ? {
        id: 'chamber-shelf',
        kind: 'shelf',
        anchorNodeId: 'main-chamber',
        position: {
          x: chamberPos.x + featureOffset.dx * 2.2,
          y: chamberPos.y + 1.4,
          z: chamberPos.z + featureOffset.dz * 2.2,
        },
        size: { width: 2.4, height: 0.4, depth: 1.8 },
      }
    : {
        id: 'chamber-overhang',
        kind: 'overhang',
        anchorNodeId: 'main-chamber',
        position: {
          x: chamberPos.x - featureOffset.dx * 1.6,
          y: chamberPos.y + 2.6,
          z: chamberPos.z - featureOffset.dz * 1.6,
        },
        size: { width: 3.0, height: 1.1, depth: 2.2 },
      }

  if (options.includeBranch) {
    const branchAngle = (55 * Math.PI) / 180
    const branchDir = rotateXZ(bendDir.dx, bendDir.dz, -branchAngle)
    const branchPos: CaveTopologyPoint = {
      x: wideningBendPos.x + branchDir.dx * 5.5,
      y: wideningBendPos.y - 0.4,
      z: wideningBendPos.z + branchDir.dz * 5.5,
    }
    nodes.push({ id: 'branch-chamber', kind: 'chamber', position: branchPos, targetWidth: 3.2, targetHeight: 2.6 })
    segments.push({
      id: 'seg-branch',
      from: 'widening-bend',
      to: 'branch-chamber',
      centerline: straightCenterline(wideningBendPos, branchPos),
    })
  }

  const topology: CaveTopology = {
    caveId: `spike:${seed}:${entrance.x.toFixed(2)}:${entrance.z.toFixed(2)}`,
    seed,
    entrance,
    nodes,
    segments,
    features: [feature],
    minClearance: 2.1,
  }

  return options.surfaceHeightAt
    ? lowerInterior(topology, sinkUnderTerrain(topology, options.surfaceHeightAt))
    : topology
}
