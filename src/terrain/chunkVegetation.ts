import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import { MathUtils } from 'three'
import type { ChunkCoord } from './chunkGrid'
import { createSeededRandom } from '../world/parseSeed'
import {
  coastalFactor,
  envGrowthFactor,
  PINE_SPECIES_INDICES,
  rollLivingAge,
  rollSizeClass,
  speciesPrefs,
  TREE_SPECIES_PREFS,
  type TreeEnvSample,
  type TreeLivingAge,
  type TreeSizeClass,
} from '../world/treeLifecycle'
import { biomeWeightsAt, forestDensityAt } from './biomeRegions'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  sampleApronGrid,
  type VegetationKind,
} from './chunkHeightmap'
import { isInsideRiverChannel, nearestRiverBankDistance } from './riverNetwork'

export type VegetationPlacement = {
  x: number
  z: number
  kind: VegetationKind
  /** Index into `TREE_SPECS`/`BUSH_SPECS`/`CACTUS_SPECS`/`REED_SPECS`
   *  (`props.ts`), resolved on the main thread. */
  speciesIndex: number
  /** For non-trees: final mesh scale. For trees: unused (sizeJitter used instead). */
  scale: number
  rotationY: number
  /** Explicit lifecycle stage for trees (plans 058 / 073). Absent for bushes/etc. */
  growthStage?: TreeLivingAge
  /** Independent size class (plan 073). Trees only. */
  sizeClass?: TreeSizeClass
  /** 0..1 jitter inside height ranges (plan 073). Trees only. */
  sizeJitter?: number
}

/** Baseline candidates on open / weak-forest land. Dense forest adds
 *  `FOREST_EXTRA_CANDIDATES` on top (plan 063 — probability alone cannot
 *  densify past a fixed budget).
 *  Deep forest (fd≈1) → ~100 candidates → ~6–7 m mean tree spacing on a
 *  64² chunk when acceptance is high; open land stays sparse. */
const BASE_CANDIDATES_PER_CHUNK = 16
const FOREST_EXTRA_CANDIDATES = 90
const SLOPE_SAMPLE_STEP = 1.5
/** Reject candidates on slopes steeper than this (roughly matches where
 *  `applySlopeRock` starts taking over visually). */
const SLOPE_REJECT = 0.9
/** Treeline — fraction of `heightScale` above `waterLevel` above which nothing
 *  grows. Raised from 0.6 (world-terrain-006) alongside `biomeRegions.ts`'s
 *  `forestDensityAt` altitude fade so the hard cutoff sits past where density
 *  has actually tapered to near-zero, instead of chopping off a still-tapering
 *  slope. Ridge crests stay bare via `MOUNTAIN_RIDGE_REJECT` regardless. */
const TREELINE_ALTITUDE = 0.66
/** Reject candidates sitting on a strong mountain ridge crest, regardless of altitude. */
const MOUNTAIN_RIDGE_REJECT = 0.35
/** Reject candidates sitting on a road/path corridor (`tile.roadTint`, `chunkHeightmap.ts`). */
const ROAD_TINT_REJECT = 0.15
/** Outside strong forest, retain a small chance of isolated trees. */
const OPEN_TREE_BASELINE = 0.10
/** Altitude band (fraction of `heightScale` above `waterLevel`) treated as
 *  "wet shoreline" for reed placement near any lake, not only swamp biome. */
const WATERLINE_ALTITUDE_BAND = 0.06

/** Deep Forest age/size skew (plan 182) — exponent applied to a fresh 0..1
 *  roll so it favours the "large"/"old" end of `rollSizeClass`/`rollLivingAge`
 *  as `forestDensity` climbs toward the deepForest core, without touching
 *  their shared global weights (which stay the baseline for open/weak-forest
 *  land, exponent ≈1). Continuous in `forestDensity`, not a `forestBiomeAt`
 *  step, so the size/age silhouette still thickens gradually into a deep
 *  forest rather than jumping at the classification boundary. */
const DEEP_SIZE_BIAS_MAX = 1.8
const DEEP_AGE_BIAS_MAX = 1.6

/** Skews `random01` toward 1 (biases `rollSizeClass` toward `large`) as
 *  `bias` grows past 1; `bias === 1` is a no-op (identity). */
function biasHigh(random01: number, bias: number): number {
  return 1 - (1 - random01) ** bias
}

/** Skews `random01` toward 0 (biases `rollLivingAge`'s `oldRoll` — smaller
 *  values are more likely `old`, see `rollLivingAge`) as `bias` grows past 1. */
function biasLow(random01: number, bias: number): number {
  return random01 ** bias
}

/** Forest density above which the existing `meadowNoise` field (shared with
 *  `flowerMeadowPatches`) also starts softly thinning *tree* candidates —
 *  irregular, world-space, cross-chunk clearings inside dense/deep forest
 *  (plan 182 §7), not a new noise field or a hard tree-removal mask. Ordinary
 *  open/weak-forest land (below the gate) is unaffected — meadow noise there
 *  still only drives flower patches, unchanged. */
