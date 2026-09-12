import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NpcInspectionSnapshot } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { WorldConfig } from '../config/worldConfig'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { QuestManager } from '../quests/QuestManager'
import type { SettlementCell, SettlementDef } from '../settlement/settlementGenerator'
import type { SettlementsManager } from '../settlement/SettlementsManager'
import type { CaveArchetype } from '../world/caves/caveArchetype'
import type { LocationKnowledge } from '../world/locations/locationKnowledge'
import type { WorldLocationCatalog } from '../world/locations/worldLocationCatalog'
import type { WorldLocation } from '../world/locations/worldLocationTypes'
import type { WorldContext } from '../world/worldContext'
import { createPlayerSkills } from '../player/PlayerSkills'
import { createEmptyTemporaryConditions } from '../shared/temporaryConditions'
import { computeRiverTile, riverTileCoordOf } from '../terrain/riverNetwork'
import { DARK_FOREST_TREASURE_LOCATION_ID } from '../world/locations/darkForestTreasureSite'
import { installNpcDebugApi } from './npcDebugApi'
import { createPlayerGroundTraceBuffer } from './playerGroundTrace'

vi.mock('../terrain/riverNetwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../terrain/riverNetwork')>()
  return { ...actual, computeRiverTile: vi.fn() }
})

vi.mock('../quests/QuestManager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../quests/QuestManager')>()
  return { ...actual, QuestManager: vi.fn() }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(computeRiverTile).mockReset()
})

function stubWindow(search: string): void {
  vi.stubGlobal('window', { location: { search } })
}

function baseSnapshot(id: string, overrides: Partial<NpcInspectionSnapshot> = {}): NpcInspectionSnapshot {
  return {
    id,
    name: 'Anna',
    displayName: 'Anna Kowalska',
    role: 'farmer',
    position: { x: 0, z: 0 },
    phase: 'choose',
    activity: { kind: 'idle' },
    needs: { thirst: 0.1, woodDuty: 0.1, waterDuty: 0.1, hunger: 0.1 },
    activeNeed: 'idle',
    pressures: [],
    strategyCandidates: [],
    selectedStrategy: null,
    plan: null,
    contract: null,
    action: null,
    queue: null,
    watchdog: { rescueStage: 'none', lowProgressStrikes: 0, recentRescueCount: 0 },
    stamina: { current: 100, max: 100 },
    vigor: { current: 100, max: 100 },
    health: { current: 100, max: 100 },
    household: null,
    frozen: false,
    ...overrides,
  }
}

function fakeNpc(id: string, household: { id: string } | null = null, history: unknown[] = []) {
  return { id, household, createInspectionSnapshot: () => baseSnapshot(id), history: () => history }
}

function fakeSettlement(id: string, npcs: ReturnType<typeof fakeNpc>[] = []) {
  return { id, name: `Settlement ${id}`, size: 'MD', center: { x: 0, z: 0 }, npcs }
}

function fakeHousehold(id: string, history: unknown[] = []) {
  return { id, history: () => history }
}

function fakeEconomy(settlementId: string, history: unknown[] = []) {
  return { settlementId, history: () => history }
}

type FakeManagerOpts = {
  loaded?: ReturnType<typeof fakeSettlement>[]
  defs?: Record<string, SettlementDef>
  households?: Record<string, ReturnType<typeof fakeHousehold>>
  economies?: Record<string, ReturnType<typeof fakeEconomy>>
}

function fakeSettlementsManager(opts: FakeManagerOpts): { manager: SettlementsManager, setLoaded: (l: ReturnType<typeof fakeSettlement>[]) => void } {
  let loaded = opts.loaded ?? []
  const defs = opts.defs ?? {}
  const households = opts.households ?? {}
  const economies = opts.economies ?? {}
  const manager = {
    getLoaded: () => loaded,
    peekDef: (cell: SettlementCell) => defs[`${cell.gx}_${cell.gz}`] ?? null,
    getHousehold: (id: string) => households[id],
    getEconomy: (settlementId: string) => economies[settlementId],
  } as unknown as SettlementsManager
  return { manager, setLoaded: (l) => { loaded = l } }
}

function fakeWolfDenSpawner(overrides: Partial<PreySpawner> = {}): PreySpawner {
  return {
    id: 'home:wolfDen',
    x: 120,
    z: -45,
    type: 'wolfDen',
    kind: 'wolf',
    respawnIntervalDays: Infinity,
    maxPreyCount: 2,
    daysSinceLastRespawn: 0,
    state: 'active',
    deathsThisCycle: 1,
    disabledAtDay: null,
    pressure: 0.75,
    humanTaste: true,
    canRecover: false,
    lastSettlementTripOpportunityDay: null,
    ...overrides,
  }
}

