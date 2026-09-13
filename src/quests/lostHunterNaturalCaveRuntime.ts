import type { LostHunterNaturalCaveBinding } from './lostHunterNaturalCave'

let activeBinding: LostHunterNaturalCaveBinding | null = null

/** Composition-root slot for the active lost-hunter binding (plan quests-progression-023). */
export function setActiveLostHunterNaturalCaveBinding(binding: LostHunterNaturalCaveBinding | null): void {
  activeBinding = binding
}

export function getActiveLostHunterNaturalCaveBinding(): LostHunterNaturalCaveBinding | null {
  return activeBinding
}
