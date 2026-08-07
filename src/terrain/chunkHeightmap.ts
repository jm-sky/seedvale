import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import { createSeededRandom } from '../world/parseSeed'
import { fbm01, type FbmParams } from './fbm'
import { computeBodyScale, detectWaterBodies } from './waterBodies'

export type ChunkTileParams = {
  cx: number
  cz: number
  chunkSize: number
  /** Core texels per edge (excludes the 1-texel apron used for seam-safe normals). */
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

export type RawSampleParams = Omit<ChunkTileParams, 'cx' | 'cz' | 'chunkSize' | 'resolution'>

export type ChunkTileData = {
  /** Apron-inclusive: (resolution + 2) texels per edge. */
  heights: Float32Array
  floorHeights: Float32Array
  biomes: Float32Array
  bodyScale: Float32Array
}

type NoiseHandles = {
  height: NoiseFunction2D
  warp: NoiseFunction2D
  biome: NoiseFunction2D
}

/** One global seed for the whole world — noise handles are built once per seed and
 *  reused across every chunk, so two chunks evaluating the same world point produce
 *  bit-identical results (the basis for crack-free seams). Never derive a per-chunk seed. */
const noiseCache = new Map<number, NoiseHandles>()
function noiseHandlesFor(seed: number): NoiseHandles {
  let handles = noiseCache.get(seed)
  if (!handles) {
    handles = {
      height: createNoise2D(createSeededRandom(seed)),
      warp: createNoise2D(createSeededRandom(seed ^ 0x9e3779b9)),
      biome: createNoise2D(createSeededRandom(seed ^ 0x85ebca6b)),
    }
    noiseCache.set(seed, handles)
  }
  return handles
}

function sampleRawTexel(
  wx: number,
  wz: number,
  noise: NoiseHandles,
  params: RawSampleParams,
): { h: number; floorH: number; m: number } {
  const { heightScale, waterLevel, noiseScale, fbm, biome } = params

  const wxw = wx + noise.warp(wx * 0.02, wz * 0.02) * 12
  const wzw = wz + noise.warp(wx * 0.02 + 40, wz * 0.02 + 40) * 12
  const n = fbm01(noise.height, wxw / noiseScale, wzw / noiseScale, fbm)

  const floorH = n * heightScale
  const h = floorH < waterLevel ? waterLevel : floorH

  const m = fbm01(noise.biome, wx / biome.noiseScale, wz / biome.noiseScale, biome.fbm)

  return { h, floorH, m }
}

/** Exact analytic height at a single world point — no grid, no worker round-trip.
 *  Used both as the tile-builder's inner loop and as the chunk manager's fallback for
 *  points in a not-yet-ready chunk. */
export function sampleHeightAt(worldX: number, worldZ: number, params: RawSampleParams): number {
  return sampleRawTexel(worldX, worldZ, noiseHandlesFor(params.seed), params).h
}

export function sampleFloorAt(worldX: number, worldZ: number, params: RawSampleParams): number {
  return sampleRawTexel(worldX, worldZ, noiseHandlesFor(params.seed), params).floorH
}

export function sampleBiomeAt(worldX: number, worldZ: number, params: RawSampleParams): number {
  return sampleRawTexel(worldX, worldZ, noiseHandlesFor(params.seed), params).m
}

/** World-space origin (min corner) and step of a chunk's apron-inclusive grid. */
export function apronOriginWorld(
  cx: number,
  cz: number,
  chunkSize: number,
  resolution: number,
): { x: number; z: number; step: number; apronRes: number } {
  const step = chunkSize / (resolution - 1)
  return {
    x: cx * chunkSize - chunkSize / 2 - step,
    z: cz * chunkSize - chunkSize / 2 - step,
    step,
    apronRes: resolution + 2,
  }
}

/** Bilinear sample over an apron-inclusive grid — same math as the legacy whole-map
 *  `sampleGrid`, generalized to an arbitrary origin (world- or chunk-local-space). */
export function sampleApronGrid(
  grid: Float32Array,
  apronRes: number,
  originX: number,
  originZ: number,
  step: number,
  x: number,
  z: number,
): number {
  const fx = (x - originX) / step
  const fz = (z - originZ) / step
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const x1 = x0 + 1
  const z1 = z0 + 1
  const tx = fx - x0
  const tz = fz - z0

  const clampi = (v: number) => Math.max(0, Math.min(apronRes - 1, v))

  const h00 = grid[clampi(z0) * apronRes + clampi(x0)]!
  const h10 = grid[clampi(z0) * apronRes + clampi(x1)]!
  const h01 = grid[clampi(z1) * apronRes + clampi(x0)]!
  const h11 = grid[clampi(z1) * apronRes + clampi(x1)]!

  const hx0 = h00 * (1 - tx) + h10 * tx
  const hx1 = h01 * (1 - tx) + h11 * tx
  return hx0 * (1 - tz) + hx1 * tz
}

/** Extracts the core (resolution × resolution) sub-grid from an apron-inclusive one. */
export function extractCoreGrid(
  apronGrid: Float32Array,
  apronRes: number,
  resolution: number,
): Float32Array {
  const out = new Float32Array(resolution * resolution)
  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      out[iz * resolution + ix] = apronGrid[(iz + 1) * apronRes + (ix + 1)]!
    }
  }
  return out
}

/**
 * Computes one chunk's apron-inclusive heightmap tile. Pure, environment-agnostic —
 * safe on the main thread or inside a worker. No map-edge concept (no guaranteed
 * ocean ring, no radial falloff): height is plain `noise * heightScale` everywhere,
 * since an open-ended chunked world has no privileged center or edge.
 */
export function computeChunkTile(params: ChunkTileParams): ChunkTileData {
  const { cx, cz, chunkSize, resolution, waterLevel } = params
  const noise = noiseHandlesFor(params.seed)
  const { x: originX, z: originZ, step, apronRes } = apronOriginWorld(
    cx,
    cz,
    chunkSize,
    resolution,
  )

  const heights = new Float32Array(apronRes * apronRes)
  const floorHeights = new Float32Array(apronRes * apronRes)
  const biomes = new Float32Array(apronRes * apronRes)

  for (let iz = 0; iz < apronRes; iz++) {
    for (let ix = 0; ix < apronRes; ix++) {
      const wx = originX + ix * step
      const wz = originZ + iz * step
      const { h, floorH, m } = sampleRawTexel(wx, wz, noise, params)
      const idx = iz * apronRes + ix
      heights[idx] = h
      floorHeights[idx] = floorH
      biomes[idx] = m
    }
  }

  const waterBodies = detectWaterBodies(heights, apronRes, waterLevel, step)
  const bodyScale = computeBodyScale(waterBodies)

  return { heights, floorHeights, biomes, bodyScale }
}
