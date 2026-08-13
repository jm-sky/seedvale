import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import { createSeededRandom } from '../world/parseSeed'
import { ROCK_SLOPE_FULL, sandBandAt } from './biomeColors'
import { biomeWeightsAt } from './biomeRegions'
import { apronOriginWorld, type RegionParams, sampleApronGrid } from './chunkHeightmap'
import { fbm01, type FbmParams } from './fbm'

/**
 * Pure, worker-safe grass placement generation — split out of `grass.ts`
 * (plan 086) so the same code can run on the main thread or inside
 * `chunkHeightmap.worker.ts`. `grass.ts` remains the presentation layer:
 * it owns the shared blade geometry/material and turns `GrassChunkData`
 * into `THREE.InstancedMesh`es.
 */

export type GrassSpeciesId = 'tri' | 'grain' | 'herb' | 'filler'

/** Canonical bucket iteration order — kept stable so mesh insertion order
 *  (and therefore render/sort order) doesn't change across refactors. */
export const GRASS_SPECIES_ORDER: readonly GrassSpeciesId[] = ['tri', 'grain', 'herb', 'filler']

/** Input grids — the subset of a chunk tile's apron-inclusive fields that
 *  grass placement actually reads. */
export type GrassTileGrids = {
  heights: Float32Array
  biomes: Float32Array
  roadTint: Float32Array
  mountainRidge: Float32Array
  moistureRegion: Float32Array
}

export type GrassComputeParams = {
  cx: number
  cz: number
  chunkSize: number
  resolution: number
  waterLevel: number
  heightScale: number
  seed: number
  /** Raw position candidates rolled before eligibility/density rejection —
   *  the GUI-exposed "density" knob (`config.terrain.grass.density`). */
  candidatesPerChunk: number
  region: RegionParams
}

export type GrassBucketData = {
  count: number
  matrices: Float32Array // count * 16
  phases: Float32Array // count
  baseColors: Float32Array // count * 3
  tipColors: Float32Array // count * 3
  windFactors: Float32Array // count
}

export type GrassChunkData = Partial<Record<GrassSpeciesId, GrassBucketData>>

const SLOPE_SAMPLE_STEP = 1.2
/** Altitude (fraction of `heightScale` above `waterLevel`) above which grass stops —
 *  lower than vegetation's treeline since grass reads oddly climbing into bare rock. */
const TREELINE_ALTITUDE = 0.5
/** Fade grass out over the last 40% below the treeline instead of a hard cutoff. */
const TREELINE_FADE_START = TREELINE_ALTITUDE * 0.6
/** Mountain ridge where foothill grass starts thinning (smoothstep low). */
const MOUNTAIN_RIDGE_FADE_START = 0.05
/** Mountain ridge where grass density reaches ~0 (smoothstep high). */
const MOUNTAIN_RIDGE_FADE_END = 0.5
/** Reject / thin grass inside road/path corridors (`tile.roadTint`). Soft
 *  fade lets sparse blades into the dirt edge so the strip isn't a bald cut. */
const ROAD_TINT_FADE_START = 0.04
const ROAD_TINT_FADE_END = 0.38

/** Extra short ground-cover blades (near-camera only via LOD). Fraction of the
 *  main `candidatesPerChunk` budget — processed once at chunk build, drawn
 *  only when the player is close (issue 023). */
const FILLER_CANDIDATE_RATIO = 0.28
const FILLER_HEIGHT_MIN = 0.045
const FILLER_HEIGHT_MAX = 0.13
const FILLER_WIDTH_MIN = 0.04
const FILLER_WIDTH_MAX = 0.09
const FILLER_WIND_FACTOR = 0.35
const FILLER_DARKEN = 0.88

/** Small upward bias on the blade base — the sampled height is bilinearly
 *  interpolated across a heightmap cell while the *rendered* terrain surface is
 *  triangulated (planar per triangle), so on anything but dead-flat ground the two
 *  disagree slightly; an un-lifted blade base can end up a hair below the visible
 *  surface (reads as "grass sunk into the ground"). */
const GROUND_LIFT = 0.05

const ARID_GRASS = new THREE.Color(0x8a8848)
/** Match humid terrain meadow (`biomeColors` ~0x4f9a3e) — was 0x5fb03f + tip×1.3 → neon lime. */
const HUMID_GRASS = new THREE.Color(0x4a8a38)
/** Swamp tint — darker, more olive than even `HUMID_GRASS`. */
const SWAMP_GRASS = new THREE.Color(0x3f5230)

/** Per-vertex gradient along a blade: base stays shaded, tip only slightly
 *  brighter than the tint (not a glowing highlight). */
