import { describe, expect, it } from 'vitest'
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
  resolvedHiddenFindSpotIds: ['cemetery:0:0:0:1:0', 'stoneCircle:2:1:0:1'],
  badges: { earned: ['grave_robber'], gravesDisturbed: 1, hiddenFindsFound: 0 },
  map: {
    discoveredCells: ['0,0', '1,0'],
    discoveredLocations: [{ id: 'cave:home-cave-0', state: 'confirmed', source: 'exploration' }],
    targets: ['cave:home-cave-0'],
  },
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
  standingTorches: [{ id: 'standingTorch:1', x: 9, z: 10, yaw: 0.4, lit: true, completedWork: 1 }],
  palisades: [{ id: 'palisade:1', x: 11, z: -2, yaw: 0.4, completedWork: 1.5 }],
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
    workerNpcId: null,
    acceptedAt: null,
    workStartedAt: null,
    requestedWorkShare: 0.5,
    remainingWorkAtCreation: 6,
    committedWork: 3,
    npcWorkCompleted: 1,
  }],
}

describe('loadSaveData v1 contract', () => {
  it('round-trips a fully-formed native save', () => {
    const loaded = loadSaveData(validSave)
    expect(loaded).toEqual(validSave)
    expect(isSaveData(loaded)).toBe(true)
  })

  it('rejects a non-current version', () => {
    expect(loadSaveData({ ...validSave, version: 1 })).toBeNull()
    expect(loadSaveData({ ...validSave, version: 27 })).toBeNull()
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

  it('rejects malformed work-contract fields', () => {
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], state: 'bogus' }] })).toBeNull()
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], target: { kind: 'bogus', targetId: 'x' } }] })).toBeNull()
    expect(loadSaveData({ ...validSave, workContracts: [{ ...validSave.workContracts[0], advertisement: 'bogus' }] })).toBeNull()
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

  it('rejects a malformed npcStates record', () => {
    expect(loadSaveData({
      ...validSave,
      npcStates: { 'home:npc:0': { health: { current: 1, max: 1, dead: false } } },
    })).toBeNull()
    expect(loadSaveData({ ...validSave, npcStates: 'nope' })).toBeNull()
  })

  it('rejects a malformed households record', () => {
    expect(loadSaveData({ ...validSave, households: { h: { water: 'nope' } } })).toBeNull()
    expect(loadSaveData({ ...validSave, households: 'nope' })).toBeNull()
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
    const { workerNpcId: _w, acceptedAt: _a, workStartedAt: _s, ...v2Contract } = validSave.workContracts[0]!
    const v2Save = { ...validSave, version: 2, workContracts: [v2Contract] }
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

  it('migrates a real v5 save (plan items-player-017) into v6, defaulting missing construction progress to already-complete', () => {
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
