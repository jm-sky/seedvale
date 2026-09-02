import { describe, expect, it } from 'vitest'
import { type ChunkTileData, type ChunkTileParams, type RegionParams } from './chunkHeightmap'
import { computeChunkItems } from './chunkItems'

const REGION: RegionParams = {
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
}

function filled(size: number, value: number): Float32Array {
  return new Float32Array(size * size).fill(value)
}

function dryLandTile(apronRes: number): ChunkTileData {
  return {
    heights: filled(apronRes, 8),
    floorHeights: filled(apronRes, 8),
    biomes: filled(apronRes, 0.5),
    bodyScale: filled(apronRes, 0),
    continentalness: filled(apronRes, 0.8),
    mountainRidge: filled(apronRes, 0),
    moistureRegion: filled(apronRes, 0.5),
    roadTint: filled(apronRes, 0),
  }
}

function params(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
  return {
    seed: 42,
    heightScale: 18,
    waterLevel: 0,
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
    region: REGION,
    cx: 0,
    cz: 0,
    chunkSize: 64,
    resolution: 17,
    isHomeChunk: false,
    vegetationSpeciesCount: { tree: 9, bush: 5, cactus: 2, reed: 1, fern: 1 },
    roadSegments: [],
    clearings: [],
    regional: [],
    riverSegments: [],
    ...overrides,
  }
}

describe('computeChunkItems — coin pool (issue 035)', () => {
  const tile = dryLandTile(19)

  it('never places coins on the home chunk', () => {
    const items = computeChunkItems({ cx: 0, cz: 0 }, tile, params({ isHomeChunk: true }), [])
    expect(items.filter((item) => item.kind === 'coin')).toHaveLength(0)
  })

  it('uses a c-prefix id that cannot collide with shell/stone or flora ids', () => {
    const coins: string[] = []
    for (let i = 0; i < 80; i++) {
      const coord = { cx: i, cz: -i }
      const items = computeChunkItems(coord, tile, params({ cx: coord.cx, cz: coord.cz, seed: 7 + i }), [])
      for (const item of items) {
        if (item.kind !== 'coin') continue
        expect(item.id).toBe(`${coord.cx}:${coord.cz}:c0`)
        coins.push(item.id)
      }
    }
    expect(coins.length).toBeGreaterThan(0)
    expect(coins.every((id) => id.includes(':c'))).toBe(true)
  })

  it('is deterministic for the same seed and coord', () => {
    const coord = { cx: 3, cz: 5 }
    const p = params({ cx: 3, cz: 5, seed: 99 })
    expect(computeChunkItems(coord, tile, p, [])).toEqual(computeChunkItems(coord, tile, p, []))
  })
})