function fakeFauna(opts: {
  spawners?: readonly PreySpawner[]
  isWolfDenCleared?: boolean
  isQuestSpawnPointPermanentlyDestroyed?: boolean
} = {}) {
  return {
    getSpawners: () => opts.spawners ?? [],
    isWolfDenCleared: () => opts.isWolfDenCleared ?? false,
    isQuestSpawnPointPermanentlyDestroyed: () => opts.isQuestSpawnPointPermanentlyDestroyed ?? false,
  }
}

function fakeCaves(entries: readonly {
  caveId: string
  x: number
  z: number
  archetype: CaveArchetype
}[]) {
  const archetypes = new Map(entries.map((entry) => [entry.caveId, entry.archetype]))
  return {
    definitions: () => entries.map((entry) => ({
      caveId: entry.caveId,
      entrance: { x: entry.x, z: entry.z },
    })),
    archetypeOf: (caveId: string) => archetypes.get(caveId) ?? null,
  }
}

function install(
  bundle: WorldBundle,
  opts: {
    getPlayerPosition?: () => { x: number, z: number }
    teleport?: (x: number, z: number) => Promise<void>
    config?: WorldConfig
    groundTrace?: ReturnType<typeof createPlayerGroundTraceBuffer> | null
    questManager?: { list?: () => unknown[] }
    catalog?: WorldLocationCatalog
  } = {},
) {
  const worldContext = {} as unknown as WorldContext
  const config = opts.config ?? ({} as unknown as WorldConfig)
  const teleport = opts.teleport ?? vi.fn(async () => {})
  const getPlayerPosition = opts.getPlayerPosition ?? (() => ({ x: 0, z: 0 }))
  const worldFlags = { hiddenTreasureFound: false }
  const worldLocations = {
    catalog: opts.catalog ?? { getById: () => null, nearestSettlements: () => [], landmarksWithin: () => [], invalidateScanCache: () => {} } as unknown as WorldLocationCatalog,
    knowledge: { get: () => undefined, has: () => false, reveal: () => false, list: () => [], serialize: () => [], restore: () => {}, clear: () => {} } as unknown as LocationKnowledge,
  }
  const questManager = {
    onInteractObjective: vi.fn(),
    list: vi.fn(() => []),
    ...opts.questManager,
  } as unknown as QuestManager
  const player = {
    temporaryConditions: createEmptyTemporaryConditions(),
    syncDerivedPhysicalCapabilities: vi.fn(),
  }
  installNpcDebugApi(
    bundle,
    worldContext,
    config,
    () => 0.5,
    getPlayerPosition,
    teleport,
    worldFlags,
    worldLocations,
    () => createPlayerSkills(),
    () => player as unknown as import('../player/PlayerController').PlayerController,
    () => 0,
    questManager,
    opts.groundTrace,
  )
  return { teleport, api: typeof window === 'undefined' ? undefined : window.seedvale?.debug }
}

describe('installNpcDebugApi gating', () => {
  it('does not install window.seedvale when window is undefined', () => {
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    expect(() => install(bundle)).not.toThrow()
  })

  it('does not install window.seedvale when ?debug is off', () => {
    stubWindow('')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    install(bundle)
    expect(window.seedvale).toBeUndefined()
  })

  it('installs window.seedvale.debug when ?debug=1', () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api).toBeDefined()
  })
})

describe('SeedvaleDebugApi shape', () => {
  it('exposes npc/npcs/setFrenzyWolf/village/villages/locations/teleportTo/help', () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api).toBeDefined()
    expect(typeof api!.npc).toBe('function')
    expect(typeof api!.npcs).toBe('function')
    expect(typeof api!.setFrenzyWolf).toBe('function')
    expect(typeof api!.village).toBe('function')
    expect(typeof api!.villages).toBe('function')
    expect(typeof api!.locations).toBe('object')
    expect(typeof api!.teleportTo).toBe('function')
    expect(typeof api!.teleportTo.villageNearest).toBe('function')
    expect(typeof api!.teleportTo.darkForestTreasure).toBe('function')
    expect(typeof api!.worldLocations.teleportToFirstCave).toBe('function')
    expect(typeof api!.worldLocations.teleportToNearestCave).toBe('function')
    expect(typeof api!.quests.list).toBe('function')
    expect(typeof api!.quests.target).toBe('function')
    expect(typeof api!.quests.teleportToTarget).toBe('function')
    expect(typeof api!.help).toBe('function')
  })

  it('help() returns a non-empty string mentioning each surface', () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const help = api!.help()
    expect(typeof help).toBe('string')
    expect(help.length).toBeGreaterThan(0)
    for (const word of ['npc', 'village', 'locations', 'teleportTo', 'injury', 'quests', 'darkForestTreasure', 'teleportToNearestCave']) {
      expect(help).toContain(word)
    }
  })
})

