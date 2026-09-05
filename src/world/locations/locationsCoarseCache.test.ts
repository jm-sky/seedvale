import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheKey, listCacheRecords, putCacheRecords } from '../../persistence/worldgenCacheDb'
import { type RawSampleParams } from '../../terrain/chunkHeightmap'
import {
  createCoarseCachePersistence,
  LOCATIONS_COARSE_NAMESPACE,
  LOCATIONS_COARSE_VERSION,
  locationsCoarseFingerprint,
  tileSubKey,
} from './locationsCoarseCache'

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

describe('locationsCoarseFingerprint (plan world-015 §8)', () => {
  it('is stable for identical params', () => {
    expect(locationsCoarseFingerprint(params())).toBe(locationsCoarseFingerprint(params()))
  })

  it('changes when a terrain-sampling-relevant field changes', () => {
    const a = locationsCoarseFingerprint(params())
    const b = locationsCoarseFingerprint(params({ waterLevel: 0.9 }))
    expect(a).not.toBe(b)
  })

  it('is independent of object key order', () => {
    const a = params()
    const b = { region: a.region, seed: a.seed, waterLevel: a.waterLevel, heightScale: a.heightScale, noiseScale: a.noiseScale, detailAmplitude: a.detailAmplitude, hillsScale: a.hillsScale, hillsAmplitude: a.hillsAmplitude, hillsFbm: a.hillsFbm, fbm: a.fbm, biome: a.biome } as RawSampleParams
    expect(locationsCoarseFingerprint(a)).toBe(locationsCoarseFingerprint(b))
  })
})

describe('createCoarseCachePersistence (plan world-015 §9/§13/§15)', () => {
  it('activate() never blocks — hydrateTile is safe to call synchronously right after', () => {
    const controller = createCoarseCachePersistence()
    controller.activate(1, 'fp-1')
    // Nothing has had a chance to load yet; a cold/in-flight read is a miss,
    // never a throw or a block (plan §9 "correctness fallback").
    expect(controller.hydrateTile(0, 0)).toBeNull()
    controller.dispose()
  })

  it('hydrates only records matching both seed and the current fingerprint', async () => {
    const seed = 1
    const fp = 'fp-match'
    await putCacheRecords([{
      key: cacheKey(seed, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION, tileSubKey(2, 3)),
      seed,
      namespace: LOCATIONS_COARSE_NAMESPACE,
      version: LOCATIONS_COARSE_VERSION,
      fingerprint: fp,
      payload: { state: new Uint8Array([1, 2, 3]), height: new Float32Array([0, 0, 0]) },
      lastAccessedAt: 1,
    }, {
      key: cacheKey(seed, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION, tileSubKey(9, 9)),
      seed,
      namespace: LOCATIONS_COARSE_NAMESPACE,
      version: LOCATIONS_COARSE_VERSION,
      fingerprint: 'fp-stale',
      payload: { state: new Uint8Array([9]), height: new Float32Array([0]) },
      lastAccessedAt: 1,
    }])

    const controller = createCoarseCachePersistence()
    controller.activate(seed, fp)
    await vi.waitFor(() => expect(controller.hydrateTile(2, 3)).not.toBeNull())
    expect(controller.hydrateTile(2, 3)?.state).toEqual(new Uint8Array([1, 2, 3]))
    // A record for a different fingerprint (stale terrain config) is a miss,
    // never applied — plan §8/§12.
    expect(controller.hydrateTile(9, 9)).toBeNull()
    controller.dispose()
  })

  // Real (short) timers rather than `vi.useFakeTimers()` — fake-indexeddb's
  // own request completion relies on real macrotasks, which fake timers
  // would freeze alongside the debounce timer itself.
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  it('onTileDirty batches into a single debounced write, readable back via listCacheRecords', async () => {
    const seed = 5
    const fp = 'fp-dirty'
    const controller = createCoarseCachePersistence({ debounceMs: 20 })
    controller.activate(seed, fp)

    const tileA = { state: new Uint8Array([7]), height: new Float32Array([0]) }
    const tileB = { state: new Uint8Array([8]), height: new Float32Array([0]) }
    controller.onTileDirty(0, 0, tileA)
    controller.onTileDirty(1, 0, tileB)

    // Nothing written yet — still inside the debounce window.
    expect((await listCacheRecords(seed, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION)).length).toBe(0)

    await sleep(60)

    const rows = await listCacheRecords(seed, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION)
    expect(rows.length).toBe(2)
    expect(rows.every((r) => r.fingerprint === fp)).toBe(true)
    controller.dispose()
  })

  it('re-activating with a new seed/fingerprint drops any pending dirty tiles from the old identity (plan §9)', async () => {
    const controller = createCoarseCachePersistence({ debounceMs: 20 })
    controller.activate(1, 'fp-old')
    controller.onTileDirty(0, 0, { state: new Uint8Array([1]), height: new Float32Array([0]) })

    // World rebuild happens before the debounce fires.
    controller.activate(2, 'fp-new')
    await sleep(60)

    expect((await listCacheRecords(1, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION)).length).toBe(0)
    expect((await listCacheRecords(2, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION)).length).toBe(0)
    controller.dispose()
  })
})
