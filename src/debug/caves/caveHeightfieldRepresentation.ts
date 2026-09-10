/** Experimental cave heightfield spike — 2.5D spatial representation.
 *  One floor and one ceiling per `(x, z)`. Not a production Cave V2 path
 *  and not a return to Generalized Sweep ring construction.
 *
 * @domain world-terrain
 */

import type { CaveTopology, CaveTopologyPoint, CaveTopologySegment } from '../../world/caves/caveTopology'
import type { CaveEntrance } from '../../world/caveVolume'
import { mouthAlong, mouthLateral } from '../../world/caves/mouthCarve'
import { type NoiseOctave } from '../../world/caves/spikeNoise'

export type CaveHeightfieldConfig = {
  cellSize: number
  centerlineSpacing: number
  floorDetail: NoiseOctave
  ceilingDetail: NoiseOctave
  boundaryNoise: NoiseOctave
}

export const DEFAULT_HEIGHTFIELD_CONFIG: CaveHeightfieldConfig = {
  cellSize: 0.4,
  centerlineSpacing: 0.5,
  floorDetail: { cellSize: 1.15, amplitude: 0.11 },
  ceilingDetail: { cellSize: 1.45, amplitude: 0.16 },
  boundaryNoise: { cellSize: 1.7, amplitude: 0.13 },
}

export type CaveHeightfieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Canonical 2D grid for the experimental heightfield spike. Indexed
 * row-major `iz * width + ix`. Outside cells are explicit in `inside`.
 *
 * @domain world-terrain
 */
export type CaveHeightfieldRepresentation = {
  bounds: CaveHeightfieldBounds
  originX: number
  originZ: number
  cellSize: number
  width: number
  depth: number
  inside: Uint8Array
  openSky: Uint8Array
  floorY: Float32Array
  ceilingY: Float32Array
  signedDistance: Float32Array
  minClearance: number
  entrance: CaveEntrance
  seed: number
}

export type HeightfieldStation = {
  x: number
  y: number
  z: number
  radius: number
  height: number
}

export type HeightfieldBoundaryEdge = {
  x0: number
  z0: number
  x1: number
  z1: number
  floorY0: number
  ceilingY0: number
  floorY1: number
  ceilingY1: number
  inwardX: number
  inwardZ: number
  insideIx: number
  insideIz: number
  outsideIx: number
  outsideIz: number
}

export type HeightfieldSample = {
  inside: boolean
  openSky: boolean
  floorY: number
  ceilingY: number
  signedDistance: number
}

export type CaveHeightfieldBuildResult = {
  representation: CaveHeightfieldRepresentation
  representationMs: number
  insideCellCount: number
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function hashCaveId(caveId: string): number {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < caveId.length; i++) h = Math.imul(h ^ caveId.charCodeAt(i), 0x01000193) >>> 0
  return h >>> 0
}

function hash2(seed: number, ix: number, iz: number): number {
  let h = seed >>> 0
  h = Math.imul(h ^ Math.imul(ix | 0, 0x27d4eb2d), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ Math.imul(iz | 0, 0x165667b1), 0xc2b2ae35) >>> 0
  return (h / 4294967296) * 2 - 1
}

function valueNoise2D(seed: number, cellSize: number, x: number, z: number): number {
  const fx = x / cellSize
  const fz = z / cellSize
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const tx = fx - ix
  const tz = fz - iz
  const sx = tx * tx * (3 - 2 * tx)
  const sz = tz * tz * (3 - 2 * tz)
  const n00 = hash2(seed, ix, iz)
  const n10 = hash2(seed, ix + 1, iz)
  const n01 = hash2(seed, ix, iz + 1)
  const n11 = hash2(seed, ix + 1, iz + 1)
  const nx0 = n00 + (n10 - n00) * sx
  const nx1 = n01 + (n11 - n01) * sx
  return nx0 + (nx1 - nx0) * sz
}

