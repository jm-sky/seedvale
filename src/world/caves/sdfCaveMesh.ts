/** Plan world-terrain-008 Milestone A §10 — Variant B: graph + local SDF.
 *  Builds a bounded, local scalar field (no global voxel terrain, no
 *  chunked volume, no worker) as a smooth union of ellipsoid "void"
 *  primitives sampled along the `CaveTopology` centerline (main trunk, plus
 *  the branch if present), subtracts a solid box for the shelf/overhang
 *  feature, and extracts the iso-surface with a local implementation of
 *  Naive Surface Nets (no marching-cubes/dual-contouring implementation
 *  exists anywhere else in this repository — the mesher is legitimately
 *  part of this spike's cost).
 *
 * Domain-warp surface noise is a crude per-axis 1D sum (not true 3D Perlin)
 * — a deliberate simplification for a local spike; see the spike results
 * doc for how it reads in practice.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import type { CaveSpikeMetrics } from './caveSpikeMetrics'
import type { CaveTopology, CaveTopologyPoint } from './caveTopology'
import { isSystemEnabled } from '../../debug/debugMode'
import { createMultiScaleNoise1D, type NoiseOctave } from './spikeNoise'

export type SdfCaveParams = {
  /** World-units per SDF grid cell. Smaller = finer surface, cubically more
   *  samples. */
  cellSize: number
  /** Polynomial smooth-union blend radius (metres) between neighbouring void
   *  primitives — too large re-creates the "soft rubber tube" failure mode
   *  the plan warns about (§10). */
  smoothK: number
  /** Spacing (metres) between void primitives placed along the centerline. */
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

const MAIN_CHAIN = ['entrance', 'wide-transition', 'descending-passage', 'widening-bend', 'main-chamber'] as const

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

// --- Primitive placement -----------------------------------------------

type VoidPrimitive = { cx: number, cy: number, cz: number, rx: number, ry: number, rz: number }

type Keyframe = { position: CaveTopologyPoint, width: number, height: number }

function buildKeyframes(topology: CaveTopology, chain: readonly string[]): Keyframe[] {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const segByPair = new Map(topology.segments.map((s) => [`${s.from}>${s.to}`, s]))
  const keyframes: Keyframe[] = []
  for (let i = 0; i < chain.length - 1; i++) {
    const fromId = chain[i]!
    const toId = chain[i + 1]!
    const seg = segByPair.get(`${fromId}>${toId}`)
    if (!seg) throw new Error(`sdfCaveMesh: no segment ${fromId}->${toId}`)
    const fromNode = nodeById.get(fromId)!
    const toNode = nodeById.get(toId)!
    const pts = seg.centerline
    if (i === 0) keyframes.push({ position: pts[0]!, width: fromNode.targetWidth, height: fromNode.targetHeight })
    for (let k = 1; k < pts.length; k++) {
      const t = k / (pts.length - 1)
      keyframes.push({
        position: pts[k]!,
        width: fromNode.targetWidth + (toNode.targetWidth - fromNode.targetWidth) * t,
        height: fromNode.targetHeight + (toNode.targetHeight - fromNode.targetHeight) * t,
      })
    }
  }
  return keyframes
}

function placePrimitives(keyframes: readonly Keyframe[], spacing: number): VoidPrimitive[] {
  const out: VoidPrimitive[] = []
  const push = (k: Keyframe): void => {
    out.push({ cx: k.position.x, cy: k.position.y + k.height * 0.5, cz: k.position.z, rx: k.width / 2, ry: k.height / 2, rz: k.width / 2 })
  }
  push(keyframes[0]!)
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!
    const b = keyframes[i + 1]!
    const dist = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
    const steps = Math.max(1, Math.round(dist / spacing))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      push({
        position: {
          x: a.position.x + (b.position.x - a.position.x) * t,
          y: a.position.y + (b.position.y - a.position.y) * t,
          z: a.position.z + (b.position.z - a.position.z) * t,
        },
        width: a.width + (b.width - a.width) * t,
        height: a.height + (b.height - a.height) * t,
      })
    }
  }
  return out
}

