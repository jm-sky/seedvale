import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import type { RawSampleParams, RiverChannelSegment } from './chunkHeightmap'
import { projectOntoSegment } from '../math/segment'
import { createSeededRandom } from '../world/parseSeed'
import {
  classifyStreams,
  computeHydrologyRegion,
  D8_DIRECTIONS,
  HydrologyFlag,
  type HydrologyRegion,
  type StreamThresholds,
} from './hydrology'

/**
 * River network extraction (plan 181, Etap 4). Builds on the pure D8 prototype
 * in `hydrology.ts` — still no Three.js/ChunkManager/worker here.
 *
 * Key design choice: the world is partitioned into fixed, seed-independent
 * "river tiles" that tile the plane without gaps or overlaps. Each tile is
 * analysed once over its own core plus a fixed halo (the halo only improves
 * accumulation accuracy near the tile's own edges — it never extends rendered
 * geometry into a neighbour tile). Chains are built by walking consecutive
 * *classified* cells via their D8 flow direction, truncated at the tile core
 * boundary — not by tracing from a source across the whole halo — so a tile
 * never needs data owned by a neighbour, and every world point's river data is
 * owned by exactly one tile, computed identically regardless of which chunk
 * triggered it.
 */

export const RIVER_TILE_SIZE = 256
// Halo > core (was equal) — each tile's own accumulation estimate near its
// edges is only as good as how much upstream catchment its window sees. A
// too-small halo makes two neighbouring tiles' accumulation for the "same"
// physical drainage line diverge enough that one classifies it as a river and
// the other doesn't, showing up as a gap right at the tile seam.
export const RIVER_TILE_HALO = 384
export const RIVER_CELL_STEP = 8

const CORE_CELLS = RIVER_TILE_SIZE / RIVER_CELL_STEP
const HALO_CELLS = RIVER_TILE_HALO / RIVER_CELL_STEP
const WINDOW_CELLS = CORE_CELLS + 2 * HALO_CELLS

// Calibrated empirically against real generation: lower thresholds produced
// dozens of 1-2 cell noise blips per tile (terrain wrinkles briefly crossing
// an accumulation threshold, not real channels). These values give ~2-4 real,
// reasonably long chains per tile.
//
// This is also THE knob to raise river frequency/density for testing: lower
// `stream` (and `river`/`majorRiver` proportionally) to classify more cells
// as rivers — e.g. `{ stream: 5, river: 20, majorRiver: 80 }` gives a much
// denser network. `MIN_CHAIN_POINTS` below (drops short noise blips) may also
// need lowering if `stream` goes very low, or short real streams get filtered
// out too.
export const DEFAULT_RIVER_THRESHOLDS: StreamThresholds = {
  stream: 15,
  river: 50,
  majorRiver: 200,
}

export type RiverTileCoord = { tx: number; tz: number }

export function riverTileCoordOf(worldX: number, worldZ: number): RiverTileCoord {
  return { tx: Math.floor(worldX / RIVER_TILE_SIZE), tz: Math.floor(worldZ / RIVER_TILE_SIZE) }
}

export function riverTileKey(tile: RiverTileCoord): string {
  return `${tile.tx},${tile.tz}`
}

export type WorldRect = { minX: number; maxX: number; minZ: number; maxZ: number }

/** World-space core rectangle a tile is the sole authority for. */
export function riverTileCoreRect(tile: RiverTileCoord): WorldRect {
  const minX = tile.tx * RIVER_TILE_SIZE
  const minZ = tile.tz * RIVER_TILE_SIZE
  return { minX, maxX: minX + RIVER_TILE_SIZE, minZ, maxZ: minZ + RIVER_TILE_SIZE }
}

/** Every tile whose core rectangle overlaps `rect` — at most 4 for a rect
 *  smaller than one tile (a chunk is 64 world units, a tile is 256). */
export function overlappingRiverTiles(rect: WorldRect): RiverTileCoord[] {
  const EPS = 1e-6
  const { tx: txMin, tz: tzMin } = riverTileCoordOf(rect.minX, rect.minZ)
  const { tx: txMax, tz: tzMax } = riverTileCoordOf(rect.maxX - EPS, rect.maxZ - EPS)
  const tiles: RiverTileCoord[] = []
  for (let tz = tzMin; tz <= tzMax; tz++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      tiles.push({ tx, tz })
    }
  }
  return tiles
}

