import type { RoadCorridorSegment } from './chunkHeightmap'
import type { ChunkManager } from './chunkManager'
import { sandBandAt } from './biomeColors'
import { isRockGround } from './dig'

export type FootstepSurface = 'grass' | 'dirt' | 'sand' | 'stone' | 'road'

/** Query window for `roadCorridorsNear` — small, since footsteps only care
 *  about corridors directly underfoot. */
const ROAD_QUERY_SIZE = 8
/** Small margin beyond a corridor's `halfWidth` so the road clip doesn't cut
 *  off right at the geometric edge. */
const ROAD_FEATHER = 0.6
/** Above this `TreeEnvSample.biome.desert` weight, ground reads as dry/packed
 *  dirt rather than grass — matches `envGrowthFactor`'s desert/forest split. */
const DESERT_DIRT_THRESHOLD = 0.4

function distanceToSegment(x: number, z: number, seg: RoadCorridorSegment): number {
  const dx = seg.bx - seg.ax
  const dz = seg.bz - seg.az
  const lenSq = dx * dx + dz * dz
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / lenSq)) : 0
  const px = seg.ax + t * dx
  const pz = seg.az + t * dz
  return Math.hypot(x - px, z - pz)
}

/** Classifies the ground at `(x, z)` for footstep sound selection — reuses
 *  the exact signals `dig.ts` (rock/sand) and `biomeColors.ts`/tree-growth
 *  (desert weight) already key off, so "looks like sand/rock" and "sounds
 *  like sand/rock" stay in sync without a second terrain-type system. Sand
 *  and road are checked first so a sandy or desert road still reads as
 *  sand/road, not stone/dirt. */
export function sampleFootstepSurface(chunkManager: ChunkManager, x: number, z: number): FootstepSurface {
  const height = chunkManager.sampleHeight(x, z)
  if (height < chunkManager.waterLevel + sandBandAt(x, z, chunkManager.seed)) return 'sand'

  const nearbyRoads = chunkManager.roadCorridorsNear(x, z, ROAD_QUERY_SIZE)
  for (const segment of nearbyRoads) {
    if (distanceToSegment(x, z, segment) <= segment.halfWidth + ROAD_FEATHER) return 'road'
  }

  if (isRockGround(x, z, chunkManager)) return 'stone'

  const { biome } = chunkManager.sampleTreeEnv(x, z)
  return biome.desert > DESERT_DIRT_THRESHOLD ? 'dirt' : 'grass'
}