describe('villages()', () => {
  it('lists only currently loaded settlements, not every peekDef-reachable def', () => {
    stubWindow('?debug=1')
    const loadedA = fakeSettlement('0_0')
    const loadedB = fakeSettlement('1_0')
    const { manager } = fakeSettlementsManager({
      loaded: [loadedA, loadedB],
      defs: {
        '0_0': { id: '0_0', name: 'A', size: 'MD', x: 0, z: 0 } as SettlementDef,
        '1_0': { id: '1_0', name: 'B', size: 'MD', x: 280, z: 0 } as SettlementDef,
        '2_0': { id: '2_0', name: 'C (unloaded)', size: 'MD', x: 560, z: 0 } as SettlementDef,
      },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const villages = api!.villages()
    expect(villages.map((v) => v.id).sort()).toEqual(['0_0', '1_0'])
  })
})

describe('village(id)', () => {
  it('resolves a loaded village with live npcs()', () => {
    stubWindow('?debug=1')
    const npc = fakeNpc('0_0:npc:0')
    const loaded = fakeSettlement('0_0', [npc])
    const { manager } = fakeSettlementsManager({
      loaded: [loaded],
      defs: { '0_0': { id: '0_0', name: 'Home', size: 'MD', x: 0, z: 0 } as SettlementDef },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const handle = api!.village('0_0')
    expect(handle).not.toBeNull()
    expect(handle!.npcs()).toHaveLength(1)
  })

  it('resolves an unloaded village id with npcs() === []', () => {
    stubWindow('?debug=1')
    const { manager } = fakeSettlementsManager({
      loaded: [],
      defs: { '3_0': { id: '3_0', name: 'Faraway', size: 'SM', x: 840, z: 0 } as SettlementDef },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const handle = api!.village('3_0')
    expect(handle).not.toBeNull()
    expect(handle!.npcs()).toEqual([])
  })

  it('returns null for an id that resolves to no def', () => {
    stubWindow('?debug=1')
    const { manager } = fakeSettlementsManager({})
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api!.village('99_99')).toBeNull()
  })

  it('does not retain a stale npc list across a simulated settlement reload', () => {
    stubWindow('?debug=1')
    const npcA = fakeNpc('0_0:npc:A')
    const npcB1 = fakeNpc('0_0:npc:B1')
    const npcB2 = fakeNpc('0_0:npc:B2')
    const { manager, setLoaded } = fakeSettlementsManager({
      loaded: [fakeSettlement('0_0', [npcA])],
      defs: { '0_0': { id: '0_0', name: 'Home', size: 'MD', x: 0, z: 0 } as SettlementDef },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const handle = api!.village('0_0')!
    expect(handle.npcs().map((n) => n.id)).toEqual(['0_0:npc:A'])

    setLoaded([fakeSettlement('0_0', [npcB1, npcB2])])
    expect(handle.npcs().map((n) => n.id)).toEqual(['0_0:npc:B1', '0_0:npc:B2'])
  })
})

describe('household(id) / settlement(id) (plan settlements-npcs-013)', () => {
  it('household(id) returns null for a household that was never created', () => {
    stubWindow('?debug=1')
    const { manager } = fakeSettlementsManager({})
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api!.household('0_0:household:0')).toBeNull()
  })

  it('household(id).history() returns the household own bounded history, fresh-resolving', () => {
    stubWindow('?debug=1')
    const householdEvents = [{ simTime: 1, seq: 0, type: 'food.taken', itemKind: 'bread' }]
    const { manager } = fakeSettlementsManager({
      households: { '0_0:household:0': fakeHousehold('0_0:household:0', householdEvents) },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const handle = api!.household('0_0:household:0')
    expect(handle).not.toBeNull()
    expect(handle!.history()).toEqual(householdEvents)
  })

  it('settlement(id) returns null for an unrecognized settlement id', () => {
    stubWindow('?debug=1')
    const { manager } = fakeSettlementsManager({})
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api!.settlement('99_99')).toBeNull()
  })

  it('settlement(id).history() merges household + economy + currently-loaded NPC events, oldest first', () => {
    stubWindow('?debug=1')
    const npc = fakeNpc('0_0:npc:0', { id: '0_0:household:0' }, [
      { simTime: 1, type: 'action.completed', action: 'work' },
    ])
    const { manager } = fakeSettlementsManager({
      loaded: [fakeSettlement('0_0', [npc])],
      defs: { '0_0': { id: '0_0', name: 'Home', size: 'MD', x: 0, z: 0, families: [{}] } as unknown as SettlementDef },
      households: {
        '0_0:household:0': fakeHousehold('0_0:household:0', [
          { simTime: 2, seq: 0, type: 'food.taken', itemKind: 'bread' },
        ]),
      },
      economies: {
        '0_0': fakeEconomy('0_0', [{ simTime: 3, seq: 0, type: 'stock.added', kind: 'iron', amount: 1 }]),
      },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const handle = api!.settlement('0_0')
    expect(handle).not.toBeNull()
    const history = handle!.history()!
    expect(history.map((e) => e.scope)).toEqual(['npc', 'household', 'settlement'])
    expect(history.map((e) => e.simTime)).toEqual([1, 2, 3])
  })

  it('settlement(id).history() does not leak another settlement\'s households/economy/NPCs', () => {
    stubWindow('?debug=1')
    const npcA = fakeNpc('0_0:npc:0', { id: '0_0:household:0' }, [{ simTime: 1, type: 'action.completed', action: 'work' }])
    const npcB = fakeNpc('1_0:npc:0', { id: '1_0:household:0' }, [{ simTime: 1, type: 'action.completed', action: 'work' }])
    const { manager } = fakeSettlementsManager({
      loaded: [fakeSettlement('0_0', [npcA]), fakeSettlement('1_0', [npcB])],
      defs: {
        '0_0': { id: '0_0', name: 'A', size: 'MD', x: 0, z: 0, families: [{}] } as unknown as SettlementDef,
        '1_0': { id: '1_0', name: 'B', size: 'MD', x: 280, z: 0, families: [{}] } as unknown as SettlementDef,
      },
      households: {
        '0_0:household:0': fakeHousehold('0_0:household:0', [{ simTime: 1, seq: 0, type: 'food.taken', itemKind: 'bread' }]),
        '1_0:household:0': fakeHousehold('1_0:household:0', [{ simTime: 1, seq: 0, type: 'food.taken', itemKind: 'bread' }]),
      },
      economies: {
        '0_0': fakeEconomy('0_0', [{ simTime: 1, seq: 0, type: 'stock.added', kind: 'iron', amount: 1 }]),
        '1_0': fakeEconomy('1_0', [{ simTime: 1, seq: 0, type: 'stock.added', kind: 'iron', amount: 9 }]),
      },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const historyA = api!.settlement('0_0')!.history()!
    expect(historyA.every((e) => e.settlementId === '0_0')).toBe(true)
    expect(JSON.stringify(historyA)).not.toContain('1_0:npc:0')
    expect(JSON.stringify(historyA)).not.toContain('1_0:household:0')
  })

  it("settlement(id).history() includes a household's history even while the settlement itself is currently unloaded", () => {
    stubWindow('?debug=1')
    const { manager } = fakeSettlementsManager({
      loaded: [],
      defs: { '0_0': { id: '0_0', name: 'Home', size: 'MD', x: 0, z: 0, families: [{}] } as unknown as SettlementDef },
      households: {
        '0_0:household:0': fakeHousehold('0_0:household:0', [
          { simTime: 5, seq: 0, type: 'food.taken', itemKind: 'bread' },
        ]),
      },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const history = api!.settlement('0_0')!.history()!
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ scope: 'household', simTime: 5 })
  })

  it('a simulated settlement reload drops the previous NPC list from settlement(id).history() without a stale reference', () => {
    stubWindow('?debug=1')
    const npcOld = fakeNpc('0_0:npc:old', null, [{ simTime: 1, type: 'action.completed', action: 'work' }])
    const npcNew = fakeNpc('0_0:npc:new', null, [{ simTime: 2, type: 'action.completed', action: 'work' }])
    const { manager, setLoaded } = fakeSettlementsManager({
      loaded: [fakeSettlement('0_0', [npcOld])],
      defs: { '0_0': { id: '0_0', name: 'Home', size: 'MD', x: 0, z: 0, families: [] } as unknown as SettlementDef },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const handle = api!.settlement('0_0')!
    expect(handle.history()!.map((e) => e.simTime)).toEqual([1])

    setLoaded([fakeSettlement('0_0', [npcNew])])
    expect(handle.history()!.map((e) => e.simTime)).toEqual([2])
  })
})

describe('teleportTo', () => {
  it('teleportTo.villageNearest() teleports to exactly what locations.villageNearest() reports', async () => {
    stubWindow('?debug=1')
    const { manager } = fakeSettlementsManager({
      defs: { '1_0': { id: '1_0', name: 'Near', size: 'SM', x: 280, z: 0 } as SettlementDef },
    })
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport, getPlayerPosition: () => ({ x: 0, z: 0 }) })

    const expected = api!.locations.villageNearest()
    expect(expected).not.toBeNull()

    const result = await api!.teleportTo.villageNearest()
    expect(result).toBe(true)
    expect(teleport).toHaveBeenCalledWith(expected!.position.x, expected!.position.z)
  })

  it('teleportTo(locationResult) forwards a hand-built result directly', async () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport })

    const result = await api!.teleportTo({ kind: 'mountain', position: { x: 42, z: -7 }, distance: 0 })
    expect(result).toBe(true)
    expect(teleport).toHaveBeenCalledWith(42, -7)
  })

  it('resolves false and never calls teleport when the location is null', async () => {
    stubWindow('?debug=1')
    const { manager } = fakeSettlementsManager({}) // no defs anywhere -> villageNearest() is null
    const bundle = { settlementsManager: manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport })

    expect(api!.locations.villageNearest()).toBeNull()
    const result = await api!.teleportTo.villageNearest()
    expect(result).toBe(false)
    expect(teleport).not.toHaveBeenCalled()
  })
})

describe('teleportTo.darkForestTreasure()', () => {
  it('teleports to the authoritative catalog position and calls getById with the ruins id', async () => {
    stubWindow('?debug=1')
    const site: WorldLocation = {
      id: DARK_FOREST_TREASURE_LOCATION_ID,
      kind: 'ruins',
      x: 412.5,
      z: -88.25,
      name: 'Ruiny',
      discoveryWeight: 0,
    }
    const getById = vi.fn((id: string) => (id === DARK_FOREST_TREASURE_LOCATION_ID ? site : null))
    const catalog = {
      getById,
      nearestSettlements: () => [],
      landmarksWithin: () => [],
      invalidateScanCache: () => {},
    } as unknown as WorldLocationCatalog
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport, catalog })

    const result = await api!.teleportTo.darkForestTreasure()
    expect(result).toBe(true)
    expect(getById).toHaveBeenCalledWith(DARK_FOREST_TREASURE_LOCATION_ID)
    expect(teleport).toHaveBeenCalledWith(site.x, site.z)
  })

  it('resolves false and never calls teleport when the site is unavailable', async () => {
    stubWindow('?debug=1')
    const getById = vi.fn(() => null)
    const catalog = {
      getById,
      nearestSettlements: () => [],
      landmarksWithin: () => [],
      invalidateScanCache: () => {},
    } as unknown as WorldLocationCatalog
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport, catalog })

    const result = await api!.teleportTo.darkForestTreasure()
    expect(result).toBe(false)
    expect(getById).toHaveBeenCalledWith(DARK_FOREST_TREASURE_LOCATION_ID)
    expect(teleport).not.toHaveBeenCalled()
  })
})

describe('worldLocations cave teleports', () => {
  const mixedCaves = fakeCaves([
    { caveId: 'near-adventure', x: 10, z: 0, archetype: 'adventure' },
    { caveId: 'far-dungeon', x: 100, z: 0, archetype: 'dungeon' },
    { caveId: 'mid-natural', x: 40, z: 0, archetype: 'natural' },
  ])

  it('teleportToNearestCave(type) teleports to the nearest cave of that archetype', async () => {
    stubWindow('?debug=1')
    const teleport = vi.fn(async () => {})
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      caves: mixedCaves,
    } as unknown as WorldBundle
    const { api } = install(bundle, { teleport, getPlayerPosition: () => ({ x: 0, z: 0 }) })

    await expect(api!.worldLocations.teleportToNearestCave('dungeon')).resolves.toBe(true)
    expect(teleport).toHaveBeenCalledOnce()
    expect(teleport).toHaveBeenCalledWith(100, 0)
  })

  it('ignores closer caves of a different archetype', async () => {
    stubWindow('?debug=1')
    const teleport = vi.fn(async () => {})
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      caves: mixedCaves,
    } as unknown as WorldBundle
    const { api } = install(bundle, { teleport, getPlayerPosition: () => ({ x: 0, z: 0 }) })

    await expect(api!.worldLocations.teleportToNearestCave('natural')).resolves.toBe(true)
    expect(teleport).toHaveBeenCalledWith(40, 0)
    expect(teleport).not.toHaveBeenCalledWith(10, 0)
  })

  it('resolves false and never calls teleport when the archetype is absent', async () => {
    stubWindow('?debug=1')
    const teleport = vi.fn(async () => {})
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      caves: fakeCaves([
        { caveId: 'only-natural', x: 8, z: 0, archetype: 'natural' },
      ]),
    } as unknown as WorldBundle
    const { api } = install(bundle, { teleport, getPlayerPosition: () => ({ x: 0, z: 0 }) })

    await expect(api!.worldLocations.teleportToNearestCave('dungeon')).resolves.toBe(false)
    expect(teleport).not.toHaveBeenCalled()
  })

  it('teleportToFirstCave() still picks the nearest entrance of any archetype', async () => {
    stubWindow('?debug=1')
    const teleport = vi.fn(async () => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      caves: mixedCaves,
    } as unknown as WorldBundle
    const { api } = install(bundle, { teleport, getPlayerPosition: () => ({ x: 0, z: 0 }) })

    await expect(api!.worldLocations.teleportToFirstCave()).resolves.toBe(true)
    expect(teleport).toHaveBeenCalledOnce()
    expect(teleport).toHaveBeenCalledWith(10, 0)
    log.mockRestore()
  })
})