const DEEP_CLEARING_FOREST_GATE_START = 0.4
const DEEP_CLEARING_FOREST_GATE_FULL = 0.65
const DEEP_CLEARING_MEADOW_START = 0.4
const DEEP_CLEARING_MEADOW_FULL = 0.78
/** Max fraction of tree-acceptance density a clearing can remove — a strong
 *  thinning, never a full hole (irregular/gradual per plan §7, not chunk-hard). */
const DEEP_CLEARING_MAX_THIN = 0.65

/** Per-chunk hash so nearby chunks don't get correlated candidate layouts. */
function hashChunk(cx: number, cz: number): number {
  let h = (cx * 374761393 + cz * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

// --- Low-frequency noise fields shared by every chunk (world-space, not
// per-chunk-seeded) so neighboring chunks agree on where a species cluster or
// meadow patch continues — cached per world seed since `computeChunkVegetation`
// runs once per chunk request, worker-side. ---
let cachedSeed: number | undefined
let clumpNoiseFn: NoiseFunction2D | undefined
let meadowNoiseFn: NoiseFunction2D | undefined

function noiseFieldsFor(seed: number): { clump: NoiseFunction2D, meadow: NoiseFunction2D } {
  if (cachedSeed !== seed || !clumpNoiseFn || !meadowNoiseFn) {
    clumpNoiseFn = createNoise2D(createSeededRandom(seed ^ 0x3c6ef372))
    meadowNoiseFn = createNoise2D(createSeededRandom(seed ^ 0x6d3a01b1))
    cachedSeed = seed
  }
  return { clump: clumpNoiseFn, meadow: meadowNoiseFn }
}

/** 0..1, low frequency — same value nearby candidates (even across chunk
 *  borders) mostly share, so a same-species stand or a bare patch reads as a
 *  real cluster rather than single-candidate noise. */
function fieldAt(noise: NoiseFunction2D, x: number, z: number, freq: number): number {
  return noise(x * freq, z * freq) * 0.5 + 0.5
}

/** Weighted species pick from `TREE_SPECIES_PREFS` habitat suitability
 *  (`envGrowthFactor` — the same function that governs growth rate, so
 *  "likely to be found here" and "grows well here" stay one definition, not
 *  two that can drift apart). `clumpValue` (a low-frequency field shared by
 *  nearby candidates, even across chunk borders) dominates the roll so a
 *  stand tends to repeat one species; per-candidate `random()` keeps some
 *  variety at a stand's edges instead of a hard-edged species band. */
function pickTreeSpecies(
  env: TreeEnvSample,
  speciesCount: number,
  clumpValue: number,
  random: () => number,
): number {
  const count = Math.max(1, Math.min(speciesCount, TREE_SPECIES_PREFS.length))
  if (count <= 1) return 0
  let total = 0
  const weights: number[] = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    const w = envGrowthFactor(env, speciesPrefs(i))
    weights[i] = w
    total += w
  }
  if (total <= 0) return Math.floor(random() * count)
  const roll = (clumpValue * 0.65 + random() * 0.35) * total
  let acc = 0
  for (let i = 0; i < count; i++) {
    acc += weights[i]!
    if (roll <= acc) return i
  }
  return count - 1
}

/**
 * Deterministic, worker-safe per-chunk vegetation placement — pure data only
 * (no `THREE.Object3D`/GLTF; workers can't touch either), instantiated into
 * actual meshes on the main thread (`chunkManager.ts`). Macro forest density
 * (`forestDensityAt`, plan 063) drives large-scale tree concentration; local
 * `clumpNoise` + fine moisture keep stands from reading as uniform carpets.
 * Callers skip this for pinned `homeChunks` — the settlement keeps its own
 * bespoke layout (`props.ts`).
 */
export function computeChunkVegetation(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
): VegetationPlacement[] {
  if (params.isHomeChunk) return []

  const { chunkSize, resolution, waterLevel, heightScale, region } = params
  const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, resolution)
  const random = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x76a5c)

  const sample = (grid: Float32Array, x: number, z: number) =>
    sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

  const placements: VegetationPlacement[] = []
  const half = chunkSize / 2
  const { clump: clumpNoise, meadow: meadowNoise } = noiseFieldsFor(params.seed)

  // Chunk-centre forest estimate sets the candidate budget. Linear in forest
  // density so mid/edge forest also densifies (squaring left mid-forest too open).
  const centerX = coord.cx * chunkSize
  const centerZ = coord.cz * chunkSize
  const centerH = sample(tile.heights, centerX, centerZ)
  const centerAltitude = (centerH - waterLevel) / Math.max(heightScale, 0.001)
  const centerForest = forestDensityAt(
    sample(tile.moistureRegion, centerX, centerZ),
    centerAltitude,
    sample(tile.continentalness, centerX, centerZ),
    sample(tile.mountainRidge, centerX, centerZ),
    region,
  )
  const candidateCount = Math.round(
    BASE_CANDIDATES_PER_CHUNK + FOREST_EXTRA_CANDIDATES * centerForest,
  )

  for (let i = 0; i < candidateCount; i++) {
    const localX = (random() * 2 - 1) * half
    const localZ = (random() * 2 - 1) * half
    const wx = coord.cx * chunkSize + localX
    const wz = coord.cz * chunkSize + localZ

    const h = sample(tile.heights, wx, wz)
    if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, wx, wz)) continue // river channel
    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    const ridge = sample(tile.mountainRidge, wx, wz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    const forestDensity = forestDensityAt(
      moistureRegion,
      altitude,
      continentalness,
      ridge,
      region,
    )

    // Reeds tolerate growing right at the waterline; everything else needs
    // to clear the shore. Non-swamp clearance is looser than before (was
    // 0.5) so lake-edge candidates survive to reach the `nearWaterline` reed
    // branch below instead of being rejected before `kind` is even decided.
    const waterClearance = biome.swamp > 0.4 ? 0.05 : 0.3
    if (h <= waterLevel + waterClearance) continue // underwater/shoreline

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
        Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
      (2 * d)
    if (slope > SLOPE_REJECT) continue // cliff/steep face

    if (altitude > TREELINE_ALTITUDE) continue // above treeline

    if (ridge > MOUNTAIN_RIDGE_REJECT) continue // bare ridge crest

    if (sample(tile.roadTint, wx, wz) > ROAD_TINT_REJECT) continue // road/path corridor

    const moisture = sample(tile.biomes, wx, wz)
    // Low-frequency field shared across chunk borders — local density drift
    // inside a forest region (plan 044 4.5: avoid mechanically even spacing).
    const clumpValue = fieldAt(clumpNoise, wx, wz, 0.015)
    // Macro forest density dominates acceptance. Clump varies locally but
    // stays high enough in deep forest that most candidates land as trees
    // (~6–7 m mean spacing), not a thinned park.
    const local = 0.72 + clumpValue * 0.45
    let density =
      (OPEN_TREE_BASELINE + forestDensity * (1.05 - OPEN_TREE_BASELINE)) *
      (1 - biome.desert * 0.65) *
      local *
      (0.85 + moisture * 0.15)

    // Soft, irregular clearings inside dense/deep forest (plan 182 §7) —
    // reuses `meadowNoise` (same field `flowerMeadowPatches` reads) as a
    // density modifier rather than a hard tree-removal mask, gated so
    // open/weak-forest land is untouched.
    const clearingGate = MathUtils.smoothstep(
      forestDensity,
      DEEP_CLEARING_FOREST_GATE_START,
      DEEP_CLEARING_FOREST_GATE_FULL,
    )
    if (clearingGate > 0) {
      const meadowValue = fieldAt(meadowNoise, wx, wz, MEADOW_NOISE_FREQ)
      const clearingStrength =
        clearingGate * MathUtils.smoothstep(meadowValue, DEEP_CLEARING_MEADOW_START, DEEP_CLEARING_MEADOW_FULL)
      density *= 1 - clearingStrength * DEEP_CLEARING_MAX_THIN
    }

    if (random() > Math.min(1, density)) continue

    // Shoreline reeds near ordinary (non-swamp) lake/river water are now the
    // dedicated `riparianPatches()` pass below (plan world-terrain-010) —
    // coherent patches instead of competing per-candidate here. Swamp biome
    // keeps its own reed weighting since that is a biome-wide condition, not
    // a shoreline-proximity one.
    let kind: VegetationPlacement['kind']
    if (biome.desert > 0.5 && random() < biome.desert) {
      kind = random() < 0.75 ? 'cactus' : 'bush'
    } else if (biome.swamp > 0.5 && random() < biome.swamp) {
      kind = random() < 0.8 ? 'reed' : 'tree'
    } else {
      // Deep forest prefers trees; open temperate keeps more bushes.
      const bushChance = (0.15 + (1 - moisture) * 0.35) * (1 - forestDensity * 0.85)
      kind = random() < bushChance ? 'bush' : 'tree'
    }

    const speciesCount = params.vegetationSpeciesCount[kind]
    const speciesIndex =
      kind === 'tree'
        ? pickTreeSpecies(
            { biome, moisture, altitude01: altitude, mountainRidge: ridge, coastal: coastalFactor(continentalness, region.coastThreshold) },
            Math.max(1, speciesCount),
            clumpValue,
            random,
          )
        : Math.floor(random() * Math.max(1, speciesCount))
    // Trees: sizeClass + living age (plan 073). Height comes from meter ranges
    // at render time — no TreeState ownership here (058 / 063).
    let growthStage: VegetationPlacement['growthStage']
    let sizeClass: TreeSizeClass | undefined
    let sizeJitter: number | undefined
    let scale: number
    if (kind === 'bush' || kind === 'cactus') {
      scale = 0.6 + random() * 0.5
    } else if (kind === 'tree') {
      const saplingChance = 0.22 - forestDensity * 0.14
      const youngChance = 0.18 - forestDensity * 0.06
      // Deep Forest silhouette (plan 182 §5): as forestDensity climbs toward
      // the deepForest core, skew the sizeClass/old rolls toward large/old
      // instead of touching `SIZE_CLASS_WEIGHTS`/`OLD_SPAWN_CHANCE` globally —
      // open/weak-forest land keeps today's unbiased distribution (bias ≈1).
      const sizeBias = 1 + forestDensity * DEEP_SIZE_BIAS_MAX
      const ageBias = 1 + forestDensity * DEEP_AGE_BIAS_MAX
      sizeClass = rollSizeClass(biasHigh(random(), sizeBias))
      sizeJitter = random()
      growthStage = rollLivingAge({
        sizeClass,
        ageRoll: random(),
        oldRoll: biasLow(random(), ageBias),
        saplingChance,
        youngChance,
      })
      scale = sizeJitter
    } else {
      scale = 0.7 + random() * 0.6
    }
    const rotationY = random() * Math.PI * 2

    placements.push({
      x: wx,
      z: wz,
      kind,
      speciesIndex,
      scale,
      rotationY,
      ...(growthStage ? { growthStage } : {}),
      ...(sizeClass ? { sizeClass } : {}),
      ...(sizeJitter !== undefined ? { sizeJitter } : {}),
    })
  }

  placements.push(...flowerMeadowPatches(coord, tile, params, sample, meadowNoise))
  placements.push(
    ...fernPatches(coord, tile, params, sample, placements.filter((p) => p.kind === 'tree')),
  )
  placements.push(...riparianPatches(coord, tile, params, sample, clumpNoise))
  placements.push(...lilyPatches(coord, tile, params, sample))
  placements.push(...seaweedPatches(coord, tile, params, sample))

  return placements
}

