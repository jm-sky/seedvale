import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import { MathUtils } from 'three'
import { LinearSpline } from '../math/linearSpline'
import { createSeededRandom } from '../world/parseSeed'
import { fbm01, type FbmParams } from './fbm'
import { computeBodyScale, detectWaterBodies } from './waterBodies'
import { worleyRidge } from './worleyNoise'

export type RegionParams = {
  /** Very-low-frequency noise scale (world units) classifying ocean → coast →
   *  lowland → highland. Independent of `mountainScale` — see chunkHeightmap.ts
   *  module docs for why the two axes are decorrelated. */
  continentScale: number
  continentFbm: FbmParams
  /** Very-low-frequency noise scale gating where mountain ranges are allowed. */
  mountainScale: number
  mountainFbm: FbmParams
  /** Mountainness threshold above which ridges start blending in, and the width
   *  of that blend band. */
  mountainThreshold: number
  mountainThresholdWidth: number
  /** Worley cell size (world units) — the wavelength of ridge spacing. */
  worleyCellSize: number
  /** How sharp/narrow the ridge crest is. */
  ridgeSharpness: number
  /** Overall mountain height contribution multiplier. */
  mountainGain: number
  /** Continentalness below which an area is unambiguously ocean. */
  oceanThreshold: number
  /** Continentalness above which an area is unambiguously dry land. */
  coastThreshold: number
  /** Detail-noise amplitude multiplier deep in the ocean (< 1 suppresses stray
   *  islands poking through the forced ocean floor). */
  oceanDetailWeight: number
}

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
  region: RegionParams
  /** True for chunks pinned as the settlement's home block — skips per-chunk
   *  vegetation generation there, since the settlement plants its own bespoke
   *  forest layout (`src/settlement/props.ts`). */
  isHomeChunk: boolean
  /** Species counts for per-chunk vegetation placement (`chunkVegetation.ts`) —
   *  passed as plain numbers rather than importing `TREE_SPECS`/`BUSH_SPECS` from
   *  `props.ts` there, so worker-side code never pulls in THREE mesh-building/
   *  GLTF-loader code it will never run. */
  vegetationSpeciesCount: { tree: number; bush: number }
}

export type RawSampleParams = Omit<
  ChunkTileParams,
  | 'cx'
  | 'cz'
  | 'chunkSize'
  | 'resolution'
  | 'isHomeChunk'
  | 'vegetationSpeciesCount'
>

export type ChunkTileData = {
  /** Apron-inclusive: (resolution + 2) texels per edge. */
  heights: Float32Array
  floorHeights: Float32Array
  biomes: Float32Array
  bodyScale: Float32Array
  /** Macro region axis (0 deep ocean .. 1 extreme highland) — see `RegionParams`. */
  continentalness: Float32Array
  /** 0 (no ridge) .. 1 (ridge crest), already gated by mountainness/land-ness. */
  mountainRidge: Float32Array
}

type NoiseHandles = {
  height: NoiseFunction2D
  warp: NoiseFunction2D
  biome: NoiseFunction2D
  continent: NoiseFunction2D
  mountain: NoiseFunction2D
}

/** Piecewise-linear continentalness → height bias, in the same normalized units as
 *  the detail FBM's `n` (roughly [0,1] before this bias). Built once at module scope. */