export type RiverPoint = { x: number; z: number; elevation: number; accumulation: number }
export type RiverChain = { points: RiverPoint[] }

// A barely-classified trickle should read as a thin thread, not a 1-unit-wide
// canal — small MIN, and `flowFactor`'s ease-in keeps most near-threshold
// cells close to it. MAX stays well short of the old 14 so even a major river
// doesn't dominate the frame (plan 181 Etap 7: "zbyt stała i duża szerokość").
const MIN_RIVER_WIDTH = 0.4
const MAX_RIVER_WIDTH = 11

/** Drops short threshold-noise blips (see `buildChains`) — a rendering
 *  cutoff, not a hydrology-correctness threshold. */
const MIN_CHAIN_POINTS = 8

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/** Normalized 0..1 flow strength from accumulation — the single source of
 *  truth `widthFromAccumulation` and the rendering flow attribute (see
 *  `riverGeometry.ts`) both build on, so width and visual "bigness" always
 *  agree. Eased toward the low end (`pow(t, 1.6)`) rather than linear/log
 *  alone: a cell that only just crosses the `stream` threshold stays visually
 *  subtle, and only accumulation well past `river` reads as a big, confident
 *  channel — addresses "zbyt duża wizualna dominacja małych cieków". */
export function flowFactor(
  accumulation: number,
  thresholds: StreamThresholds = DEFAULT_RIVER_THRESHOLDS,
): number {
  if (accumulation < thresholds.stream) return 0
  const logAcc = Math.log(accumulation + 1)
  const logMin = Math.log(thresholds.stream + 1)
  const logMax = Math.log(thresholds.majorRiver * 4 + 1)
  const t = clamp01((logAcc - logMin) / (logMax - logMin))
  return Math.pow(t, 1.6)
}

/** Bounded, smoothly-growing channel width from flow accumulation — never a
 *  hardcoded width independent of flow, never unbounded either. */
export function widthFromAccumulation(
  accumulation: number,
  thresholds: StreamThresholds = DEFAULT_RIVER_THRESHOLDS,
): number {
  if (accumulation < thresholds.stream) return 0
  const t = flowFactor(accumulation, thresholds)
  return MIN_RIVER_WIDTH + t * (MAX_RIVER_WIDTH - MIN_RIVER_WIDTH)
}

// River channel carving (plan 189) — depth/bank bounds, same eased-flow
// reasoning as width above: never a hardcoded depth independent of flow,
// never unbounded either.
const MIN_CHANNEL_DEPTH = 0.15
const MAX_CHANNEL_DEPTH = 2.4

/** Bounded, smoothly-growing channel depth from flow accumulation — the same
 *  `flowFactor` curve `widthFromAccumulation` builds on, so a bigger river is
 *  always both wider and deeper, never independently either. */
export function depthFromAccumulation(
  accumulation: number,
  thresholds: StreamThresholds = DEFAULT_RIVER_THRESHOLDS,
): number {
  if (accumulation < thresholds.stream) return 0
  const t = flowFactor(accumulation, thresholds)
  return MIN_CHANNEL_DEPTH + t * (MAX_CHANNEL_DEPTH - MIN_CHANNEL_DEPTH)
}

const CHANNEL_BANK_MIN_WIDTH = 1.5
/** Desired max additional rise-per-run beyond the channel's half-width before
 *  terrain returns to its natural, uncarved height — keeps a deep channel's
 *  bank from reading as a cliff (plan 189 "łagodny profil"). */
const CHANNEL_BANK_SLOPE = 0.45

function channelBankWidth(depth: number): number {
  return Math.max(CHANNEL_BANK_MIN_WIDTH, depth / CHANNEL_BANK_SLOPE)
}

/**
 * Builds terrain-carving segments for a chunk from the same canonical,
 * already-meandered/smoothed chains the water ribbon clips and renders
 * (`riverGeometry.ts`) — carving and water shape always agree, no second
 * path. Unlike `clipChainToRect` (which trims chain *points* to a rect for
 * rendering), this keeps whole point-to-point segments and rejects by each
 * segment's own carve reach (half-width + bank), so a segment whose points
 * sit just outside the chunk but whose bank still overlaps it is not dropped
 * — needed for carving continuity across chunk boundaries (plan 189).
 */
