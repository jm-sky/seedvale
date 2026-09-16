import { describe, expect, it } from 'vitest'
import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import { DARK_FOREST_TREASURE_LOCATION_ID } from './darkForestTreasureSite'
import {
  LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID,
  resolveLostTreasureEstateSearchArea,
} from './lostTreasureEstateSearchArea'

function rawParams(): RawSampleParams {
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
        rutWidth: 0.35,
        rutNoiseScale: 0.2,
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
  } as unknown as RawSampleParams
}

describe('lost treasure estate search area', () => {
  it('reconstructs the same bounded area for the same seed', () => {
    const input = {
      seed: 17,
      homeX: 0,
      homeZ: 0,
      sampleParams: rawParams(),
      avoid: { x: 400, z: -300 },
    }
    const a = resolveLostTreasureEstateSearchArea(input)
    const b = resolveLostTreasureEstateSearchArea(input)
    expect(a).toEqual(b)
    expect(a.locationId).toBe(LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID)
    expect(a.locationId).not.toBe(DARK_FOREST_TREASURE_LOCATION_ID)
    expect(a.radius).toBeGreaterThan(50)
    expect(Math.hypot(a.x - 400, a.z + 300)).toBeGreaterThan(80)
  })
})
