import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from 'three'
import { loadTexture } from './loadTexture'

/** Linear mean luminance after sRGB decode — offline from asset pixels (plan 021). */
export const TERRAIN_DIRT_DIFFUSE_LINEAR_NEUTRAL = 0.091705
export const CAVE_ROCK_DIFFUSE_LINEAR_NEUTRAL = 0.125377

export const TERRAIN_DIRT_DIFFUSE_URL = '/images/textures/dirt_diff_1k.jpg'
export const CAVE_ROCK_DIFFUSE_URL = '/images/textures/marble_cliff_05_diff_1k.jpg'

/** Default colour-detail strength once the shared texture has loaded. */
export const TERRAIN_DIRT_DIFFUSE_DEFAULT_INFLUENCE = 0.22
export const CAVE_ROCK_DIFFUSE_DEFAULT_INFLUENCE = 0.25

export type SharedSurfaceDiffuseSampler = {
  /** Stable object referenced by every compiled shader instance. */
  map: { value: Texture }
  /** Scales modulation; stays 0 until load succeeds (or on failure). */
  influence: { value: number }
}

type SharedSurfaceDiffuseState = {
  sampler: SharedSurfaceDiffuseSampler
  loadStarted: boolean
}

let sharedNeutralFallback: DataTexture | null = null
let sharedTerrainDirt: SharedSurfaceDiffuseState | null = null
let sharedCaveRock: SharedSurfaceDiffuseState | null = null

/** @domain world-terrain */
function getSharedNeutralFallbackTexture(): DataTexture {
  if (!sharedNeutralFallback) {
    const data = new Uint8Array([128, 128, 128, 255])
    const tex = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.colorSpace = SRGBColorSpace
    tex.generateMipmaps = false
    tex.minFilter = LinearFilter
    tex.magFilter = LinearFilter
    tex.needsUpdate = true
    sharedNeutralFallback = tex
  }
  return sharedNeutralFallback
}

function configureLoadedDiffuseTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 8
  texture.needsUpdate = true
}

export type SharedSurfaceDiffuseLoader = (url: string) => Promise<Texture>

let loadDiffuseTexture: SharedSurfaceDiffuseLoader = loadTexture

/** Test-only: inject deferred/rejecting loader and reset module singletons. */
export function __resetSharedSurfaceDiffuseTexturesForTests(options?: {
  loader?: SharedSurfaceDiffuseLoader
}): void {
  sharedTerrainDirt = null
  sharedCaveRock = null
  loadDiffuseTexture = options?.loader ?? loadTexture
}

function createSamplerState(): SharedSurfaceDiffuseState {
  const fallback = getSharedNeutralFallbackTexture()
  const sampler: SharedSurfaceDiffuseSampler = {
    map: { value: fallback },
    influence: { value: 0 },
  }
  return { sampler, loadStarted: false }
}

function ensureDiffuseLoad(
  state: SharedSurfaceDiffuseState,
  url: string,
  defaultInfluence: number,
): void {
  if (state.loadStarted) return
  state.loadStarted = true
  void loadDiffuseTexture(url)
    .then((texture) => {
      configureLoadedDiffuseTexture(texture)
      state.sampler.map.value = texture
      state.sampler.influence.value = defaultInfluence
    })
    .catch((err: unknown) => {
      console.warn(`[surface-diffuse] failed to load ${url}:`, err)
      state.sampler.influence.value = 0
    })
}

/**
 * Process-wide terrain dirt diffuse sampler for injected terrain shaders.
 * Synchronous — starts async load on first access; influence stays 0 until ready.
 *
 * @domain world-terrain
 */
export function getSharedTerrainDirtDiffuse(): SharedSurfaceDiffuseSampler {
  if (!sharedTerrainDirt) {
    sharedTerrainDirt = createSamplerState()
  }
  ensureDiffuseLoad(
    sharedTerrainDirt,
    TERRAIN_DIRT_DIFFUSE_URL,
    TERRAIN_DIRT_DIFFUSE_DEFAULT_INFLUENCE,
  )
  return sharedTerrainDirt.sampler
}

/**
 * Process-wide cave rock diffuse sampler for injected cave surface shaders.
 *
 * @domain world-terrain
 */
export function getSharedCaveRockDiffuse(): SharedSurfaceDiffuseSampler {
  if (!sharedCaveRock) {
    sharedCaveRock = createSamplerState()
  }
  ensureDiffuseLoad(
    sharedCaveRock,
    CAVE_ROCK_DIFFUSE_URL,
    CAVE_ROCK_DIFFUSE_DEFAULT_INFLUENCE,
  )
  return sharedCaveRock.sampler
}