export function riverChannelSegmentsNear(
  chains: RiverChain[],
  worldX: number,
  worldZ: number,
  chunkSize: number,
): RiverChannelSegment[] {
  const half = chunkSize / 2
  const minX = worldX - half
  const maxX = worldX + half
  const minZ = worldZ - half
  const maxZ = worldZ + half

  const segments: RiverChannelSegment[] = []
  for (const chain of chains) {
    const pts = chain.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const aHalfWidth = widthFromAccumulation(a.accumulation) / 2
      const bHalfWidth = widthFromAccumulation(b.accumulation) / 2
      if (aHalfWidth <= 0 && bHalfWidth <= 0) continue
      const aDepth = depthFromAccumulation(a.accumulation)
      const bDepth = depthFromAccumulation(b.accumulation)
      const aBankWidth = channelBankWidth(aDepth)
      const bBankWidth = channelBankWidth(bDepth)
      const reach = Math.max(aHalfWidth + aBankWidth, bHalfWidth + bBankWidth)

      const segMinX = Math.min(a.x, b.x) - reach
      const segMaxX = Math.max(a.x, b.x) + reach
      const segMinZ = Math.min(a.z, b.z) - reach
      const segMaxZ = Math.max(a.z, b.z) + reach
      if (segMaxX < minX || segMinX > maxX || segMaxZ < minZ || segMinZ > maxZ) continue

      segments.push({
        ax: a.x,
        az: a.z,
        aBedH: a.elevation - aDepth,
        aHalfWidth,
        aBankWidth,
        bx: b.x,
        bz: b.z,
        bBedH: b.elevation - bDepth,
        bHalfWidth,
        bBankWidth,
      })
    }
  }
  return segments
}

/** Signed distance from `(x, z)` to the nearest of `segments`' own bank edge —
 *  negative while inside the channel (down to `-halfWidth` at the centerline),
 *  0 exactly at the bank, positive on dry land beyond it. Uses the same
 *  per-segment interpolated half-width and `projectOntoSegment` point-to-
 *  segment math `chunkHeightmap.ts`'s `applyRiverChannel` carving pass reads,
 *  so a "standing at the river's edge" gameplay check
 *  (`app/interactables.ts`'s shoreline resolver) always agrees with where the
 *  carved terrain actually puts the bank. `null` when `segments` is empty. */
export function nearestRiverBankDistance(
  segments: readonly RiverChannelSegment[],
  x: number,
  z: number,
): number | null {
  let best: number | null = null
  for (const seg of segments) {
    const { distSq, t } = projectOntoSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz)
    const halfWidth = seg.aHalfWidth + (seg.bHalfWidth - seg.aHalfWidth) * t
    const dist = Math.sqrt(distSq) - halfWidth
    if (best === null || dist < best) best = dist
  }
  return best
}

// Deterministic meandering (plan 181 Etap 7) — applied once per tile, after
// smoothing, to the canonical pre-clip chain (same reasoning as
// `smoothChainPoints`: two chunks must always clip identical, already-shaped
// data or a seam reappears at the chunk boundary). World-space noise, no
// `Math.random()`. Amplitude tapers to exactly 0 within
// `RIVER_MEANDER_TAPER_DISTANCE` of the tile's own core-rect edge — this is
// what keeps every meandered point strictly inside the core rect (proof: for
// any point, `offset <= maxAmplitude * edgeDist / taperDistance`, and since
// `maxAmplitude < taperDistance`, that is always `< edgeDist` to the *nearest*
// edge, so the point can never cross any edge) — and, as a side effect, ties
// off each chain's ends smoothly instead of leaving a lateral jump right at
// the tile seam.
const RIVER_MEANDER_SCALE = 0.012
const RIVER_MEANDER_DETAIL_SCALE = RIVER_MEANDER_SCALE * 2.6
const RIVER_MEANDER_WIDTH_FACTOR = 1.1
const RIVER_MEANDER_MIN_AMPLITUDE = 0.35
const RIVER_MEANDER_MAX_AMPLITUDE = 6
const RIVER_MEANDER_TAPER_DISTANCE = 32
const MEANDER_NOISE_SEED_XOR = 0x5bd1e995

