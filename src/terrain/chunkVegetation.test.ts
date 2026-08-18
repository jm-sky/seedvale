import { describe, expect, it } from 'vitest'
import { type ChunkTileParams, computeChunkTile, type RawSampleParams, type RegionParams } from './chunkHeightmap'
import { computeChunkVegetation } from './chunkVegetation'

/** Same base terrain as `grassPlacement.test.ts`'s `tileParams` — `region`
 *  thresholds are overridden per test to force a specific biome so fern
 *  gating can be asserted without depending on exact FBM noise output. */
function tileParams(
  overrides: Partial<Omit<ChunkTileParams, 'region'>> & { region?: Partial<RegionParams> } = {},
): ChunkTileParams {
  const raw: RawSampleParams = {
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
  }
  return {
    ...raw,
    cx: 0,
    cz: 0,
    chunkSize: 64,
    resolution: 65,
    isHomeChunk: false,
    vegetationSpeciesCount: { tree: 9, bush: 5, cactus: 2, reed: 1, fern: 1 },
    roadSegments: [],
    clearings: [],
    regional: [],
    ...overrides,
    region: { ...raw.region, ...overrides.region },
  }
}

/** Aggregates fern placement counts across several chunk coords/seeds so the
 *  assertion doesn't depend on one seed's exact RNG draws — only on whether
 *  the forced biome ever admits a fern. */
function fernCountAcross(params: ChunkTileParams, chunkCount: number): number {
  let total = 0
  for (let i = 0; i < chunkCount; i++) {
    const coord = { cx: i, cz: -i }
    const p = { ...params, cx: coord.cx, cz: coord.cz, seed: params.seed + i }
    const tile = computeChunkTile(p)
    const vegetation = computeChunkVegetation(coord, tile, p)
    total += vegetation.filter((v) => v.kind === 'fern').length
  }
  return total
}

describe('computeChunkVegetation — fern (plan 140)', () => {
  it('never spawns ferns on forced-desert terrain', () => {
    const params = tileParams({
      region: { desertThreshold: 5, desertThresholdWidth: 0.1, swampThreshold: 5, swampThresholdWidth: 0.1 },
    })
    expect(fernCountAcross(params, 12)).toBe(0)
  })

  it('spawns ferns on forced-swamp/wet-forest terrain', () => {
    const params = tileParams({
      region: { desertThreshold: -1, desertThresholdWidth: 0.1, swampThreshold: -0.5, swampThresholdWidth: 0.1 },
    })
    expect(fernCountAcross(params, 12)).toBeGreaterThan(0)
  })
})
