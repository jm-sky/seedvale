/** Generic XZ candidate-generation and footprint-clearance geometry shared
 *  by cave content placement (`caveContentAnchors.ts`, plan world-terrain-020
 *  Stage B) and generic interior rock clutter (`caveInteriorRocks.ts`, plan
 *  world-terrain-022). Pure geometry only — no anchor-role or rock
 *  size-class semantics live here, so this module stays reusable by both
 *  without coupling them to each other.
 *
 * @domain world-terrain
 */

import type { CaveTopology, CaveTopologyNode, CaveTopologySegment } from './caveTopology'
import { type CaveHeightfieldRepresentation, sampleHeightfieldAt } from './caveHeightfieldRepresentation'
import { rotateXZ } from './caveRoute'

export type Xz = { x: number, z: number }
export type Heading = { dx: number, dz: number }

export function yawFacing(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

export function signFromRandom(random: () => number): 1 | -1 {
  return random() < 0.5 ? -1 : 1
}

export function incomingFromPoints(a: Xz, b: Xz): Heading {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  return { dx: dx / len, dz: dz / len }
}

/** Heading of the segment feeding into `nodeId` (last centerline leg), or a
 *  direction from the cave entrance to the node when no incoming segment
 *  exists (e.g. the entrance node itself). */
export function incomingHeading(topology: CaveTopology, nodeId: string): Heading {
  const seg = topology.segments.find((s) => s.to === nodeId)
  if (!seg || seg.centerline.length < 2) {
    const node = topology.nodes.find((n) => n.id === nodeId)
    if (!node) return { dx: 0, dz: 1 }
    const dx = node.position.x - topology.entrance.x
    const dz = node.position.z - topology.entrance.z
    const len = Math.hypot(dx, dz) || 1
    return { dx: dx / len, dz: dz / len }
  }
  const a = seg.centerline[seg.centerline.length - 2]!
  const b = seg.centerline[seg.centerline.length - 1]!
  return incomingFromPoints(a, b)
}

/** Total centerline length (metres), summed leg-by-leg. */
export function segmentLength(seg: CaveTopologySegment): number {
  const pts = seg.centerline
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    total += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return total
}

export function pointAlongSegment(seg: CaveTopologySegment, t: number): { point: Xz, heading: Heading } {
  const pts = seg.centerline
  if (pts.length < 2) {
    const p = pts[0] ?? { x: 0, z: 0 }
    return { point: { x: p.x, z: p.z }, heading: { dx: 0, dz: 1 } }
  }
  let total = 0
  const lengths: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    lengths.push(len)
    total += len
  }
  if (total < 1e-6) {
    const p = pts[pts.length - 1]!
    return { point: { x: p.x, z: p.z }, heading: incomingFromPoints(pts[0]!, p) }
  }
  let remain = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < pts.length; i++) {
    const len = lengths[i - 1]!
    const a = pts[i - 1]!
    const b = pts[i]!
    if (remain <= len || i === pts.length - 1) {
      const u = len < 1e-6 ? 1 : remain / len
      return {
        point: { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u },
        heading: incomingFromPoints(a, b),
      }
    }
    remain -= len
  }
  const last = pts[pts.length - 1]!
  return { point: { x: last.x, z: last.z }, heading: incomingFromPoints(pts[pts.length - 2]!, last) }
}

/** Perpendicular distance from `(x,z)` to the line through `origin` along
 *  `heading` — used to keep placements off a through-route line. */
export function lateralDistance(x: number, z: number, origin: Xz, heading: Heading): number {
  const perpDx = -heading.dz
  const perpDz = heading.dx
  return Math.abs((x - origin.x) * perpDx + (z - origin.z) * perpDz)
}

/**
 * Bounded XZ alternatives around a node, off-centre first so a placement is
 * not dropped on the incoming bottleneck; the node centre itself is last.
 * Length is always <= `limit`. Shared shape used by both content-anchor
 * fitting (fixed limit) and interior-rock candidate generation (a larger,
 * volume-appropriate limit).
 *
 * @domain world-terrain
 */
