import { describe, expect, it, vi } from 'vitest'
import type { CemeterySettlementRef } from './cemeteryAssignment'
import type { CemeteryTerrainSampler } from './chunkEnvironment'
import type { ChunkTileParams } from './chunkHeightmap'
import { clearCemeteryCaches } from './cemeteryAssignment'
import { dedicatedCemeteryTopology, makeSettlementRefPeek, resolveCemeteryTopologyForSettlement } from './cemeteryAssignment'
import {
  abandonedCemeteryMaxOffsetFromCenter,
  chunkPassesAbandonedCemeteryRoll,
  clearCemeteryPlacementCaches,
  isSharedAssignmentSplit,
  resolveAbandonedCemeteryAfterRoll,
  resolveAbandonedCemeteryForChunk,
  resolveCemeteriesForChunk,
  type ResolvedCemeteryPlacement,
  resolvePlacementForTopology,
} from './cemeteryPlacement'
import { worldToChunk } from './chunkGrid'
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

describe('assignment-driven cemetery placement (world-terrain-016)', () => {
  const a: CemeterySettlementRef = { id: '0_0', gx: 0, gz: 0, x: 0, z: 0, size: 'SM' }
  const b: CemeterySettlementRef = { id: '1_0', gx: 1, gz: 0, x: 280, z: 0, size: 'SM' }
  const pair = [a, b]

  it('places a shared SM cemetery at the same id/position regardless of calling chunk', () => {
    let found: ResolvedCemeteryPlacement | null = null
    for (let seed = 1; seed <= 240; seed++) {
      clearCemeteryCaches()
      clearCemeteryPlacementCaches()
      const topology = resolveCemeteryTopologyForSettlement('0_0', makeSettlementRefPeek(pair))!
      expect(topology.intent).toBe('shared')
      const fromA = resolvePlacementForTopology(topology, tileParams({ seed, cx: 0, cz: 0, cemeterySettlements: pair }))
      clearCemeteryPlacementCaches()
      const fromB = resolvePlacementForTopology(
        topology,
        tileParams({ seed, cx: 4, cz: 0, cemeterySettlements: pair }),
      )
      if (!fromA || !fromB) continue
      expect(fromA.id).toBe(fromB.id)
      expect(fromA.x).toBe(fromB.x)
      expect(fromA.z).toBe(fromB.z)
      expect(fromA.servedSettlementIds).toEqual(['0_0', '1_0'])
      found = fromA
      break
    }
    expect(found).not.toBeNull()
  })

  it('emits a shared cemetery from only the owner chunk', () => {
    let seedUsed = 0
    let placed: ResolvedCemeteryPlacement | null = null
    for (let seed = 1; seed <= 240; seed++) {
      clearCemeteryCaches()
      clearCemeteryPlacementCaches()
      const topology = resolveCemeteryTopologyForSettlement('0_0', makeSettlementRefPeek(pair))!
      placed = resolvePlacementForTopology(topology, tileParams({ seed, cx: 0, cz: 0, cemeterySettlements: pair }))
      if (placed) {
        seedUsed = seed
        break
      }
    }
    expect(placed).not.toBeNull()
    const owner = worldToChunk(placed!.x, placed!.z, CHUNK_SIZE)
    clearCemeteryPlacementCaches()
    const ownerParams = tileParams({ seed: seedUsed, cx: owner.cx, cz: owner.cz, cemeterySettlements: pair })
    const farCoord = { cx: owner.cx + 3, cz: owner.cz }
    const farParams = tileParams({ seed: seedUsed, cx: farCoord.cx, cz: farCoord.cz, cemeterySettlements: pair })
    const viaOwner = resolveCemeteriesForChunk(owner, ownerParams, createLocalTerrainSampler(owner, ownerParams))
      .filter((p) => p.id === placed!.id)
    const viaFar = resolveCemeteriesForChunk(farCoord, farParams, createLocalTerrainSampler(farCoord, farParams))
      .filter((p) => p.id === placed!.id)
    expect(viaOwner).toHaveLength(1)
    expect(viaFar).toHaveLength(0)
  })

  it('falls back to two dedicated cemeteries when the shared corridor is blocked', () => {
    const blockedCorridor = [{ x: 140, z: 0, radius: 80 }]
    let dedicatedA: ResolvedCemeteryPlacement | null = null
    let dedicatedB: ResolvedCemeteryPlacement | null = null
    for (let seed = 1; seed <= 240; seed++) {
      clearCemeteryCaches()
      clearCemeteryPlacementCaches()
      const params = tileParams({
        seed,
        cemeterySettlements: pair,
        cemeteryClearings: blockedCorridor,
        clearings: blockedCorridor.map((c) => ({
          x: c.x,
          z: c.z,
          radius: c.radius,
          targetH: 1,
          heightStrength: 0.8,
          tintStrength: 0.75,
        })),
      })
      const topology = resolveCemeteryTopologyForSettlement('0_0', makeSettlementRefPeek(pair))!
      expect(topology.intent).toBe('shared')
      expect(resolvePlacementForTopology(topology, params)).toBeNull()
      expect(isSharedAssignmentSplit(topology.assignmentId)).toBe(true)
      dedicatedA = resolvePlacementForTopology(dedicatedCemeteryTopology(a), params)
      dedicatedB = resolvePlacementForTopology(dedicatedCemeteryTopology(b), params)
      if (dedicatedA && dedicatedB) break
    }
    expect(dedicatedA).not.toBeNull()
    expect(dedicatedB).not.toBeNull()
    expect(dedicatedA!.id).not.toBe(dedicatedB!.id)
    expect(dedicatedA!.servedSettlementIds).toEqual(['0_0'])
    expect(dedicatedB!.servedSettlementIds).toEqual(['1_0'])
  })
})
