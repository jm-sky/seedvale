import type { WorldConfig } from '../config/worldConfig'
import type { VillageSize } from '../settlement/families'
import type { SettlementsManager } from '../settlement/SettlementsManager'
import type { RiverChain, RiverPoint } from '../terrain/riverNetwork'
import type { WorldContext } from '../world/worldContext'
import { worldToCell } from '../settlement/settlementGenerator'
import { MOUNTAIN_RIDGE_THRESHOLD } from '../settlement/settlementTerrain'
import { computeRiverTile, RIVER_CELL_STEP, riverTileCoordOf } from '../terrain/riverNetwork'
import { rawSampleParamsFromWorld } from '../world/map/mapProjection'
import { cellRingSteps, searchNearest, type WorldPoint, worldRingSteps } from './locationSearch'

/**
 * The five `debug.locations.*Nearest()` implementations (plan
 * `ui-input-001`). Each binds the shared `searchNearest` policy
 * (`locationSearch.ts`) to a real, already-existing deterministic data
 * source — no new terrain/settlement sampling logic, no scanning of rendered
 * chunks/scene objects. Every function reads live samplers/managers passed
 * in by the caller on every call; nothing here is cached across a rebuild.
 */

export type LocationKind = 'mountain' | 'deepForest' | 'river' | 'village' | 'ocean'

/** Plain-data result of a `locations.*` query — never a `Vector3`/
 *  `Settlement`/`Object3D`. `id`/`name`/`size` are only populated for
 *  `kind: 'village'`. */
export type LocationResult = {
  kind: LocationKind
  position: WorldPoint
  distance: number
  id?: string
  name?: string
  size?: VillageSize
}

function distanceFrom(origin: WorldPoint, point: WorldPoint): number {
  return Math.hypot(point.x - origin.x, point.z - origin.z)
}

const MOUNTAIN_SEARCH_STEP = 24
const MOUNTAIN_SEARCH_MAX_RADIUS = 1200

/** Same ocean-first gate order `settlementTerrain.ts`'s
 *  `classifySettlementTerrain` already uses — a ridge deep under the ocean
 *  threshold should never read as "mountain". */
export function mountainNearest(origin: WorldPoint, ctx: WorldContext): LocationResult | null {
  const steps = worldRingSteps(origin, MOUNTAIN_SEARCH_STEP, MOUNTAIN_SEARCH_MAX_RADIUS)
  const found = searchNearest(steps, (point) => {
    if (ctx.sampleContinentalness(point.x, point.z) < ctx.region.oceanThreshold) return null
    return ctx.sampleMountainRidge(point.x, point.z) > MOUNTAIN_RIDGE_THRESHOLD ? point : null
  })
  if (!found) return null
  return { kind: 'mountain', position: found.point, distance: distanceFrom(origin, found.point) }
}

const FOREST_SEARCH_STEP = 24
const FOREST_SEARCH_MAX_RADIUS = 1200

/** `sampleForestBiome` already returns the canonical discrete classification
 *  (`forestBiomeAt` in `terrain/biomeRegions.ts`) — no re-derivation. */
export function deepForestNearest(origin: WorldPoint, ctx: WorldContext): LocationResult | null {
  const steps = worldRingSteps(origin, FOREST_SEARCH_STEP, FOREST_SEARCH_MAX_RADIUS)
  const found = searchNearest(steps, (point) =>
    ctx.sampleForestBiome(point.x, point.z) === 'deepForest' ? point : null)
  if (!found) return null
  return { kind: 'deepForest', position: found.point, distance: distanceFrom(origin, found.point) }
}

const OCEAN_SEARCH_STEP = 32
const OCEAN_SEARCH_MAX_RADIUS = 1500

/** Pure continentalness classification — `WorldOcean` (the follow-player
 *  render plane) has no geographic query capability and is never touched. */
export function oceanNearest(origin: WorldPoint, ctx: WorldContext): LocationResult | null {
  const steps = worldRingSteps(origin, OCEAN_SEARCH_STEP, OCEAN_SEARCH_MAX_RADIUS)
  const found = searchNearest(steps, (point) =>
    ctx.sampleContinentalness(point.x, point.z) < ctx.region.oceanThreshold ? point : null)
  if (!found) return null
  return { kind: 'ocean', position: found.point, distance: distanceFrom(origin, found.point) }
}

/** Debug-only "is this land safe to stand on" gate (plan `ui-input-008`) —
 *  rejects a chain point sitting at/near the global `waterLevel`, so a chain
 *  terminating in a lake/ocean (`HydrologyFlag.OCEAN_OUTLET` legitimately
 *  covers both) is never picked as the representative teleport point. Not a
 *  hydrology constant: `computeRiverTile()`/`HydrologyFlag` are untouched —
 *  this only filters the debug projection layer's own candidate selection.
 *  @domain ui-input */
