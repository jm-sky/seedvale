import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorldConfig } from './worldConfig'
import {
  loadDomainConfigs,
  saveGraphics,
  savePlayer,
  saveWorld,
} from './persistConfig'

const LEGACY_KEY = 'seedvale:worldConfig:v1'
const GRAPHICS_KEY = 'seedvale:graphics:v1'
const PLAYER_KEY = 'seedvale:player:v1'
const WORLD_KEY = 'seedvale:world:v1'

function installMemoryLocalStorage(): Storage {
  const store = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memory,
  })
  return memory
}

beforeEach(() => {
  installMemoryLocalStorage()
})

afterEach(() => {
  localStorage.clear()
})

function minimalConfig(): WorldConfig {
  return {
    seed: 42,
    terrain: {
      chunkSize: 64,
      resolution: 65,
      loadRadius: 3,
      unloadRadius: 4,
      flatShading: false,
      heightScale: 18,
      waterLevel: 0.45,
      noiseScale: 105,
      detailAmplitude: 0.65,
      hillsScale: 420,
      hillsAmplitude: 0.34,
      hillsFbm: { octaves: 3, persistence: 0.55, lacunarity: 2.0, exponentiation: 1.15 },
      fbm: { octaves: 4, persistence: 0.65, lacunarity: 2.0, exponentiation: 1.35 },
      biome: {
        noiseScale: 96,
        fbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
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
      grass: { enabled: true, radius: 2, density: 120000 },
      detailNormal: { enabled: true, strength: 3, tilesGrass: 4, tilesBare: 12 },
    },
    sky: { inclination: 0.36, azimuth: 0.25, turbidity: 2.2, rayleigh: 2.4 },
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
      godRaysExposure: 0.22,
      pixelRatioCap: 2,
      terrainCastsShadow: true,
    },
    showGui: true,
    player: { name: 'Ja' },
    settlements: { homeSize: 'auto' },
  }
}

describe('persistConfig domains (issue 019)', () => {
  it('migrates legacy worldConfig:v1 into domain keys', () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        seed: 99,
        player: { name: 'Ada' },
        postProcessing: { aoEnabled: false },
        sky: { inclination: 0.5 },
      }),
    )

    const loaded = loadDomainConfigs()
    expect(loaded?.seed).toBe(99)
    expect(loaded?.player?.name).toBe('Ada')
    expect(loaded?.postProcessing?.aoEnabled).toBe(false)
    expect(loaded?.sky?.inclination).toBe(0.5)

    expect(localStorage.getItem(GRAPHICS_KEY)).toBeTruthy()
    expect(localStorage.getItem(PLAYER_KEY)).toBeTruthy()
    expect(localStorage.getItem(WORLD_KEY)).toBeTruthy()
  })

  it('saving one domain does not overwrite another', () => {
    const config = minimalConfig()
    saveWorld(config)
    saveGraphics(config)
    savePlayer(config)

    config.player.name = 'Changed'
    config.postProcessing.aoEnabled = false
    config.seed = 777
    config.settlements.homeSize = 'XL'
    savePlayer(config)

    const graphics = JSON.parse(localStorage.getItem(GRAPHICS_KEY)!) as {
      postProcessing: { aoEnabled: boolean }
    }
    const world = JSON.parse(localStorage.getItem(WORLD_KEY)!) as {
      seed: number
      settlements: { homeSize: string }
    }
    const player = JSON.parse(localStorage.getItem(PLAYER_KEY)!) as {
      player: { name: string }
    }

    expect(player.player.name).toBe('Changed')
    expect(graphics.postProcessing.aoEnabled).toBe(true)
    expect(world.seed).toBe(42)
    expect(world.settlements.homeSize).toBe('auto')
  })
})
