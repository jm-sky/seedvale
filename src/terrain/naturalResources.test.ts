import { describe, expect, it } from 'vitest'
import type { RegionParams } from './chunkHeightmap'
import {
  dominantResourceNear,
  type NaturalResource,
  RESOURCE_TYPES,
  resourceAttractionAt,
  type ResourceEnv,
  resourcesNear,
} from './naturalResources'

// Same default values as `config/worldConfig.ts`'s `baseConfig` — copied
// locally (not imported) so this test doesn't depend on config internals,
// same spirit as `villageClearing.test.ts`'s own local `PARAMS` fixture.
const REGION: RegionParams = {
  continentScale: 2200,
  continentFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
  mountainScale: 1800,
  mountainFbm: { octaves: 2, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.2 },
  mountainThreshold: 0.62,
  mountainThresholdWidth: 0.12,
  worleyCellSize: 260,
  ridgeSharpness: 2.2,
  mountainGain: 0.75,
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

const WATER_LEVEL = 0
const HEIGHT_SCALE = 18

/** All-land, all-dry env with constant environment axes — no water anywhere
 *  (so `isNearWater` is always false), letting tests isolate the
 *  continentalness/mountainRidge/moistureRegion inputs without also having to
 *  control spatial water placement. */
function constantEnv(overrides: Partial<Omit<ResourceEnv, 'sampleHeight' | 'waterLevel' | 'heightScale' | 'region'>> & {
  continentalness?: number
  mountainRidge?: number
  moistureRegion?: number
}): ResourceEnv {
  const { continentalness = 0.7, mountainRidge = 0, moistureRegion = 0.5 } = overrides
  return {
    sampleHeight: () => WATER_LEVEL + 10,
    sampleContinentalness: () => continentalness,
    sampleMountainRidge: () => mountainRidge,
    sampleMoistureRegion: () => moistureRegion,
    waterLevel: WATER_LEVEL,
    heightScale: HEIGHT_SCALE,
    region: REGION,
  }
}

describe('resourcesNear / dominantResourceNear', () => {
  it('is deterministic for the same inputs', () => {
    const env = constantEnv({})
    const a = resourcesNear(500, 500, 400, 42, env)
    const b = resourcesNear(500, 500, 400, 42, env)
    expect(a).toEqual(b)
  })

  it('every generated resource has a valid type, richness in [0,1], and lies within the query radius', () => {
    const env = constantEnv({})
    for (let seed = 0; seed < 20; seed++) {
      const found = resourcesNear(0, 0, 600, seed, env)
      for (const r of found) {
        expect(RESOURCE_TYPES).toContain(r.type)
        expect(r.richness).toBeGreaterThanOrEqual(0)
        expect(r.richness).toBeLessThanOrEqual(1)
        expect(Math.hypot(r.x, r.z)).toBeLessThanOrEqual(600)
      }
    }
  })

  it('is sparse — most of a large area is barren, not wall-to-wall deposits', () => {
    const env = constantEnv({})
    const found = resourcesNear(0, 0, 2000, 7, env)
    // Roughly π*(2000/90)^2 ≈ 1550 grid cells fall within the circular
    // radius `resourcesNear` filters to — asserting well under half of that
    // confirms most cells come back barren.
    expect(found.length).toBeLessThan(700)
  })

  it('dominantResourceNear picks the richest of several candidates', () => {
    const env = constantEnv({})
    const found = resourcesNear(0, 0, 1500, 99, env)
    if (found.length === 0) return // environment happened to be barren for this seed — nothing to assert
    const dominant = dominantResourceNear(0, 0, 1500, 99, env)
    expect(dominant).not.toBeNull()
    expect(dominant!.richness).toBe(Math.max(...found.map((r) => r.richness)))
  })

  it('biases iron/gold toward high-mountainRidge terrain over flat terrain', () => {
    const counts = (mountainRidge: number) => {
      const env = constantEnv({ mountainRidge })
      let ironGold = 0
      let total = 0
      for (let seed = 0; seed < 300; seed++) {
        // One cell per seed (small radius keeps this to ~1 grid cell) so each
        // iteration is an independent roll.
        const found = resourcesNear(seed * 900, 0, 40, seed, env)
        total += found.length
        ironGold += found.filter((r) => r.type === 'iron' || r.type === 'gold').length
      }
      return total > 0 ? ironGold / total : 0
    }

    const mountainFraction = counts(0.9)
    const flatFraction = counts(0)
    expect(mountainFraction).toBeGreaterThan(flatFraction)
  })

  it('biases resin/herbs toward high-forest-weight terrain over desert-weight terrain', () => {
    // moistureRegion below `desertThreshold` (0.35) reads as desert, above
    // `swampThreshold` (0.72) as swamp — comfortably between the two is the
    // forest/default remainder (see `biomeRegions.ts::biomeWeightsAt`).
    const forestEnv = constantEnv({ moistureRegion: 0.5 })
    const desertEnv = constantEnv({ moistureRegion: 0.05 })

    const forestFraction = (env: ResourceEnv) => {
      let forestType = 0
      let total = 0
      for (let seed = 0; seed < 300; seed++) {
        const found = resourcesNear(seed * 900, 0, 40, seed, env)
        total += found.length
        forestType += found.filter((r) => r.type === 'resin' || r.type === 'herbs').length
      }
      return total > 0 ? forestType / total : 0
    }

    expect(forestFraction(forestEnv)).toBeGreaterThan(forestFraction(desertEnv))
  })

  it('never places a deposit underwater', () => {
    const env: ResourceEnv = {
      ...constantEnv({}),
      // Everything at x < 0 is underwater, x >= 0 is dry land — any deposit
      // this generates must fall on the dry side.
      sampleHeight: (x) => (x < 0 ? WATER_LEVEL - 5 : WATER_LEVEL + 10),
    }
    for (let seed = 0; seed < 50; seed++) {
      const found = resourcesNear(0, 0, 500, seed, env)
      for (const r of found) expect(r.x).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('resourceAttractionAt', () => {
  const resource: NaturalResource = { id: 'r1', type: 'iron', x: 100, z: 0, radius: 10, richness: 0.8 }

  it('is highest right at the resource and fades with distance', () => {
    const atCenter = resourceAttractionAt(100, 0, [resource])
    const near = resourceAttractionAt(120, 0, [resource])
    const far = resourceAttractionAt(1000, 0, [resource])
    expect(atCenter).toBeGreaterThan(near)
    expect(near).toBeGreaterThan(far)
    expect(far).toBeCloseTo(0, 5)
  })

  it('is 0 with no resources nearby', () => {
    expect(resourceAttractionAt(0, 0, [])).toBe(0)
  })

  it('is clamped to at most 1 even with overlapping rich deposits', () => {
    const many: NaturalResource[] = Array.from({ length: 10 }, () => ({ ...resource }))
    expect(resourceAttractionAt(100, 0, many)).toBeLessThanOrEqual(1)
  })
})
