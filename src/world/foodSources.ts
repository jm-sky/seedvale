import type { ItemKind } from '../items/items'
import type { ChunkManager } from '../terrain/chunkManager'
import type { PlayerGardens } from './createPlayerGardens'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { CROP_DEFS, type CropGrowthStage, type CropId, resolveCropHarvest } from './cropLifecycle'
import { cultivationYieldCount, findNearestGarden, resolveCultivationCare } from './playerGarden'

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
   *  which case the caller must not grant any hunger relief. A crop harvested
   *  from within a player garden plot's radius has its yield scaled by the
   *  plot's resolved care (plan 176 §13) — `count` can legitimately be `0`
   *  for a heavily-neglected plot; the harvest itself (crop removal from the
   *  world) still happened. */
  harvest: (target: FoodSourceTarget) => { count: number } | null
  /** Nearest player-built garden plot within reach of `(x, z)` (plan 176
   *  §6.1's "NPC already at the field" condition) — only ever called right
   *  after `harvest` succeeded for a `crop` target, never as an independent
   *  search. `null` when no plot owns that position (a wild crop or a
   *  settlement-garden crop, neither of which carries maintenance state). */
  gardenNear: (x: number, z: number) => { id: string, care: number } | null
  /** Re-validates `id` still exists and applies maintenance — `false` if the
   *  plot was removed (decayed away) since `gardenNear` found it. */
  maintainGarden: (id: string) => boolean
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
 *  and `PlayerGardens` — the `SettlementFoodSourceHooks` instance threaded
 *  into every `NpcAgent` (plan 174/176), same construction shape as
 *  `mining`/`forest` in `app/worldBundle.ts`. */
export function createFoodSourceHooks(
  chunkManager: ChunkManager,
  playerGardens: PlayerGardens,
  getWorldDays: () => number,
): SettlementFoodSourceHooks {
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
      if (!outcome.ok) return null
      const garden = findNearestGarden(playerGardens.list(), target.x, target.z)
      const count = garden
        ? cultivationYieldCount(outcome.yield.count, resolveCultivationCare(garden, getWorldDays()))
        : outcome.yield.count
      return { count }
    },
    gardenNear(x, z) {
      const garden = findNearestGarden(playerGardens.list(), x, z)
      return garden ? { id: garden.id, care: resolveCultivationCare(garden, getWorldDays()) } : null
    },
    maintainGarden(id) {
      return playerGardens.applyMaintenance(id, getWorldDays()) !== null
    },
  }
}
