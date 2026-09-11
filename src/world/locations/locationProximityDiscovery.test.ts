import { describe, expect, it } from 'vitest'
import type { SettlementCell } from '../../settlement/settlementGenerator'
import type { CaveDefinition } from '../caveVolume'
import type { MapProjection } from '../map/mapProjection'
import type { WorldLocation } from './worldLocationTypes'
import { SETTLEMENT_GRID_STEP } from '../../settlement/settlementGenerator'
import { createMapData } from '../map/mapData'
import { createMapDiscovery } from '../map/mapDiscovery'
import { createLocationKnowledge } from './locationKnowledge'
import {
  CAVE_ENTRANCE_DISCOVERY_RADIUS,
  confirmHomeSettlement,
  createLocationProximityDiscovery,
  revealCaveEntrancesInRange,
  revealSettlementsInRange,
  type SettlementProximityDef,
} from './locationProximityDiscovery'
import { settlementLocationId } from './worldLocationCatalog'
import { emptyLocationScanDiagnostics, type WorldLocationCatalog } from './worldLocationCatalog'

function caveDef(caveId: string, x: number, z: number): CaveDefinition {
  return {
    caveId,
    entrance: { x, y: 0, z, yaw: 0, width: 2, height: 2 },
    nodes: [],
    tunnels: [],
    bounds: { minX: x, maxX: x, minY: 0, maxY: 1, minZ: z, maxZ: z },
    variant: 0,
  }
}

function fakeCatalog(locations: readonly WorldLocation[]): WorldLocationCatalog {
  return {
    getById(id) {
      return locations.find((l) => l.id === id) ?? null
    },
    nearestSettlements: () => [],
    landmarksWithin: () => [],
    landmarksInRange: () => [],
    landmarksInRangeAsync: async () => [],
    invalidateScanCache: () => {},
    getScanDiagnostics: () => emptyLocationScanDiagnostics(),
  }
}

function settlementDef(
  gx: number,
  gz: number,
  name: string,
  radius: number,
  extras?: { x?: number, z?: number },
): SettlementProximityDef & { gx: number, gz: number } {
  const x = extras?.x ?? gx * SETTLEMENT_GRID_STEP
  const z = extras?.z ?? gz * SETTLEMENT_GRID_STEP
  return {
    id: `${gx}_${gz}`,
    name,
    gx,
    gz,
    plan: { boundary: { x, z, radius } },
  }
}

function lookupFrom(
  defs: readonly (SettlementProximityDef & { gx: number, gz: number })[],
): (cell: SettlementCell) => SettlementProximityDef | null {
  const map = new Map(defs.map((def) => [`${def.gx}_${def.gz}`, def]))
  return (cell) => map.get(`${cell.gx}_${cell.gz}`) ?? null
}

function locationFromDef(def: SettlementProximityDef & { gx: number, gz: number }): WorldLocation {
  return {
    id: settlementLocationId(def),
    kind: 'settlement',
    x: def.plan.boundary.x,
    z: def.plan.boundary.z,
    name: def.name,
    discoveryWeight: 0,
  }
}

function stubProjection(): MapProjection {
  return {
    project: () => ({ key: '0,0', cx: 0, cz: 0, terrain: 'lowland', biome: 'meadow', water: false }),
    cellsInViewport: () => [],
    setParams: () => {},
    invalidateCache: () => {},
  }
}

describe('revealCaveEntrancesInRange', () => {
  const caves = [caveDef('alpha', 100, 200)]
  const catalog = fakeCatalog([{ id: 'cave:alpha', kind: 'cave', x: 100, z: 200, name: 'Grota Alpha', discoveryWeight: 0 }])

  it('confirms an unknown cave when the player is within the entrance radius', () => {
    const knowledge = createLocationKnowledge()
    const revealed = revealCaveEntrancesInRange(100, 200, caves, catalog, knowledge)
    expect(revealed).toEqual([{ id: 'cave:alpha', name: 'Grota Alpha' }])
    expect(knowledge.get('cave:alpha')).toEqual({ id: 'cave:alpha', state: 'confirmed', source: 'exploration' })
  })

  it('upgrades map/NPC discovered to confirmed', () => {
    const knowledge = createLocationKnowledge([{ id: 'cave:alpha', state: 'discovered', source: 'map' }])
    const revealed = revealCaveEntrancesInRange(100, 200, caves, catalog, knowledge)
    expect(revealed).toEqual([{ id: 'cave:alpha', name: 'Grota Alpha' }])
    expect(knowledge.get('cave:alpha')?.state).toBe('confirmed')
    expect(knowledge.get('cave:alpha')?.source).toBe('exploration')
  })

  it('is a no-op when already confirmed', () => {
    const knowledge = createLocationKnowledge([{ id: 'cave:alpha', state: 'confirmed', source: 'exploration' }])
    expect(revealCaveEntrancesInRange(100, 200, caves, catalog, knowledge)).toEqual([])
    expect(knowledge.list()).toHaveLength(1)
  })

  it('is a no-op outside the discovery radius', () => {
    const knowledge = createLocationKnowledge()
    const far = CAVE_ENTRANCE_DISCOVERY_RADIUS + 5
    expect(revealCaveEntrancesInRange(100 + far, 200, caves, catalog, knowledge)).toEqual([])
    expect(knowledge.has('cave:alpha')).toBe(false)
  })
})

