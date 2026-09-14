import type { OldBonesAdventureCaveBinding } from './oldBonesAdventureCave'

let activeBinding: OldBonesAdventureCaveBinding | null = null

/** Composition-root slot for the active old-bones binding (plan quests-progression-025). */
export function setActiveOldBonesAdventureCaveBinding(binding: OldBonesAdventureCaveBinding | null): void {
  activeBinding = binding
}

export function getActiveOldBonesAdventureCaveBinding(): OldBonesAdventureCaveBinding | null {
  return activeBinding
}
