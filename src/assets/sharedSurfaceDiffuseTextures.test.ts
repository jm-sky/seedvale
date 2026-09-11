import {
  DataTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  Texture,
} from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetSharedSurfaceDiffuseTexturesForTests,
  CAVE_ROCK_DIFFUSE_DEFAULT_INFLUENCE,
  getSharedCaveRockDiffuse,
  getSharedTerrainDirtDiffuse,
  TERRAIN_DIRT_DIFFUSE_DEFAULT_INFLUENCE,
  TERRAIN_DIRT_DIFFUSE_URL,
} from './sharedSurfaceDiffuseTextures'

afterEach(() => {
  __resetSharedSurfaceDiffuseTexturesForTests()
})

function makeLoadedTexture(): Texture {
  const tex = new DataTexture(new Uint8Array([200, 180, 160, 255]), 4, 4)
  tex.needsUpdate = true
  return tex
}

describe('sharedSurfaceDiffuseTextures', () => {
  it('returns stable sampler objects and lazy-starts one load per asset', () => {
    const loader = vi.fn((_url: string) => Promise.resolve(makeLoadedTexture()))
    __resetSharedSurfaceDiffuseTexturesForTests({ loader })

    const a = getSharedTerrainDirtDiffuse()
    const b = getSharedTerrainDirtDiffuse()
    expect(a).toBe(b)
    expect(a.influence.value).toBe(0)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledWith(TERRAIN_DIRT_DIFFUSE_URL)
  })

  it('keeps distinct dirt and rock texture instances', () => {
    const loader = vi.fn((_url: string) => Promise.resolve(makeLoadedTexture()))
    __resetSharedSurfaceDiffuseTexturesForTests({ loader })

    const dirt = getSharedTerrainDirtDiffuse()
    const rock = getSharedCaveRockDiffuse()
    expect(dirt).not.toBe(rock)
    expect(dirt.map).not.toBe(rock.map)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('configures loaded textures and enables influence on success', async () => {
    const loaded = makeLoadedTexture()
    const loader = vi.fn(() => Promise.resolve(loaded))
    __resetSharedSurfaceDiffuseTexturesForTests({ loader })

    const sampler = getSharedTerrainDirtDiffuse()
    await Promise.resolve()
    await Promise.resolve()

    expect(sampler.map.value).toBe(loaded)
    expect(sampler.influence.value).toBe(TERRAIN_DIRT_DIFFUSE_DEFAULT_INFLUENCE)
    expect(loaded.wrapS).toBe(RepeatWrapping)
    expect(loaded.wrapT).toBe(RepeatWrapping)
    expect(loaded.generateMipmaps).toBe(true)
    expect(loaded.minFilter).toBe(LinearMipmapLinearFilter)
    expect(loaded.anisotropy).toBe(8)
  })

  it('leaves influence zero when load rejects', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('network')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    __resetSharedSurfaceDiffuseTexturesForTests({ loader })

    const sampler = getSharedTerrainDirtDiffuse()
    const fallbackUuid = sampler.map.value.uuid
    await Promise.resolve()
    await Promise.resolve()

    expect(sampler.influence.value).toBe(0)
    expect(sampler.map.value.uuid).toBe(fallbackUuid)
    warn.mockRestore()
  })

  it('does not dispose shared textures when a consumer material is disposed', async () => {
    const loaded = makeLoadedTexture()
    __resetSharedSurfaceDiffuseTexturesForTests({
      loader: () => Promise.resolve(loaded),
    })
    const sampler = getSharedCaveRockDiffuse()
    await Promise.resolve()
    expect(sampler.influence.value).toBe(CAVE_ROCK_DIFFUSE_DEFAULT_INFLUENCE)

    const disposeSpy = vi.spyOn(loaded, 'dispose')
    // Simulate material teardown — only clears references, never disposes shared GPU data.
    sampler.influence.value = 0
    expect(disposeSpy).not.toHaveBeenCalled()
    expect(getSharedCaveRockDiffuse().map.value).toBe(loaded)
  })

  it('binds a valid neutral fallback before load completes', () => {
    let resolve!: (t: Texture) => void
    const pending = new Promise<Texture>((r) => {
      resolve = r
    })
    __resetSharedSurfaceDiffuseTexturesForTests({
      loader: () => pending,
    })

    const sampler = getSharedTerrainDirtDiffuse()
    expect(sampler.map.value).toBeInstanceOf(DataTexture)
    expect((sampler.map.value as DataTexture).image.width).toBe(1)
    expect(sampler.influence.value).toBe(0)
    resolve(makeLoadedTexture())
  })
})