describe('confirmHomeSettlement', () => {
  const home = settlementDef(0, 0, 'Dolina', 40)

  it('marks the home settlement confirmed from exploration on a fresh game', () => {
    const knowledge = createLocationKnowledge()
    expect(confirmHomeSettlement(home, knowledge)).toBe(true)
    expect(knowledge.get(settlementLocationId(home))).toEqual({
      id: settlementLocationId(home),
      state: 'confirmed',
      source: 'exploration',
    })
  })

  it('is visible through MapData once confirmed', () => {
    const knowledge = createLocationKnowledge()
    confirmHomeSettlement(home, knowledge)
    const mapData = createMapData({
      projection: stubProjection(),
      discovery: createMapDiscovery(),
      catalog: fakeCatalog([locationFromDef(home)]),
      knowledge,
    })
    const known = mapData.knownLocations({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 })
    expect(known).toHaveLength(1)
    expect(known[0]?.id).toBe(settlementLocationId(home))
    expect(known[0]?.kind).toBe('settlement')
    expect(known[0]?.label).toBe('Dolina')
    expect(known[0]?.state).toBe('confirmed')
  })

  it('normalizes an older save that is missing the home entry without dropping other knowledge', () => {
    const knowledge = createLocationKnowledge([
      { id: 'cave:alpha', state: 'discovered', source: 'npc' },
    ])
    confirmHomeSettlement(home, knowledge)
    expect(knowledge.get(settlementLocationId(home))?.state).toBe('confirmed')
    expect(knowledge.get('cave:alpha')).toEqual({ id: 'cave:alpha', state: 'discovered', source: 'npc' })
  })

  it('is a no-op when home is already confirmed', () => {
    const knowledge = createLocationKnowledge()
    expect(confirmHomeSettlement(home, knowledge)).toBe(true)
    expect(confirmHomeSettlement(home, knowledge)).toBe(false)
  })
})

describe('revealSettlementsInRange', () => {
  const home = settlementDef(0, 0, 'Dolina', 40)
  const foreign = settlementDef(1, 0, 'Brzeg', 40)
  const catalog = fakeCatalog([locationFromDef(home), locationFromDef(foreign)])
  const lookup = lookupFrom([home, foreign])

  it('does not know a foreign village before the player enters its boundary', () => {
    const knowledge = createLocationKnowledge()
    confirmHomeSettlement(home, knowledge)
    expect(revealSettlementsInRange(0, 0, lookup, catalog, knowledge)).toEqual([])
    expect(knowledge.has(settlementLocationId(foreign))).toBe(false)
    expect(knowledge.has(settlementLocationId(home))).toBe(true)
  })

  it('confirms a foreign village on physical arrival', () => {
    const knowledge = createLocationKnowledge()
    confirmHomeSettlement(home, knowledge)
    const revealed = revealSettlementsInRange(foreign.plan.boundary.x, foreign.plan.boundary.z, lookup, catalog, knowledge)
    expect(revealed).toEqual([{ id: settlementLocationId(foreign), name: 'Brzeg' }])
    expect(knowledge.get(settlementLocationId(foreign))).toEqual({
      id: settlementLocationId(foreign),
      state: 'confirmed',
      source: 'exploration',
    })
  })

  it('makes the visited settlement available through MapData', () => {
    const knowledge = createLocationKnowledge()
    confirmHomeSettlement(home, knowledge)
    revealSettlementsInRange(foreign.plan.boundary.x, foreign.plan.boundary.z, lookup, catalog, knowledge)
    const mapData = createMapData({
      projection: stubProjection(),
      discovery: createMapDiscovery(),
      catalog,
      knowledge,
    })
    const known = mapData.knownLocations({ minX: -50, maxX: SETTLEMENT_GRID_STEP + 50, minZ: -50, maxZ: 50 })
    const ids = known.map((entry) => entry.id).sort()
    expect(ids).toEqual([settlementLocationId(home), settlementLocationId(foreign)].sort())
    expect(known.find((entry) => entry.id === settlementLocationId(foreign))?.label).toBe('Brzeg')
  })

  it('is a no-op on a second visit (idempotent, no duplicate discovery)', () => {
    const knowledge = createLocationKnowledge()
    revealSettlementsInRange(foreign.plan.boundary.x, foreign.plan.boundary.z, lookup, catalog, knowledge)
    expect(revealSettlementsInRange(foreign.plan.boundary.x, foreign.plan.boundary.z, lookup, catalog, knowledge)).toEqual([])
    expect(knowledge.list().filter((entry) => entry.id === settlementLocationId(foreign))).toHaveLength(1)
  })

  it('does not confirm a settlement just outside its VillagePlan.boundary', () => {
    const knowledge = createLocationKnowledge()
    const outside = foreign.plan.boundary.x + foreign.plan.boundary.radius + 1
    expect(revealSettlementsInRange(outside, foreign.plan.boundary.z, lookup, catalog, knowledge)).toEqual([])
    expect(knowledge.has(settlementLocationId(foreign))).toBe(false)
  })

  it('upgrades map-discovered knowledge to confirmed on arrival', () => {
    const knowledge = createLocationKnowledge([
      { id: settlementLocationId(foreign), state: 'discovered', source: 'map' },
    ])
    const revealed = revealSettlementsInRange(foreign.plan.boundary.x, foreign.plan.boundary.z, lookup, catalog, knowledge)
    expect(revealed).toEqual([{ id: settlementLocationId(foreign), name: 'Brzeg' }])
    expect(knowledge.get(settlementLocationId(foreign))).toEqual({
      id: settlementLocationId(foreign),
      state: 'confirmed',
      source: 'exploration',
    })
  })
})

