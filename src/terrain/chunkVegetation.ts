import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import type { ChunkCoord } from './chunkGrid'
import { createSeededRandom } from '../world/parseSeed'
import { biomeWeightsAt } from './biomeRegions'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  sampleApronGrid,
  type VegetationKind,
} from './chunkHeightmap'

export type VegetationPlacement = {
  x: number
  z: number
  kind: VegetationKind
  /** Index into `TREE_SPECS`/`BUSH_SPECS`/`CACTUS_SPECS`/`REED_SPECS`
   *  (`props.ts`), resolved on the main thread. */
  speciesIndex: number
  scale: number
  rotationY: number
}

const CANDIDATES_PER_CHUNK = 18
const SLOPE_SAMPLE_STEP = 1.5
/** Reject candidates on slopes steeper than this (roughly matches where
 *  `applySlopeRock` starts taking over visually). */
const SLOPE_REJECT = 0.9
/** Treeline — fraction of `heightScale` above `waterLevel` above which nothing grows. */
const TREELINE_ALTITUDE = 0.6
/** Reject candidates sitting on a strong mountain ridge crest, regardless of altitude. */
const MOUNTAIN_RIDGE_REJECT = 0.35
/** Reject candidates sitting on a road/path corridor (`tile.roadTint`, `chunkHeightmap.ts`). */
const ROAD_TINT_REJECT = 0.15

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

/** Index into `TREE_SPECS` (`props.ts`) — species-cluster bias groups the
 *  6 tree specs into 3 neighboring pairs (conifer-ish/broadleaf/dead-sparse
 *  by list order) so a stand tends to repeat one pair rather than mixing all
 *  6 uniformly at random. Falls back to a flat random pick outside [0,1)
 *  clump bands (shouldn't happen, but keeps this decoupled from exact bucket
 *  math if tuned later). */
function clusteredTreeSpecies(clumpValue: number, speciesCount: number, random: () => number): number {
  if (speciesCount <= 1) return 0
  const bandCount = Math.min(3, speciesCount)
  const band = Math.min(bandCount - 1, Math.floor(clumpValue * bandCount))
  const perBand = speciesCount / bandCount
  const within = Math.floor(random() * perBand)
  return Math.min(speciesCount - 1, Math.floor(band * perBand) + within)
}

/**
 * Deterministic, worker-safe per-chunk vegetation placement — pure data only
 * (no `THREE.Object3D`/GLTF; workers can't touch either), instantiated into
 * actual meshes on the main thread (`chunkManager.ts`). Density/species mix is
 * driven by the same macro region values (`continentalness`, `mountainRidge`)
 * added for terrain shaping, so forests naturally thin out toward highlands/
 * mountains and stop at the shoreline/treeline. Callers skip this for pinned
 * `homeChunks` — the settlement keeps its own bespoke layout (`props.ts`).
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

  for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
    const localX = (random() * 2 - 1) * half
    const localZ = (random() * 2 - 1) * half
    const wx = coord.cx * chunkSize + localX
    const wz = coord.cz * chunkSize + localZ

    const h = sample(tile.heights, wx, wz)
    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, wx, wz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)

    // Reeds tolerate growing right at the waterline; everything else needs
    // to clear the shore like today.
    const waterClearance = biome.swamp > 0.4 ? 0.05 : 0.5
    if (h <= waterLevel + waterClearance) continue // underwater/shoreline

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
        Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
      (2 * d)
    if (slope > SLOPE_REJECT) continue // cliff/steep face

    if (altitude > TREELINE_ALTITUDE) continue // above treeline

    const ridge = sample(tile.mountainRidge, wx, wz)
    if (ridge > MOUNTAIN_RIDGE_REJECT) continue // bare ridge crest

    if (sample(tile.roadTint, wx, wz) > ROAD_TINT_REJECT) continue // road/path corridor

    const moisture = sample(tile.biomes, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    // Low-frequency field shared across chunk borders — pushes local density
    // up in some patches and down in others, so forest thins/thickens in
    // irregular drifts instead of a uniform per-tile probability (plan
    // 044 4.5: avoid mechanically even spacing).
    const clumpValue = fieldAt(clumpNoise, wx, wz, 0.015)
    // Denser on humid lowlands/coasts (continentalness near the coastal band),
    // sparser further inland/toward highlands; deserts thin out further still.
    const density =
      Math.max(0, Math.min(1, moisture * 0.7 + (1 - Math.abs(continentalness - 0.55)) * 0.3)) *
      (1 - biome.desert * 0.6) *
      (0.55 + clumpValue * 0.9)
    if (random() > density) continue

    let kind: VegetationPlacement['kind']
    if (biome.desert > 0.5 && random() < biome.desert) {
      kind = random() < 0.75 ? 'cactus' : 'bush'
    } else if (biome.swamp > 0.5 && random() < biome.swamp) {
      kind = random() < 0.8 ? 'reed' : 'tree'
    } else {
      kind = random() < 0.15 + (1 - moisture) * 0.35 ? 'bush' : 'tree'
    }

    const speciesCount = params.vegetationSpeciesCount[kind]
    const speciesIndex =
      kind === 'tree'
        ? clusteredTreeSpecies(clumpValue, Math.max(1, speciesCount), random)
        : Math.floor(random() * Math.max(1, speciesCount))
    // Most trees are grown adults; a minority are small saplings — visible
    // size variety within the same stand (plan 044 4.5).
    const isSapling = kind === 'tree' && random() < 0.18
    const scale =
      kind === 'bush' || kind === 'cactus'
        ? 0.6 + random() * 0.5
        : isSapling
          ? 0.28 + random() * 0.25
          : 0.7 + random() * 0.6
    const rotationY = random() * Math.PI * 2

    placements.push({ x: wx, z: wz, kind, speciesIndex, scale, rotationY })
  }

  placements.push(...flowerMeadowPatches(coord, tile, params, sample, meadowNoise))

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
