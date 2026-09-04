import { describe, expect, it, vi } from 'vitest'
import type { WorldConfig } from '../config/worldConfig'
import type { SettlementCell, SettlementDef } from '../settlement/settlementGenerator'
import type { SettlementsManager } from '../settlement/SettlementsManager'
import type { ForestBiome } from '../terrain/biomeRegions'
import type { RiverPoint } from '../terrain/riverNetwork'
import type { WorldContext } from '../world/worldContext'
import { SETTLEMENT_GRID_STEP, worldToCell } from '../settlement/settlementGenerator'
import { computeRiverTile, RIVER_TILE_SIZE, riverTileCoordOf } from '../terrain/riverNetwork'
import { deepForestNearest, mountainNearest, oceanNearest, riverNearest, riversNearby, villageNearest } from './locationQueries'

vi.mock('../terrain/riverNetwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../terrain/riverNetwork')>()
  return { ...actual, computeRiverTile: vi.fn() }
})

function fakeWorldContext(overrides: {
  sampleContinentalness?: (x: number, z: number) => number
  sampleMountainRidge?: (x: number, z: number) => number
  sampleForestBiome?: (x: number, z: number) => ForestBiome
  oceanThreshold?: number
}): WorldContext {
  return {
    sampleContinentalness: overrides.sampleContinentalness ?? (() => 1),
    sampleMountainRidge: overrides.sampleMountainRidge ?? (() => 0),
    sampleForestBiome: overrides.sampleForestBiome ?? (() => 'open'),
    region: { oceanThreshold: overrides.oceanThreshold ?? 0.32 },
  } as unknown as WorldContext
}

describe('mountainNearest', () => {
  it('finds a point past a fixed x threshold that clears both the land gate and the ridge threshold', () => {
    const ctx = fakeWorldContext({
      sampleContinentalness: () => 0.9, // always dry land
      sampleMountainRidge: (x) => (x > 50 ? 0.5 : 0),
    })
    const result = mountainNearest({ x: 0, z: 0 }, ctx)
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('mountain')
    expect(result!.position.x).toBeGreaterThan(50)
    expect(result!.distance).toBeCloseTo(Math.hypot(result!.position.x, result!.position.z))
  })

  it('never returns an ocean point even if the ridge value would otherwise qualify', () => {
    const ctx = fakeWorldContext({
      sampleContinentalness: () => 0.1, // always ocean
      sampleMountainRidge: () => 0.9,
    })
    expect(mountainNearest({ x: 0, z: 0 }, ctx)).toBeNull()
  })

  it('returns null when nothing in the search budget qualifies', () => {
    const ctx = fakeWorldContext({ sampleContinentalness: () => 0.9, sampleMountainRidge: () => 0 })
    expect(mountainNearest({ x: 0, z: 0 }, ctx)).toBeNull()
  })
})

describe('deepForestNearest', () => {
  it('finds a point past a fixed x threshold classified as deepForest', () => {
    const ctx = fakeWorldContext({ sampleForestBiome: (x) => (x > 50 ? 'deepForest' : 'open') })
    const result = deepForestNearest({ x: 0, z: 0 }, ctx)
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('deepForest')
    expect(result!.position.x).toBeGreaterThan(50)
  })

  it('returns null when no point is classified deepForest', () => {
    const ctx = fakeWorldContext({ sampleForestBiome: () => 'forest' })
    expect(deepForestNearest({ x: 0, z: 0 }, ctx)).toBeNull()
  })
})

describe('oceanNearest', () => {
  it('finds a point past a fixed x threshold below the ocean continentalness threshold', () => {
    const ctx = fakeWorldContext({ sampleContinentalness: (x) => (x > 50 ? 0.1 : 0.9), oceanThreshold: 0.32 })
    const result = oceanNearest({ x: 0, z: 0 }, ctx)
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('ocean')
    expect(result!.position.x).toBeGreaterThan(50)
  })

  it('returns null when nothing reads as ocean', () => {
    const ctx = fakeWorldContext({ sampleContinentalness: () => 0.9 })
    expect(oceanNearest({ x: 0, z: 0 }, ctx)).toBeNull()
  })
})

