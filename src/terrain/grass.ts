import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import type { ChunkCoord } from './chunkGrid'
import { createSeededRandom } from '../world/parseSeed'
import { ROCK_SLOPE_FULL, sandBandAt } from './biomeColors'
import { biomeWeightsAt } from './biomeRegions'
import { apronOriginWorld, type ChunkTileData, type RegionParams, sampleApronGrid } from './chunkHeightmap'
import { fbm01, type FbmParams } from './fbm'

export type WorldGrassChunk = {
  /** Group of InstancedMeshes (species buckets + optional near-field filler)
   *  positioned at the chunk origin. */
  mesh: THREE.Group
  /** Instances actually generated for this chunk, summed across all subtype
   *  buckets (survivors of eligibility/density rejection) — `mesh`'s children's
   *  `count` may be temporarily lower, see `setLodFraction`. */
  readonly fullCount: number
  /** Renders only the first `fraction` of instances in each *main* subtype
   *  bucket (0 excluded, clamped to (0, 1]) — cheap distance LOD: no
   *  reallocation, just narrows each InstancedMesh's draw range. Safe because
   *  instances are generated in seeded-random spatial order, so any prefix is
   *  an unbiased spatial subsample.
   *  `fillerFraction` (default 0) controls the short ground-cover bucket that
   *  exists only to densify the near field without paying fill-rate far away. */
  setLodFraction: (fraction: number, fillerFraction?: number) => void
  dispose: () => void
}

export type GrassSystem = {
  createChunkGrass: (
    coord: ChunkCoord,
    tile: ChunkTileData,
    resolution: number,
    chunkSize: number,
    chunkOriginX: number,
    chunkOriginZ: number,
    waterLevel: number,
    heightScale: number,
    seed: number,
    /** Raw position candidates rolled before eligibility/density rejection —
     *  the GUI-exposed "density" knob (`config.terrain.grass.density`). */
    candidatesPerChunk: number,
    region: RegionParams,
  ) => WorldGrassChunk | null
  /** Advances the shared wind clock — call once per frame, not per chunk. */
  update: (dt: number) => void
  /** 0 = full night, 1 = full day — darkens grass in step with sky/fog/lights.
   *  `sunDirection` drives cheap fake subsurface/backlighting (plan 066). */
  setDayNight: (dayFactor: number, sunDirection: THREE.Vector3) => void
  dispose: () => void
}

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

/** Per-chunk hash so nearby chunks don't get correlated blade layouts (own salt,
 *  decorrelated from `chunkVegetation.ts`'s hash/salt for the same chunk). */
function hashChunk(cx: number, cz: number): number {
  let h = (cx * 668265263 + cz * 374761393) | 0
  h = (h ^ (h >>> 13)) * 2246822519
  return (h ^ (h >>> 16)) >>> 0
}

/** One flat tapered strip ("fin") of a blade cluster, in the cluster's own
 *  local unit space (`y` in [0,1] before the instance's `bladeHeight` scale).
 *  `yaw` picks the horizontal direction the fin's flat face points in — the
 *  fin itself is symmetric around the cluster's Y axis (spans `±halfWidth(t)`
 *  along the direction perpendicular to `yaw`... see `buildFinCluster`), so
 *  two fins 180° apart are the same plane (`radialFins` below accounts for
 *  that). `originT`/`heightT` let a fin start partway up the cluster and
 *  cover only part of its height — used by `GRAIN_FINS` for the leaf that
 *  peels off the stem partway up. */
