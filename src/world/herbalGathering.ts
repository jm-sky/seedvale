import type { ItemKind } from '../items/items'
import type { ChunkManager } from '../terrain/chunkManager'

/** World resources an `herbalist` may gather (plan settlements-npcs-007). */
export const HERBALIST_GATHER_KINDS: readonly ItemKind[] = ['herb', 'flax', 'poisonous_herb']

const HERBALIST_GATHER_KIND_SET = new Set<ItemKind>(HERBALIST_GATHER_KINDS)

export type HerbalGatherTarget = {
  id: string
  kind: ItemKind
  x: number
  z: number
}

/**
 * NPC herbal-resource discovery (plan settlements-npcs-007) — mirrors
 * `SettlementFoodSourceHooks` for medicinal/flax world chunk items.
 */
export type SettlementHerbalGatherHooks = {
  queryNearest: (x: number, z: number, range: number) => HerbalGatherTarget | null
  /** Re-validates and collects `target` — null when already taken. */
  harvest: (target: HerbalGatherTarget) => { count: number, kind: ItemKind } | null
}

/** Max Chebyshev chunk rings for off-screen herbal queries. */
const OFFSCREEN_CHUNK_RADIUS = 3

/**
 * Binds herbal gather queries to a live `ChunkManager` (plan settlements-npcs-007).
 *
 * @domain settlements-npcs
 */
export function createHerbalGatherHooks(chunkManager: ChunkManager): SettlementHerbalGatherHooks {
  return {
    queryNearest(x, z, range) {
      return chunkManager.findNearestWorldItem(
        { x, z },
        range,
        HERBALIST_GATHER_KINDS,
        OFFSCREEN_CHUNK_RADIUS,
      )
    },
    harvest(target) {
      const collected = chunkManager.collectItem(target.id)
      return collected ? { count: 1, kind: collected.kind } : null
    },
  }
}

/** @internal — tests */
export function nearestHerbalGatherTarget(
  x: number,
  z: number,
  items: readonly HerbalGatherTarget[],
  radius: number,
): HerbalGatherTarget | null {
  let best: HerbalGatherTarget | null = null
  let bestDistSq = radius * radius
  for (const item of items) {
    if (!HERBALIST_GATHER_KIND_SET.has(item.kind)) continue
    const dx = item.x - x
    const dz = item.z - z
    const distSq = dx * dx + dz * dz
    if (distSq > bestDistSq) continue
    if (best && distSq === bestDistSq && item.id >= best.id) continue
    best = item
    bestDistSq = distSq
  }
  return best
}
