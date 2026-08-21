import { describe, expect, it } from 'vitest'
import { SNEAK_LEGACY_XP } from '../player/PlayerSkills'
import { isSaveDataV25, loadSaveData, type SaveConfig, type SaveDataV10, type SaveDataV11 } from './saveData'

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
    expect(loaded?.version).toBe(25)
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
    expect(isSaveDataV25(loaded)).toBe(true)
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
    expect(loaded?.version).toBe(25)
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
    expect(isSaveDataV25(loaded)).toBe(true)
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
    expect(isSaveDataV25(loaded)).toBe(true)
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
    expect(isSaveDataV25(loaded)).toBe(true)
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
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.skills.sneak.xp).toBe(SNEAK_LEGACY_XP)
    expect(loaded?.skills.survival.xp).toBe(0)
  })

  it('round-trips xp from a native v15 save', () => {
    const loaded = loadSaveData({
      ...v14,
      version: 15,
      skills: { sneak: { xp: 42 }, survival: { xp: 7 } },
    })
    expect(isSaveDataV25(loaded)).toBe(true)
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
    expect(isSaveDataV25(loaded)).toBe(true)
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
    expect(isSaveDataV25(loaded)).toBe(true)
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
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.spawnPoints).toEqual([])
  })

  it('round-trips spawn-point lifecycle from a native v17 save', () => {
    const spawnPoints = [
      { id: 'home:cave', state: 'disabled' as const, deathsThisCycle: 2, disabledAtDay: 9.5 },
      { id: 'home:thicket', state: 'active' as const, deathsThisCycle: 0, disabledAtDay: null },
    ]
    const loaded = loadSaveData({ ...v16, version: 17, spawnPoints })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.spawnPoints).toEqual(spawnPoints)
    expect(loaded?.skills.defense).toEqual({ xp: 0 })
  })

  it('rejects a v17 save with a malformed spawn-point record', () => {
    const base = { ...v16, version: 17 }
    expect(loadSaveData({ ...base, spawnPoints: [{ id: 'x', state: 'burning', deathsThisCycle: 0, disabledAtDay: null }] })).toBeNull()
    expect(loadSaveData({ ...base, spawnPoints: 'nope' })).toBeNull()
  })
})

describe('loadSaveData v19 inventory instances (plan 155)', () => {
  const v18 = {
    ...v10,
    version: 18,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 }, defense: { xp: 0 } },
    placedTraps: [],
    spawnPoints: [],
  }

  it('migrates a v18 save to an empty inventoryInstances list', () => {
    const loaded = loadSaveData(v18)
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.inventoryInstances).toEqual([])
    expect(loaded?.inventory).toEqual({})
  })

  it('round-trips inventory instances from a native v19 save', () => {
    const inventoryInstances = [
      { id: 'item:1', kind: 'trap_simple' as const, durability: 1 },
      { id: 'item:2', kind: 'trap_good' as const, durability: 0 },
    ]
    const loaded = loadSaveData({ ...v18, version: 19, inventoryInstances })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.inventoryInstances).toEqual(inventoryInstances)
  })

  it('rejects malformed inventoryInstances records', () => {
    const base = { ...v18, version: 19 }
    expect(loadSaveData({ ...base, inventoryInstances: [{ id: 'x', kind: 'trap_simple' }] })).toBeNull()
    expect(loadSaveData({ ...base, inventoryInstances: 'nope' })).toBeNull()
  })
})