// --- Field ---------------------------------------------------------------

function ellipsoidSDF(x: number, y: number, z: number, p: VoidPrimitive): number {
  const dx = (x - p.cx) / p.rx
  const dy = (y - p.cy) / p.ry
  const dz = (z - p.cz) / p.rz
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const scale = Math.min(p.rx, p.ry, p.rz)
  return (len - 1) * scale
}

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

function boxSDF(x: number, y: number, z: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): number {
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

type FeatureBox = { cx: number, cy: number, cz: number, hx: number, hy: number, hz: number }

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

function buildField(
  primitives: readonly VoidPrimitive[],
  features: readonly FeatureBox[],
  smoothK: number,
  detailEnabled: boolean,
  noiseX: (s: number) => number,
  noiseY: (s: number) => number,
  noiseZ: (s: number) => number,
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
    if (detailEnabled) {
      d += noiseX(x) * 0.34 + noiseY(y) * 0.34 + noiseZ(z) * 0.32
    }
    return d
  }
}

// --- Bounds ----------------------------------------------------------------

type Bounds = { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }

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

// --- Naive Surface Nets ------------------------------------------------

const CUBE_CORNERS: readonly [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]
const CUBE_EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

type SampledGrid = { nx: number, ny: number, nz: number, minX: number, minY: number, minZ: number, cellSize: number, values: Float32Array }

function sampleGrid(bounds: Bounds, cellSize: number, sdf: (x: number, y: number, z: number) => number): SampledGrid {
  const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize))
  const ny = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize))
  const nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cellSize))
  const values = new Float32Array((nx + 1) * (ny + 1) * (nz + 1))
  let idx = 0
  for (let k = 0; k <= nz; k++) {
    const z = bounds.minZ + k * cellSize
    for (let j = 0; j <= ny; j++) {
      const y = bounds.minY + j * cellSize
      for (let i = 0; i <= nx; i++) {
        const x = bounds.minX + i * cellSize
        values[idx++] = sdf(x, y, z)
      }
    }
  }
  return { nx, ny, nz, minX: bounds.minX, minY: bounds.minY, minZ: bounds.minZ, cellSize, values }
}

function gridValue(grid: SampledGrid, i: number, j: number, k: number): number {
  return grid.values[(k * (grid.ny + 1) + j) * (grid.nx + 1) + i]!
}

function cellIndex(nx: number, ny: number, i: number, j: number, k: number): number {
  return (k * ny + j) * nx + i
}

/** Surface-net vertex for cell `(i,j,k)`, or `null` if the cell doesn't
 *  straddle the iso-surface: the average of the linearly-interpolated
 *  crossing points along each of the cell's 12 edges. */
function computeCellVertex(grid: SampledGrid, i: number, j: number, k: number): [number, number, number] | null {
  let sumX = 0
  let sumY = 0
  let sumZ = 0
  let count = 0
  for (const [a, b] of CUBE_EDGES) {
    const ca = CUBE_CORNERS[a]!
    const cb = CUBE_CORNERS[b]!
    const va = gridValue(grid, i + ca[0], j + ca[1], k + ca[2])
    const vb = gridValue(grid, i + cb[0], j + cb[1], k + cb[2])
    if (va < 0 === vb < 0) continue
    const t = va / (va - vb)
    sumX += ca[0] + (cb[0] - ca[0]) * t
    sumY += ca[1] + (cb[1] - ca[1]) * t
    sumZ += ca[2] + (cb[2] - ca[2]) * t
    count++
  }
  if (count === 0) return null
  return [
    grid.minX + (i + sumX / count) * grid.cellSize,
    grid.minY + (j + sumY / count) * grid.cellSize,
    grid.minZ + (k + sumZ / count) * grid.cellSize,
  ]
}