const FAKE_CONFIG = {
  seed: 1,
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

// FAKE_CONFIG.terrain.waterLevel is 0.45; the debug land margin is 0.5, so
// anything at or below elevation 0.95 reads as "too close to water" and
// anything above qualifies as land.
const SUBMERGED_ELEVATION = 0.5
const LAND_ELEVATION = 5

function riverPoint(x: number, z: number, elevation: number, accumulation = 100): RiverPoint {
  return { x, z, elevation, accumulation }
}

describe('riverNearest', () => {
  it('returns the nearest chain point in the first tile ring that has a river', () => {
    const origin = { x: 0, z: 0 }
    const originTile = riverTileCoordOf(origin.x, origin.z)
    const targetTile = { tx: originTile.tx + 1, tz: originTile.tz }
    const chainPoint = riverPoint(origin.x + RIVER_TILE_SIZE, origin.z + 5, LAND_ELEVATION)
    vi.mocked(computeRiverTile).mockImplementation((tile) =>
      tile.tx === targetTile.tx && tile.tz === targetTile.tz ? [{ points: [chainPoint] }] : [])

    const result = riverNearest(origin, FAKE_CONFIG)
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('river')
    expect(result?.position).toEqual({ x: chainPoint.x, z: chainPoint.z })
    expect(result?.distance).toBeCloseTo(Math.hypot(chainPoint.x - origin.x, chainPoint.z - origin.z))
  })

  it('returns null when no tile within the search radius has a river', () => {
    vi.mocked(computeRiverTile).mockReturnValue([])
    expect(riverNearest({ x: 0, z: 0 }, FAKE_CONFIG)).toBeNull()
  })

  it('picks the land point over a submerged/terminal point in the same chain', () => {
    const origin = { x: 0, z: 0 }
    const originTile = riverTileCoordOf(origin.x, origin.z)
    const targetTile = { tx: originTile.tx + 1, tz: originTile.tz }
    const submerged = riverPoint(origin.x + RIVER_TILE_SIZE, origin.z, SUBMERGED_ELEVATION)
    const land = riverPoint(origin.x + RIVER_TILE_SIZE, origin.z + 20, LAND_ELEVATION)
    vi.mocked(computeRiverTile).mockImplementation((tile) =>
      tile.tx === targetTile.tx && tile.tz === targetTile.tz ? [{ points: [submerged, land] }] : [])

    const result = riverNearest(origin, FAKE_CONFIG)
    expect(result?.position).toEqual({ x: land.x, z: land.z })
  })

  it('continues the bounded tile-ring search when a non-empty tile has only disqualified points', () => {
    const origin = { x: 0, z: 0 }
    const originTile = riverTileCoordOf(origin.x, origin.z)
    const badTile = { tx: originTile.tx + 1, tz: originTile.tz }
    const goodTile = { tx: originTile.tx + 2, tz: originTile.tz }
    const land = riverPoint(origin.x + RIVER_TILE_SIZE * 2, origin.z, LAND_ELEVATION)
    vi.mocked(computeRiverTile).mockImplementation((tile) => {
      if (tile.tx === badTile.tx && tile.tz === badTile.tz) {
        return [{ points: [riverPoint(origin.x + RIVER_TILE_SIZE, origin.z, SUBMERGED_ELEVATION)] }]
      }
      if (tile.tx === goodTile.tx && tile.tz === goodTile.tz) return [{ points: [land] }]
      return []
    })

    const result = riverNearest(origin, FAKE_CONFIG)
    expect(result?.position).toEqual({ x: land.x, z: land.z })
  })

  it('prefers a chain-interior land point over a nearer chain terminal', () => {
    const origin = { x: 0, z: 0 }
    const originTile = riverTileCoordOf(origin.x, origin.z)
    const targetTile = { tx: originTile.tx + 1, tz: originTile.tz }
    const nearTerminal = riverPoint(origin.x + RIVER_TILE_SIZE, origin.z, LAND_ELEVATION)
    const fartherInterior = riverPoint(origin.x + RIVER_TILE_SIZE, origin.z + 100, LAND_ELEVATION)
    const farTerminal = riverPoint(origin.x + RIVER_TILE_SIZE, origin.z + 200, LAND_ELEVATION)
    vi.mocked(computeRiverTile).mockImplementation((tile) =>
      tile.tx === targetTile.tx && tile.tz === targetTile.tz
        ? [{ points: [nearTerminal, fartherInterior, farTerminal] }]
        : [])

    const result = riverNearest(origin, FAKE_CONFIG)
    expect(result?.position).toEqual({ x: fartherInterior.x, z: fartherInterior.z })
  })

  it('returns null when no chain in the entire bounded search has a qualifying point', () => {
    vi.mocked(computeRiverTile).mockReturnValue([{ points: [riverPoint(50, 50, SUBMERGED_ELEVATION)] }])
    expect(riverNearest({ x: 0, z: 0 }, FAKE_CONFIG)).toBeNull()
  })

  it('is deterministic across repeated calls with the same data', () => {
    const origin = { x: 0, z: 0 }
    const originTile = riverTileCoordOf(origin.x, origin.z)
    const targetTile = { tx: originTile.tx + 1, tz: originTile.tz }
    const land = riverPoint(origin.x + RIVER_TILE_SIZE, origin.z, LAND_ELEVATION)
    vi.mocked(computeRiverTile).mockImplementation((tile) =>
      tile.tx === targetTile.tx && tile.tz === targetTile.tz ? [{ points: [land] }] : [])

    const first = riverNearest(origin, FAKE_CONFIG)
    const second = riverNearest(origin, FAKE_CONFIG)
    expect(first).toEqual(second)
  })
})

describe('riversNearby', () => {
  it('merges chain fragments of the same river split across a tile boundary into one candidate', () => {
    const origin = { x: 0, z: 0 }
    const originTile = riverTileCoordOf(origin.x, origin.z)
    const tileA = { tx: originTile.tx + 1, tz: originTile.tz }
    const tileB = { tx: originTile.tx + 2, tz: originTile.tz }
    // tileA's chain ends right where tileB's chain begins (same accumulation,
    // a few world units apart) — a continuation of one physical river, not
    // two different ones.
    const tail = riverPoint(RIVER_TILE_SIZE, 0, LAND_ELEVATION, 100)
    const head = riverPoint(RIVER_TILE_SIZE + 8, 4, LAND_ELEVATION, 102)
    const continuedLand = riverPoint(RIVER_TILE_SIZE * 2, 0, LAND_ELEVATION, 105)
    vi.mocked(computeRiverTile).mockImplementation((tile) => {
      if (tile.tx === tileA.tx && tile.tz === tileA.tz) return [{ points: [riverPoint(0, 0, LAND_ELEVATION, 90), tail] }]
      if (tile.tx === tileB.tx && tile.tz === tileB.tz) return [{ points: [head, continuedLand] }]
      return []
    })

    const results = riversNearby(origin, FAKE_CONFIG)
    expect(results).toHaveLength(1)
  })

  it('reports separate, non-continuous rivers as separate candidates', () => {
    const origin = { x: 0, z: 0 }
    const originTile = riverTileCoordOf(origin.x, origin.z)
    const tileA = { tx: originTile.tx + 1, tz: originTile.tz }
    const tileB = { tx: originTile.tx - 1, tz: originTile.tz }
    vi.mocked(computeRiverTile).mockImplementation((tile) => {
      if (tile.tx === tileA.tx && tile.tz === tileA.tz) return [{ points: [riverPoint(RIVER_TILE_SIZE, 0, LAND_ELEVATION, 20)] }]
      if (tile.tx === tileB.tx && tile.tz === tileB.tz) return [{ points: [riverPoint(-RIVER_TILE_SIZE, 0, LAND_ELEVATION, 500)] }]
      return []
    })

    const results = riversNearby(origin, FAKE_CONFIG)
    expect(results).toHaveLength(2)
  })

  it('returns [] when nothing in the bounded search qualifies', () => {
    vi.mocked(computeRiverTile).mockReturnValue([])
    expect(riversNearby({ x: 0, z: 0 }, FAKE_CONFIG)).toEqual([])
  })
})

describe('villageNearest', () => {
  it('returns the village at the nearest cell with a def', () => {
    const origin = { x: 0, z: 0 }
    const originCell = worldToCell(origin.x, origin.z)
    const targetCell: SettlementCell = { gx: originCell.gx + 1, gz: originCell.gz }
    const def = {
      id: `${targetCell.gx}_${targetCell.gz}`,
      x: targetCell.gx * SETTLEMENT_GRID_STEP,
      z: targetCell.gz * SETTLEMENT_GRID_STEP,
      name: 'Test Village',
      size: 'MD',
    } as SettlementDef
    const manager = {
      peekDef: (cell: SettlementCell) => (cell.gx === targetCell.gx && cell.gz === targetCell.gz ? def : null),
    } as unknown as SettlementsManager

    const result = villageNearest(origin, manager)
    expect(result).toEqual({
      kind: 'village',
      position: { x: def.x, z: def.z },
      distance: Math.hypot(def.x - origin.x, def.z - origin.z),
      id: def.id,
      name: def.name,
      size: def.size,
    })
  })

  it('returns null when no cell within the search radius has a def', () => {
    const manager = { peekDef: () => null } as unknown as SettlementsManager
    expect(villageNearest({ x: 0, z: 0 }, manager)).toBeNull()
  })
})