const continentBiasSpline = new LinearSpline<number>((t, a, b) => a + (b - a) * t)
continentBiasSpline.addPoint(0.0, -0.9)
continentBiasSpline.addPoint(0.3, -0.55)
continentBiasSpline.addPoint(0.42, -0.15)
continentBiasSpline.addPoint(0.5, 0.0)
continentBiasSpline.addPoint(0.65, 0.15)
continentBiasSpline.addPoint(0.85, 0.35)
continentBiasSpline.addPoint(1.0, 0.5)

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
      continent: createNoise2D(createSeededRandom(seed ^ 0xc2b2ae35)),
      mountain: createNoise2D(createSeededRandom(seed ^ 0x27d4eb2f)),
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
): { h: number; floorH: number; m: number; continentalness: number; mountainRidge: number } {
  const { heightScale, waterLevel, noiseScale, fbm, biome, region } = params

  // Macro region axes — decorrelated so mountain ranges can cut across continents
  // at any elevation above sea level, instead of always coinciding with the
  // highest band of a single field (which reads as concentric "bullseye" rings).
  const c = fbm01(
    noise.continent,
    wx / region.continentScale,
    wz / region.continentScale,
    region.continentFbm,
  )
  const mt = fbm01(
    noise.mountain,
    wx / region.mountainScale,
    wz / region.mountainScale,
    region.mountainFbm,
  )

  const regionBias = continentBiasSpline.get(c)
  const landWeight = MathUtils.smoothstep(c, region.oceanThreshold, region.coastThreshold)
  // Suppresses local detail noise deep in the ocean so stray high-frequency bumps
  // can't poke islands up through the intentionally forced ocean floor.
  const detailWeight = MathUtils.lerp(region.oceanDetailWeight, 1, landWeight)

  // Low-frequency reuse of the warp field (much lower freq/higher amplitude than
  // the detail-noise warp below) — breaks up the geometrically regular look of
  // raw Voronoi cell boundaries so ridge lines wiggle naturally.
  const wxWorleyWarp = wx + noise.warp(wx * 0.0035, wz * 0.0035) * 90
  const wzWorleyWarp = wz + noise.warp(wx * 0.0035 + 40, wz * 0.0035 + 40) * 90
  const { ridge01 } = worleyRidge(
    wxWorleyWarp,
    wzWorleyWarp,
    region.worleyCellSize,
    params.seed,
    region.ridgeSharpness,
  )
  const mountainGate =
    MathUtils.smoothstep(
      mt,
      region.mountainThreshold,
      region.mountainThreshold + region.mountainThresholdWidth,
    ) * landWeight // no ridges below sea/coast
  const mountainRidge = ridge01 * mountainGate

  const wxw = wx + noise.warp(wx * 0.02, wz * 0.02) * 12
  const wzw = wz + noise.warp(wx * 0.02 + 40, wz * 0.02 + 40) * 12
  const n = fbm01(noise.height, wxw / noiseScale, wzw / noiseScale, fbm)

  const nCombined = n * detailWeight + regionBias + mountainRidge * region.mountainGain
  const floorH = nCombined * heightScale
  const h = floorH < waterLevel ? waterLevel : floorH

  const m = fbm01(noise.biome, wx / biome.noiseScale, wz / biome.noiseScale, biome.fbm)

  return { h, floorH, m, continentalness: c, mountainRidge }
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

export function sampleContinentalnessAt(
  worldX: number,
  worldZ: number,
  params: RawSampleParams,
): number {
  return sampleRawTexel(worldX, worldZ, noiseHandlesFor(params.seed), params).continentalness
}

export function sampleMountainRidgeAt(
  worldX: number,
  worldZ: number,
  params: RawSampleParams,
): number {
  return sampleRawTexel(worldX, worldZ, noiseHandlesFor(params.seed), params).mountainRidge
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
 * ocean ring, no radial falloff): the macro region axes (continentalness/mountainness)
 * are themselves plain world-space noise, so large-scale structure (oceans, highlands,
 * mountain ranges) forms without any privileged center or edge.
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
  const continentalness = new Float32Array(apronRes * apronRes)
  const mountainRidge = new Float32Array(apronRes * apronRes)

  for (let iz = 0; iz < apronRes; iz++) {
    for (let ix = 0; ix < apronRes; ix++) {
      const wx = originX + ix * step
      const wz = originZ + iz * step
      const sample = sampleRawTexel(wx, wz, noise, params)
      const idx = iz * apronRes + ix
      heights[idx] = sample.h
      floorHeights[idx] = sample.floorH
      biomes[idx] = sample.m
      continentalness[idx] = sample.continentalness
      mountainRidge[idx] = sample.mountainRidge
    }
  }

  const waterBodies = detectWaterBodies(heights, apronRes, waterLevel, step)
  const bodyScale = computeBodyScale(waterBodies)

  return { heights, floorHeights, biomes, bodyScale, continentalness, mountainRidge }
}
