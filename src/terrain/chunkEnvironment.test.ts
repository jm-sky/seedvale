import { describe, expect, it } from 'vitest'
import type { ChunkTileParams, RoadCorridorSegment } from './chunkHeightmap'
import { createSeededRandom } from '../world/parseSeed'
import { clearCemeteryCaches } from './cemeteryAssignment'
import { clearCemeteryPlacementCaches } from './cemeteryPlacement'
import {
  cemeteryFitsVillageFringe,
  cemeteryFootprintClearsRoads,
  clearVegetationAroundOldTrees,
  computeChunkEnvironment,
  deriveLandmarkId,
  LANDMARK_BIAS_MAX,
  LANDMARK_BIAS_MIN,
  type LandmarkBiasKind,
  landmarkChanceBias,
  OLD_TREE_CLEARANCE_RADIUS,
  resolveCemeteryPlacement,
  resolveClassicLandmarkPlacement,
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

  it('covers new landmark kinds with stable prefixes', () => {
    for (const kind of ['boat', 'shipwreck', 'tower', 'oldTree', 'wagon'] as const) {
      const id = deriveLandmarkId(99, 1, 2, kind, 0)
      expect(id.startsWith(`${kind}:`)).toBe(true)
      expect(id).toBe(deriveLandmarkId(99, 1, 2, kind, 0))
    }
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

describe('landmark variety (world-terrain-027)', () => {
  const CHUNK_SIZE = 64
  const RESOLUTION = 17

  function baseParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
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
      regional: [],
      riverSegments: [],
      cemeterySettlements: [],
      ...overrides,
    }
  }

  it('keeps existing landmark placements stable when new kinds are added', () => {
    const params = baseParams({ seed: 42 })
    const tile = computeChunkTile(params)
    const env = computeChunkEnvironment({ cx: 0, cz: 0 }, tile, params, [])
    const classic = env
      .filter((p) => p.kind === 'monolith' || p.kind === 'stoneCircle' || p.kind === 'smallRuins')
      .map((p) => `${p.kind}:${p.id}:${p.x.toFixed(3)}:${p.z.toFixed(3)}`)
    const again = computeChunkEnvironment({ cx: 0, cz: 0 }, tile, params, [])
      .filter((p) => p.kind === 'monolith' || p.kind === 'stoneCircle' || p.kind === 'smallRuins')
      .map((p) => `${p.kind}:${p.id}:${p.x.toFixed(3)}:${p.z.toFixed(3)}`)
    expect(again).toEqual(classic)
  })

  it('places wagons beside a road corridor, not on the road footprint', () => {
    let found = false
    for (let seed = 0; seed < 400 && !found; seed++) {
      const params = baseParams({
        seed,
        roadSegments: [roadSegment({ halfWidth: 4 })],
      })
      const tile = computeChunkTile(params)
      const wagon = computeChunkEnvironment({ cx: 0, cz: 0 }, tile, params, []).find((p) => p.kind === 'wagon')
      if (!wagon) continue
      found = true
      expect(wagon.id?.startsWith('wagon:')).toBe(true)
      const dist = Math.abs(wagon.z) // road is along X axis at z=0 in roadSegment()
      expect(dist).toBeGreaterThanOrEqual(4 + 1.2 - 0.01)
      expect(dist).toBeLessThanOrEqual(4 + 4.5 + 0.01)
    }
    expect(found).toBe(true)
  })

  it('never places boat or shipwreck far inland above the coastal height band', () => {
    for (const seed of [7, 11, 19, 23, 41, 77, 101]) {
      const params = baseParams({ seed })
      const tile = computeChunkTile(params)
      const env = computeChunkEnvironment({ cx: 0, cz: 0 }, tile, params, [])
      for (const p of env) {
        if (p.kind !== 'boat' && p.kind !== 'shipwreck') continue
        const o = apronOriginWorld(0, 0, CHUNK_SIZE, RESOLUTION)
        const h = sampleApronGridWeighted(
          tile.heights,
          o.apronRes,
          apronGridWeights(o.apronRes, o.x, o.z, o.step, p.x, p.z),
        )
        const c = sampleApronGridWeighted(
          tile.continentalness,
          o.apronRes,
          apronGridWeights(o.apronRes, o.x, o.z, o.step, p.x, p.z),
        )
        expect(c).toBeGreaterThanOrEqual(params.region.oceanThreshold - 0.02)
        expect(c).toBeLessThanOrEqual(params.region.coastThreshold + 0.04)
        expect(h - params.waterLevel).toBeLessThanOrEqual(3)
      }
    }
  })

  it('clearVegetationAroundOldTrees removes nearby trees only', () => {
    const environment = [
      {
        x: 10,
        z: 10,
        kind: 'oldTree' as const,
        scale: 1,
        rotationY: 0,
        variant: 0.5,
        id: 'oldTree:0:0:0:1',
      },
    ]
    const vegetation = [
      { x: 10.5, z: 10.2, kind: 'tree' as const, speciesIndex: 0, scale: 1, rotationY: 0, sizeJitter: 1 },
      { x: 40, z: 40, kind: 'tree' as const, speciesIndex: 0, scale: 1, rotationY: 0, sizeJitter: 1 },
      { x: 11, z: 11, kind: 'bush' as const, speciesIndex: 0, scale: 1, rotationY: 0, sizeJitter: 1 },
    ]
    const cleared = clearVegetationAroundOldTrees(vegetation, environment, OLD_TREE_CLEARANCE_RADIUS)
    expect(cleared.some((v) => v.kind === 'tree' && v.x === 10.5)).toBe(false)
    expect(cleared.some((v) => v.kind === 'tree' && v.x === 40)).toBe(true)
    expect(cleared.some((v) => v.kind === 'bush')).toBe(true)
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
      regional: [{ x: 0, z: 0, radius: 48, targetH: 1, heightStrength: 0.2 }],
      riverSegments: [],
      cemeterySettlements: [],
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

  it('agrees with a full-tile-backed sampler when an assigned settlement is present', () => {
    const cemeterySettlements = [{ id: '0_0', gx: 0, gz: 0, x: 0, z: 0, size: 'MD' as const }]
    let viaFullTile: ReturnType<typeof resolveCemeteryPlacement> = null
    let viaLightweight: ReturnType<typeof resolveCemeteryPlacement> = null
    for (let seed = 0; seed < 120; seed++) {
      clearCemeteryCaches()
      clearCemeteryPlacementCaches()
      const params = tileParams({ seed, cemeterySettlements })
      viaFullTile = resolveCemeteryPlacement({ cx: 0, cz: 0 }, params, referenceSampler(params))
      viaLightweight = resolveCemeteryPlacement(
        { cx: 0, cz: 0 },
        params,
        createLocalTerrainSampler({ cx: 0, cz: 0 }, params),
      )
      if (viaFullTile) break
    }
    expect(viaFullTile).not.toBeNull()
    expect(viaLightweight).toEqual(viaFullTile)
    expect(viaFullTile?.id?.startsWith('cemetery:a:')).toBe(true)
  })

  it('matches computeChunkEnvironment’s own cemetery result exactly (id/x/z/scale/rotation/variant/size)', () => {
    const cemeterySettlements = [{ id: '0_0', gx: 0, gz: 0, x: 0, z: 0, size: 'MD' as const }]
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const params = tileParams({ seed, cemeterySettlements })
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

/** world-028 — shared classic-landmark resolver both `computeChunkEnvironment`
 *  and unloaded `findLandmarkNear` must agree with. */
describe('resolveClassicLandmarkPlacement (plan world-028)', () => {
  const CHUNK_SIZE = 64
  const RESOLUTION = 17
  const CLASSIC_KINDS: readonly LandmarkBiasKind[] = ['monolith', 'stoneCircle', 'smallRuins']

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
      regional: [],
      riverSegments: [],
      cemeterySettlements: [],
      ...overrides,
    }
  }

  function fullTileSampler(params: ChunkTileParams) {
    const tile = computeChunkTile(params)
    const o = apronOriginWorld(params.cx, params.cz, params.chunkSize, params.resolution)
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGridWeighted(grid, o.apronRes, apronGridWeights(o.apronRes, o.x, o.z, o.step, x, z))
    return {
      tile,
      sampler: {
        heightAt: (x: number, z: number) => sample(tile.heights, x, z),
        roadTintAt: (x: number, z: number) => sample(tile.roadTint, x, z),
        mountainRidgeAt: (x: number, z: number) => sample(tile.mountainRidge, x, z),
        moistureRegionAt: (x: number, z: number) => sample(tile.moistureRegion, x, z),
      },
    }
  }

  function placementFields(p: { id?: string, x: number, z: number, scale: number, rotationY: number, variant: number, kind: string } | null) {
    if (!p) return null
    return { id: p.id, x: p.x, z: p.z, scale: p.scale, rotationY: p.rotationY, variant: p.variant, kind: p.kind }
  }

  function scanKind(kind: LandmarkBiasKind): {
    hit: { seed: number, cx: number, cz: number }
    miss: { seed: number, cx: number, cz: number }
  } {
    let hit: { seed: number, cx: number, cz: number } | undefined
    let miss: { seed: number, cx: number, cz: number } | undefined
    for (let seed = 1; seed <= 40 && !(hit && miss); seed++) {
      for (let cx = -10; cx <= 10 && !(hit && miss); cx++) {
        for (let cz = -10; cz <= 10 && !(hit && miss); cz++) {
          const params = tileParams({ seed, cx, cz })
          const placed = resolveClassicLandmarkPlacement(
            kind,
            { cx, cz },
            params,
            createLocalTerrainSampler({ cx, cz }, params),
          )
          if (placed && !hit) hit = { seed, cx, cz }
          if (!placed && !miss) miss = { seed, cx, cz }
        }
      }
    }
    if (!hit) throw new Error(`expected at least one ${kind} hit in the scan`)
    if (!miss) throw new Error(`expected at least one ${kind} miss in the scan`)
    return { hit, miss }
  }

  for (const kind of CLASSIC_KINDS) {
    it(`${kind}: lightweight and full-tile samplers match on a real hit and a real miss`, () => {
      const { hit, miss } = scanKind(kind)

      for (const sample of [hit, miss]) {
        const params = tileParams({ seed: sample.seed, cx: sample.cx, cz: sample.cz })
        const coord = { cx: sample.cx, cz: sample.cz }
        const viaLightweight = resolveClassicLandmarkPlacement(
          kind,
          coord,
          params,
          createLocalTerrainSampler(coord, params),
        )
        const { tile, sampler } = fullTileSampler(params)
        const viaFullTile = resolveClassicLandmarkPlacement(kind, coord, params, sampler)
        const viaEnvironment = computeChunkEnvironment(coord, tile, params, []).find((p) => p.kind === kind) ?? null

        expect(placementFields(viaLightweight)).toEqual(placementFields(viaFullTile))
        expect(placementFields(viaLightweight)).toEqual(placementFields(viaEnvironment))
      }

      const hitParams = tileParams({ seed: hit.seed, cx: hit.cx, cz: hit.cz })
      const hitPlacement = resolveClassicLandmarkPlacement(
        kind,
        { cx: hit.cx, cz: hit.cz },
        hitParams,
        createLocalTerrainSampler({ cx: hit.cx, cz: hit.cz }, hitParams),
      )
      expect(hitPlacement).not.toBeNull()
      expect(hitPlacement?.id?.startsWith(`${kind}:`)).toBe(true)
      expect(hitPlacement?.kind).toBe(kind)

      const missParams = tileParams({ seed: miss.seed, cx: miss.cx, cz: miss.cz })
      expect(
        resolveClassicLandmarkPlacement(
          kind,
          { cx: miss.cx, cz: miss.cz },
          missParams,
          createLocalTerrainSampler({ cx: miss.cx, cz: miss.cz }, missParams),
        ),
      ).toBeNull()
    })
  }

  it('is independent of query order across chunks', () => {
    const a = tileParams({ seed: 11, cx: 2, cz: -4 })
    const b = tileParams({ seed: 11, cx: -3, cz: 5 })
    const first = [
      resolveClassicLandmarkPlacement('monolith', { cx: a.cx, cz: a.cz }, a, createLocalTerrainSampler({ cx: a.cx, cz: a.cz }, a)),
      resolveClassicLandmarkPlacement('stoneCircle', { cx: b.cx, cz: b.cz }, b, createLocalTerrainSampler({ cx: b.cx, cz: b.cz }, b)),
    ]
    const second = [
      resolveClassicLandmarkPlacement('stoneCircle', { cx: b.cx, cz: b.cz }, b, createLocalTerrainSampler({ cx: b.cx, cz: b.cz }, b)),
      resolveClassicLandmarkPlacement('monolith', { cx: a.cx, cz: a.cz }, a, createLocalTerrainSampler({ cx: a.cx, cz: a.cz }, a)),
    ]
    expect(placementFields(first[0]!)).toEqual(placementFields(second[1]!))
    expect(placementFields(first[1]!)).toEqual(placementFields(second[0]!))
  })

  it('does not treat authored ruins as procedural smallRuins', () => {
    const params = tileParams({
      seed: 3,
      authoredExpeditionRuins: {
        id: 'ruins:authored',
        x: 2,
        z: -3,
        rotationY: 0.4,
        variant: 0.2,
        scale: 1.1,
      },
    })
    const small = resolveClassicLandmarkPlacement(
      'smallRuins',
      { cx: 0, cz: 0 },
      params,
      createLocalTerrainSampler({ cx: 0, cz: 0 }, params),
    )
    expect(small?.id).not.toBe('ruins:authored')
    const env = computeChunkEnvironment({ cx: 0, cz: 0 }, computeChunkTile(params), params, [])
    const authored = env.find((p) => p.kind === 'ruins')
    expect(authored?.id).toBe('ruins:authored')
  })
})
