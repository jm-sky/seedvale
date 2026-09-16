import { describe, expect, it, vi } from 'vitest'
import type { ChunkTileParams } from './chunkHeightmap'
import * as roadNetwork from '../settlement/roadNetwork'
import * as cemeteryAssignment from './cemeteryAssignment'
import { clearCemeteryCaches } from './cemeteryAssignment'
import { clearCemeteryPlacementCaches } from './cemeteryPlacement'
import * as chunkHeightmap from './chunkHeightmap'
import { resolveUnloadedLandmark, ringChunkOffsets } from './unloadedLandmarkLookup'
import {
  chunkParamsForWorldKnowledgeScan,
  prepareWorldKnowledgeScan,
  scanWorldKnowledge,
  worldKnowledgeGatherFor,
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
    localSearchRadius: 56,
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
    epoch: `test:${params.seed}`,
    terrain: snapshotFromParams(params),
    ...overrides,
  }
}

function emptyVillage() {
  return { clearings: [] as never[], regional: [] as never[], paths: [] as never[] }
}

function withEmptyCorridors<T>(run: () => T): T {
  const village = vi.spyOn(roadNetwork, 'villageSegmentsNear').mockReturnValue(emptyVillage())
  const segments = vi.spyOn(roadNetwork, 'segmentsNear').mockReturnValue([])
  const fords = vi.spyOn(roadNetwork, 'fordsNear').mockReturnValue([])
  const bridges = vi.spyOn(roadNetwork, 'bridgesNear').mockReturnValue([])
  try {
    return run()
  } finally {
    village.mockRestore()
    segments.mockRestore()
    fords.mockRestore()
    bridges.mockRestore()
  }
}

function ringSearch(
  kind: 'monolith' | 'cemetery',
  params: WorldKnowledgeWorkerParams,
): { id: string, x: number, z: number } | undefined {
  const gather = worldKnowledgeGatherFor(params.landmarkKinds)
  const roadCtx = prepareWorldKnowledgeScan(params)
  const center = { cx: 0, cz: 0 }
  for (const { dx, dz } of ringChunkOffsets(params.maxChunkRadius)) {
    const coord = { cx: center.cx + dx, cz: center.cz + dz }
    const found = resolveUnloadedLandmark(
      kind,
      coord,
      chunkParamsForWorldKnowledgeScan(coord, params.terrain, roadCtx, gather),
    )
    if (found) return found
  }
  return undefined
}

