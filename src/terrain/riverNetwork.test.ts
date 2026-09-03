import { describe, expect, it, vi } from 'vitest'
import type { RawSampleParams } from './chunkHeightmap'
import * as chunkHeightmap from './chunkHeightmap'
import {
  computeRiverTile,
  depthFromAccumulation,
  nearestRiverBankDistance,
  nearestRiverBankPoint,
  overlappingRiverTiles,
  RIVER_CELL_STEP,
  RIVER_TILE_SIZE,
  type RiverChain,
  riverChannelSegmentsNear,
  type RiverPoint,
  riverTileCoordOf,
  riverTileCoreRect,
  riverTileKey,
  widthFromAccumulation,
} from './riverNetwork'

/** Defaults aligned with `worldConfig` base terrain (plan 062/181). */
function rawParams(seed: number, overrides: Partial<RawSampleParams> = {}): RawSampleParams {
  return {
    seed,
    heightScale: 18,
    waterLevel: 0.45,
    noiseScale: 105,
    detailAmplitude: 0.65,
    hillsScale: 420,
    hillsAmplitude: 0.34,
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
      mountainThresholdWidth: 0.2,
      worleyCellSize: 400,
      ridgeSharpness: 1.4,
      mountainGain: 0.88,
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

function chainsWithinCore(chains: RiverChain[], rect: ReturnType<typeof riverTileCoreRect>): boolean {
  return chains.every((chain) =>
    chain.points.every((p) => p.x >= rect.minX && p.x < rect.maxX && p.z >= rect.minZ && p.z < rect.maxZ),
  )
}

describe('riverNetwork tile math', () => {
  it('maps world points to a tile grid with no gaps/overlaps', () => {
    expect(riverTileCoordOf(0, 0)).toEqual({ tx: 0, tz: 0 })
    expect(riverTileCoordOf(RIVER_TILE_SIZE - 1, 0)).toEqual({ tx: 0, tz: 0 })
    expect(riverTileCoordOf(RIVER_TILE_SIZE, 0)).toEqual({ tx: 1, tz: 0 })
    expect(riverTileCoordOf(-1, 0)).toEqual({ tx: -1, tz: 0 })
  })

  it('produces a unique key per tile', () => {
    expect(riverTileKey({ tx: 1, tz: -2 })).not.toBe(riverTileKey({ tx: -2, tz: 1 }))
  })

  it('finds every tile overlapping a small chunk rect, at most 4', () => {
    const rect = { minX: -1, maxX: 63, minZ: -1, maxZ: 63 } // straddles all 4 quadrants around origin
    const tiles = overlappingRiverTiles(rect)
    expect(tiles.length).toBeGreaterThanOrEqual(1)
    expect(tiles.length).toBeLessThanOrEqual(4)
  })

  it('finds exactly one tile for a rect fully inside one tile core', () => {
    const tiles = overlappingRiverTiles({ minX: 10, maxX: 20, minZ: 10, maxZ: 20 })
    expect(tiles).toEqual([{ tx: 0, tz: 0 }])
  })
})

describe('widthFromAccumulation', () => {
  it('is zero below the stream threshold and grows with accumulation, bounded', () => {
    expect(widthFromAccumulation(0)).toBe(0)
    const small = widthFromAccumulation(20)
    const big = widthFromAccumulation(1000)
    expect(small).toBeGreaterThan(0)
    expect(big).toBeGreaterThan(small)
    expect(big).toBeLessThanOrEqual(14)
  })
})

describe('computeRiverTile', () => {
  it('is deterministic for the same seed/tile', () => {
    const params = rawParams(42)
    const tile = { tx: 0, tz: 0 }
    const a = computeRiverTile(tile, params)
    const b = computeRiverTile(tile, params)
    expect(a).toEqual(b)
  })

  it('never places a chain point outside the tile core rectangle', () => {
    const params = rawParams(7)
    for (const tile of [{ tx: 0, tz: 0 }, { tx: -3, tz: 5 }, { tx: 12, tz: -8 }]) {
      const chains = computeRiverTile(tile, params)
      expect(chainsWithinCore(chains, riverTileCoreRect(tile))).toBe(true)
    }
  })

  it('every chain point strictly descends in elevation along the chain (D8 invariant)', () => {
    const params = rawParams(1337)
    const tile = { tx: -1, tz: -1 }
    const chains = computeRiverTile(tile, params)
    for (const chain of chains) {
      for (let i = 1; i < chain.points.length; i++) {
        expect(chain.points[i]!.elevation).toBeLessThan(chain.points[i - 1]!.elevation)
      }
    }
  })

  it('produces at least some chains across several seeds (mountain-heavy world defaults)', () => {
    let totalChains = 0
    for (const seed of [1, 42, 999]) {
      const params = rawParams(seed)
      for (const tile of [{ tx: 0, tz: 0 }, { tx: 2, tz: -1 }, { tx: -3, tz: 4 }]) {
        totalChains += computeRiverTile(tile, params).length
      }
    }
    expect(totalChains).toBeGreaterThan(0)
  })
})

describe('river terminal receiver correctness (world-terrain-006)', () => {
  it('every rendered chain either continues into the neighbouring tile (ends near the core edge) or reaches a genuine water receiver (elevation at/below waterLevel)', () => {
    const edgeMargin = RIVER_CELL_STEP * 1.5 // just past one diagonal D8 step
    for (const seed of [1, 5, 7, 42, 999, 1337]) {
      const params = rawParams(seed)
      for (const tile of [
        { tx: 0, tz: 0 },
        { tx: 2, tz: -1 },
        { tx: -3, tz: 4 },
        { tx: 5, tz: 5 },
        { tx: -8, tz: -8 },
      ]) {
        const rect = riverTileCoreRect(tile)
        const chains = computeRiverTile(tile, params)
        for (const chain of chains) {
          const last = chain.points[chain.points.length - 1]!
          const distToEdge = Math.min(
            last.x - rect.minX,
            rect.maxX - last.x,
            last.z - rect.minZ,
            rect.maxZ - last.z,
          )
          if (distToEdge > edgeMargin) {
            expect(last.elevation).toBeLessThanOrEqual(params.waterLevel + 1e-2)
          }
        }
      }
    }
  })

  it('drops a chain that would dead-end at a dry closed depression (sink above waterLevel)', () => {
    const waterLevel = 0.45
    const params = rawParams(3, { waterLevel })
    const tile = { tx: 0, tz: 0 }

    // Build a monotonic ramp descending toward the tile's core center, so
    // every core cell drains toward one dry local minimum well above
    // waterLevel — every classified chain heading there must be dropped.
    const rect = riverTileCoreRect(tile)
    const centerX = (rect.minX + rect.maxX) / 2
    const centerZ = (rect.minZ + rect.maxZ) / 2
    const dryBottom = waterLevel + 3

    const floorAtSpy = vi
      .spyOn(chunkHeightmap, 'sampleFloorAt')
      .mockImplementation((wx: number, wz: number) => dryBottom + Math.hypot(wx - centerX, wz - centerZ) * 0.05)
    const heightAtSpy = vi
      .spyOn(chunkHeightmap, 'sampleHeightAt')
      .mockImplementation((wx: number, wz: number) =>
        Math.max(dryBottom + Math.hypot(wx - centerX, wz - centerZ) * 0.05, waterLevel),
      )

    try {
      // Every classified cell in this synthetic terrain drains radially
      // inward toward the dry center — there is no other receiver, so any
      // chain heading there must be dropped entirely rather than rendered as
      // a river ending on dry land.
      const chains = computeRiverTile(tile, params)
      expect(chains).toHaveLength(0)
    } finally {
      floorAtSpy.mockRestore()
      heightAtSpy.mockRestore()
    }
  })

  it('keeps a chain that dead-ends at a genuine inland water receiver (sink at/below waterLevel)', () => {
    const waterLevel = 0.45
    const params = rawParams(3, { waterLevel })
    const tile = { tx: 0, tz: 0 }

    const rect = riverTileCoreRect(tile)
    const centerX = (rect.minX + rect.maxX) / 2
    const centerZ = (rect.minZ + rect.maxZ) / 2
    const wetBottom = waterLevel - 1

    const floorAtSpy = vi
      .spyOn(chunkHeightmap, 'sampleFloorAt')
      .mockImplementation((wx: number, wz: number) => wetBottom + Math.hypot(wx - centerX, wz - centerZ) * 0.05)
    const heightAtSpy = vi
      .spyOn(chunkHeightmap, 'sampleHeightAt')
      .mockImplementation((wx: number, wz: number) =>
        Math.max(wetBottom + Math.hypot(wx - centerX, wz - centerZ) * 0.05, waterLevel),
      )

    try {
      const chains = computeRiverTile(tile, params)
      const reachesCenter = chains.some((chain) =>
        chain.points.some((p) => Math.hypot(p.x - centerX, p.z - centerZ) < RIVER_CELL_STEP),
      )
      expect(reachesCenter).toBe(true)
    } finally {
      floorAtSpy.mockRestore()
      heightAtSpy.mockRestore()
    }
  })
})

describe('depthFromAccumulation', () => {
  it('is zero below the stream threshold and grows with accumulation, bounded', () => {
    expect(depthFromAccumulation(0)).toBe(0)
    const small = depthFromAccumulation(20)
    const big = depthFromAccumulation(1000)
    expect(small).toBeGreaterThan(0)
    expect(big).toBeGreaterThan(small)
    expect(big).toBeLessThanOrEqual(2.4)
  })
})

function point(x: number, z: number, elevation: number, accumulation: number): RiverPoint {
  return { x, z, elevation, accumulation }
}

describe('riverChannelSegmentsNear (plan 189)', () => {
  it('produces no segments where accumulation never reaches the stream threshold', () => {
    const chain: RiverChain = { points: [point(0, 0, 10, 5), point(8, 0, 9.5, 5)] }
    expect(riverChannelSegmentsNear([chain], 4, 0, 64)).toHaveLength(0)
  })

  it('bed elevation strictly decreases downstream, always below the raw chain elevation', () => {
    const chain: RiverChain = {
      points: [point(0, 0, 100, 50), point(8, 0, 99, 120), point(16, 0, 98, 300)],
    }
    const segments = riverChannelSegmentsNear([chain], 8, 0, 64)
    expect(segments).toHaveLength(2)
    expect(segments[0]!.aBedH).toBeLessThan(chain.points[0]!.elevation)
    expect(segments[0]!.bBedH).toBeLessThan(segments[0]!.aBedH)
    // Consecutive segments share an endpoint — bed height is exactly continuous, no jump.
    expect(segments[1]!.aBedH).toBe(segments[0]!.bBedH)
    expect(segments[1]!.bBedH).toBeLessThan(segments[1]!.aBedH)
  })

  it('width and depth both grow with accumulation, never independently', () => {
    const chain: RiverChain = { points: [point(0, 0, 100, 20), point(8, 0, 99, 1000)] }
    const [seg] = riverChannelSegmentsNear([chain], 4, 0, 64)
    expect(seg!.bHalfWidth).toBeGreaterThan(seg!.aHalfWidth)
    expect(seg!.aBankWidth).toBeGreaterThan(0)
    expect(seg!.bBankWidth).toBeGreaterThanOrEqual(seg!.aBankWidth)
  })

  it('is deterministic for the same chains and chunk position', () => {
    const chain: RiverChain = { points: [point(0, 0, 100, 50), point(8, 0, 99, 120)] }
    const a = riverChannelSegmentsNear([chain], 4, 0, 64)
    const b = riverChannelSegmentsNear([chain], 4, 0, 64)
    expect(a).toEqual(b)
  })

  it('includes a segment whose bank reaches into a chunk even when its points sit just outside it', () => {
    // Wide/deep enough that half-width + bank clearly overshoots a couple world units.
    const chain: RiverChain = { points: [point(-2, 0, 100, 2000), point(-1, 0, 99.9, 2000)] }
    const segments = riverChannelSegmentsNear([chain], 32, 0, 64) // rect [0, 64]
    expect(segments.length).toBeGreaterThan(0)
  })

  it('two chunks straddling the same segment see identical carving data (boundary continuity)', () => {
    const chain: RiverChain = { points: [point(0, 0, 100, 300), point(64, 0, 90, 300)] }
    const left = riverChannelSegmentsNear([chain], 0, 0, 64) // rect [-32, 32]
    const right = riverChannelSegmentsNear([chain], 64, 0, 64) // rect [32, 96]
    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
    expect(left[0]).toEqual(right[0])
  })
})

describe('nearestRiverBankDistance (plan ui-input-006)', () => {
  it('is null when no segments are nearby', () => {
    expect(nearestRiverBankDistance([], 0, 0)).toBeNull()
  })

  it('reads negative on the centerline, ~0 at the bank, positive on dry land beyond it', () => {
    const chain: RiverChain = { points: [point(0, 0, 100, 300), point(64, 0, 90, 300)] }
    const segments = riverChannelSegmentsNear([chain], 32, 0, 64)
    const halfWidth = widthFromAccumulation(300) / 2

    expect(nearestRiverBankDistance(segments, 32, 0)).toBeCloseTo(-halfWidth, 5)
    expect(nearestRiverBankDistance(segments, 32, halfWidth)).toBeCloseTo(0, 5)
    expect(nearestRiverBankDistance(segments, 32, halfWidth + 5)).toBeCloseTo(5, 5)
  })

  it('picks the nearest of several segments, same as `chunkHeightmap.ts`\'s carving pass would', () => {
    const near: RiverChain = { points: [point(0, 0, 100, 300), point(64, 0, 90, 300)] }
    const far: RiverChain = { points: [point(0, 50, 100, 300), point(64, 50, 90, 300)] }
    const segments = [
      ...riverChannelSegmentsNear([near], 32, 0, 64),
      ...riverChannelSegmentsNear([far], 32, 50, 64),
    ]
    const halfWidth = widthFromAccumulation(300) / 2
    expect(nearestRiverBankDistance(segments, 32, 5)).toBeCloseTo(5 - halfWidth, 5)
  })
})

describe('nearestRiverBankPoint (plan ui-input-006 fishing-interaction fix)', () => {
  it('is null when no segments are nearby', () => {
    expect(nearestRiverBankPoint([], 0, 0)).toBeNull()
  })

  it('returns a real bank point on the query side, distinct from the query position', () => {
    const chain: RiverChain = { points: [point(0, 0, 100, 300), point(64, 0, 90, 300)] }
    const segments = riverChannelSegmentsNear([chain], 32, 5, 64)
    const halfWidth = widthFromAccumulation(300) / 2

    const bank = nearestRiverBankPoint(segments, 32, 5)
    expect(bank).not.toBeNull()
    // Centerline runs along z=0 here, so the bank point on the +z side sits
    // at (32, halfWidth) — on the same side as the query point, not at the
    // query position itself (unless already exactly on the bank).
    expect(bank!.x).toBeCloseTo(32, 5)
    expect(bank!.z).toBeCloseTo(halfWidth, 5)
    expect(bank).not.toEqual({ x: 32, z: 5 })
  })
})