function distPointToSegmentXZ(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { dist: number, t: number } {
  const abx = bx - ax
  const abz = bz - az
  const lenSq = abx * abx + abz * abz
  if (lenSq <= 1e-12) {
    return { dist: Math.hypot(x - ax, z - az), t: 0 }
  }
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq))
  return { dist: Math.hypot(x - (ax + abx * t), z - (az + abz * t)), t }
}

/**
 * Resamples a topology segment centerline at fixed arc length so footprint
 * density does not follow raw control-point density.
 *
 * @domain world-terrain
 */
export function resampleSegmentStations(
  topology: CaveTopology,
  seg: CaveTopologySegment,
  spacing: number,
): HeightfieldStation[] {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const fromNode = nodeById.get(seg.from)
  const toNode = nodeById.get(seg.to)
  if (!fromNode || !toNode) throw new Error(`caveHeightfield: unknown node in segment ${seg.id}`)
  const pts = seg.centerline
  if (pts.length < 2) return []

  const lengths: number[] = [0]
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    lengths.push(total)
  }
  if (total <= 1e-9) {
    return [{
      x: pts[0]!.x,
      y: pts[0]!.y,
      z: pts[0]!.z,
      radius: fromNode.targetWidth / 2,
      height: fromNode.targetHeight,
    }]
  }

  const atArc = (s: number): HeightfieldStation => {
    const clamped = Math.max(0, Math.min(total, s))
    let i = 0
    while (i < pts.length - 2 && lengths[i + 1]! < clamped) i++
    const a = pts[i]!
    const b = pts[i + 1]!
    const span = lengths[i + 1]! - lengths[i]!
    const localT = span > 1e-9 ? (clamped - lengths[i]!) / span : 0
    const shapeT = clamped / total
    return {
      x: a.x + (b.x - a.x) * localT,
      y: a.y + (b.y - a.y) * localT,
      z: a.z + (b.z - a.z) * localT,
      radius: (fromNode.targetWidth + (toNode.targetWidth - fromNode.targetWidth) * shapeT) / 2,
      height: fromNode.targetHeight + (toNode.targetHeight - fromNode.targetHeight) * shapeT,
    }
  }

  const out: HeightfieldStation[] = [atArc(0)]
  const steps = Math.max(1, Math.round(total / spacing))
  for (let i = 1; i <= steps; i++) out.push(atArc((i / steps) * total))
  return out
}

function nodeStations(topology: CaveTopology): HeightfieldStation[] {
  return topology.nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    z: n.position.z,
    radius: n.targetWidth / 2,
    height: n.targetHeight,
  }))
}

function topologyBounds(topology: CaveTopology, margin: number): CaveHeightfieldBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const expand = (p: CaveTopologyPoint, r: number): void => {
    minX = Math.min(minX, p.x - r)
    maxX = Math.max(maxX, p.x + r)
    minZ = Math.min(minZ, p.z - r)
    maxZ = Math.max(maxZ, p.z + r)
  }
  for (const n of topology.nodes) expand(n.position, Math.max(n.targetWidth, 2) / 2 + margin)
  for (const seg of topology.segments) for (const p of seg.centerline) expand(p, 2 + margin)
  return { minX, maxX, minZ, maxZ }
}

function nearestCoverage(
  x: number,
  z: number,
  capsules: readonly { a: HeightfieldStation, b: HeightfieldStation }[],
  discs: readonly HeightfieldStation[],
): { sd: number, floorY: number, height: number } {
  let bestSd = Infinity
  let floorY = 0
  let height = 0
  for (const { a, b } of capsules) {
    const { dist, t } = distPointToSegmentXZ(x, z, a.x, a.z, b.x, b.z)
    const radius = a.radius + (b.radius - a.radius) * t
    const sd = dist - radius
    if (sd < bestSd) {
      bestSd = sd
      floorY = a.y + (b.y - a.y) * t
      height = a.height + (b.height - a.height) * t
    }
  }
  for (const d of discs) {
    const sd = Math.hypot(x - d.x, z - d.z) - d.radius
    if (sd < bestSd) {
      bestSd = sd
      floorY = d.y
      height = d.height
    }
  }
  return { sd: bestSd, floorY, height }
}

