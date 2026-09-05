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
 *
 * plan world-terrain-013 keeps that same two-pass shape but makes the repair
 * *receiver-aware and cost-based*: `probeDownstreamTerminal` answers bounded
 * "what does the existing D8 topology below this cell resolve to" questions
 * from data already computed for the region, and `findBreachPath` ranks
 * several escape candidates by an explicit terrain-cost function instead of
 * accepting the first downhill cell it happens to reach.
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

/** What a bounded downstream walk resolved to (world-terrain-013). Only
 *  `water-receiver` is a genuine, existing water-backed terminal; the rest
 *  are either an honest "no valid receiver here" or an honest "not knowable
 *  from this workspace", never something to be optimistically upgraded. */
export type DownstreamProbeOutcome =
  /** Reached a terminal flagged `OCEAN_OUTLET` — an actual water body. */
  | 'water-receiver'
  /** Reached a dry closed depression (`SINK` without `OCEAN_OUTLET`). */
  | 'dry-sink'
  /** Left the analysis window over dry terrain — the answer lies outside. */
  | 'dry-boundary-exit'
  /** Reached a cell whose drainage was already re-routed by an accepted
   *  breach, so the flow directions this probe walks are stale there. */
  | 'rerouted'
  /** Ran out of probe steps before reaching any terminal. */
  | 'budget-exceeded'

export type DownstreamProbe = {
  outcome: DownstreamProbeOutcome
  /** Last cell inspected — the terminal itself for a resolved outcome. */
  endIndex: number
  /** D8 steps walked from the start cell (`0` when it is already terminal). */
  steps: number
}

/** 48 cells ≈ the 384 m river-tile halo at the production 8 m cell step
 *  (`riverNetwork.ts`) — local downstream reasoning stays inside the window
 *  a tile already analysed, never triggering a neighbouring tile/chunk. */
export const DEFAULT_DOWNSTREAM_PROBE_STEPS = 48

