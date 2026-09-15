import type { LostTreasureChronicleSearchBinding } from './lostTreasureChronicleSearch'

let activeBinding: LostTreasureChronicleSearchBinding | null = null

/** Composition-root slot for the chronicle-search chapter (plan quests-progression-038). */
export function setActiveLostTreasureChronicleSearchBinding(
  binding: LostTreasureChronicleSearchBinding | null,
): void {
  activeBinding = binding
}

export function getActiveLostTreasureChronicleSearchBinding(): LostTreasureChronicleSearchBinding | null {
  return activeBinding
}