type FinSpec = {
  yaw: number
  originT: number
  heightT: number
  /** Half-width the fin ramps up to by `baseRise` (see `finHalfWidth`) — NOT
   *  the width at the very base, which is why this used to be called
   *  `baseHalfWidth`: a fin whose cross-section is already this wide at t=0
   *  is what made multiple radial fins visibly cross through the shared
   *  center instead of reading as separate leaves. */
  peakHalfWidth: number
  tipHalfWidth: number
  /** Fraction of the fin's own [0,1] where width ramps from ~0 up to
   *  `peakHalfWidth` — keeps radiating fins converging to a shared point at
   *  the base instead of overlapping through the center. */
  baseRise: number
  curveStrength: number
  /** Rest-curve profile along the fin, `t` in [0,1] local to the fin (not the
   *  cluster) — default quadratic (`t*t`, base stays planted, curve grows
   *  toward the tip); `HERB_FINS` uses a rise-then-droop arch instead. */
  curveShape: (t: number) => number
  segments: number
}

/** Half-width at fin-local `t` — ramps linearly from 0 at t=0 to
 *  `peakHalfWidth` at `t=baseRise` (so radiating fins meet at a near-point
 *  base instead of crossing, see `FinSpec.baseRise`), then tapers linearly
 *  from `peakHalfWidth` to `tipHalfWidth` over the rest of the fin. */
function finHalfWidth(fin: FinSpec, t: number): number {
  if (t < fin.baseRise) return fin.peakHalfWidth * (t / fin.baseRise)
  const t2 = (t - fin.baseRise) / (1 - fin.baseRise)
  return fin.peakHalfWidth + (fin.tipHalfWidth - fin.peakHalfWidth) * t2
}

const QUADRATIC_CURVE = (t: number): number => t * t
/** Rises to a peak around 70% up the fin then droops slightly toward the tip —
 *  reads as an arched, broadleaf-like leaf instead of a blade leaning one way. */
const ARCH_CURVE = (t: number): number => Math.sin(t * Math.PI * 0.7)

/** `count` fins evenly spaced across the yaw range that actually gives distinct
 *  planes — a fin's plane repeats every 180° (symmetric ±halfWidth), so `count`
 *  fins spaced by `360/count` always lands on `count` distinct planes only
 *  when `count` is odd (e.g. 3 fins at 0/120/240 ≡ the 3 distinct planes
 *  0/60/120 mod 180). Used for the odd-numbered radial clusters below. */
function radialFins(count: number, spec: Omit<FinSpec, 'yaw'>): FinSpec[] {
  return Array.from({ length: count }, (_, i) => ({ ...spec, yaw: (i * Math.PI * 2) / count }))
}

const BASE_HALF_WIDTH = 0.5
const TIP_HALF_WIDTH = 0.14
/** Rows along a fin's height (segments + 1) — more than 2 so the baked-in
 *  rest curve below reads as an actual bend, not a straight-edged triangle. */
const BLADE_SEGMENTS = 4
/** Local-space lean at the tip (t=1), in the same units as `BASE_HALF_WIDTH` —
 *  deliberately larger than the width itself since it gets scaled by the
 *  instance's `bladeWidth` (not `bladeHeight`) at render time; tuned so the
 *  resulting world-space bend reads as a fraction of a typical blade's height. */
const CURVE_STRENGTH = 1.2

/** Fraction of a fin's own length where it ramps up to full width — shared
 *  default for fins that run the cluster's full height (see `FinSpec.baseRise`). */
const BASE_RISE = 0.2

/** Species A, ~75% of it — 3 fins from the center, ~60°/120° apart (the direct
 *  "3 listki z centrum" upgrade of the old 2-fin cross). */
const TRI_CLUSTER_FINS: FinSpec[] = radialFins(3, {
  originT: 0,
  heightT: 1,
  peakHalfWidth: BASE_HALF_WIDTH,
  tipHalfWidth: TIP_HALF_WIDTH,
  baseRise: BASE_RISE,
  curveStrength: CURVE_STRENGTH,
  curveShape: QUADRATIC_CURVE,
  segments: BLADE_SEGMENTS,
})

const GRAIN_STEM_HALF_WIDTH = 0.16
const GRAIN_LEAF_ORIGIN_T = 0.3
const GRAIN_LEAF_HEIGHT_T = 0.7
/** Species A, ~25% of it — a thin stem (2 perpendicular fins, like the old
 *  cross but much narrower) plus one wider leaf peeling off partway up,
 *  "trochę jak zboże". */
