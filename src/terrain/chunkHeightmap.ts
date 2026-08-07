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
  /** Very-low-frequency noise scale (world units) classifying dry ↔ humid land
   *  into desert/forest/swamp *regions* — decorrelated from `continentScale`/
   *  `mountainScale` (own noise handle), so deserts/swamps can sit anywhere on
   *  land regardless of the height/mountain bands. Independent of the existing
   *  fine-grained `biome.noiseScale` field, which stays a small-scale detail/
   *  dither on top of whichever region this axis picks. */
  moistureRegionScale: number
  moistureRegionFbm: FbmParams
  /** Moisture-region value below which land reads as desert; ramps in over
   *  `desertThresholdWidth`. */
  desertThreshold: number
  desertThresholdWidth: number
  /** Moisture-region value above which land reads as swamp; ramps in over
   *  `swampThresholdWidth`. Swamp is additionally gated to low altitude near
   *  `waterLevel` — see `biomeRegions.ts`. */
  swampThreshold: number
  swampThresholdWidth: number
  /** Tunables for road/path corridor width + strength — see `roadNetwork.ts`. */
  roadNetwork: RoadNetworkParams
}

export type RoadNetworkParams = {
  /** Corridor half-width (world units) for inter-settlement roads. */
  roadHalfWidth: number
  /** How strongly terrain height blends toward the route's smoothed profile
   *  inside a road corridor (0 = untouched, 1 = fully replaced). */
  roadHeightStrength: number
  /** How strongly the ground color blends toward `DIRT` inside a road corridor. */
  roadTintStrength: number
  /** Corridor half-width (world units) for settlement↔minor-location paths —
   *  narrower than a road, barely reshapes the terrain. */
  pathHalfWidth: number
  pathHeightStrength: number
  pathTintStrength: number
  /** Arc-length window (world units) for the moving-average smoothing pass
   *  applied to a route's raw elevation profile. */
  smoothingWindow: number
  /** Max nearest-neighbor settlements a settlement connects a road to. */
  maxNeighborRoads: number
  /** Max radius (world units) searched outward from a settlement for a
   *  coastline to place its dock/pier minor location. */
  dockSearchRadius: number
}

/** A single road/path segment's terrain-shaping data, already resolved to
 *  world-space endpoints + strengths — plain numeric, worker-safe. Computed
 *  main-thread-only by `settlement/roadNetwork.ts` (routing/settlement-graph
 *  logic doesn't belong in the worker-safe terrain module), passed in as
 *  per-chunk input data like `isHomeChunk`. */
export type RoadCorridorSegment = {
  ax: number
  az: number
  /** Smoothed route height at endpoint `a` (already blended, not raw terrain). */
  ah: number
  bx: number
  bz: number
  bh: number
  halfWidth: number
  heightStrength: number
  tintStrength: number
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
   *  passed as plain numbers rather than importing `TREE_SPECS`/`BUSH_SPECS`/
   *  `CACTUS_SPECS`/`REED_SPECS` from `props.ts` there, so worker-side code
   *  never pulls in THREE mesh-building/GLTF-loader code it will never run. */
  vegetationSpeciesCount: { tree: number; bush: number; cactus: number; reed: number }
  /** Road/path corridors near this chunk — see `RoadCorridorSegment`. Usually
   *  0–6 entries. Excluded from `RawSampleParams`: the analytic samplers below
   *  (`sampleHeightAt` etc.) are what `roadNetwork.ts` itself uses to find
   *  routes/dock sites in the first place, so they must stay road-agnostic to
   *  avoid a circular dependency (a route smoothing based on a height function
   *  that already depends on that same route). Road smoothing is applied only
   *  in `computeChunkTile`'s tile-building loop, layered on top of the raw
   *  analytic height. */
  roadSegments: RoadCorridorSegment[]
}

export type RawSampleParams = Omit<
  ChunkTileParams,
  | 'cx'
  | 'cz'
  | 'chunkSize'
  | 'resolution'
  | 'isHomeChunk'
  | 'vegetationSpeciesCount'
  | 'roadSegments'
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
  /** Macro dry↔humid axis (0 arid .. 1 humid) driving desert/forest/swamp
   *  region classification — see `biomeRegions.ts`. Independent of `biomes`
   *  (fine-grained detail moisture, unchanged). */
  moistureRegion: Float32Array
  /** 0 (no road nearby) .. 1 (road/path center) — corridor falloff × tint
   *  strength of the nearest/strongest `roadSegments` entry. Height is baked
   *  directly into `heights`/`floorHeights` instead; this grid exists only for
   *  `applyRoadTint` (`biomeColors.ts`) and vegetation/grass rejection. */
  roadTint: Float32Array
}

