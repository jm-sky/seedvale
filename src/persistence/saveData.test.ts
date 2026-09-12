import { describe, expect, it } from 'vitest'
import { createPlayerSkills, restorePersistedSkills, SKILL_MIN_VALUE } from '../player/PlayerSkills'
import { PALISADE_REQUIRED_WORK } from '../world/palisade'
import { STANDING_TORCH_REQUIRED_WORK } from '../world/standingTorch'
import {
  CURRENT_SAVE_VERSION,
  isSaveData,
  loadSaveData,
  loadStoredSave,
  migrateStoredSave,
  type SaveConfig,
  type SaveData,
  type SaveMigration,
} from './saveData'

const config = {
  seed: 1,
  terrain: { chunkSize: 64 },
  sky: { inclination: 0.5 },
  player: { name: 'Ja' },
  settlements: {},
} as SaveConfig

const validSave: SaveData = {
  version: CURRENT_SAVE_VERSION,
  config,
  player: { x: 3, z: 4, yaw: 0.1, pitch: 0.2 },
  savedAt: 100,
  quests: { progress: [], relations: {} },
  inventory: {},
  inventoryInstances: [],
  collectedItemIds: [],
  droppedItems: [],
  placedFires: [],
  timeOfDay: 0.32,
  elapsedDays: 2,
  heldTool: null,
  primaryMeleeWeapon: null,
  primaryRangedWeapon: null,
  treeOverrides: {},
  playerTorch: null,
  placedTents: [],
  placedTraps: [],
  carts: [],
  graves: [],
  worldFlags: {},
  resolvedHiddenFindSpotIds: ['cemetery:0:0:0:1:0', 'stoneCircle:2:1:0:1'],
  badges: { earned: ['treasure_hunter'], hiddenFindsFound: 5 },
  map: {
    discoveredCells: ['0,0', '1,0'],
    discoveredLocations: [{ id: 'cave:home-cave-0', state: 'confirmed', source: 'exploration' }],
    targets: ['cave:home-cave-0'],
  },
  settlementEconomies: { home: { stock: { wood: 1 }, food: { counts: { carrot: 3 }, instances: [], foodBatches: {} } } },
  playerNeeds: { hunger: 12, thirst: 8, vigor: 40, starvationDuration: 5400, dehydrationDuration: 900 },
  ownedLandPlots: ['0_0:plot-sale-0'],
    skills: {
      sneak: { xp: 42 },
      survival: { xp: 7 },
      traps: { xp: 28 },
      defense: { xp: 0 },
      archery: { xp: 0 },
      riding: { xp: 0 },
      medicine: { xp: 0 },
      repair: { xp: 0 },
    },
  spawnPoints: [
    { id: 'home:cave', state: 'disabled', deathsThisCycle: 2, disabledAtDay: 9.5 },
    { id: 'home:thicket', state: 'active', deathsThisCycle: 0, disabledAtDay: null },
  ],
  foodBatches: { berries: [{ count: 3, acquiredAtDays: 1.5, accumulatedEffectiveAge: 0, lastCheckpointDays: 1.5, decayModifier: 1 }] },
  dryingRacks: [{ id: 'dryingrack:0', x: 1, z: 2, yaw: 0, process: null }],
  hives: [{ id: 'hive:0', x: 3, z: 4, yaw: 0, lastCollectedAtDay: 2, burned: false, burnRewardCollected: false }],
  fishingBait: { 'fishspot:1:2': { kind: 'berries', appliedAtDays: 1, expiresAtDays: 4, strength: 1 } },
  harvestedCropIds: ['0:0:crop0', '1:-2:crop1'],
  placedContainers: [
    { id: 'chest:1', kind: 'chest', x: 5, z: -3, yaw: 0.4, counts: { stone: 2 }, instances: [], foodBatches: {} },
  ],
  carriedContainer: { id: 'chest:2', kind: 'chest', counts: {}, instances: [], foodBatches: {} },
  playerWells: [{ id: 'well:1', x: 5, z: -3, yaw: 0.4, stage: 'well', workProgress: 1.25, waterDepth: 5, waterKind: 'groundwater' }],
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
  completedTerrainPreparations: [{ id: 'terrainPrep:done', x: 12, z: -8, size: 6 }],
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
  standingTorches: [{ id: 'standingTorch:1', x: 9, z: 10, yaw: 0.4, lit: true, completedWork: 1, burnUntilDays: 2.25 }],
  playerTroughs: [],
  palisades: [{ id: 'palisade:1', x: 11, z: -2, yaw: 0.4, completedWork: 1.5 }],
  residentialBuildings: [],
  bedrolls: [{ id: 'bedroll:1', x: 12, z: -3, yaw: 0.4, variant: 'leather', condition: 90, lastConditionUpdateAtDays: 3.5 }],
  platforms: [{ id: 'platform:1', x: 13, z: -4, yaw: 0.4, condition: 95, lastConditionUpdateAtDays: 3.5 }],
  resourceDeposits: { 'resource_1_2': 0, 'resource_3_4': 5 },
  workContracts: [{
    id: 'workContract:1',
    employer: 'player',
    workType: 'construction',
    target: { kind: 'construction', targetId: 'contractTarget:1' },
    x: 14,
    z: -5,
    rewardCoins: 25,
    state: 'advertised',
    advertisement: 'posted',
    postedBoardId: 'noticeBoard:home',
    createdAt: 2,
    postedAt: 2.1,
    requestedWorkerCount: 1,
    assignments: [],
    requestedWorkShare: 0.5,
    remainingWorkAtCreation: 6,
    committedWork: 3,
    npcWorkCompleted: 1,
  }],
  persistentHabitatOccupants: [],
  removedPersistentOccupantSlots: [],
}