function isDoorwayOutwardEdge(
  entrance: CaveEntrance,
  midX: number,
  midZ: number,
  outsideX: number,
  outsideZ: number,
): boolean {
  const alongOut = mouthAlong(outsideX, outsideZ, entrance)
  const alongMid = mouthAlong(midX, midZ, entrance)
  if (alongOut <= alongMid) return false
  if (alongOut <= -0.15) return false
  return Math.abs(mouthLateral(midX, midZ, entrance)) < entrance.width * 0.55
}

function cellCenter(rep: Pick<CaveHeightfieldRepresentation, 'originX' | 'originZ' | 'cellSize'>, ix: number, iz: number): { x: number, z: number } {
  return {
    x: rep.originX + (ix + 0.5) * rep.cellSize,
    z: rep.originZ + (iz + 0.5) * rep.cellSize,
  }
}

function inGrid(rep: Pick<CaveHeightfieldRepresentation, 'width' | 'depth'>, ix: number, iz: number): boolean {
  return ix >= 0 && iz >= 0 && ix < rep.width && iz < rep.depth
}

function cellIndex(width: number, ix: number, iz: number): number {
  return iz * width + ix
}

/**
 * Builds the experimental heightfield representation from `topology`.
 * Deterministic for the same topology + config. Three.js-free.
 *
 * @domain world-terrain
 */
export function buildCaveHeightfieldRepresentation(
  topology: CaveTopology,
  config: CaveHeightfieldConfig = DEFAULT_HEIGHTFIELD_CONFIG,
): CaveHeightfieldBuildResult {
  const t0 = now()
  const seed = hashCaveId(topology.caveId) ^ (topology.seed >>> 0)
  const margin = Math.max(2.2, config.cellSize * 3)
  const rawBounds = topologyBounds(topology, margin)
  const originX = Math.floor(rawBounds.minX / config.cellSize) * config.cellSize
  const originZ = Math.floor(rawBounds.minZ / config.cellSize) * config.cellSize
  const width = Math.max(2, Math.ceil((rawBounds.maxX - originX) / config.cellSize) + 1)
  const depth = Math.max(2, Math.ceil((rawBounds.maxZ - originZ) / config.cellSize) + 1)
  const bounds: CaveHeightfieldBounds = {
    minX: originX,
    maxX: originX + width * config.cellSize,
    minZ: originZ,
    maxZ: originZ + depth * config.cellSize,
  }

  const capsules: { a: HeightfieldStation, b: HeightfieldStation }[] = []
  for (const seg of topology.segments) {
    const stations = resampleSegmentStations(topology, seg, config.centerlineSpacing)
    for (let i = 0; i < stations.length - 1; i++) capsules.push({ a: stations[i]!, b: stations[i + 1]! })
  }
  const discs = nodeStations(topology)

  const count = width * depth
  const inside = new Uint8Array(count)
  const openSky = new Uint8Array(count)
  const floorY = new Float32Array(count)
  const ceilingY = new Float32Array(count)
  const signedDistance = new Float32Array(count)

  const floorSeed = seed ^ 0x11111111
  const ceilSeed = seed ^ 0x22222222
  const boundarySeed = seed ^ 0x33333333
  const halfW = topology.entrance.width * 0.55

  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const x = originX + (ix + 0.5) * config.cellSize
      const z = originZ + (iz + 0.5) * config.cellSize
      const coverage = nearestCoverage(x, z, capsules, discs)
      const boundaryN = valueNoise2D(boundarySeed, config.boundaryNoise.cellSize, x, z) * config.boundaryNoise.amplitude
      const nearEdge = coverage.sd > -0.9 && coverage.sd < 0.9
      const sd = coverage.sd + (nearEdge ? boundaryN : 0)
      const i = cellIndex(width, ix, iz)
      signedDistance[i] = sd
      const isInside = sd < 0
      inside[i] = isInside ? 1 : 0
      const along = mouthAlong(x, z, topology.entrance)
      const lateral = mouthLateral(x, z, topology.entrance)
      openSky[i] = isInside && along > -0.45 && Math.abs(lateral) < halfW ? 1 : 0
      const floorN = valueNoise2D(floorSeed, config.floorDetail.cellSize, x, z) * config.floorDetail.amplitude
      const ceilN = valueNoise2D(ceilSeed, config.ceilingDetail.cellSize, x + 19.1, z - 7.3) * config.ceilingDetail.amplitude
      let fy = coverage.floorY + (isInside ? floorN : 0)
      let cy = coverage.floorY + coverage.height + (isInside ? ceilN : 0)
      if (cy - fy < topology.minClearance) {
        const mid = (fy + cy) * 0.5
        fy = mid - topology.minClearance * 0.5
        cy = mid + topology.minClearance * 0.5
      }
      floorY[i] = fy
      ceilingY[i] = cy
    }
  }

  const representation: CaveHeightfieldRepresentation = {
    bounds,
    originX,
    originZ,
    cellSize: config.cellSize,
    width,
    depth,
    inside,
    openSky,
    floorY,
    ceilingY,
    signedDistance,
    minClearance: topology.minClearance,
    entrance: topology.entrance,
    seed: topology.seed,
  }

  let insideCellCount = 0
  for (let i = 0; i < count; i++) if (inside[i]) insideCellCount++

  return {
    representation,
    representationMs: now() - t0,
    insideCellCount,
  }
}

