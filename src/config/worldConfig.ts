import type { RegionParams } from '../terrain/chunkHeightmap'
import type { FbmParams } from '../terrain/fbm'
import { parseSeedFromUrl } from '../world/parseSeed'
import { loadStoredConfig } from './persistConfig'

/** N8AO quality presets — trades AO/denoise sample counts for GPU cost. */
export type AoQuality = 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'

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
    /** Larger = smoother hills. */
    noiseScale: number
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
  }
  /** Show lil-gui panel (`?gui=0` to hide). */
  showGui: boolean
  player: {
    name: string
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
      noiseScale: 72,
      fbm: {
        octaves: 5,
        persistence: 0.55,
        lacunarity: 2.0,
        exponentiation: 2.4,
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
        mountainThresholdWidth: 0.12,
        worleyCellSize: 260,
        ridgeSharpness: 2.2,
        mountainGain: 0.75,
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
        },
      },
      grass: {
        enabled: true,
        // TEMP: high on purpose while tuning density/visuals — dial back down
        // (toward ~2) once look/perf is settled; see grass-rendering plan phase 4.
        radius: 10,
        density: 12000,
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
      aoQuality: 'Medium',
    },
    showGui: true,
    player: {
      name: DEFAULT_PLAYER_NAME,
    },
  }
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
    target.region = { ...target.region, ...r }
    if (r.continentFbm && typeof r.continentFbm === 'object') {
      target.region.continentFbm = { ...target.region.continentFbm, ...r.continentFbm }
    }
    if (r.mountainFbm && typeof r.mountainFbm === 'object') {
      target.region.mountainFbm = { ...target.region.mountainFbm, ...r.mountainFbm }
    }
    if (r.moistureRegionFbm && typeof r.moistureRegionFbm === 'object') {
      target.region.moistureRegionFbm = {
        ...target.region.moistureRegionFbm,
        ...r.moistureRegionFbm,
      }
    }
    if (r.roadNetwork && typeof r.roadNetwork === 'object') {
      target.region.roadNetwork = { ...target.region.roadNetwork, ...r.roadNetwork }
    }
  }
  if (t.grass && typeof t.grass === 'object') {
    if (typeof t.grass.enabled === 'boolean') target.grass.enabled = t.grass.enabled
    if (typeof t.grass.radius === 'number') target.grass.radius = t.grass.radius
    if (typeof t.grass.density === 'number') target.grass.density = t.grass.density
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
 * Priority: URL query (`seed`, `res`, `gui`) > localStorage > defaults.
 */
export function createWorldConfig(): WorldConfig {
  const params = new URLSearchParams(window.location.search)
  const stored = loadStoredConfig()

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