describe('loadSaveData v20 natural food/fishing/preservation/bait (plan 159)', () => {
  const v19 = {
    ...v10,
    version: 19,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 }, defense: { xp: 0 } },
    placedTraps: [],
    spawnPoints: [],
    inventoryInstances: [],
  }

  it('migrates a v19 save to empty food/fishing/preservation state', () => {
    const loaded = loadSaveData(v19)
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.foodBatches).toEqual({})
    expect(loaded?.dryingRacks).toEqual([])
    expect(loaded?.hives).toEqual([])
    expect(loaded?.fishingBait).toEqual({})
  })

  it('round-trips food batches, drying racks, hives and fishing bait from a native v20 save', () => {
    const foodBatches = { berries: [{ count: 3, acquiredAtDays: 1.5 }] }
    const dryingRacks = [{ id: 'dryingrack:0', x: 1, z: 2, yaw: 0, process: null }]
    const hives = [{ id: 'hive:0', x: 3, z: 4, yaw: 0, lastCollectedAtDay: 2, burned: false, burnRewardCollected: false }]
    const fishingBait = { 'fishspot:1:2': { kind: 'berries', appliedAtDays: 1, expiresAtDays: 4, strength: 1 } }
    const loaded = loadSaveData({ ...v19, version: 20, foodBatches, dryingRacks, hives, fishingBait })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.foodBatches).toEqual(foodBatches)
    expect(loaded?.dryingRacks).toEqual(dryingRacks)
    expect(loaded?.hives).toEqual(hives)
    expect(loaded?.fishingBait).toEqual(fishingBait)
  })

  it('rejects malformed v20 fields', () => {
    const base = { ...v19, version: 20, foodBatches: {}, dryingRacks: [], hives: [], fishingBait: {} }
    expect(loadSaveData({ ...base, foodBatches: { berries: [{ count: 'x', acquiredAtDays: 1 }] } })).toBeNull()
    expect(loadSaveData({ ...base, dryingRacks: [{ id: 'r', x: 0, z: 0, yaw: 0, process: { kind: 'bogus' } }] })).toBeNull()
    expect(loadSaveData({ ...base, hives: [{ id: 'h', x: 0, z: 0, yaw: 0, burned: 'nope' }] })).toBeNull()
    expect(loadSaveData({ ...base, fishingBait: { spot: { kind: 'fish' } } })).toBeNull()
  })
})

describe('loadSaveData v21 natural crop lifecycle (plan 172)', () => {
  const v20 = {
    ...v10,
    version: 20,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 }, defense: { xp: 0 }, archery: { xp: 0 } },
    placedTraps: [],
    spawnPoints: [],
    inventoryInstances: [],
    foodBatches: {},
    dryingRacks: [],
    hives: [],
    fishingBait: {},
  }

  it('migrates a v20 save to no harvested crops', () => {
    const loaded = loadSaveData(v20)
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.harvestedCropIds).toEqual([])
  })

  it('round-trips harvested crop ids from a native v21 save', () => {
    const harvestedCropIds = ['0:0:crop0', '1:-2:crop1']
    const loaded = loadSaveData({ ...v20, version: 21, harvestedCropIds })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.harvestedCropIds).toEqual(harvestedCropIds)
  })

  it('rejects a non-array harvestedCropIds', () => {
    expect(loadSaveData({ ...v20, version: 21, harvestedCropIds: 'nope' })).toBeNull()
  })
})

describe('loadSaveData v22 player storage & containers (plan 164)', () => {
  const v21 = {
    ...v10,
    version: 21,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 }, defense: { xp: 0 }, archery: { xp: 0 } },
    placedTraps: [],
    spawnPoints: [],
    inventoryInstances: [],
    foodBatches: {},
    dryingRacks: [],
    hives: [],
    fishingBait: {},
    harvestedCropIds: [],
  }

  it('migrates a v21 save to no placed/carried containers', () => {
    const loaded = loadSaveData(v21)
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.placedContainers).toEqual([])
    expect(loaded?.carriedContainer).toBeNull()
  })

  it('round-trips placed and carried containers from a native v22 save', () => {
    const placedContainers = [
      { id: 'chest:1', kind: 'chest' as const, x: 5, z: -3, yaw: 0.4, counts: { stone: 2 }, instances: [] },
    ]
    const carriedContainer = { id: 'chest:2', kind: 'chest' as const, counts: {}, instances: [] }
    const loaded = loadSaveData({ ...v21, version: 22, placedContainers, carriedContainer })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.placedContainers).toEqual(placedContainers)
    expect(loaded?.carriedContainer).toEqual(carriedContainer)
  })

  it('rejects malformed v22 container fields', () => {
    const base = { ...v21, version: 22 }
    expect(loadSaveData({ ...base, placedContainers: [{ id: 'c', kind: 'barrel', x: 0, z: 0, yaw: 0, counts: {}, instances: [] }] })).toBeNull()
    expect(loadSaveData({ ...base, placedContainers: 'nope', carriedContainer: null })).toBeNull()
    expect(loadSaveData({ ...base, placedContainers: [], carriedContainer: { id: 'c', kind: 'chest' } })).toBeNull()
  })
})