const GRAIN_FINS: FinSpec[] = [
  {
    yaw: 0,
    originT: 0,
    heightT: 1,
    peakHalfWidth: GRAIN_STEM_HALF_WIDTH,
    tipHalfWidth: GRAIN_STEM_HALF_WIDTH * 0.5,
    baseRise: 0.15,
    curveStrength: CURVE_STRENGTH * 0.5,
    curveShape: QUADRATIC_CURVE,
    segments: BLADE_SEGMENTS,
  },
  {
    yaw: Math.PI / 2,
    originT: 0,
    heightT: 1,
    peakHalfWidth: GRAIN_STEM_HALF_WIDTH,
    tipHalfWidth: GRAIN_STEM_HALF_WIDTH * 0.5,
    baseRise: 0.15,
    curveStrength: CURVE_STRENGTH * 0.5,
    curveShape: QUADRATIC_CURVE,
    segments: BLADE_SEGMENTS,
  },
  {
    yaw: Math.PI / 4,
    originT: GRAIN_LEAF_ORIGIN_T,
    heightT: GRAIN_LEAF_HEIGHT_T,
    peakHalfWidth: BASE_HALF_WIDTH * 0.7,
    tipHalfWidth: TIP_HALF_WIDTH,
    // Ramps up quickly from where it attaches to the stem, since that
    // attachment point is itself already partway up the cluster.
    baseRise: 0.25,
    curveStrength: CURVE_STRENGTH * 1.4,
    curveShape: QUADRATIC_CURVE,
    segments: 3,
  },
]

/** Near-field filler — 2 thin fins, few segments (cheap tris). Only drawn
 *  close to the camera via `setLodFraction(..., fillerFraction)`. */
const FILLER_FINS: FinSpec[] = radialFins(2, {
  originT: 0,
  heightT: 1,
  peakHalfWidth: 0.35,
  tipHalfWidth: 0.1,
  baseRise: 0.25,
  curveStrength: 0.7,
  curveShape: QUADRATIC_CURVE,
  segments: 3,
})

const HERB_PEAK_HALF_WIDTH = 0.7
const HERB_TIP_HALF_WIDTH = 0.32
const HERB_SEGMENTS = 6
/** Stronger than the grass fins' curve — herb leaves are meant to droop/splay
 *  outward close to the ground rather than stand up, see `HERB_HEIGHT_MIN/MAX`. */
const HERB_CURVE_STRENGTH = 1.5
/** Darkens the biome-lerped tint for herb instances — reads as a shaded
 *  ground-cover plant next to the brighter grass around it. */
const HERB_DARKEN = 0.72
/** Herb barely reacts to wind (it's low and lies close to the ground) — not
 *  exactly 0 so it doesn't look perfectly frozen next to swaying grass. */
const HERB_WIND_FACTOR = 0.06
const GRASS_WIND_FACTOR = 1
/** Species B — 3 short, broad, rounded leaves (plantain/"babka lekarska"-like)
 *  instead of tall pointed blades; wider taper + arch curve + extra segments
 *  read as rounder than `TRI_CLUSTER_FINS`'s spikier linear taper. */
const HERB_FINS: FinSpec[] = radialFins(3, {
  originT: 0,
  heightT: 1,
  peakHalfWidth: HERB_PEAK_HALF_WIDTH,
  tipHalfWidth: HERB_TIP_HALF_WIDTH,
  baseRise: BASE_RISE,
  curveStrength: HERB_CURVE_STRENGTH,
  curveShape: ARCH_CURVE,
  segments: HERB_SEGMENTS,
})

/** Builds one shared position/index buffer from a list of fins — each fin is a
 *  flat tapered strip (a vertical "card") baked with its own rest curve; fins
 *  are concatenated into one geometry (index offsets accumulate per fin), so a
 *  whole cluster/stem+leaf/herb shape renders as a single draw call per
 *  InstancedMesh. Generalizes the old hardcoded 2-perpendicular-fin cross. */