function meanderTaper(p: RiverPoint, coreRect: WorldRect): number {
  const edgeDist = Math.min(
    p.x - coreRect.minX,
    coreRect.maxX - p.x,
    p.z - coreRect.minZ,
    coreRect.maxZ - p.z,
  )
  return clamp01(edgeDist / RIVER_MEANDER_TAPER_DISTANCE)
}

/** Offsets each interior chain point perpendicular to its local tangent by a
 *  bounded, flow-scaled, seed-deterministic noise sample — never overrides
 *  the underlying D8 direction, only bends the already-correct drainage path
 *  (Chaikin-smoothed) into something less staircase-like. Two octaves (a
 *  slow "bend" wavelength plus a faster wiggle) keep it from reading as one
 *  perfect sine wave. */
function meanderChainPoints(points: RiverPoint[], coreRect: WorldRect, noise: NoiseFunction2D): RiverPoint[] {
  if (points.length < 3) return points
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p
    const prev = points[i - 1]!
    const next = points[i + 1]!
    const tx = next.x - prev.x
    const tz = next.z - prev.z
    const len = Math.hypot(tx, tz) || 1
    const nx = -tz / len
    const nz = tx / len

    const width = widthFromAccumulation(p.accumulation)
    if (width <= 0) return p

    const n1 = noise(p.x * RIVER_MEANDER_SCALE, p.z * RIVER_MEANDER_SCALE)
    const n2 = noise(p.x * RIVER_MEANDER_DETAIL_SCALE + 91.7, p.z * RIVER_MEANDER_DETAIL_SCALE - 44.3)
    const n = clamp(n1 * 0.7 + n2 * 0.3, -1, 1)

    const baseAmplitude = clamp(
      width * RIVER_MEANDER_WIDTH_FACTOR,
      RIVER_MEANDER_MIN_AMPLITUDE,
      RIVER_MEANDER_MAX_AMPLITUDE,
    )
    const amplitude = baseAmplitude * meanderTaper(p, coreRect)

    return { ...p, x: p.x + nx * n * amplitude, z: p.z + nz * n * amplitude }
  })
}

function buildChains(
  region: HydrologyRegion,
  classes: Uint8Array,
  coreMin: number,
  coreMax: number,
  coreRect: WorldRect,
  meanderNoise: NoiseFunction2D,
): RiverChain[] {
  const { size } = region
  const hasClassifiedUpstream = new Uint8Array(size * size)

  // Only a classified *core* cell disqualifies its downstream neighbour from
  // being a chain head — a classified halo cell feeding into the core must
  // NOT disqualify it, or every core cell whose only upstream lies just
  // outside the core (extremely common near the core's own edge) would be
  // silently dropped instead of rendered as the start of an in-core chain.
  for (let iz = coreMin; iz < coreMax; iz++) {
    for (let ix = coreMin; ix < coreMax; ix++) {
      const idx = iz * size + ix
      if (classes[idx] === 0) continue
      if ((region.flags[idx]! & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) continue
      const dir = D8_DIRECTIONS[region.flowDir[idx]!]!
      const nx = ix + dir.dx
      const nz = iz + dir.dz
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue
      hasClassifiedUpstream[nz * size + nx] = 1
    }
  }

  const chains: RiverChain[] = []
  for (let iz = coreMin; iz < coreMax; iz++) {
    for (let ix = coreMin; ix < coreMax; ix++) {
      const headIdx = iz * size + ix
      if (classes[headIdx] === 0) continue
      if (hasClassifiedUpstream[headIdx]) continue // not a local head

      const points: RiverPoint[] = []
      const visited = new Set<number>()
      let curIdx = headIdx
      for (;;) {
        const cix = curIdx % size
        const ciz = Math.floor(curIdx / size)
        if (cix < coreMin || cix >= coreMax || ciz < coreMin || ciz >= coreMax) break
        if (classes[curIdx] === 0) break
        if (visited.has(curIdx)) break // defensive; D8 graphs are acyclic by construction
        visited.add(curIdx)

        points.push({
          x: region.originX + cix * region.cellStep,
          z: region.originZ + ciz * region.cellStep,
          elevation: region.elevation[curIdx]!,
          accumulation: region.accumulation[curIdx]!,
        })

        if ((region.flags[curIdx]! & (HydrologyFlag.SINK | HydrologyFlag.BOUNDARY_EXIT)) !== 0) break
        const dir = D8_DIRECTIONS[region.flowDir[curIdx]!]!
        const nx = cix + dir.dx
        const nz = ciz + dir.dz
        if (nx < 0 || nx >= size || nz < 0 || nz >= size) break
        curIdx = nz * size + nx
      }

      // D8 threshold classification produces plenty of 1-2 cell noise blips
      // (real terrain wrinkles briefly crossing the accumulation threshold).
      // Filtering short chains is a rendering-worthiness cutoff, not a
      // hydrology correctness change — it doesn't affect direction/accumulation.
      if (points.length >= MIN_CHAIN_POINTS) {
        const smoothed = smoothChainPoints(points)
        chains.push({ points: meanderChainPoints(smoothed, coreRect, meanderNoise) })
      }
    }
  }
  return chains
}

function lerpPoint(a: RiverPoint, b: RiverPoint, t: number): RiverPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
    accumulation: a.accumulation + (b.accumulation - a.accumulation) * t,
  }
}

