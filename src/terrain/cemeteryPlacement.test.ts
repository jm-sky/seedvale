import { describe, expect, it, vi } from 'vitest'
import type { CemeteryTerrainSampler } from './chunkEnvironment'
import type { ChunkTileParams } from './chunkHeightmap'
import {
  abandonedCemeteryMaxOffsetFromCenter,
  chunkPassesAbandonedCemeteryRoll,
  clearCemeteryPlacementCaches,
  resolveAbandonedCemeteryAfterRoll,
  resolveAbandonedCemeteryForChunk,
  resolveCemeteriesForChunk,
} from './cemeteryPlacement'
import { createLocalTerrainSampler } from './chunkHeightmap'

const CHUNK_SIZE = 64

function tileParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
  return {
    cx: 0,
    cz: 0,
    chunkSize: CHUNK_SIZE,
    resolution: 17,
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

function throwingSampler(): CemeteryTerrainSampler {
  return {
    heightAt: () => {
      throw new Error('terrain sampled')
    },
    roadTintAt: () => {
      throw new Error('terrain sampled')
    },
  }
}

function seedWhereRoll(cx: number, cz: number, passes: boolean): number {
  for (let seed = 1; seed < 20_000; seed++) {
    if (chunkPassesAbandonedCemeteryRoll(seed, cx, cz) === passes) return seed
  }
  throw new Error(`no seed where roll ${passes ? 'passes' : 'fails'} for ${cx},${cz}`)
}

describe('chunkPassesAbandonedCemeteryRoll (plan world-022)', () => {
  it('matches the eligibility gate used by resolveAbandonedCemeteryForChunk', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      for (let cz = -4; cz <= 4; cz++) {
        for (let cx = -4; cx <= 4; cx++) {
          const eligible = chunkPassesAbandonedCemeteryRoll(seed, cx, cz)
          if (!eligible) {
            expect(resolveAbandonedCemeteryForChunk(
              { cx, cz },
              tileParams({ seed, cx, cz }),
              throwingSampler(),
            )).toBeNull()
          } else {
            expect(() => resolveAbandonedCemeteryForChunk(
              { cx, cz },
              tileParams({ seed, cx, cz }),
              throwingSampler(),
            )).toThrow('terrain sampled')
          }
        }
      }
    }
  })

  it('does not materialize params/sampler when the roll fails', () => {
    const seed = seedWhereRoll(0, 0, false)
    const materialize = vi.fn(() => {
      throw new Error('materialized')
    })
    expect(resolveAbandonedCemeteryAfterRoll({ cx: 0, cz: 0 }, seed, materialize)).toBeNull()
    expect(materialize).not.toHaveBeenCalled()
  })

  it('materializes and delegates to the canonical resolver when the roll passes', () => {
    const seed = seedWhereRoll(3, -2, true)
    const params = tileParams({ seed, cx: 3, cz: -2 })
    const terrain = createLocalTerrainSampler({ cx: 3, cz: -2 }, params)
    const materialize = vi.fn(() => ({ params, terrain }))
    const viaGate = resolveAbandonedCemeteryAfterRoll({ cx: 3, cz: -2 }, seed, materialize)
    const viaResolver = resolveAbandonedCemeteryForChunk({ cx: 3, cz: -2 }, params, terrain)
    expect(materialize).toHaveBeenCalledOnce()
    expect(viaGate).toEqual(viaResolver)
  })
})

describe('abandoned cemetery streamed vs resolver parity (plan world-022)', () => {
  it('agrees on absence, presence, id and position for wilderness chunks', () => {
    let sawAbsence = false
    let sawPresence = false
    const coords = [
      { cx: 0, cz: 0 },
      { cx: 5, cz: -3 },
      { cx: 12, cz: 8 },
    ]
    for (let seed = 1; seed <= 80; seed++) {
      for (const coord of coords) {
        clearCemeteryPlacementCaches()
        const params = tileParams({ seed, cx: coord.cx, cz: coord.cz, cemeterySettlements: [] })
        const terrain = createLocalTerrainSampler(coord, params)
        const viaAbandoned = resolveAbandonedCemeteryForChunk(coord, params, terrain)
        const viaChunk = resolveCemeteriesForChunk(coord, params, terrain)
          .find((p) => p.kind === 'cemetery' && p.id?.startsWith('cemetery:w:')) ?? null
        expect(viaChunk).toEqual(viaAbandoned)
        if (viaAbandoned) {
          sawPresence = true
          expect(viaAbandoned.id).toBe(viaChunk?.id)
          expect(viaAbandoned.x).toBe(viaChunk?.x)
          expect(viaAbandoned.z).toBe(viaChunk?.z)
        } else {
          sawAbsence = true
        }
      }
    }
    expect(sawAbsence).toBe(true)
    expect(sawPresence).toBe(true)
  })
})

describe('abandonedCemeteryMaxOffsetFromCenter', () => {
  it('is the SM-margin inset from the chunk half-size', () => {
    expect(abandonedCemeteryMaxOffsetFromCenter(64)).toBe(32 - 6)
  })
})
