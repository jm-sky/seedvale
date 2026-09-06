import type { HomeVillageSize } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { RiverQuery } from '../terrain/riverQuery'
import type { TerrainSamplers } from './settlementTerrain'
import {
  cellKey,
  generateSettlementDef,
  type SettlementCell,
  type SettlementDef,
} from './settlementGenerator'

/** Shared generation context for the single settlement-definition cache
 *  (plan 047 §9.14–15). Both `SettlementsManager` and `RoadNetwork` must
 *  resolve defs through this module — never keep a second authoritative cache. */
export type SettlementResolveContext = {
  seed: number
  sampleHeight: HeightSampler
  waterLevel: number
  localSearchRadius: number
  terrainSamplers: TerrainSamplers
  heightScale: number
  region: RegionParams
  /** Home village size override (`WorldConfig.settlements.homeSize`). */
  homeSize?: HomeVillageSize
}

/** The running world's canonical river geometry lookup (`terrain/riverQuery.ts`).
 *  World-scoped rather than a `SettlementResolveContext` field on purpose: the
 *  def cache below is itself world-scoped and "first resolver wins", so if one
 *  caller (`SettlementsManager`) passed a query and another (`ChunkManager`'s
 *  road context) did not, a village's layout would silently depend on which
 *  one asked first. One registration point makes that impossible.
 *  `null` (the default, and after `clearSettlementDefCache`) means settlements
 *  generate river-agnostically, as they did before world-terrain river
 *  integration — the behaviour unit tests and any hydrology-less caller get. */
let activeRiverQuery: RiverQuery | null = null

/** Registers the river query for the world being built. Call once per world
 *  (`ChunkManager` construction), always *after* `clearSettlementDefCache()`
 *  has dropped the previous world's defs. */
export function setSettlementRiverQuery(query: RiverQuery | null): void {
  activeRiverQuery = query
}

const defCache = new Map<string, SettlementDef | null>()

export function clearSettlementDefCache(): void {
  defCache.clear()
  activeRiverQuery = null
}

export function settlementDefFor(
  cell: SettlementCell,
  ctx: SettlementResolveContext,
): SettlementDef | null {
  const key = cellKey(cell)
  if (defCache.has(key)) return defCache.get(key)!
  const def = generateSettlementDef(
    cell,
    ctx.seed,
    ctx.sampleHeight,
    ctx.waterLevel,
    ctx.localSearchRadius,
    ctx.terrainSamplers,
    ctx.heightScale,
    ctx.region,
    ctx.homeSize ?? 'auto',
    activeRiverQuery ?? undefined,
  )
  defCache.set(key, def)
  return def
}

export function cachedSettlementDefCount(): number {
  return defCache.size
}
