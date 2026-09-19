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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Adult stag antler drop chance (plan fauna-044). Actor-neutral baseline 75%;
 * optional `[0,1]` Survival coefficient adds up to 15 points (max 90%).
 *
 * @domain fauna
 */
export function stagAntlerDropChance(survivalValue?: number): number {
  if (survivalValue == null || !Number.isFinite(survivalValue)) return 0.75
  const clamped = clamp01(survivalValue)
  return clamp01(0.75 + 0.15 * clamped)
}

/**
 * Deterministic trophy loot for knife harvest (plan quests-progression-020).
 * One roll per authoritative corpse lifetime — callers invoke only inside the
 * first successful `harvestAnimalIntoInventory` after `harvestMeat()`.
 *
 * @domain fauna
 */
export function trophyLootKindsForHarvest(
  animal: AnimalAgent,
  options?: { survivalValue?: number },
): readonly ItemKind[] {
  if (animal.def.kind !== 'stag' || animal.isJuvenile()) return []
  const roll = createSeededRandom(hashId(`antler:${animal.animalId}`))()
  return roll < stagAntlerDropChance(options?.survivalValue) ? ['antler'] : []
}
