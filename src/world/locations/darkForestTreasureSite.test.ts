import { describe, expect, it } from 'vitest'
import {
  DARK_FOREST_TREASURE_LOCATION_ID,
  darkForestTreasureChestId,
  darkForestTreasureWolfDenId,
  isDarkForestTreasureChestLooted,
} from './darkForestTreasureSite'

describe('darkForestTreasureSite (quests-progression-009)', () => {
  it('exposes stable location and container ids', () => {
    expect(DARK_FOREST_TREASURE_LOCATION_ID).toBe('ruins:dark-forest-treasure')
    expect(darkForestTreasureChestId()).toBe('world-container:dark-forest-treasure')
    expect(darkForestTreasureWolfDenId(0)).toBe('dark-forest-treasure:wolfDen:0')
  })

  it('detects depleted treasure chest', () => {
    expect(isDarkForestTreasureChestLooted({ coin: 1, ruby: 1 })).toBe(false)
    expect(isDarkForestTreasureChestLooted({ coin: 0, ruby: 0 })).toBe(true)
  })
})