/** Index into `BUSH_SPECS` (`props.ts`) — must match the flower-model entries
 *  appended there (`flower_clump_1`, `flower_clump_2`, `bush_flowers_1`). */
const FLOWER_BUSH_SPECIES_INDICES = [2, 3, 4]
const MEADOW_NOISE_FREQ = 0.018
const MEADOW_THRESHOLD = 0.62
const MEADOW_CANDIDATES_PER_CHUNK = 2
const MEADOW_PATCH_MIN_COUNT = 5
const MEADOW_PATCH_MAX_EXTRA = 9
const MEADOW_PATCH_RADIUS = 2.6
/** Meadows only form well below the treeline — alpine ground stays bare. */
const MEADOW_ALTITUDE_LIMIT = TREELINE_ALTITUDE * 0.7
/** Patches want fairly flat, ordinary grassland — not desert/swamp/steep. */
const MEADOW_SLOPE_REJECT = SLOPE_REJECT * 0.6

/**
 * Clustered flower patches ("polany kwiatów", plan 044 §3.1) — a handful of
 * candidate patch centers per chunk; ones that clear a low-frequency meadow
 * noise threshold (shared across chunk borders, so a meadow can straddle a
 * chunk seam) spawn an irregular ring of individual flower placements around
 * them. Reuses the existing `bush` vegetation kind/pipeline (no new
 * `VegetationPlacement.kind`, no worker-protocol change) — just forces
 * `speciesIndex` into the flower-only subset of `BUSH_SPECS`.
 */
