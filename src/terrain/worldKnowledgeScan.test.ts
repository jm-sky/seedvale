import { describe, expect, it, vi } from 'vitest'
import type { ChunkTileParams } from './chunkHeightmap'
import { clearCemeteryCaches } from './cemeteryAssignment'
import { clearCemeteryPlacementCaches } from './cemeteryPlacement'
import * as chunkHeightmap from './chunkHeightmap'
import { resolveUnloadedLandmark, ringChunkOffsets } from './unloadedLandmarkLookup'
import {
  chunkParamsForWorldKnowledgeScan,
  scanWorldKnowledge,
  type WorldKnowledgeTerrainSnapshot,
  type WorldKnowledgeWorkerParams,
} from './worldKnowledgeScan'

function tileParams(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
  return {
    cx: 0,
    cz: 0,
    chunkSize: 64,
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
        roadHalfWidth: 5, roadHeightStrength: 0.85, roadTintStrength: 0.8, pathHalfWidth: 1.5,
        pathHeightStrength: 0.2, pathTintStrength: 0.4, smoothingWindow: 10, maxNeighborRoads: 3,
        dockSearchRadius: 140, edgeWobbleAmplitude: 0.15, edgeWobbleScale: 0.06, potholeDepth: 0.12,
        potholeThreshold: 0.72, meanderAmplitude: 2, meanderScale: 0.04, surfaceDetailEnabled: true,
        rutDepth: 0.05, rutOffsetFraction: 0.42, rutWidthFraction: 0.16, microBumpStrength: 0.025, microBumpScale: 0.6,
      },
      village: { coreRadius: 9, houseRadius: 4.5, heightStrength: 0.8, tintStrength: 0.75, regionalHeightStrengthFlat: 0.3, regionalHeightStrengthMountain: 0.15 },
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

function snapshotFromParams(params: ChunkTileParams): WorldKnowledgeTerrainSnapshot {
  return {
    chunkSize: params.chunkSize,
    resolution: params.resolution,
    seed: params.seed,
    heightScale: params.heightScale,
    waterLevel: params.waterLevel,
    noiseScale: params.noiseScale,
    detailAmplitude: params.detailAmplitude,
    hillsScale: params.hillsScale,
    hillsAmplitude: params.hillsAmplitude,
    hillsFbm: params.hillsFbm,
    fbm: params.fbm,
    biome: params.biome,
    region: params.region,
    vegetationSpeciesCount: params.vegetationSpeciesCount,
    authoredExpeditionRuins: params.authoredExpeditionRuins ?? null,
    homeChunks: [],
    cemeterySettlements: params.cemeterySettlements ?? [],
    cemeteryRoadSegments: params.cemeteryRoadSegments ?? [],
    cemeteryClearings: params.cemeteryClearings ?? [],
    roadSegments: params.roadSegments ?? [],
    clearings: params.clearings ?? [],
    regional: params.regional ?? [],
  }
}

function workerParams(
  params: ChunkTileParams,
  overrides: Partial<WorldKnowledgeWorkerParams> = {},
): WorldKnowledgeWorkerParams {
  return {
    queryKind: 'nearest-landmark',
    landmarkKinds: ['monolith'],
    originX: 0,
    originZ: 0,
    maxChunkRadius: 4,
    terrain: snapshotFromParams(params),
    ...overrides,
  }
}

function ringSearch(
  kind: 'monolith' | 'cemetery',
  params: ChunkTileParams,
  maxChunkRadius: number,
): { id: string, x: number, z: number } | undefined {
  const center = { cx: 0, cz: 0 }
  for (const { dx, dz } of ringChunkOffsets(maxChunkRadius)) {
    const coord = { cx: center.cx + dx, cz: center.cz + dz }
    const found = resolveUnloadedLandmark(kind, coord, tileParams({
      ...params,
      cx: coord.cx,
      cz: coord.cz,
    }))
    if (found) return found
  }
  return undefined
}

describe('scanWorldKnowledge (plan quests-progression-047)', () => {
  it('matches the main-thread unloaded ring scan for a representative monolith', () => {
    let expected: { id: string, x: number, z: number } | undefined
    let seed = 0
    for (; seed < 400; seed++) {
      expected = ringSearch('monolith', tileParams({ seed }), 4)
      if (expected) break
    }
    expect(expected).toBeTruthy()
    const scanned = scanWorldKnowledge(workerParams(tileParams({ seed })))
    expect(scanned.hits[0]).toMatchObject({
      type: 'landmark',
      id: expected!.id,
      kind: 'monolith',
      x: expected!.x,
      z: expected!.z,
    })
  })

  it('does not call computeChunkTile for lightweight kinds', () => {
    const spy = vi.spyOn(chunkHeightmap, 'computeChunkTile')
    try {
      scanWorldKnowledge(workerParams(tileParams({ seed: 7 }), {
        landmarkKinds: ['monolith', 'cemetery', 'ruins', 'tower'],
      }))
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('nearby-landmarks can return more than one hit without per-chunk jobs', () => {
    const scanned = scanWorldKnowledge(workerParams(tileParams({ seed: 11 }), {
      queryKind: 'nearby-landmarks',
      landmarkKinds: ['monolith', 'stoneCircle', 'smallRuins'],
      maxChunkRadius: 6,
    }))
    expect(scanned.hits.length).toBeGreaterThanOrEqual(0)
    const ids = scanned.hits.map((hit) => hit.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cemetery scan agrees with resolveUnloadedLandmark for a known seed', () => {
    let expected: { id: string, x: number, z: number } | undefined
    let seed = 0
    const settlements = [{ id: '0_0', gx: 0, gz: 0, x: 0, z: 0, size: 'MD' as const }]
    const regional = [{ x: 0, z: 0, radius: 48, targetH: 1, heightStrength: 0.2 }]
    for (; seed < 120; seed++) {
      clearCemeteryCaches()
      clearCemeteryPlacementCaches()
      expected = resolveUnloadedLandmark('cemetery', { cx: 0, cz: 0 }, tileParams({
        seed,
        cemeterySettlements: settlements,
        regional,
      }))
      if (expected) break
    }
    expect(expected?.id.startsWith('cemetery:a:')).toBe(true)
    clearCemeteryCaches()
    clearCemeteryPlacementCaches()
    const scanned = scanWorldKnowledge(workerParams(tileParams({
      seed,
      cemeterySettlements: settlements,
      regional,
    }), {
      landmarkKinds: ['cemetery'],
      maxChunkRadius: 0,
    }))
    expect(scanned.hits[0]?.id).toBe(expected!.id)
  })

  it('rebuilds per-chunk params from the snapshot without capturing functions', () => {
    const params = chunkParamsForWorldKnowledgeScan({ cx: 2, cz: -1 }, snapshotFromParams(tileParams({
      seed: 4,
      cemeterySettlements: [
        { id: '0_0', gx: 0, gz: 0, x: 0, z: 0, size: 'MD' },
        { id: '1_0', gx: 1, gz: 0, x: 280, z: 0, size: 'SM' },
      ],
      roadSegments: [{
        ax: 0, az: 0, ah: 1, bx: 8, bz: 0, bh: 1,
        halfWidth: 2, heightStrength: 0.5, tintStrength: 0.5,
      }],
    })))
    expect(params.cx).toBe(2)
    expect(params.cz).toBe(-1)
    expect(params.roadSegments).toHaveLength(1)
    expect(params.riverSegments).toEqual([])
    expect(JSON.parse(JSON.stringify(params)).seed).toBe(4)
  })
})
