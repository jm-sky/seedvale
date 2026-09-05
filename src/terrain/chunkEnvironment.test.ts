import { describe, expect, it } from 'vitest'
import type { ChunkTileParams, RoadCorridorSegment } from './chunkHeightmap'
import { createSeededRandom } from '../world/parseSeed'
import {
  cemeteryFitsVillageFringe,
  cemeteryFootprintClearsRoads,
  computeChunkEnvironment,
  deriveLandmarkId,
  LANDMARK_BIAS_MAX,
  LANDMARK_BIAS_MIN,
  landmarkChanceBias,
  resolveCemeteryPlacement,
  rollCemeterySize,
} from './chunkEnvironment'
import {
  apronGridWeights,
  apronOriginWorld,
  computeChunkTile,
  createLocalTerrainSampler,
  sampleApronGridWeighted,
} from './chunkHeightmap'

function roadSegment(overrides: Partial<RoadCorridorSegment> = {}): RoadCorridorSegment {
  return {
    ax: -50,
    az: 0,
    ah: 0,
    bx: 50,
    bz: 0,
    bh: 0,
    halfWidth: 5,
    heightStrength: 0.85,
    tintStrength: 0.8,
    ...overrides,
  }
}

const PLAINS = {
  mountainRidge: 0,
  altitude01: 0.2,
  slope: 0.2,
  desert: 0,
  swamp: 0,
  forest: 1,
}

describe('landmarkChanceBias', () => {
  it('stays within [min, max]', () => {
    const samples = [
      PLAINS,
      { mountainRidge: 1, altitude01: 0.8, slope: 0.1, desert: 0, swamp: 0, forest: 0.2 },
      { mountainRidge: 0.9, altitude01: 0.05, slope: 0.5, desert: 1, swamp: 0, forest: 0 },
      { mountainRidge: 0, altitude01: 0.08, slope: 0.1, desert: 0, swamp: 1, forest: 0 },
    ] as const
    for (const kind of ['monolith', 'stoneCircle', 'smallRuins'] as const) {
      for (const sample of samples) {
        const bias = landmarkChanceBias(kind, sample)
        expect(bias).toBeGreaterThanOrEqual(LANDMARK_BIAS_MIN)
        expect(bias).toBeLessThanOrEqual(LANDMARK_BIAS_MAX)
      }
    }
  })

  it('is deterministic', () => {
    expect(landmarkChanceBias('monolith', PLAINS)).toBe(landmarkChanceBias('monolith', PLAINS))
  })

  it('boosts monoliths on ridges vs plains', () => {
    const ridge = landmarkChanceBias('monolith', { ...PLAINS, mountainRidge: 0.9, altitude01: 0.5 })
    const plains = landmarkChanceBias('monolith', PLAINS)
    expect(ridge).toBeGreaterThan(plains)
  })

  it('boosts ruins on forested mid-altitude vs desert ridge', () => {
    const habitable = landmarkChanceBias('smallRuins', PLAINS)
    const harsh = landmarkChanceBias('smallRuins', {
      mountainRidge: 0.9,
      altitude01: 0.6,
      slope: 0.2,
      desert: 0.8,
      swamp: 0,
      forest: 0.1,
    })
    expect(habitable).toBeGreaterThan(harsh)
  })
})

describe('cemeteryFitsVillageFringe', () => {
  const village = { x: 0, z: 0, radius: 40 }
  const plaza = { x: 0, z: 0, radius: 10 }

  it('rejects when no regional disk is present', () => {
    expect(cemeteryFitsVillageFringe(30, 0, [], [])).toBe(false)
  })

  it('rejects plaza / house clearings', () => {
    expect(cemeteryFitsVillageFringe(0, 0, [village], [plaza])).toBe(false)
    expect(cemeteryFitsVillageFringe(8, 0, [village], [plaza])).toBe(false)
  })

  it('accepts the village fringe outside clearings', () => {
    expect(cemeteryFitsVillageFringe(30, 0, [village], [plaza])).toBe(true)
  })

  it('rejects inside the inner band and past the outer band', () => {
    expect(cemeteryFitsVillageFringe(10, 0, [village], [])).toBe(false)
    expect(cemeteryFitsVillageFringe(50, 0, [village], [])).toBe(false)
  })
})

describe('cemeteryFootprintClearsRoads (world-terrain-006)', () => {
  it('accepts a cemetery with no nearby road', () => {
    expect(cemeteryFootprintClearsRoads(0, 0, 'SM', 1, [])).toBe(true)
  })

  it('rejects a cemetery whose center sits on the road, for every size', () => {
    const segments = [roadSegment()]
    for (const size of ['SM', 'MD', 'LG'] as const) {
      expect(cemeteryFootprintClearsRoads(0, 3, size, 1, segments)).toBe(false)
    }
  })

  it('rejects an LG cemetery whose grave-grid footprint reaches a road even though its center point clears it', () => {
    const segments = [roadSegment({ halfWidth: 3 })]
    // Far enough that the road-tint center-point check alone would pass —
    // an LG cemetery's wider grid still reaches this road.
    const y = 12
    expect(cemeteryFootprintClearsRoads(0, y, 'LG', 1, segments)).toBe(false)
  })

  it('accepts a cemetery whose footprint clears the road with the safety margin', () => {
    const segments = [roadSegment({ halfWidth: 3 })]
    expect(cemeteryFootprintClearsRoads(0, 40, 'LG', 1, segments)).toBe(true)
  })

  it('scales the rejected footprint with `scale`', () => {
    const segments = [roadSegment({ halfWidth: 3 })]
    const y = 15
    expect(cemeteryFootprintClearsRoads(0, y, 'SM', 1, segments)).toBe(true)
    expect(cemeteryFootprintClearsRoads(0, y, 'SM', 3, segments)).toBe(false)
  })
})

