import type { LostTreasureExpeditionBinding } from './lostTreasureExpedition'

let activeBinding: LostTreasureExpeditionBinding | null = null

/** Composition-root slot for the active lost-treasure-expedition binding (plan quests-progression-027). */
export function setActiveLostTreasureExpeditionBinding(
  binding: LostTreasureExpeditionBinding | null,
): void {
  activeBinding = binding
}

export function getActiveLostTreasureExpeditionBinding(): LostTreasureExpeditionBinding | null {
  return activeBinding
}
