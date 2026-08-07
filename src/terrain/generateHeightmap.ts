import type { WorldConfig } from '../config/worldConfig'
import type { FbmParams } from './fbm'
import { computeHeightmapData, type HeightmapData } from './heightmapCompute'

export type HeightmapParams = {
  size: number
  resolution: number
  seed: number
  heightScale: number
  waterLevel: number
  noiseScale: number
  fbm: FbmParams
  biome: {
    noiseScale: number
    fbm: FbmParams
  }
}

export type Heightmap = {
  params: HeightmapParams
  heights: Float32Array
  /** Pre-clamp heights — the true seabed/lakebed shape hidden under `heights` by the
   *  `waterLevel` floor. Lets swimmers sink toward the actual bottom instead of the
   *  flattened-to-waterLevel mesh. Equal to `heights` on dry land. */
  floorHeights: Float32Array
  biomes: Float32Array
  /** Per-texel wave-amplitude scale for water shading: 0 land/small lake .. 1 ocean. */
  bodyScale: Float32Array
  sample: (worldX: number, worldZ: number) => number
  sampleFloor: (worldX: number, worldZ: number) => number
  sampleBiome: (worldX: number, worldZ: number) => number
}

export function heightmapParamsFromConfig(config: WorldConfig): HeightmapParams {
  const t = config.terrain
  return {
    size: t.size,
    resolution: t.resolution,
    seed: config.seed,
    heightScale: t.heightScale,
    waterLevel: t.waterLevel,
    noiseScale: t.noiseScale,
    fbm: { ...t.fbm },
    biome: {
      noiseScale: t.biome.noiseScale,
      fbm: { ...t.biome.fbm },
    },
  }
}

function sampleGrid(
  grid: Float32Array,
  resolution: number,
  half: number,
  step: number,
  worldX: number,
  worldZ: number,
): number {
  const fx = (worldX + half) / step
  const fz = (worldZ + half) / step
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const x1 = x0 + 1
  const z1 = z0 + 1
  const tx = fx - x0
  const tz = fz - z0

  const clampi = (v: number) => Math.max(0, Math.min(resolution - 1, v))

  const h00 = grid[clampi(z0) * resolution + clampi(x0)]!
  const h10 = grid[clampi(z0) * resolution + clampi(x1)]!
  const h01 = grid[clampi(z1) * resolution + clampi(x0)]!
  const h11 = grid[clampi(z1) * resolution + clampi(x1)]!

  const hx0 = h00 * (1 - tx) + h10 * tx
  const hx1 = h01 * (1 - tx) + h11 * tx
  return hx0 * (1 - tz) + hx1 * tz
}

/** Reconstructs a `Heightmap` (incl. `sample*` closures) from raw arrays, whether
 *  they came from the synchronous compute below or a worker's transferred result. */
export function buildHeightmapFromData(
  params: HeightmapParams,
  data: HeightmapData,
): Heightmap {
  const { size, resolution } = params
  const half = size / 2
  const step = size / (resolution - 1)
  const { heights, floorHeights, biomes, bodyScale } = data
  return {
    params,
    heights,
    floorHeights,
    biomes,
    bodyScale,
    sample: (x, z) => sampleGrid(heights, resolution, half, step, x, z),
    sampleFloor: (x, z) => sampleGrid(floorHeights, resolution, half, step, x, z),
    sampleBiome: (x, z) => sampleGrid(biomes, resolution, half, step, x, z),
  }
}

export function generateHeightmap(params: HeightmapParams): Heightmap {
  return buildHeightmapFromData(params, computeHeightmapData(params))
}
