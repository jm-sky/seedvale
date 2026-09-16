import type { LostTreasureEstateSearchArea } from './lostTreasureEstateSearchArea'

let activeArea: LostTreasureEstateSearchArea | null = null

/** Session/world-bound search-area cache — set once per `WorldBundle` build. */
export function setActiveLostTreasureEstateSearchArea(
  area: LostTreasureEstateSearchArea | null,
): void {
  activeArea = area
}

export function getActiveLostTreasureEstateSearchArea(): LostTreasureEstateSearchArea | null {
  return activeArea
}