function buildFinCluster(fins: FinSpec[]): {
  position: THREE.BufferAttribute
  index: THREE.BufferAttribute
} {
  const positions: number[] = []
  const indices: number[] = []

  for (const fin of fins) {
    const base = positions.length / 3
    const rows = fin.segments + 1
    const widthAxisX = Math.cos(fin.yaw)
    const widthAxisZ = Math.sin(fin.yaw)
    // Perpendicular to the width axis in the XZ plane — the direction the fin
    // leans into as it curves, same convention as the original 2-fin cross
    // (quad0 widens along X, curves into +Z; quad1 widens along Z, curves into +X).
    const curveAxisX = -widthAxisZ
    const curveAxisZ = widthAxisX

    for (let r = 0; r < rows; r++) {
      const t = r / fin.segments
      const halfWidth = finHalfWidth(fin, t)
      const curve = fin.curveStrength * fin.curveShape(t)
      const y = fin.originT + fin.heightT * t
      const cx = curveAxisX * curve
      const cz = curveAxisZ * curve
      positions.push(-widthAxisX * halfWidth + cx, y, -widthAxisZ * halfWidth + cz)
      positions.push(widthAxisX * halfWidth + cx, y, widthAxisZ * halfWidth + cz)
    }
    for (let r = 0; r < fin.segments; r++) {
      const i0 = base + r * 2
      const i1 = i0 + 1
      const i2 = i0 + 2
      const i3 = i0 + 3
      indices.push(i0, i1, i2, i1, i3, i2)
    }
  }

  return {
    position: new THREE.BufferAttribute(new Float32Array(positions), 3),
    index: new THREE.BufferAttribute(new Uint16Array(indices), 1),
  }
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute vec3 aBaseColor;
  attribute vec3 aTipColor;
  // 1 for upright grass/grain, near-0 for the ground-hugging herb — see
  // HERB_WIND_FACTOR/GRASS_WIND_FACTOR.
  attribute float aWindFactor;

  uniform float uTime;

  varying vec3 vColor;
  varying float vFogDepth;
  varying vec3 vWorldPos;
  // Blade height fraction [0 tip-less base .. 1 tip] — used for tip glow /
  // fake subsurface (plan 066). Captured before wind bend so it stays the
  // geometric "along-blade" parameter, not world Y.
  varying float vBladeT;

  void main() {
    float bladeT = position.y;
    vBladeT = bladeT;
    vColor = mix(aBaseColor, aTipColor, bladeT);

    // attribute mat4 instanceMatrix is injected automatically by three.js
    // whenever USE_INSTANCING is defined (i.e. the material is used on an
    // InstancedMesh) — no explicit declaration needed, unlike most other
    // per-vertex inputs.
    vec3 transformed = position;
    #ifdef USE_INSTANCING
      transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #endif

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);

    // Base stays planted; sway grows toward the tip (quadratic falloff).
    float bend = bladeT * bladeT;
    float sway = sin(uTime * 1.6 + aPhase + worldPos.x * 0.12 + worldPos.z * 0.09);
    float swayZ = cos(uTime * 1.3 + aPhase * 1.3 + worldPos.x * 0.09);
    worldPos.x += sway * 0.14 * bend * aWindFactor;
    worldPos.z += swayZ * 0.1 * bend * aWindFactor;

    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uDayFactor;
  uniform vec3 uSunDirection;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vColor;
  varying float vFogDepth;
  varying vec3 vWorldPos;
  varying float vBladeT;

  void main() {
    // Grass is mostly unlit (no scene lights/shadows) — the terrain around it
    // IS lit (MeshStandardMaterial), and at night its ambient/hemi/sun
    // intensities (world/dayNight.ts's skyParamsFromTime) drop to roughly
    // 10-15% of their daytime peak. A 0.4 floor here (reported: grass glowing
    // at night, way brighter than everything drowning in darkness around it)
    // stayed far above that, so grass visually detached from the terrain
    // instead of going dark with it. Matched down to the same rough floor.
    float brightness = mix(0.08, 1.0, uDayFactor);
    vec3 color = vColor * brightness;

    // Fake translucency (plan 066): when looking toward the sun, thin tips
    // pick up a warm scatter as if light passes through the blade. View/sun
    // only — no screen-space normals (dFdx on thin fins was too subtle /
    // unstable to read as vegetation). Scales with uDayFactor so night stays
    // dark.
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 sunDir = normalize(uSunDirection);
    float sunFacing = max(dot(viewDir, sunDir), 0.0);
    float tip = vBladeT * vBladeT;
    // Warm yellowish-green scatter — sells "vegetation" vs plastic cards.
    // Kept modest: earlier 0.65 read as glowing blades.
    vec3 scatter = vec3(0.45, 0.7, 0.22);
    color += scatter * pow(sunFacing, 1.8) * tip * 0.22 * uDayFactor;
    // Soft fill on the lit side so blades aren't flat silhouettes when the
    // sun is behind the camera.
    float frontLit = max(dot(viewDir, -sunDir), 0.0);
    color *= 1.0 + frontLit * 0.06 * uDayFactor;

    // Same linear falloff as three.js's built-in fog_fragment chunk — matches
    // how the terrain (MeshStandardMaterial, scene.fog) fades, so the grass
    // ring doesn't stay sharp against faded-out terrain past fogFar.
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    color = mix(color, fogColor, fogFactor);
    gl_FragColor = vec4(color, 1.0);
  }
`

/** Large-scale patch noise deciding species A (grass) vs. species B (herb) —
 *  independent of the biome/moisture axes, tuned (via `SPECIES_PATCH_FBM`'s
 *  frequency-equivalent scale below) so patches read as roughly 10 m² blobs.
 *  Sampled directly in world space (not a per-chunk-tile grid) since grass
 *  generation is already main-thread-only (see module doc). */
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
// the grass blades (see also HERB_CURVE_STRENGTH's outward droop).
const HERB_HEIGHT_MIN = 0.04
const HERB_HEIGHT_MAX = 0.11
const HERB_WIDTH_MIN = 0.12
const HERB_WIDTH_MAX = 0.24
const BLADE_HEIGHT_MIN = 0.16
const BLADE_HEIGHT_MAX = 0.52
const BLADE_WIDTH_MIN = 0.06
const BLADE_WIDTH_MAX = 0.16

/** Small extra per-instance variety beyond height/width/rotation: a slight hue/
 *  saturation/lightness nudge on top of the biome-lerped tint, and static tilt
 *  off vertical (independent of wind sway) so clumps don't read as clones. */
const HUE_JITTER = 0.07
const SATURATION_JITTER = 0.14
const LIGHTNESS_JITTER = 0.06
const TILT_JITTER_RAD = THREE.MathUtils.degToRad(14)
/** Extra overall size scatter on top of the height/width roll. */
const SIZE_JITTER = 0.22

type SpeciesId = 'tri' | 'grain' | 'herb' | 'filler'

type InstanceBucket = {
  matrixData: Float32Array
  count: number
  phases: number[]
  baseColors: number[]
  tipColors: number[]
  windFactors: number[]
}

function createBucket(capacity: number): InstanceBucket {
  return {
    matrixData: new Float32Array(capacity * 16),
    count: 0,
    phases: [],
    baseColors: [],
    tipColors: [],
    windFactors: [],
  }
}

/**
 * Owns the shared blade geometry/material (one draw call's worth of GPU state
 * reused by every chunk) and builds per-chunk `InstancedMesh`es from a tile's
 * heights/biomes/mountainRidge grids — deterministic from `(seed, cx, cz)`, same
 * pattern as `chunkVegetation.ts`. Positions are generated on the main thread
 * (see grass-rendering plan phase 5 for the deferred worker-offload follow-up).
 */
export function createGrassSystem(): GrassSystem {
  const templates: Record<SpeciesId, { position: THREE.BufferAttribute, index: THREE.BufferAttribute }> = {
    tri: buildFinCluster(TRI_CLUSTER_FINS),
    grain: buildFinCluster(GRAIN_FINS),
    herb: buildFinCluster(HERB_FINS),
    filler: buildFinCluster(FILLER_FINS),
  }

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    // `fog: true` + the merged `UniformsLib.fog` uniforms below make three.js
    // keep fogColor/fogNear/fogFar in sync with `scene.fog` every frame
    // (WebGLMaterials.refreshFogUniforms) — the shader still has to declare
    // and apply them itself (done in VERTEX_SHADER/FRAGMENT_SHADER above),
    // since that auto-sync is the only part three.js does for a custom
    // ShaderMaterial (non-Raw).
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDayFactor: { value: 1 },
        // Normalized sun direction from Sky — updated via setDayNight.
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      },
    ]),
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })

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

  function createChunkGrass(
    coord: ChunkCoord,
    tile: ChunkTileData,
    resolution: number,
    chunkSize: number,
    chunkOriginX: number,
    chunkOriginZ: number,
    waterLevel: number,
    heightScale: number,
    seed: number,
    candidatesPerChunk: number,
    region: RegionParams,
  ): WorldGrassChunk | null {
    const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, resolution)
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

    const random = createSeededRandom(seed ^ hashChunk(coord.cx, coord.cz) ^ 0x9f2c3b)
    const speciesNoise = speciesNoiseFor(seed)
    const half = chunkSize / 2

    // Sized to the (upper-bound) candidate count and trimmed with `.slice()`
    // once each bucket's survivor count is known — same allocation-avoidance
    // approach as before, just split across 3 subtype buckets since a chunk
    // could (worst case) land entirely in one species/subtype's patch.
    const buckets: Record<SpeciesId, InstanceBucket> = {
      tri: createBucket(candidatesPerChunk),
      grain: createBucket(candidatesPerChunk),
      herb: createBucket(candidatesPerChunk),
      filler: createBucket(Math.max(1, Math.floor(candidatesPerChunk * FILLER_CANDIDATE_RATIO))),
    }

    for (let i = 0; i < candidatesPerChunk; i++) {
      const localX = (random() * 2 - 1) * half
      const localZ = (random() * 2 - 1) * half
      const wx = coord.cx * chunkSize + localX
      const wz = coord.cz * chunkSize + localZ

      const h = sample(tile.heights, wx, wz)
      const sandBand = sandBandAt(wx, wz, seed)
      if (h <= waterLevel + sandBand) continue // underwater/shoreline sand

      const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
      if (altitude > TREELINE_ALTITUDE) continue // above treeline

      const ridge = sample(tile.mountainRidge, wx, wz)

      const roadTint = sample(tile.roadTint, wx, wz)
      const roadFade =
        1 - THREE.MathUtils.smoothstep(roadTint, ROAD_TINT_FADE_START, ROAD_TINT_FADE_END)
      if (roadFade <= 0) continue

      // Slope costs 4 samples vs. 1 each for the rejects above — checked last
      // among the sample-based tests so it only runs on candidates that
      // already survived the cheaper ones. None of these tests consume `random()`,
      // so reordering them doesn't change which candidates survive or the RNG
      // stream the density roll/blade params below draw from.
      const d = SLOPE_SAMPLE_STEP
      const slope =
        (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
          Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
        (2 * d)
      if (slope > ROCK_SLOPE_FULL) continue // cliff/rock face

      const moisture = sample(tile.biomes, wx, wz)
      const moistureRegion = sample(tile.moistureRegion, wx, wz)
      const biome = biomeWeightsAt(moistureRegion, altitude, region)
      const altitudeFade =
        1 -
        Math.max(
          0,
          Math.min(1, (altitude - TREELINE_FADE_START) / (TREELINE_ALTITUDE - TREELINE_FADE_START)),
        )
      // Soft foothill thinning: grass density fades with mountainRidge instead
      // of a hard reject line at the plains→mountain boundary.
      const ridgeFade =
        1 -
        THREE.MathUtils.smoothstep(ridge, MOUNTAIN_RIDGE_FADE_START, MOUNTAIN_RIDGE_FADE_END)
      // Sparse-but-present even on dry ground; thick on humid lowlands. Desert
      // thins it out to near-nothing (bare sand, not a lawn). Soft roadFade
      // lets a few blades into the dirt shoulder instead of a bald cut.
      const density =
        Math.max(0, Math.min(1, 0.55 + moisture * 0.45)) *
        altitudeFade *
        ridgeFade *
        roadFade *
        (1 - biome.desert * 0.9)
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
        pushInstance(
          buckets.herb,
          localX,
          localZ,
          h,
          rotationY,
          bladeHeight,
          bladeWidth,
          tmpColor,
          jitter,
          HERB_WIND_FACTOR,
          random,
        )
      } else {
        const bladeHeight = BLADE_HEIGHT_MIN + random() * (BLADE_HEIGHT_MAX - BLADE_HEIGHT_MIN)
        const bladeWidth = BLADE_WIDTH_MIN + random() * (BLADE_WIDTH_MAX - BLADE_WIDTH_MIN)
        const subtype: SpeciesId = random() < GRAIN_RATIO ? 'grain' : 'tri'
        pushInstance(
          buckets[subtype],
          localX,
          localZ,
          h,
          rotationY,
          bladeHeight,
          bladeWidth,
          tmpColor,
          jitter,
          GRASS_WIND_FACTOR,
          random,
        )
      }
    }

    // Near-field filler pass — short cheap blades to close golf-course gaps
    // between main clumps. Same eligibility; separate RNG stream via continue
    // of `random`. Drawn only when chunkManager passes fillerFraction > 0.
    const fillerCandidates = Math.floor(candidatesPerChunk * FILLER_CANDIDATE_RATIO)
    for (let i = 0; i < fillerCandidates; i++) {
      const localX = (random() * 2 - 1) * half
      const localZ = (random() * 2 - 1) * half
      const wx = coord.cx * chunkSize + localX
      const wz = coord.cz * chunkSize + localZ

      const h = sample(tile.heights, wx, wz)
      const sandBand = sandBandAt(wx, wz, seed)
      if (h <= waterLevel + sandBand) continue

      const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
      if (altitude > TREELINE_ALTITUDE) continue

      const ridge = sample(tile.mountainRidge, wx, wz)
      const roadTint = sample(tile.roadTint, wx, wz)
      const roadFade =
        1 - THREE.MathUtils.smoothstep(roadTint, ROAD_TINT_FADE_START, ROAD_TINT_FADE_END)
      if (roadFade <= 0) continue

      const d = SLOPE_SAMPLE_STEP
      const slope =
        (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
          Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
        (2 * d)
      if (slope > ROCK_SLOPE_FULL) continue

      const moisture = sample(tile.biomes, wx, wz)
      const moistureRegion = sample(tile.moistureRegion, wx, wz)
      const biome = biomeWeightsAt(moistureRegion, altitude, region)
      const altitudeFade =
        1 -
        Math.max(
          0,
          Math.min(1, (altitude - TREELINE_FADE_START) / (TREELINE_ALTITUDE - TREELINE_FADE_START)),
        )
      const ridgeFade =
        1 -
        THREE.MathUtils.smoothstep(ridge, MOUNTAIN_RIDGE_FADE_START, MOUNTAIN_RIDGE_FADE_END)
      // Slightly denser accept than main grass — fillers are short and LOD-gated.
      const density =
        Math.max(0, Math.min(1, 0.65 + moisture * 0.35)) *
        altitudeFade *
        ridgeFade *
        roadFade *
        (1 - biome.desert * 0.95)
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

    const group = new THREE.Group()
    group.position.set(chunkOriginX, 0, chunkOriginZ)
    group.name = 'chunk-grass'

    const subMeshes: { mesh: THREE.InstancedMesh, fullCount: number, filler: boolean }[] = []
    let totalCount = 0

    for (const id of Object.keys(buckets) as SpeciesId[]) {
      const bucket = buckets[id]
      if (bucket.count === 0) continue
      totalCount += bucket.count

      const geometry = new THREE.BufferGeometry()
      // Clone the shared template's attributes rather than referencing them
      // directly — every chunk's `BufferGeometry.dispose()` (on unload) frees
      // every attribute it holds, and referencing the template by identity would
      // free the GPU buffer backing *every other* grass chunk's blade shape too.
      // Cheap: a few dozen vertices per template.
      geometry.setAttribute('position', templates[id].position.clone())
      geometry.setIndex(templates[id].index.clone())
      geometry.setAttribute(
        'aPhase',
        new THREE.InstancedBufferAttribute(new Float32Array(bucket.phases), 1),
      )
      geometry.setAttribute(
        'aBaseColor',
        new THREE.InstancedBufferAttribute(new Float32Array(bucket.baseColors), 3),
      )
      geometry.setAttribute(
        'aTipColor',
        new THREE.InstancedBufferAttribute(new Float32Array(bucket.tipColors), 3),
      )
      geometry.setAttribute(
        'aWindFactor',
        new THREE.InstancedBufferAttribute(new Float32Array(bucket.windFactors), 1),
      )

      const mesh = new THREE.InstancedMesh(geometry, material, bucket.count)
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(
        bucket.matrixData.slice(0, bucket.count * 16),
        16,
      )
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere() // instance matrices spread well beyond the unit template's own bounds
      // No sun shadows — dense fin clusters painted black contact blobs under
      // every tuft (reads as plastic stickers). Terrain AO still softens a bit.
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.name = `chunk-grass-${id}`
      // Filler starts hidden; chunkManager enables it only in the near field.
      if (id === 'filler') mesh.count = 0
      group.add(mesh)
      subMeshes.push({ mesh, fullCount: bucket.count, filler: id === 'filler' })
    }

    if (totalCount === 0) return null

    return {
      mesh: group,
      fullCount: totalCount,
      setLodFraction(fraction, fillerFraction = 0) {
        const mainFrac = Math.max(0, Math.min(1, fraction))
        const fillFrac = Math.max(0, Math.min(1, fillerFraction))
        for (const sub of subMeshes) {
          if (sub.filler) {
            sub.mesh.count = Math.min(sub.fullCount, Math.round(sub.fullCount * fillFrac))
          } else {
            sub.mesh.count = Math.max(1, Math.min(sub.fullCount, Math.round(sub.fullCount * mainFrac)))
          }
        }
      },
      dispose: () => {
        group.removeFromParent()
        for (const sub of subMeshes) {
          sub.mesh.geometry.dispose()
          sub.mesh.dispose() // frees instanceMatrix's own GPU buffer — geometry.dispose() alone does not
        }
      },
    }
  }

  return {
    createChunkGrass,
    update(dt) {
      material.uniforms.uTime!.value += dt
    },
    setDayNight(dayFactor, sunDirection) {
      material.uniforms.uDayFactor!.value = dayFactor
      ;(material.uniforms.uSunDirection!.value as THREE.Vector3).copy(sunDirection).normalize()
    },
    dispose() {
      material.dispose()
    },
  }
}

// One noise handle per world seed, same caching idea as chunkHeightmap.ts's
// noiseHandlesFor — createGrassSystem() has no seed at construction time (it's
// created once in chunkManager.ts before any chunk/seed-specific call), so the
// handle is built lazily on first use per seed instead.
const speciesNoiseCache = new Map<number, ReturnType<typeof createNoise2D>>()
function speciesNoiseFor(seed: number): ReturnType<typeof createNoise2D> {
  let noise = speciesNoiseCache.get(seed)
  if (!noise) {
    noise = createNoise2D(createSeededRandom(seed ^ 0x6a09e667))
    speciesNoiseCache.set(seed, noise)
  }
  return noise
}
