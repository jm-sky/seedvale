import { describe, expect, it } from 'vitest'
import { isSaveData, loadSaveData, type SaveConfig, type SaveData } from './saveData'

const config = {
  seed: 1,
  terrain: { chunkSize: 64 },
  sky: { inclination: 0.5 },
  player: { name: 'Ja' },
  settlements: {},
} as SaveConfig

const validSave: SaveData = {
  version: 1,
  config,
  player: { x: 3, z: 4, yaw: 0.1, pitch: 0.2 },
  savedAt: 100,
  quests: { progress: [], exp: 0, relations: {} },
  inventory: {},
  inventoryInstances: [],
  collectedItemIds: [],
  droppedItems: [],
  placedFires: [],
  timeOfDay: 0.32,
  elapsedDays: 2,
  heldTool: null,
  treeOverrides: {},
  playerTorch: null,
  placedTents: [],
  placedTraps: [],
  worldFlags: {},
  map: { discoveredCells: ['0,0', '1,0'] },
  settlementEconomies: { home: { stock: { wood: 1 }, food: { counts: { carrot: 3 }, instances: [] } } },
  playerNeeds: { hunger: 12, thirst: 8, vigor: 40, starvationDuration: 5400, dehydrationDuration: 900 },
  ownedLandPlots: ['0_0:plot-sale-0'],
  skills: {
    sneak: { xp: 42 },
    survival: { xp: 7 },
    traps: { xp: 28 },
    defense: { xp: 0 },
    archery: { xp: 0 },
    riding: { xp: 0 },
  },
  spawnPoints: [
    { id: 'home:cave', state: 'disabled', deathsThisCycle: 2, disabledAtDay: 9.5 },
    { id: 'home:thicket', state: 'active', deathsThisCycle: 0, disabledAtDay: null },
  ],
  foodBatches: { berries: [{ count: 3, acquiredAtDays: 1.5 }] },
  dryingRacks: [{ id: 'dryingrack:0', x: 1, z: 2, yaw: 0, process: null }],
  hives: [{ id: 'hive:0', x: 3, z: 4, yaw: 0, lastCollectedAtDay: 2, burned: false, burnRewardCollected: false }],
  fishingBait: { 'fishspot:1:2': { kind: 'berries', appliedAtDays: 1, expiresAtDays: 4, strength: 1 } },
  harvestedCropIds: ['0:0:crop0', '1:-2:crop1'],
  placedContainers: [
    { id: 'chest:1', kind: 'chest', x: 5, z: -3, yaw: 0.4, counts: { stone: 2 }, instances: [] },
  ],
  carriedContainer: { id: 'chest:2', kind: 'chest', counts: {}, instances: [] },
  playerWells: [{ id: 'well:1', x: 5, z: -3, yaw: 0.4, stage: 'well', workProgress: 1.25 }],
  terrainPreparations: [{
    id: 'terrainPrep:1',
    x: 2,
    z: -4,
    size: 3,
    targetHeight: 10.5,
    originalHeights: [{ x: 1, z: -5, height: 10 }],
    requiredWork: 2,
    completedWork: 0.5,
  }],
  terrainModifications: [
    { mode: 'dig', x: 1, z: 2, radius: 1.4, depth: 0.28 },
    { mode: 'scorch', x: 3, z: 4, radius: 3, depth: 0.15 },
    { mode: 'prepare', id: 'level:1:2', samples: [{ x: 1, z: 2, height: 10.5 }] },
  ],
  plantedTrees: [{ id: 'planted:1', x: 5, z: 5, speciesIndex: 2, sizeClass: 'small', sizeJitter: 0.3, rotationY: 1.1 }],
  plantedCrops: [{ id: 'planted-crop:1', x: 6, z: 6, cropId: 'carrot', stageStartedAt: 4.2 }],
  playerGardens: [{
    id: 'garden:1', x: 7, z: 8, yaw: 0.4, care: 82, lastMaintainedAtDays: 3.5,
    hydration: 60, lastHydrationUpdateAtDays: 3.5, droughtStressDays: 0,
  }],
  resourceDeposits: { 'resource_1_2': 0, 'resource_3_4': 5 },
}

