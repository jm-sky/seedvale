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
 *
 * plan world-terrain-011 adds bounded, deterministic dry-sink repair (see
 * `resolveMeaningfulDrySinks`) between the raw D8/accumulation pass and the
 * final `HydrologyRegion` this module returns — see that function's doc for
 * the two-pass shape.
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
  /** `size*size`, row-major (`iz*size+ix`). Bathymetry from `sampleFloorAt`,
   *  possibly lowered along a bounded, deterministic breach path where
   *  `resolveMeaningfulDrySinks` accepted a repair (world-terrain-011) — see
   *  that function's doc. Never raised above the raw sampled value. */
  elevation: Float32Array
  /** `-1` (sink) or an index into `D8_DIRECTIONS`. */
  flowDir: Int8Array
  /** Catchment cell count reaching (or passing through) this cell. Always >= 1. */
  accumulation: Int32Array
  /** Bitmask of `HydrologyFlag`. */
  flags: Uint8Array
}

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

/**
 * Bounded, deterministic dry-sink repair policy (plan world-terrain-011).
 * `minAccumulationForRepair` is the eligibility gate — a dry sink below it is
 * cheap threshold noise and never triggers a search (see `computeRiverTile`,
 * which passes its own `StreamThresholds.stream` here so eligibility tracks
 * the same scale actual river classification uses, not this module's own
 * `DEFAULT_STREAM_THRESHOLDS`). The rest bound the shallow-breach probe
 * itself (`resolveMeaningfulDrySinks`) so a pathological/large basin is
 * rejected rather than searched or cut without limit.
 */
export type DepressionRepairOptions = {
  /** Raw terminal accumulation (see `computeAccumulation`) a dry sink must
   *  reach before it is worth an extra search — weak/noisy pits stay sinks. */
  minAccumulationForRepair: number
  /** Hard cap on cells visited while searching for an escape route from one
   *  sink — search is rejected (sink stays unresolved) once exceeded. */
  maxSearchCells: number
  /** Hard cap on the resulting breach path length (interior cells strictly
   *  between the sink and the escape cell, exclusive of both). */
  maxPathCells: number
  /** Hard cap on how far any single path cell's working elevation may be
   *  lowered relative to its raw sampled elevation. */
  maxCutDepth: number
  /** Hard cap on the summed cut depth across one accepted breach path. */
  maxTotalCut: number
}

export const DEFAULT_DEPRESSION_REPAIR_OPTIONS: DepressionRepairOptions = {
  minAccumulationForRepair: DEFAULT_STREAM_THRESHOLDS.stream,
  maxSearchCells: 220,
  maxPathCells: 28,
  maxCutDepth: 1.5,
  maxTotalCut: 6,
}

/** Minimum elevation drop enforced between consecutive breach-path cells —
 *  keeps the conditioned profile strictly descending (D8 requires strictly
 *  positive slope; see `resolveFlowDirections`) even where raw elevation
 *  along the path is nearly flat. */
const BREACH_MIN_STEP = 0.02

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

function sampleElevationGrid(regionParams: HydrologyRegionParams, sampleParams: RawSampleParams): Float32Array {
  const { originX, originZ, size, cellStep } = regionParams
  const elevation = new Float32Array(size * size)
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const { wx, wz } = cellWorldPos({ originX, originZ, cellStep }, ix, iz)
      elevation[cellIndex(ix, iz, size)] = sampleFloorAt(wx, wz, sampleParams)
    }
  }
  return elevation
}

/**
 * Resolves D8 flow direction + terminal flags for a given elevation grid.
 * Pure function of `elevation` (plus the one-cell-outside analytic sample
 * needed at the window edge) — safe to call a second time on a conditioned
 * elevation array without resampling terrain (world-terrain-011's two-pass
 * repair reuses this rather than duplicating the loop).
 */
function resolveFlowDirections(
  elevation: Float32Array,
  size: number,
  cellStep: number,
  originX: number,
  originZ: number,
  sampleParams: RawSampleParams,
): { flowDir: Int8Array; flags: Uint8Array } {
  const cellCount = size * size
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

  return { flowDir, flags }
}

/** Iterative (no recursion) flow accumulation: every non-terminal cell adds
 *  its own accumulated count to its single downstream neighbour, processed
 *  high-to-low elevation so each cell's contribution is already final by the
 *  time it is added downstream. Pure function of `(elevation, flowDir, flags)`
 *  — reused as-is for world-terrain-011's post-repair recompute. */
function computeAccumulation(elevation: Float32Array, flowDir: Int8Array, flags: Uint8Array, size: number): Int32Array {
  const cellCount = size * size
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

  return accumulation
}