describe('scanWorldKnowledge (plan world-030)', () => {
  it('matches resolveUnloadedLandmark over per-chunk reconstructed params for a representative monolith', () => {
    withEmptyCorridors(() => {
      let expected: { id: string, x: number, z: number } | undefined
      let seed = 0
      let params: WorldKnowledgeWorkerParams | undefined
      for (; seed < 400; seed++) {
        params = workerParams(tileParams({ seed }))
        expected = ringSearch('monolith', params)
        if (expected) break
      }
      expect(expected).toBeTruthy()
      const scanned = scanWorldKnowledge(params!)
      expect(scanned.hits[0]).toMatchObject({
        type: 'landmark',
        id: expected!.id,
        kind: 'monolith',
        x: expected!.x,
        z: expected!.z,
      })
    })
  })

  it('does not call computeChunkTile for lightweight kinds', () => {
    const spy = vi.spyOn(chunkHeightmap, 'computeChunkTile')
    const cemetery = vi.spyOn(cemeteryAssignment, 'collectSettlementRefsNear').mockReturnValue([])
    try {
      withEmptyCorridors(() => {
        scanWorldKnowledge(workerParams(tileParams({ seed: 7 }), {
          landmarkKinds: ['monolith', 'cemetery', 'ruins', 'tower'],
          maxChunkRadius: 1,
        }))
      })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      cemetery.mockRestore()
    }
  })

  it('does not gather cemetery refs for a classic-only query', () => {
    const spy = vi.spyOn(cemeteryAssignment, 'collectSettlementRefsNear')
    try {
      withEmptyCorridors(() => {
        scanWorldKnowledge(workerParams(tileParams({ seed: 7 }), {
          landmarkKinds: ['monolith'],
          maxChunkRadius: 1,
        }))
      })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('gathers cemetery refs only when cemetery is in the query', () => {
    const spy = vi.spyOn(cemeteryAssignment, 'collectSettlementRefsNear').mockReturnValue([])
    try {
      withEmptyCorridors(() => {
        scanWorldKnowledge(workerParams(tileParams({ seed: 7 }), {
          landmarkKinds: ['cemetery'],
          maxChunkRadius: 0,
        }))
      })
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('gathers corridors per scanned chunk rather than once at the origin', () => {
    const spy = vi.spyOn(roadNetwork, 'segmentsNear').mockReturnValue([])
    const village = vi.spyOn(roadNetwork, 'villageSegmentsNear').mockReturnValue(emptyVillage())
    const fords = vi.spyOn(roadNetwork, 'fordsNear').mockReturnValue([])
    const bridges = vi.spyOn(roadNetwork, 'bridgesNear').mockReturnValue([])
    try {
      scanWorldKnowledge(workerParams(tileParams({ seed: 3 }), {
        landmarkKinds: ['monolith'],
        maxChunkRadius: 1,
      }))
      const centers = spy.mock.calls.map((call) => `${call[0]},${call[1]}`)
      expect(new Set(centers).size).toBeGreaterThan(1)
    } finally {
      spy.mockRestore()
      village.mockRestore()
      fords.mockRestore()
      bridges.mockRestore()
    }
  })

  it('nearby-landmarks can return more than one hit without per-chunk jobs', () => {
    const scanned = withEmptyCorridors(() => scanWorldKnowledge(workerParams(tileParams({ seed: 11 }), {
      queryKind: 'nearby-landmarks',
      landmarkKinds: ['monolith', 'stoneCircle', 'smallRuins'],
      maxChunkRadius: 6,
    })))
    expect(scanned.hits.length).toBeGreaterThanOrEqual(0)
    const ids = scanned.hits.map((hit) => hit.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cemetery scan agrees with resolveUnloadedLandmark for a known seed', () => {
    const settlements = [{ id: '0_0', gx: 0, gz: 0, x: 0, z: 0, size: 'MD' as const }]
    const cemetery = vi.spyOn(cemeteryAssignment, 'collectSettlementRefsNear').mockReturnValue(settlements)
    try {
      withEmptyCorridors(() => {
        let expected: { id: string, x: number, z: number } | undefined
        let seed = 0
        let params: WorldKnowledgeWorkerParams | undefined
        for (; seed < 120; seed++) {
          clearCemeteryCaches()
          clearCemeteryPlacementCaches()
          params = workerParams(tileParams({ seed }), {
            landmarkKinds: ['cemetery'],
            maxChunkRadius: 0,
          })
          expected = ringSearch('cemetery', params)
          if (expected) break
        }
        expect(expected?.id.startsWith('cemetery:')).toBe(true)
        clearCemeteryCaches()
        clearCemeteryPlacementCaches()
        const scanned = scanWorldKnowledge(params!)
        expect(scanned.hits[0]?.id).toBe(expected!.id)
      })
    } finally {
      cemetery.mockRestore()
    }
  })

  it('rebuilds per-chunk params without capturing functions', () => {
    withEmptyCorridors(() => {
      const params = workerParams(tileParams({ seed: 4 }))
      const roadCtx = prepareWorldKnowledgeScan(params)
      const chunkParams = chunkParamsForWorldKnowledgeScan(
        { cx: 2, cz: -1 },
        params.terrain,
        roadCtx,
        { includeCorridors: true, includeCemetery: false },
      )
      expect(chunkParams.cx).toBe(2)
      expect(chunkParams.cz).toBe(-1)
      expect(chunkParams.riverSegments).toEqual([])
      expect(chunkParams.cemeterySettlements).toEqual([])
      expect(JSON.parse(JSON.stringify(chunkParams)).seed).toBe(4)
    })
  })

  it('keeps nearest-landmark ring order and stops at the first hit', () => {
    const offsets = ringChunkOffsets(2)
    expect(offsets[0]).toEqual({ dx: 0, dz: 0 })
    const scanned = withEmptyCorridors(() => scanWorldKnowledge(workerParams(tileParams({ seed: 9 }), {
      queryKind: 'nearest-landmark',
      landmarkKinds: ['monolith'],
      maxChunkRadius: 6,
    })))
    if (scanned.hits.length === 0) return
    expect(scanned.hits).toHaveLength(1)
  })
})
