/** Experimental cave heightfield spike — the harness surface sampler.
 *
 *  Reuses the *production* analytic terrain seam
 *  (`chunkHeightmap.sampleHeightAt` + `worldConfig.defaultTerrainConfig`),
 *  which is the same pure function `ChunkManager` exposes as
 *  `sampleBaseHeight` and `createCaves()` passes to Cave V2 as
 *  `analyticSurfaceHeight`. No `ChunkManager`, no worker, no terrain
 *  streaming, no `WorldBundle` — one deterministic function call per point.
 *
 *  Harness coordinates stay local (cave near the origin); the sampler adds a
 *  fixed world anchor so the local terrain is a real piece of Seedvale
 *  hillside instead of a hand-drawn cliff.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../../world/caveVolume'
import { defaultTerrainConfig } from '../../config/worldConfig'
import { type RawSampleParams, sampleHeightAt } from '../../terrain/chunkHeightmap'
import { mouthCarveDepth } from '../../world/caves/mouthCarve'

/** World seed the harness terrain is sampled from. Fixed so the spike is
 *  reproducible; `CAVE_HEIGHTFIELD_TERRAIN_ANCHOR` is only valid for it. */
export const CAVE_HEIGHTFIELD_TERRAIN_SEED = 1

/**
 * World-space anchor mapped to harness `(0, 0)` — a real hillside on seed
 * `CAVE_HEIGHTFIELD_TERRAIN_SEED`: the approach descends outward (+Z), the
 * ground rises ~10 m over the 20 m the fixtures run inward (−Z), and there
 * is lateral relief for the bend/branch fixtures. Chosen so the spike can
 * test outdoor-surface ↔ cave-interior conflict with the surface clearly
 * (≈ 8–15 m) above a player deep inside. `caveHeightfieldTerrain.test.ts`
 * asserts those properties, so a terrain-generation change fails loudly
 * instead of silently flattening the harness.
 */
export const CAVE_HEIGHTFIELD_TERRAIN_ANCHOR = { x: -1638, z: -918 } as const

/** Terrain resolution only selects grid density, which the analytic
 *  point sampler does not use — any valid value gives the same heights. */
const TERRAIN_RESOLUTION = 65

function terrainParams(): RawSampleParams {
  const terrain = defaultTerrainConfig(TERRAIN_RESOLUTION)
  return {
    seed: CAVE_HEIGHTFIELD_TERRAIN_SEED,
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

const PARAMS = terrainParams()

/**
 * Analytic production terrain height at harness `(x, z)`. This is the
 * spike's equivalent of `createCaves()`'s `analyticSurfaceHeight`
 * (`ChunkManager.sampleBaseHeight`) — road/clearing/river corridors and
 * runtime terrain modifications are excluded by construction, exactly as
 * they are for production cave topology, SDF clipping and column indexing.
 *
 * Both spike representations (heightfield and SDF) must be built against
 * this one function so the comparison is on identical surface input.
 *
 * @domain world-terrain
 */
export function sampleCaveHeightfieldBaseSurface(x: number, z: number): number {
  return sampleHeightAt(
    x + CAVE_HEIGHTFIELD_TERRAIN_ANCHOR.x,
    z + CAVE_HEIGHTFIELD_TERRAIN_ANCHOR.z,
    PARAMS,
  )
}

/**
 * Walkable / rendered surface: the analytic base minus the production mouth
 * recess (`mouthCarveDepth`, the same discs `createCaves()` feeds to
 * `ChunkManager.modifyTerrain`). Production keeps the same split — cave
 * space is clipped against the *base* height while the player walks the
 * carved heightmap — so the doorway pit is real ground here too.
 *
 * @domain world-terrain
 */
export function sampleCaveHeightfieldWalkSurface(
  x: number,
  z: number,
  entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'> & { width?: number },
): number {
  return sampleCaveHeightfieldBaseSurface(x, z) - mouthCarveDepth(x, z, entrance)
}