const BASE_COLOR_SCALE = 0.48
const TIP_COLOR_SCALE = 1.02
/** Tips lose a bit of saturation so they don't read as plastic lime. */
const TIP_SATURATION = 0.82

const SPECIES_PATCH_SCALE = 0.16
const SPECIES_PATCH_FBM: FbmParams = { octaves: 2, persistence: 0.5, lacunarity: 2, exponentiation: 1 }
/** Half-width of the smoothstep transition band around the 0.5 threshold —
 *  candidates inside the band roll herb-vs-grass independently, so patch
 *  edges naturally interleave both species instead of a hard line ("mogą się
 *  przenikać"). */
const SPECIES_BAND_HALF_WIDTH = 0.12
/** Species A sub-mix: tri-cluster vs. grain stalk, "proporcje 3:1". */
const GRAIN_RATIO = 0.25

// Short — herb sits low, close to the ground, rather than standing up like
// the grass blades (see also HERB_CURVE_STRENGTH's outward droop, `grass.ts`).
const HERB_HEIGHT_MIN = 0.04
const HERB_HEIGHT_MAX = 0.11
const HERB_WIDTH_MIN = 0.12
const HERB_WIDTH_MAX = 0.24
const BLADE_HEIGHT_MIN = 0.16
const BLADE_HEIGHT_MAX = 0.52
const BLADE_WIDTH_MIN = 0.06
const BLADE_WIDTH_MAX = 0.16
/** Herb barely reacts to wind (it's low and lies close to the ground) — not
 *  exactly 0 so it doesn't look perfectly frozen next to swaying grass. */
const HERB_WIND_FACTOR = 0.06
const GRASS_WIND_FACTOR = 1
/** Darkens the biome-lerped tint for herb instances — reads as a shaded
 *  ground-cover plant next to the brighter grass around it. */
const HERB_DARKEN = 0.72

/** Small extra per-instance variety beyond height/width/rotation: a slight hue/
 *  saturation/lightness nudge on top of the biome-lerped tint, and static tilt
 *  off vertical (independent of wind sway) so clumps don't read as clones. */
const HUE_JITTER = 0.07
const SATURATION_JITTER = 0.14
const LIGHTNESS_JITTER = 0.06
const TILT_JITTER_RAD = THREE.MathUtils.degToRad(14)
/** Extra overall size scatter on top of the height/width roll. */
const SIZE_JITTER = 0.22

/** Per-chunk hash so nearby chunks don't get correlated blade layouts (own salt,
 *  decorrelated from `chunkVegetation.ts`'s hash/salt for the same chunk). */
function hashChunk(cx: number, cz: number): number {
  let h = (cx * 668265263 + cz * 374761393) | 0
  h = (h ^ (h >>> 13)) * 2246822519
  return (h ^ (h >>> 16)) >>> 0
}

type InstanceBucket = {
  matrixData: Float32Array
  capacity: number
  count: number
  phases: number[]
  baseColors: number[]
  tipColors: number[]
  windFactors: number[]
}

/** Most chunks survive only a fraction of `candidatesPerChunk` per bucket
 *  (eligibility + density rejection) — pre-allocating every bucket to the
 *  full candidate count wasted ~25 MB of transient `Float32Array`s per chunk
 *  (perf review 005, A4a). Start small and grow instead. */
const MIN_BUCKET_CAPACITY = 1024
const BUCKET_INITIAL_FRACTION = 0.15
const BUCKET_GROWTH_FACTOR = 1.7

function createBucket(candidatesPerChunk: number): InstanceBucket {
  const capacity = Math.max(MIN_BUCKET_CAPACITY, Math.ceil(candidatesPerChunk * BUCKET_INITIAL_FRACTION))
  return {
    matrixData: new Float32Array(capacity * 16),
    capacity,
    count: 0,
    phases: [],
    baseColors: [],
    tipColors: [],
    windFactors: [],
  }
}

/** Grows `bucket.matrixData` (×`BUCKET_GROWTH_FACTOR` per step) if the next
 *  write would overflow it — `phases`/`baseColors`/`tipColors`/`windFactors`
 *  are plain arrays and grow on their own via `push`. */
function ensureBucketCapacity(bucket: InstanceBucket, neededCount: number): void {
  if (neededCount <= bucket.capacity) return
  let capacity = bucket.capacity
  while (capacity < neededCount) capacity = Math.ceil(capacity * BUCKET_GROWTH_FACTOR)
  const grown = new Float32Array(capacity * 16)
  grown.set(bucket.matrixData.subarray(0, bucket.count * 16))
  bucket.matrixData = grown
  bucket.capacity = capacity
}