describe('map-cell discovery vs settlement knowledge', () => {
  const home = settlementDef(0, 0, 'Dolina', 40)
  const catalog = fakeCatalog([locationFromDef(home)])

  it('does not reveal a settlement just because its map cell is explored', () => {
    const knowledge = createLocationKnowledge()
    const discovery = createMapDiscovery()
    discovery.update(home.plan.boundary.x, home.plan.boundary.z)
    expect(discovery.size()).toBeGreaterThan(0)
    expect(knowledge.has(settlementLocationId(home))).toBe(false)
    const mapData = createMapData({
      projection: stubProjection(),
      discovery,
      catalog,
      knowledge,
    })
    expect(mapData.knownLocations({ minX: -80, maxX: 80, minZ: -80, maxZ: 80 })).toEqual([])
  })
})

describe('settlement knowledge persistence and New Game', () => {
  const home = settlementDef(0, 0, 'Dolina', 40)
  const foreign = settlementDef(1, 0, 'Brzeg', 40)
  const catalog = fakeCatalog([locationFromDef(home), locationFromDef(foreign)])
  const lookup = lookupFrom([home, foreign])

  it('save/load preserves visited settlements through LocationKnowledge.serialize', () => {
    const knowledge = createLocationKnowledge()
    confirmHomeSettlement(home, knowledge)
    revealSettlementsInRange(foreign.plan.boundary.x, foreign.plan.boundary.z, lookup, catalog, knowledge)
    const restored = createLocationKnowledge(knowledge.serialize())
    expect(restored.get(settlementLocationId(home))).toEqual({
      id: settlementLocationId(home),
      state: 'confirmed',
      source: 'exploration',
    })
    expect(restored.get(settlementLocationId(foreign))).toEqual({
      id: settlementLocationId(foreign),
      state: 'confirmed',
      source: 'exploration',
    })
  })

  it('New Game / rebuild does not leak the previous world\'s knowledge', () => {
    const knowledge = createLocationKnowledge()
    confirmHomeSettlement(home, knowledge)
    revealSettlementsInRange(foreign.plan.boundary.x, foreign.plan.boundary.z, lookup, catalog, knowledge)
    knowledge.clear()
    const nextHome = settlementDef(0, 0, 'Nowa Osada', 40)
    confirmHomeSettlement(nextHome, knowledge)
    expect(knowledge.has(settlementLocationId(foreign))).toBe(false)
    expect(knowledge.list()).toEqual([{
      id: settlementLocationId(nextHome),
      state: 'confirmed',
      source: 'exploration',
    }])
  })
})

describe('createLocationProximityDiscovery settlements', () => {
  const home = settlementDef(0, 0, 'Dolina', 40)
  const foreign = settlementDef(1, 0, 'Brzeg', 40)
  const catalog = fakeCatalog([locationFromDef(home), locationFromDef(foreign)])

  it('throttles settlement checks and does not re-report a confirmed village', () => {
    let now = 0
    const knowledge = createLocationKnowledge()
    confirmHomeSettlement(home, knowledge)
    const discovery = createLocationProximityDiscovery({
      getCaveDefinitions: () => [],
      lookupSettlement: lookupFrom([home, foreign]),
      catalog,
      knowledge,
      checkIntervalS: 0.25,
      now: () => now,
    })
    const first = discovery.update(foreign.plan.boundary.x, foreign.plan.boundary.z)
    expect(first).toEqual([{ id: settlementLocationId(foreign), name: 'Brzeg' }])
    now += 0.1
    expect(discovery.update(foreign.plan.boundary.x, foreign.plan.boundary.z)).toEqual([])
    now += 0.25
    expect(discovery.update(foreign.plan.boundary.x, foreign.plan.boundary.z)).toEqual([])
  })
})