/**
 * Naive Surface Nets extraction: one vertex per cell straddling the
 * iso-surface, quads stitched along every sign-changing grid edge (no
 * marching-cubes case table). Winding is not tracked per-quad — the shared
 * cave material is double-sided (matches V1), same as both spikes.
 */
function extractSurfaceNets(grid: SampledGrid): { positions: number[], indices: number[] } {
  const { nx, ny, nz } = grid
  const cellVertexIndex = new Int32Array(nx * ny * nz).fill(-1)
  const positions: number[] = []

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = computeCellVertex(grid, i, j, k)
        if (!v) continue
        const idx = positions.length / 3
        positions.push(v[0], v[1], v[2])
        cellVertexIndex[cellIndex(nx, ny, i, j, k)] = idx
      }
    }
  }

  const indices: number[] = []
  const cellAt = (i: number, j: number, k: number): number => {
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1
    return cellVertexIndex[cellIndex(nx, ny, i, j, k)]!
  }
  const emitQuad = (a: number, b: number, c: number, d: number): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    indices.push(a, b, c, a, c, d)
  }

  // x-direction edges: fixed (j, k), varying i -> i+1.
  for (let k = 1; k < nz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const va = gridValue(grid, i, j, k)
        const vb = gridValue(grid, i + 1, j, k)
        if (va < 0 === vb < 0) continue
        emitQuad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k))
      }
    }
  }
  // y-direction edges: fixed (i, k), varying j -> j+1.
  for (let k = 1; k < nz; k++) {
    for (let i = 1; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const va = gridValue(grid, i, j, k)
        const vb = gridValue(grid, i, j + 1, k)
        if (va < 0 === vb < 0) continue
        emitQuad(cellAt(i - 1, j, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i - 1, j, k))
      }
    }
  }
  // z-direction edges: fixed (i, j), varying k -> k+1.
  for (let j = 1; j < ny; j++) {
    for (let i = 1; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const va = gridValue(grid, i, j, k)
        const vb = gridValue(grid, i, j, k + 1)
        if (va < 0 === vb < 0) continue
        emitQuad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k))
      }
    }
  }

  return { positions, indices }
}

// --- Public API ------------------------------------------------------------

export type SdfCaveResult = { geometry: THREE.BufferGeometry, metrics: CaveSpikeMetrics }

/**
 * Builds the SDF spike's presentation geometry for `topology`. Pure — no
 * scene/collision/save side effects. Local grid only: bounded to the
 * topology's own footprint plus margin, never a global voxel terrain (plan
 * world-terrain-008 §10).
 *
 * @domain world-terrain
 */
export function buildSdfCaveMesh(
  topology: CaveTopology,
  params: SdfCaveParams = DEFAULT_SDF_PARAMS,
  includeBranch = false,
): SdfCaveResult {
  const seedBase = topology.seed
  const noiseX = createMultiScaleNoise1D(seedBase ^ 0x11223344, [params.detail.micro, params.detail.medium])
  const noiseY = createMultiScaleNoise1D(seedBase ^ 0x22334455, [params.detail.micro, params.detail.medium])
  const noiseZ = createMultiScaleNoise1D(seedBase ^ 0x33445566, [params.detail.micro, params.detail.medium])
  const detailEnabled = isSystemEnabled('caveDetail')

  const t0 = now()
  const primitives = placePrimitives(buildKeyframes(topology, MAIN_CHAIN), params.primitiveSpacing)
  const hasBranch = topology.nodes.some((n) => n.id === 'branch-chamber')
  if (includeBranch && hasBranch) {
    primitives.push(...placePrimitives(buildKeyframes(topology, ['widening-bend', 'branch-chamber']), params.primitiveSpacing))
  }
  const features = featureBoxesFromTopology(topology)
  const field = buildField(primitives, features, params.smoothK, detailEnabled, noiseX, noiseY, noiseZ)
  const bounds = computeTopologyBounds(topology, params.cellSize * 2)
  const t1 = now()

  const grid = sampleGrid(bounds, params.cellSize, field)

  const { positions, indices } = extractSurfaceNets(grid)
  const t3 = now()

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()

  const vertices = positions.length / 3
  const triangles = indices.length / 3
  const bb = geometry.boundingBox!
  const gridCells = grid.nx * grid.ny * grid.nz

  const metrics: CaveSpikeMetrics = {
    variant: 'sdf',
    topologyBuildMs: 0,
    representationMs: t1 - t0,
    meshBuildMs: t3 - t1,
    vertices,
    triangles,
    geometryBytes: positions.length * 4 + indices.length * 4 + vertices * 3 * 4,
    peakTempBytes: gridCells * 4,
    bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] },
    params,
    detailEnabled,
  }

  return { geometry, metrics }
}

