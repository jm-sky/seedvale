/** Plan world-terrain-008 B4.2 — CPU-heavy SDF grid sampling + Naive Surface
 *  Nets. No Three.js, no world height sampler: clipping and BufferGeometry
 *  stay on main. The worker rebuilds the SDF field from serializable
 *  topology/config and returns transferable typed arrays.
 *
 * @domain world-terrain
 */

import type { CaveTopology } from './caveTopology'
import { openingDirection } from './caveOrientation'
import {
  type Bounds,
  buildCaveSdfRepresentation,
  type CaveSdfSpatialRepresentation,
  DEFAULT_SDF_PARAMS,
  type SdfCaveParams,
} from './caveSdfField'
import { deriveMouthGeometry } from './mouthCarve'

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

const CUBE_CORNERS: readonly [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]
const CUBE_EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

export type SampledGrid = {
  nx: number
  ny: number
  nz: number
  minX: number
  minY: number
  minZ: number
  cellSize: number
  values: Float32Array
}

export function sampleGrid(
  bounds: Bounds,
  cellSize: number,
  sdf: (x: number, y: number, z: number) => number,
): SampledGrid {
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
 * pointing into the cave void.
 */
export function extractSurfaceNets(grid: SampledGrid): { positions: number[], indices: number[] } {
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
  const emitQuad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) indices.push(a, c, b, a, d, c)
    else indices.push(a, b, c, a, c, d)
  }

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

/** Presentation sampling bounds: SDF field footprint plus mouth frame pad. */
export function cavePresentationBounds(
  fieldBounds: Bounds,
  topology: CaveTopology,
  params: SdfCaveParams = DEFAULT_SDF_PARAMS,
): Bounds {
  const mouth = deriveMouthGeometry(topology.entrance)
  const out = openingDirection(topology.entrance.yaw)
  const framePad = mouth.apertureHalfWidth + mouth.frameThickness + params.cellSize * 2
  return {
    minX: Math.min(fieldBounds.minX, topology.entrance.x + out.dx * mouth.frameOutward - framePad),
    maxX: Math.max(fieldBounds.maxX, topology.entrance.x + out.dx * mouth.frameOutward + framePad),
    minY: Math.min(fieldBounds.minY, topology.entrance.y - mouth.lipDepth - params.cellSize),
    maxY: Math.max(fieldBounds.maxY, mouth.lintelY + mouth.hoodHeight + params.cellSize),
    minZ: Math.min(fieldBounds.minZ, topology.entrance.z + out.dz * mouth.frameOutward - framePad),
    maxZ: Math.max(fieldBounds.maxZ, topology.entrance.z + out.dz * mouth.frameOutward + framePad),
  }
}

export type CaveSdfExtraction = {
  positions: Float32Array
  indices: Uint32Array
  representationMs: number
  sdfSamplingMs: number
  surfaceNetsMs: number
  vertices: number
  triangles: number
  peakTempBytes: number
  gridCells: number
}

export type ExtractCaveSdfSurfaceInput = {
  topology: CaveTopology
  params?: SdfCaveParams
  detailEnabled?: boolean
  meshBounds: Bounds
  representation?: CaveSdfSpatialRepresentation
}

/**
 * Rebuilds (or reuses) the SDF field, samples the grid, and extracts Surface
 * Nets. Pure CPU — no clipping, no Three.js.
 *
 * @domain world-terrain
 */
export function extractCaveSdfSurface(input: ExtractCaveSdfSurfaceInput): CaveSdfExtraction {
  const params = input.params ?? DEFAULT_SDF_PARAMS
  const detailEnabled = input.detailEnabled ?? true
  const t0 = now()
  const field = input.representation ?? buildCaveSdfRepresentation(input.topology, params, detailEnabled)
  const t1 = now()
  const grid = sampleGrid(input.meshBounds, params.cellSize, field.sample)
  const t2 = now()
  const extracted = extractSurfaceNets(grid)
  const t3 = now()
  const positions = Float32Array.from(extracted.positions)
  const indices = Uint32Array.from(extracted.indices)
  const vertices = positions.length / 3
  const triangles = indices.length / 3
  return {
    positions,
    indices,
    representationMs: t1 - t0,
    sdfSamplingMs: t2 - t1,
    surfaceNetsMs: t3 - t2,
    vertices,
    triangles,
    peakTempBytes: grid.values.byteLength,
    gridCells: grid.nx * grid.ny * grid.nz,
  }
}