type BreachPath = { pathIndices: number[]; pathElevations: number[] }

/**
 * Bounded priority-queue (minimax) search for a deterministic breach path out
 * of one dry sink, reusing caller-owned scratch arrays (`visited`,
 * `predecessor`) so a tile's whole repair pass stays O(cellCount) rather than
 * allocating per-candidate. `touched` records every cell visited so the
 * caller can reset just those entries between candidates.
 *
 * The search grows a frontier strictly inside the sampled window (never
 * samples beyond it — repair stays local to the already-analysed hydrology
 * workspace), always expanding the lowest-elevation unvisited frontier cell
 * next (deterministic tie-break: lower flat index). The first non-sink cell
 * popped whose *raw* elevation already sits below the sink's own elevation is
 * a genuine downhill escape — the path back to the sink (via `predecessor`)
 * is the route requiring the least maximum elevation crossed, i.e. the
 * cheapest rim to cut through.
 *
 * Returns `null` when no escape is found within `maxSearchCells`, the
 * resulting path exceeds `maxPathCells`, or the conditioned profile would
 * need to cut deeper than `maxCutDepth`/`maxTotalCut` allow — all reasons to
 * leave the sink unresolved rather than force a repair.
 */
function findBreachPath(
  searchElevation: Float32Array,
  size: number,
  sinkIdx: number,
  visited: Uint8Array,
  predecessor: Int32Array,
  touched: number[],
  options: DepressionRepairOptions,
): BreachPath | null {
  const sinkElev = searchElevation[sinkIdx]!

  const open: number[] = [sinkIdx]
  visited[sinkIdx] = 1
  predecessor[sinkIdx] = -1
  touched.push(sinkIdx)

  let escapeIdx = -1

  while (open.length > 0) {
    let bestPos = 0
    for (let k = 1; k < open.length; k++) {
      const a = open[k]!
      const b = open[bestPos]!
      const ea = searchElevation[a]!
      const eb = searchElevation[b]!
      if (ea < eb || (ea === eb && a < b)) bestPos = k
    }
    const cur = open[bestPos]!
    open[bestPos] = open[open.length - 1]!
    open.pop()

    if (cur !== sinkIdx && searchElevation[cur]! < sinkElev) {
      escapeIdx = cur
      break
    }

    const cix = cur % size
    const ciz = Math.floor(cur / size)
    for (let d = 0; d < D8_DIRECTIONS.length; d++) {
      const dir = D8_DIRECTIONS[d]!
      const nx = cix + dir.dx
      const nz = ciz + dir.dz
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue
      const nIdx = cellIndex(nx, nz, size)
      if (visited[nIdx]) continue
      if (touched.length >= options.maxSearchCells) return null
      visited[nIdx] = 1
      predecessor[nIdx] = cur
      touched.push(nIdx)
      open.push(nIdx)
    }
  }

  if (escapeIdx === -1) return null

  const reversePath: number[] = []
  let node = predecessor[escapeIdx]!
  while (node !== -1) {
    reversePath.push(node)
    node = predecessor[node]!
  }
  reversePath.reverse() // sink -> p1 -> ... -> pk, in downstream order (escapeIdx excluded, never modified)

  if (reversePath.length > options.maxPathCells) return null

  const escapeElev = searchElevation[escapeIdx]!
  const pathElevations: number[] = [sinkElev]
  let prev = sinkElev
  let totalCut = 0
  let maxCut = 0
  for (let i = 1; i < reversePath.length; i++) {
    const idx = reversePath[i]!
    const raw = searchElevation[idx]!
    const target = Math.min(raw, prev - BREACH_MIN_STEP)
    const cut = raw - target
    if (cut > maxCut) maxCut = cut
    totalCut += cut
    pathElevations.push(target)
    prev = target
  }

  if (prev <= escapeElev) return null
  if (maxCut > options.maxCutDepth) return null
  if (totalCut > options.maxTotalCut) return null

  return { pathIndices: reversePath, pathElevations }
}