type NoiseHandles = {
  height: NoiseFunction2D
  warp: NoiseFunction2D
  biome: NoiseFunction2D
  continent: NoiseFunction2D
  mountain: NoiseFunction2D
  moistureRegion: NoiseFunction2D
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
      moistureRegion: createNoise2D(createSeededRandom(seed ^ 0x1b873593)),
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
): {
  h: number
  floorH: number
  m: number
  continentalness: number
  mountainRidge: number
  moistureRegion: number
} {
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

  // Macro dry↔humid axis — own noise/scale, so desert/swamp regions don't
  // coincide with continentalness bands (a "wet coast, dry inland" pattern
  // reads as one bullseye, same reasoning as the continent/mountain split above).
  const moistureRegion = fbm01(
    noise.moistureRegion,
    wx / region.moistureRegionScale,
    wz / region.moistureRegionScale,
    region.moistureRegionFbm,
  )

  return { h, floorH, m, continentalness: c, mountainRidge, moistureRegion }
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

export function sampleMoistureRegionAt(
  worldX: number,
  worldZ: number,
  params: RawSampleParams,
): number {
  return sampleRawTexel(worldX, worldZ, noiseHandlesFor(params.seed), params).moistureRegion
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

/** Perpendicular-distance-squared from `(px,pz)` to segment `(ax,az)-(bx,bz)`,
 *  plus the clamped [0,1] projection fraction `t` along it. */
function projectOntoSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { distSq: number; t: number } {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-6) {
    const ddx = px - ax
    const ddz = pz - az
    return { distSq: ddx * ddx + ddz * ddz, t: 0 }
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq))
  const cx = ax + dx * t
  const cz = az + dz * t
  const ddx = px - cx
  const ddz = pz - cz
  return { distSq: ddx * ddx + ddz * ddz, t }
}

/** Fraction of a corridor's `halfWidth` over which the road/path is at full
 *  strength before tapering off — keeps the edge soft instead of a hard cutoff,
 *  same idea as `SEABED_BLEND`/`LAND_BLEND` in `biomeColors.ts`. */
const ROAD_INNER_FRACTION = 0.6

/** Blends a texel's `floorH` toward the nearest/strongest road corridor's
 *  smoothed route profile, and returns the tint strength for `applyRoadTint`.
 *  Segments are plain per-chunk input data (`ChunkTileParams.roadSegments`) —
 *  see its doc comment for why this lives here and not in `sampleRawTexel`. */
function applyRoadCorridor(
  wx: number,
  wz: number,
  floorH: number,
  segments: readonly RoadCorridorSegment[],
): { floorH: number; tint: number } {
  let bestFalloff = 0
  let bestTargetH = 0
  let bestHeightStrength = 0
  let bestTint = 0

  for (const seg of segments) {
    const { distSq, t } = projectOntoSegment(wx, wz, seg.ax, seg.az, seg.bx, seg.bz)
    if (distSq >= seg.halfWidth * seg.halfWidth) continue
    const dist = Math.sqrt(distSq)
    const inner = seg.halfWidth * ROAD_INNER_FRACTION
    const falloff = 1 - MathUtils.smoothstep(dist, inner, seg.halfWidth)
    if (falloff > bestFalloff) {
      bestFalloff = falloff
      bestTargetH = MathUtils.lerp(seg.ah, seg.bh, t)
      bestHeightStrength = seg.heightStrength
    }
    const tint = falloff * seg.tintStrength
    if (tint > bestTint) bestTint = tint
  }

  if (bestFalloff <= 0) return { floorH, tint: 0 }
  return {
    floorH: MathUtils.lerp(floorH, bestTargetH, bestFalloff * bestHeightStrength),
    tint: bestTint,
  }
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
  const moistureRegion = new Float32Array(apronRes * apronRes)
  const roadTint = new Float32Array(apronRes * apronRes)

  for (let iz = 0; iz < apronRes; iz++) {
    for (let ix = 0; ix < apronRes; ix++) {
      const wx = originX + ix * step
      const wz = originZ + iz * step
      const sample = sampleRawTexel(wx, wz, noise, params)
      const idx = iz * apronRes + ix

      let floorH = sample.floorH
      let tint = 0
      if (params.roadSegments.length > 0) {
        const road = applyRoadCorridor(wx, wz, floorH, params.roadSegments)
        floorH = road.floorH
        tint = road.tint
      }

      heights[idx] = floorH < waterLevel ? waterLevel : floorH
      floorHeights[idx] = floorH
      biomes[idx] = sample.m
      continentalness[idx] = sample.continentalness
      mountainRidge[idx] = sample.mountainRidge
      moistureRegion[idx] = sample.moistureRegion
      roadTint[idx] = tint
    }
  }

  const waterBodies = detectWaterBodies(heights, apronRes, waterLevel, step)
  const bodyScale = computeBodyScale(waterBodies)

  return {
    heights,
    floorHeights,
    biomes,
    bodyScale,
    continentalness,
    mountainRidge,
    moistureRegion,
    roadTint,
  }
}
