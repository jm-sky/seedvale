import { describe, expect, it } from 'vitest'
import { SNEAK_LEGACY_XP } from '../player/PlayerSkills'
import { isSaveDataV18, loadSaveData, type SaveConfig, type SaveDataV10, type SaveDataV11 } from './saveData'

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
    expect(loaded?.version).toBe(18)
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
    expect(isSaveDataV18(loaded)).toBe(true)
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
    expect(loaded?.version).toBe(18)
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
    expect(isSaveDataV18(loaded)).toBe(true)
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
    expect(isSaveDataV18(loaded)).toBe(true)
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
    expect(isSaveDataV18(loaded)).toBe(true)
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
    expect(isSaveDataV18(loaded)).toBe(true)
    expect(loaded?.skills.sneak.xp).toBe(SNEAK_LEGACY_XP)
    expect(loaded?.skills.survival.xp).toBe(0)
  })

  it('round-trips xp from a native v15 save', () => {
    const loaded = loadSaveData({
      ...v14,
      version: 15,
      skills: { sneak: { xp: 42 }, survival: { xp: 7 } },
    })
    expect(isSaveDataV18(loaded)).toBe(true)
    expect(loaded?.skills.sneak.xp).toBe(42)
    expect(loaded?.skills.survival.xp).toBe(7)
  })

  it('rejects a v15 save with a malformed skills field', () => {
    expect(loadSaveData({ ...v14, version: 15, skills: { sneak: { xp: 'a' }, survival: { xp: 0 } } })).toBeNull()
    expect(loadSaveData({ ...v14, version: 15, skills: { sneak: { xp: 1 } } })).toBeNull()
  })
})

describe('loadSaveData v16 animal traps (plan 141)', () => {
  const v15 = {
    ...v10,
    version: 15,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 42 }, survival: { xp: 7 } },
  }

  it('migrates a v15 save to no traps and a fresh Traps skill', () => {
    const loaded = loadSaveData(v15)
    expect(isSaveDataV18(loaded)).toBe(true)
    expect(loaded?.placedTraps).toEqual([])
    expect(loaded?.skills.traps.xp).toBe(0)
    expect(loaded?.skills.sneak.xp).toBe(42)
    expect(loaded?.skills.survival.xp).toBe(7)
  })

  it('round-trips placed traps and Traps xp from a native v16 save', () => {
    const trap = {
      id: 'trap:1',
      kind: 'good' as const,
      x: 5,
      z: -3,
      yaw: 0.4,
      state: 'active' as const,
      durability: 3.5,
      skillAtActivation: 0.62,
      weatherCheckedAtDay: 12.3,
    }
    const loaded = loadSaveData({
      ...v15,
      version: 16,
      skills: { sneak: { xp: 42 }, survival: { xp: 7 }, traps: { xp: 28 } },
      placedTraps: [trap],
    })
    expect(isSaveDataV18(loaded)).toBe(true)
    expect(loaded?.placedTraps).toEqual([trap])
    expect(loaded?.skills.traps.xp).toBe(28)
  })

  it('rejects a v16 save with a malformed trap record', () => {
    const base = { ...v15, version: 16, skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 } } }
    expect(loadSaveData({ ...base, placedTraps: [{ id: 't', kind: 'huge' }] })).toBeNull()
    expect(loadSaveData({ ...base, placedTraps: 'nope' })).toBeNull()
  })
})

describe('loadSaveData v17 fauna spawn-point lifecycle (plan 125 persistence follow-up)', () => {
  const v16 = {
    ...v10,
    version: 16,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 42 }, survival: { xp: 7 }, traps: { xp: 0 } },
    placedTraps: [],
  }

  it('migrates a v16 save to no spawn-point entries', () => {
    const loaded = loadSaveData(v16)
    expect(isSaveDataV18(loaded)).toBe(true)
    expect(loaded?.spawnPoints).toEqual([])
  })

  it('round-trips spawn-point lifecycle from a native v17 save', () => {
    const spawnPoints = [
      { id: 'home:cave', state: 'disabled' as const, deathsThisCycle: 2, disabledAtDay: 9.5 },
      { id: 'home:thicket', state: 'active' as const, deathsThisCycle: 0, disabledAtDay: null },
    ]
    const loaded = loadSaveData({ ...v16, version: 17, spawnPoints })
    expect(isSaveDataV18(loaded)).toBe(true)
    expect(loaded?.spawnPoints).toEqual(spawnPoints)
    expect(loaded?.skills.defense).toEqual({ xp: 0 })
  })

  it('rejects a v17 save with a malformed spawn-point record', () => {
    const base = { ...v16, version: 17 }
    expect(loadSaveData({ ...base, spawnPoints: [{ id: 'x', state: 'burning', deathsThisCycle: 0, disabledAtDay: null }] })).toBeNull()
    expect(loadSaveData({ ...base, spawnPoints: 'nope' })).toBeNull()
  })
})