const NEIGHBORS: readonly { dx: number, dz: number }[] = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]

/**
 * Orthogonal inside→outside grid edges. Each boundary edge is owned once by
 * its inside cell. Doorway-outward edges are omitted so the mouth stays open.
 *
 * @domain world-terrain
 */
export function extractHeightfieldBoundaryEdges(
  representation: CaveHeightfieldRepresentation,
): HeightfieldBoundaryEdge[] {
  const { width, depth, cellSize, originX, originZ, inside, floorY, ceilingY, entrance } = representation
  const edges: HeightfieldBoundaryEdge[] = []
  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const i = cellIndex(width, ix, iz)
      if (!inside[i]) continue
      const here = cellCenter(representation, ix, iz)
      for (const { dx, dz } of NEIGHBORS) {
        const nix = ix + dx
        const niz = iz + dz
        const outside = !inGrid(representation, nix, niz) || !inside[cellIndex(width, nix, niz)]
        if (!outside) continue
        const neighbor = {
          x: originX + (nix + 0.5) * cellSize,
          z: originZ + (niz + 0.5) * cellSize,
        }
        const midX = (here.x + neighbor.x) * 0.5
        const midZ = (here.z + neighbor.z) * 0.5
        if (isDoorwayOutwardEdge(entrance, midX, midZ, neighbor.x, neighbor.z)) continue

        const hx = originX + ix * cellSize
        const hz = originZ + iz * cellSize
        let x0: number
        let z0: number
        let x1: number
        let z1: number
        if (dx === 1) {
          x0 = hx + cellSize
          x1 = hx + cellSize
          z0 = hz
          z1 = hz + cellSize
        } else if (dx === -1) {
          x0 = hx
          x1 = hx
          z0 = hz + cellSize
          z1 = hz
        } else if (dz === 1) {
          x0 = hx + cellSize
          x1 = hx
          z0 = hz + cellSize
          z1 = hz + cellSize
        } else {
          x0 = hx
          x1 = hx + cellSize
          z0 = hz
          z1 = hz
        }
        const inwardX = -dx
        const inwardZ = -dz
        edges.push({
          x0,
          z0,
          x1,
          z1,
          floorY0: floorY[i]!,
          ceilingY0: ceilingY[i]!,
          floorY1: floorY[i]!,
          ceilingY1: ceilingY[i]!,
          inwardX,
          inwardZ,
          insideIx: ix,
          insideIz: iz,
          outsideIx: nix,
          outsideIz: niz,
        })
      }
    }
  }
  return edges
}

