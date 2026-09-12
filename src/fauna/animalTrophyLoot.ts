import type { ItemKind } from '../items/items'
import type { AnimalAgent } from './AnimalAgent'
import { createSeededRandom } from '../world/parseSeed'

/** FNV-1a string hash — same idiom as `huntingHooks.ts`. */
function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Deterministic trophy loot for knife harvest (plan quests-progression-020).
 * One roll per authoritative corpse lifetime — callers invoke only inside the
 * first successful `harvestAnimalIntoInventory` after `harvestMeat()`.
 *
 * @domain fauna
 */
export function trophyLootKindsForHarvest(animal: AnimalAgent): readonly ItemKind[] {
  if (animal.def.kind !== 'stag' || animal.isJuvenile()) return []
  const roll = createSeededRandom(hashId(`antler:${animal.animalId}`))()
  return roll < 0.5 ? ['antler'] : []
}
