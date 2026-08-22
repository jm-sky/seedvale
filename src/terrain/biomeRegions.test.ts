import { describe, expect, it } from 'vitest'
import type { RegionParams } from './chunkHeightmap'
import { biomeWeightsAt, forestBiomeAt, forestDensityAt } from './biomeRegions'

// Same default values as `config/worldConfig.ts`'s `baseConfig` — copied
// locally so this test doesn't depend on config internals.
const REGION: RegionParams = {
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
}

const LAND = 0.7
const LOWLAND = 0.12
const NO_RIDGE = 0

describe('forestDensityAt', () => {
  it('stays within [0, 1]', () => {
    const samples: Array<[number, number, number, number]> = [
      [0.2, 0.1, 0.7, 0],
      [0.5, 0.15, 0.7, 0],
      [0.55, 0.2, 0.8, 0.1],
      [0.8, 0.05, 0.6, 0],
      [0.5, 0.6, 0.7, 0.4],
      [0.5, -0.1, 0.7, 0],
      [0.5, 0.15, 0.2, 0],
    ]
    for (const [m, a, c, r] of samples) {
      const d = forestDensityAt(m, a, c, r, REGION)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for identical inputs', () => {
    const a = forestDensityAt(0.55, LOWLAND, LAND, NO_RIDGE, REGION)
    const b = forestDensityAt(0.55, LOWLAND, LAND, NO_RIDGE, REGION)
    expect(a).toBe(b)
  })

  it('is zero / near-zero over water and ocean', () => {
    expect(forestDensityAt(0.55, 0, LAND, NO_RIDGE, REGION)).toBe(0)
    expect(forestDensityAt(0.55, -0.05, LAND, NO_RIDGE, REGION)).toBe(0)
    expect(forestDensityAt(0.55, LOWLAND, 0.1, NO_RIDGE, REGION)).toBe(0)
  })

  it('is high in humid temperate lowland forest conditions', () => {
    const dense = forestDensityAt(0.55, LOWLAND, LAND, NO_RIDGE, REGION)
    expect(dense).toBeGreaterThan(0.7)
  })

  it('is lower on open temperate moisture than in canopy-core moisture', () => {
    const open = forestDensityAt(0.40, LOWLAND, LAND, NO_RIDGE, REGION)
    const edge = forestDensityAt(0.48, LOWLAND, LAND, NO_RIDGE, REGION)
    const dense = forestDensityAt(0.55, LOWLAND, LAND, NO_RIDGE, REGION)
    expect(open).toBeLessThan(edge)
    expect(edge).toBeLessThan(dense)
    // Open temperate still allows weak habitat / isolated trees.
    expect(open).toBeGreaterThan(0)
    expect(open).toBeLessThan(0.35)
  })

  it('is reduced on high ridges and highlands', () => {
    const valley = forestDensityAt(0.55, LOWLAND, LAND, NO_RIDGE, REGION)
    const ridge = forestDensityAt(0.55, LOWLAND, LAND, 0.35, REGION)
    const highland = forestDensityAt(0.55, 0.5, LAND, NO_RIDGE, REGION)
    expect(ridge).toBeLessThan(valley * 0.5)
    expect(highland).toBeLessThan(valley * 0.5)
  })

  it('responds continuously around thresholds (no binary cliff)', () => {
    const steps: number[] = []
    for (let i = 0; i <= 20; i++) {
      const moisture = 0.35 + (i / 20) * 0.35
      steps.push(forestDensityAt(moisture, LOWLAND, LAND, NO_RIDGE, REGION))
    }
    for (let i = 1; i < steps.length; i++) {
      expect(Math.abs(steps[i]! - steps[i - 1]!)).toBeLessThan(0.25)
    }
  })

  it('stays near zero in desert / swamp-gated conditions', () => {
    expect(forestDensityAt(0.2, LOWLAND, LAND, NO_RIDGE, REGION)).toBeLessThan(0.05)
    // High swamp moisture at lowland altitude — forest remainder collapses.
    const swampy = forestDensityAt(0.85, 0.05, LAND, NO_RIDGE, REGION)
    expect(biomeWeightsAt(0.85, 0.05, REGION).swamp).toBeGreaterThan(0.5)
    expect(swampy).toBeLessThan(0.15)
  })
})

describe('forestBiomeAt', () => {
  it('classifies open below the open threshold', () => {
    expect(forestBiomeAt(0)).toBe('open')
    expect(forestBiomeAt(0.1)).toBe('open')
    expect(forestBiomeAt(0.34)).toBe('open')
  })

  it('classifies forest in the mid band', () => {
    expect(forestBiomeAt(0.35)).toBe('forest')
    expect(forestBiomeAt(0.5)).toBe('forest')
    expect(forestBiomeAt(0.71)).toBe('forest')
  })

  it('classifies deepForest only at high density', () => {
    expect(forestBiomeAt(0.72)).toBe('deepForest')
    expect(forestBiomeAt(0.9)).toBe('deepForest')
    expect(forestBiomeAt(1)).toBe('deepForest')
  })

  it('is deterministic for identical input', () => {
    expect(forestBiomeAt(0.55)).toBe(forestBiomeAt(0.55))
  })

  it('clamps out-of-range input instead of throwing', () => {
    expect(forestBiomeAt(-0.4)).toBe('open')
    expect(forestBiomeAt(1.4)).toBe('deepForest')
  })

  it('reaches deepForest only in humid temperate lowland conditions actually produced by forestDensityAt', () => {
    const dense = forestDensityAt(0.55, LOWLAND, LAND, NO_RIDGE, REGION)
    expect(forestBiomeAt(dense)).toBe('deepForest')
  })

  it('water/desert/swamp/high-ridge conditions never classify as deepForest', () => {
    expect(forestBiomeAt(forestDensityAt(0.55, 0, LAND, NO_RIDGE, REGION))).not.toBe('deepForest')
    expect(forestBiomeAt(forestDensityAt(0.2, LOWLAND, LAND, NO_RIDGE, REGION))).not.toBe('deepForest')
    expect(forestBiomeAt(forestDensityAt(0.85, 0.05, LAND, NO_RIDGE, REGION))).not.toBe('deepForest')
    expect(forestBiomeAt(forestDensityAt(0.55, LOWLAND, LAND, 0.35, REGION))).not.toBe('deepForest')
  })

  it('has no discontinuity around its own thresholds beyond forestDensityAt\'s own continuity', () => {
    // forestBiomeAt itself is a hard classifier (by design, for a stable
    // world query), but the underlying forestDensityAt it classifies never
    // jumps — walking through both thresholds should pass through 'forest'
    // rather than skip it.
    const seen = new Set<string>()
    for (let i = 0; i <= 40; i++) {
      const moisture = 0.35 + (i / 40) * 0.35
      const fd = forestDensityAt(moisture, LOWLAND, LAND, NO_RIDGE, REGION)
      seen.add(forestBiomeAt(fd))
    }
    expect(seen.has('open')).toBe(true)
    expect(seen.has('forest')).toBe(true)
    expect(seen.has('deepForest')).toBe(true)
  })
})