describe('loadSaveData v24 player-built wells (plan 127, active-work revision)', () => {
  const v22 = {
    ...v10,
    version: 22,
    map: { discoveredCells: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 }, defense: { xp: 0 }, archery: { xp: 0 } },
    placedTraps: [],
    spawnPoints: [],
    inventoryInstances: [],
    foodBatches: {},
    dryingRacks: [],
    hives: [],
    fishingBait: {},
    harvestedCropIds: [],
    placedContainers: [],
    carriedContainer: null,
  }

  it('migrates a v22 save to no player-built wells', () => {
    const loaded = loadSaveData(v22)
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.playerWells).toEqual([])
  })

  it('round-trips player-built wells (with workProgress) from a native v24 save', () => {
    const playerWells = [
      { id: 'well:1', x: 5, z: -3, yaw: 0.4, stage: 'well' as const, workProgress: 1.25 },
    ]
    const loaded = loadSaveData({ ...v22, version: 24, playerWells })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.playerWells).toEqual(playerWells)
  })

  it('migrates a v23 save (stageStartedAt) to v24 by resetting workProgress to 0 — no offline/retroactive progress is fabricated', () => {
    const v23PlayerWells = [
      { id: 'well:1', x: 5, z: -3, yaw: 0.4, stage: 'well' as const, stageStartedAt: 3.5 },
      { id: 'well:2', x: 1, z: 1, yaw: 0, stage: 'pit' as const, stageStartedAt: 0 },
    ]
    const loaded = loadSaveData({ ...v22, version: 23, playerWells: v23PlayerWells })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.playerWells).toEqual([
      { id: 'well:1', x: 5, z: -3, yaw: 0.4, stage: 'well', workProgress: 0 },
      { id: 'well:2', x: 1, z: 1, yaw: 0, stage: 'pit', workProgress: 0 },
    ])
  })

  it('rejects malformed v24 player-well fields', () => {
    const base = { ...v22, version: 24 }
    expect(loadSaveData({ ...base, playerWells: [{ id: 'w', x: 0, z: 0, yaw: 0, stage: 'roofed', workProgress: 0 }] })).toBeNull()
    expect(loadSaveData({ ...base, playerWells: [{ id: 'w', x: 0, z: 0, yaw: 0, stage: 'pit', workProgress: 'nope' }] })).toBeNull()
    expect(loadSaveData({ ...base, playerWells: 'nope' })).toBeNull()
  })

  const v24 = { ...v22, version: 24 as const, playerWells: [] }

  it('migrates a v24 save to no planted trees/crops', () => {
    const loaded = loadSaveData(v24)
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.plantedTrees).toEqual([])
    expect(loaded?.plantedCrops).toEqual([])
  })

  it('round-trips planted trees/crops from a native v25 save', () => {
    const plantedTrees = [{ id: 'planted:1:5:5', x: 5, z: 5, speciesIndex: 2, sizeClass: 'small' as const, sizeJitter: 0.3, rotationY: 1.1 }]
    const plantedCrops = [{ id: 'planted-crop:1:6:6', x: 6, z: 6, cropId: 'carrot' as const, stageStartedAt: 4.2 }]
    const loaded = loadSaveData({ ...v24, version: 25, plantedTrees, plantedCrops })
    expect(isSaveDataV25(loaded)).toBe(true)
    expect(loaded?.plantedTrees).toEqual(plantedTrees)
    expect(loaded?.plantedCrops).toEqual(plantedCrops)
  })

  it('rejects malformed v25 planted-tree/crop fields', () => {
    const base = { ...v24, version: 25, plantedCrops: [] }
    expect(loadSaveData({ ...base, plantedTrees: [{ id: 't', x: 0, z: 0, speciesIndex: 0, sizeClass: 'huge', sizeJitter: 0.5, rotationY: 0 }] })).toBeNull()
    expect(loadSaveData({ ...base, plantedTrees: 'nope' })).toBeNull()
    const base2 = { ...v24, version: 25, plantedTrees: [] }
    expect(loadSaveData({ ...base2, plantedCrops: [{ id: 'c', x: 0, z: 0, cropId: 'tomato', stageStartedAt: 0 }] })).toBeNull()
    expect(loadSaveData({ ...base2, plantedCrops: 'nope' })).toBeNull()
  })
})
