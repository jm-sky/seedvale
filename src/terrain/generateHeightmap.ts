import { createNoise2D } from 'simplex-noise'
import type { WorldConfig } from '../config/worldConfig'
import { createSeededRandom } from '../world/parseSeed'
import { fbm01, type FbmParams } from './fbm'

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
  biomes: Float32Array
  sample: (worldX: number, worldZ: number) => number
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

export function generateHeightmap(params: HeightmapParams): Heightmap {
  const {
    size,
    resolution,
    seed,
    heightScale,
    waterLevel,
    noiseScale,
    fbm,
    biome,
  } = params

  const heightNoise = createNoise2D(createSeededRandom(seed))
  const warp = createNoise2D(createSeededRandom(seed ^ 0x9e3779b9))
  const biomeNoise = createNoise2D(createSeededRandom(seed ^ 0x85ebca6b))

  const heights = new Float32Array(resolution * resolution)
  const biomes = new Float32Array(resolution * resolution)
  const half = size / 2
  const step = size / (resolution - 1)

  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      const wx = -half + ix * step
      const wz = -half + iz * step

      const wxw = wx + warp(wx * 0.02, wz * 0.02) * 12
      const wzw = wz + warp(wx * 0.02 + 40, wz * 0.02 + 40) * 12

      const n = fbm01(heightNoise, wxw / noiseScale, wzw / noiseScale, fbm)

      const nx = wx / half
      const nz = wz / half
      const falloff =
        1 - Math.min(1, Math.sqrt(nx * nx + nz * nz) ** 1.35 * 0.88)

      let h = n * heightScale * (0.25 + 0.75 * falloff)
      if (h < waterLevel) h = waterLevel

      const m = fbm01(
        biomeNoise,
        wx / biome.noiseScale,
        wz / biome.noiseScale,
        biome.fbm,
      )

      const idx = iz * resolution + ix
      heights[idx] = h
      biomes[idx] = m
    }
  }

  return {
    params,
    heights,
    biomes,
    sample: (x, z) => sampleGrid(heights, resolution, half, step, x, z),
    sampleBiome: (x, z) => sampleGrid(biomes, resolution, half, step, x, z),
  }
}