function flowerMeadowPatches(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
  sample: (grid: Float32Array, x: number, z: number) => number,
  meadowNoise: NoiseFunction2D,
): VegetationPlacement[] {
  const { chunkSize, waterLevel, heightScale, region } = params
  const half = chunkSize / 2
  const patchRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x5f2a3d)
  const out: VegetationPlacement[] = []

  for (let i = 0; i < MEADOW_CANDIDATES_PER_CHUNK; i++) {
    const cx = coord.cx * chunkSize + (patchRandom() * 2 - 1) * half
    const cz = coord.cz * chunkSize + (patchRandom() * 2 - 1) * half

    const mask = fieldAt(meadowNoise, cx, cz, MEADOW_NOISE_FREQ)
    if (mask < MEADOW_THRESHOLD) continue

    const h = sample(tile.heights, cx, cz)
    if (h <= waterLevel + 0.5) continue
    if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, cx, cz)) continue
    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    if (altitude > MEADOW_ALTITUDE_LIMIT) continue

    const moistureRegion = sample(tile.moistureRegion, cx, cz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    if (biome.desert > 0.3 || biome.swamp > 0.3) continue

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(tile.heights, cx + d, cz) - sample(tile.heights, cx - d, cz)) +
        Math.abs(sample(tile.heights, cx, cz + d) - sample(tile.heights, cx, cz - d))) /
      (2 * d)
    if (slope > MEADOW_SLOPE_REJECT) continue
    if (sample(tile.roadTint, cx, cz) > ROAD_TINT_REJECT) continue

    // How far this spot clears the threshold drives patch size — patches
    // near the noise peak read as bigger meadows, ones just past the cutoff
    // as small clumps.
    const strength = (mask - MEADOW_THRESHOLD) / (1 - MEADOW_THRESHOLD)
    const count = MEADOW_PATCH_MIN_COUNT + Math.floor(strength * MEADOW_PATCH_MAX_EXTRA * patchRandom())
    const patchRadius = MEADOW_PATCH_RADIUS * (0.7 + strength * 0.8)

    for (let j = 0; j < count; j++) {
      const a = patchRandom() * Math.PI * 2
      const r = Math.sqrt(patchRandom()) * patchRadius
      const fx = cx + Math.cos(a) * r
      const fz = cz + Math.sin(a) * r
      const fh = sample(tile.heights, fx, fz)
      if (fh <= waterLevel + 0.4) continue
      if (sample(tile.roadTint, fx, fz) > ROAD_TINT_REJECT) continue
      if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, fx, fz)) continue

      out.push({
        x: fx,
        z: fz,
        kind: 'bush',
        speciesIndex: FLOWER_BUSH_SPECIES_INDICES[Math.floor(patchRandom() * FLOWER_BUSH_SPECIES_INDICES.length)]!,
        scale: 0.5 + patchRandom() * 0.7,
        rotationY: patchRandom() * Math.PI * 2,
      })
    }
  }

  return out
}

