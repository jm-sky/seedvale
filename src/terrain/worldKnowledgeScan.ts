import type { RoadNetworkContext } from '../settlement/roadNetwork'
import type {
  ChunkTileParams,
  RawSampleParams,
  RegionParams,
  VegetationKind,
} from './chunkHeightmap'
import type { FbmParams } from './fbm'
import { bridgesNear, clearRoadNetworkMemoryCaches, fordsNear, segmentsNear, villageSegmentsNear } from '../settlement/roadNetwork'
import { setSettlementRiverQuery, settlementDefFor } from '../settlement/settlementPlanCache'
import { CEMETERY_SETTLEMENT_GATHER_RADIUS, collectSettlementRefsNear } from './cemeteryAssignment'
import { isClassicLandmarkKind, type LandmarkKind } from './chunkEnvironment'
import { chunkCenter, type ChunkCoord, worldToChunk } from './chunkGrid'
import {
  sampleContinentalnessAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from './chunkHeightmap'
import { createRiverQuery } from './riverQuery'
import {
  isLightweightUnloadedLandmark,
  resolveUnloadedLandmark,
  ringChunkOffsets,
} from './unloadedLandmarkLookup'

/** One bounded worker-knowledge job rather than a per-chunk fan-out. */
export const WORLD_KNOWLEDGE_MAX_NEARBY_HITS = 32

export type WorldKnowledgeQueryKind = 'nearest-landmark' | 'nearby-landmarks'

/** Cheap main-thread snapshot for one worker knowledge scan.
 *  Plain data only — structured-clone safe. Corridor/settlement reconstruction
 *  belongs in the worker (plan world-030), not in this payload.
 * @domain world-terrain
 */
export type WorldKnowledgeTerrainSnapshot = {
  chunkSize: number
  resolution: number
  seed: number
  heightScale: number
  waterLevel: number
  noiseScale: number
  detailAmplitude: number
  hillsScale: number
  hillsAmplitude: number
  hillsFbm: FbmParams
  fbm: FbmParams
  biome: { noiseScale: number, fbm: FbmParams }
  region: RegionParams
  vegetationSpeciesCount: Record<VegetationKind, number>
  authoredExpeditionRuins?: ChunkTileParams['authoredExpeditionRuins']
  homeChunks: readonly { cx: number, cz: number }[]
  /** `findSettlementSite` radius — same value `ChunkManager` threads into `roadCtx`. */
  localSearchRadius: number
}

export type WorldKnowledgeWorkerParams = {
  queryKind: WorldKnowledgeQueryKind
  landmarkKinds: readonly LandmarkKind[]
  originX: number
  originZ: number
  maxChunkRadius: number
  terrain: WorldKnowledgeTerrainSnapshot
  /** World identity (`seed:worldGeneration`). Worker caches reset when this changes. */
  epoch?: string
}

export type WorldKnowledgeScanHit = {
  type: 'landmark'
  id: string
  kind: LandmarkKind
  x: number
  z: number
}

export type WorldKnowledgeScanResult = {
  hits: WorldKnowledgeScanHit[]
  elapsedMs: number
}

export type WorldKnowledgeChunkGather = {
  includeCorridors: boolean
  includeCemetery: boolean
}

let preparedEpoch = ''

function rawSampleParamsFromTerrain(terrain: WorldKnowledgeTerrainSnapshot): RawSampleParams {
  return {
    seed: terrain.seed,
    heightScale: terrain.heightScale,
    waterLevel: terrain.waterLevel,
    noiseScale: terrain.noiseScale,
    detailAmplitude: terrain.detailAmplitude,
    hillsScale: terrain.hillsScale,
    hillsAmplitude: terrain.hillsAmplitude,
    hillsFbm: terrain.hillsFbm,
    fbm: terrain.fbm,
    biome: terrain.biome,
    region: terrain.region,
  }
}

function scanEpoch(params: WorldKnowledgeWorkerParams): string {
  return params.epoch ?? String(params.terrain.seed)
}

/**
 * Analytic samplers matching unloaded `ChunkManager.readField` fallback so
 * worker reconstruction uses the same height/region axes as `paramsFor(coord, [])`.
 * @domain world-terrain
 */
export function worldKnowledgeRoadContext(terrain: WorldKnowledgeTerrainSnapshot): RoadNetworkContext {
  const raw = rawSampleParamsFromTerrain(terrain)
  return {
    seed: terrain.seed,
    sampleHeight: (x, z) => sampleHeightAt(x, z, raw),
    waterLevel: terrain.waterLevel,
    terrainSamplers: {
      sampleContinentalness: (x, z) => sampleContinentalnessAt(x, z, raw),
      sampleMountainRidge: (x, z) => sampleMountainRidgeAt(x, z, raw),
      sampleMoistureRegion: (x, z) => sampleMoistureRegionAt(x, z, raw),
    },
    heightScale: terrain.heightScale,
    region: terrain.region,
    localSearchRadius: terrain.localSearchRadius,
  }
}

/**
 * Reset in-memory worldgen caches when the worker sees a new world epoch.
 * Does not touch IndexedDB road-route persistence.
 * @domain world-terrain
 */
export function prepareWorldKnowledgeScan(params: WorldKnowledgeWorkerParams): RoadNetworkContext {
  const epoch = scanEpoch(params)
  if (epoch !== preparedEpoch) {
    preparedEpoch = epoch
    clearRoadNetworkMemoryCaches()
    setSettlementRiverQuery(createRiverQuery(rawSampleParamsFromTerrain(params.terrain)))
  }
  return worldKnowledgeRoadContext(params.terrain)
}

function cloneTerrainFields(coord: ChunkCoord, terrain: WorldKnowledgeTerrainSnapshot): Omit<
  ChunkTileParams,
  | 'roadSegments'
  | 'clearings'
  | 'regional'
  | 'riverSegments'
  | 'fordProjections'
  | 'bridgeProjections'
  | 'cemeterySettlements'
  | 'cemeteryRoadSegments'
  | 'cemeteryClearings'
  | 'authoredExpeditionRuins'
> {
  return {
    cx: coord.cx,
    cz: coord.cz,
    chunkSize: terrain.chunkSize,
    resolution: terrain.resolution,
    seed: terrain.seed,
    heightScale: terrain.heightScale,
    waterLevel: terrain.waterLevel,
    noiseScale: terrain.noiseScale,
    detailAmplitude: terrain.detailAmplitude,
    hillsScale: terrain.hillsScale,
    hillsAmplitude: terrain.hillsAmplitude,
    hillsFbm: { ...terrain.hillsFbm },
    fbm: { ...terrain.fbm },
    biome: { noiseScale: terrain.biome.noiseScale, fbm: { ...terrain.biome.fbm } },
    region: {
      ...terrain.region,
      continentFbm: { ...terrain.region.continentFbm },
      mountainFbm: { ...terrain.region.mountainFbm },
      moistureRegionFbm: { ...terrain.region.moistureRegionFbm },
    },
    isHomeChunk: terrain.homeChunks.some((home) => home.cx === coord.cx && home.cz === coord.cz),
    vegetationSpeciesCount: { ...terrain.vegetationSpeciesCount },
  }
}

export function worldKnowledgeGatherFor(kinds: readonly LandmarkKind[]): WorldKnowledgeChunkGather {
  const lightweight = kinds.filter(isLightweightUnloadedLandmark)
  const includeCemetery = lightweight.includes('cemetery')
  return {
    includeCemetery,
    includeCorridors: includeCemetery || lightweight.some(isClassicLandmarkKind),
  }
}

/**
 * Per-chunk `ChunkTileParams` matching unloaded `paramsFor(coord, [])`:
 * corridors come from `segmentsNear` / `villageSegmentsNear` at this chunk,
 * rivers stay empty, cemetery inputs are gathered only when requested.
 * Main thread must not pre-build these arrays (plan world-030).
 * @domain world-terrain
 */
export function chunkParamsForWorldKnowledgeScan(
  coord: ChunkCoord,
  terrain: WorldKnowledgeTerrainSnapshot,
  roadCtx: RoadNetworkContext,
  gather: WorldKnowledgeChunkGather = { includeCorridors: true, includeCemetery: true },
): ChunkTileParams {
  const { x, z } = chunkCenter(coord, terrain.chunkSize)
  const base = cloneTerrainFields(coord, terrain)
  if (!gather.includeCorridors && !gather.includeCemetery) {
    return {
      ...base,
      roadSegments: [],
      clearings: [],
      regional: [],
      riverSegments: [],
      cemeterySettlements: [],
      authoredExpeditionRuins: terrain.authoredExpeditionRuins ?? null,
    }
  }

  const village = gather.includeCorridors
    ? villageSegmentsNear(x, z, terrain.chunkSize, roadCtx)
    : { clearings: [], regional: [], paths: [] }
  const roadSegments = gather.includeCorridors
    ? [...segmentsNear(x, z, terrain.chunkSize, roadCtx), ...village.paths]
    : []

  let cemeterySettlements: ChunkTileParams['cemeterySettlements'] = []
  let cemeteryRoadSegments: ChunkTileParams['cemeteryRoadSegments']
  let cemeteryClearings: ChunkTileParams['cemeteryClearings']
  if (gather.includeCemetery) {
    cemeterySettlements = collectSettlementRefsNear(
      x,
      z,
      CEMETERY_SETTLEMENT_GATHER_RADIUS,
      (cell) => settlementDefFor(cell, {
        seed: roadCtx.seed,
        sampleHeight: roadCtx.sampleHeight,
        waterLevel: roadCtx.waterLevel,
        localSearchRadius: roadCtx.localSearchRadius,
        terrainSamplers: roadCtx.terrainSamplers,
        heightScale: roadCtx.heightScale,
        region: roadCtx.region,
        homeSize: roadCtx.homeSize,
      }),
    )
    const cemeteryGatherSize = terrain.chunkSize * 8
    const cemeteryVillage = villageSegmentsNear(x, z, cemeteryGatherSize, roadCtx)
    cemeteryRoadSegments = [
      ...segmentsNear(x, z, cemeteryGatherSize, roadCtx),
      ...cemeteryVillage.paths,
    ]
    cemeteryClearings = cemeteryVillage.clearings.map((clearing) => ({
      x: clearing.x,
      z: clearing.z,
      radius: clearing.radius,
    }))
  }

  return {
    ...base,
    roadSegments,
    clearings: village.clearings,
    regional: village.regional,
    riverSegments: [],
    fordProjections: gather.includeCorridors ? fordsNear(x, z, terrain.chunkSize, roadCtx) : undefined,
    bridgeProjections: gather.includeCorridors ? bridgesNear(x, z, terrain.chunkSize, roadCtx) : undefined,
    cemeterySettlements,
    cemeteryRoadSegments,
    cemeteryClearings,
    authoredExpeditionRuins: terrain.authoredExpeditionRuins ?? null,
  }
}

function emptyResult(elapsedMs: number): WorldKnowledgeScanResult {
  return { hits: [], elapsedMs }
}

/**
 * Bounded ring scan used by the `worldKnowledge` worker job. Reconstructs
 * per-chunk worldgen corridors inside the worker so Accept stays O(1) on
 * the main thread (plan world-030).
 * @domain world-terrain
 */
export function scanWorldKnowledge(params: WorldKnowledgeWorkerParams): WorldKnowledgeScanResult {
  const started = performance.now()
  const kinds = params.landmarkKinds.filter(isLightweightUnloadedLandmark)
  if (kinds.length === 0 || params.maxChunkRadius < 0) return emptyResult(performance.now() - started)
  const gather = worldKnowledgeGatherFor(kinds)
  const roadCtx = prepareWorldKnowledgeScan(params)
  const center = worldToChunk(params.originX, params.originZ, params.terrain.chunkSize)
  const hits: WorldKnowledgeScanHit[] = []
  const seen = new Set<string>()
  for (const { dx, dz } of ringChunkOffsets(params.maxChunkRadius)) {
    const coord: ChunkCoord = { cx: center.cx + dx, cz: center.cz + dz }
    const chunkParams = chunkParamsForWorldKnowledgeScan(coord, params.terrain, roadCtx, gather)
    for (const kind of kinds) {
      const found = resolveUnloadedLandmark(kind, coord, chunkParams)
      if (!found || seen.has(found.id)) continue
      seen.add(found.id)
      hits.push({ type: 'landmark', id: found.id, kind, x: found.x, z: found.z })
      if (params.queryKind === 'nearest-landmark') {
        return { hits, elapsedMs: performance.now() - started }
      }
      if (hits.length >= WORLD_KNOWLEDGE_MAX_NEARBY_HITS) {
        return { hits, elapsedMs: performance.now() - started }
      }
    }
  }
  return { hits, elapsedMs: performance.now() - started }
}
