import type { LocationKnowledge } from './locationKnowledge'
import type { NavigationTargets } from './navigationTargets'
import type { WorldLocationCatalog } from './worldLocationCatalog'

export type RevealLocationKnowledgeResult = {
  newlyDiscovered: boolean
  navigationSet: boolean
  locationName: string | null
}

/**
 * Shared seam for revealing an existing `WorldLocation` into player knowledge
 * and optionally setting a navigation target (plan world-012 / quests-progression-009).
 *
 * @domain world
 */
export function revealLocationKnowledge(
  locationId: string,
  catalog: WorldLocationCatalog,
  knowledge: LocationKnowledge,
  navigationTargets: NavigationTargets,
  options?: { setNavigation?: boolean },
): RevealLocationKnowledgeResult {
  const location = catalog.getById(locationId)
  if (!location) {
    return { newlyDiscovered: false, navigationSet: false, locationName: null }
  }
  const newlyDiscovered = knowledge.reveal(locationId, 'discovered', 'map')
  let navigationSet = false
  if (options?.setNavigation) {
    const result = navigationTargets.set(locationId)
    navigationSet = result === 'ok' || result === 'already_set'
  }
  return { newlyDiscovered, navigationSet, locationName: location.name }
}
