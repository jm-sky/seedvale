import type { RolledVillageSize } from '../settlement/families'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { FbmParams } from '../terrain/fbm'
import { parseSeedFromUrl } from '../world/parseSeed'
import { loadDomainConfigs } from './persistConfig'

/** Player override for the home settlement size — `auto` keeps terrain-weighted roll. */
export type HomeVillageSize = 'auto' | RolledVillageSize

/** N8AO quality presets — trades AO/denoise sample counts for GPU cost. */
export type AoQuality = 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'

/**
 * Terrain detail-normal ("surface grain") knobs. Separated out so strength and
 * patch density are two independent, GUI-tunable sliders — the earlier tuning
 * rounds moved both at once inside the source and could not tell which change
 * caused which regression (see issue 014).
 */
export type DetailNormalConfig = {
  enabled: boolean
  /** `MeshStandardMaterial.normalScale` — 0 = off, 1 = the baked map at full
   *  amplitude (mean ~2°, max ~8.6° of normal tilt). */
  strength: number
  /** Tiles across one chunk edge on vegetated ground — patch *size*,
   *  independent of `strength`. Lower = larger, softer lumps (mini-pagórki),
   *  which is what reads at 3rd-person camera distance; high tiling gets
   *  mipmapped to flat before you see it. */
  tilesGrass: number
  /** Same, for bare ground: road/clearing corridors, the shore sand band and
   *  desert regions. Higher than `tilesGrass` = fine, sand-like grain. Pushing
   *  this up aliases in the ocean's low-res mirror pass first (issue 009). */
  tilesBare: number
}

/**
 * Tunables for Seedvale — edit here, via GUI, or localStorage.
 *
 * **resolution** = vertices along one edge of the terrain mesh.
 * More vertices ⇒ denser mesh ⇒ more triangles (≈ 2 × (res−1)²).
 * Default: **193** (High). Presets: 65 … 769 (Insane — wolniejszy rebuild).
 */
export type WorldConfig = {
  seed: number
  terrain: {
    /** World size of one chunk on XZ (units). */
    chunkSize: number
    /** Core vertices per chunk edge: 33 / 49 / 65 / 97 / 129 / 193. */
    resolution: number
    /** Chunks (Chebyshev distance) kept loaded around the player. */
    loadRadius: number
    /** Must be > loadRadius — hysteresis ring, avoids load/unload thrashing. */
    unloadRadius: number
    /** true = low-poly facets; false = smooth hills (lepiej przy wysokim res). */
    flatShading: boolean
    heightScale: number
    waterLevel: number
    /** Larger = smoother local surface detail. */
    noiseScale: number
    /** Scales local detail FBM relative to macro/hills structure (1 = full). */
    detailAmplitude: number
    /** Medium-scale hills/valleys wavelength (world units). */
    hillsScale: number
    /** Centered hills/valleys amplitude (0 = off). */
    hillsAmplitude: number
    hillsFbm: FbmParams
    fbm: FbmParams
    biome: {
      noiseScale: number
      fbm: FbmParams
    }
    /** Macro region axes (ocean/lowland/highland/mountains) — see `RegionParams`. */
    region: RegionParams
    grass: {
      enabled: boolean
      /** Chunks (Chebyshev distance) that get grass — smaller than `loadRadius`. */
      radius: number
      /** Raw position candidates rolled per chunk before eligibility/density
       *  rejection — higher reads as thicker grass. */
      density: number
    }
    /** Close-up surface grain on the terrain — a tileable detail normal map
     *  (`terrain/terrainDetailNormalMap.ts`), no displacement. */
    detailNormal: DetailNormalConfig
  }
  sky: {
    inclination: number
    azimuth: number
    turbidity: number
    rayleigh: number
  }
  postProcessing: {
    aoEnabled: boolean
    /** World-space AO radius (units) — scene scale is chunkSize=64, heightScale~18. */
    aoRadius: number
    aoIntensity: number
    aoQuality: AoQuality
    /** Subtle glow on the brightest pixels (sun, fire/torch, window light). */
    bloomEnabled: boolean
    bloomStrength: number
    bloomRadius: number
    /** Luminance above which a pixel starts contributing to bloom (post tone-map, ~0-1). */
    bloomThreshold: number
    /** Screen-space crepuscular rays toward the sun, mainly at dawn/dusk. */
    godRaysEnabled: boolean
    godRaysExposure: number
  }
  /** Show lil-gui panel (`?gui=0` to hide). */
  showGui: boolean
  player: {
    name: string
  }
  /** World-generation options that are not terrain noise / graphics. */
  settlements: {
    /** Home (cell 0,0) village size; `auto` = `rollVillageSize` as before. */
    homeSize: HomeVillageSize
  }
}

