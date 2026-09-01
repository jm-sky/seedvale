import { createNoise2D, type NoiseFunction2D } from 'simplex-noise'
import { MathUtils } from 'three'
import { LinearSpline } from '../math/linearSpline'
import { projectOntoSegment } from '../math/segment'
import { createSeededRandom } from '../world/parseSeed'
import { fbm01, type FbmParams } from './fbm'
import { computeBodyScale, detectWaterBodies } from './waterBodies'
import { worleyRidge } from './worleyNoise'

export type VegetationKind = 'tree' | 'bush' | 'cactus' | 'reed' | 'fern'

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
  /** Tunables for village clearing radius/strength — see `villageClearing.ts`. */
  village: VillageClearingParams
}

export type VillageClearingParams = {
  /** Radius (world units) of the shared "core" clearing (well/stockpile/garden). */
  coreRadius: number
  /** Radius (world units) of each family's house clearing. */
  houseRadius: number
  /** How strongly terrain height blends toward a clearing's flat target
   *  height inside it (0 = untouched, 1 = fully replaced) — same idea as
   *  `RoadNetworkParams.roadHeightStrength`. */
  heightStrength: number
  /** How strongly the ground color blends toward `DIRT` inside a clearing. */
  tintStrength: number
  /** How strongly the whole village footprint (core + house ring) gently
   *  pulls toward a shared average height — see `RegionalSmoothingSegment`.
   *  Split flat/mountain so a hillside village still reads as a hillside,
   *  just less jarring between its clearings. */
  regionalHeightStrengthFlat: number
  regionalHeightStrengthMountain: number
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
  /** Fraction of `halfWidth` by which corridor edges wobble (±) via simplex —
   *  0 = perfect capsule, ~0.15 = visibly uneven dirt strip. */
  edgeWobbleAmplitude: number
  /** World-space frequency of edge wobble noise (higher = tighter scallops). */
  edgeWobbleScale: number
  /** Max depth (world units) of sparse procedural potholes carved into
   *  corridor `targetH`. Final dip is scaled by corridor blend strength. */
  potholeDepth: number
  /** Sparse gate in [0,1): only noise samples above this become potholes
   *  (higher = rarer). */
  potholeThreshold: number
  /** Lateral meander amplitude (world units) applied to interior A* waypoints
   *  before profile smoothing — 0 = ruler-straight polyline. */
  meanderAmplitude: number
  /** World-space frequency of route meander noise. */
  meanderScale: number
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

/** A single village clearing's terrain-shaping data — the point-shaped
 *  counterpart to `RoadCorridorSegment`, same worker-safe/plain-numeric
 *  reasoning. Computed main-thread-only by `settlement/villageClearing.ts`
 *  (`layoutClearings`, embedded in `SettlementDef.clearings`) and flattened
 *  per-chunk by `settlement/roadNetwork.ts`'s `villageSegmentsNear`. */
export type ClearingSegment = {
  x: number
  z: number
  radius: number
  /** Pre-computed flat target height (already resolved, not raw terrain). */
  targetH: number
  heightStrength: number
  tintStrength: number
  /** Full-strength disk as a fraction of `radius`. Omit to use the plaza/house
   *  default (`CLEARING_INNER_FRACTION`). Gardens keep a higher value so the
   *  small crop pad stays dirt under the beds. */
  innerFraction?: number
}

/** A single river channel segment's terrain-carving data — the point-shaped
 *  counterpart to `RoadCorridorSegment`, same worker-safe/plain-numeric
 *  reasoning. Built by `riverNetwork.ts`'s `riverChannelSegmentsNear` from the
 *  same canonical, already-meandered/smoothed chain the water ribbon clips
 *  and renders (`riverGeometry.ts`) — terrain and water always agree on
 *  shape/position by construction, never a second path. `aBedH`/`bBedH` are
 *  each endpoint's own D8 chain elevation minus a flow-scaled depth
 *  (`depthFromAccumulation`); since D8 chain elevation strictly decreases and
 *  flow accumulation never decreases along a flow path, bed height is
 *  guaranteed to strictly decrease downstream too — no separate monotonic-
 *  correction pass is needed to satisfy the "continuous downhill slope"
 *  requirement (plan 189). */
export type RiverChannelSegment = {
  ax: number
  az: number
  aBedH: number
  aHalfWidth: number
  aBankWidth: number
  bx: number
  bz: number
  bBedH: number
  bHalfWidth: number
  bBankWidth: number
}

/** A whole village's gentle, wide-radius height-only smoothing pass — pulls
 *  the terrain under and around a village's clearings toward a shared
 *  average height, applied *before* (not competing with) the sharp
 *  `ClearingSegment`/`RoadCorridorSegment` blend — see `applyRegionalSmoothing`
 *  and `computeChunkTile`'s two-stage blend. No `tintStrength`: this pass is
 *  meant to be invisible as color, only as geometry — a village-sized "packed
 *  dirt" disc would look wrong. Computed by `villageClearing.ts`'s
 *  `layoutClearings`, flattened per-chunk by `roadNetwork.ts`'s
 *  `villageSegmentsNear`. */
export type RegionalSmoothingSegment = {
  x: number
  z: number
  radius: number
  targetH: number
  heightStrength: number
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
  /** World-space wavelength of local surface detail FBM. Larger = broader bumps. */
  noiseScale: number
  /** Multiplier on local detail FBM contribution (1 = legacy full weight). Keeps
   *  high-frequency surface noise from overpowering macro / hills structure. */
  detailAmplitude: number
  /** Medium-scale hills/valleys wavelength (world units) — between local
   *  `noiseScale` and macro `continentScale` / `mountainScale`. */
  hillsScale: number
  /** Amplitude of the centered hills/valleys term (0 = off). Applied on land
   *  only via `landWeight`; generation-internal — not a ChunkTileData field. */
  hillsAmplitude: number
  hillsFbm: FbmParams
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
  vegetationSpeciesCount: Record<VegetationKind, number>
  /** Road/path corridors near this chunk — see `RoadCorridorSegment`. Usually
   *  0–6 entries. Excluded from `RawSampleParams`: the analytic samplers below
   *  (`sampleHeightAt` etc.) are what `roadNetwork.ts` itself uses to find
   *  routes/dock sites in the first place, so they must stay road-agnostic to
   *  avoid a circular dependency (a route smoothing based on a height function
   *  that already depends on that same route). Road smoothing is applied only
   *  in `computeChunkTile`'s tile-building loop, layered on top of the raw
   *  analytic height. */
  roadSegments: RoadCorridorSegment[]
  /** Village clearings near this chunk — see `ClearingSegment`. Same
   *  road-agnostic-analytic-sampler reasoning as `roadSegments`: a clearing's
   *  `targetH` is computed once (`villageClearing.ts`'s `layoutClearings`)
   *  from the ambient, clearing-agnostic `sampleHeight`, so must not itself
   *  already include clearing blending — excluded from `RawSampleParams` for
   *  the same reason `roadSegments` is. */
  clearings: ClearingSegment[]
  /** Village-wide regional smoothing near this chunk — see
   *  `RegionalSmoothingSegment`. Same road-agnostic-analytic-sampler
   *  reasoning as `roadSegments`/`clearings`, excluded from `RawSampleParams`
   *  for the same reason. */
  regional: RegionalSmoothingSegment[]
  /** River channel carving segments near this chunk — see
   *  `RiverChannelSegment`. Same road-agnostic-analytic-sampler reasoning as
   *  `roadSegments`: hydrology (`riverNetwork.ts`) itself samples the
   *  carving-agnostic `sampleFloorAt` to find channels in the first place, so
   *  that sampler must stay carving-agnostic to avoid a circular dependency —
   *  excluded from `RawSampleParams` for the same reason `roadSegments` is. */
  riverSegments: RiverChannelSegment[]
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
  | 'clearings'
  | 'regional'
  | 'riverSegments'
>

export type ChunkTileData = {
  /** Apron-inclusive: (resolution + 2) texels per edge. Clamped to `waterLevel`
   *  underwater — water mask (`vCover`), grass reject, `sampleHeight` / NPC walk.
   *  Not the render-mesh Y; that is `floorHeights`. */
  heights: Float32Array
  /** True bathymetry (may be below `waterLevel`). Terrain mesh Y / normals /
   *  seabed colour, water depth shader, player swim floor. */
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
  /** Medium-scale hills/valleys — independent of local detail and macro axes. */
  hills: NoiseFunction2D
  biome: NoiseFunction2D
  continent: NoiseFunction2D
  mountain: NoiseFunction2D
  moistureRegion: NoiseFunction2D
  /** Road edge wobble + sparse potholes — decorrelated from terrain channels. */
  roadDetail: NoiseFunction2D
}

/** Soft domain warp for local detail — lower freq/amp than the previous
 *  (0.02 × 12) pair so warp does not invent sharp local pits/peaks. */
const DETAIL_WARP_FREQ = 0.012
const DETAIL_WARP_AMP = 6

/** Damps local-detail amplitude in proportion to `mountainRidge` (plan 181): the
 *  macro ridge/massif shape should read as continuous terrain, not a smooth ridge
 *  with high-frequency noise spikes riding on top of it. Does not touch
 *  `mountainGain`/ridge amplitude itself — only the fine detail layered on it. */
const MOUNTAIN_DETAIL_DAMPING = 0.45

/** Peak/massif hierarchy (plan 191) — reshapes the existing mountain envelope +
 *  Worley ridge combination instead of adding a second mountain generator or a
 *  radial peak stamp. All terms below are smooth functions of the already-computed
 *  `mt` (mountain envelope) / `mountainGate` / `mountainRidge` fields, so massifs
 *  stay continuous across chunk seams and `mountainRidge` itself keeps meaning
 *  "connected ridge strength" for its other consumers (naturalResources, biome
 *  color, vegetation, rock placement, …). */

/** Whole-massif amplitude variety: envelope strength well past the gate's own
 *  blend band still scales overall ridge gain, so massifs whose `mt` barely
 *  clears the threshold read as modest foothill ranges while massifs deep in
 *  mountain territory read as taller ranges — instead of every gated massif
 *  converging on the same height once the gate itself saturates to 1. */
const MASSIF_ENVELOPE_MIN_GAIN = 0.8
const MASSIF_ENVELOPE_MAX_GAIN = 1.25

/** Sub-massif frequency for peak-dominance modulation, relative to `mountainScale`
 *  — finer than the massif envelope itself so one massif contains a handful of
 *  dominant zones rather than rising uniformly. Reuses the `mountain` noise handle
 *  (no new handle/field) at a second frequency. */
const PEAK_DOMINANCE_SCALE_FACTOR = 0.4
/** Narrow blend band: most of a massif stays at subordinate-ridge gain, only the
 *  high end of the (already coarse) peak field reaches full dominance. */
const PEAK_DOMINANCE_THRESHOLD = 0.55
const PEAK_DOMINANCE_THRESHOLD_WIDTH = 0.3
/** Ridge-gain multiplier range across peak dominance 0..1 — subordinate ridges sit
 *  below `mountainGain`, dominant peaks rise above it, giving one massif a clear
 *  height hierarchy instead of every ridge segment reaching a similar crest. */
const PEAK_DOMINANCE_MIN_GAIN = 0.55
const PEAK_DOMINANCE_MAX_GAIN = 1.3

/** Restrained high-altitude irregularity: reuses the `hills` noise handle (no new
 *  handle) at a finer frequency than `hillsScale`, gated to dominant-peak zones
 *  only (`peakDominance * mountainRidge`) so it shapes an asymmetric/irregular
 *  summit instead of a smooth stamped cone, and vanishes away from real peaks. */
const PEAK_DETAIL_SCALE_FACTOR = 0.5
const PEAK_DETAIL_AMPLITUDE = 0.4

/** Deepens valleys/saddles between ridges inside a massif: boosts the existing
 *  `hillsTerm` where the macro mountain envelope is active but the local ridge is
 *  weak (i.e. the "in-between" ground), and fades to no boost on strong ridge
 *  crests and outside mountain regions entirely — reuses `hills01`, no extra
 *  noise evaluation. */
const HILLS_MOUNTAIN_VALLEY_BOOST = 1.2

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
      hills: createNoise2D(createSeededRandom(seed ^ 0x165667b1)),
      biome: createNoise2D(createSeededRandom(seed ^ 0x85ebca6b)),
      continent: createNoise2D(createSeededRandom(seed ^ 0xc2b2ae35)),
      mountain: createNoise2D(createSeededRandom(seed ^ 0x27d4eb2f)),
      moistureRegion: createNoise2D(createSeededRandom(seed ^ 0x1b873593)),
      roadDetail: createNoise2D(createSeededRandom(seed ^ 0x94d049bb)),
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
  const {
    heightScale,
    waterLevel,
    noiseScale,
    detailAmplitude,
    hillsScale,
    hillsAmplitude,
    hillsFbm,
    fbm,
    biome,
    region,
  } = params

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
  // Suppress fine local detail on top of a strong ridge — this is what keeps the
  // massif reading as continuous terrain instead of a field of sharp isolated
  // spikes/pits stacked on the macro shape (see MOUNTAIN_DETAIL_DAMPING doc comment).
  const ridgeDetailWeight = detailWeight * (1 - mountainRidge * MOUNTAIN_DETAIL_DAMPING)

  // Hierarchy: macro bias + mountain ridge, then medium hills/valleys, then
  // soft local surface detail. Hills stay generation-internal (no tile field).
  const hills01 = fbm01(noise.hills, wx / hillsScale, wz / hillsScale, hillsFbm)
  // Deeper saddles/valleys between ridges inside a massif (plan 191) — boost is
  // strongest in the "in-between" ground (mountainGate active, ridge weak) and
  // fades to zero on strong crests and outside mountain regions, so it never
  // fights the Worley ridge shape itself.
  const hillsMountainBoost = mountainGate * (1 - mountainRidge) * HILLS_MOUNTAIN_VALLEY_BOOST
  const hillsTerm = (hills01 - 0.5) * hillsAmplitude * landWeight * (1 + hillsMountainBoost)

  // Peak/massif height hierarchy (plan 191) — gated to mountain regions only, so
  // the extra noise evaluations below cost nothing across the rest of the world.
  let ridgeGainFactor = 1
  let peakDetailTerm = 0
  if (mountainGate > 0) {
    const envelopeStrength = MathUtils.smoothstep(
      mt,
      region.mountainThreshold + region.mountainThresholdWidth,
      1,
    )
    const massifGainFactor = MathUtils.lerp(
      MASSIF_ENVELOPE_MIN_GAIN,
      MASSIF_ENVELOPE_MAX_GAIN,
      envelopeStrength,
    )

    const peakField = fbm01(
      noise.mountain,
      wx / (region.mountainScale * PEAK_DOMINANCE_SCALE_FACTOR),
      wz / (region.mountainScale * PEAK_DOMINANCE_SCALE_FACTOR),
      region.mountainFbm,
    )
    const peakDominance = MathUtils.smoothstep(
      peakField,
      PEAK_DOMINANCE_THRESHOLD,
      PEAK_DOMINANCE_THRESHOLD + PEAK_DOMINANCE_THRESHOLD_WIDTH,
    )
    ridgeGainFactor =
      massifGainFactor * MathUtils.lerp(PEAK_DOMINANCE_MIN_GAIN, PEAK_DOMINANCE_MAX_GAIN, peakDominance)

    if (peakDominance > 0) {
      const peakDetailScale = hillsScale * PEAK_DETAIL_SCALE_FACTOR
      const peakDetail01 = fbm01(noise.hills, wx / peakDetailScale, wz / peakDetailScale, hillsFbm)
      peakDetailTerm =
        (peakDetail01 - 0.5) * PEAK_DETAIL_AMPLITUDE * peakDominance * mountainRidge
    }
  }

  const wxw = wx + noise.warp(wx * DETAIL_WARP_FREQ, wz * DETAIL_WARP_FREQ) * DETAIL_WARP_AMP
  const wzw =
    wz + noise.warp(wx * DETAIL_WARP_FREQ + 40, wz * DETAIL_WARP_FREQ + 40) * DETAIL_WARP_AMP
  const n = fbm01(noise.height, wxw / noiseScale, wzw / noiseScale, fbm)

  const nCombined =
    n * ridgeDetailWeight * detailAmplitude +
    regionBias +
    hillsTerm +
    mountainRidge * region.mountainGain * ridgeGainFactor +
    peakDetailTerm
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
/** Bilinear weights/indices for one `(x,z)` sample against an apron grid —
 *  shared across every field sampled at the same point (`buildChunkGeometry`
 *  samples 6 fields per vertex) so the fx/fz/floor/clamp work is done once. */
export type ApronGridWeights = {
  x0: number
  x1: number
  z0: number
  z1: number
  tx: number
  tz: number
}

export function apronGridWeights(
  apronRes: number,
  originX: number,
  originZ: number,
  step: number,
  x: number,
  z: number,
): ApronGridWeights {
  const fx = (x - originX) / step
  const fz = (z - originZ) / step
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const clampi = (v: number) => Math.max(0, Math.min(apronRes - 1, v))
  return {
    x0: clampi(x0),
    x1: clampi(x0 + 1),
    z0: clampi(z0),
    z1: clampi(z0 + 1),
    tx: fx - x0,
    tz: fz - z0,
  }
}

export function sampleApronGridWeighted(
  grid: Float32Array,
  apronRes: number,
  w: ApronGridWeights,
): number {
  const h00 = grid[w.z0 * apronRes + w.x0]!
  const h10 = grid[w.z0 * apronRes + w.x1]!
  const h01 = grid[w.z1 * apronRes + w.x0]!
  const h11 = grid[w.z1 * apronRes + w.x1]!

  const hx0 = h00 * (1 - w.tx) + h10 * w.tx
  const hx1 = h01 * (1 - w.tx) + h11 * w.tx
  return hx0 * (1 - w.tz) + hx1 * w.tz
}

export function sampleApronGrid(
  grid: Float32Array,
  apronRes: number,
  originX: number,
  originZ: number,
  step: number,
  x: number,
  z: number,
): number {
  return sampleApronGridWeighted(
    grid,
    apronRes,
    apronGridWeights(apronRes, originX, originZ, step, x, z),
  )
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

/** Fraction of a corridor's half-width that stays at full strength before
 *  tapering (roads/paths). Lower = longer soft edge into surrounding ground. */
const CORRIDOR_INNER_FRACTION = 0.32
/** Village clearings (plaza / house pads) stay fully flat in the inner disk,
 *  then a long soft skirt to the rim — 0.82 read as a raised mesa. */
const CLEARING_INNER_FRACTION = 0.45
/** World-space frequency for sparse pothole noise (separate from edge wobble). */
const POTHOLE_NOISE_SCALE = 0.14

type CorridorCandidate = { falloff: number; targetH: number; heightStrength: number; tint: number }

function roadCandidate(
  wx: number,
  wz: number,
  seg: RoadCorridorSegment,
  roadNoise: NoiseFunction2D,
  rn: RoadNetworkParams,
): CorridorCandidate | null {
  const { distSq, t } = projectOntoSegment(wx, wz, seg.ax, seg.az, seg.bx, seg.bz)
  const edgeN = roadNoise(wx * rn.edgeWobbleScale, wz * rn.edgeWobbleScale)
  const effectiveHalfWidth = Math.max(0.05, seg.halfWidth * (1 + rn.edgeWobbleAmplitude * edgeN))
  if (distSq >= effectiveHalfWidth * effectiveHalfWidth) return null
  const dist = Math.sqrt(distSq)
  const inner = effectiveHalfWidth * CORRIDOR_INNER_FRACTION
  const falloff = 1 - MathUtils.smoothstep(dist, inner, effectiveHalfWidth)

  let targetH = MathUtils.lerp(seg.ah, seg.bh, t)
  if (rn.potholeDepth > 0 && falloff > 0) {
    // Offset domain so pothole peaks don't align with edge scallops.
    const pN = roadNoise(wx * POTHOLE_NOISE_SCALE + 17.3, wz * POTHOLE_NOISE_SCALE - 9.1)
    const u = (pN + 1) * 0.5
    const thr = Math.min(0.999, Math.max(0, rn.potholeThreshold))
    if (u > thr) {
      const sparse = (u - thr) / (1 - thr)
      // Lower target only; final dip is further scaled by falloff×heightStrength
      // in the corridor blend — paths (low heightStrength) stay nearly flat.
      targetH -= rn.potholeDepth * sparse * falloff
    }
  }

  return {
    falloff,
    targetH,
    heightStrength: seg.heightStrength,
    tint: falloff * seg.tintStrength,
  }
}

function clearingCandidate(wx: number, wz: number, seg: ClearingSegment): CorridorCandidate | null {
  const dx = wx - seg.x
  const dz = wz - seg.z
  const distSq = dx * dx + dz * dz
  if (distSq >= seg.radius * seg.radius) return null
  const dist = Math.sqrt(distSq)
  const inner = seg.radius * (seg.innerFraction ?? CLEARING_INNER_FRACTION)
  const falloff = 1 - MathUtils.smoothstep(dist, inner, seg.radius)
  return {
    falloff,
    targetH: seg.targetH,
    heightStrength: seg.heightStrength,
    tint: falloff * seg.tintStrength,
  }
}

/** Blends a texel's `floorH` toward the nearest/strongest road/path corridor
 *  or village clearing's target height, and returns the tint strength for
 *  `applyRoadTint` (reused as-is for clearings — both read as "packed
 *  ground", see `villageClearing.ts`). Segments are plain per-chunk input
 *  data (`ChunkTileParams.roadSegments`/`clearings`) — see their doc comments
 *  for why this lives here and not in `sampleRawTexel`.
 *
 *  Height priority: clearings beat roads/paths once the texel is meaningfully
 *  inside a pad/plaza. Entrance roads still tint the dirt, but their potholes
 *  and endpoint height lerp must not roughen the square. */
function applyTerrainCorridors(
  wx: number,
  wz: number,
  floorH: number,
  roadSegments: readonly RoadCorridorSegment[],
  clearingSegments: readonly ClearingSegment[],
  roadNoise: NoiseFunction2D,
  roadNetwork: RoadNetworkParams,
): { floorH: number; tint: number } {
  let bestRoadFalloff = 0
  let bestRoadTargetH = 0
  let bestRoadHeightStrength = 0
  let bestClearingFalloff = 0
  let bestClearingTargetH = 0
  let bestClearingHeightStrength = 0
  let bestTint = 0

  for (const seg of roadSegments) {
    const candidate = roadCandidate(wx, wz, seg, roadNoise, roadNetwork)
    if (!candidate) continue
    if (candidate.falloff > bestRoadFalloff) {
      bestRoadFalloff = candidate.falloff
      bestRoadTargetH = candidate.targetH
      bestRoadHeightStrength = candidate.heightStrength
    }
    if (candidate.tint > bestTint) bestTint = candidate.tint
  }
  for (const seg of clearingSegments) {
    const candidate = clearingCandidate(wx, wz, seg)
    if (!candidate) continue
    if (candidate.falloff > bestClearingFalloff) {
      bestClearingFalloff = candidate.falloff
      bestClearingTargetH = candidate.targetH
      bestClearingHeightStrength = candidate.heightStrength
    }
    if (candidate.tint > bestTint) bestTint = candidate.tint
  }

  /** Inside plaza/house pad — ignore road height (potholes / profile lerp).
   *  Low threshold so the whole dirt square stays on the flat target, not just
   *  the innermost metres. */
  const CLEARING_HEIGHT_PRIORITY = 0.08
  if (bestClearingFalloff >= CLEARING_HEIGHT_PRIORITY) {
    // Snap hard once we're clearly on the pad — residual lerp left visible
    // "tin foil" ridges under the well (playtest screen).
    const blend = Math.min(1, bestClearingFalloff * bestClearingHeightStrength)
    const hard = blend >= 0.55 ? 1 : blend
    return {
      floorH: MathUtils.lerp(floorH, bestClearingTargetH, hard),
      tint: bestTint,
    }
  }
  if (bestRoadFalloff <= 0) return { floorH, tint: bestTint }
  return {
    floorH: MathUtils.lerp(floorH, bestRoadTargetH, bestRoadFalloff * bestRoadHeightStrength),
    tint: bestTint,
  }
}

/** Gently blends a texel's `floorH` toward the nearest/strongest village's
 *  regional target height — a soft, everywhere-present pull (no flat "inner"
 *  plateau like `CORRIDOR_INNER_FRACTION`, since this isn't carving a disc,
 *  just leveling the village's overall relief) applied *before*
 *  `applyTerrainCorridors` in `computeChunkTile`, not in competition with it:
 *  a big, weak regional segment would otherwise randomly win or lose against
 *  a small, strong clearing depending on which happens to have the higher
 *  falloff at a given point, defeating the point of a soft underlying base. */
function applyRegionalSmoothing(
  wx: number,
  wz: number,
  floorH: number,
  segments: readonly RegionalSmoothingSegment[],
): number {
  let bestFalloff = 0
  let bestTargetH = 0
  let bestHeightStrength = 0

  for (const seg of segments) {
    const dx = wx - seg.x
    const dz = wz - seg.z
    const distSq = dx * dx + dz * dz
    if (distSq >= seg.radius * seg.radius) continue
    const dist = Math.sqrt(distSq)
    const falloff = 1 - MathUtils.smoothstep(dist, 0, seg.radius)
    if (falloff > bestFalloff) {
      bestFalloff = falloff
      bestTargetH = seg.targetH
      bestHeightStrength = seg.heightStrength
    }
  }

  if (bestFalloff <= 0) return floorH
  return MathUtils.lerp(floorH, bestTargetH, bestFalloff * bestHeightStrength)
}

/** Fraction of a channel's half-width that stays flat streambed before the
 *  bank starts rising — a much larger flat fraction than roads
 *  (`CORRIDOR_INNER_FRACTION`) because a riverbed should read as a shallow
 *  trough, not a capsule with hard shoulders (plan 189 "naturalny profil
 *  poprzeczny"). */
const RIVER_CHANNEL_INNER_FRACTION = 0.5

function riverChannelCandidate(
  wx: number,
  wz: number,
  seg: RiverChannelSegment,
): { falloff: number, targetH: number } | null {
  const { distSq, t } = projectOntoSegment(wx, wz, seg.ax, seg.az, seg.bx, seg.bz)
  const halfWidth = MathUtils.lerp(seg.aHalfWidth, seg.bHalfWidth, t)
  const bankWidth = MathUtils.lerp(seg.aBankWidth, seg.bBankWidth, t)
  const reach = halfWidth + bankWidth
  if (distSq >= reach * reach) return null
  const dist = Math.sqrt(distSq)
  const falloff = 1 - MathUtils.smoothstep(dist, halfWidth * RIVER_CHANNEL_INNER_FRACTION, reach)
  return { falloff, targetH: MathUtils.lerp(seg.aBedH, seg.bBedH, t) }
}

/** Blends a texel's `floorH` toward the nearest/strongest river channel's bed
 *  height. Carving only ever lowers terrain (`Math.min` below), never raises
 *  it — a channel segment whose bed sits above a texel's already-lower
 *  natural terrain (a local dip the coarse hydrology grid didn't sample at
 *  this exact lateral offset) leaves that terrain untouched instead of
 *  building an artificial levee. */
function applyRiverChannel(
  wx: number,
  wz: number,
  floorH: number,
  segments: readonly RiverChannelSegment[],
): number {
  let bestFalloff = 0
  let bestTargetH = 0
  for (const seg of segments) {
    const candidate = riverChannelCandidate(wx, wz, seg)
    if (!candidate) continue
    if (candidate.falloff > bestFalloff) {
      bestFalloff = candidate.falloff
      bestTargetH = candidate.targetH
    }
  }
  if (bestFalloff <= 0) return floorH
  return MathUtils.lerp(floorH, Math.min(bestTargetH, floorH), bestFalloff)
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
      // Stage 1: broad, weak village-wide leveling (see `applyRegionalSmoothing`'s
      // doc comment for why this runs first instead of joining the corridor
      // "strongest segment wins" competition below).
      if (params.regional.length > 0) {
        floorH = applyRegionalSmoothing(wx, wz, floorH, params.regional)
      }
      // Stage 2: sharp road/path/clearing blend on top of the (now gently
      // leveled) base.
      if (params.roadSegments.length > 0 || params.clearings.length > 0) {
        const corridor = applyTerrainCorridors(
          wx,
          wz,
          floorH,
          params.roadSegments,
          params.clearings,
          noise.roadDetail,
          params.region.roadNetwork,
        )
        floorH = corridor.floorH
        tint = corridor.tint
      }
      // Stage 3: river channel carving (plan 189) — locally deepens terrain
      // along the same canonical, already-meandered chain the water ribbon
      // renders, so terrain and water agree by construction. Runs after
      // roads/clearings per the plan's `base -> modifiers -> river channel ->
      // final` ordering; a road crossing a river is not special-cased (rare,
      // and the river simply wins under it, same as a real ford would dip).
      if (params.riverSegments.length > 0) {
        floorH = applyRiverChannel(wx, wz, floorH, params.riverSegments)
      }

      // Visual mesh uses `floorHeights` (bathtub). This clamp is the walk/mask lid.
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
  const bodyScale = computeBodyScale(waterBodies, {
    continentalness,
    oceanThreshold: params.region.oceanThreshold,
    coastThreshold: params.region.coastThreshold,
  })

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