function fakeRiverConfig(seed = 1): WorldConfig {
  return {
    seed,
    terrain: {
      heightScale: 18,
      waterLevel: 0.45,
      noiseScale: 105,
      detailAmplitude: 0.65,
      hillsScale: 420,
      hillsAmplitude: 0.34,
      hillsFbm: { octaves: 3, persistence: 0.55, lacunarity: 2, exponentiation: 1.15 },
      fbm: { octaves: 4, persistence: 0.65, lacunarity: 2, exponentiation: 1.35 },
      biome: { noiseScale: 96, fbm: { octaves: 3, persistence: 0.5, lacunarity: 2, exponentiation: 1 } },
      region: { oceanThreshold: 0.32, coastThreshold: 0.45 },
    },
  } as unknown as WorldConfig
}

function riverPoint(x: number, z: number, elevation: number, accumulation = 100) {
  return { x, z, elevation, accumulation }
}

describe('teleportTo.nextRiver() (plan ui-input-008)', () => {
  it('cycles through different qualifying rivers in a stable order and wraps at the end', async () => {
    stubWindow('?debug=1')
    const config = fakeRiverConfig(1)
    const originTile = riverTileCoordOf(0, 0)
    const riverA = riverPoint(-256, 0, 5, 10)
    const riverB = riverPoint(256, 0, 5, 500)
    vi.mocked(computeRiverTile).mockImplementation((tile) => {
      if (tile.tx === originTile.tx - 1 && tile.tz === originTile.tz) return [{ points: [riverA] }]
      if (tile.tx === originTile.tx + 1 && tile.tz === originTile.tz) return [{ points: [riverB] }]
      return []
    })
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport, config })

    expect(await api!.teleportTo.nextRiver()).toBe(true)
    expect(teleport).toHaveBeenNthCalledWith(1, riverA.x, riverA.z)
    expect(await api!.teleportTo.nextRiver()).toBe(true)
    expect(teleport).toHaveBeenNthCalledWith(2, riverB.x, riverB.z)
    expect(await api!.teleportTo.nextRiver()).toBe(true)
    expect(teleport).toHaveBeenNthCalledWith(3, riverA.x, riverA.z)
  })

  it('resolves false and never calls teleport when no river qualifies', async () => {
    stubWindow('?debug=1')
    const config = fakeRiverConfig(1)
    vi.mocked(computeRiverTile).mockReturnValue([])
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport, config })

    expect(await api!.teleportTo.nextRiver()).toBe(false)
    expect(teleport).not.toHaveBeenCalled()
  })

  it('resets the cursor to a fresh list when config.seed changes (world rebuild/reseed)', async () => {
    stubWindow('?debug=1')
    const config = fakeRiverConfig(1)
    const originTile = riverTileCoordOf(0, 0)
    const riverA = riverPoint(-256, 0, 5, 10)
    const riverC = riverPoint(0, 256, 5, 20)
    vi.mocked(computeRiverTile).mockImplementation((tile) =>
      tile.tx === originTile.tx - 1 && tile.tz === originTile.tz ? [{ points: [riverA] }] : [])
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const teleport = vi.fn(async () => {})
    const { api } = install(bundle, { teleport, config })

    expect(await api!.teleportTo.nextRiver()).toBe(true)
    expect(teleport).toHaveBeenNthCalledWith(1, riverA.x, riverA.z)

    config.seed = 2
    vi.mocked(computeRiverTile).mockImplementation((tile) =>
      tile.tx === originTile.tx && tile.tz === originTile.tz + 1 ? [{ points: [riverC] }] : [])

    expect(await api!.teleportTo.nextRiver()).toBe(true)
    expect(teleport).toHaveBeenNthCalledWith(2, riverC.x, riverC.z)
  })
})