const DEFAULT_PLAYER_NAME = 'Ja'

const DEFAULT_RESOLUTION = 65

function baseConfig(seed: number, resolution: number): WorldConfig {
  return {
    seed,
    terrain: {
      chunkSize: 64,
      resolution,
      loadRadius: 3,
      unloadRadius: 4,
      flatShading: false,
      heightScale: 18,
      waterLevel: 0.45,
      noiseScale: 105,
      detailAmplitude: 0.65,
      hillsScale: 420,
      hillsAmplitude: 0.34,
      hillsFbm: {
        octaves: 3,
        persistence: 0.55,
        lacunarity: 2.0,
        exponentiation: 1.15,
      },
      fbm: {
        octaves: 4,
        persistence: 0.65,
        lacunarity: 2.0,
        exponentiation: 1.35,
      },
      biome: {
        noiseScale: 96,
        fbm: {
          octaves: 3,
          persistence: 0.5,
          lacunarity: 2.0,
          exponentiation: 1.0,
        },
      },
      region: {
        continentScale: 2200,
        continentFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
        mountainScale: 1800,
        mountainFbm: { octaves: 2, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.2 },
        mountainThreshold: 0.62,
        mountainThresholdWidth: 0.14,
        worleyCellSize: 260,
        ridgeSharpness: 2.0,
        mountainGain: 0.88,
        oceanThreshold: 0.32,
        coastThreshold: 0.45,
        oceanDetailWeight: 0.25,
        moistureRegionScale: 2000,
        moistureRegionFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
        desertThreshold: 0.35,
        desertThresholdWidth: 0.12,
        swampThreshold: 0.72,
        swampThresholdWidth: 0.15,
        roadNetwork: {
          roadHalfWidth: 5,
          roadHeightStrength: 0.85,
          roadTintStrength: 0.8,
          pathHalfWidth: 1.5,
          pathHeightStrength: 0.2,
          pathTintStrength: 0.4,
          smoothingWindow: 10,
          maxNeighborRoads: 3,
          dockSearchRadius: 140,
          edgeWobbleAmplitude: 0.15,
          edgeWobbleScale: 0.06,
          potholeDepth: 0.12,
          potholeThreshold: 0.72,
          meanderAmplitude: 2,
          meanderScale: 0.04,
        },
        village: {
          coreRadius: 9,
          houseRadius: 7,
          heightStrength: 0.8,
          tintStrength: 0.75,
          regionalHeightStrengthFlat: 0.3,
          regionalHeightStrengthMountain: 0.15,
        },
      },
      grass: {
        enabled: true,
        // Smaller than terrain `loadRadius` so the outer terrain ring stays
        // grass-free (plan 008 phase 4). Values above `loadRadius` are capped
        // at runtime and only waste the hysteresis ring.
        radius: 2,
        // High visual density is intentional (sparse grass looks wrong); the
        // cost is controlled by `radius` + distance LOD, not by starving this.
        density: 120000,
      },
      detailNormal: {
        enabled: true,
        strength: 3,
        // Two tilings, picked per vertex by `bareGroundWeight`
        // (`buildChunkGeometry.ts`): big soft lumps under grass, fine sand
        // grain on roads/clearings/beach/desert.
        tilesGrass: 4,
        tilesBare: 12,
      },
    },
    sky: {
      inclination: 0.36,
      azimuth: 0.25,
      turbidity: 2.2,
      rayleigh: 2.4,
    },
    postProcessing: {
      aoEnabled: true,
      aoRadius: 2,
      aoIntensity: 3,
      aoQuality: 'Low',
      bloomEnabled: true,
      bloomStrength: 0.28,
      bloomRadius: 0.35,
      bloomThreshold: 0.92,
      godRaysEnabled: true,
      // Kept low so dawn/dusk shafts stay visible without mountain whiteout
      // (issue 016); GUI still allows raising it while tuning.
      godRaysExposure: 0.22,
    },
    showGui: true,
    player: {
      name: DEFAULT_PLAYER_NAME,
    },
    settlements: {
      homeSize: 'auto',
    },
  }
}