const FERN_CANDIDATES_PER_CHUNK = 3
const FERN_CLUSTER_MIN_COUNT = 2
const FERN_CLUSTER_MAX_EXTRA = 4
const FERN_CLUSTER_RADIUS = 1.8
/** Same-chunk-only proximity check (mirrors `chunkItems.ts`'s `nearTree` —
 *  no cross-chunk lookups here either). */
const FERN_PINE_RADIUS = 8
/** Minimum combined forest/swamp habitat before a fern candidate is even
 *  considered — keeps ferns out of thin, marginal habitat. */
const FERN_HABITAT_MIN = 0.15
/** How much a nearby pine (`PINE_SPECIES_INDICES`) nudges habitat up — a
 *  bonus, not a requirement (implementation notes: ferns belong under
 *  broadleaf forest too, not only beside conifers). */
const FERN_PINE_BONUS = 0.25

/**
 * Forest-floor undergrowth (`VegetationKind: 'fern'`, plan 140) — a second,
 * low-candidate pass (poszycie, not a carpet) seeding small loose clusters
 * where `forestDensity` or swamp/wet ground is high. Mirrors
 * `flowerMeadowPatches`'s patch-center-then-scatter shape, but gated on
 * habitat suitability instead of a meadow noise threshold, and rejecting
 * desert/road/treeline/steep-slope like the main tree/bush pass.
 */
function fernPatches(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
  sample: (grid: Float32Array, x: number, z: number) => number,
  treePlacements: readonly VegetationPlacement[],
): VegetationPlacement[] {
  const { chunkSize, waterLevel, heightScale, region } = params
  const half = chunkSize / 2
  const fernRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x2b7f19)
  const fernSpeciesCount = Math.max(1, params.vegetationSpeciesCount.fern)
  const out: VegetationPlacement[] = []

  const pineNear = (x: number, z: number): boolean =>
    treePlacements.some(
      (t) => PINE_SPECIES_INDICES.includes(t.speciesIndex) && Math.hypot(t.x - x, t.z - z) <= FERN_PINE_RADIUS,
    )

  for (let i = 0; i < FERN_CANDIDATES_PER_CHUNK; i++) {
    const cx = coord.cx * chunkSize + (fernRandom() * 2 - 1) * half
    const cz = coord.cz * chunkSize + (fernRandom() * 2 - 1) * half

    const h = sample(tile.heights, cx, cz)
    if (h <= waterLevel + 0.3) continue // underwater/shoreline
    if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, cx, cz)) continue
    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    if (altitude > TREELINE_ALTITUDE) continue // above treeline

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(tile.heights, cx + d, cz) - sample(tile.heights, cx - d, cz)) +
        Math.abs(sample(tile.heights, cx, cz + d) - sample(tile.heights, cx, cz - d))) /
      (2 * d)
    if (slope > SLOPE_REJECT) continue // steep slope
    if (sample(tile.roadTint, cx, cz) > ROAD_TINT_REJECT) continue // road/path corridor

    const moistureRegion = sample(tile.moistureRegion, cx, cz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    if (biome.desert > 0.25) continue // no ferns on dry ground

    const continentalness = sample(tile.continentalness, cx, cz)
    const ridge = sample(tile.mountainRidge, cx, cz)
    const forestDensity = forestDensityAt(moistureRegion, altitude, continentalness, ridge, region)

    // Base habitat: dense forest (broadleaf or conifer) or swamp/wet ground.
    // A nearby pine only nudges this up — never the sole qualifier.
    let habitat = Math.max(forestDensity, biome.swamp)
    if (pineNear(cx, cz)) habitat = Math.min(1, habitat + FERN_PINE_BONUS)
    if (habitat < FERN_HABITAT_MIN) continue
    if (fernRandom() > habitat) continue

    const count = FERN_CLUSTER_MIN_COUNT + Math.floor(fernRandom() * FERN_CLUSTER_MAX_EXTRA)
    for (let j = 0; j < count; j++) {
      const a = fernRandom() * Math.PI * 2
      const r = Math.sqrt(fernRandom()) * FERN_CLUSTER_RADIUS
      const fx = cx + Math.cos(a) * r
      const fz = cz + Math.sin(a) * r
      const fh = sample(tile.heights, fx, fz)
      if (fh <= waterLevel + 0.2) continue
      if (sample(tile.roadTint, fx, fz) > ROAD_TINT_REJECT) continue
      if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, fx, fz)) continue

      out.push({
        x: fx,
        z: fz,
        kind: 'fern',
        speciesIndex: Math.floor(fernRandom() * fernSpeciesCount),
        scale: 0.6 + fernRandom() * 0.5,
        rotationY: fernRandom() * Math.PI * 2,
      })
    }
  }

  return out
}

