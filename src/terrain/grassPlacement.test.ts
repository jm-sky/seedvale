import { describe, expect, it } from 'vitest'
import { type ChunkTileParams, computeChunkTile, type RawSampleParams } from './chunkHeightmap'
import { computeChunkGrass, GRASS_SPECIES_ORDER, type GrassChunkData } from './grassPlacement'

/** Defaults aligned with `worldConfig` base terrain (same values as
 *  `chunkHeightmap.test.ts`'s `rawParams`, extended to a full `ChunkTileParams`). */
function tileParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
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
    vegetationSpeciesCount: { tree: 3, bush: 2, cactus: 1, reed: 1, fern: 1 },
    roadSegments: [],
    clearings: [],
    regional: [],
    riverSegments: [],
    ...overrides,
  }
}

/** Sum of a Float32Array — cheap, deterministic checksum for golden assertions
 *  without pinning every element of a several-hundred-float buffer inline. */
function checksum(arr: Float32Array): number {
  let sum = 0
  for (let i = 0; i < arr.length; i++) sum += arr[i]!
  return Math.round(sum * 1e6) / 1e6
}

function bucketSummary(data: GrassChunkData) {
  const summary: Record<string, { count: number, matricesChecksum: number, baseColorsChecksum: number }> = {}
  for (const id of GRASS_SPECIES_ORDER) {
    const bucket = data[id]
    if (!bucket) continue
    summary[id] = {
      count: bucket.count,
      matricesChecksum: checksum(bucket.matrices),
      baseColorsChecksum: checksum(bucket.baseColors),
    }
  }
  return summary
}

// (cx, cz) chosen to land in visibly different terrain given seed 42 + the
// region params above: (0,0) near the world origin (mixed/plains), (24,24)
// well outside the origin (mountain-threshold territory), (-18,6) another
// offset location — "one near water, one mountainous" per plan 086 phase 1.
const CHUNKS: readonly { cx: number, cz: number }[] = [
  { cx: 0, cz: 0 },
  { cx: 24, cz: 24 },
  { cx: -18, cz: 6 },
]

describe('computeChunkGrass', () => {
  it('produces a deterministic, non-trivial golden result per chunk (locks in today\'s output — plan 086 phase 1)', () => {
    for (const { cx, cz } of CHUNKS) {
      const params = tileParams({ cx, cz })
      const tile = computeChunkTile(params)
      const data = computeChunkGrass(
        {
          cx,
          cz,
          chunkSize: params.chunkSize,
          resolution: params.resolution,
          waterLevel: params.waterLevel,
          heightScale: params.heightScale,
          seed: params.seed,
          candidatesPerChunk: 4000,
          region: params.region,
        },
        {
          heights: tile.heights,
          biomes: tile.biomes,
          roadTint: tile.roadTint,
          mountainRidge: tile.mountainRidge,
          moistureRegion: tile.moistureRegion,
        },
      )
      expect(bucketSummary(data)).toMatchSnapshot(`chunk (${cx},${cz})`)
    }
  })

  it('is a pure function of (params, grids) — identical inputs give byte-identical outputs', () => {
    const params = tileParams({ cx: 3, cz: -5 })
    const tile = computeChunkTile(params)
    const grids = {
      heights: tile.heights,
      biomes: tile.biomes,
      roadTint: tile.roadTint,
      mountainRidge: tile.mountainRidge,
      moistureRegion: tile.moistureRegion,
    }
    const computeParams = {
      cx: params.cx,
      cz: params.cz,
      chunkSize: params.chunkSize,
      resolution: params.resolution,
      waterLevel: params.waterLevel,
      heightScale: params.heightScale,
      seed: params.seed,
      candidatesPerChunk: 2000,
      region: params.region,
    }

    const a = computeChunkGrass(computeParams, grids)
    const b = computeChunkGrass(computeParams, grids)

    for (const id of GRASS_SPECIES_ORDER) {
      expect(a[id]?.count).toBe(b[id]?.count)
      if (a[id] && b[id]) {
        expect(Array.from(a[id]!.matrices)).toEqual(Array.from(b[id]!.matrices))
        expect(Array.from(a[id]!.baseColors)).toEqual(Array.from(b[id]!.baseColors))
        expect(Array.from(a[id]!.phases)).toEqual(Array.from(b[id]!.phases))
      }
    }
  })

  it('produces at least one non-empty species bucket for a typical plains chunk', () => {
    const params = tileParams({ cx: 0, cz: 0 })
    const tile = computeChunkTile(params)
    const data = computeChunkGrass(
      {
        cx: 0,
        cz: 0,
        chunkSize: params.chunkSize,
        resolution: params.resolution,
        waterLevel: params.waterLevel,
        heightScale: params.heightScale,
        seed: params.seed,
        candidatesPerChunk: 4000,
        region: params.region,
      },
      {
        heights: tile.heights,
        biomes: tile.biomes,
        roadTint: tile.roadTint,
        mountainRidge: tile.mountainRidge,
        moistureRegion: tile.moistureRegion,
      },
    )
    const totalCount = GRASS_SPECIES_ORDER.reduce((sum, id) => sum + (data[id]?.count ?? 0), 0)
    expect(totalCount).toBeGreaterThan(0)
    // Every bucket's matrices length matches its declared count (16 floats/instance).
    for (const id of GRASS_SPECIES_ORDER) {
      const bucket = data[id]
      if (bucket) expect(bucket.matrices.length).toBe(bucket.count * 16)
    }
  })
})