const CHAIKIN_PASSES = 2

/**
 * Chaikin corner-cutting — smooths the D8 grid's 8-directional "staircase"
 * look without moving the chain's endpoints (topologically important: the
 * first/last point is where the chain enters/exits the tile core or hits a
 * sink, and must stay put) and without any lateral noise offset. This is
 * deliberately *not* meandering (plan 181 Etap 7, see `meanderChainPoints`
 * above) — it only reshapes the existing drainage path, never overrides its
 * direction. Two passes rather than one: a single pass still leaves a visibly
 * angular path at the 8m D8 cell spacing (plan 181 Etap 7: "zbyt kanciasty
 * przebieg"); a second pass on the already-once-smoothed points removes most
 * of the remaining kinks at a still-cheap 4x point-count cost.
 *
 * Applied here (once per tile, on the canonical pre-clip chain), not in the
 * chunk-facing geometry step — smoothing after per-chunk clipping would let
 * two chunks reshape the same shared chain differently near their boundary
 * and reintroduce a seam; smoothing the canonical chain once keeps every
 * consumer clipping identical, already-smoothed data.
 */
function smoothChainPoints(points: RiverPoint[], passes: number = CHAIKIN_PASSES): RiverPoint[] {
  let current = points
  for (let pass = 0; pass < passes; pass++) {
    if (current.length < 3) break
    const out: RiverPoint[] = [current[0]!]
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i]!
      const b = current[i + 1]!
      out.push(lerpPoint(a, b, 0.25), lerpPoint(a, b, 0.75))
    }
    out.push(current[current.length - 1]!)
    current = out
  }
  return current
}

/**
 * Computes the river chains owned by one tile. Deterministic from
 * `(sampleParams.seed, tile)` alone — independent of which chunk/caller
 * triggers it, so two chunks querying the same tile always see identical data.
 */
export function computeRiverTile(
  tile: RiverTileCoord,
  sampleParams: RawSampleParams,
  thresholds: StreamThresholds = DEFAULT_RIVER_THRESHOLDS,
): RiverChain[] {
  const originX = tile.tx * RIVER_TILE_SIZE - RIVER_TILE_HALO
  const originZ = tile.tz * RIVER_TILE_SIZE - RIVER_TILE_HALO
  const region = computeHydrologyRegion(
    { originX, originZ, size: WINDOW_CELLS, cellStep: RIVER_CELL_STEP },
    sampleParams,
  )
  const classes = classifyStreams(region, thresholds)
  const coreRect = riverTileCoreRect(tile)
  const meanderNoise = createNoise2D(createSeededRandom(sampleParams.seed ^ MEANDER_NOISE_SEED_XOR))
  return buildChains(region, classes, HALO_CELLS, HALO_CELLS + CORE_CELLS, coreRect, meanderNoise)
}
