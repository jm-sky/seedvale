import { type RawSampleParams, sampleFloorAt, sampleHeightAt } from './chunkHeightmap'

/**
 * Pure D8 drainage prototype (plan 181, Etap 2–3). Consumes only the existing
 * analytic `sampleFloorAt`/`sampleHeightAt` — no ChunkManager, no Three.js, no
 * worker, no persistent global heightfield. A `HydrologyRegion` is a bounded,
 * disposable computational workspace over a fixed-size grid, not a second world
 * representation.
 *
 * Deliberately NOT built here (see plan 181 implementation notes — gated until
 * this prototype is evaluated): river network segments, cross-chunk continuity,
 * channel/meander geometry, water-shader integration.
 */

/** Fixed neighbour order — determinism matters when two neighbours tie on slope. */
export const D8_DIRECTIONS: readonly { dx: number; dz: number; cost: number }[] = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
]

export const HydrologyFlag = {
  SINK: 1 << 0,
  BOUNDARY_EXIT: 1 << 1,
  /** A terminal cell (`SINK` or `BOUNDARY_EXIT`) whose own drainage point sits
   *  at/below `waterLevel` — a genuine water body (ocean or inland lake) per
   *  the existing heights-clamp model (`heights = max(floorH, waterLevel)`,
   *  `waterBodies.ts`'s flood fill), as opposed to a dry closed depression or
   *  a dry boundary crossing. The name predates inland-lake coverage; kept for
   *  compatibility with existing call sites checking for a valid receiver. */
  OCEAN_OUTLET: 1 << 2,
} as const

/** No in-grid neighbour is strictly lower — a local minimum/closed depression. */
export const FLOW_DIR_SINK = -1

const WATER_EPS = 1e-4

export type HydrologyRegionParams = {
  /** World-space origin (corner, not center) of the analysis grid. */
  originX: number
  originZ: number
  /** Cells per side. */
  size: number
  /** World units per cell. */
  cellStep: number
}

export type HydrologyRegion = {
  size: number
  cellStep: number
  originX: number
  originZ: number
  /** `size*size`, row-major (`iz*size+ix`). Unclamped bathymetry from `sampleFloorAt`. */
  elevation: Float32Array
  /** `-1` (sink) or an index into `D8_DIRECTIONS`. */
  flowDir: Int8Array
  /** Catchment cell count reaching (or passing through) this cell. Always >= 1. */
  accumulation: Int32Array
  /** Bitmask of `HydrologyFlag`. */
  flags: Uint8Array
}

function cellIndex(ix: number, iz: number, size: number): number {
  return iz * size + ix
}

function cellWorldPos(
  region: Pick<HydrologyRegion, 'originX' | 'originZ' | 'cellStep'>,
  ix: number,
  iz: number,
): { wx: number; wz: number } {
  return { wx: region.originX + ix * region.cellStep, wz: region.originZ + iz * region.cellStep }
}

/**
 * Samples an analysis grid and resolves D8 flow direction + accumulation.
 * Iterative only (no recursion), typed arrays only (no per-cell allocation).
 */
export function computeHydrologyRegion(
  regionParams: HydrologyRegionParams,
  sampleParams: RawSampleParams,
): HydrologyRegion {
  const { originX, originZ, size, cellStep } = regionParams
  const cellCount = size * size

  const elevation = new Float32Array(cellCount)
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const { wx, wz } = cellWorldPos({ originX, originZ, cellStep }, ix, iz)
      elevation[cellIndex(ix, iz, size)] = sampleFloorAt(wx, wz, sampleParams)
    }
  }

  const flowDir = new Int8Array(cellCount).fill(FLOW_DIR_SINK)
  const flags = new Uint8Array(cellCount)

  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const idx = cellIndex(ix, iz, size)
      const elev = elevation[idx]!

      let bestDir = FLOW_DIR_SINK
      let bestSlope = 0
      let bestExitsGrid = false

      for (let d = 0; d < D8_DIRECTIONS.length; d++) {
        const dir = D8_DIRECTIONS[d]!
        const nx = ix + dir.dx
        const nz = iz + dir.dz
        const inGrid = nx >= 0 && nx < size && nz >= 0 && nz < size

        let neighbourElev: number
        if (inGrid) {
          neighbourElev = elevation[cellIndex(nx, nz, size)]!
        } else {
          // One extra analytic sample just outside the window — cheap, and lets us
          // later tell an ocean outlet apart from an "exits the window" path
          // without requiring the neighbouring region to be loaded/analysed.
          const { wx, wz } = cellWorldPos({ originX, originZ, cellStep }, nx, nz)
          neighbourElev = sampleFloorAt(wx, wz, sampleParams)
        }

        const slope = (elev - neighbourElev) / (cellStep * dir.cost)
        if (slope > bestSlope) {
          bestSlope = slope
          bestDir = d
          bestExitsGrid = !inGrid
        }
      }

      flowDir[idx] = bestDir
      if (bestDir === FLOW_DIR_SINK) {
        flags[idx]! |= HydrologyFlag.SINK
        // A closed depression whose own floor already sits at/below waterLevel
        // is a genuine lake bottom (the heights clamp already renders it as
        // water), not a dry pit a river should appear to vanish into.
        if (elev <= sampleParams.waterLevel + WATER_EPS) {
          flags[idx]! |= HydrologyFlag.OCEAN_OUTLET
        }
      } else if (bestExitsGrid) {
        flags[idx]! |= HydrologyFlag.BOUNDARY_EXIT
        const dir = D8_DIRECTIONS[bestDir]!
        const { wx, wz } = cellWorldPos({ originX, originZ, cellStep }, ix + dir.dx, iz + dir.dz)
        if (sampleHeightAt(wx, wz, sampleParams) <= sampleParams.waterLevel + WATER_EPS) {
          flags[idx]! |= HydrologyFlag.OCEAN_OUTLET
        }
      }
    }
  }

  const accumulation = new Int32Array(cellCount).fill(1)
  const order = Array.from({ length: cellCount }, (_, i) => i)
  order.sort((a, b) => elevation[b]! - elevation[a]!)

  for (const idx of order) {
    if ((flags[idx]! & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) continue
    const dir = D8_DIRECTIONS[flowDir[idx]!]!
    const ix = idx % size
    const iz = Math.floor(idx / size)
    const downstream = cellIndex(ix + dir.dx, iz + dir.dz, size)
    accumulation[downstream]! += accumulation[idx]!
  }

  return { size, cellStep, originX, originZ, elevation, flowDir, accumulation, flags }
}