describe('loadSaveData v1 contract', () => {
  it('round-trips a fully-formed native save', () => {
    const loaded = loadSaveData(validSave)
    expect(loaded).toEqual(validSave)
    expect(isSaveData(loaded)).toBe(true)
  })

  it('round-trips player-built trough records (plan items-player-020)', () => {
    const save = {
      ...validSave,
      playerTroughs: [{ id: 'playerTrough:1', x: 10, z: 11, yaw: 0.2, completedWork: 1.5, waterLitres: 4 }],
    }
    const loaded = loadSaveData(save)
    expect(loaded).toEqual(save)
    expect(isSaveData(loaded)).toBe(true)
  })

  it('rejects a non-current version', () => {
    expect(loadSaveData({ ...validSave, version: 1 })).toBeNull()
    expect(loadSaveData({ ...validSave, version: CURRENT_SAVE_VERSION + 1 })).toBeNull()
  })

  it('rejects a save missing required fields (no migration path)', () => {
    expect(loadSaveData({
      version: CURRENT_SAVE_VERSION,
      config,
      player: { x: 0, z: 0, yaw: 0, pitch: 0 },
      savedAt: 1,
    })).toBeNull()
  })

  it('rejects a malformed location-knowledge or targets field (plan world-012)', () => {
    expect(loadSaveData({ ...validSave, map: { ...validSave.map, discoveredLocations: [{ id: 'x', state: 'bogus', source: 'npc' }] } })).toBeNull()
    expect(loadSaveData({ ...validSave, map: { ...validSave.map, discoveredLocations: 'nope' } })).toBeNull()
    expect(loadSaveData({ ...validSave, map: { ...validSave.map, targets: [1] } })).toBeNull()
  })

  it('rejects a config missing settlements', () => {
    const { settlements: _settlements, ...configWithoutSettlements } = config
    expect(loadSaveData({ ...validSave, config: configWithoutSettlements })).toBeNull()
  })

  it('rejects a malformed skills field', () => {
    expect(loadSaveData({ ...validSave, skills: { ...validSave.skills, sneak: { xp: 'a' } } })).toBeNull()
    expect(loadSaveData({ ...validSave, skills: { sneak: { xp: 1 } } })).toBeNull()
  })

  it('accepts a current-version save missing medicine/repair (plan items-player-021)', () => {
    const { medicine: _medicine, repair: _repair, ...skillsWithoutNew } = validSave.skills
    const loaded = loadSaveData({ ...validSave, skills: skillsWithoutNew })
    expect(loaded).not.toBeNull()
    expect('medicine' in loaded!.skills).toBe(false)
    expect('repair' in loaded!.skills).toBe(false)
    const skills = createPlayerSkills()
    restorePersistedSkills(skills, loaded!.skills)
    expect(skills.medicine.xp).toBe(0)
    expect(skills.medicine.value).toBe(SKILL_MIN_VALUE)
    expect(skills.repair.xp).toBe(0)
    expect(skills.repair.value).toBe(SKILL_MIN_VALUE)
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

  it('accepts ordinary preparation sizes 2…9 and compact completed-area records (plan world-019)', () => {
    expect(loadSaveData({
      ...validSave,
      terrainPreparations: [{ ...validSave.terrainPreparations[0]!, size: 6 }],
      completedTerrainPreparations: [{ id: 'done:1', x: 1, z: 2, size: 9 }],
    })).not.toBeNull()
  })

  it('rejects unsupported preparation sizes and malformed completed-area metadata', () => {
    expect(loadSaveData({
      ...validSave,
      terrainPreparations: [{ ...validSave.terrainPreparations[0]!, size: 1 }],
    })).toBeNull()
    expect(loadSaveData({
      ...validSave,
      completedTerrainPreparations: [{ id: 'done:1', x: 1, z: 2, size: 10 }],
    })).toBeNull()
    expect(loadSaveData({ ...validSave, completedTerrainPreparations: 'nope' })).toBeNull()
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

  it('rejects malformed work-contract fields', () => {
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], state: 'bogus' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], target: { kind: 'bogus', targetId: 'x' } }] })).toBeNull()
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], advertisement: 'bogus' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], requestedWorkerCount: 0 }] })).toBeNull()
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], assignments: [{ npcId: 'npc:1', state: 'bogus', acceptedAt: 1, workStartedAt: null, workCompleted: 0 }] }] })).toBeNull()
    expect(loadSaveData({ ...validSave, workContracts: 'nope' })).toBeNull()
  })

  it('rejects malformed starvation/dehydration duration fields', () => {
    expect(loadSaveData({ ...validSave, playerNeeds: { hunger: 100, thirst: 100, vigor: 100, starvationDuration: 'nope', dehydrationDuration: 0 } })).toBeNull()
    expect(loadSaveData({ ...validSave, playerNeeds: { hunger: 100, thirst: 100, vigor: 100, dehydrationDuration: 0 } })).toBeNull()
  })

  // Plan persistence-001 — NPC/household/relationship/livestock persistence
  // is optional so an old v1 save (like `validSave` above, which omits every
  // field below) keeps loading unchanged; see the "round-trips a fully-formed
  // native save" test above for that backward-compat case.
  it('accepts a save with the full persistence-001 collections populated', () => {
    const withPersistence: SaveData = {
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 80, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 90, max: 100 },
          needs: { thirst: 0.1, woodDuty: 0.2, waterDuty: 0.1, hunger: 0.3 },
          helperAssignment: { targetContainerId: 'chest:1', resourceKind: 'food', enabled: true },
          activePlan: { goal: 'obtainWood', strategy: null, state: 'active', progress: { amount: 1 }, currentStep: 'findNextTarget' },
          postDeath: null,
          personalInventory: { counts: { knife: 1 }, instances: [] },
        },
      },
      households: {
        'home:household:0': { stock: { wood: 3 }, water: 2, items: { counts: { bread: 2 }, instances: [] } },
      },
      npcRelationships: [{ a: 'home:npc:0', b: 'home:npc:1', value: 4 }],
      livestock: [{
        settlementId: 'home',
        animalId: 'chicken-house0-0',
        kind: 'chicken',
        ownerHouseId: 'home:home:0',
        x: 1,
        z: 2,
        yaw: 0.5,
        health: { current: 10, max: 10, dead: false },
        life: { hunger: 0.2, thirst: 0.1, stamina: 1 },
        productionReadyAtDays: 3.5,
        eggPending: false,
        corpse: null,
      }],
      removedLivestockIds: ['home:chicken-house1-0'],
    }
    expect(loadSaveData(withPersistence)).toEqual(withPersistence)
  })

  it('accepts optional livestock affinity and rejects malformed entries (plan fauna-013)', () => {
    const withAffinity = {
      ...validSave,
      livestock: [{
        settlementId: 'home',
        animalId: 'dog-house0-0',
        kind: 'dog',
        ownerHouseId: 'home:home:0',
        x: 1,
        z: 2,
        yaw: 0.5,
        health: { current: 10, max: 10, dead: false },
        life: { hunger: 0.2, thirst: 0.1, stamina: 1 },
        productionReadyAtDays: null,
        eggPending: false,
        corpse: null,
        affinity: [{ humanId: 'player', value: 0.5 }],
      }],
    }
    expect(loadSaveData(withAffinity)).toEqual(withAffinity)
    expect(loadSaveData({
      ...withAffinity,
      livestock: [{ ...withAffinity.livestock[0], affinity: [{ humanId: '', value: 0.5 }] }],
    })).toBeNull()
  })

  it('accepts optional livestock stray and rejects malformed entries (plan fauna-024)', () => {
    const withStray = {
      ...validSave,
      livestock: [{
        settlementId: 'home',
        animalId: 'sheep-house0-0',
        kind: 'sheep',
        ownerHouseId: 'home:home:0',
        x: 40,
        z: 12,
        yaw: 0.5,
        health: { current: 10, max: 10, dead: false },
        life: { hunger: 0.2, thirst: 0.1, stamina: 1 },
        productionReadyAtDays: null,
        eggPending: false,
        corpse: null,
        stray: {
          active: true,
          originX: 1,
          originZ: 2,
          survivalAssist: true,
          corpseInspected: false,
        },
      }],
    }
    expect(loadSaveData(withStray)).toEqual(withStray)
    expect(loadSaveData({
      ...withStray,
      livestock: [{ ...withStray.livestock[0], stray: { active: true } }],
    })).toBeNull()
  })

  it('accepts optional livestock woolReadyAtDays without a save-version bump (plan fauna-004)', () => {
    const withWool = {
      ...validSave,
      livestock: [{
        settlementId: 'home',
        animalId: 'sheep-house0-0',
        kind: 'sheep',
        ownerHouseId: 'home:home:0',
        x: 1,
        z: 2,
        yaw: 0.5,
        health: { current: 10, max: 10, dead: false },
        life: { hunger: 0.2, thirst: 0.1, stamina: 1 },
        productionReadyAtDays: 0.2,
        eggPending: false,
        corpse: null,
        woolReadyAtDays: 24,
      }],
    }
    expect(loadSaveData(withWool)).toEqual(withWool)
    expect(loadSaveData({
      ...withWool,
      livestock: [{ ...withWool.livestock[0], woolReadyAtDays: 'soon' }],
    })).toBeNull()
  })

  it('rejects a malformed npcStates record', () => {
    expect(loadSaveData({
      ...validSave,
      npcStates: { 'home:npc:0': { health: { current: 1, max: 1, dead: false } } },
    })).toBeNull()
    expect(loadSaveData({ ...validSave, npcStates: 'nope' })).toBeNull()
  })

  it('accepts optional injuryRecoveryUpdatedAtDays and rejects a malformed value (plan npc-025)', () => {
    const withAnchor = {
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 60, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 100, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          physicalInjury: 40,
          injuryRecoveryUpdatedAtDays: 2.5,
          postDeath: null,
          personalInventory: { counts: {}, instances: [] },
        },
      },
    }
    expect(loadSaveData(withAnchor)).toEqual(withAnchor)
    expect(loadSaveData({
      ...withAnchor,
      npcStates: {
        'home:npc:0': {
          ...withAnchor.npcStates['home:npc:0'],
          injuryRecoveryUpdatedAtDays: 'nope',
        },
      },
    })).toBeNull()
  })

  it('rejects a malformed households record', () => {
    expect(loadSaveData({ ...validSave, households: { h: { water: 'nope' } } })).toBeNull()
    expect(loadSaveData({ ...validSave, households: 'nope' })).toBeNull()
    expect(loadSaveData({
      ...validSave,
      households: { h: { stock: { wood: 1 }, water: 2, agriculture: { starterSeedsGranted: 'yes' } } },
    })).toBeNull()
  })

  it('restores an older save with no reputation field as an empty settlements map', () => {
    // `validSave` above omits `reputation` entirely (same backward-compat
    // fixture every other optional persistence-001-style field uses).
    const loaded = loadSaveData(validSave)
    expect(loaded?.reputation).toBeUndefined()
  })

  it('round-trips several settlements, all five dimensions and renown', () => {
    const withReputation: SaveData = {
      ...validSave,
      reputation: {
        settlements: {
          home: {
            reputation: { trust: 10, competence: 15, benevolence: 6, courage: 18, integrity: -5 },
            renown: 25,
          },
          outpost: {
            reputation: { trust: 0, competence: 0, benevolence: 0, courage: 0, integrity: 0 },
            renown: 0,
          },
        },
      },
    }
    expect(loadSaveData(withReputation)).toEqual(withReputation)
  })

  it('rejects a malformed reputation record', () => {
    expect(loadSaveData({
      ...validSave,
      reputation: { settlements: { home: { reputation: { trust: 'nope' }, renown: 0 } } },
    })).toBeNull()
    expect(loadSaveData({
      ...validSave,
      reputation: { settlements: { home: { reputation: { trust: 0, competence: 0, benevolence: 0, courage: 0, integrity: 0 } } } },
    })).toBeNull()
    expect(loadSaveData({ ...validSave, reputation: 'nope' })).toBeNull()
    expect(loadSaveData({ ...validSave, reputation: { settlements: 'nope' } })).toBeNull()
  })

  it('rejects malformed npcRelationships/livestock/removedLivestockIds fields', () => {
    expect(loadSaveData({ ...validSave, npcRelationships: [{ a: 'x' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, npcRelationships: 'nope' })).toBeNull()
    expect(loadSaveData({
      ...validSave,
      livestock: [{
        settlementId: 'home', animalId: 'x', kind: 'dragon', x: 0, z: 0, yaw: 0,
        health: { current: 1, max: 1, dead: false }, life: { hunger: 0, thirst: 0, stamina: 1 },
        productionReadyAtDays: null, eggPending: false, corpse: null,
      }],
    })).toBeNull()
    expect(loadSaveData({ ...validSave, livestock: 'nope' })).toBeNull()
    expect(loadSaveData({ ...validSave, removedLivestockIds: [1] })).toBeNull()
  })
})

