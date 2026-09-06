import { describe, expect, it } from 'vitest'
import type { RawSampleParams } from './chunkHeightmap'
import {
  computeRiverTile,
  overlappingRiverTiles,
  riverChannelSegmentsNear,
} from './riverNetwork'
import { createRiverQuery } from './riverQuery'

/** Defaults aligned with `worldConfig` base terrain, same fixture shape as
 *  `riverNetwork.test.ts`. */
function rawParams(seed: number): RawSampleParams {
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
  }
}

describe('createRiverQuery', () => {
  const params = rawParams(1922931019)
  const X = 120
  const Z = -80
  const SIZE = 128

  it('returns exactly what the canonical tile + segment filter produce', () => {
    const expected = riverChannelSegmentsNear(
      overlappingRiverTiles({
        minX: X - SIZE / 2,
        maxX: X + SIZE / 2,
        minZ: Z - SIZE / 2,
        maxZ: Z + SIZE / 2,
      }).flatMap((tile) => computeRiverTile(tile, params)),
      X,
      Z,
      SIZE,
    )
    expect(createRiverQuery(params).segmentsNear(X, Z, SIZE)).toEqual(expected)
  })

  it('is deterministic across queries and across query instances', () => {
    const a = createRiverQuery(params)
    const b = createRiverQuery(params)
    expect(a.segmentsNear(X, Z, SIZE)).toEqual(a.segmentsNear(X, Z, SIZE))
    expect(a.segmentsNear(X, Z, SIZE)).toEqual(b.segmentsNear(X, Z, SIZE))
  })
})