// Scratch objects reused across every `pushInstance` call in this module —
// safe because generation is synchronous and single-threaded within whatever
// realm this module is loaded into (main thread or worker), same pattern as
// the scratch objects `createGrassSystem()` used to keep in its closure.
const tmpColor = new THREE.Color()
const tmpHsl = { h: 0, s: 0, l: 0 }
const pos = new THREE.Vector3()
const quat = new THREE.Quaternion()
const tiltQuat = new THREE.Quaternion()
const scale = new THREE.Vector3()
const axisY = new THREE.Vector3(0, 1, 0)
const tiltAxis = new THREE.Vector3()
const matrix = new THREE.Matrix4()

function pushInstance(
  bucket: InstanceBucket,
  localX: number,
  localZ: number,
  h: number,
  rotationY: number,
  bladeHeight: number,
  bladeWidth: number,
  tintColor: THREE.Color,
  jitter: number,
  windFactor: number,
  random: () => number,
): void {
  tiltAxis.set(random() * 2 - 1, 0, random() * 2 - 1).normalize()
  quat.setFromAxisAngle(axisY, rotationY)
  tiltQuat.setFromAxisAngle(tiltAxis, random() * TILT_JITTER_RAD)
  quat.multiply(tiltQuat)
  pos.set(localX, h + GROUND_LIFT, localZ)
  const sizeJitter = 1 + (random() * 2 - 1) * SIZE_JITTER
  scale.set(bladeWidth * sizeJitter, bladeHeight * sizeJitter, bladeWidth * sizeJitter)
  matrix.compose(pos, quat, scale)
  ensureBucketCapacity(bucket, bucket.count + 1)
  matrix.toArray(bucket.matrixData, bucket.count * 16)
  bucket.count++

  bucket.phases.push(random() * Math.PI * 2)
  bucket.windFactors.push(windFactor)

  tmpColor.copy(tintColor)
  tmpColor.getHSL(tmpHsl)
  tmpHsl.h = (tmpHsl.h + (random() * 2 - 1) * HUE_JITTER + 1) % 1
  tmpHsl.s = Math.min(1, Math.max(0, tmpHsl.s + (random() * 2 - 1) * SATURATION_JITTER))
  tmpHsl.l = Math.min(1, Math.max(0, tmpHsl.l + (random() * 2 - 1) * LIGHTNESS_JITTER))
  tmpColor.setHSL(tmpHsl.h, tmpHsl.s, tmpHsl.l)
  bucket.baseColors.push(
    tmpColor.r * BASE_COLOR_SCALE * jitter,
    tmpColor.g * BASE_COLOR_SCALE * jitter,
    tmpColor.b * BASE_COLOR_SCALE * jitter,
  )
  // Tip: same hue family, slightly less saturated, capped brightness.
  tmpColor.setHSL(tmpHsl.h, tmpHsl.s * TIP_SATURATION, tmpHsl.l)
  bucket.tipColors.push(
    tmpColor.r * TIP_COLOR_SCALE * jitter,
    tmpColor.g * TIP_COLOR_SCALE * jitter,
    tmpColor.b * TIP_COLOR_SCALE * jitter,
  )
}

// One noise handle per world seed, same caching idea as chunkHeightmap.ts's
// noiseHandlesFor — module-level cache instead of a closure since this is now
// a plain exported function rather than a factory-built system.
const speciesNoiseCache = new Map<number, ReturnType<typeof createNoise2D>>()
function speciesNoiseFor(seed: number): ReturnType<typeof createNoise2D> {
  let noise = speciesNoiseCache.get(seed)
  if (!noise) {
    noise = createNoise2D(createSeededRandom(seed ^ 0x6a09e667))
    speciesNoiseCache.set(seed, noise)
  }
  return noise
}

/** Deterministic from `(seed, cx, cz)` + the passed-in grids — safe to call
 *  on the main thread or inside a worker. Bit-for-bit identical to the
 *  generation this replaced in `grass.ts` (see `grassPlacement.test.ts`). */
