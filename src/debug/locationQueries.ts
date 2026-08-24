import type { WorldConfig } from '../config/worldConfig'
import type { VillageSize } from '../settlement/families'
import type { SettlementsManager } from '../settlement/SettlementsManager'
import type { RiverChain } from '../terrain/riverNetwork'
import type { WorldContext } from '../world/worldContext'
import { worldToCell } from '../settlement/settlementGenerator'
import { MOUNTAIN_RIDGE_THRESHOLD } from '../settlement/settlementTerrain'
import { computeRiverTile, riverTileCoordOf } from '../terrain/riverNetwork'
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

function nearestChainPoint(chains: readonly RiverChain[], origin: WorldPoint): WorldPoint | null {
  let best: WorldPoint | null = null
  let bestDistance = Infinity
  for (const chain of chains) {
    for (const p of chain.points) {
      const d = distanceFrom(origin, p)
      if (d < bestDistance) {
        bestDistance = d
        best = { x: p.x, z: p.z }
      }
    }
  }
  return best
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
    return chains.length > 0 ? nearestChainPoint(chains, origin) : null
  })
  if (!found) return null
  // The tile-ring distance isn't the real answer here — recompute from the
  // actual chain point picked inside the tile.
  return { kind: 'river', position: found.data, distance: distanceFrom(origin, found.data) }
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
