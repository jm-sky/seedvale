import type { FbmParams } from '../terrain/fbm'
import { parseSeedFromUrl } from '../world/parseSeed'
import { loadStoredConfig } from './persistConfig'

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
  }
  sky: {
    inclination: number
    azimuth: number
    turbidity: number
    rayleigh: number
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
    },
    sky: {
      inclination: 0.36,
      azimuth: 0.25,
      turbidity: 2.2,
      rayleigh: 2.4,
    },
    showGui: true,
    player: {
      name: DEFAULT_PLAYER_NAME,
    },
  }
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
    const t = stored.terrain
    if (typeof t.chunkSize === 'number') config.terrain.chunkSize = t.chunkSize
    if (typeof t.loadRadius === 'number') config.terrain.loadRadius = t.loadRadius
    if (typeof t.unloadRadius === 'number') config.terrain.unloadRadius = t.unloadRadius
    if (typeof t.flatShading === 'boolean') config.terrain.flatShading = t.flatShading
    if (typeof t.heightScale === 'number') config.terrain.heightScale = t.heightScale
    if (typeof t.waterLevel === 'number') config.terrain.waterLevel = t.waterLevel
    if (typeof t.noiseScale === 'number') config.terrain.noiseScale = t.noiseScale
    if (t.fbm && typeof t.fbm === 'object') {
      config.terrain.fbm = { ...config.terrain.fbm, ...t.fbm }
    }
    if (t.biome && typeof t.biome === 'object') {
      if (typeof t.biome.noiseScale === 'number') {
        config.terrain.biome.noiseScale = t.biome.noiseScale
      }
      if (t.biome.fbm && typeof t.biome.fbm === 'object') {
        config.terrain.biome.fbm = {
          ...config.terrain.biome.fbm,
          ...t.biome.fbm,
        }
      }
    }
    // URL res wins; otherwise keep stored resolution already applied above
    // unless URL overrode — then don't let stored overwrite.
    if (resFromUrl == null && typeof t.resolution === 'number') {
      config.terrain.resolution = t.resolution
    }
  }

  if (stored?.sky && typeof stored.sky === 'object') {
    config.sky = { ...config.sky, ...stored.sky }
  }

  if (typeof stored?.player?.name === 'string' && stored.player.name.trim()) {
    config.player.name = stored.player.name
  }

  config.showGui = params.get('gui') !== '0'
  return config
}

export function triangleCount(resolution: number): number {
  const seg = Math.max(1, resolution - 1)
  return 2 * seg * seg
}
