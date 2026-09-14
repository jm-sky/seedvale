import type { ProductionShortageRecord } from '../economy/productionShortage'
import type { NpcPressure } from './Needs'
import {
  isProductionShortagePersistent,
  PRODUCTION_SHORTAGE_PERSISTENCE_SEC,
} from '../economy/productionShortage'

/**
 * Production-shortage → diagnostic pressure (plan settlements-npcs-017).
 * Pure: does not pick actions, extend NeedId, or compete in `pickActionKind`.
 * `target` is `idle` so inspection can list the score without faking wood/food.
 *
 * @domain settlements-npcs
 */
export function productionShortagePressure(
  record: ProductionShortageRecord,
  simTime: number,
): number {
  if (!isProductionShortagePersistent(record, simTime)) return 0
  const extra = simTime - record.firstBlockedSimTime - PRODUCTION_SHORTAGE_PERSISTENCE_SEC
  return Math.min(1, 0.28 + extra / (PRODUCTION_SHORTAGE_PERSISTENCE_SEC * 4))
}

/**
 * One diagnostic `NpcPressure` per persistent shortage visible to this NPC.
 *
 * @domain settlements-npcs
 */
export function productionShortagePressures(
  records: readonly ProductionShortageRecord[],
  simTime: number,
  householdId?: string,
): NpcPressure[] {
  const pressures: NpcPressure[] = []
  for (const record of records) {
    if (record.householdId !== undefined && record.householdId !== householdId) continue
    const value = productionShortagePressure(record, simTime)
    if (value <= 0) continue
    pressures.push({
      source: `economy.productionShortage.${record.recipeId}.${record.kind}`,
      target: 'idle',
      value,
    })
  }
  return pressures
}
