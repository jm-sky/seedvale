import { describe, expect, it } from 'vitest'
import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import type { WorldLocation } from '../locations/worldLocationTypes'
import { createLocationKnowledge } from '../locations/locationKnowledge'
import { MAP_CELL_SIZE, MAP_DISCOVERY_RADIUS } from './mapConfig'
import { createMapData } from './mapData'
import { cellsInDiscoveryRadius, createMapDiscovery } from './mapDiscovery'
import {
  createMapProjection,
  mapCellBounds,
  mapCellCenter,
  mapCellKey,
  parseMapCellKey,
  projectCellAt,
  worldToMapCell,
} from './mapProjection'

function rawParams(overrides: Partial<RawSampleParams> = {}): RawSampleParams {
  return {
    seed: 42,
    heightScale: 18,
    waterLevel: 0.45,
    noiseScale: 120,
    detailAmplitude: 0.55,
    hillsScale: 420,
    hillsAmplitude: 0.28,
    hillsFbm: { octaves: 3, persistence: 0.55, lacunarity: 2.0, exponentiation: 1.15 },
    fbm: { octaves: 4, persistence: 0.65, lacunarity: 2.0, exponentiation: 1.35 },
    biome: {
      noiseScale: 96,
      fbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
    },
    region: {
      continentScale: 2200,
      continentFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
      mountainScale: 1800,
      mountainFbm: { octaves: 2, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.2 },
      mountainThreshold: 0.62,
      mountainThresholdWidth: 0.14,
      worleyCellSize: 260,
      ridgeSharpness: 2.0,
      mountainGain: 0.8,
      oceanThreshold: 0.32,
      coastThreshold: 0.45,
      oceanDetailWeight: 0.25,
      moistureRegionScale: 2000,
      moistureRegionFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
      desertThreshold: 0.35,
      desertThresholdWidth: 0.12,
      swampThreshold: 0.72,
      swampThresholdWidth: 0.15,
      roadNetwork: {
        roadHalfWidth: 5,
        roadHeightStrength: 0.85,
        roadTintStrength: 0.8,
        pathHalfWidth: 1.5,
        pathHeightStrength: 0.2,
        pathTintStrength: 0.4,
        smoothingWindow: 10,
        maxNeighborRoads: 3,
        dockSearchRadius: 140,
        edgeWobbleAmplitude: 0.15,
        edgeWobbleScale: 0.06,
        potholeDepth: 0.12,
        potholeThreshold: 0.72,
        meanderAmplitude: 2,
        meanderScale: 0.04,
        surfaceDetailEnabled: true,
        rutDepth: 0.05,
        rutOffsetFraction: 0.42,
        rutWidthFraction: 0.16,
        microBumpStrength: 0.025,
        microBumpScale: 0.6,
      },
      village: {
        coreRadius: 9,
        houseRadius: 4.5,
        heightStrength: 0.8,
        tintStrength: 0.75,
        regionalHeightStrengthFlat: 0.3,
        regionalHeightStrengthMountain: 0.15,
      },
    },
    ...overrides,
  }
}

describe('map cell coordinates', () => {
  it('round-trips world position through cell centre', () => {
    const { cx, cz } = worldToMapCell(12.3, -4.1)
    expect(mapCellKey(cx, cz)).toBe(`${cx},${cz}`)
    const { x, z } = mapCellCenter(cx, cz)
    expect(worldToMapCell(x, z)).toEqual({ cx, cz })
    const bounds = mapCellBounds(cx, cz)
    expect(bounds.maxX - bounds.minX).toBe(MAP_CELL_SIZE)
    expect(x).toBeGreaterThanOrEqual(bounds.minX)
    expect(x).toBeLessThan(bounds.maxX)
  })

  it('uses floor division so negatives stay in the correct cell', () => {
    expect(worldToMapCell(-0.1, -0.1)).toEqual({ cx: -1, cz: -1 })
    expect(worldToMapCell(0, 0)).toEqual({ cx: 0, cz: 0 })
    expect(parseMapCellKey('3,-2')).toEqual({ cx: 3, cz: -2 })
    expect(parseMapCellKey('nope')).toBeNull()
  })
})

describe('map projection', () => {
  it('is deterministic for the same seed and cell', () => {
    const params = rawParams()
    const a = projectCellAt(8, 16, params)
    const b = projectCellAt(8, 16, params)
    expect(a).toEqual(b)
    const projection = createMapProjection(params)
    const cell = projection.project(1, 2)
    expect(cell).toEqual(projection.project(1, 2))
    expect(cell.cx).toBe(1)
    expect(cell.cz).toBe(2)
  })

  it('classifies sampled cells into the existing terrain/biome kinds', () => {
    const params = rawParams()
    const land = projectCellAt(0, 0, params)
    expect(['ocean', 'inland_water', 'shore', 'lowland', 'highland', 'mountain']).toContain(land.terrain)
    expect(['none', 'forest', 'desert', 'swamp', 'meadow']).toContain(land.biome)
    expect(land.water).toBe(land.terrain === 'ocean' || land.terrain === 'inland_water')

    let foundWater = false
    for (let x = -4000; x <= 4000 && !foundWater; x += 400) {
      for (let z = -4000; z <= 4000 && !foundWater; z += 400) {
        const cell = projectCellAt(x, z, params)
        if (cell.water) {
          foundWater = true
          expect(cell.biome).toBe('none')
          expect(cell.terrain === 'ocean' || cell.terrain === 'inland_water').toBe(true)
        }
      }
    }
    expect(foundWater).toBe(true)
  })

  it('invalidates cached cells when params change', () => {
    const projection = createMapProjection(rawParams({ seed: 1 }))
    const first = projection.project(4, 4)
    projection.setParams(rawParams({ seed: 99 }))
    const second = projection.project(4, 4)
    expect(second.key).toBe(first.key)
    expect(second).toEqual(projection.project(4, 4))
  })
})