describe('deriveLandmarkId', () => {
  it('is deterministic for identical (seed, chunk, kind, ordinal)', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).toBe(deriveLandmarkId(123, 4, -7, 'monolith', 0))
  })

  it('differs across chunk coordinates', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 5, -7, 'monolith', 0))
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 4, -6, 'monolith', 0))
  })

  it('differs across landmark kind at the same chunk', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 4, -7, 'cemetery', 0))
  })

  it('differs across ordinal for the same kind/chunk (future multi-roll support)', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(123, 4, -7, 'monolith', 1))
  })

  it('differs across world seed for the same chunk/kind', () => {
    expect(deriveLandmarkId(123, 4, -7, 'monolith', 0)).not.toBe(deriveLandmarkId(456, 4, -7, 'monolith', 0))
  })
})

describe('rollCemeterySize', () => {
  it('is deterministic for identical seeded random streams', () => {
    const rollFrom = (seed: number) => rollCemeterySize(createSeededRandom(seed))
    expect(rollFrom(42)).toBe(rollFrom(42))
  })

  it('only ever returns SM/MD/LG and covers all three across many seeds', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 500; seed++) {
      const size = rollCemeterySize(createSeededRandom(seed))
      expect(['SM', 'MD', 'LG']).toContain(size)
      seen.add(size)
    }
    expect(seen).toEqual(new Set(['LG', 'MD', 'SM']))
  })
})

/** world-014 — `resolveCemeteryPlacement` is the shared resolver both
 *  `computeChunkEnvironment` (full generation) and `ChunkManager`'s unloaded
 *  lightweight lookup must agree with, for the same `(coord, params)`. */
describe('resolveCemeteryPlacement (plan world-014)', () => {
  const CHUNK_SIZE = 64
  const RESOLUTION = 17

  function tileParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
    return {
      cx: 0,
      cz: 0,
      chunkSize: CHUNK_SIZE,
      resolution: RESOLUTION,
      seed: 1,
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
      isHomeChunk: false,
      vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
      roadSegments: [],
      clearings: [],
      // A wide village-fringe disk centered on the chunk so a meaningful
      // fraction of cemetery candidate rolls land in the accepted band —
      // makes the "found" branch of the parity check exercised, not just
      // "both agree it's null".
      regional: [{ x: 0, z: 0, radius: 30, targetH: 1, heightStrength: 0.2 }],
      riverSegments: [],
      ...overrides,
    }
  }

  /** Reference terrain view against a fully materialized tile — same
   *  bilinear math `computeChunkEnvironment`'s own `sample()` closure uses. */
  function referenceSampler(params: ChunkTileParams) {
    const tile = computeChunkTile(params)
    const o = apronOriginWorld(params.cx, params.cz, params.chunkSize, params.resolution)
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGridWeighted(grid, o.apronRes, apronGridWeights(o.apronRes, o.x, o.z, o.step, x, z))
    return {
      heightAt: (x: number, z: number) => sample(tile.heights, x, z),
      roadTintAt: (x: number, z: number) => sample(tile.roadTint, x, z),
    }
  }

  it('agrees with a full-tile-backed sampler across many seeds, including both acceptance and rejection', () => {
    let foundCount = 0
    let nullCount = 0
    for (let seed = 0; seed < 200; seed++) {
      const params = tileParams({ seed })
      const viaFullTile = resolveCemeteryPlacement({ cx: 0, cz: 0 }, params, referenceSampler(params))
      const viaLightweight = resolveCemeteryPlacement(
        { cx: 0, cz: 0 },
        params,
        createLocalTerrainSampler({ cx: 0, cz: 0 }, params),
      )
      expect(viaLightweight).toEqual(viaFullTile)
      if (viaFullTile) foundCount++
      else nullCount++
    }
    // Sanity: the seed sweep must actually exercise both outcomes, or the
    // equality check above would trivially pass on null/null every time.
    expect(foundCount).toBeGreaterThan(0)
    expect(nullCount).toBeGreaterThan(0)
  })

  it('matches computeChunkEnvironment’s own cemetery result exactly (id/x/z/scale/rotation/variant/size)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const params = tileParams({ seed })
      const tile = computeChunkTile(params)
      const o = apronOriginWorld(params.cx, params.cz, params.chunkSize, params.resolution)
      const sample = (grid: Float32Array, x: number, z: number) =>
        sampleApronGridWeighted(grid, o.apronRes, apronGridWeights(o.apronRes, o.x, o.z, o.step, x, z))
      const viaResolver = resolveCemeteryPlacement({ cx: 0, cz: 0 }, params, {
        heightAt: (x, z) => sample(tile.heights, x, z),
        roadTintAt: (x, z) => sample(tile.roadTint, x, z),
      })

      const viaFullGeneration = computeChunkEnvironment({ cx: 0, cz: 0 }, tile, params, [])
        .find((p) => p.kind === 'cemetery') ?? null

      expect(viaResolver).toEqual(viaFullGeneration)
    }
  })
})
