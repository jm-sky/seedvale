import type { CemeterySettlementRef } from './cemeteryAssignment'
import type { LandmarkKind } from './chunkEnvironment'
import type {
  ChunkTileParams,
  ClearingSegment,
  RegionalSmoothingSegment,
  RegionParams,
  RoadCorridorSegment,
  VegetationKind,
} from './chunkHeightmap'
import type { FbmParams } from './fbm'
import { worldToCell } from '../settlement/settlementGenerator'
import { CEMETERY_SETTLEMENT_GATHER_RADIUS } from './cemeteryAssignment'
import { chunkCenter, type ChunkCoord, worldToChunk } from './chunkGrid'
import {
  isLightweightUnloadedLandmark,
  resolveUnloadedLandmark,
  ringChunkOffsets,
} from './unloadedLandmarkLookup'

/** One bounded worker-knowledge job rather than a per-chunk fan-out. */
export const WORLD_KNOWLEDGE_MAX_NEARBY_HITS = 32

export type WorldKnowledgeQueryKind = 'nearest-landmark' | 'nearby-landmarks'

/** Deterministic terrain/worldgen snapshot for one worker knowledge scan.
 *  Plain data only — structured-clone safe, no managers or Three.js objects.
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
  /** Origin-centered corridor gather covering the whole scan ring — same
   *  `segmentsNear` / `villageSegmentsNear` inputs unloaded `paramsFor`
   *  would use per chunk, so classic-landmark `roadTint` gates match. */
  roadSegments: readonly RoadCorridorSegment[]
  clearings: readonly ClearingSegment[]
  regional: readonly RegionalSmoothingSegment[]
  cemeterySettlements: readonly CemeterySettlementRef[]
  cemeteryRoadSegments: readonly RoadCorridorSegment[]
  cemeteryClearings: readonly { x: number, z: number, radius: number }[]
}

export type WorldKnowledgeWorkerParams = {
  queryKind: WorldKnowledgeQueryKind
  landmarkKinds: readonly LandmarkKind[]
  originX: number
  originZ: number
  maxChunkRadius: number
  terrain: WorldKnowledgeTerrainSnapshot
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
}

/**
 * Rebuild the per-chunk `ChunkTileParams` a worker knowledge scan needs from
 * the once-per-request snapshot. River lists stay empty to match
 * `findLandmarkNear`'s unloaded `paramsFor(coord, [])` hydrology skip;
 * road/clearing/regional data come from the origin-centered gather so
 * `roadTint` gates match that same unloaded path.
 * @domain world-terrain
 */
export function chunkParamsForWorldKnowledgeScan(
  coord: ChunkCoord,
  terrain: WorldKnowledgeTerrainSnapshot,
): ChunkTileParams {
  const { x, z } = chunkCenter(coord, terrain.chunkSize)
  const center = worldToCell(x, z)
  const cemeterySettlements = terrain.cemeterySettlements.filter((ref) => (
    Math.max(Math.abs(ref.gx - center.gx), Math.abs(ref.gz - center.gz)) <= CEMETERY_SETTLEMENT_GATHER_RADIUS
  ))
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
    roadSegments: [...terrain.roadSegments],
    clearings: [...terrain.clearings],
    regional: [...terrain.regional],
    riverSegments: [],
    cemeterySettlements,
    cemeteryRoadSegments: [...terrain.cemeteryRoadSegments],
    cemeteryClearings: [...terrain.cemeteryClearings],
    authoredExpeditionRuins: terrain.authoredExpeditionRuins ?? null,
  }
}

/**
 * Bounded ring scan used by the `worldKnowledge` worker job. One request
 * walks the Chebyshev rings internally — callers must not enqueue one job
 * per chunk. Only lightweight kinds are resolved; heavier kinds are skipped
 * rather than falling back to full environment generation.
 * @domain world-terrain
 */
export function scanWorldKnowledge(params: WorldKnowledgeWorkerParams): WorldKnowledgeScanResult {
  const kinds = params.landmarkKinds.filter(isLightweightUnloadedLandmark)
  if (kinds.length === 0 || params.maxChunkRadius < 0) return { hits: [] }
  const center = worldToChunk(params.originX, params.originZ, params.terrain.chunkSize)
  const hits: WorldKnowledgeScanHit[] = []
  const seen = new Set<string>()
  for (const { dx, dz } of ringChunkOffsets(params.maxChunkRadius)) {
    const coord: ChunkCoord = { cx: center.cx + dx, cz: center.cz + dz }
    const chunkParams = chunkParamsForWorldKnowledgeScan(coord, params.terrain)
    for (const kind of kinds) {
      const found = resolveUnloadedLandmark(kind, coord, chunkParams)
      if (!found || seen.has(found.id)) continue
      seen.add(found.id)
      hits.push({ type: 'landmark', id: found.id, kind, x: found.x, z: found.z })
      if (params.queryKind === 'nearest-landmark') return { hits }
      if (hits.length >= WORLD_KNOWLEDGE_MAX_NEARBY_HITS) return { hits }
    }
  }
  return { hits }
}
