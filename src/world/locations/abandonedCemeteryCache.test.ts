import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheKey, listCacheRecords, putCacheRecords } from '../../persistence/worldgenCacheDb'
import { type RawSampleParams } from '../../terrain/chunkHeightmap'
import {
  ABANDONED_CEMETERY_NAMESPACE,
  ABANDONED_CEMETERY_VERSION,
  abandonedCemeteryFingerprint,
  type CachedAbandonedCemeteryResult,
  chunkSubKey,
  createAbandonedCemeteryCache,
} from './abandonedCemeteryCache'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function params(overrides: Partial<RawSampleParams> = {}): RawSampleParams {
  return {
    seed: 1,
    heightScale: 18,
    waterLevel: 0.45,
    noiseScale: 120,
    detailAmplitude: 0.55,
    hillsScale: 420,
    hillsAmplitude: 0.28,
    hillsFbm: { octaves: 3, persistence: 0.55, lacunarity: 2.0, exponentiation: 1.15 },
    fbm: { octaves: 4, persistence: 0.65, lacunarity: 2.0, exponentiation: 1.35 },
    biome: { noiseScale: 96, fbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 } },
    region: {
      continentScale: 2200,
      continentFbm: { octaves: 3, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.0 },
      mountainScale: 1800,
      mountainFbm: { octaves: 2, persistence: 0.5, lacunarity: 2.0, exponentiation: 1.2 },
      mountainThreshold: 0.62,
      mountainThresholdWidth: 0.14,
      worleyCellSize: 260,
      ridgeSharpness: 2.0,
      mountainGain: 0.8,
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
        roadHalfWidth: 5, roadHeightStrength: 0.85, roadTintStrength: 0.8, pathHalfWidth: 1.5, pathHeightStrength: 0.2,
        pathTintStrength: 0.4, smoothingWindow: 10, maxNeighborRoads: 3, dockSearchRadius: 140, edgeWobbleAmplitude: 0.15,
        edgeWobbleScale: 0.06, potholeDepth: 0.12, potholeThreshold: 0.72, meanderAmplitude: 2, meanderScale: 0.04,
        surfaceDetailEnabled: true, rutDepth: 0.05, rutOffsetFraction: 0.42, rutWidthFraction: 0.16, microBumpStrength: 0.025, microBumpScale: 0.6,
      },
      village: { coreRadius: 9, houseRadius: 4.5, heightStrength: 0.8, tintStrength: 0.75, regionalHeightStrengthFlat: 0.3, regionalHeightStrengthMountain: 0.15 },
    },
    ...overrides,
  }
}

function found(id = 'cemetery:w:1:2:0:test'): CachedAbandonedCemeteryResult {
  return { status: 'found', id, x: 64, z: 128 }
}

