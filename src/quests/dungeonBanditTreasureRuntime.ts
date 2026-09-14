import type { DungeonBanditTreasureBinding } from './dungeonBanditTreasure'

let activeBinding: DungeonBanditTreasureBinding | null = null

/** Composition-root slot for the active dungeon bandit binding (plan quests-progression-026). */
export function setActiveDungeonBanditTreasureBinding(
  binding: DungeonBanditTreasureBinding | null,
): void {
  activeBinding = binding
}

export function getActiveDungeonBanditTreasureBinding(): DungeonBanditTreasureBinding | null {
  return activeBinding
}