describe('loadSaveData v1 contract', () => {
  it('round-trips a fully-formed native save', () => {
    const loaded = loadSaveData(validSave)
    expect(loaded).toEqual(validSave)
    expect(isSaveData(loaded)).toBe(true)
  })

  it('rejects a non-v1 version', () => {
    expect(loadSaveData({ ...validSave, version: 2 })).toBeNull()
    expect(loadSaveData({ ...validSave, version: 27 })).toBeNull()
  })

  it('rejects a save missing required fields (no migration path)', () => {
    expect(loadSaveData({
      version: 1,
      config,
      player: { x: 0, z: 0, yaw: 0, pitch: 0 },
      savedAt: 1,
    })).toBeNull()
  })

  it('rejects a config missing settlements', () => {
    const { settlements: _settlements, ...configWithoutSettlements } = config
    expect(loadSaveData({ ...validSave, config: configWithoutSettlements })).toBeNull()
  })

  it('rejects a malformed skills field', () => {
    expect(loadSaveData({ ...validSave, skills: { ...validSave.skills, sneak: { xp: 'a' } } })).toBeNull()
    expect(loadSaveData({ ...validSave, skills: { sneak: { xp: 1 } } })).toBeNull()
  })

  it('rejects a malformed placed-trap record', () => {
    expect(loadSaveData({ ...validSave, placedTraps: [{ id: 't', kind: 'huge' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, placedTraps: 'nope' })).toBeNull()
  })

  it('rejects a malformed spawn-point record', () => {
    expect(loadSaveData({ ...validSave, spawnPoints: [{ id: 'x', state: 'burning', deathsThisCycle: 0, disabledAtDay: null }] })).toBeNull()
    expect(loadSaveData({ ...validSave, spawnPoints: 'nope' })).toBeNull()
  })

  it('rejects malformed inventory instances', () => {
    expect(loadSaveData({ ...validSave, inventoryInstances: [{ id: 'x', kind: 'trap_simple' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, inventoryInstances: 'nope' })).toBeNull()
  })

  it('accepts empty, partial and full liquid-container instance rows (plan items-player-001)', () => {
    expect(loadSaveData({
      ...validSave,
      inventoryInstances: [
        { id: 'a', kind: 'wooden_bucket' },
        { id: 'b', kind: 'waterskin_small', liquid: 'water', amountLitres: 1 },
        { id: 'c', kind: 'copper_bucket', liquid: 'milk', amountLitres: 10 },
      ],
    })).not.toBeNull()
  })

  it('rejects an invalid liquid content or a negative amountLitres', () => {
    expect(loadSaveData({
      ...validSave,
      inventoryInstances: [{ id: 'x', kind: 'waterskin_small', liquid: 'wine', amountLitres: 1 }],
    })).toBeNull()
    expect(loadSaveData({
      ...validSave,
      inventoryInstances: [{ id: 'x', kind: 'waterskin_small', liquid: 'water', amountLitres: -1 }],
    })).toBeNull()
  })

  it('rejects malformed food/drying/hive/fishing fields', () => {
    expect(loadSaveData({ ...validSave, foodBatches: { berries: [{ count: 'x', acquiredAtDays: 1 }] } })).toBeNull()
    expect(loadSaveData({ ...validSave, dryingRacks: [{ id: 'r', x: 0, z: 0, yaw: 0, process: { kind: 'bogus' } }] })).toBeNull()
    expect(loadSaveData({ ...validSave, hives: [{ id: 'h', x: 0, z: 0, yaw: 0, burned: 'nope' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, fishingBait: { spot: { kind: 'fish' } } })).toBeNull()
  })

  it('rejects a non-array harvestedCropIds', () => {
    expect(loadSaveData({ ...validSave, harvestedCropIds: 'nope' })).toBeNull()
  })

  it('rejects malformed container fields', () => {
    expect(loadSaveData({ ...validSave, placedContainers: [{ id: 'c', kind: 'barrel', x: 0, z: 0, yaw: 0, counts: {}, instances: [] }] })).toBeNull()
    expect(loadSaveData({ ...validSave, placedContainers: 'nope' })).toBeNull()
    expect(loadSaveData({ ...validSave, carriedContainer: { id: 'c', kind: 'chest' } })).toBeNull()
  })

  it('rejects malformed player-well fields', () => {
    expect(loadSaveData({ ...validSave, playerWells: [{ id: 'w', x: 0, z: 0, yaw: 0, stage: 'roofed', workProgress: 0 }] })).toBeNull()
    expect(loadSaveData({ ...validSave, playerWells: [{ id: 'w', x: 0, z: 0, yaw: 0, stage: 'pit', workProgress: 'nope' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, playerWells: 'nope' })).toBeNull()
  })

  it('rejects malformed planted-tree/crop fields', () => {
    expect(loadSaveData({ ...validSave, plantedTrees: [{ id: 't', x: 0, z: 0, speciesIndex: 0, sizeClass: 'huge', sizeJitter: 0.5, rotationY: 0 }] })).toBeNull()
    expect(loadSaveData({ ...validSave, plantedTrees: 'nope' })).toBeNull()
    expect(loadSaveData({ ...validSave, plantedCrops: [{ id: 'c', x: 0, z: 0, cropId: 'tomato', stageStartedAt: 0 }] })).toBeNull()
    expect(loadSaveData({ ...validSave, plantedCrops: 'nope' })).toBeNull()
  })

  it('rejects malformed garden-plot fields', () => {
    expect(loadSaveData({ ...validSave, playerGardens: [{ id: 'g', x: 0, z: 0 }] })).toBeNull()
    expect(loadSaveData({ ...validSave, playerGardens: 'nope' })).toBeNull()
  })

  it('rejects malformed resource-deposit fields', () => {
    expect(loadSaveData({ ...validSave, resourceDeposits: { a: 'nope' } })).toBeNull()
    expect(loadSaveData({ ...validSave, resourceDeposits: 'nope' })).toBeNull()
  })

  it('rejects malformed starvation/dehydration duration fields', () => {
    expect(loadSaveData({ ...validSave, playerNeeds: { hunger: 100, thirst: 100, vigor: 100, starvationDuration: 'nope', dehydrationDuration: 0 } })).toBeNull()
    expect(loadSaveData({ ...validSave, playerNeeds: { hunger: 100, thirst: 100, vigor: 100, dehydrationDuration: 0 } })).toBeNull()
  })
})
