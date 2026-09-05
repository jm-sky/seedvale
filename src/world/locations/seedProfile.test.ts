import { describe, expect, it } from 'vitest'
import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import { generateSeedName, sampleStartupTerrainProfile } from './seedProfile'

function params(overrides: Partial<RawSampleParams> = {}): RawSampleParams {
  return {
    seed: 1,
    heightScale: 18,
    waterLevel: 0.45,
    noiseScale: 120,
    detailAmplitude: 0.55,
    hillsScale: 420,
    hillsAmplitude: 0.28,
    hillsFbm: { octaves: 3, persistence: 0.55, lacunarity: 2.0, exponentiation: 1.15 },
    fbm: { octaves: 4, persistence: 0.65, lacunarity: 2.0, exponentiation: 1.35 },
    biome: { noiseScale: 96, fbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 } },
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
        roadHalfWidth: 5, roadHeightStrength: 0.85, roadTintStrength: 0.8, pathHalfWidth: 1.5, pathHeightStrength: 0.2,
        pathTintStrength: 0.4, smoothingWindow: 10, maxNeighborRoads: 3, dockSearchRadius: 140, edgeWobbleAmplitude: 0.15,
        edgeWobbleScale: 0.06, potholeDepth: 0.12, potholeThreshold: 0.72, meanderAmplitude: 2, meanderScale: 0.04,
        surfaceDetailEnabled: true, rutDepth: 0.05, rutOffsetFraction: 0.42, rutWidthFraction: 0.16, microBumpStrength: 0.025, microBumpScale: 0.6,
      },
      village: { coreRadius: 9, houseRadius: 4.5, heightStrength: 0.8, tintStrength: 0.75, regionalHeightStrengthFlat: 0.3, regionalHeightStrengthMountain: 0.15 },
    },
    ...overrides,
  }
}

describe('sampleStartupTerrainProfile (plan world-015 §5)', () => {
  it('is a pure, deterministic function of (params, origin) — same inputs, same output', () => {
    const a = sampleStartupTerrainProfile(params(), 0, 0)
    const b = sampleStartupTerrainProfile(params(), 0, 0)
    expect(a).toEqual(b)
  })

  it('reports fractions in [0, 1] that sum to at most 1', () => {
    const profile = sampleStartupTerrainProfile(params())
    expect(profile.waterFraction).toBeGreaterThanOrEqual(0)
    expect(profile.mountainFraction).toBeGreaterThanOrEqual(0)
    expect(profile.oceanFraction).toBeGreaterThanOrEqual(0)
    expect(profile.waterFraction + profile.mountainFraction + profile.oceanFraction).toBeLessThanOrEqual(1)
    expect(profile.sampledCells).toBeGreaterThan(0)
  })

  it('a different seed can change the profile (sanity check the fixture responds to seed)', () => {
    const a = sampleStartupTerrainProfile(params({ seed: 1 }))
    const b = sampleStartupTerrainProfile(params({ seed: 99999 }))
    expect(a).not.toEqual(b)
  })
})

describe('generateSeedName (plan world-015 §6/§7)', () => {
  it('is deterministic in (seed, profile)', () => {
    const profile = sampleStartupTerrainProfile(params())
    expect(generateSeedName(7, profile)).toBe(generateSeedName(7, profile))
  })

  it('produces a stable fallback name even with no profile at all (lazy backfill, plan §13)', () => {
    expect(generateSeedName(7)).toBe(generateSeedName(7))
    expect(generateSeedName(7).length).toBeGreaterThan(0)
  })

  it('mountain-dominant profiles name differently from water-dominant ones', () => {
    const mountain = generateSeedName(1, { waterFraction: 0, oceanFraction: 0, mountainFraction: 0.9, sampledCells: 81 })
    const water = generateSeedName(1, { waterFraction: 0.9, oceanFraction: 0, mountainFraction: 0, sampledCells: 81 })
    expect(mountain).not.toBe(water)
  })
})
