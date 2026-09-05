import { describe, expect, it, vi } from 'vitest'
import type { RawSampleParams } from './chunkHeightmap'
import * as chunkHeightmap from './chunkHeightmap'
import {
  canonicalWaterHeight,
  computeRiverTile,
  depthFromAccumulation,
  exposedBankFromFlow,
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

  it('drops a chain that would dead-end at an unrepairable dry closed depression (sink above waterLevel, no escape anywhere in the window)', () => {
    const waterLevel = 0.45
    const params = rawParams(3, { waterLevel })
    const tile = { tx: 0, tz: 0 }

    // Build a monotonic ramp descending toward the tile's core center, so
    // every core cell drains toward one dry local minimum well above
    // waterLevel, with no lower cell anywhere else in the whole analysis
    // window — world-terrain-011's bounded repair search can find no escape
    // (there isn't one) and correctly leaves it unresolved, so every
    // classified chain heading there must still be dropped.
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

  it('preserves a chain through a meaningful shallow depression by routing it through the repaired outlet', () => {
    const waterLevel = 0.45
    const params = rawParams(3, { waterLevel })
    const tile = { tx: 0, tz: 0 }

    // A shallow radial depression centered on the tile core: a low rim (well
    // under the repair's cut-depth budget) with a genuinely lower escape just
    // beyond it. Unlike the unrepairable case above, this should now survive
    // as a normal chain routed through the conditioned outlet rather than
    // being dropped outright (world-terrain-011).
    const rect = riverTileCoreRect(tile)
    const centerX = (rect.minX + rect.maxX) / 2
    const centerZ = (rect.minZ + rect.maxZ) / 2
    const pitBottom = waterLevel + 3
    const rimRadius = 40
    const riseSlope = 0.01
    const outerFallSlope = 1.0

    const floorAt = (wx: number, wz: number): number => {
      const d = Math.hypot(wx - centerX, wz - centerZ)
      if (d <= rimRadius) return pitBottom + d * riseSlope
      const rimTop = pitBottom + rimRadius * riseSlope
      return rimTop - (d - rimRadius) * outerFallSlope
    }

    const floorAtSpy = vi.spyOn(chunkHeightmap, 'sampleFloorAt').mockImplementation(floorAt)
    const heightAtSpy = vi
      .spyOn(chunkHeightmap, 'sampleHeightAt')
      .mockImplementation((wx: number, wz: number) => Math.max(floorAt(wx, wz), waterLevel))

    try {
      const chains = computeRiverTile(tile, params)
      const reachesCenter = chains.some((chain) =>
        chain.points.some((p) => Math.hypot(p.x - centerX, p.z - centerZ) < RIVER_CELL_STEP * 2),
      )
      expect(reachesCenter).toBe(true)
      // The repaired outlet is a normal continuation, not a dry dead end —
      // every chain must still satisfy the same terminal-receiver contract
      // as world-terrain-006 (core-edge continuation or genuine water).
      for (const chain of chains) {
        const last = chain.points[chain.points.length - 1]!
        const distToEdge = Math.min(last.x - rect.minX, rect.maxX - last.x, last.z - rect.minZ, rect.maxZ - last.z)
        if (distToEdge > RIVER_CELL_STEP * 1.5) {
          expect(last.elevation).toBeLessThanOrEqual(waterLevel + 1e-2)
        }
      }
    } finally {
      floorAtSpy.mockRestore()
      heightAtSpy.mockRestore()
    }
  })

  it('leaves a meaningful but too-deep/large depression unresolved rather than forcing a dry chain through it', () => {
    const waterLevel = 0.45
    const params = rawParams(3, { waterLevel })
    const tile = { tx: 0, tz: 0 }

    const rect = riverTileCoreRect(tile)
    const centerX = (rect.minX + rect.maxX) / 2
    const centerZ = (rect.minZ + rect.maxZ) / 2
    const pitBottom = waterLevel + 3
    const rimRadius = 40
    const riseSlope = 0.2 // rim rises ~8m above the pit — well past the repair's cut-depth budget
    const outerFallSlope = 1.0

    const floorAt = (wx: number, wz: number): number => {
      const d = Math.hypot(wx - centerX, wz - centerZ)
      if (d <= rimRadius) return pitBottom + d * riseSlope
      const rimTop = pitBottom + rimRadius * riseSlope
      return rimTop - (d - rimRadius) * outerFallSlope
    }

    const floorAtSpy = vi.spyOn(chunkHeightmap, 'sampleFloorAt').mockImplementation(floorAt)
    const heightAtSpy = vi
      .spyOn(chunkHeightmap, 'sampleHeightAt')
      .mockImplementation((wx: number, wz: number) => Math.max(floorAt(wx, wz), waterLevel))

    try {
      const chains = computeRiverTile(tile, params)
      const reachesCenter = chains.some((chain) =>
        chain.points.some((p) => Math.hypot(p.x - centerX, p.z - centerZ) < RIVER_CELL_STEP * 2),
      )
      expect(reachesCenter).toBe(false)
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

describe('inland river coverage regression (world-terrain-011)', () => {
  it('keeps meaningful inland river coverage across representative seeds/tiles, not just coastal ribbons', () => {
    const waterLevel = 0.45
    let inlandPointCount = 0
    for (const seed of [1, 5, 7, 42, 999, 1337]) {
      const params = rawParams(seed, { waterLevel })
      for (const tile of [
        { tx: 0, tz: 0 },
        { tx: 2, tz: -1 },
        { tx: -3, tz: 4 },
        { tx: 5, tz: 5 },
        { tx: -8, tz: -8 },
      ]) {
        const chains = computeRiverTile(tile, params)
        for (const chain of chains) {
          for (const p of chain.points) {
            if (p.elevation > waterLevel + 1) inlandPointCount++
          }
        }
      }
    }
    // A future terminal-policy regression that silently drops most inland
    // drainage (leaving only ocean/coastal ribbons) should fail this long
    // before anyone notices missing rivers in play. The bound is generous
    // and aggregate on purpose — it guards against wholesale loss, not exact
    // river placement, which legitimately shifts with harmless terrain tuning.
    expect(inlandPointCount).toBeGreaterThan(200)
  })
})

describe('depthFromAccumulation', () => {
  it('is zero below the stream threshold and grows with accumulation, bounded', () => {
    expect(depthFromAccumulation(0)).toBe(0)
    const small = depthFromAccumulation(20)
    const big = depthFromAccumulation(1000)
    expect(small).toBeGreaterThan(0)
    expect(big).toBeGreaterThan(small)
    expect(big).toBeLessThanOrEqual(2.4 + 1e-9)
  })
})

describe('canonicalWaterHeight (plan world-terrain-010)', () => {
  it('always sits below the point\'s own natural elevation, even for a barely-classified stream', () => {
    const barelyStream = point(0, 0, 10, 16) // just past DEFAULT_RIVER_THRESHOLDS.stream (15)
    expect(canonicalWaterHeight(barelyStream)).toBeLessThan(barelyStream.elevation)
    const bigRiver = point(0, 0, 10, 5000)
    expect(canonicalWaterHeight(bigRiver)).toBeLessThan(bigRiver.elevation)
  })

  it('is deterministic and grows the exposed-bank gap with flow strength', () => {
    const p = point(0, 0, 10, 300)
    expect(canonicalWaterHeight(p)).toBe(canonicalWaterHeight(p))
    const small = 10 - canonicalWaterHeight(point(0, 0, 10, 16))
    const big = 10 - canonicalWaterHeight(point(0, 0, 10, 5000))
    expect(big).toBeGreaterThan(small)
    expect(exposedBankFromFlow(0)).toBeCloseTo(0.15, 5)
    expect(exposedBankFromFlow(1)).toBeCloseTo(0.8, 5)
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

  it('width and channel margin both grow with accumulation, never independently', () => {
    const chain: RiverChain = { points: [point(0, 0, 100, 20), point(8, 0, 99, 1000)] }
    const [seg] = riverChannelSegmentsNear([chain], 4, 0, 64)
    expect(seg!.bWaterHalfWidth).toBeGreaterThan(seg!.aWaterHalfWidth)
    expect(seg!.aChannelHalfWidth).toBeGreaterThan(seg!.aWaterHalfWidth)
    expect(seg!.bChannelHalfWidth).toBeGreaterThan(seg!.bWaterHalfWidth)
  })

  it('canonical cross-section invariants hold: bedY < waterY < bankTopY, waterWidth < channelWidth', () => {
    for (const [elevation, accumulation] of [[100, 20], [100, 300], [50, 2000]] as const) {
      const chain: RiverChain = { points: [point(0, 0, elevation, accumulation), point(8, 0, elevation - 1, accumulation)] }
      const [seg] = riverChannelSegmentsNear([chain], 4, 0, 64)
      if (!seg) continue // below the stream threshold — no channel at all
      expect(seg.aBedH).toBeLessThan(seg.aWaterH)
      expect(seg.aWaterH).toBeLessThan(chain.points[0]!.elevation)
      expect(seg.bBedH).toBeLessThan(seg.bWaterH)
      expect(seg.bWaterH).toBeLessThan(chain.points[1]!.elevation)
      expect(seg.aWaterHalfWidth).toBeLessThan(seg.aChannelHalfWidth)
      expect(seg.bWaterHalfWidth).toBeLessThan(seg.bChannelHalfWidth)
    }
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