const HOME_SIZE_VALUES: readonly HomeVillageSize[] = ['auto', 'SM', 'MD', 'LG', 'XL']

function isHomeVillageSize(value: unknown): value is HomeVillageSize {
  return typeof value === 'string' && (HOME_SIZE_VALUES as readonly string[]).includes(value)
}

/** Same missing-field-keeps-default guarantee as `applyStoredTerrain`, for settlements. */
export function applyStoredSettlements(
  target: WorldConfig['settlements'],
  s: Partial<WorldConfig['settlements']> | undefined,
): void {
  if (!s || typeof s !== 'object') return
  if (isHomeVillageSize(s.homeSize)) target.homeSize = s.homeSize
}

/**
 * Merges a partial/possibly-stale terrain config (localStorage, or an older
 * game save) onto `target` field by field, so any field missing from the
 * source — e.g. a save made before a `RegionParams` field like
 * `moistureRegionScale` existed — keeps `target`'s current default instead of
 * becoming `undefined`. Never wholesale-replaces `target` or its sub-objects.
 */
export function applyStoredTerrain(
  target: WorldConfig['terrain'],
  t: Partial<WorldConfig['terrain']> | undefined,
): void {
  if (!t) return
  if (typeof t.chunkSize === 'number') target.chunkSize = t.chunkSize
  if (typeof t.loadRadius === 'number') target.loadRadius = t.loadRadius
  if (typeof t.unloadRadius === 'number') target.unloadRadius = t.unloadRadius
  if (typeof t.flatShading === 'boolean') target.flatShading = t.flatShading
  if (typeof t.heightScale === 'number') target.heightScale = t.heightScale
  if (typeof t.waterLevel === 'number') target.waterLevel = t.waterLevel
  if (typeof t.noiseScale === 'number') target.noiseScale = t.noiseScale
  if (typeof t.detailAmplitude === 'number') target.detailAmplitude = t.detailAmplitude
  if (typeof t.hillsScale === 'number') target.hillsScale = t.hillsScale
  if (typeof t.hillsAmplitude === 'number') target.hillsAmplitude = t.hillsAmplitude
  if (t.hillsFbm && typeof t.hillsFbm === 'object') {
    target.hillsFbm = { ...target.hillsFbm, ...t.hillsFbm }
  }
  if (t.fbm && typeof t.fbm === 'object') {
    target.fbm = { ...target.fbm, ...t.fbm }
  }
  if (t.biome && typeof t.biome === 'object') {
    if (typeof t.biome.noiseScale === 'number') {
      target.biome.noiseScale = t.biome.noiseScale
    }
    if (t.biome.fbm && typeof t.biome.fbm === 'object') {
      target.biome.fbm = { ...target.biome.fbm, ...t.biome.fbm }
    }
  }
  if (t.region && typeof t.region === 'object') {
    const r = t.region
    // Capture nested defaults *before* the shallow region spread — otherwise
    // `...r` replaces `roadNetwork`/`village`/FBM objects wholesale with a
    // possibly-stale stored copy, and the merges below would be old∪old
    // (missing new knobs like `edgeWobbleAmplitude` → lil-gui `gui.add failed`).
    const defaultContinentFbm = target.region.continentFbm
    const defaultMountainFbm = target.region.mountainFbm
    const defaultMoistureRegionFbm = target.region.moistureRegionFbm
    const defaultRoadNetwork = target.region.roadNetwork
    const defaultVillage = target.region.village
    target.region = { ...target.region, ...r }
    target.region.continentFbm =
      r.continentFbm && typeof r.continentFbm === 'object'
        ? { ...defaultContinentFbm, ...r.continentFbm }
        : defaultContinentFbm
    target.region.mountainFbm =
      r.mountainFbm && typeof r.mountainFbm === 'object'
        ? { ...defaultMountainFbm, ...r.mountainFbm }
        : defaultMountainFbm
    target.region.moistureRegionFbm =
      r.moistureRegionFbm && typeof r.moistureRegionFbm === 'object'
        ? { ...defaultMoistureRegionFbm, ...r.moistureRegionFbm }
        : defaultMoistureRegionFbm
    target.region.roadNetwork =
      r.roadNetwork && typeof r.roadNetwork === 'object'
        ? { ...defaultRoadNetwork, ...r.roadNetwork }
        : defaultRoadNetwork
    target.region.village =
      r.village && typeof r.village === 'object'
        ? { ...defaultVillage, ...r.village }
        : defaultVillage
  }
  if (t.grass && typeof t.grass === 'object') {
    if (typeof t.grass.enabled === 'boolean') target.grass.enabled = t.grass.enabled
    if (typeof t.grass.radius === 'number') target.grass.radius = t.grass.radius
    if (typeof t.grass.density === 'number') target.grass.density = t.grass.density
  }
  // Values ≥ loadRadius are a dead knob (chunks don't exist beyond it) and
  // accidentally put grass on every loaded chunk with no hysteresis. Leave one
  // terrain ring grass-free — matches plan 008 phase 4.
  if (target.grass.radius >= target.loadRadius) {
    target.grass.radius = Math.max(1, target.loadRadius - 1)
  }
  // A stored block from before the grass/bare split carries a `strength` tuned
  // against the old single tiling (and, for anyone who saved during the
  // green-channel bug, a meaningless one) — ignore the whole block rather than
  // let a stale value silently outrank the new defaults.
  if (t.detailNormal && typeof t.detailNormal === 'object' && !('tilesPerChunk' in t.detailNormal)) {
    const d = t.detailNormal
    if (typeof d.enabled === 'boolean') target.detailNormal.enabled = d.enabled
    if (typeof d.strength === 'number') target.detailNormal.strength = d.strength
    if (typeof d.tilesGrass === 'number') target.detailNormal.tilesGrass = d.tilesGrass
    if (typeof d.tilesBare === 'number') target.detailNormal.tilesBare = d.tilesBare
  }
}

