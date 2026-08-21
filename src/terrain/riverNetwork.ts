import type { RawSampleParams } from './chunkHeightmap'
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

const MIN_RIVER_WIDTH = 1
const MAX_RIVER_WIDTH = 14

/** Drops short threshold-noise blips (see `buildChains`) — a rendering
 *  cutoff, not a hydrology-correctness threshold. */
const MIN_CHAIN_POINTS = 8

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Bounded, smoothly-growing channel width from flow accumulation — never a
 *  hardcoded width independent of flow, never unbounded either. */
export function widthFromAccumulation(
  accumulation: number,
  thresholds: StreamThresholds = DEFAULT_RIVER_THRESHOLDS,
): number {
  if (accumulation < thresholds.stream) return 0
  const logAcc = Math.log(accumulation + 1)
  const logMin = Math.log(thresholds.stream + 1)
  const logMax = Math.log(thresholds.majorRiver * 4 + 1)
  const t = clamp01((logAcc - logMin) / (logMax - logMin))
  return MIN_RIVER_WIDTH + t * (MAX_RIVER_WIDTH - MIN_RIVER_WIDTH)
}

function buildChains(region: HydrologyRegion, classes: Uint8Array, coreMin: number, coreMax: number): RiverChain[] {
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
      if (points.length >= MIN_CHAIN_POINTS) chains.push({ points: smoothChainPoints(points) })
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

/**
 * One pass of Chaikin corner-cutting — smooths the D8 grid's 8-directional
 * "staircase" look without moving the chain's endpoints (topologically
 * important: the first/last point is where the chain enters/exits the tile
 * core or hits a sink, and must stay put) and without any lateral noise
 * offset. This is deliberately *not* meandering (plan 181 Etap 7) — it only
 * reshapes the existing drainage path, never overrides its direction.
 *
 * Applied here (once per tile, on the canonical pre-clip chain), not in the
 * chunk-facing geometry step — smoothing after per-chunk clipping would let
 * two chunks reshape the same shared chain differently near their boundary
 * and reintroduce a seam; smoothing the canonical chain once keeps every
 * consumer clipping identical, already-smoothed data.
 */
function smoothChainPoints(points: RiverPoint[]): RiverPoint[] {
  if (points.length < 3) return points
  const out: RiverPoint[] = [points[0]!]
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    out.push(lerpPoint(a, b, 0.25), lerpPoint(a, b, 0.75))
  }
  out.push(points[points.length - 1]!)
  return out
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
  return buildChains(region, classes, HALO_CELLS, HALO_CELLS + CORE_CELLS)
}
