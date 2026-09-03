import * as THREE from 'three'
import type { ChunkCoord } from './chunkGrid'
import type { ChunkTileData, RegionParams } from './chunkHeightmap'
import type { GrassGeometryLodTier } from './distanceLod'
import { REFLECTION_SKIPPED_LAYER } from '../world/waterMirror'
import {
  computeChunkGrass,
  GRASS_SPECIES_ORDER,
  type GrassChunkData,
  type GrassSpeciesId,
} from './grassPlacement'

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
  /** Geometry LOD (plan 148 S): swaps each non-filler species bucket's
   *  `InstancedMesh.geometry` to a cheaper fin-cluster variant (fewer fins/
   *  segments) as the chunk gets farther away — orthogonal to `setLodFraction`,
   *  which only changes how many instances of the *current* geometry draw.
   *  No-op on the filler bucket, which stays a single cheap near-only shape. */
  setGeometryLod: (tier: GrassGeometryLodTier) => void
  /** Dev-only hard visibility switch, independent of `setLodFraction` — a
   *  hidden bucket's `InstancedMesh.visible` is set `false` outright rather
   *  than drawing 0 instances, since the main-bucket branch of
   *  `setLodFraction` floors at 1 instance (far chunks never fully vanish),
   *  which would otherwise leave a stray blade rendered per chunk. */
  setDebugVisible: (mainVisible: boolean, fillerVisible: boolean) => void
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
  /** Turns a placement result (`computeChunkGrass`, `grassPlacement.ts`) into
   *  `InstancedMesh`es — the half of `createChunkGrass` that doesn't need the
   *  tile grids, so a caller that already has a `GrassChunkData` (e.g. a
   *  worker response) can skip straight to meshes. */
  buildGrassChunkMeshes: (
    data: GrassChunkData,
    chunkOriginX: number,
    chunkOriginZ: number,
  ) => WorldGrassChunk | null
  /** Advances the shared wind clock — call once per frame, not per chunk. */
  update: (dt: number) => void
  /** 0 = full night, 1 = full day — darkens grass in step with sky/fog/lights.
   *  `sunDirection` drives cheap fake subsurface/backlighting (plan 066). */
  setDayNight: (dayFactor: number, sunDirection: THREE.Vector3) => void
  dispose: () => void
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

/** Near-field filler — 2 thin fins, few segments (cheap tris). Explicit
 *  perpendicular yaws (0, π/2) rather than `radialFins(2, ...)`: that helper
 *  spaces yaw by `2π/count`, which for an even count puts both fins on the
 *  *same* plane (see `radialFins`'s own doc comment) — a near-invisible sliver
 *  from any camera angle close to edge-on, which is a real fraction of
 *  instances given each gets an independent random Y rotation
 *  (`grassPlacement.ts`'s filler pass). A true perpendicular cross, the same
 *  technique `GRAIN_FINS`'s stem already uses, keeps some width visible from
 *  every direction instead. Only drawn close to the camera via
 *  `setLodFraction(..., fillerFraction)`. */
const FILLER_FIN_SHAPE = {
  originT: 0,
  heightT: 1,
  peakHalfWidth: 0.35,
  tipHalfWidth: 0.1,
  baseRise: 0.25,
  curveStrength: 0.7,
  curveShape: QUADRATIC_CURVE,
  segments: 3,
} as const
const FILLER_FINS: FinSpec[] = [
  { ...FILLER_FIN_SHAPE, yaw: 0 },
  { ...FILLER_FIN_SHAPE, yaw: Math.PI / 2 },
]

const HERB_PEAK_HALF_WIDTH = 0.7
const HERB_TIP_HALF_WIDTH = 0.32
const HERB_SEGMENTS = 6
/** Stronger than the grass fins' curve — herb leaves are meant to droop/splay
 *  outward close to the ground rather than stand up, see `HERB_HEIGHT_MIN/MAX`. */
const HERB_CURVE_STRENGTH = 1.5
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

/** Geometry LOD (plan 148 S) — cheaper fin-cluster variants for `mid`/`far`
 *  chunks, reusing each species' own fin arrangement (silhouette/shape stays
 *  recognizable) and only cutting segment count (bend resolution), which is
 *  where most of a cluster's triangle budget goes. Same fin count as `near`
 *  keeps the outline stable across LOD transitions (less popping) — except
 *  `GRAIN_FINS_FAR`, which additionally drops the peeling leaf fin since a
 *  thin stem cross is already the minimal recognizable shape for that species. */