const RIVER_DEBUG_LAND_MARGIN = 0.5

type QualifiedRiverPoint = { point: WorldPoint, distance: number, isInterior: boolean }

function betterRiverCandidate(a: QualifiedRiverPoint, b: QualifiedRiverPoint): QualifiedRiverPoint {
  if (a.isInterior !== b.isInterior) return a.isInterior ? a : b
  return a.distance <= b.distance ? a : b
}

/** Selects the single best debug-teleport-worthy point across `chains` (plan
 *  `ui-input-008`): rejects any point within `RIVER_DEBUG_LAND_MARGIN` of
 *  `waterLevel` (drops lake/ocean termini and near-shore points), then among
 *  the remainder prefers a chain-interior point over a chain terminal —
 *  terminals are disproportionately likely to sit right at a water-body
 *  outlet or another chain's own head — finally breaking ties by nearest
 *  distance to `origin`. A chain too short to have an interior point still
 *  produces a candidate via its qualifying terminal. Pure/deterministic over
 *  the already-computed `RiverPoint` data already in hand — no rendered-
 *  terrain resampling. `null` when nothing in `chains` clears the margin.
 *  @domain ui-input */
function qualifyingChainPoint(chains: readonly RiverChain[], origin: WorldPoint, waterLevel: number): WorldPoint | null {
  let best: QualifiedRiverPoint | null = null
  for (const chain of chains) {
    const points = chain.points
    const lastIndex = points.length - 1
    for (let i = 0; i <= lastIndex; i++) {
      const p = points[i]!
      if (p.elevation <= waterLevel + RIVER_DEBUG_LAND_MARGIN) continue
      const candidate: QualifiedRiverPoint = {
        point: { x: p.x, z: p.z },
        distance: distanceFrom(origin, p),
        isInterior: i > 0 && i < lastIndex,
      }
      best = best === null ? candidate : betterRiverCandidate(best, candidate)
    }
  }
  return best?.point ?? null
}

/** Probe granularity is a whole river tile (`RIVER_TILE_SIZE = 256`), not a
 *  point — `computeRiverTile` builds a small hydrology grid per call, so
 *  probing point-by-point would be far more expensive than necessary. Calls
 *  the pure `computeRiverTile` directly, never `riverTileCache.retain`/
 *  `release` (that cache is ref-counted and tied to chunk load/unload —
 *  calling it from here would corrupt its accounting). */
const RIVER_SEARCH_MAX_TILE_RADIUS = 4

export function riverNearest(origin: WorldPoint, config: WorldConfig): LocationResult | null {
  const params = rawSampleParamsFromWorld(config)
  const originTile = riverTileCoordOf(origin.x, origin.z)
  const steps = cellRingSteps(originTile, RIVER_SEARCH_MAX_TILE_RADIUS, (o, dx, dz) => ({ tx: o.tx + dx, tz: o.tz + dz }))
  const found = searchNearest(steps, (tile) => {
    const chains = computeRiverTile(tile, params)
    return chains.length > 0 ? qualifyingChainPoint(chains, origin, params.waterLevel) : null
  })
  if (!found) return null
  // The tile-ring distance isn't the real answer here — recompute from the
  // actual chain point picked inside the tile.
  return { kind: 'river', position: found.data, distance: distanceFrom(origin, found.data) }
}

/** How close a chain's terminal point must land to another chain's head
 *  point to treat them as the *same* physical river split across a river
 *  tile boundary, rather than two unrelated streams (plan `ui-input-008`).
 *  Chain endpoints are the raw, un-meandered/un-smoothed grid points
 *  (`buildChains`/`meanderChainPoints` never move the first/last point), and
 *  neighbouring tiles sample the exact same world-aligned lattice
 *  (`RIVER_TILE_SIZE` is a whole multiple of `RIVER_CELL_STEP`), so a real
 *  continuation lands within one diagonal D8 step of its neighbour's own
 *  head. */
const RIVER_CHAIN_STITCH_MAX_DISTANCE = RIVER_CELL_STEP * 1.5

/** A continuation's accumulation should closely match the point it
 *  continues from — two tiles' own halo-bounded catchment estimates for the
 *  same physical drainage line near their shared edge are expected to agree
 *  closely (see `RIVER_TILE_HALO`'s doc in `riverNetwork.ts`) but not
 *  bit-for-bit, so this stays a relative tolerance rather than an exact
 *  match. */