function record(
  seed: number,
  cx: number,
  cz: number,
  fingerprint: string,
  payload: CachedAbandonedCemeteryResult,
  version = ABANDONED_CEMETERY_VERSION,
) {
  return {
    key: cacheKey(seed, ABANDONED_CEMETERY_NAMESPACE, version, chunkSubKey(cx, cz)),
    seed,
    namespace: ABANDONED_CEMETERY_NAMESPACE,
    version,
    fingerprint,
    payload,
    lastAccessedAt: 1,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('abandonedCemeteryFingerprint (plan world-025)', () => {
  it('is stable for identical params and chunk size', () => {
    expect(abandonedCemeteryFingerprint(params(), 64)).toBe(abandonedCemeteryFingerprint(params(), 64))
  })

  it('changes when a terrain-sampling-relevant field changes', () => {
    const a = abandonedCemeteryFingerprint(params(), 64)
    const b = abandonedCemeteryFingerprint(params({ waterLevel: 0.9 }), 64)
    expect(a).not.toBe(b)
  })

  it('changes when chunk size changes', () => {
    expect(abandonedCemeteryFingerprint(params(), 64)).not.toBe(abandonedCemeteryFingerprint(params(), 48))
  })
})

describe('chunkSubKey', () => {
  it('is stable for negative coordinates', () => {
    expect(chunkSubKey(-3, -4)).toBe('chunk:-3:-4')
    expect(chunkSubKey(0, 0)).toBe('chunk:0:0')
  })
})

describe('createAbandonedCemeteryCache (plan world-025)', () => {
  it('distinguishes a miss from a cached negative result', () => {
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp')
    expect(cache.lookup(0, 0)).toBeUndefined()
    cache.remember(0, 0, { status: 'none' })
    expect(cache.lookup(0, 0)).toEqual({ status: 'none' })
    cache.dispose()
  })

  it('remember() is immediately visible before persistence completes', async () => {
    const cache = createAbandonedCemeteryCache({ debounceMs: 50 })
    cache.activate(1, 'fp')
    cache.remember(2, 3, found())
    expect(cache.lookup(2, 3)).toEqual(found())
    expect((await listCacheRecords(1, ABANDONED_CEMETERY_NAMESPACE, ABANDONED_CEMETERY_VERSION)).length).toBe(0)
    cache.dispose()
  })

  it('activate() clears stale in-memory identity', () => {
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp-old')
    cache.remember(4, 5, found())
    cache.activate(2, 'fp-new')
    expect(cache.lookup(4, 5)).toBeUndefined()
    cache.dispose()
  })

  it('hydrates a positive result round-trip', async () => {
    const seed = 1
    const fp = 'fp-found'
    await putCacheRecords([record(seed, 2, 3, fp, found())])
    const cache = createAbandonedCemeteryCache()
    cache.activate(seed, fp)
    await cache.ready()
    expect(cache.lookup(2, 3)).toEqual(found())
    cache.dispose()
  })

  it('hydrates a negative result round-trip', async () => {
    const seed = 1
    const fp = 'fp-none'
    await putCacheRecords([record(seed, -2, -5, fp, { status: 'none' })])
    const cache = createAbandonedCemeteryCache()
    cache.activate(seed, fp)
    await cache.ready()
    expect(cache.lookup(-2, -5)).toEqual({ status: 'none' })
    cache.dispose()
  })

  it('treats a fingerprint mismatch as a miss', async () => {
    await putCacheRecords([record(1, 0, 0, 'fp-stale', found())])
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp-current')
    await cache.ready()
    expect(cache.lookup(0, 0)).toBeUndefined()
    cache.dispose()
  })

  it('isolates records by seed', async () => {
    await putCacheRecords([record(1, 0, 0, 'fp', found())])
    const cache = createAbandonedCemeteryCache()
    cache.activate(2, 'fp')
    await cache.ready()
    expect(cache.lookup(0, 0)).toBeUndefined()
    cache.dispose()
  })

  it('isolates records by namespace version', async () => {
    await putCacheRecords([record(1, 0, 0, 'fp', found(), ABANDONED_CEMETERY_VERSION + 1)])
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp')
    await cache.ready()
    expect(cache.lookup(0, 0)).toBeUndefined()
    cache.dispose()
  })

  it('ready() resolves for an empty store', async () => {
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp')
    await expect(cache.ready()).resolves.toBeUndefined()
    expect(cache.lookup(0, 0)).toBeUndefined()
    cache.dispose()
  })

  it('ready() resolves on storage failure', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp')
    await expect(cache.ready()).resolves.toBeUndefined()
    expect(cache.lookup(0, 0)).toBeUndefined()
    cache.dispose()
  })

  it('stale hydrate cannot overwrite a later activation', async () => {
    await putCacheRecords([record(1, 8, 9, 'fp-a', found())])
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp-a')
    cache.activate(2, 'fp-b')
    await cache.ready()
    expect(cache.lookup(8, 9)).toBeUndefined()
    await sleep(40)
    expect(cache.lookup(8, 9)).toBeUndefined()
    cache.dispose()
  })

  it('hydrate merge keeps remember() that landed during the in-flight read', async () => {
    await putCacheRecords([record(1, 1, 1, 'fp', { status: 'none' })])
    const cache = createAbandonedCemeteryCache()
    cache.activate(1, 'fp')
    cache.remember(2, 2, found())
    await cache.ready()
    expect(cache.lookup(2, 2)).toEqual(found())
    expect(cache.lookup(1, 1)).toEqual({ status: 'none' })
    cache.dispose()
  })

  it('enforces a per-seed record cap after a flush', async () => {
    const cache = createAbandonedCemeteryCache({ debounceMs: 20, maxRecordsPerSeed: 2 })
    cache.activate(1, 'fp')
    cache.remember(0, 0, { status: 'none' })
    cache.remember(1, 0, { status: 'none' })
    cache.remember(2, 0, found())
    await sleep(60)
    const rows = await listCacheRecords(1, ABANDONED_CEMETERY_NAMESPACE, ABANDONED_CEMETERY_VERSION)
    expect(rows.length).toBe(2)
    cache.dispose()
  })
})