export function computeChunkGrass(params: GrassComputeParams, grids: GrassTileGrids): GrassChunkData {
  const { cx, cz, chunkSize, resolution, waterLevel, heightScale, seed, candidatesPerChunk, region } = params
  const o = apronOriginWorld(cx, cz, chunkSize, resolution)
  const sample = (grid: Float32Array, x: number, z: number) =>
    sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

  const random = createSeededRandom(seed ^ hashChunk(cx, cz) ^ 0x9f2c3b)
  const speciesNoise = speciesNoiseFor(seed)
  const half = chunkSize / 2

  // Start small (`createBucket`'s `BUCKET_INITIAL_FRACTION`) and grow on
  // demand (`ensureBucketCapacity`) instead of pre-allocating every bucket to
  // the full candidate count — a chunk could (worst case) land entirely in
  // one species/subtype's patch, but that's now an occasional grow, not the
  // default per-chunk allocation size.
  const buckets: Record<GrassSpeciesId, InstanceBucket> = {
    tri: createBucket(candidatesPerChunk),
    grain: createBucket(candidatesPerChunk),
    herb: createBucket(candidatesPerChunk),
    filler: createBucket(candidatesPerChunk),
  }

  for (let i = 0; i < candidatesPerChunk; i++) {
    const localX = (random() * 2 - 1) * half
    const localZ = (random() * 2 - 1) * half
    const wx = cx * chunkSize + localX
    const wz = cz * chunkSize + localZ

    const h = sample(grids.heights, wx, wz)
    const sandBand = sandBandAt(wx, wz, seed)
    if (h <= waterLevel + sandBand) continue // underwater/shoreline sand

    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    if (altitude > TREELINE_ALTITUDE) continue // above treeline

    const roadTint = sample(grids.roadTint, wx, wz)
    const roadFade = 1 - THREE.MathUtils.smoothstep(roadTint, ROAD_TINT_FADE_START, ROAD_TINT_FADE_END)
    if (roadFade <= 0) continue

    // Sampled after the road-corridor reject above (not before) — `ridge`
    // is only used by `ridgeFade` further down, so a candidate rejected by
    // `roadFade` never pays for a sample it wouldn't use. Safe to reorder:
    // none of these tests consume `random()` (see note below).
    const ridge = sample(grids.mountainRidge, wx, wz)

    // Slope costs 4 samples vs. 1 each for the rejects above — checked last
    // among the sample-based tests so it only runs on candidates that
    // already survived the cheaper ones. None of these tests consume `random()`,
    // so reordering them doesn't change which candidates survive or the RNG
    // stream the density roll/blade params below draw from.
    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(grids.heights, wx + d, wz) - sample(grids.heights, wx - d, wz)) +
        Math.abs(sample(grids.heights, wx, wz + d) - sample(grids.heights, wx, wz - d))) /
      (2 * d)
    if (slope > ROCK_SLOPE_FULL) continue // cliff/rock face

    const moisture = sample(grids.biomes, wx, wz)
    const moistureRegion = sample(grids.moistureRegion, wx, wz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    const altitudeFade =
      1 -
      Math.max(0, Math.min(1, (altitude - TREELINE_FADE_START) / (TREELINE_ALTITUDE - TREELINE_FADE_START)))
    // Soft foothill thinning: grass density fades with mountainRidge instead
    // of a hard reject line at the plains→mountain boundary.
    const ridgeFade = 1 - THREE.MathUtils.smoothstep(ridge, MOUNTAIN_RIDGE_FADE_START, MOUNTAIN_RIDGE_FADE_END)
    // Sparse-but-present even on dry ground; thick on humid lowlands. Desert
    // thins it out to near-nothing (bare sand, not a lawn). Soft roadFade
    // lets a few blades into the dirt shoulder instead of a bald cut.
    const density =
      Math.max(0, Math.min(1, 0.55 + moisture * 0.45)) * altitudeFade * ridgeFade * roadFade * (1 - biome.desert * 0.9)
    if (density <= 0 || random() > density) continue

    const rotationY = random() * Math.PI * 2
    const jitter = 1 + (random() * 2 - 1) * 0.22

    tmpColor.copy(ARID_GRASS).lerp(HUMID_GRASS, moisture)
    if (biome.swamp > 0) tmpColor.lerp(SWAMP_GRASS, biome.swamp)

    // Large-scale patch roll: which species does this candidate belong to?
    // Independent of the density roll above so patch shape doesn't correlate
    // with moisture/altitude thinning.
    const patchNoise = fbm01(speciesNoise, wx * SPECIES_PATCH_SCALE, wz * SPECIES_PATCH_SCALE, SPECIES_PATCH_FBM)
    const herbWeight = THREE.MathUtils.smoothstep(
      patchNoise,
      0.5 - SPECIES_BAND_HALF_WIDTH,
      0.5 + SPECIES_BAND_HALF_WIDTH,
    )
    const isHerb = random() < herbWeight

    if (isHerb) {
      const bladeHeight = HERB_HEIGHT_MIN + random() * (HERB_HEIGHT_MAX - HERB_HEIGHT_MIN)
      const bladeWidth = HERB_WIDTH_MIN + random() * (HERB_WIDTH_MAX - HERB_WIDTH_MIN)
      tmpColor.multiplyScalar(HERB_DARKEN)
      pushInstance(buckets.herb, localX, localZ, h, rotationY, bladeHeight, bladeWidth, tmpColor, jitter, HERB_WIND_FACTOR, random)
    } else {
      const bladeHeight = BLADE_HEIGHT_MIN + random() * (BLADE_HEIGHT_MAX - BLADE_HEIGHT_MIN)
      const bladeWidth = BLADE_WIDTH_MIN + random() * (BLADE_WIDTH_MAX - BLADE_WIDTH_MIN)
      const subtype: GrassSpeciesId = random() < GRAIN_RATIO ? 'grain' : 'tri'
      pushInstance(buckets[subtype], localX, localZ, h, rotationY, bladeHeight, bladeWidth, tmpColor, jitter, GRASS_WIND_FACTOR, random)
    }
  }

  // Near-field filler pass — short cheap blades to close golf-course gaps
  // between main clumps. Same eligibility; separate RNG stream via continue
  // of `random`. Drawn only when chunkManager passes fillerFraction > 0.
  const fillerCandidates = Math.floor(candidatesPerChunk * FILLER_CANDIDATE_RATIO)
  for (let i = 0; i < fillerCandidates; i++) {
    const localX = (random() * 2 - 1) * half
    const localZ = (random() * 2 - 1) * half
    const wx = cx * chunkSize + localX
    const wz = cz * chunkSize + localZ

    const h = sample(grids.heights, wx, wz)
    const sandBand = sandBandAt(wx, wz, seed)
    if (h <= waterLevel + sandBand) continue

    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    if (altitude > TREELINE_ALTITUDE) continue

    const roadTint = sample(grids.roadTint, wx, wz)
    const roadFade = 1 - THREE.MathUtils.smoothstep(roadTint, ROAD_TINT_FADE_START, ROAD_TINT_FADE_END)
    if (roadFade <= 0) continue

    // See the main-pass loop above: `ridge` only feeds `ridgeFade` below, so
    // it's sampled after the road-corridor reject, not before.
    const ridge = sample(grids.mountainRidge, wx, wz)

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(grids.heights, wx + d, wz) - sample(grids.heights, wx - d, wz)) +
        Math.abs(sample(grids.heights, wx, wz + d) - sample(grids.heights, wx, wz - d))) /
      (2 * d)
    if (slope > ROCK_SLOPE_FULL) continue

    const moisture = sample(grids.biomes, wx, wz)
    const moistureRegion = sample(grids.moistureRegion, wx, wz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    const altitudeFade =
      1 -
      Math.max(0, Math.min(1, (altitude - TREELINE_FADE_START) / (TREELINE_ALTITUDE - TREELINE_FADE_START)))
    const ridgeFade = 1 - THREE.MathUtils.smoothstep(ridge, MOUNTAIN_RIDGE_FADE_START, MOUNTAIN_RIDGE_FADE_END)
    // Slightly denser accept than main grass — fillers are short and LOD-gated.
    const density =
      Math.max(0, Math.min(1, 0.65 + moisture * 0.35)) * altitudeFade * ridgeFade * roadFade * (1 - biome.desert * 0.95)
    if (density <= 0 || random() > density) continue

    tmpColor.copy(ARID_GRASS).lerp(HUMID_GRASS, moisture)
    if (biome.swamp > 0) tmpColor.lerp(SWAMP_GRASS, biome.swamp)
    tmpColor.multiplyScalar(FILLER_DARKEN)

    pushInstance(
      buckets.filler,
      localX,
      localZ,
      h,
      random() * Math.PI * 2,
      FILLER_HEIGHT_MIN + random() * (FILLER_HEIGHT_MAX - FILLER_HEIGHT_MIN),
      FILLER_WIDTH_MIN + random() * (FILLER_WIDTH_MAX - FILLER_WIDTH_MIN),
      tmpColor,
      1 + (random() * 2 - 1) * 0.18,
      FILLER_WIND_FACTOR,
      random,
    )
  }

  const result: GrassChunkData = {}
  for (const id of GRASS_SPECIES_ORDER) {
    const bucket = buckets[id]
    if (bucket.count === 0) continue
    result[id] = {
      count: bucket.count,
      matrices: bucket.matrixData.slice(0, bucket.count * 16),
      phases: new Float32Array(bucket.phases),
      baseColors: new Float32Array(bucket.baseColors),
      tipColors: new Float32Array(bucket.tipColors),
      windFactors: new Float32Array(bucket.windFactors),
    }
  }
  return result
}
