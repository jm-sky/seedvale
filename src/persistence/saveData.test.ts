import { describe, expect, it } from 'vitest'
import { SNEAK_LEGACY_XP } from '../player/PlayerSkills'
import { isSaveDataV15, loadSaveData, type SaveConfig, type SaveDataV10, type SaveDataV11 } from './saveData'

const config = {
  seed: 1,
  terrain: { chunkSize: 64 },
  sky: { inclination: 0.5 },
  player: { name: 'Ja' },
} as SaveConfig

const v10: SaveDataV10 = {
  version: 10,
  config,
  player: { x: 3, z: 4, yaw: 0.1, pitch: 0.2 },
  savedAt: 100,
  quests: { progress: [], exp: 0, relations: {} },
  inventory: {},
  collectedItemIds: [],
  droppedItems: [],
  placedFires: [],
  timeOfDay: 0.32,
  elapsedDays: 2,
  heldTool: null,
  treeOverrides: {},
  playerTorch: null,
  placedTents: [],
  worldFlags: {},
}

describe('loadSaveData v11 map discovery', () => {
  it('migrates a v10 save to empty discovery', () => {
    const loaded = loadSaveData(v10)
    expect(loaded).not.toBeNull()
    expect(loaded?.version).toBe(15)
    expect(loaded?.map.discoveredCells).toEqual([])
    expect(loaded?.player.x).toBe(3)
    expect(loaded?.elapsedDays).toBe(2)
    expect(loaded?.settlementEconomies).toEqual({})
    expect(loaded?.playerNeeds).toEqual({ hunger: 100, thirst: 100, vigor: 100 })
    expect(loaded?.ownedLandPlots).toEqual([])
  })

  it('keeps discovered cells from a v11 save', () => {
    const v11: SaveDataV11 = {
      ...v10,
      version: 11,
      map: { discoveredCells: ['0,0', '1,0'] },
    }
    const loaded = loadSaveData(v11)
    expect(isSaveDataV15(loaded)).toBe(true)
    expect(loaded?.map.discoveredCells).toEqual(['0,0', '1,0'])
    expect(loaded?.settlementEconomies).toEqual({})
  })

  it('rejects a v11 save with a non-array discovery field', () => {
    expect(loadSaveData({ ...v10, version: 11, map: { discoveredCells: 1 } })).toBeNull()
  })

  it('migrates a v1 save through to empty discovery', () => {
    const loaded = loadSaveData({
      version: 1,
      config,
      player: { x: 0, z: 0, yaw: 0, pitch: 0 },
      savedAt: 1,
    })
    expect(loaded?.version).toBe(15)
    expect(loaded?.map.discoveredCells).toEqual([])
  })

  it('keeps settlementEconomies from a native v12 save', () => {
    const v12 = {
      ...v10,
      version: 12,
      map: { discoveredCells: [] },
      settlementEconomies: { home: { food: 3, wood: 1 } },
    }
    const loaded = loadSaveData(v12)
    expect(isSaveDataV15(loaded)).toBe(true)
    expect(loaded?.settlementEconomies).toEqual({ home: { food: 3, wood: 1 } })
    expect(loaded?.playerNeeds).toEqual({ hunger: 100, thirst: 100, vigor: 100 })
  })
})

describe('loadSaveData v14 land ownership (plan 129)', () => {
  it('migrates a pre-v14 save to an empty owned-plots list', () => {
    const v13 = {
      ...v10,
      version: 13,
      map: { discoveredCells: [] },
      settlementEconomies: {},
      playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    }
    const loaded = loadSaveData(v13)
    expect(isSaveDataV15(loaded)).toBe(true)
    expect(loaded?.ownedLandPlots).toEqual([])
  })

  it('keeps ownedLandPlots from a native v14 save', () => {
    const v14 = {
      ...v10,
      version: 14,
      map: { discoveredCells: [] },
      settlementEconomies: {},
      playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
      ownedLandPlots: ['0_0:plot-sale-0'],
    }
    const loaded = loadSaveData(v14)
    expect(isSaveDataV15(loaded)).toBe(true)
    expect(loaded?.ownedLandPlots).toEqual(['0_0:plot-sale-0'])
  })

  it('rejects a v14 save with a non-array ownedLandPlots field', () => {
    const bad = {
      ...v10,
      version: 14,
      map: { discoveredCells: [] },
      settlementEconomies: {},
      playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
      ownedLandPlots: 'not-an-array',
    }
    expect(loadSaveData(bad)).toBeNull()
  })
})

describe('loadSaveData v15 skills (plan 128)', () => {
  const v14 = {
    ...v10,
    version: 14,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
  }

  it('migrates a v14 save to legacy Sneak and a fresh Survival', () => {
    const loaded = loadSaveData(v14)
    expect(isSaveDataV15(loaded)).toBe(true)
    expect(loaded?.skills.sneak.xp).toBe(SNEAK_LEGACY_XP)
    expect(loaded?.skills.survival.xp).toBe(0)
  })

  it('round-trips xp from a native v15 save', () => {
    const loaded = loadSaveData({
      ...v14,
      version: 15,
      skills: { sneak: { xp: 42 }, survival: { xp: 7 } },
    })
    expect(isSaveDataV15(loaded)).toBe(true)
    expect(loaded?.skills.sneak.xp).toBe(42)
    expect(loaded?.skills.survival.xp).toBe(7)
  })

  it('rejects a v15 save with a malformed skills field', () => {
    expect(loadSaveData({ ...v14, version: 15, skills: { sneak: { xp: 'a' }, survival: { xp: 0 } } })).toBeNull()
    expect(loadSaveData({ ...v14, version: 15, skills: { sneak: { xp: 1 } } })).toBeNull()
  })
})
