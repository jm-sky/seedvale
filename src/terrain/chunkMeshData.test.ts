import { describe, expect, it } from 'vitest'
import type { RegionParams } from './chunkHeightmap'
import {
  type ChunkMeshDataParams,
  type ChunkMeshTileGrids,
  computeChunkMeshData,
} from './chunkMeshData'

/** Same region fixture shape as `chunkHeightmap.test.ts`'s `rawParams()` —
 *  only the shape matters here (color/biome weighting math is exercised by
 *  `biomeColors.test.ts`/`biomeRegions.test.ts` already), so values are
 *  otherwise arbitrary-but-plausible. */
function region(): RegionParams {
  return {
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
  }
}

const RESOLUTION = 5
const CHUNK_SIZE = 20
const APRON_RES = RESOLUTION + 2
const STEP = CHUNK_SIZE / (RESOLUTION - 1)
const APRON_ORIGIN = -CHUNK_SIZE / 2 - STEP

function flatTile(height: number): ChunkMeshTileGrids {
  const n = APRON_RES * APRON_RES
  return {
    floorHeights: new Float32Array(n).fill(height),
    biomes: new Float32Array(n).fill(0.5),
    continentalness: new Float32Array(n).fill(0.8),
    mountainRidge: new Float32Array(n).fill(0),
    moistureRegion: new Float32Array(n).fill(0.5),
    roadTint: new Float32Array(n).fill(0),
  }
}

function baseParams(overrides: Partial<ChunkMeshDataParams> = {}): ChunkMeshDataParams {
  return {
    tile: flatTile(5),
    resolution: RESOLUTION,
    chunkSize: CHUNK_SIZE,
    chunkOriginX: 100,
    chunkOriginZ: -40,
    waterLevel: 0,
    heightScale: 18,
    region: region(),
    seed: 42,
    scorches: [],
    ...overrides,
  }
}

describe('computeChunkMeshData', () => {
  it('returns core-grid-sized arrays', () => {
    const data = computeChunkMeshData(baseParams())
    const count = RESOLUTION * RESOLUTION
    expect(data.positionY.length).toBe(count)
    expect(data.normal.length).toBe(count * 3)
    expect(data.color.length).toBe(count * 3)
    expect(data.bareGround.length).toBe(count)
  })

  it('is deterministic — identical inputs produce byte-identical output', () => {
    const params = baseParams()
    const a = computeChunkMeshData(params)
    const b = computeChunkMeshData(params)
    expect(Array.from(a.positionY)).toEqual(Array.from(b.positionY))
    expect(Array.from(a.normal)).toEqual(Array.from(b.normal))
    expect(Array.from(a.color)).toEqual(Array.from(b.color))
    expect(Array.from(a.bareGround)).toEqual(Array.from(b.bareGround))
  })

  it('flat terrain produces straight-up normals and constant Y', () => {
    const data = computeChunkMeshData(baseParams({ tile: flatTile(5) }))
    for (let i = 0; i < RESOLUTION * RESOLUTION; i++) {
      expect(data.positionY[i]).toBeCloseTo(5, 5)
      expect(data.normal[i * 3]).toBeCloseTo(0, 5)
      expect(data.normal[i * 3 + 1]).toBeCloseTo(1, 5)
      expect(data.normal[i * 3 + 2]).toBeCloseTo(0, 5)
    }
  })

  it('a linear world-space slope in X produces the analytically correct normal', () => {
    // h(x) = k * x is exact for a central-difference derivative, so the
    // computed normal should match the closed-form slope normal exactly
    // (up to floating point), not just "point roughly sideways".
    const k = 0.5
    const n = APRON_RES * APRON_RES
    const floorHeights = new Float32Array(n)
    for (let iz = 0; iz < APRON_RES; iz++) {
      for (let ix = 0; ix < APRON_RES; ix++) {
        const x = APRON_ORIGIN + ix * STEP
        floorHeights[iz * APRON_RES + ix] = k * x
      }
    }
    const tile: ChunkMeshTileGrids = { ...flatTile(0), floorHeights }
    const data = computeChunkMeshData(baseParams({ tile }))

    const nLen = Math.hypot(k, 1, 0)
    const expectedNx = -k / nLen
    const expectedNy = 1 / nLen
    for (let i = 0; i < RESOLUTION * RESOLUTION; i++) {
      expect(data.normal[i * 3]).toBeCloseTo(expectedNx, 5)
      expect(data.normal[i * 3 + 1]).toBeCloseTo(expectedNy, 5)
      expect(data.normal[i * 3 + 2]).toBeCloseTo(0, 5)
    }
  })

  it('a scorch patch covering the whole chunk darkens every vertex toward charcoal', () => {
    const unscorched = computeChunkMeshData(baseParams({ scorches: [] }))
    const scorched = computeChunkMeshData(
      baseParams({ scorches: [{ x: 100, z: -40, radius: 1000 }] }),
    )
    // SCORCH_CHARCOAL is much darker than any land terrain color this fixture
    // can produce, so every channel should strictly decrease.
    for (let i = 0; i < RESOLUTION * RESOLUTION * 3; i++) {
      expect(scorched.color[i]).toBeLessThan(unscorched.color[i]!)
    }
    // And bareGround should saturate toward 1 (scorch counts as bare ground)
    // — the patch radius is huge relative to the chunk, but `scorchFalloffAt`
    // is a smoothstep, so vertices aren't exactly 1, just very close to it.
    for (let i = 0; i < RESOLUTION * RESOLUTION; i++) {
      expect(scorched.bareGround[i]).toBeGreaterThan(0.99)
    }
  })

  it('color and bareGround stay within valid render ranges', () => {
    const data = computeChunkMeshData(baseParams())
    for (let i = 0; i < RESOLUTION * RESOLUTION * 3; i++) {
      expect(data.color[i]).toBeGreaterThanOrEqual(0)
      expect(data.color[i]).toBeLessThanOrEqual(1)
    }
    for (let i = 0; i < RESOLUTION * RESOLUTION; i++) {
      expect(data.bareGround[i]).toBeGreaterThanOrEqual(0)
      expect(data.bareGround[i]).toBeLessThanOrEqual(1)
    }
  })
})