function sampleGridScalar(
  grid: Float32Array,
  width: number,
  depth: number,
  ix: number,
  iz: number,
  outside: number,
): number {
  if (ix < 0 || iz < 0 || ix >= width || iz >= depth) return outside
  return grid[cellIndex(width, ix, iz)]!
}

function bilerp(
  grid: Float32Array,
  width: number,
  depth: number,
  gx: number,
  gz: number,
  outside: number,
): number {
  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const tx = gx - x0
  const tz = gz - z0
  const n00 = sampleGridScalar(grid, width, depth, x0, z0, outside)
  const n10 = sampleGridScalar(grid, width, depth, x0 + 1, z0, outside)
  const n01 = sampleGridScalar(grid, width, depth, x0, z0 + 1, outside)
  const n11 = sampleGridScalar(grid, width, depth, x0 + 1, z0 + 1, outside)
  return n00 * (1 - tx) * (1 - tz) + n10 * tx * (1 - tz) + n01 * (1 - tx) * tz + n11 * tx * tz
}

function sampleMask(mask: Uint8Array, width: number, depth: number, ix: number, iz: number): number {
  if (ix < 0 || iz < 0 || ix >= width || iz >= depth) return 0
  return mask[cellIndex(width, ix, iz)]!
}

/**
 * Bilinear query against the heightfield grid. Outside the footprint
 * `inside` is false; floor/ceiling still report nearest-centerline heights.
 *
 * @domain world-terrain
 */
export function sampleHeightfieldAt(
  representation: CaveHeightfieldRepresentation,
  x: number,
  z: number,
): HeightfieldSample {
  const maxGx = Math.max(0, representation.width - 1.001)
  const maxGz = Math.max(0, representation.depth - 1.001)
  const rawGx = (x - representation.originX) / representation.cellSize - 0.5
  const rawGz = (z - representation.originZ) / representation.cellSize - 0.5
  const gx = Math.max(0, Math.min(maxGx, rawGx))
  const gz = Math.max(0, Math.min(maxGz, rawGz))
  const extra = Math.hypot(
    (rawGx - gx) * representation.cellSize,
    (rawGz - gz) * representation.cellSize,
  )
  const sd = bilerp(
    representation.signedDistance,
    representation.width,
    representation.depth,
    gx,
    gz,
    8,
  ) + extra
  const floorY = bilerp(representation.floorY, representation.width, representation.depth, gx, gz, 0)
  const ceilingY = bilerp(representation.ceilingY, representation.width, representation.depth, gx, gz, 0)
  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const openSky =
    sampleMask(representation.openSky, representation.width, representation.depth, x0, z0)
    + sampleMask(representation.openSky, representation.width, representation.depth, x0 + 1, z0)
    + sampleMask(representation.openSky, representation.width, representation.depth, x0, z0 + 1)
    + sampleMask(representation.openSky, representation.width, representation.depth, x0 + 1, z0 + 1)
    > 0
  return {
    inside: sd < 0,
    openSky: openSky && sd < 0.35,
    floorY,
    ceilingY,
    signedDistance: sd,
  }
}

export function heightfieldCellIndex(representation: CaveHeightfieldRepresentation, ix: number, iz: number): number {
  return cellIndex(representation.width, ix, iz)
}

export function heightfieldCellCenter(
  representation: CaveHeightfieldRepresentation,
  ix: number,
  iz: number,
): { x: number, z: number } {
  return cellCenter(representation, ix, iz)
}