describe('schema versioning and migration pipeline (persistence-003)', () => {
  it('CURRENT_SAVE_VERSION is the single source of truth for the current schema', () => {
    expect(validSave.version).toBe(CURRENT_SAVE_VERSION)
    expect(isSaveData({ ...validSave, version: 999 })).toBe(false)
  })

  it('loads a native current-version save through the pipeline without invoking any migration', () => {
    const result = loadStoredSave(validSave)
    expect(result).toEqual({ status: 'ok', data: validSave })
  })

  it('rejects a current-version record that fails schema validation as invalid, not migration-failed', () => {
    expect(loadStoredSave({ ...validSave, inventory: 'nope' })).toEqual({ status: 'invalid' })
  })

  it('rejects values with no detectable version as invalid', () => {
    expect(loadStoredSave(null)).toEqual({ status: 'invalid' })
    expect(loadStoredSave({})).toEqual({ status: 'invalid' })
    expect(loadStoredSave({ version: 'one' })).toEqual({ status: 'invalid' })
  })

  it('rejects a version newer than CURRENT_SAVE_VERSION as unsupported, and never invents a migration for it', () => {
    const future = { ...validSave, version: CURRENT_SAVE_VERSION + 1 }
    expect(loadStoredSave(future)).toEqual({ status: 'unsupported-version', version: CURRENT_SAVE_VERSION + 1 })
  })

  it('reports a version older than the migration floor (v1) as migration-failed, not invalid', () => {
    // 0 — one below the lowest version any registered migration step accepts
    // (`SAVE_MIGRATIONS[1]`) — regardless of how many steps exist above it.
    const olderThanFloor = { ...validSave, version: 0 }
    expect(loadStoredSave(olderThanFloor)).toEqual({ status: 'migration-failed', version: 0 })
  })

  it('migrates a real v1 save (plan world-012) into v2, adding empty location-knowledge/targets and preserving discoveredCells', () => {
    const { discoveredLocations: _discoveredLocations, targets: _targets, ...v1Map } = validSave.map
    const v1Save = { ...validSave, version: 1, map: v1Map }
    expect(loadStoredSave(v1Save)).toEqual({
      status: 'ok',
      data: { ...validSave, map: { ...v1Map, discoveredLocations: [], targets: [] } },
    })
  })

  it('migrates a real v2 save (plan npc-015) into v3, defaulting the new work-contract worker fields to null', () => {
    const v2Save = { ...validSave, version: 2 }
    expect(loadStoredSave(v2Save)).toEqual({ status: 'ok', data: validSave })
  })

  it('migrates a real v3 save (plan world-004) into v4, defaulting the new well groundwater fields', () => {
    const { waterDepth: _d, waterKind: _k, ...v3Well } = validSave.playerWells[0]!
    const v3Save = { ...validSave, version: 3, playerWells: [v3Well] }
    expect(loadStoredSave(v3Save)).toEqual({ status: 'ok', data: validSave })
  })

  it('migrates a real v4 save (plan npc-018) into v5, defaulting the new shared-work commitment fields to full-share/never-fulfilled', () => {
    const {
      requestedWorkShare: _rs,
      remainingWorkAtCreation: _rw,
      committedWork: _cw,
      npcWorkCompleted: _nc,
      ...v4Contract
    } = validSave.workContracts[0]!
    const v4Save = { ...validSave, version: 4, workContracts: [v4Contract] }
    expect(loadStoredSave(v4Save)).toEqual({
      status: 'ok',
      data: {
        ...validSave,
        workContracts: [{
          ...v4Contract,
          requestedWorkShare: 1,
          remainingWorkAtCreation: Number.MAX_SAFE_INTEGER,
          committedWork: Number.MAX_SAFE_INTEGER,
          npcWorkCompleted: 0,
        }],
      },
    })
  })

  it('migrates a real v5 save (plan items-player-017) into current, defaulting missing construction progress to already-complete', () => {
    const { completedWork: _tcw, ...v5Torch } = validSave.standingTorches[0]!
    const { completedWork: _pcw, ...v5Palisade } = validSave.palisades[0]!
    const v5Save = { ...validSave, version: 5, standingTorches: [v5Torch], palisades: [v5Palisade] }
    expect(loadStoredSave(v5Save)).toEqual({
      status: 'ok',
      data: {
        ...validSave,
        standingTorches: [{ ...v5Torch, completedWork: STANDING_TORCH_REQUIRED_WORK }],
        palisades: [{ ...v5Palisade, completedWork: PALISADE_REQUIRED_WORK }],
      },
    })
  })

  it('migrates a real v6 save (plan items-player-002) into current without inventing current timestamps', () => {
    const v6Save = {
      ...validSave,
      version: 6,
      foodBatches: { berries: [{ count: 3, acquiredAtDays: 1.5 }] },
      placedContainers: [{ id: 'chest:1', kind: 'chest', x: 5, z: -3, yaw: 0.4, counts: { stone: 2 }, instances: [] }],
      carriedContainer: { id: 'chest:2', kind: 'chest', counts: {}, instances: [] },
      settlementEconomies: { home: { stock: { wood: 1 }, food: { counts: { carrot: 3 }, instances: [] } } },
    }
    expect(loadStoredSave(v6Save)).toEqual({ status: 'ok', data: validSave })
  })

  it('migrates a real v7 save (plan quests-progression-002) into v8, dropping quests.exp without resetting progress or relations', () => {
    const v7Save = {
      ...validSave,
      version: 7,
      quests: {
        progress: [{ id: 'relay-anna-piotr', state: 'complete', stageIndex: 1 }],
        exp: 40,
        relations: { Anna: 2, Piotr: 1 },
      },
    }
    expect(loadStoredSave(v7Save)).toEqual({
      status: 'ok',
      data: {
        ...validSave,
        quests: {
          progress: [{ id: 'relay-anna-piotr', state: 'complete', stageIndex: 1 }],
          relations: { Anna: 2, Piotr: 1 },
        },
      },
    })
  })

  it('migrates a real v10 save (plan npc-010) into v11, adding postDeath without fabricating corpses', () => {
    const v10Save = {
      ...validSave,
      version: 10,
      npcStates: {
        alive: {
          health: { current: 80, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 100, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
        },
        dead: {
          health: { current: 0, max: 100, dead: true },
          stamina: { current: 0, max: 100 },
          vigor: { current: 0, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
        },
      },
    }
    const result = loadStoredSave(v10Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.npcStates?.alive.postDeath).toBeNull()
    expect(result.data.npcStates?.alive.personalInventory).toEqual({ counts: {}, instances: [] })
    expect(result.data.npcStates?.dead.postDeath).toEqual({
      status: 'terminal',
      x: 0,
      z: 0,
      yaw: 0,
      deathAtDays: 0,
      loot: { counts: {}, instances: [] },
      cleanupReason: 'legacy',
      burialClaimantId: null,
    })
    expect(result.data.npcStates?.dead.personalInventory).toEqual({ counts: {}, instances: [] })
  })

  it('migrates a real v11 save (plan world-019) into v12 with an empty completed-preparation collection', () => {
    const { completedTerrainPreparations: _completed, ...v11Fields } = validSave
    const result = loadStoredSave({ ...v11Fields, version: 11 })
    expect(result).toEqual({
      status: 'ok',
      data: { ...validSave, completedTerrainPreparations: [] },
    })
  })

  it('migrates a real v12 save (plan settlements-npcs-026) into v13 with empty personal inventories', () => {
    const v12Save = {
      ...validSave,
      version: 12,
      npcStates: {
        'home:npc:0': {
          health: { current: 80, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 100, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: null,
        },
      },
    }
    const result = loadStoredSave(v12Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.npcStates?.['home:npc:0']?.personalInventory).toEqual({ counts: {}, instances: [] })
    expect(result.data.npcStates?.['home:npc:0']?.postDeath).toBeNull()
  })

  it('migrates a real v13 save (plan npc-028) into v14 for an unassigned contract', () => {
    const { requestedWorkerCount: _c, assignments: _a, ...v13Contract } = validSave.workContracts[0]!
    const v13Save = {
      ...validSave,
      version: 13,
      workContracts: [{
        ...v13Contract,
        workerNpcId: null,
        acceptedAt: null,
        workStartedAt: null,
      }],
    }
    expect(loadStoredSave(v13Save)).toEqual({ status: 'ok', data: validSave })
  })

  it('migrates a real v14 save (plan items-player-018) into current with tent condition defaults', () => {
    const v14Save = {
      ...validSave,
      version: 14,
      elapsedDays: 6,
      placedTents: [{ id: 'tent:old', x: 1, z: 2, yaw: 0.3 }],
    }
    const result = loadStoredSave(v14Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.placedTents).toEqual([
      { id: 'tent:old', x: 1, z: 2, yaw: 0.3, condition: 100, lastConditionUpdateAtDays: 6 },
    ])
  })

  it('migrates a real v15 save (plan world-020) into v16 with completed-roof condition defaults', () => {
    const v15Save = {
      ...validSave,
      version: 15,
      elapsedDays: 11,
      playerWells: [
        { id: 'well:done', x: 1, z: 2, yaw: 0, stage: 'roof', workProgress: 1, waterDepth: 5, waterKind: 'groundwater' },
        { id: 'well:open', x: 3, z: 4, yaw: 0, stage: 'roof', workProgress: 0, waterDepth: 5, waterKind: 'groundwater' },
        { id: 'well:body', x: 5, z: 6, yaw: 0, stage: 'well', workProgress: 1, waterDepth: 5, waterKind: 'groundwater' },
      ],
    }
    const result = loadStoredSave(v15Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.playerWells).toEqual([
      {
        id: 'well:done',
        x: 1,
        z: 2,
        yaw: 0,
        stage: 'roof',
        workProgress: 1,
        waterDepth: 5,
        waterKind: 'groundwater',
        roofCondition: 100,
        lastRoofConditionUpdateAtDays: 11,
      },
      { id: 'well:open', x: 3, z: 4, yaw: 0, stage: 'roof', workProgress: 0, waterDepth: 5, waterKind: 'groundwater' },
      { id: 'well:body', x: 5, z: 6, yaw: 0, stage: 'well', workProgress: 1, waterDepth: 5, waterKind: 'groundwater' },
    ])
  })

  it('rejects a current-schema well with only one of the roof-condition fields', () => {
    expect(loadSaveData({
      ...validSave,
      playerWells: [{
        id: 'w',
        x: 0,
        z: 0,
        yaw: 0,
        stage: 'roof',
        workProgress: 1,
        waterDepth: 5,
        waterKind: 'groundwater',
        roofCondition: 100,
      }],
    })).toBeNull()
  })

  it('migrates a real v16 save (plan world-021) into the current schema without inventing a repair episode', () => {
    const v16Save = {
      ...validSave,
      version: 16,
      playerWells: [{
        id: 'well:done',
        x: 1,
        z: 2,
        yaw: 0,
        stage: 'roof',
        workProgress: 1,
        waterDepth: 5,
        waterKind: 'groundwater',
        roofCondition: 80,
        lastRoofConditionUpdateAtDays: 4,
      }],
    }
    const result = loadStoredSave(v16Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.playerWells).toEqual([{
      id: 'well:done',
      x: 1,
      z: 2,
      yaw: 0,
      stage: 'roof',
      workProgress: 1,
      waterDepth: 5,
      waterKind: 'groundwater',
      roofCondition: 80,
      lastRoofConditionUpdateAtDays: 4,
    }])
  })

  it('migrates a real v17 save (plan settlements-005) into v18 with no residential buildings', () => {
    const { residentialBuildings: _houses, ...v17Fields } = validSave
    const result = loadStoredSave({ ...v17Fields, version: 17 })
    expect(result).toEqual({
      status: 'ok',
      data: { ...validSave, residentialBuildings: [] },
    })
  })

  it('migrates a real v18 save (plan items-player-019) stacked tents into tent instances only', () => {
    const v18Save = {
      ...validSave,
      version: 18,
      inventory: { tent: 2, hide: 1 },
      inventoryInstances: [],
    }
    const result = loadStoredSave(v18Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.inventory.tent).toBeUndefined()
    expect(result.data.inventory.hide).toBe(1)
    expect(result.data.inventoryInstances).toEqual([
      { id: 'tent:migrated:1', kind: 'tent', condition: 100 },
      { id: 'tent:migrated:2', kind: 'tent', condition: 100 },
    ])
  })

  it('round-trips a partial residential house without persisting lodging', () => {
    const withHouse = {
      ...validSave,
      residentialBuildings: [{
        id: 'residential:1',
        kind: 'small_house' as const,
        x: 4,
        z: -6,
        yaw: 0.5,
        stage: 'structure' as const,
        stageWorkProgress: 1.25,
        materialsSupplied: true,
        owner: { kind: 'player' as const },
        settlementId: null,
        homePlaceId: null,
      }],
    }
    expect(loadSaveData(withHouse)).toEqual(withHouse)
    expect('lodging' in (loadSaveData(withHouse) ?? {})).toBe(false)
  })

  it('round-trips a current-schema well with partial roof-repair progress', () => {
    const withRepair = {
      ...validSave,
      playerWells: [{
        id: 'w',
        x: 0,
        z: 0,
        yaw: 0,
        stage: 'roof' as const,
        workProgress: 1,
        waterDepth: 5,
        waterKind: 'groundwater' as const,
        roofCondition: 42,
        lastRoofConditionUpdateAtDays: 3,
        roofRepair: {
          startedCondition: 42,
          targetCondition: 100,
          requiredWork: 0.45,
          completedWork: 0.1,
        },
      }],
    }
    expect(loadSaveData(withRepair)).toEqual(withRepair)
  })

  it('round-trips camp repair progress on tent/bedroll/platform (plan items-player-019)', () => {
    const repair = {
      startedCondition: 40,
      targetCondition: 100,
      requiredWork: 0.3,
      completedWork: 0.1,
    }
    const withCampRepair = {
      ...validSave,
      placedTents: [{
        id: 'tent:1',
        x: 1,
        z: 2,
        yaw: 0,
        condition: 40,
        lastConditionUpdateAtDays: 3,
        repair,
      }],
      bedrolls: [{
        id: 'bedroll:1',
        x: 3,
        z: 4,
        yaw: 0.2,
        variant: 'leather' as const,
        condition: 40,
        lastConditionUpdateAtDays: 3,
        repair,
      }],
      platforms: [{
        id: 'platform:1',
        x: 5,
        z: 6,
        yaw: 0.1,
        condition: 40,
        lastConditionUpdateAtDays: 3,
        repair,
      }],
    }
    expect(loadSaveData(withCampRepair)).toEqual(withCampRepair)
  })

  it('rejects a current-schema well whose roofRepair is malformed or missing roof condition', () => {
    expect(loadSaveData({
      ...validSave,
      playerWells: [{
        id: 'w',
        x: 0,
        z: 0,
        yaw: 0,
        stage: 'roof',
        workProgress: 1,
        waterDepth: 5,
        waterKind: 'groundwater',
        roofRepair: { startedCondition: 40, targetCondition: 100, requiredWork: 1, completedWork: 0 },
      }],
    })).toBeNull()
    expect(loadSaveData({
      ...validSave,
      playerWells: [{
        id: 'w',
        x: 0,
        z: 0,
        yaw: 0,
        stage: 'roof',
        workProgress: 1,
        waterDepth: 5,
        waterKind: 'groundwater',
        roofCondition: 40,
        lastRoofConditionUpdateAtDays: 1,
        roofRepair: { startedCondition: 40, targetCondition: 100, requiredWork: 1 },
      }],
    })).toBeNull()
  })

  it.each([
    ['accepted', 'active', 'accepted'],
    ['travelling', 'active', 'travelling'],
    ['working', 'active', 'working'],
    ['payment_due', 'settling', 'payment_due'],
  ] as const)('migrates a v13 %s contract into one assignment without double-counting work', (oldState, contractState, assignmentState) => {
    const { requestedWorkerCount: _c, assignments: _a, ...base } = validSave.workContracts[0]!
    const v13Save = {
      ...validSave,
      version: 13,
      workContracts: [{
        ...base,
        state: oldState,
        workerNpcId: 'npc:1',
        acceptedAt: 4,
        workStartedAt: oldState === 'working' || oldState === 'payment_due' ? 5 : null,
        npcWorkCompleted: 2,
      }],
    }
    const result = loadStoredSave(v13Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.workContracts[0]).toEqual({
      ...base,
      state: contractState,
      requestedWorkerCount: 1,
      npcWorkCompleted: 2,
      assignments: [{
        npcId: 'npc:1',
        state: assignmentState,
        acceptedAt: 4,
        workStartedAt: oldState === 'working' || oldState === 'payment_due' ? 5 : null,
        workCompleted: 2,
        rewardCoinsDue: assignmentState === 'payment_due' ? 16 : 0,
        lastPaymentRequestAt: null,
        paymentDeadline: null,
      }],
    })
  })

  it('round-trips palisade and standing_torch work-contract targets', () => {
    const palisade = {
      ...validSave.workContracts[0]!,
      id: 'workContract:palisade',
      workType: 'palisade' as const,
      target: { kind: 'palisade' as const, targetId: 'palisade:1' },
    }
    const torch = {
      ...validSave.workContracts[0]!,
      id: 'workContract:torch',
      workType: 'standing_torch' as const,
      target: { kind: 'standing_torch' as const, targetId: 'standingTorch:1' },
    }
    const loaded = loadSaveData({ ...validSave, workContracts: [palisade, torch] })
    expect(loaded?.workContracts).toEqual([palisade, torch])
  })

  it('round-trips assignment payment fields and terminal claim states (plan npc-016)', () => {
    const assignment = {
      npcId: 'npc:1',
      state: 'payment_due' as const,
      acceptedAt: 4,
      workStartedAt: 5,
      workCompleted: 2,
      rewardCoinsDue: 16,
      lastPaymentRequestAt: 6.2,
      paymentDeadline: 7,
    }
    const contract = {
      ...validSave.workContracts[0]!,
      state: 'settling' as const,
      assignments: [assignment],
    }
    const loaded = loadSaveData({ ...validSave, workContracts: [contract] })
    expect(loaded?.workContracts[0]?.assignments).toEqual([assignment])
    const paid = { ...assignment, state: 'paid' as const }
    const unpaid = { ...assignment, state: 'unpaid' as const, lastPaymentRequestAt: null }
    const uncollectable = { ...assignment, state: 'uncollectable' as const, paymentDeadline: null }
    expect(loadSaveData({ ...validSave, workContracts: [{ ...contract, assignments: [paid] }] })?.workContracts[0]?.assignments[0]?.state).toBe('paid')
    expect(loadSaveData({ ...validSave, workContracts: [{ ...contract, assignments: [unpaid] }] })?.workContracts[0]?.assignments[0]?.state).toBe('unpaid')
    expect(loadSaveData({ ...validSave, workContracts: [{ ...contract, assignments: [uncollectable] }] })?.workContracts[0]?.assignments[0]?.state).toBe('uncollectable')
  })

  it('migrates a v19 assignment without synthesizing NPC coins (plan npc-016)', () => {
    const { rewardCoinsDue: _d, lastPaymentRequestAt: _r, paymentDeadline: _p, ...legacyAssignment } = {
      npcId: 'npc:1',
      state: 'payment_due' as const,
      acceptedAt: 4,
      workStartedAt: 5,
      workCompleted: 2,
      rewardCoinsDue: 0,
      lastPaymentRequestAt: null,
      paymentDeadline: null,
    }
    const v19Save = {
      ...validSave,
      version: 19,
      workContracts: [{
        ...validSave.workContracts[0]!,
        state: 'settling',
        assignments: [legacyAssignment],
      }],
    }
    const result = loadStoredSave(v19Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.workContracts[0]?.assignments[0]).toEqual({
      ...legacyAssignment,
      rewardCoinsDue: 16,
      lastPaymentRequestAt: null,
      paymentDeadline: null,
    })
  })


  it('accepts a current-version npcStates record with active corpse loot and rejects a malformed postDeath', () => {
    const withCorpse = {
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 0, max: 100, dead: true },
          stamina: { current: 0, max: 100 },
          vigor: { current: 0, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: {
            status: 'active',
            x: 3,
            z: 4,
            yaw: 0.2,
            deathAtDays: 1.5,
            loot: { counts: {}, instances: [{ id: 'w1', kind: 'knife', durability: 0.4, sharpness: 0.8 }] },
            cleanupReason: null,
          },
          personalInventory: { counts: {}, instances: [] },
        },
      },
    }
    expect(isSaveData(withCorpse)).toBe(true)
    expect(isSaveData({
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 0, max: 100, dead: true },
          stamina: { current: 0, max: 100 },
          vigor: { current: 0, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: {
            status: 'active',
            x: 3,
            z: 4,
            yaw: 0.2,
            deathAtDays: 1.5,
            loot: {
              counts: { berries: 3 },
              instances: [],
              foodBatches: { berries: [{ count: 3, acquiredAtDays: 1.5, accumulatedEffectiveAge: 0, lastCheckpointDays: 1.5, decayModifier: 1 }] },
            },
            cleanupReason: null,
          },
          personalInventory: { counts: {}, instances: [] },
        },
      },
    })).toBe(true)
    expect(isSaveData({
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 0, max: 100, dead: true },
          stamina: { current: 0, max: 100 },
          vigor: { current: 0, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: {
            status: 'active',
            x: 3,
            z: 4,
            yaw: 0.2,
            deathAtDays: 1.5,
            loot: { counts: { berries: 3 }, instances: [], foodBatches: { berries: [{ count: 'nope' }] } },
            cleanupReason: null,
          },
          personalInventory: { counts: {}, instances: [] },
        },
      },
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 0, max: 100, dead: true },
          stamina: { current: 0, max: 100 },
          vigor: { current: 0, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: { status: 'active' },
        },
      },
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 80, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 100, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
        },
      },
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 80, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 100, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: null,
        },
      },
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      npcStates: {
        'home:npc:0': {
          health: { current: 80, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 100, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: null,
          personalInventory: { counts: { stone: 'nope' }, instances: [] },
        },
      },
    })).toBe(false)
  })

  it('rejects malformed SaveQuests progress and relation values', () => {
    expect(isSaveData({ ...validSave, quests: { progress: 'nope', relations: {} } })).toBe(false)
    expect(isSaveData({
      ...validSave,
      quests: { progress: [{ id: 'x', state: 'bogus', stageIndex: 0 }], relations: {} },
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      quests: { progress: [{ id: 'x', state: 'active', stageIndex: -1 }], relations: {} },
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      quests: { progress: [{ id: 'x', state: 'complete', stageIndex: 0, resolvedOutcomeId: 1 }], relations: {} },
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      quests: { progress: [], relations: { Anna: 'trusted' } },
    })).toBe(false)
  })

  it('migrates a real v21 save (plan items-player-020) into current, defaulting missing playerTroughs to []', () => {
    const { playerTroughs: _pt, ...v21Body } = validSave
    const v21Save = { ...v21Body, version: 21 }
    expect(loadStoredSave(v21Save)).toEqual({ status: 'ok', data: validSave })
  })

  it('migrates v22 storage infestation strings into independent storage/nest facts', () => {
    const v22Active = {
      ...validSave,
      version: 22,
      storageInfestation: { home: 'active' },
    }
    const active = loadStoredSave(v22Active)
    expect(active.status).toBe('ok')
    if (active.status !== 'ok') return
    expect(active.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(active.data.storageInfestation).toEqual({
      home: { storageDamaged: true, nestDestroyed: false },
    })

    const v22Repaired = {
      ...validSave,
      version: 22,
      storageInfestation: { home: 'repaired' },
    }
    const repaired = loadStoredSave(v22Repaired)
    expect(repaired.status).toBe('ok')
    if (repaired.status !== 'ok') return
    expect(repaired.data.storageInfestation).toEqual({
      home: { storageDamaged: false, nestDestroyed: false },
    })
  })

  it('migrates v24 grave-disturbance badges out of SaveBadges', () => {
    const v24Save = {
      ...validSave,
      version: 24,
      badges: {
        earned: ['grave_robber', 'desecrator', 'treasure_hunter'],
        gravesDisturbed: 5,
        hiddenFindsFound: 5,
      },
    }
    const result = loadStoredSave(v24Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.badges).toEqual({ earned: ['treasure_hunter'], hiddenFindsFound: 5 })
  })

  it('migrates v25 saves to v26 with an empty carts array (plan fauna-007)', () => {
    const { carts: _carts, ...v25Fields } = validSave
    const result = loadStoredSave({ ...v25Fields, version: 25 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.carts).toEqual([])
  })

  it('migrates v26 saves to empty persistent habitat occupant collections (plan fauna-018)', () => {
    const {
      persistentHabitatOccupants: _occ,
      removedPersistentOccupantSlots: _slots,
      ...v26Fields
    } = validSave
    const result = loadStoredSave({ ...v26Fields, version: 26 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.persistentHabitatOccupants).toEqual([])
    expect(result.data.removedPersistentOccupantSlots).toEqual([])
  })

  it('migrates a v27 lit standing torch without a burn deadline to unlit (plan items-player-022)', () => {
    const { burnUntilDays: _deadline, ...legacyTorch } = validSave.standingTorches[0]!
    const result = loadStoredSave({
      ...validSave,
      version: 27,
      standingTorches: [{ ...legacyTorch, lit: true }],
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.standingTorches).toEqual([{ ...legacyTorch, lit: false, burnUntilDays: null }])
  })

  it('migrates a v28 save with no unsafeFoodEventCount to the current version (plan items-player-023)', () => {
    const { unsafeFoodEventCount: _count, ...v28Fields } = validSave
    const result = loadStoredSave({ ...v28Fields, version: 28 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.unsafeFoodEventCount).toBeUndefined()
  })

  it('round-trips a non-zero unsafeFoodEventCount and rejects a malformed one', () => {
    const withCounter = loadStoredSave({ ...validSave, unsafeFoodEventCount: 7 })
    expect(withCounter.status).toBe('ok')
    if (withCounter.status === 'ok') expect(withCounter.data.unsafeFoodEventCount).toBe(7)

    expect(loadStoredSave({ ...validSave, unsafeFoodEventCount: 'seven' })).toEqual({ status: 'invalid' })
  })

  it('migrates a v29 save with no unlockedTreasureContainerIds to the current version (plan world-024)', () => {
    const { unlockedTreasureContainerIds: _ids, ...v29Fields } = validSave
    const result = loadStoredSave({ ...v29Fields, version: 29 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.unlockedTreasureContainerIds).toBeUndefined()
  })

  it('round-trips unlockedTreasureContainerIds and rejects a malformed one (plan world-024)', () => {
    const withUnlocks = loadStoredSave({
      ...validSave,
      unlockedTreasureContainerIds: ['world-container:treasure:ruins:a'],
    })
    expect(withUnlocks.status).toBe('ok')
    if (withUnlocks.status === 'ok') {
      expect(withUnlocks.data.unlockedTreasureContainerIds).toEqual(['world-container:treasure:ruins:a'])
    }

    expect(loadStoredSave({ ...validSave, unlockedTreasureContainerIds: 'open' })).toEqual({ status: 'invalid' })
  })

  it('migrates a v30 save with no treasureChestMutations to the current version (plan items-player-026)', () => {
    const { treasureChestMutations: _mutations, ...v30Fields } = validSave
    const result = loadStoredSave({ ...v30Fields, version: 30 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.treasureChestMutations).toBeUndefined()
  })

  it('migrates a v31 save with no transportOrders/transportCargo to the current version (plan settlements-npcs-019)', () => {
    const { transportOrders: _orders, ...v31Fields } = validSave
    const result = loadStoredSave({ ...v31Fields, version: 31 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.transportOrders).toBeUndefined()
  })

  it('migrates a v32 corpse loot without foodBatches to the current version, fabricating no historical freshness (plan npc-036)', () => {
    const v32Save = {
      ...validSave,
      version: 32,
      npcStates: {
        'home:npc:0': {
          health: { current: 0, max: 100, dead: true },
          stamina: { current: 0, max: 100 },
          vigor: { current: 0, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: {
            status: 'active',
            x: 3,
            z: 4,
            yaw: 0.2,
            deathAtDays: 1.5,
            loot: { counts: { berries: 3 }, instances: [{ id: 'w1', kind: 'knife', durability: 0.4, sharpness: 0.8 }] },
            cleanupReason: null,
          },
          personalInventory: { counts: {}, instances: [] },
        },
      },
    }
    const result = loadStoredSave(v32Save)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.npcStates?.['home:npc:0']?.postDeath?.loot).toEqual({
      counts: { berries: 3 },
      instances: [{ id: 'w1', kind: 'knife', durability: 0.4, sharpness: 0.8 }],
    })
  })

  it('migrates a v33 save without livestock stray to the current version (plan fauna-024)', () => {
    const result = loadStoredSave({ ...validSave, version: 33 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.livestock).toEqual(validSave.livestock)
  })

  it('migrates a v34 household without agriculture using saved elapsedDays as the catch-up anchor (plan settlements-npcs-030)', () => {
    const result = loadStoredSave({
      ...validSave,
      version: 34,
      elapsedDays: 12.5,
      households: {
        'home:household:0': { stock: { wood: 3 }, water: 2, items: { counts: { bread: 2 }, instances: [] } },
      },
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.households?.['home:household:0']?.agriculture).toEqual({
      starterSeedsGranted: false,
      lastResolvedAtDays: 12.5,
    })
  })

  it('round-trips household agriculture state (plan settlements-npcs-030)', () => {
    const withAgriculture: SaveData = {
      ...validSave,
      households: {
        's:household:0': {
          stock: { wood: 1 },
          water: 2,
          items: { counts: { seed_carrot: 1, carrot: 3 }, instances: [] },
          agriculture: { starterSeedsGranted: true, lastResolvedAtDays: 8 },
        },
      },
    }
    expect(loadSaveData(withAgriculture)).toEqual(withAgriculture)
  })

  it('round-trips an in-transit transportOrder and npcStates transportCargo, and rejects a malformed order (plan settlements-npcs-019)', () => {
    const order = {
      id: 'transportOrder:1',
      source: { type: 'household' as const, householdId: 'h1' },
      destination: { type: 'settlement-storage' as const, settlementId: 's1' },
      itemKind: 'carrot' as const,
      requestedQuantity: 3,
      claimedQuantity: 3,
      deliveredQuantity: 0,
      carrierNpcId: 'npc:1',
      state: 'in-transit' as const,
      execution: { mode: 'off-screen' as const, arrivesAtDays: 12 },
    }
    const withOrder = loadStoredSave({
      ...validSave,
      transportOrders: [order],
      npcStates: {
        'npc:1': {
          health: { current: 100, max: 100, dead: false },
          stamina: { current: 100, max: 100 },
          vigor: { current: 100, max: 100 },
          needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
          postDeath: null,
          personalInventory: { counts: {}, instances: [] },
          transportCargo: { counts: { carrot: 3 }, instances: [] },
        },
      },
    })
    expect(withOrder.status).toBe('ok')
    if (withOrder.status === 'ok') {
      expect(withOrder.data.transportOrders).toEqual([order])
      expect(withOrder.data.npcStates?.['npc:1']?.transportCargo).toEqual({ counts: { carrot: 3 }, instances: [] })
    }

    expect(loadStoredSave({ ...validSave, transportOrders: [{ ...order, state: 'orbiting' }] }))
      .toEqual({ status: 'invalid' })
    expect(loadStoredSave({ ...validSave, transportOrders: [{ ...order, execution: { mode: 'detailed' } }] }))
      .toEqual({ status: 'invalid' })
  })

  it('round-trips npcStates accompanyCommitment/travel and rejects a malformed commitment (plan npc-029)', () => {
    const snapshot = {
      health: { current: 100, max: 100, dead: false },
      stamina: { current: 100, max: 100 },
      vigor: { current: 100, max: 100 },
      needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      postDeath: null,
      personalInventory: { counts: {}, instances: [] },
      accompanyCommitment: {
        target: { kind: 'player' as const },
        source: { kind: 'voluntary' as const },
        mode: 'stay' as const,
        stayAnchor: { x: 1, y: 2, z: 3 },
        startedAtDays: 4,
      },
      travel: {
        destination: { x: 8, z: 9 },
        lastPosition: { x: 1, z: 3 },
        execution: { mode: 'off-screen' as const, departedAtDays: 4, arrivesAtDays: 4.5 },
      },
    }
    const result = loadStoredSave({ ...validSave, npcStates: { 'npc:1': snapshot } })
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.data.npcStates?.['npc:1']?.accompanyCommitment).toEqual(snapshot.accompanyCommitment)
      expect(result.data.npcStates?.['npc:1']?.travel).toEqual(snapshot.travel)
    }
    expect(loadStoredSave({
      ...validSave,
      npcStates: {
        'npc:1': {
          ...snapshot,
          accompanyCommitment: { target: { kind: 'horse' }, source: { kind: 'voluntary' }, mode: 'follow', startedAtDays: 1 },
        },
      },
    })).toEqual({ status: 'invalid' })
  })

  it('migrates a v35 save without accompanyCommitment/travel to the current version (plan npc-029)', () => {
    const result = loadStoredSave({ ...validSave, version: 35 })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
  })

  it('round-trips treasureChestMutations and rejects a malformed one (plan items-player-026)', () => {
    const mutations = [{
      containerId: 'world-container:treasure:ruins:a',
      attemptIndex: 2,
      trapTriggered: true,
      damaged: true,
    }]
    const withMutations = loadStoredSave({ ...validSave, treasureChestMutations: mutations })
    expect(withMutations.status).toBe('ok')
    if (withMutations.status === 'ok') {
      expect(withMutations.data.treasureChestMutations).toEqual(mutations)
    }

    expect(loadStoredSave({
      ...validSave,
      treasureChestMutations: [{ containerId: 'chest:a' }],
    })).toEqual({ status: 'invalid' })
  })

  it('accepts a persistent habitat occupant record and rejects a malformed one (plan fauna-018)', () => {
    const occupant = {
      habitatId: 'home:cave:bear',
      occupantKey: 'resident',
      animalId: 'persistent:home:cave:bear:resident',
      kind: 'bear' as const,
      state: {
        x: 1, z: 2, yaw: 0,
        health: { current: 40, max: 40, dead: false },
        life: { hunger: 0.5, thirst: 0.5, stamina: 1 },
        productionReadyAtDays: null,
        eggPending: false,
        corpse: null,
        rabid: true,
      },
    }
    const save = {
      ...validSave,
      persistentHabitatOccupants: [occupant],
      removedPersistentOccupantSlots: ['home:thicket:alpha'],
    }
    expect(loadSaveData(save)).toEqual(save)
    expect(isSaveData({
      ...validSave,
      persistentHabitatOccupants: [{ ...occupant, kind: 'not-an-animal' }],
    })).toBe(false)
    expect(isSaveData({
      ...validSave,
      persistentHabitatOccupants: [{ ...occupant, state: { x: 1 } }],
    })).toBe(false)
  })

  it('accepts current-version infestation objects and rejects legacy strings', () => {
    const current = {
      ...validSave,
      storageInfestation: { home: { storageDamaged: true, nestDestroyed: false } },
    }
    expect(loadSaveData(current)).toEqual(current)
    expect(isSaveData({
      ...validSave,
      storageInfestation: { home: 'active' },
    })).toBe(false)
  })

  describe('migrateStoredSave() chain mechanism', () => {
    const addGreeting: SaveMigration = (data) => ({ ...(data as Record<string, unknown>), greeting: 'hi' })
    const bumpToThree: SaveMigration = (data) => ({ ...(data as Record<string, unknown>), version: 3 })

    it('walks multiple steps deterministically to the exact target version', () => {
      const migrations: Record<number, SaveMigration> = { 1: addGreeting, 2: bumpToThree }
      const result = migrateStoredSave({ version: 1 }, 1, 3, migrations)
      expect(result).toEqual({ ok: true, data: { version: 3, greeting: 'hi' } })
    })

    it('is a no-op when fromVersion already equals toVersion', () => {
      const input = { version: 1, marker: true }
      const result = migrateStoredSave(input, 1, 1, {})
      expect(result).toEqual({ ok: true, data: input })
    })

    it('never mutates its input, even across multiple steps', () => {
      const input = { version: 1, nested: { count: 1 } }
      const frozenSnapshot = structuredClone(input)
      migrateStoredSave(input, 1, 3, { 1: addGreeting, 2: bumpToThree })
      expect(input).toEqual(frozenSnapshot)
    })

    it('is deterministic for the same input', () => {
      const migrations: Record<number, SaveMigration> = { 1: addGreeting, 2: bumpToThree }
      const a = migrateStoredSave({ version: 1 }, 1, 3, migrations)
      const b = migrateStoredSave({ version: 1 }, 1, 3, migrations)
      expect(a).toEqual(b)
    })

    it('fails closed when a required step is missing from the registry', () => {
      const result = migrateStoredSave({ version: 1 }, 1, 3, { 1: addGreeting })
      expect(result).toEqual({ ok: false })
    })

    it('fails closed when a step throws', () => {
      const throwing: SaveMigration = () => { throw new Error('boom') }
      const result = migrateStoredSave({ version: 1 }, 1, 2, { 1: throwing })
      expect(result).toEqual({ ok: false })
    })
  })
})