describe('player ground-resolution trace', () => {
  it('returns an empty unfrozen snapshot when no buffer is installed', () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api!.getPlayerGroundTrace()).toEqual({
      frozen: false,
      triggerSeq: null,
      triggerReason: null,
      ticks: [],
    })
    expect(api!.player.groundTrace()).toEqual({
      frozen: false,
      triggerSeq: null,
      triggerReason: null,
      ticks: [],
    })
    expect(() => api!.clearPlayerGroundTrace()).not.toThrow()
  })

  it('exposes the ring through getPlayerGroundTrace and player.groundTrace aliases', () => {
    stubWindow('?debug=1')
    const groundTrace = createPlayerGroundTraceBuffer(4, 0)
    groundTrace.record({
      seq: 0,
      writer: 'vertical',
      before: { x: 120, y: 1.4, z: -16 },
      after: { x: 119, y: 1.4, z: -16 },
      surfaceY: 11.2,
      raw: { floorY: 1.4, ceilingY: 8, openSky: false },
      lastGroundHit: { floorY: 1.4, ceilingY: 8, openSky: false },
      resolved: { floorY: 1.4, ceilingY: 8, openSky: false },
      source: 'cave',
      groundY: 1.4,
      floorY: 1.4,
      ceilingY: 8,
      occupancy: true,
      queryInterior: true,
      groundedBefore: true,
      groundedAfter: true,
      verticalVelocityBefore: 0,
      verticalVelocityAfter: 0,
      caveId: 'cave:0e3cce97',
      along: -16.7,
      lateral: 1.4,
      triggerReason: null,
    })
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle, { groundTrace })
    const snap = api!.getPlayerGroundTrace()
    expect(snap.frozen).toBe(false)
    expect(snap.ticks).toHaveLength(1)
    expect(snap.ticks[0]).toMatchObject({
      seq: 1,
      source: 'cave',
      groundY: 1.4,
      before: { y: 1.4 },
      after: { y: 1.4 },
    })
    expect(api!.player.groundTrace()).toEqual(snap)
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
    api!.clearPlayerGroundTrace()
    expect(api!.getPlayerGroundTrace()).toEqual({
      frozen: false,
      triggerSeq: null,
      triggerReason: null,
      ticks: [],
    })
    expect(api!.player.groundTrace().ticks).toEqual([])
  })

  it('mentions the ground-trace commands in help()', () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api!.help()).toContain('getPlayerGroundTrace')
    expect(api!.help()).toContain('clearPlayerGroundTrace')
  })
})

