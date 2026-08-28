import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NpcInspectionSnapshot } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { WorldConfig } from '../config/worldConfig'
import type { SettlementCell, SettlementDef } from '../settlement/settlementGenerator'
import type { SettlementsManager } from '../settlement/SettlementsManager'
import type { WorldContext } from '../world/worldContext'
import { installNpcDebugApi } from './npcDebugApi'

afterEach(() => {
  vi.unstubAllGlobals()
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

function fakeNpc(id: string) {
  return { id, createInspectionSnapshot: () => baseSnapshot(id) }
}

function fakeSettlement(id: string, npcs: ReturnType<typeof fakeNpc>[] = []) {
  return { id, name: `Settlement ${id}`, size: 'MD', center: { x: 0, z: 0 }, npcs }
}

type FakeManagerOpts = {
  loaded?: ReturnType<typeof fakeSettlement>[]
  defs?: Record<string, SettlementDef>
}

function fakeSettlementsManager(opts: FakeManagerOpts): { manager: SettlementsManager, setLoaded: (l: ReturnType<typeof fakeSettlement>[]) => void } {
  let loaded = opts.loaded ?? []
  const defs = opts.defs ?? {}
  const manager = {
    getLoaded: () => loaded,
    peekDef: (cell: SettlementCell) => defs[`${cell.gx}_${cell.gz}`] ?? null,
  } as unknown as SettlementsManager
  return { manager, setLoaded: (l) => { loaded = l } }
}

function install(
  bundle: WorldBundle,
  opts: {
    getPlayerPosition?: () => { x: number, z: number }
    teleport?: (x: number, z: number) => Promise<void>
  } = {},
) {
  const worldContext = {} as unknown as WorldContext
  const config = {} as unknown as WorldConfig
  const teleport = opts.teleport ?? vi.fn(async () => {})
  const getPlayerPosition = opts.getPlayerPosition ?? (() => ({ x: 0, z: 0 }))
  const worldFlags = { hiddenTreasureFound: false }
  installNpcDebugApi(bundle, worldContext, config, () => 0.5, getPlayerPosition, teleport, worldFlags)
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
    expect(typeof api!.help).toBe('function')
  })

  it('help() returns a non-empty string mentioning each surface', () => {
    stubWindow('?debug=1')
    const bundle = { settlementsManager: fakeSettlementsManager({}).manager } as unknown as WorldBundle
    const { api } = install(bundle)
    const help = api!.help()
    expect(typeof help).toBe('string')
    expect(help.length).toBeGreaterThan(0)
    for (const word of ['npc', 'village', 'locations', 'teleportTo']) {
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
