/** Plan world-terrain-008 Milestone B1 — the pure `CaveTopology ->
 *  CaveSpatialRepresentation` boundary the plan's architecture calls for.
 *  Owns everything about the SDF *field* — primitive placement, the smooth
 *  union, feature subtraction, bounds — with no Three.js import and no
 *  presentation concern (grid sampling, mesh extraction, materials all stay
 *  in `sdfCaveMesh.ts`).
 *
 *  Consumes `topology.segments` directly and generically: primitives are
 *  placed per-segment along each segment's own centerline, so a branch (or
 *  any other graph shape future milestones add) needs no second hardcoded
 *  chain — see implementation notes §5 "Hard-coded MAIN_CHAIN blocks future
 *  topology". `placePrimitivesAlongPath` resamples by true arc length, so
 *  primitive density depends only on `params.primitiveSpacing`, never on how
 *  many control points a segment's centerline happens to carry (production
 *  topology's terrain-adaptive centerlines are denser than the Milestone-A
 *  spike's).
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { CaveTopology, CaveTopologySegment } from './caveTopology'
import {
  type CaveMouthGeometry,
  deriveMouthGeometry,
  MOUTH_INTERIOR_ALONG,
  mouthAlong,
  mouthApertureVoidSDF,
  mouthFrameSolidSDF,
  mouthLateral,
} from './mouthCarve'
import { createMultiScaleNoise1D, type NoiseOctave } from './spikeNoise'

export type SdfCaveParams = {
  /** World-units per SDF grid cell. Smaller = finer surface, cubically more
   *  samples. */
  cellSize: number
  /** Polynomial smooth-union blend radius (metres) between neighbouring void
   *  primitives — too large re-creates the "soft rubber tube" failure mode
   *  the plan warns about. Also the safe-separation baseline
   *  `productionTopology.ts`'s `MIN_DISCONNECTED_CLEARANCE` guards against. */
  smoothK: number
  /** Spacing (metres) between void primitives placed along each segment's
   *  centerline. */
  primitiveSpacing: number
  detail: { micro: NoiseOctave, medium: NoiseOctave }
}

export const DEFAULT_SDF_PARAMS: SdfCaveParams = {
  cellSize: 0.4,
  smoothK: 0.9,
  primitiveSpacing: 0.8,
  detail: {
    micro: { cellSize: 0.5, amplitude: 0.08 },
    medium: { cellSize: 1.8, amplitude: 0.22 },
  },
}

export type Bounds = { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }

/** A cave-local, bounded scalar field: negative inside the void, positive in
 *  rock. Pure data + a pure sampling function — never a scene object, never
 *  cached geometry. */
export type CaveSdfSpatialRepresentation = {
  bounds: Bounds
  sample: (x: number, y: number, z: number) => number
}

export type VoidPrimitive = { cx: number, cy: number, cz: number, rx: number, ry: number, rz: number }
export type FeatureBox = { cx: number, cy: number, cz: number, hx: number, hy: number, hz: number }
export type PathStation = { x: number, y: number, z: number, width: number, height: number }

export function ellipsoidSDF(x: number, y: number, z: number, p: VoidPrimitive): number {
  const dx = (x - p.cx) / p.rx
  const dy = (y - p.cy) / p.ry
  const dz = (z - p.cz) / p.rz
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const scale = Math.min(p.rx, p.ry, p.rz)
  return (len - 1) * scale
}

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/** Smooth-union k for the doorway sleeve — smaller than passage `smoothK`
 *  so the opening stays a readable aperture rather than a melted blob. */
const MOUTH_APERTURE_SMOOTH_K = 0.35

/**
 * Closes the outward half of the entrance ellipsoid, punches the doorway
 * sleeve, then adds rock sides/hood/lip. The aperture exists in the field
 * before Surface Nets; presentation clip only drops the sleeve's outer cap.
 *
 * @domain world-terrain
 */