/** Same missing-field-keeps-default guarantee as `applyStoredTerrain`, for `sky`. */
export function applyStoredSky(
  target: WorldConfig['sky'],
  s: Partial<WorldConfig['sky']> | undefined,
): void {
  if (s && typeof s === 'object') Object.assign(target, s)
}

/** Same missing-field-keeps-default guarantee as `applyStoredTerrain`, for `player`. */
export function applyStoredPlayer(
  target: WorldConfig['player'],
  p: Partial<WorldConfig['player']> | undefined,
): void {
  if (typeof p?.name === 'string' && p.name.trim()) target.name = p.name
}

/**
 * Priority: URL query (`seed`, `res`, `gui`) > localStorage domains > defaults.
 */
export function createWorldConfig(): WorldConfig {
  const params = new URLSearchParams(window.location.search)
  const stored = loadDomainConfigs()

  const seedFromUrl = params.has('seed') ? parseSeedFromUrl() : null
  const resRaw = Number(params.get('res'))
  const resFromUrl =
    Number.isFinite(resRaw) && resRaw >= 33 ? Math.floor(resRaw) : null

  const seed =
    seedFromUrl ??
    (typeof stored?.seed === 'number' ? stored.seed : parseSeedFromUrl())

  const resolution = resFromUrl ?? stored?.terrain?.resolution ?? DEFAULT_RESOLUTION

  const config = baseConfig(seed, resolution)

  if (stored?.terrain) {
    applyStoredTerrain(config.terrain, stored.terrain)
    // URL res wins; otherwise keep stored resolution already applied above
    // unless URL overrode — then don't let stored overwrite.
    if (resFromUrl == null && typeof stored.terrain.resolution === 'number') {
      config.terrain.resolution = stored.terrain.resolution
    }
  }

  applyStoredSky(config.sky, stored?.sky)
  applyStoredSettlements(config.settlements, stored?.settlements)

  if (stored?.postProcessing && typeof stored.postProcessing === 'object') {
    config.postProcessing = { ...config.postProcessing, ...stored.postProcessing }
  }

  applyStoredPlayer(config.player, stored?.player)

  config.showGui = params.get('gui') !== '0'
  return config
}

export function triangleCount(resolution: number): number {
  const seg = Math.max(1, resolution - 1)
  return 2 * seg * seg
}
