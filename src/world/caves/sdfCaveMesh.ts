/** Plan world-terrain-008 — derived presentation geometry for the production
 *  Graph + Local SDF representation (`caveSdfField.ts`): grid sampling +
 *  Naive Surface Nets extraction + analytic-surface clipping +
 *  `THREE.BufferGeometry`. No field/topology-interpretation logic lives here
 *  any more — see `caveSdfField.ts` for `CaveTopology -> pure SDF field`
 *  (plan §9's `CaveTopology -> CaveSpatialRepresentation -> mesh extraction`
 *  split).
 *
 *  Naive Surface Nets: one vertex per cell straddling the iso-surface, quads
 *  stitched along every sign-changing grid edge (no marching-cubes case
 *  table) — the only implicit-surface mesher in this repository, so its cost
 *  is legitimately part of this representation's cost.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import type { CaveSpikeMetrics } from './caveSpikeMetrics'
import type { CaveTopology, CaveTopologyPoint } from './caveTopology'
import { isSystemEnabled } from '../../debug/debugMode'
import { openingDirection } from '../largeCaves'
import {
  type Bounds,
  buildCaveSdfRepresentation,
  buildVoidField,
  type CaveSdfSpatialRepresentation,
  DEFAULT_SDF_PARAMS,
  type SdfCaveParams,
  type VoidPrimitive,
} from './caveSdfField'
import { clipTrianglesBelowSurface, clipTrianglesInFrontOfMouth, type SurfaceHeightSampler } from './clipBelowSurface'
import { deriveMouthGeometry } from './mouthCarve'

export { DEFAULT_SDF_PARAMS, type SdfCaveParams } from './caveSdfField'

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
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
 * Naive Surface Nets extraction. Winding **is** tracked per quad, from the
 * sign of the crossed edge: the base corner order around each axis yields a
 * face normal along `+axis`, so a quad whose edge goes rock→void (`va >= 0`)
 * keeps it and one going void→rock (`va < 0`) is reversed, leaving every face
 * pointing into the cave void. Emitting one fixed order regardless of sign
 * (as this mesher originally did) leaves roughly half the surface
 * back-facing, and since the shared cave material is `DoubleSide` +
 * `flatShading` — where three.js flips the derived normal by
 * `gl_FrontFacing` — those faces are lit from behind and render black. That
 * is what made the mouth read as a black blob.
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
  /** `flip` reverses the loop so the face normal points at the void side of
   *  the crossed edge instead of along `+axis`. */
  const emitQuad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) indices.push(a, c, b, a, d, c)
    else indices.push(a, b, c, a, c, d)
  }

  // x-direction edges: fixed (j, k), varying i -> i+1. Corner loop normal +x.
  for (let k = 1; k < nz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const va = gridValue(grid, i, j, k)
        const vb = gridValue(grid, i + 1, j, k)
        if (va < 0 === vb < 0) continue
        emitQuad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), va < 0)
      }
    }
  }
  // y-direction edges: fixed (i, k), varying j -> j+1. Corner loop normal -y.
  for (let k = 1; k < nz; k++) {
    for (let i = 1; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const va = gridValue(grid, i, j, k)
        const vb = gridValue(grid, i, j + 1, k)
        if (va < 0 === vb < 0) continue
        emitQuad(cellAt(i - 1, j, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i - 1, j, k), va >= 0)
      }
    }
  }
  // z-direction edges: fixed (i, j), varying k -> k+1. Corner loop normal +z.
  for (let j = 1; j < ny; j++) {
    for (let i = 1; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const va = gridValue(grid, i, j, k)
        const vb = gridValue(grid, i, j, k + 1)
        if (va < 0 === vb < 0) continue
        emitQuad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), va < 0)
      }
    }
  }

  return { positions, indices }
}

// --- Public API ------------------------------------------------------------

export type SdfCaveResult = { geometry: THREE.BufferGeometry, metrics: CaveSpikeMetrics }

/**
 * Builds Cave V2's production presentation geometry for `topology`. Pure —
 * no scene/collision/save side effects. Local grid only: bounded to the
 * representation's own footprint plus margin, never a global voxel terrain.
 *
 * @domain world-terrain
 */
export function buildSdfCaveMesh(
  topology: CaveTopology,
  params: SdfCaveParams = DEFAULT_SDF_PARAMS,
  surfaceHeightAt?: SurfaceHeightSampler,
  representation?: CaveSdfSpatialRepresentation,
): SdfCaveResult {
  const detailEnabled = isSystemEnabled('caveDetail')

  const t0 = now()
  const field = representation ?? buildCaveSdfRepresentation(topology, params, detailEnabled)
  const t1 = now()

  const mouth = deriveMouthGeometry(topology.entrance)
  const out = openingDirection(topology.entrance.yaw)
  const framePad = mouth.apertureHalfWidth + mouth.frameThickness + params.cellSize * 2
  const meshBounds: Bounds = {
    minX: Math.min(field.bounds.minX, topology.entrance.x + out.dx * mouth.frameOutward - framePad),
    maxX: Math.max(field.bounds.maxX, topology.entrance.x + out.dx * mouth.frameOutward + framePad),
    minY: Math.min(field.bounds.minY, topology.entrance.y - mouth.lipDepth - params.cellSize),
    maxY: Math.max(field.bounds.maxY, mouth.lintelY + mouth.hoodHeight + params.cellSize),
    minZ: Math.min(field.bounds.minZ, topology.entrance.z + out.dz * mouth.frameOutward - framePad),
    maxZ: Math.max(field.bounds.maxZ, topology.entrance.z + out.dz * mouth.frameOutward + framePad),
  }
  const grid = sampleGrid(meshBounds, params.cellSize, field.sample)

  const extracted = extractSurfaceNets(grid)
  // Terrain clip still owns overburden: no interior geometry above the
  // analytic surface. The doorway itself is in the SDF (aperture + frame);
  // the mouth clip only drops the sleeve's outer cap.
  const surfaceClipped = surfaceHeightAt
    ? clipTrianglesBelowSurface(extracted.positions, extracted.indices, surfaceHeightAt)
    : extracted
  const { positions, indices } = surfaceHeightAt
    ? clipTrianglesInFrontOfMouth(surfaceClipped.positions, surfaceClipped.indices, topology.entrance)
    : surfaceClipped
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

/** Plan §10/§9 accidental-union stress test config: two spatially close but
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
 * `CaveTopology`/`caveSdfField.ts` entirely since the point is exactly that
 * these clusters are *not* topologically connected. Used only by the
 * accidental-union stress test.
 *
 * @domain world-terrain
 */
export function buildAccidentalUnionStressMesh(config: AccidentalUnionStressConfig): { positions: number[], indices: number[] } {
  const primitives: VoidPrimitive[] = [
    { cx: config.clusterA.center.x, cy: config.clusterA.center.y, cz: config.clusterA.center.z, rx: config.clusterA.radius, ry: config.clusterA.radius, rz: config.clusterA.radius },
    { cx: config.clusterB.center.x, cy: config.clusterB.center.y, cz: config.clusterB.center.z, rx: config.clusterB.radius, ry: config.clusterB.radius, rz: config.clusterB.radius },
  ]
  const field = buildVoidField(primitives, [], config.smoothK, null)
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