/** Plan §10 accidental-union stress test config: two spatially close but
 *  topologically unconnected void clusters. The clusters carry no topology
 *  segment between them — a real check that a smooth union does not bridge
 *  sections the layout never asked to be connected. */
export type AccidentalUnionStressConfig = {
  clusterA: { center: CaveTopologyPoint, radius: number }
  clusterB: { center: CaveTopologyPoint, radius: number }
  cellSize: number
  smoothK: number
}

/**
 * Builds just the two-cluster field from `config` and extracts it — bypasses
 * `CaveTopology` entirely since the point is exactly that these clusters are
 * *not* topologically connected. Used only by the accidental-union stress
 * test (plan §10).
 *
 * @domain world-terrain
 */
export function buildAccidentalUnionStressMesh(config: AccidentalUnionStressConfig): { positions: number[], indices: number[] } {
  const primitives: VoidPrimitive[] = [
    { cx: config.clusterA.center.x, cy: config.clusterA.center.y, cz: config.clusterA.center.z, rx: config.clusterA.radius, ry: config.clusterA.radius, rz: config.clusterA.radius },
    { cx: config.clusterB.center.x, cy: config.clusterB.center.y, cz: config.clusterB.center.z, rx: config.clusterB.radius, ry: config.clusterB.radius, rz: config.clusterB.radius },
  ]
  const field = buildField(primitives, [], config.smoothK, false, () => 0, () => 0, () => 0)
  const margin = config.cellSize * 2
  const bounds: Bounds = {
    minX: Math.min(config.clusterA.center.x - config.clusterA.radius, config.clusterB.center.x - config.clusterB.radius) - margin,
    maxX: Math.max(config.clusterA.center.x + config.clusterA.radius, config.clusterB.center.x + config.clusterB.radius) + margin,
    minY: Math.min(config.clusterA.center.y - config.clusterA.radius, config.clusterB.center.y - config.clusterB.radius) - margin,
    maxY: Math.max(config.clusterA.center.y + config.clusterA.radius, config.clusterB.center.y + config.clusterB.radius) + margin,
    minZ: Math.min(config.clusterA.center.z - config.clusterA.radius, config.clusterB.center.z - config.clusterB.radius) - margin,
    maxZ: Math.max(config.clusterA.center.z + config.clusterA.radius, config.clusterB.center.z + config.clusterB.radius) + margin,
  }
  const grid = sampleGrid(bounds, config.cellSize, field)
  return extractSurfaceNets(grid)
}

/** Test-only helper: number of connected components in a triangle mesh
 *  (union-find over shared vertex indices), used by the accidental-union
 *  stress test to check whether two topologically disconnected sections
 *  ended up spatially bridged by the smooth union. */
export function countConnectedComponents(indices: readonly number[], vertexCount: number): number {
  const parent = Int32Array.from({ length: vertexCount }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let i = 0; i < indices.length; i += 3) {
    union(indices[i]!, indices[i + 1]!)
    union(indices[i + 1]!, indices[i + 2]!)
  }
  const roots = new Set<number>()
  const used = new Set<number>(indices)
  for (const v of used) roots.add(find(v))
  return roots.size
}