export function applyMouthGeometryToField(
  sample: (x: number, y: number, z: number) => number,
  entrance: CaveEntrance,
  mouth: CaveMouthGeometry = deriveMouthGeometry(entrance),
): (x: number, y: number, z: number) => number {
  const influence = mouth.frameOutward + mouth.apertureHalfWidth + mouth.frameThickness + 1.5
  const influenceSq = influence * influence
  return (x, y, z) => {
    let d = sample(x, y, z)
    const dx = x - entrance.x
    const dz = z - entrance.z
    if (dx * dx + dz * dz > influenceSq) return d
    const along = mouthAlong(x, z, entrance)
    // Doorway CSG is strictly the outward opening. Interior floor/walls stay
    // the production ellipsoid chain (B3 floor-continuity).
    if (along <= MOUTH_INTERIOR_ALONG) return d
    const lateral = mouthLateral(x, z, entrance)
    const yHill = y + along * 0.3
    d = Math.max(d, along - MOUTH_INTERIOR_ALONG)
    d = smin(d, mouthApertureVoidSDF(along, yHill, lateral, mouth), MOUTH_APERTURE_SMOOTH_K)
    d = Math.max(d, -mouthFrameSolidSDF(along, yHill, lateral, mouth))
    return d
  }
}

export function boxSDF(x: number, y: number, z: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): number {
  const qx = Math.abs(x - cx) - hx
  const qy = Math.abs(y - cy) - hy
  const qz = Math.abs(z - cz) - hz
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  const oz = Math.max(qz, 0)
  const outside = Math.sqrt(ox * ox + oy * oy + oz * oz)
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0)
  return outside + inside
}

/**
 * Resamples a path (already-ordered stations, any density) at fixed arc
 * length `spacing`, one primitive per sample. Decoupled from input point
 * density on purpose: production topology centerlines carry far more
 * control points than the Milestone-A spike (terrain-adaptive stations, not
 * a handful of shape keyframes), and primitive count must depend only on
 * `spacing`, not on that.
 *
 * @domain world-terrain
 */
export function placePrimitivesAlongPath(points: readonly PathStation[], spacing: number): VoidPrimitive[] {
  if (points.length === 0) return []
  const out: VoidPrimitive[] = []
  const pushAt = (p: PathStation): void => {
    out.push({ cx: p.x, cy: p.y + p.height * 0.5, cz: p.z, rx: p.width / 2, ry: p.height / 2, rz: p.width / 2 })
  }
  pushAt(points[0]!)
  let distSinceLast = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const segLen = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (segLen <= 1e-9) continue
    let traveled = 0
    while (distSinceLast + (segLen - traveled) >= spacing) {
      const need = spacing - distSinceLast
      traveled += need
      const t = traveled / segLen
      pushAt({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        width: a.width + (b.width - a.width) * t,
        height: a.height + (b.height - a.height) * t,
      })
      distSinceLast = 0
    }
    distSinceLast += segLen - traveled
  }
  return out
}

function segmentStations(topology: CaveTopology, seg: CaveTopologySegment): PathStation[] {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const fromNode = nodeById.get(seg.from)
  const toNode = nodeById.get(seg.to)
  if (!fromNode || !toNode) throw new Error(`caveSdfField: unknown node in segment ${seg.id}`)
  const pts = seg.centerline
  const fromY = fromNode.position.y
  const toY = toNode.position.y
  const drop = fromY - toY
  return pts.map((p, i) => {
    const tIndex = pts.length > 1 ? i / (pts.length - 1) : 0
    const tShape = drop > 1e-6
      ? Math.min(1, Math.max(0, (fromY - p.y) / drop))
      : tIndex
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      width: fromNode.targetWidth + (toNode.targetWidth - fromNode.targetWidth) * tShape,
      height: fromNode.targetHeight + (toNode.targetHeight - fromNode.targetHeight) * tShape,
    }
  })
}

function featureBoxesFromTopology(topology: CaveTopology): FeatureBox[] {
  return topology.features.map((f) => ({
    cx: f.position.x,
    cy: f.position.y,
    cz: f.position.z,
    hx: f.size.width / 2,
    hy: f.size.height / 2,
    hz: f.size.depth / 2,
  }))
}