describe('quests', () => {
  it('quests.list() returns the current QuestManager.list() result', () => {
    stubWindow('?debug=1')
    const entries = [{ id: 'wilki-u-kupca', title: 'Wilki u kupca' }]
    const list = vi.fn(() => entries)
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle, { questManager: { list } })
    expect(api!.quests.list()).toBe(entries)
    expect(list).toHaveBeenCalledOnce()
  })

  it("quests.target('wolf-den') resolves the physical wolfDen spawner, not an id match", () => {
    stubWindow('?debug=1')
    const den = fakeWolfDenSpawner()
    const other = fakeWolfDenSpawner({
      id: 'wolf-den',
      type: 'rockDen',
      kind: 'wolf',
      x: 1,
      z: 1,
    })
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      fauna: fakeFauna({ spawners: [other, den], isWolfDenCleared: false }),
    } as unknown as WorldBundle
    const { api } = install(bundle)
    const snapshot = api!.quests.target('wolf-den')
    expect(snapshot).not.toBeNull()
    expect(snapshot).toMatchObject({
      targetId: 'wolf-den',
      resolved: true,
      kind: 'spawnPoint',
      spawner: {
        id: 'home:wolfDen',
        type: 'wolfDen',
        animalKind: 'wolf',
        position: { x: den.x, z: den.z },
        state: 'active',
        deathsThisCycle: den.deathsThisCycle,
        maxPreyCount: den.maxPreyCount,
        pressure: den.pressure,
        humanTaste: true,
        canRecover: false,
      },
      questState: { packCleared: false, permanentlyDestroyed: false },
    })
    expect(snapshot!.spawner.id).not.toBe('wolf-den')
    expect(snapshot!.spawner.position.x).toBe(den.x)
    expect(snapshot!.spawner.position.z).toBe(den.z)
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('quests.target() reports packCleared independently of PreySpawner state', () => {
    stubWindow('?debug=1')
    const den = fakeWolfDenSpawner({ state: 'active', deathsThisCycle: 0 })
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      fauna: fakeFauna({ spawners: [den], isWolfDenCleared: true }),
    } as unknown as WorldBundle
    const { api } = install(bundle)
    const snapshot = api!.quests.target('wolf-den')
    expect(snapshot?.questState).toEqual({ packCleared: true, permanentlyDestroyed: false })
    expect(snapshot?.spawner.state).toBe('active')
  })

  it('quests.target() distinguishes packCleared from permanentlyDestroyed', () => {
    stubWindow('?debug=1')
    const den = fakeWolfDenSpawner({ state: 'disabled', canRecover: false, deathsThisCycle: 3 })
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      fauna: fakeFauna({
        spawners: [den],
        isWolfDenCleared: false,
        isQuestSpawnPointPermanentlyDestroyed: true,
      }),
    } as unknown as WorldBundle
    const { api } = install(bundle)
    const snapshot = api!.quests.target('wolf-den')
    expect(snapshot?.spawner.state).toBe('disabled')
    expect(snapshot?.spawner.canRecover).toBe(false)
    expect(snapshot?.questState).toEqual({ packCleared: false, permanentlyDestroyed: true })
  })

  it('quests.target() reads permanentlyDestroyed from Fauna, not by inspecting spawner fields', () => {
    stubWindow('?debug=1')
    const den = fakeWolfDenSpawner({ state: 'disabled', canRecover: false })
    const isQuestSpawnPointPermanentlyDestroyed = vi.fn(() => true)
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      fauna: {
        getSpawners: () => [den],
        isWolfDenCleared: () => false,
        isQuestSpawnPointPermanentlyDestroyed,
      },
    } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api!.quests.target('wolf-den')?.questState?.permanentlyDestroyed).toBe(true)
    expect(isQuestSpawnPointPermanentlyDestroyed).toHaveBeenCalledWith('wolf-den')
  })

  it('quests.teleportToTarget() uses the injected teleport callback at the resolved spawner', async () => {
    stubWindow('?debug=1')
    const den = fakeWolfDenSpawner({ x: 88, z: 17 })
    const teleport = vi.fn(async () => {})
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      fauna: fakeFauna({ spawners: [den] }),
    } as unknown as WorldBundle
    const { api } = install(bundle, { teleport })
    await expect(api!.quests.teleportToTarget('wolf-den')).resolves.toBe(true)
    expect(teleport).toHaveBeenCalledOnce()
    expect(teleport).toHaveBeenCalledWith(den.x, den.z)
  })

  it('quests.target() re-reads spawners on each call', () => {
    stubWindow('?debug=1')
    let spawners: PreySpawner[] = []
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      fauna: {
        getSpawners: () => spawners,
        isWolfDenCleared: () => false,
        isQuestSpawnPointPermanentlyDestroyed: () => false,
      },
    } as unknown as WorldBundle
    const { api } = install(bundle)
    expect(api!.quests.target('wolf-den')).toBeNull()
    spawners = [fakeWolfDenSpawner()]
    expect(api!.quests.target('wolf-den')?.spawner.id).toBe('home:wolfDen')
  })

  it('returns null / false for an unresolved quest target', async () => {
    stubWindow('?debug=1')
    const teleport = vi.fn(async () => {})
    const bundle = {
      settlementsManager: fakeSettlementsManager({}).manager,
      fauna: fakeFauna({ spawners: [fakeWolfDenSpawner()] }),
    } as unknown as WorldBundle
    const { api } = install(bundle, { teleport })
    expect(api!.quests.target('does-not-exist')).toBeNull()
    await expect(api!.quests.teleportToTarget('does-not-exist')).resolves.toBe(false)
    expect(teleport).not.toHaveBeenCalled()
  })

  it('help() documents quests.list / target / teleportToTarget', () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const help = api!.help()
    expect(help).toContain('quests.list()')
    expect(help).toContain("quests.target('wolf-den')")
    expect(help).toContain("quests.teleportToTarget('wolf-den')")
  })
})