const RIPARIAN_CANDIDATES_PER_CHUNK = 3
const RIPARIAN_PATCH_MIN_COUNT = 3
const RIPARIAN_PATCH_MAX_EXTRA = 4
const RIPARIAN_PATCH_RADIUS = 2.4
/** Max lateral distance from a river's water edge (or the lake-shoreline
 *  band below) treated as riparian habitat — the plan's water -> reeds ->
 *  ferns/wet shrubs -> riparian trees -> ordinary vegetation transition
 *  unfolds across this band (plan world-terrain-010). */
const RIPARIAN_BAND = 6
const RIPARIAN_REED_BAND = 1.6
const RIPARIAN_FERN_BAND = 3.4
/** Chance a riparian reed candidate picks the merged multi-stalk cluster
 *  (`REED_SPECS[1]`, plan world-terrain-010 Phase 5) over a single reed —
 *  denser visual reed beds along the water edge without more placements/
 *  instances. Only applies when a cluster variant actually exists
 *  (`vegetationSpeciesCount.reed > 1`), so test fixtures with one reed spec
 *  degrade to the old uniform pick. */
const REED_CLUSTER_BIAS = 0.65
/** Fraction of otherwise-eligible outer-band candidates left as open
 *  shoreline instead of a tree — "long sections of relatively open
 *  shoreline must remain possible" (plan world-terrain-010, Phase 4). */
const RIPARIAN_OPEN_SHORE_CHANCE = 0.25

/** Riparian distance for `(x, z)`: the nearest river's water-edge distance
 *  when a river is close by, or an equivalent distance derived from the
 *  existing lake "wet shoreline" altitude band (`WATERLINE_ALTITUDE_BAND`,
 *  gated the same way the old in-loop reed branch was — moist, non-desert —
 *  so a dry sandy ocean beach still doesn't qualify) otherwise. `null` when
 *  neither habitat is nearby. Purely a local per-point read — never
 *  persists/derives a cross-chunk lake identity (implementation notes §7). */
function riparianDistanceAt(
  params: ChunkTileParams,
  x: number,
  z: number,
  altitude: number,
  moisture: number,
  biomeDesert: number,
): number | null {
  if (params.riverSegments.length > 0) {
    const d = nearestRiverBankDistance(params.riverSegments, x, z)
    if (d !== null && d >= 0 && d <= RIPARIAN_BAND) return d
  }
  if (altitude >= 0 && altitude < WATERLINE_ALTITUDE_BAND && biomeDesert < 0.35 && moisture > 0.35) {
    return (altitude / WATERLINE_ALTITUDE_BAND) * RIPARIAN_BAND
  }
  return null
}

/**
 * Dedicated riparian/aquatic vegetation pass (plan world-terrain-010) —
 * coherent patches of shoreline plants along rivers/streams and lake edges,
 * replacing the old in-loop "bump reed probability near water" heuristic
 * (see the removed `nearWaterline` branch above). Mirrors `fernPatches`'s
 * patch-center-then-scatter shape; each scattered point independently
 * re-checks its own distance-from-water so one patch can span the
 * water -> reed -> fern/wet-shrub -> riparian-tree transition instead of
 * committing a whole patch to one kind. Bounded budget, independent of
 * shoreline length/ocean area (per-chunk candidate count is fixed).
 */