export type StreamClass = 0 | 1 | 2 | 3

export type StreamThresholds = {
  stream: number
  river: number
  majorRiver: number
}

export const DEFAULT_STREAM_THRESHOLDS: StreamThresholds = {
  stream: 4,
  river: 20,
  majorRiver: 80,
}

/** Pure function of `accumulation` — 0 (none) / 1 (stream) / 2 (river) / 3 (major river). */
export function classifyStreams(
  region: HydrologyRegion,
  thresholds: StreamThresholds = DEFAULT_STREAM_THRESHOLDS,
): Uint8Array {
  const out = new Uint8Array(region.accumulation.length)
  for (let i = 0; i < out.length; i++) {
    const acc = region.accumulation[i]!
    out[i] =
      acc >= thresholds.majorRiver ? 3 : acc >= thresholds.river ? 2 : acc >= thresholds.stream ? 1 : 0
  }
  return out
}

export type SourceCandidateOptions = {
  /** Fraction (0..1) of the region's elevation range a candidate must exceed. */
  minElevationFraction: number
  /** Minimum slope (world units of drop per world unit) toward the steepest neighbour. */
  minSlope: number
  /** Non-max suppression radius, in cells. */
  suppressionRadiusCells: number
}

const DEFAULT_SOURCE_OPTIONS: SourceCandidateOptions = {
  minElevationFraction: 0.4,
  minSlope: 0.02,
  suppressionRadiusCells: 3,
}

function slopeAt(region: HydrologyRegion, idx: number): number {
  const dir = region.flowDir[idx]!
  if (dir === FLOW_DIR_SINK) return 0
  const d = D8_DIRECTIONS[dir]!
  const size = region.size
  const ix = idx % size
  const iz = Math.floor(idx / size)
  const nx = ix + d.dx
  const nz = iz + d.dz
  if (nx < 0 || nx >= size || nz < 0 || nz >= size) return 0
  const neighbourIdx = cellIndex(nx, nz, size)
  return (region.elevation[idx]! - region.elevation[neighbourIdx]!) / (region.cellStep * d.cost)
}

/**
 * Deterministic candidate source cells: drainage leaves (`accumulation === 1`),
 * high enough and steep enough, thinned to local elevation maxima so a ridge
 * doesn't spawn dozens of adjacent sources. Never random.
 */
export function findSourceCandidates(
  region: HydrologyRegion,
  options: SourceCandidateOptions = DEFAULT_SOURCE_OPTIONS,
): number[] {
  const { size, elevation, accumulation } = region
  let minElev = Infinity
  let maxElev = -Infinity
  for (let i = 0; i < elevation.length; i++) {
    const e = elevation[i]!
    if (e < minElev) minElev = e
    if (e > maxElev) maxElev = e
  }
  const elevThreshold = minElev + (maxElev - minElev) * options.minElevationFraction

  const raw: number[] = []
  for (let i = 0; i < elevation.length; i++) {
    if (accumulation[i] !== 1) continue
    if (elevation[i]! < elevThreshold) continue
    if (slopeAt(region, i) < options.minSlope) continue
    raw.push(i)
  }

  const r = options.suppressionRadiusCells
  const result: number[] = []
  for (const idx of raw) {
    const ix = idx % size
    const iz = Math.floor(idx / size)
    let isLocalMax = true
    for (const otherIdx of raw) {
      if (otherIdx === idx) continue
      const ox = otherIdx % size
      const oz = Math.floor(otherIdx / size)
      if (Math.abs(ox - ix) > r || Math.abs(oz - iz) > r) continue
      if (elevation[otherIdx]! > elevation[idx]!) {
        isLocalMax = false
        break
      }
      // Deterministic tie-break: lower flat index wins.
      if (elevation[otherIdx] === elevation[idx] && otherIdx < idx) {
        isLocalMax = false
        break
      }
    }
    if (isLocalMax) result.push(idx)
  }
  return result
}

/** Walks a downstream D8 path from `startIndex` until a terminal (sink/boundary-exit)
 *  cell — diagnostic use, and the basis a future river-network builder would reuse. */
export function traceDownstreamPath(region: HydrologyRegion, startIndex: number): number[] {
  const { size, flowDir, flags } = region
  const path: number[] = [startIndex]
  let idx = startIndex
  const visited = new Set<number>([idx])
  for (;;) {
    if ((flags[idx]! & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) break
    const dir = D8_DIRECTIONS[flowDir[idx]!]!
    const ix = idx % size
    const iz = Math.floor(idx / size)
    idx = cellIndex(ix + dir.dx, iz + dir.dz, size)
    if (visited.has(idx)) break // defensive; D8 flow graphs are acyclic by construction
    visited.add(idx)
    path.push(idx)
  }
  return path
}