const RIVER_CHAIN_STITCH_ACCUMULATION_TOLERANCE = 0.25

function isChainContinuation(from: RiverPoint, to: RiverPoint): boolean {
  const dist = Math.hypot(from.x - to.x, from.z - to.z)
  if (dist > RIVER_CHAIN_STITCH_MAX_DISTANCE) return false
  const scale = Math.max(from.accumulation, to.accumulation, 1)
  return Math.abs(from.accumulation - to.accumulation) <= scale * RIVER_CHAIN_STITCH_ACCUMULATION_TOLERANCE
}

/** Groups `chains` indices whose tail/head pairs look like the same
 *  physical river continuing across a tile boundary (`isChainContinuation`),
 *  via plain union-find — chain counts per bounded search are at most a few
 *  hundred, so this O(n^2) stitch pass costs nothing next to
 *  `computeRiverTile` itself. Groups are returned ordered by the smallest
 *  original index they contain, so output order tracks the deterministic
 *  tile-ring scan order `riversNearby` walks chains in. */
function groupContinuousChains(chains: readonly RiverChain[]): number[][] {
  const parent = chains.map((_, i) => i)
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }
  function union(a: number, b: number): void {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let i = 0; i < chains.length; i++) {
    const tail = chains[i]!.points[chains[i]!.points.length - 1]!
    for (let j = 0; j < chains.length; j++) {
      if (i === j) continue
      const head = chains[j]!.points[0]!
      if (isChainContinuation(tail, head)) union(i, j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < chains.length; i++) {
    const root = find(i)
    const group = groups.get(root)
    if (group) group.push(i)
    else groups.set(root, [i])
  }
  return [...groups.values()].sort((a, b) => Math.min(...a) - Math.min(...b))
}

const RIVER_NEARBY_MAX_RESULTS = 6

/**
 * Bounded, deterministic "several distinct rivers near the player" query
 * (plan `ui-input-008`) — same tile-ring search radius and per-tile
 * `computeRiverTile` cost as `riverNearest()`, except it keeps scanning the
 * whole bounded radius and returns up to `maxResults` *different* rivers
 * instead of stopping at the first candidate. "Different river" is decided
 * by `groupContinuousChains`: chains that look like the same physical stream
 * split across a tile boundary are merged into one group before a single
 * representative point is chosen with the same `qualifyingChainPoint` rule
 * `riverNearest()` uses, so a single long river crossing several tiles is
 * never reported more than once. Builds nothing persistent — every call
 * recomputes from the current `computeRiverTile` data.
 * @domain ui-input
 */
export function riversNearby(
  origin: WorldPoint,
  config: WorldConfig,
  maxResults = RIVER_NEARBY_MAX_RESULTS,
): LocationResult[] {
  const params = rawSampleParamsFromWorld(config)
  const originTile = riverTileCoordOf(origin.x, origin.z)
  const steps = cellRingSteps(originTile, RIVER_SEARCH_MAX_TILE_RADIUS, (o, dx, dz) => ({ tx: o.tx + dx, tz: o.tz + dz }))
  const chains: RiverChain[] = []
  for (const step of steps) {
    for (const tile of step.points) {
      chains.push(...computeRiverTile(tile, params))
    }
  }

  const results: LocationResult[] = []
  for (const group of groupContinuousChains(chains)) {
    if (results.length >= maxResults) break
    const point = qualifyingChainPoint(group.map((i) => chains[i]!), origin, params.waterLevel)
    if (!point) continue
    results.push({ kind: 'river', position: point, distance: distanceFrom(origin, point) })
  }
  return results
}

/** Grid-cell radius (`SETTLEMENT_GRID_STEP = 280` per cell) searched outward
 *  for a village — generous enough to reliably find one near spawn while
 *  staying cheap: `peekDef` is cached and never loads meshes. */
const VILLAGE_SEARCH_MAX_CELL_RADIUS = 8

export function villageNearest(origin: WorldPoint, settlementsManager: SettlementsManager): LocationResult | null {
  const originCell = worldToCell(origin.x, origin.z)
  const steps = cellRingSteps(originCell, VILLAGE_SEARCH_MAX_CELL_RADIUS, (o, dx, dz) => ({ gx: o.gx + dx, gz: o.gz + dz }))
  const found = searchNearest(steps, (cell) => settlementsManager.peekDef(cell))
  if (!found) return null
  const def = found.data
  return {
    kind: 'village',
    position: { x: def.x, z: def.z },
    distance: distanceFrom(origin, { x: def.x, z: def.z }),
    id: def.id,
    name: def.name,
    size: def.size,
  }
}