function riparianPatches(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
  sample: (grid: Float32Array, x: number, z: number) => number,
  clumpNoise: NoiseFunction2D,
): VegetationPlacement[] {
  const { chunkSize, waterLevel, heightScale, region } = params
  const half = chunkSize / 2
  const riparianRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x4e1d7a)
  const out: VegetationPlacement[] = []

  const place = (x: number, z: number): void => {
    const h = sample(tile.heights, x, z)
    if (h <= waterLevel + 0.05) return // still underwater
    if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, x, z)) return
    if (sample(tile.roadTint, x, z) > ROAD_TINT_REJECT) return

    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, x, z)
    const moisture = sample(tile.biomes, x, z)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    const dist = riparianDistanceAt(params, x, z, altitude, moisture, biome.desert)
    if (dist === null) return

    if (dist < RIPARIAN_REED_BAND) {
      const reedSpeciesCount = Math.max(1, params.vegetationSpeciesCount.reed)
      const speciesIndex =
        reedSpeciesCount > 1 && riparianRandom() < REED_CLUSTER_BIAS
          ? 1
          : Math.floor(riparianRandom() * reedSpeciesCount)
      out.push({
        x,
        z,
        kind: 'reed',
        speciesIndex,
        scale: 0.7 + riparianRandom() * 0.6,
        rotationY: riparianRandom() * Math.PI * 2,
      })
      return
    }
    if (dist < RIPARIAN_FERN_BAND) {
      const kind: VegetationPlacement['kind'] = riparianRandom() < 0.6 ? 'fern' : 'bush'
      out.push({
        x,
        z,
        kind,
        speciesIndex: Math.floor(riparianRandom() * Math.max(1, params.vegetationSpeciesCount[kind])),
        scale: 0.6 + riparianRandom() * 0.5,
        rotationY: riparianRandom() * Math.PI * 2,
      })
      return
    }

    const ridge = sample(tile.mountainRidge, x, z)
    if (altitude > TREELINE_ALTITUDE || ridge > MOUNTAIN_RIDGE_REJECT) return
    if (riparianRandom() < RIPARIAN_OPEN_SHORE_CHANCE) return

    const continentalness = sample(tile.continentalness, x, z)
    const clumpValue = fieldAt(clumpNoise, x, z, 0.015)
    const speciesIndex = pickTreeSpecies(
      {
        biome,
        moisture,
        altitude01: altitude,
        mountainRidge: ridge,
        coastal: coastalFactor(continentalness, region.coastThreshold),
      },
      Math.max(1, params.vegetationSpeciesCount.tree),
      clumpValue,
      riparianRandom,
    )
    const sizeJitter = 0.4 + riparianRandom() * 0.4
    out.push({
      x,
      z,
      kind: 'tree',
      speciesIndex,
      scale: sizeJitter,
      rotationY: riparianRandom() * Math.PI * 2,
      growthStage: 'mature',
      sizeClass: 'medium',
      sizeJitter,
    })
  }

  for (let i = 0; i < RIPARIAN_CANDIDATES_PER_CHUNK; i++) {
    const cx = coord.cx * chunkSize + (riparianRandom() * 2 - 1) * half
    const cz = coord.cz * chunkSize + (riparianRandom() * 2 - 1) * half

    const h = sample(tile.heights, cx, cz)
    if (h <= waterLevel + 0.05) continue
    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, cx, cz)
    const moisture = sample(tile.biomes, cx, cz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    if (riparianDistanceAt(params, cx, cz, altitude, moisture, biome.desert) === null) continue

    place(cx, cz)
    const count = RIPARIAN_PATCH_MIN_COUNT + Math.floor(riparianRandom() * RIPARIAN_PATCH_MAX_EXTRA)
    for (let j = 0; j < count; j++) {
      const a = riparianRandom() * Math.PI * 2
      const r = Math.sqrt(riparianRandom()) * RIPARIAN_PATCH_RADIUS
      place(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
    }
  }

  return out
}

const LILY_CANDIDATES_PER_CHUNK = 2
const LILY_PATCH_MIN_COUNT = 2
const LILY_PATCH_MAX_EXTRA = 4
const LILY_PATCH_RADIUS = 2.2
/** Inland lake only — excludes ocean, matching `waterBodies.ts`'s own
 *  "< 0.9 reads as lake, 1 reads as ocean" convention (implementation
 *  notes §7). */
const LILY_MAX_BODY_SCALE = 0.9
/** Shallow-water bias (world units of depth below `waterLevel`) — avoids
 *  carpeting a lake's open deep water (plan world-terrain-010, Phase 6). */
const LILY_MAX_DEPTH = 1.0

/**
 * Lightweight lily-pad clusters for suitable inland water (plan
 * world-terrain-010, Phase 6). Patch-based and explicitly bounded per chunk,
 * same shape as `fernPatches`/`riparianPatches`. Rejects ocean (`bodyScale`),
 * deep water and any river channel (fast-flowing water) by construction —
 * lily pads only ever land on genuinely still, shallow inland water.
 */
