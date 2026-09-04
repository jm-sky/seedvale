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
import { createSeededRandom } from '../parseSeed'

// Distinct per-purpose RNG streams (never one shared stream consumed in a
// call-order-dependent way — toggling detail must not change structure).
const FEATURE_SEED_OFFSET = 0xca5ef1a7
const CENTERLINE_SEED_OFFSET = 0xc3702171

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
}

/**
 * Builds the shared Milestone A test cave for `entrance` and `seed`.
 * Deterministic: identical inputs produce a structurally and numerically
 * identical topology (`caveTopology.test.ts` asserts this with `toEqual`).
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

  return {
    caveId: `spike:${seed}:${entrance.x.toFixed(2)}:${entrance.z.toFixed(2)}`,
    seed,
    entrance,
    nodes,
    segments,
    features: [feature],
    minClearance: 2.1,
  }
}