function probeDownstream(
  flowDir: Int8Array,
  flags: Uint8Array,
  size: number,
  startIndex: number,
  maxSteps: number,
  rerouted: Uint8Array | null,
): DownstreamProbe {
  let idx = startIndex
  let steps = 0
  for (;;) {
    if (rerouted !== null && rerouted[idx] !== 0) return { outcome: 'rerouted', endIndex: idx, steps }
    const f = flags[idx]!
    if ((f & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) {
      if ((f & HydrologyFlag.OCEAN_OUTLET) !== 0) return { outcome: 'water-receiver', endIndex: idx, steps }
      const outcome: DownstreamProbeOutcome = (f & HydrologyFlag.SINK) !== 0 ? 'dry-sink' : 'dry-boundary-exit'
      return { outcome, endIndex: idx, steps }
    }
    if (steps >= maxSteps) return { outcome: 'budget-exceeded', endIndex: idx, steps }
    const dir = D8_DIRECTIONS[flowDir[idx]!]!
    idx = cellIndex((idx % size) + dir.dx, Math.floor(idx / size) + dir.dz, size)
    steps++
  }
}

/**
 * Bounded downstream terminal question over an already-computed region
 * (world-terrain-013): follows existing D8 topology from `startIndex` for at
 * most `maxSteps` and reports what it resolves to. Pure, allocation-light
 * (one small result object), and strictly local — it never samples terrain,
 * never searches geometrically for nearby water and never needs a
 * neighbouring region/tile/chunk.
 *
 * @domain world-terrain
 */
export function probeDownstreamTerminal(
  region: Pick<HydrologyRegion, 'flowDir' | 'flags' | 'size'>,
  startIndex: number,
  maxSteps: number = DEFAULT_DOWNSTREAM_PROBE_STEPS,
): DownstreamProbe {
  return probeDownstream(region.flowDir, region.flags, region.size, startIndex, maxSteps, null)
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
  /** How many distinct escape cells one sink's search may fully evaluate
   *  before the cheapest is chosen (world-terrain-013) — the search stops
   *  there, so this bounds cost-based ranking instead of widening it. */
  maxEscapeCandidates: number
  /** Hard cap on the bounded downstream probe used to judge what an escape
   *  candidate actually drains into (see `probeDownstreamTerminal`). */
  receiverProbeSteps: number
}

export const DEFAULT_DEPRESSION_REPAIR_OPTIONS: DepressionRepairOptions = {
  minAccumulationForRepair: DEFAULT_STREAM_THRESHOLDS.stream,
  maxSearchCells: 220,
  maxPathCells: 28,
  maxCutDepth: 1.5,
  maxTotalCut: 6,
  maxEscapeCandidates: 4,
  receiverProbeSteps: DEFAULT_DOWNSTREAM_PROBE_STEPS,
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

type BreachCandidate = { path: BreachPath; cost: number; escapeIdx: number }

/** Caller-owned scratch reused across every candidate sink of one region, so
 *  a whole tile's repair pass stays O(cellCount) instead of allocating per
 *  search. `touched` records the cells whose entries need resetting. */
type BreachScratch = {
  /** Settled (already popped) cells of the current search. */
  visited: Uint8Array
  predecessor: Int32Array
  /** Minimax cost: the highest elevation the cheapest known route from the
   *  sink to this cell has to cross — what actually decides cut depth. */
  cost: Float32Array
  touched: number[]
}

/** Raw D8 topology a breach candidate is judged against (world-terrain-013).
 *  `rerouted` marks cells already conditioned by an accepted breach, whose
 *  raw `flowDir` is therefore stale — a probe reaching one reports
 *  `'rerouted'` rather than pretending to know where it now drains. */
type BreachReceiverContext = {
  flowDir: Int8Array
  flags: Uint8Array
  rerouted: Uint8Array
  probeSteps: number
}

// Explicit, monotonic breach cost (world-terrain-013). Terrain cost dominates
// geometry on purpose: the plan's own example — a 110 m route needing a
// shallow 0.7 m cut beating a 60 m route through an 8 m ridge — must fall out
// of these weights, so max cut depth outranks total cut, which outranks path
// length. The receiver term is deliberately small (≈0.19 m of max cut): it
// breaks ties between comparable routes toward real water and routes whose
// downstream is merely unknown, and never buys a materially deeper cut.
const BREACH_COST_MAX_CUT_WEIGHT = 4
const BREACH_COST_TOTAL_CUT_WEIGHT = 1
const BREACH_COST_PATH_CELL_WEIGHT = 0.02
const BREACH_COST_UNKNOWN_RECEIVER_PENALTY = 0.75

/**
 * Turns one discovered escape cell into a fully costed breach candidate, or
 * rejects it. Rejection reasons are all "leave the sink unresolved" rather
 * than "force a repair": path longer than `maxPathCells`, a conditioned
 * profile that would no longer descend into the escape cell, a cut deeper
 * than `maxCutDepth`, a total cut past `maxTotalCut` — and, per
 * world-terrain-013, an escape whose own existing downstream topology just
 * resolves to another dry sink (escaping into a second closed depression is
 * not a repaired outlet, however cheap the cut).
 */
function evaluateBreachCandidate(
  searchElevation: Float32Array,
  size: number,
  sinkIdx: number,
  escapeIdx: number,
  predecessor: Int32Array,
  options: DepressionRepairOptions,
  receiver: BreachReceiverContext | null,
): BreachCandidate | null {
  const reversePath: number[] = []
  let node = predecessor[escapeIdx]!
  while (node !== -1) {
    reversePath.push(node)
    node = predecessor[node]!
  }
  reversePath.reverse() // sink -> p1 -> ... -> pk, in downstream order (escapeIdx excluded, never modified)
  if (reversePath.length === 0 || reversePath[0] !== sinkIdx) return null // defensive: not a route from this sink

  // `maxPathCells` counts the interior cells strictly between the sink and
  // the escape cell — i.e. exactly the cells this breach would lower. The
  // sink itself is in `pathIndices` (its own elevation is written back
  // unchanged, so downstream profiles stay anchored to it) but is never cut.
  const interiorCells = reversePath.length - 1
  if (interiorCells > options.maxPathCells) return null

  const sinkElev = searchElevation[sinkIdx]!
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

  let receiverPenalty = 0
  if (receiver !== null) {
    const probe = probeDownstream(
      receiver.flowDir,
      receiver.flags,
      size,
      escapeIdx,
      receiver.probeSteps,
      receiver.rerouted,
    )
    if (probe.outcome === 'dry-sink') return null
    if (probe.outcome !== 'water-receiver') receiverPenalty = BREACH_COST_UNKNOWN_RECEIVER_PENALTY
  }

  const cost =
    maxCut * BREACH_COST_MAX_CUT_WEIGHT +
    totalCut * BREACH_COST_TOTAL_CUT_WEIGHT +
    interiorCells * BREACH_COST_PATH_CELL_WEIGHT +
    receiverPenalty
  return { path: { pathIndices: reversePath, pathElevations }, cost, escapeIdx }
}

/**
 * Bounded, deterministic minimax search for the cheapest breach path out of
 * one dry sink.
 *
 * The frontier grows strictly inside the sampled window (never samples beyond
 * it — repair stays local to the already-analysed hydrology workspace) and is
 * ordered by *minimax* cost: a cell's cost is the highest elevation the best
 * known route to it must cross, so the first route found to any cell is
 * already the one needing the shallowest cut (deterministic tie-break: lower
 * flat index). Any non-sink cell popped whose working elevation sits below
 * the sink's own is a genuine downhill escape; it is costed by
 * `evaluateBreachCandidate` and never expanded further (an escape is a
 * destination, not a corridor).
 *
 * world-terrain-013: the search collects up to `maxEscapeCandidates` escapes
 * instead of stopping at the first, then returns the cheapest by the explicit
 * cost function above — so a longer but much shallower route beats a short
 * deep cut, and a route into real water beats an equally cheap route into
 * unknown terrain. Returns `null` when nothing qualifies within budget, which
 * leaves the sink unresolved (a closed basin stays closed).
 */
function findBreachPath(
  searchElevation: Float32Array,
  size: number,
  sinkIdx: number,
  scratch: BreachScratch,
  options: DepressionRepairOptions,
  receiver: BreachReceiverContext | null,
): BreachPath | null {
  const { visited, predecessor, cost, touched } = scratch
  const sinkElev = searchElevation[sinkIdx]!

  cost[sinkIdx] = sinkElev
  predecessor[sinkIdx] = -1
  touched.push(sinkIdx)

  const open: number[] = [sinkIdx]
  const candidates: BreachCandidate[] = []

  while (open.length > 0 && candidates.length < options.maxEscapeCandidates) {
    let bestPos = 0
    for (let k = 1; k < open.length; k++) {
      const a = open[k]!
      const b = open[bestPos]!
      const ca = cost[a]!
      const cb = cost[b]!
      if (ca < cb || (ca === cb && a < b)) bestPos = k
    }
    const cur = open[bestPos]!
    open[bestPos] = open[open.length - 1]!
    open.pop()
    if (visited[cur]) continue // stale queue entry from an earlier, costlier route
    visited[cur] = 1

    if (cur !== sinkIdx && searchElevation[cur]! < sinkElev) {
      const candidate = evaluateBreachCandidate(searchElevation, size, sinkIdx, cur, predecessor, options, receiver)
      if (candidate) candidates.push(candidate)
      continue
    }

    const cix = cur % size
    const ciz = Math.floor(cur / size)
    const curCost = cost[cur]!
    for (let d = 0; d < D8_DIRECTIONS.length; d++) {
      const dir = D8_DIRECTIONS[d]!
      const nx = cix + dir.dx
      const nz = ciz + dir.dz
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue
      const nIdx = cellIndex(nx, nz, size)
      if (visited[nIdx]) continue
      const nElev = searchElevation[nIdx]!
      const nCost = nElev > curCost ? nElev : curCost
      const known = cost[nIdx]! // `Infinity` until first discovered (the caller resets `touched` entries)
      if (nCost >= known) continue // already reachable at least as cheaply
      if (known === Infinity) {
        if (touched.length >= options.maxSearchCells) {
          open.length = 0 // search budget spent — rank whatever was already found
          break
        }
        touched.push(nIdx)
      }
      cost[nIdx] = nCost
      predecessor[nIdx] = cur
      open.push(nIdx)
    }
  }

  if (candidates.length === 0) return null
  let best = candidates[0]!
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!
    if (c.cost < best.cost || (c.cost === best.cost && c.escapeIdx < best.escapeIdx)) best = c
  }
  return best.path
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
 * world-terrain-013 adds receiver awareness: a candidate escape is judged
 * against the raw D8 topology below it (`probeDownstream`), so a breach that
 * would only tip one closed depression into another is rejected, and the
 * cheapest of several escapes wins by explicit terrain cost rather than by
 * whichever the frontier happened to reach first.
 *
 * Returns `null` when no candidate qualifies or none can be resolved within
 * budget — the caller then keeps the original raw region unchanged.
 */
function resolveMeaningfulDrySinks(
  elevation: Float32Array,
  flowDir: Int8Array,
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
  const scratch: BreachScratch = {
    visited: new Uint8Array(cellCount),
    predecessor: new Int32Array(cellCount).fill(-1),
    cost: new Float32Array(cellCount).fill(Infinity),
    touched: [],
  }
  const receiver: BreachReceiverContext = {
    flowDir,
    flags,
    rerouted: claimed,
    probeSteps: options.receiverProbeSteps,
  }

  for (const sinkIdx of candidates) {
    if (claimed[sinkIdx]) continue // already absorbed into an earlier accepted breach

    scratch.touched.length = 0
    const breach = findBreachPath(working ?? elevation, size, sinkIdx, scratch, options, receiver)
    for (const idx of scratch.touched) {
      scratch.visited[idx] = 0
      scratch.predecessor[idx] = -1
      scratch.cost[idx] = Infinity
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

  const conditioned = resolveMeaningfulDrySinks(
    elevation,
    raw.flowDir,
    raw.flags,
    rawAccumulation,
    size,
    repairOptions,
  )
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
