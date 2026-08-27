import { describe, expect, it } from 'vitest'
import type { WorldConfig } from './worldConfig'
import { applyStoredTerrain, createBenchmarkWorldConfig } from './worldConfig'

/** Minimal terrain with current roadNetwork defaults — enough for merge tests. */
function terrainWithRoadDefaults(): WorldConfig['terrain'] {
  return {
    chunkSize: 64,
    resolution: 65,
    loadRadius: 4,
    unloadRadius: 6,
    flatShading: true,
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
    grass: { enabled: true, radius: 2, density: 120000 },
    detailNormal: {
      enabled: true,
      strength: 3,
      tilesGrass: 4,
      tilesBare: 12,
    },
  }
}

describe('applyStoredTerrain', () => {
  it('keeps new roadNetwork knobs when stored config has a stale roadNetwork', () => {
    const terrain = terrainWithRoadDefaults()

    applyStoredTerrain(terrain, {
      region: {
        // Pre-068 localStorage / save: only the original knobs.
        roadNetwork: {
          roadHalfWidth: 6,
          roadHeightStrength: 0.9,
          roadTintStrength: 0.7,
          pathHalfWidth: 1.5,
          pathHeightStrength: 0.2,
          pathTintStrength: 0.4,
          smoothingWindow: 10,
          maxNeighborRoads: 3,
          dockSearchRadius: 140,
        },
      } as NonNullable<Parameters<typeof applyStoredTerrain>[1]>['region'],
    })

    const rn = terrain.region.roadNetwork
    expect(rn.roadHalfWidth).toBe(6)
    expect(rn.edgeWobbleAmplitude).toBe(0.15)
    expect(rn.edgeWobbleScale).toBe(0.06)
    expect(rn.potholeDepth).toBe(0.12)
    expect(rn.potholeThreshold).toBe(0.72)
    expect(rn.meanderAmplitude).toBe(2)
    expect(rn.meanderScale).toBe(0.04)
  })
})

describe('createBenchmarkWorldConfig', () => {
  it('builds a config from the fixture alone — same seed always yields the same knobs', () => {
    const fixture = { seed: 42, terrainResolution: 193, loadRadius: 3 }
    const a = createBenchmarkWorldConfig(fixture)
    const b = createBenchmarkWorldConfig(fixture)
    expect(a).toEqual(b)
    expect(a.seed).toBe(42)
    expect(a.terrain.resolution).toBe(193)
    expect(a.terrain.loadRadius).toBe(3)
  })

  it('pins the High quality preset knobs rather than guessing from defaults', () => {
    const config = createBenchmarkWorldConfig({ seed: 42, terrainResolution: 193, loadRadius: 3 })
    expect(config.quality.preset).toBe('High')
    expect(config.postProcessing.pixelRatioCap).toBe(2)
    expect(config.showGui).toBe(false)
  })
})