const MID_SEGMENTS = 2
const FAR_SEGMENTS = 1

function withSegments(fins: FinSpec[], segments: number): FinSpec[] {
  return fins.map((fin) => ({ ...fin, segments }))
}

const TRI_CLUSTER_FINS_MID = withSegments(TRI_CLUSTER_FINS, MID_SEGMENTS)
const TRI_CLUSTER_FINS_FAR = withSegments(TRI_CLUSTER_FINS, FAR_SEGMENTS)
const GRAIN_FINS_MID = withSegments(GRAIN_FINS, MID_SEGMENTS)
const GRAIN_FINS_FAR = withSegments(GRAIN_FINS.slice(0, 2), FAR_SEGMENTS)
const HERB_FINS_MID = withSegments(HERB_FINS, MID_SEGMENTS)
const HERB_FINS_FAR = withSegments(HERB_FINS, FAR_SEGMENTS)

type TieredSpeciesId = Exclude<GrassSpeciesId, 'filler'>

const GEOMETRY_LOD_FINS: Record<TieredSpeciesId, Record<GrassGeometryLodTier, FinSpec[]>> = {
  tri: { near: TRI_CLUSTER_FINS, mid: TRI_CLUSTER_FINS_MID, far: TRI_CLUSTER_FINS_FAR },
  grain: { near: GRAIN_FINS, mid: GRAIN_FINS_MID, far: GRAIN_FINS_FAR },
  herb: { near: HERB_FINS, mid: HERB_FINS_MID, far: HERB_FINS_FAR },
}

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
  // HERB_WIND_FACTOR/GRASS_WIND_FACTOR in grassPlacement.ts.
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

/**
 * Owns the shared blade geometry/material (one draw call's worth of GPU state
 * reused by every chunk) and turns a chunk's `GrassChunkData` (placements —
 * see `grassPlacement.ts`) into `InstancedMesh`es. `createChunkGrass` is a
 * thin synchronous wrapper around `computeChunkGrass` + `buildGrassChunkMeshes`
 * kept for callers that still want it in one call; `chunkManager.ts`'s
 * worker-offload path (plan 086) calls the two halves separately.
 */