function computeTopologyBounds(topology: CaveTopology, margin: number): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const expand = (x: number, y: number, z: number, r: number): void => {
    minX = Math.min(minX, x - r)
    maxX = Math.max(maxX, x + r)
    minY = Math.min(minY, y - r)
    maxY = Math.max(maxY, y + r * 1.6)
    minZ = Math.min(minZ, z - r)
    maxZ = Math.max(maxZ, z + r)
  }
  for (const n of topology.nodes) expand(n.position.x, n.position.y, n.position.z, Math.max(n.targetWidth, n.targetHeight))
  for (const seg of topology.segments) for (const p of seg.centerline) expand(p.x, p.y, p.z, 2)
  for (const f of topology.features) {
    expand(f.position.x, f.position.y, f.position.z, Math.max(f.size.width, f.size.height, f.size.depth))
  }
  return { minX: minX - margin, maxX: maxX + margin, minY: minY - margin, maxY: maxY + margin, minZ: minZ - margin, maxZ: maxZ + margin }
}

/** Deterministic 32-bit hash of a cave's own id, used only to seed this
 *  cave's own surface-detail noise streams — keyed by `caveId` (not the bare
 *  world seed) so detail texture is independent per cave, same reasoning as
 *  `caveRng.ts`. */
function hashCaveId(caveId: string): number {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < caveId.length; i++) h = Math.imul(h ^ caveId.charCodeAt(i), 0x01000193) >>> 0
  return h >>> 0
}

export function buildVoidField(
  primitives: readonly VoidPrimitive[],
  features: readonly FeatureBox[],
  smoothK: number,
  noise: { x: (s: number) => number, y: (s: number) => number, z: (s: number) => number } | null,
): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    let d = Infinity
    for (const p of primitives) {
      const pd = ellipsoidSDF(x, y, z, p)
      d = d === Infinity ? pd : smin(d, pd, smoothK)
    }
    for (const f of features) {
      const boxD = boxSDF(x, y, z, f.cx, f.cy, f.cz, f.hx, f.hy, f.hz)
      d = Math.max(d, -boxD)
    }
    if (noise) {
      d += noise.x(x) * 0.34 + noise.y(y) * 0.34 + noise.z(z) * 0.32
    }
    return d
  }
}

/**
 * Builds the production SDF spatial representation for `topology`: bounds
 * plus a pure `sample(x, y, z)` field. Mouth aperture and rock frame are
 * applied here (`applyMouthGeometryToField`) so Surface Nets extracts a
 * doorway rather than a closed ellipsoid. No grid sampling, no mesh
 * extraction — see `sdfCaveMesh.ts` for the derived presentation.
 *
 * @domain world-terrain
 */
export function buildCaveSdfRepresentation(
  topology: CaveTopology,
  params: SdfCaveParams = DEFAULT_SDF_PARAMS,
  detailEnabled = true,
): CaveSdfSpatialRepresentation {
  const seedBase = hashCaveId(topology.caveId)
  const noise = detailEnabled
    ? {
        x: createMultiScaleNoise1D(seedBase ^ 0x11223344, [params.detail.micro, params.detail.medium]),
        y: createMultiScaleNoise1D(seedBase ^ 0x22334455, [params.detail.micro, params.detail.medium]),
        z: createMultiScaleNoise1D(seedBase ^ 0x33445566, [params.detail.micro, params.detail.medium]),
      }
    : null

  const primitives = topology.segments.flatMap((seg) => placePrimitivesAlongPath(segmentStations(topology, seg), params.primitiveSpacing))
  const features = featureBoxesFromTopology(topology)
  const interior = buildVoidField(primitives, features, params.smoothK, noise)
  const sample = applyMouthGeometryToField(interior, topology.entrance)
  const bounds = computeTopologyBounds(topology, params.cellSize * 2)

  return { bounds, sample }
}
