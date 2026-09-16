import type { LostTreasureChronicleDecipheringBinding } from './lostTreasureChronicleDeciphering'

let activeBinding: LostTreasureChronicleDecipheringBinding | null = null

/** Composition-root slot for the chronicle-deciphering chapter (plan quests-progression-039). */
export function setActiveLostTreasureChronicleDecipheringBinding(
  binding: LostTreasureChronicleDecipheringBinding | null,
): void {
  activeBinding = binding
}

export function getActiveLostTreasureChronicleDecipheringBinding(): LostTreasureChronicleDecipheringBinding | null {
  return activeBinding
}
