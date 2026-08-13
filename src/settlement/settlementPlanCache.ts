import type { HomeVillageSize } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
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

const defCache = new Map<string, SettlementDef | null>()

export function clearSettlementDefCache(): void {
  defCache.clear()
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
  )
  defCache.set(key, def)
  return def
}

export function cachedSettlementDefCount(): number {
  return defCache.size
}
