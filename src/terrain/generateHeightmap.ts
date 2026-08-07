import { createNoise2D } from 'simplex-noise'
import { MathUtils } from 'three'
import type { WorldConfig } from '../config/worldConfig'
import { createSeededRandom } from '../world/parseSeed'
import { fbm01, type FbmParams } from './fbm'
import { computeBodyScale, detectWaterBodies } from './waterBodies'

/** Normalized radius (0 center, 1 at edge midpoints) where the guaranteed ocean ring starts. */
const OCEAN_RING_START = 0.95
/** Normalized radius by which submersion is fully guaranteed, regardless of noise. */
const OCEAN_RING_END = 1.02

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
  /** Per-texel wave-amplitude scale for water shading: 0 land/small lake .. 1 ocean. */
  bodyScale: Float32Array
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
      const edge = Math.sqrt(nx * nx + nz * nz)
      const falloff = 1 - Math.min(1, edge ** 1.35 * 0.88)

      let h = n * heightScale * (0.25 + 0.75 * falloff)

      // Guaranteed ocean ring: force height toward a (virtual, far-below-waterLevel)
      // floor as we approach the map edge, independent of noise, so a contiguous sea
      // forms for every seed. Blending `h` toward a floor only slightly below
      // waterLevel wouldn't guarantee anything — noise can push the raw height up to
      // heightScale, so the blend needs a floor steep enough that it crosses below
      // waterLevel early in the ring band rather than only at ringT=1. The exact
      // floor value has no visual meaning beyond "below waterLevel": the clamp right
      // below flattens every submerged cell to exactly waterLevel anyway.
      const ringT = MathUtils.smoothstep(edge, OCEAN_RING_START, OCEAN_RING_END)
      if (ringT > 0) {
        const virtualOceanFloor = waterLevel - heightScale * 3
        h = MathUtils.lerp(h, virtualOceanFloor, ringT)
      }

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

  const waterBodies = detectWaterBodies(heights, resolution, waterLevel, step)
  const bodyScale = computeBodyScale(waterBodies)

  return {
    params,
    heights,
    biomes,
    bodyScale,
    sample: (x, z) => sampleGrid(heights, resolution, half, step, x, z),
    sampleBiome: (x, z) => sampleGrid(biomes, resolution, half, step, x, z),
  }
}