export function createGrassSystem(): GrassSystem {
  const fillerTemplate = buildFinCluster(FILLER_FINS)
  // Built lazily per (species, tier) and cached at the system level — every
  // chunk's per-tier BufferGeometry clones from here (see `buildTierGeometry`),
  // so the fin-cluster vertex/index arithmetic runs once per tier ever
  // touched, not once per chunk.
  const tieredTemplateCache = new Map<string, { position: THREE.BufferAttribute, index: THREE.BufferAttribute }>()
  function tieredTemplate(id: TieredSpeciesId, tier: GrassGeometryLodTier) {
    const key = `${id}:${tier}`
    let tpl = tieredTemplateCache.get(key)
    if (!tpl) {
      tpl = buildFinCluster(GEOMETRY_LOD_FINS[id][tier])
      tieredTemplateCache.set(key, tpl)
    }
    return tpl
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

  function buildGrassChunkMeshes(
    data: GrassChunkData,
    chunkOriginX: number,
    chunkOriginZ: number,
  ): WorldGrassChunk | null {
    const group = new THREE.Group()
    group.position.set(chunkOriginX, 0, chunkOriginZ)
    group.name = 'chunk-grass'

    type SubMesh = {
      mesh: THREE.InstancedMesh
      fullCount: number
      filler: boolean
      // Per-tier geometries, built lazily as `setGeometryLod` actually visits
      // them and kept around (not disposed) for cheap re-swaps if the chunk's
      // distance band oscillates. `null` on the filler bucket, which never
      // participates in geometry LOD (see `WorldGrassChunk.setGeometryLod`).
      geometryForTier: ((tier: GrassGeometryLodTier) => THREE.BufferGeometry) | null
      geometryCache: Partial<Record<GrassGeometryLodTier, THREE.BufferGeometry>>
    }
    const subMeshes: SubMesh[] = []
    let totalCount = 0

    for (const id of GRASS_SPECIES_ORDER) {
      const bucket = data[id]
      if (!bucket) continue
      totalCount += bucket.count
      const isFiller = id === 'filler'

      // Instanced (per-blade) attributes are shared by reference across every
      // tier's geometry below — three.js's WebGLAttributes caches GPU buffers
      // by attribute object identity, so attaching the same object to several
      // BufferGeometrys uploads it once, not once per tier.
      const aPhase = new THREE.InstancedBufferAttribute(bucket.phases, 1)
      const aBaseColor = new THREE.InstancedBufferAttribute(bucket.baseColors, 3)
      const aTipColor = new THREE.InstancedBufferAttribute(bucket.tipColors, 3)
      const aWindFactor = new THREE.InstancedBufferAttribute(bucket.windFactors, 1)

      function buildTierGeometry(tier: GrassGeometryLodTier): THREE.BufferGeometry {
        const tpl = isFiller ? fillerTemplate : tieredTemplate(id as TieredSpeciesId, tier)
        const geometry = new THREE.BufferGeometry()
        // Clone the shape template's position/index rather than referencing
        // it directly — this geometry's `dispose()` (on tier-cache teardown)
        // frees every attribute it holds, and referencing the template by
        // identity would free the GPU buffer backing every other chunk's/
        // tier's blade shape too. Cheap: a few dozen vertices per template.
        geometry.setAttribute('position', tpl.position.clone())
        geometry.setIndex(tpl.index.clone())
        geometry.setAttribute('aPhase', aPhase)
        geometry.setAttribute('aBaseColor', aBaseColor)
        geometry.setAttribute('aTipColor', aTipColor)
        geometry.setAttribute('aWindFactor', aWindFactor)
        return geometry
      }

      const geometryCache: Partial<Record<GrassGeometryLodTier, THREE.BufferGeometry>> = {}
      function geometryForTier(tier: GrassGeometryLodTier): THREE.BufferGeometry {
        let geo = geometryCache[tier]
        if (!geo) {
          geo = buildTierGeometry(tier)
          geometryCache[tier] = geo
        }
        return geo
      }

      const mesh = new THREE.InstancedMesh(geometryForTier('near'), material, bucket.count)
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(bucket.matrices, 16)
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere() // instance matrices spread well beyond the unit template's own bounds
      // No sun shadows — dense fin clusters painted black contact blobs under
      // every tuft (reads as plastic stickers). Terrain AO still softens a bit.
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.name = `chunk-grass-${id}`
      // Skipped by the water mirror: grass is by far the heaviest bucket
      // (~2.4M of the scene's ~5.7M triangles at 84k instances) and a blade is
      // far below one texel of the 128² reflection target, which itself
      // contributes ≤18 % of the water colour. `layers.set` is safe here — the
      // sun's shadow camera never draws grass anyway (`castShadow = false`
      // below), so the main camera is the only one that needs this layer.
      mesh.layers.set(REFLECTION_SKIPPED_LAYER)
      // Filler starts hidden; chunkManager enables it only in the near field.
      if (isFiller) mesh.count = 0
      group.add(mesh)
      subMeshes.push({
        mesh,
        fullCount: bucket.count,
        filler: isFiller,
        geometryForTier: isFiller ? null : geometryForTier,
        geometryCache,
      })
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
      setGeometryLod(tier) {
        for (const sub of subMeshes) {
          if (!sub.geometryForTier) continue
          const next = sub.geometryForTier(tier)
          if (sub.mesh.geometry !== next) sub.mesh.geometry = next
        }
      },
      setDebugVisible(mainVisible, fillerVisible) {
        for (const sub of subMeshes) sub.mesh.visible = sub.filler ? fillerVisible : mainVisible
      },
      dispose: () => {
        group.removeFromParent()
        for (const sub of subMeshes) {
          // Dispose every tier geometry actually built for this bucket, not
          // just the currently-active one — each holds its own cloned
          // position/index GPU buffers. The instanced attributes (aPhase etc.)
          // are shared across tiers; three.js's WebGLAttributes disposal is
          // keyed by attribute identity, so freeing the same shared attribute
          // via more than one geometry here is a safe no-op past the first.
          for (const geo of Object.values(sub.geometryCache)) geo?.dispose()
          sub.mesh.dispose() // frees instanceMatrix's own GPU buffer — geometry.dispose() alone does not
        }
      },
    }
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
    const data = computeChunkGrass(
      { cx: coord.cx, cz: coord.cz, chunkSize, resolution, waterLevel, heightScale, seed, candidatesPerChunk, region },
      {
        heights: tile.heights,
        biomes: tile.biomes,
        roadTint: tile.roadTint,
        mountainRidge: tile.mountainRidge,
        moistureRegion: tile.moistureRegion,
      },
    )
    return buildGrassChunkMeshes(data, chunkOriginX, chunkOriginZ)
  }

  return {
    createChunkGrass,
    buildGrassChunkMeshes,
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