function lilyPatches(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
  sample: (grid: Float32Array, x: number, z: number) => number,
): VegetationPlacement[] {
  const { chunkSize, waterLevel } = params
  const half = chunkSize / 2
  const lilyRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x1a2f6e)
  const speciesCount = Math.max(1, params.vegetationSpeciesCount.lily)
  const out: VegetationPlacement[] = []

  const eligible = (x: number, z: number): boolean => {
    const bodyScale = sample(tile.bodyScale, x, z)
    if (bodyScale <= 0 || bodyScale >= LILY_MAX_BODY_SCALE) return false // land or ocean
    const depth = waterLevel - sample(tile.floorHeights, x, z)
    if (depth <= 0 || depth > LILY_MAX_DEPTH) return false
    if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, x, z)) return false
    return true
  }

  for (let i = 0; i < LILY_CANDIDATES_PER_CHUNK; i++) {
    const cx = coord.cx * chunkSize + (lilyRandom() * 2 - 1) * half
    const cz = coord.cz * chunkSize + (lilyRandom() * 2 - 1) * half
    if (!eligible(cx, cz)) continue

    const count = LILY_PATCH_MIN_COUNT + Math.floor(lilyRandom() * LILY_PATCH_MAX_EXTRA)
    for (let j = 0; j < count; j++) {
      const a = lilyRandom() * Math.PI * 2
      const r = Math.sqrt(lilyRandom()) * LILY_PATCH_RADIUS
      const fx = cx + Math.cos(a) * r
      const fz = cz + Math.sin(a) * r
      if (!eligible(fx, fz)) continue

      out.push({
        x: fx,
        z: fz,
        kind: 'lily',
        speciesIndex: Math.floor(lilyRandom() * speciesCount),
        scale: 0.7 + lilyRandom() * 0.6,
        rotationY: lilyRandom() * Math.PI * 2,
      })
    }
  }

  return out
}

const SEAWEED_CANDIDATES_PER_CHUNK = 2
const SEAWEED_PATCH_MIN_COUNT = 2
const SEAWEED_PATCH_MAX_EXTRA = 3
const SEAWEED_PATCH_RADIUS = 1.8
/** Unambiguously-ocean `bodyScale` gate (mirrors `waterBodies.ts`'s own
 *  `OCEAN_BODY_SCALE_DISCARD` — `computeBodyScale` saturates ocean texels to
 *  `1` and caps inland-lake texels at `0.85`, so `>= 0.9` cleanly separates
 *  the two without importing `waterBodies.ts` into this worker-safe module). */
const SEAWEED_MIN_BODY_SCALE = 0.9
/** Shallow-coastal depth bias (world units of seabed below `waterLevel`,
 *  read from `floorHeights` — never the water-clamped `heights`) — keeps
 *  seaweed off the general open-ocean floor (plan world-terrain-010, Phase 7:
 *  "do not populate the general ocean floor"). */
const SEAWEED_MAX_DEPTH = 2.0

/**
 * Lightweight seaweed clusters for shallow coastal ocean water only (plan
 * world-terrain-010, Phase 7). Same patch-based shape as `lilyPatches`, but
 * gated on `bodyScale` reading unambiguously ocean (never inland lake) and a
 * shallower depth bias — coastal shelf, not the open sea floor. Vertical
 * anchoring for this kind reads `tile.floorHeights` (seabed), not the
 * water-surface-clamped `tile.heights` every other vegetation kind uses (see
 * `chunkManager.ts`'s `attachChunkContent`), since lily's "clamped heights
 * already equal the water surface" trick does not hold at the seabed.
 */
function seaweedPatches(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
  sample: (grid: Float32Array, x: number, z: number) => number,
): VegetationPlacement[] {
  const { chunkSize, waterLevel } = params
  const half = chunkSize / 2
  const seaweedRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x7c30e1)
  const speciesCount = Math.max(1, params.vegetationSpeciesCount.seaweed)
  const out: VegetationPlacement[] = []

  const eligible = (x: number, z: number): boolean => {
    const bodyScale = sample(tile.bodyScale, x, z)
    if (bodyScale < SEAWEED_MIN_BODY_SCALE) return false // land or inland lake
    const depth = waterLevel - sample(tile.floorHeights, x, z)
    if (depth <= 0 || depth > SEAWEED_MAX_DEPTH) return false
    if (params.riverSegments.length > 0 && isInsideRiverChannel(params.riverSegments, x, z)) return false
    return true
  }

  for (let i = 0; i < SEAWEED_CANDIDATES_PER_CHUNK; i++) {
    const cx = coord.cx * chunkSize + (seaweedRandom() * 2 - 1) * half
    const cz = coord.cz * chunkSize + (seaweedRandom() * 2 - 1) * half
    if (!eligible(cx, cz)) continue

    const count = SEAWEED_PATCH_MIN_COUNT + Math.floor(seaweedRandom() * SEAWEED_PATCH_MAX_EXTRA)
    for (let j = 0; j < count; j++) {
      const a = seaweedRandom() * Math.PI * 2
      const r = Math.sqrt(seaweedRandom()) * SEAWEED_PATCH_RADIUS
      const fx = cx + Math.cos(a) * r
      const fz = cz + Math.sin(a) * r
      if (!eligible(fx, fz)) continue

      out.push({
        x: fx,
        z: fz,
        kind: 'seaweed',
        speciesIndex: Math.floor(seaweedRandom() * speciesCount),
        scale: 0.7 + seaweedRandom() * 0.6,
        rotationY: seaweedRandom() * Math.PI * 2,
      })
    }
  }

  return out
}
