import type { SuspiciousTransportCaveCacheBinding } from './suspiciousTransportCaveCache'

let activeBinding: SuspiciousTransportCaveCacheBinding | null = null

/** Composition-root slot for the cave-cache variant (plan quests-progression-024). */
export function setActiveSuspiciousTransportCaveCacheBinding(
  binding: SuspiciousTransportCaveCacheBinding | null,
): void {
  activeBinding = binding
}

export function getActiveSuspiciousTransportCaveCacheBinding(): SuspiciousTransportCaveCacheBinding | null {
  return activeBinding
}
