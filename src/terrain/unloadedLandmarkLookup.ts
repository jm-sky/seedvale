import { siteChunkContainsPoint } from '../world/locations/darkForestTreasureSite'
import { resolveCemeteryPlacement } from './cemeteryPlacement'
import {
  computeChunkEnvironment,
  isClassicLandmarkKind,
  type LandmarkKind,
  resolveClassicLandmarkPlacement,
} from './chunkEnvironment'
import { type ChunkCoord } from './chunkGrid'
import { type ChunkTileParams, computeChunkTile, createLocalTerrainSampler } from './chunkHeightmap'

/** Chunk-coord offsets in expanding Chebyshev rings out to `maxRadius`,
 *  center first — the deterministic search order `findLandmarkNear` and
 *  worker world-knowledge scans walk so they always return the same
 *  landmark for the same `(kind, center)` and can stop at the first hit.
 * @domain world-terrain
 */
export function ringChunkOffsets(maxRadius: number): { dx: number, dz: number }[] {
  const offsets: { dx: number, dz: number }[] = [{ dx: 0, dz: 0 }]
  for (let r = 1; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        offsets.push({ dx, dz })
      }
    }
  }
  return offsets
}

/** Loaded-tile landmark pick used by `findLandmarkNear` — reads an already
 *  generated `tile.environment` and never recomputes placement.
 * @domain world-terrain
 */
export function landmarkFromEnvironment(
  environment: readonly { kind: string, id?: string, x: number, z: number }[],
  kind: LandmarkKind,
): { id: string, x: number, z: number } | undefined {
  const found = environment.find((p) => p.kind === kind && p.id)
  return found?.id ? { id: found.id, x: found.x, z: found.z } : undefined
}

/**
 * Landmark kinds whose unloaded lookup reuses streamed placement primitives
 * without `computeChunkTile()` / full `computeChunkEnvironment()`. Worker
 * world-knowledge jobs only scan these (plan quests-progression-047).
 * @domain world-terrain
 */
export function isLightweightUnloadedLandmark(kind: LandmarkKind): boolean {
  return kind === 'cemetery' || kind === 'ruins' || isClassicLandmarkKind(kind)
}

/** `findLandmarkNear`'s unloaded-chunk resolver (plans world-014 / world-028)
 *  — pure given `(kind, coord, params)`. Shared by streamed fallback lookup
 *  and worker-backed world-knowledge scans so both sides resolve the same
 *  stable landmark identity.
 *
 *  Lightweight kinds (`cemetery`, authored `ruins`, `monolith` /
 *  `stoneCircle` / `smallRuins`) resolve without `computeChunkTile()` /
 *  full `computeChunkEnvironment()`. Remaining landmark kinds still use the
 *  original full-generation fallback and are out of V1 worker knowledge.
 * @domain world-terrain
 */
export function resolveUnloadedLandmark(
  kind: LandmarkKind,
  coord: ChunkCoord,
  params: ChunkTileParams,
): { id: string, x: number, z: number } | undefined {
  if (kind === 'cemetery') {
    const placement = resolveCemeteryPlacement(coord, params, createLocalTerrainSampler(coord, params))
    return placement?.id ? { id: placement.id, x: placement.x, z: placement.z } : undefined
  }
  if (kind === 'ruins') {
    const authored = params.authoredExpeditionRuins
    if (authored && siteChunkContainsPoint(coord, params.chunkSize, authored.x, authored.z)) {
      return { id: authored.id, x: authored.x, z: authored.z }
    }
    return undefined
  }
  if (isClassicLandmarkKind(kind)) {
    const placement = resolveClassicLandmarkPlacement(
      kind,
      coord,
      params,
      createLocalTerrainSampler(coord, params),
    )
    return placement?.id ? { id: placement.id, x: placement.x, z: placement.z } : undefined
  }
  const environment = computeChunkEnvironment(coord, computeChunkTile(params), params, [])
  return landmarkFromEnvironment(environment, kind)
}