export function chamberCandidates(
  node: CaveTopologyNode,
  incoming: Heading,
  preferredSign: 1 | -1,
  limit: number,
): Xz[] {
  const perp = { dx: -incoming.dz * preferredSign, dz: incoming.dx * preferredSign }
  const cx = node.position.x
  const cz = node.position.z
  const r = node.targetWidth * 0.28
  const dirs: Heading[] = [
    perp,
    { dx: -perp.dx, dz: -perp.dz },
    rotateXZ(perp.dx, perp.dz, 0.45),
    rotateXZ(perp.dx, perp.dz, -0.45),
    rotateXZ(-perp.dx, -perp.dz, 0.45),
    rotateXZ(-perp.dx, -perp.dz, -0.45),
    { dx: -incoming.dx, dz: -incoming.dz },
    incoming,
  ]
  const out: Xz[] = []
  const seen = new Set<string>()
  const push = (x: number, z: number): void => {
    const key = `${x.toFixed(3)},${z.toFixed(3)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ x, z })
  }
  for (const scale of [1, 0.72, 0.5]) {
    for (const d of dirs) {
      push(cx + d.dx * r * scale, cz + d.dz * r * scale)
      if (out.length >= limit - 1) {
        push(cx, cz)
        return out
      }
    }
  }
  push(cx, cz)
  return out
}

/**
 * Bounded wall-side alternatives along a passage centreline at parametric
 * `t`. Used for placements that should hug a wall rather than sit mid-route.
 *
 * @domain world-terrain
 */
export type PassageWallBias = 'default' | 'tight'

const PASSAGE_WALL_FRACTIONS: Record<PassageWallBias, readonly number[]> = {
  default: [0.42, 0.32, 0.52, 0.24, 0.18],
  /** Wall-hugging placements (cave torches) — stay off the walkable centreline. */
  tight: [0.58, 0.52, 0.65, 0.48, 0.4],
}

export function passageWallCandidates(
  seg: CaveTopologySegment,
  t: number,
  preferredSign: 1 | -1,
  halfWidth: number,
  limit: number,
  wallBias: PassageWallBias = 'default',
): { candidates: Xz[], along: Xz, heading: Heading } {
  const { point, heading } = pointAlongSegment(seg, t)
  const perp = { dx: -heading.dz * preferredSign, dz: heading.dx * preferredSign }
  const fractions = PASSAGE_WALL_FRACTIONS[wallBias]
  const out: Xz[] = []
  for (const f of fractions) {
    const o = halfWidth * f
    out.push({ x: point.x + perp.dx * o, z: point.z + perp.dz * o })
    out.push({ x: point.x - perp.dx * o, z: point.z - perp.dz * o })
    if (out.length >= limit) break
  }
  return { candidates: out.slice(0, limit), along: point, heading }
}

const RING_SAMPLES = 6
const RING_GAP_SCALE = 0.85

/**
 * Ring-sample footprint clearance: `footprintRadius` around `(x,z)` must
 * stay inside the heightfield grid and clear `minGap * RING_GAP_SCALE`
 * everywhere on the ring. Not a collider fit test — a cheap presentation
 * guard against obviously clipping into rock.
 *
 * @domain world-terrain
 */
export function footprintHolds(
  field: CaveHeightfieldRepresentation,
  x: number,
  z: number,
  footprintRadius: number,
  minGap: number,
): boolean {
  for (let i = 0; i < RING_SAMPLES; i++) {
    const a = (i / RING_SAMPLES) * Math.PI * 2
    const sample = sampleHeightfieldAt(field, x + Math.cos(a) * footprintRadius, z + Math.sin(a) * footprintRadius)
    if (sample.outsideGrid || sample.gap < minGap * RING_GAP_SCALE) return false
  }
  return true
}
