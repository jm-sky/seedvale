import type { DarkForestTreasureSite } from './darkForestTreasureSite'

let activeSite: DarkForestTreasureSite | null = null

/** Session/world-bound site cache — set once per `WorldBundle` build before
 *  home chunks finish loading (plan quests-progression-009). */
export function setActiveDarkForestTreasureSite(site: DarkForestTreasureSite | null): void {
  activeSite = site
}

export function getActiveDarkForestTreasureSite(): DarkForestTreasureSite | null {
  return activeSite
}