/**
 * Bounded, deterministic repair for dry D8 sinks receiving meaningful
 * accumulated drainage (plan world-terrain-011 — replaces the previous
 * all-or-nothing "dry sink -> drop the whole upstream chain" policy at the
 * `riverNetwork.ts::buildChains()` layer with a hydrology-level fix, so
 * accumulation stays coherent for anything downstream of a repair).
 *
 * Only `SINK`-flagged cells that are not already `OCEAN_OUTLET` (a genuine
 * water receiver is left untouched) and whose raw accumulation reaches
 * `options.minAccumulationForRepair` are attempted — weak/noisy pits are
 * never searched. Candidates are resolved in a deterministic order (highest
 * accumulation first, tie-broken by flat index) using `findBreachPath`;
 * accepted breaches lower a small `Float32Array` clone of `elevation` along
 * one path per sink (see that function), which subsequent candidates search
 * against (letting nearby depressions chain into an already-cut route). A
 * cell absorbed into an earlier accepted path is skipped as its own
 * candidate — its flow direction is resolved for free once the caller
 * recomputes D8 over the conditioned elevation.
 *
 * Returns `null` when no candidate qualifies or none can be resolved within
 * budget — the caller then keeps the original raw region unchanged.
 */
function resolveMeaningfulDrySinks(
  elevation: Float32Array,
  flags: Uint8Array,
  accumulation: Int32Array,
  size: number,
  options: DepressionRepairOptions,
): Float32Array | null {
  const cellCount = size * size
  const candidates: number[] = []
  for (let i = 0; i < cellCount; i++) {
    const f = flags[i]!
    if ((f & HydrologyFlag.SINK) === 0) continue
    if ((f & HydrologyFlag.OCEAN_OUTLET) !== 0) continue
    if (accumulation[i]! < options.minAccumulationForRepair) continue
    candidates.push(i)
  }
  if (candidates.length === 0) return null

  // Deterministic priority: higher accumulation (more meaningful drainage)
  // first, then lower flat cell index — see plan notes §10.
  candidates.sort((a, b) => accumulation[b]! - accumulation[a]! || a - b)

  let working: Float32Array | null = null
  const claimed = new Uint8Array(cellCount)
  const visited = new Uint8Array(cellCount)
  const predecessor = new Int32Array(cellCount)
  const touched: number[] = []

  for (const sinkIdx of candidates) {
    if (claimed[sinkIdx]) continue // already absorbed into an earlier accepted breach

    touched.length = 0
    const breach = findBreachPath(working ?? elevation, size, sinkIdx, visited, predecessor, touched, options)
    for (const idx of touched) {
      visited[idx] = 0
      predecessor[idx] = -1
    }
    if (!breach) continue

    if (!working) working = elevation.slice()
    for (let i = 0; i < breach.pathIndices.length; i++) {
      const idx = breach.pathIndices[i]!
      working[idx] = breach.pathElevations[i]!
      claimed[idx] = 1
    }
  }

  return working
}

/**
 * Samples an analysis grid and resolves D8 flow direction + accumulation.
 * Iterative only (no recursion), typed arrays only (no per-cell allocation).
 *
 * World-terrain-011 shape: raw D8 + raw accumulation are computed first;
 * `resolveMeaningfulDrySinks` then probes only dry sinks with meaningful raw
 * accumulation for a bounded shallow-breach repair. If any breach is
 * accepted, D8 and accumulation are recomputed exactly once over the
 * conditioned elevation — never resampling terrain, never iterating repair
 * to a fixed point. The returned region's `elevation` is the conditioned
 * array whenever a repair was accepted, since that is what must drive
 * `RiverPoint.elevation` (canonical water/bed height and channel carving).
 */
export function computeHydrologyRegion(
  regionParams: HydrologyRegionParams,
  sampleParams: RawSampleParams,
  repairOptions: DepressionRepairOptions = DEFAULT_DEPRESSION_REPAIR_OPTIONS,
): HydrologyRegion {
  const { originX, originZ, size, cellStep } = regionParams
  const elevation = sampleElevationGrid(regionParams, sampleParams)

  const raw = resolveFlowDirections(elevation, size, cellStep, originX, originZ, sampleParams)
  const rawAccumulation = computeAccumulation(elevation, raw.flowDir, raw.flags, size)

  const conditioned = resolveMeaningfulDrySinks(elevation, raw.flags, rawAccumulation, size, repairOptions)
  if (!conditioned) {
    return { size, cellStep, originX, originZ, elevation, flowDir: raw.flowDir, accumulation: rawAccumulation, flags: raw.flags }
  }

  const resolved = resolveFlowDirections(conditioned, size, cellStep, originX, originZ, sampleParams)
  const resolvedAccumulation = computeAccumulation(conditioned, resolved.flowDir, resolved.flags, size)
  return {
    size,
    cellStep,
    originX,
    originZ,
    elevation: conditioned,
    flowDir: resolved.flowDir,
    accumulation: resolvedAccumulation,
    flags: resolved.flags,
  }
}

export type StreamClass = 0 | 1 | 2 | 3

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
