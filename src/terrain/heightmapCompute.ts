import { createNoise2D } from 'simplex-noise'
import { MathUtils } from 'three'
import type { HeightmapParams } from './generateHeightmap'
import { createSeededRandom } from '../world/parseSeed'
import { fbm01 } from './fbm'
import { computeBodyScale, detectWaterBodies } from './waterBodies'

/** Normalized radius (0 center, 1 at edge midpoints) where the guaranteed ocean ring starts. */
const OCEAN_RING_START = 0.95
/** Normalized radius by which submersion is fully guaranteed, regardless of noise. */
const OCEAN_RING_END = 1.02

export type HeightmapData = {
  heights: Float32Array
  /** Pre-clamp heights — the true seabed/lakebed shape hidden under `heights` by the
   *  `waterLevel` floor. Lets swimmers sink toward the actual bottom instead of the
   *  flattened-to-waterLevel mesh. Equal to `heights` on dry land. */
  floorHeights: Float32Array
  biomes: Float32Array
  /** Per-texel wave-amplitude scale for water shading: 0 land/small lake .. 1 ocean. */
  bodyScale: Float32Array
}

/**
 * Pure, environment-agnostic core of heightmap generation — no DOM/window access,
 * so it's safe to run either on the main thread or inside a Web Worker. Single
 * source of truth for the algorithm: both the sync `generateHeightmap` and the
 * worker call this, so they can never drift.
 */
export function computeHeightmapData(params: HeightmapParams): HeightmapData {
  const { size, resolution, seed, heightScale, waterLevel, noiseScale, fbm, biome } = params

  const heightNoise = createNoise2D(createSeededRandom(seed))
  const warp = createNoise2D(createSeededRandom(seed ^ 0x9e3779b9))
  const biomeNoise = createNoise2D(createSeededRandom(seed ^ 0x85ebca6b))

  const heights = new Float32Array(resolution * resolution)
  const floorHeights = new Float32Array(resolution * resolution)
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

      const idx = iz * resolution + ix
      floorHeights[idx] = h

      if (h < waterLevel) h = waterLevel

      const m = fbm01(biomeNoise, wx / biome.noiseScale, wz / biome.noiseScale, biome.fbm)

      heights[idx] = h
      biomes[idx] = m
    }
  }

  const waterBodies = detectWaterBodies(heights, resolution, waterLevel, step)
  const bodyScale = computeBodyScale(waterBodies)

  return { heights, floorHeights, biomes, bodyScale }
}