describe('map discovery', () => {
  it('reveals cells within the exploration radius', () => {
    const keys = cellsInDiscoveryRadius(0, 0)
    expect(keys.length).toBeGreaterThan(1)
    const origin = mapCellKey(0, 0)
    expect(keys).toContain(origin)
    for (const key of keys) {
      const parsed = parseMapCellKey(key)
      expect(parsed).not.toBeNull()
      const { x, z } = mapCellCenter(parsed!.cx, parsed!.cz)
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(MAP_DISCOVERY_RADIUS + 1e-6)
    }
  })

  it('does not duplicate state on a second update in the same cell', () => {
    const discovery = createMapDiscovery()
    const first = discovery.update(1, 1)
    expect(first.length).toBeGreaterThan(0)
    expect(discovery.update(1.2, 1.1)).toEqual([])
    const size = discovery.size()
    discovery.update(1.4, 0.9)
    expect(discovery.size()).toBe(size)
  })

  it('round-trips serialize / restore', () => {
    const discovery = createMapDiscovery()
    discovery.update(0, 0)
    const saved = discovery.serialize()
    expect(saved.length).toBe(discovery.size())
    const restored = createMapDiscovery()
    restored.restore(saved)
    expect(restored.serialize().sort()).toEqual(saved.sort())
    expect(restored.isDiscovered(mapCellKey(0, 0))).toBe(true)
  })
})

describe('map data filtering', () => {
  /** Minimal fake `WorldLocationCatalog` (plan world-012) — `mapData.ts`
   *  only ever resolves ids handed back by `LocationKnowledge`, so tests
   *  here don't need the real settlement/cave/lake/peak generators. */
  function fakeCatalog(locations: readonly WorldLocation[]) {
    return {
      getById: (id: string) => locations.find((l) => l.id === id) ?? null,
      nearestSettlements: () => [],
      landmarksWithin: () => [],
      landmarksInRange: () => [],
      invalidateScanCache: () => {},
      getScanDiagnostics: () => ({
        sampledCells: 0,
        cacheHitCells: 0,
        sampleFloorCalls: 0,
        sampleContinentalnessCalls: 0,
        sampleRidgeCalls: 0,
        sampleHeightCalls: 0,
        waterCells: 0,
        mountainCells: 0,
        classificationMs: 0,
        lakeExtractionMs: 0,
        peakExtractionMs: 0,
        cemeteryMs: 0,
      }),
    }
  }

  it('returns only discovered cells, and only locations the player knows about', () => {
    const projection = createMapProjection(rawParams())
    const discovery = createMapDiscovery()
    discovery.update(0, 0)
    const catalog = fakeCatalog([
      { id: 'settlement:home', kind: 'settlement', x: 2, z: 2, name: 'Home', discoveryWeight: 0 },
    ])
    const knowledge = createLocationKnowledge([{ id: 'settlement:home', state: 'confirmed', source: 'exploration' }])
    const mapData = createMapData({ projection, discovery, catalog, knowledge })
    const cells = mapData.queryCells({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 })
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every((cell) => discovery.isDiscovered(cell.key))).toBe(true)
    const known = mapData.knownLocations({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 })
    expect(known).toHaveLength(1)
    expect(known[0]?.label).toBe('Home')
    expect(known[0]?.state).toBe('confirmed')
    expect(known[0]?.source).toBe('exploration')
  })

  it('hides a location outside the requested viewport', () => {
    const projection = createMapProjection(rawParams())
    const discovery = createMapDiscovery()
    const catalog = fakeCatalog([
      { id: 'cave:far', kind: 'cave', x: 400, z: 400, name: 'Far', discoveryWeight: 0.5 },
    ])
    const knowledge = createLocationKnowledge([{ id: 'cave:far', state: 'discovered', source: 'npc' }])
    const mapData = createMapData({ projection, discovery, catalog, knowledge })
    expect(mapData.knownLocations({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 })).toEqual([])
    expect(mapData.knownLocations({ minX: -500, maxX: 500, minZ: -500, maxZ: 500 })).toHaveLength(1)
  })

  it('does not auto-reveal a settlement just because its cell is explored (plan §11)', () => {
    const projection = createMapProjection(rawParams())
    const discovery = createMapDiscovery()
    discovery.update(0, 0)
    // Catalog can resolve it, but the player has no knowledge entry for it.
    const catalog = fakeCatalog([
      { id: 'settlement:home', kind: 'settlement', x: 2, z: 2, name: 'Home', discoveryWeight: 0 },
    ])
    const knowledge = createLocationKnowledge()
    const mapData = createMapData({ projection, discovery, catalog, knowledge })
    expect(mapData.knownLocations({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 })).toEqual([])
  })

  it('drops a known id the catalog can no longer resolve', () => {
    const projection = createMapProjection(rawParams())
    const discovery = createMapDiscovery()
    const catalog = fakeCatalog([])
    const knowledge = createLocationKnowledge([{ id: 'cave:gone', state: 'confirmed', source: 'exploration' }])
    const mapData = createMapData({ projection, discovery, catalog, knowledge })
    expect(mapData.knownLocations({ minX: -500, maxX: 500, minZ: -500, maxZ: 500 })).toEqual([])
  })
})
