import type { ItemKind } from '../items/items'
import type { ChunkManager } from '../terrain/chunkManager'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { CROP_DEFS, type CropGrowthStage, type CropId, resolveCropHarvest } from './cropLifecycle'

/**
 * A concrete, actionable hunger source found by a bounded local scan (plan
 * 174) — natural world-item food (berries/nuts/etc., plan 159) or a
 * harvestable crop (wild, plan 172, or player-planted, plan 126/174, on a
 * player garden plot or a settlement garden alike — both are just
 * `CropPlacement`s to `ChunkManager.getNearbyCrops`). A temporary decision
 * representation only: never persisted, never copied into NPC state — the
 * underlying world item/crop stays the single source of truth.
 */
export type FoodSourceTarget =
  | { kind: 'item', id: string, itemKind: ItemKind, x: number, z: number }
  | { kind: 'crop', id: string, cropId: CropId, x: number, z: number, stage: CropGrowthStage }

/** Narrow view over `ChunkManager` for NPC hunger-source discovery (plan
 *  174) — mirrors `SettlementForestHooks`/`SettlementMiningHooks`'s shape:
 *  just the domain operations a settlement needs, not the whole manager. */
export type SettlementFoodSourceHooks = {
  /** Nearest available food source within `range` of `(x, z)` among
   *  currently loaded chunks — same "loaded chunks only, no global scan"
   *  contract as `ChunkManager.getNearbyItems`/`getNearbyCrops`. */
  queryNearest: (x: number, z: number, range: number) => FoodSourceTarget | null
  /** Re-validates and harvests `target` — null if it's gone (already
   *  collected/harvested by another NPC or the player since discovery), in
   *  which case the caller must not grant any hunger relief. */
  harvest: (target: FoodSourceTarget) => { count: number } | null
}

/**
 * Deterministic nearest-available food source among `items`/`crops` within
 * `radius` of (x, z) — natural world items whose catalog `consumable.need`
 * is `'hunger'`, and crops in a harvestable stage (`resolveCropHarvest`).
 * Pure/bounded: callers must already have narrowed both lists to loaded
 * chunks. Stable tie-break by id so equal-distance candidates resolve the
 * same way every time (plan 174 §13 — no `Math.random()`).
 */
export function nearestFoodSource(
  x: number,
  z: number,
  items: readonly { id: string, kind: ItemKind, x: number, z: number }[],
  crops: readonly { id: string, cropId: CropId, x: number, z: number, stage: CropGrowthStage }[],
  radius: number,
): FoodSourceTarget | null {
  let best: FoodSourceTarget | null = null
  let bestDistSq = radius * radius

  for (const item of items) {
    if (ITEM_CATALOG[item.kind].consumable?.need !== 'hunger') continue
    const dx = item.x - x
    const dz = item.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > bestDistSq) continue
    if (best && distSq === bestDistSq && item.id >= best.id) continue
    best = { kind: 'item', id: item.id, itemKind: item.kind, x: item.x, z: item.z }
    bestDistSq = distSq
  }
  for (const crop of crops) {
    if (!resolveCropHarvest(CROP_DEFS[crop.cropId], crop.stage)) continue
    const dx = crop.x - x
    const dz = crop.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > bestDistSq) continue
    if (best && distSq === bestDistSq && crop.id >= best.id) continue
    best = { kind: 'crop', id: crop.id, cropId: crop.cropId, x: crop.x, z: crop.z, stage: crop.stage }
    bestDistSq = distSq
  }
  return best
}

/** Binds `nearestFoodSource` + harvest re-validation to a live `ChunkManager`
 *  — the `SettlementFoodSourceHooks` instance threaded into every `NpcAgent`
 *  (plan 174), same construction shape as `mining`/`forest` in
 *  `app/worldBundle.ts`. */
export function createFoodSourceHooks(chunkManager: ChunkManager): SettlementFoodSourceHooks {
  return {
    queryNearest(x, z, range) {
      const items = chunkManager.getNearbyItems({ x, z }, range)
      const crops = chunkManager.getNearbyCrops({ x, z }, range)
      return nearestFoodSource(x, z, items, crops, range)
    },
    harvest(target) {
      if (target.kind === 'item') {
        return chunkManager.collectItem(target.id) ? { count: 1 } : null
      }
      const outcome = chunkManager.harvestCrop(target.id)
      return outcome.ok ? { count: outcome.yield.count } : null
    },
  }
}
