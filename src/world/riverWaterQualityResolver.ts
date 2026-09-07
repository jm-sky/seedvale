import type { SettlementCell, SettlementDef } from '../settlement/settlementGenerator'
import type { WaterQuality } from './WaterSource'
import { isNearSettlement } from '../settlement/settlementProximity'
import { RIVER_CELL_STEP, type RiverHydrologyContext } from '../terrain/riverNetwork'
import { applyRiverWaterQualityModifiers, classifyBaseRiverWaterQuality } from './riverWaterQuality'

/**
 * World-scoped lazy resolver + cache composing river hydrology context and
 * settlement proximity into a final river `WaterQuality` (plan world-017 §6).
 * Takes its two dependencies as plain functions rather than full
 * `ChunkManager`/`SettlementsManager` references, so it stays trivially
 * testable and has no import-cycle risk with either.
 *
 * Create one instance per `WorldBundle`, once both `ChunkManager` and
 * `SettlementsManager` exist — the cache below is intentionally not
 * persisted (no `SaveData` entry) and must not survive a world rebuild or
 * seed change, so a fresh instance per bundle *is* that lifecycle contract;
 * nothing explicitly clears it.
 *
 * @domain world
 * @system river-water-quality
 * @role Owns the only river-water-quality cache; composes a river-context
 *  query and a settlement-def lookup through the pure classifier in
 *  `riverWaterQuality.ts`.
 */
export type RiverWaterQualityResolver = {
  /** Lazy, cached, fail-closed-to-`unsafe` river water quality at a world
   *  point already known (by the caller) to be a river shoreline. */
  resolve: (worldX: number, worldZ: number) => WaterQuality
}

export function createRiverWaterQualityResolver(
  /** `ChunkManager.riverWaterContext` in production. */
  riverWaterContext: (worldX: number, worldZ: number) => RiverHydrologyContext | null,
  /** `SettlementsManager.peekDef` in production. */
  peekSettlementDef: (cell: SettlementCell) => SettlementDef | null,
): RiverWaterQualityResolver {
  const cache = new Map<string, WaterQuality>()

  return {
    resolve(worldX, worldZ) {
      const context = riverWaterContext(worldX, worldZ)
      // A point the caller already resolved as a river shoreline but that
      // yields no hydrology context here is a query failure, not "no river"
      // — fail-closed to the conservative answer (plan world-017 §5.1)
      // instead of resurrecting the old blanket `safe`.
      if (context === null) return 'unsafe'

      const cellX = Math.floor(context.x / RIVER_CELL_STEP)
      const cellZ = Math.floor(context.z / RIVER_CELL_STEP)
      const key = `${cellX},${cellZ}`
      const cached = cache.get(key)
      if (cached !== undefined) return cached

      const base = classifyBaseRiverWaterQuality(context)
      const nearSettlement = isNearSettlement(peekSettlementDef, context.x, context.z)
      const quality = applyRiverWaterQualityModifiers(base, { nearSettlement })
      cache.set(key, quality)
      return quality
    },
  }
}
