import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoadRoute, RoutePoint } from './roadNetwork'
import type { RoadRiverCrossing } from './roadRiverCrossing'
import { cacheKey, listCacheRecords, putCacheRecords } from '../persistence/worldgenCacheDb'
import { type RawSampleParams } from '../terrain/chunkHeightmap'
import {
  createRoadRouteWorldgenCache,
  isValidRoadRoutePayload,
  ROAD_ROUTE_CACHE_NAMESPACE,
  ROAD_ROUTE_CACHE_VERSION,
  roadRouteFingerprint,
} from './roadRouteWorldgenCache'

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

function point(x: number, z: number, h = 10, hs = 10): RoutePoint {
  return { x, z, h, hs }
}

function crossing(id: string, kind: RoadRiverCrossing['kind'] = 'ford'): RoadRiverCrossing {
  return {
    id,
    kind,
    x: 10,
    z: 0,
    angle: 0,
    waterWidth: kind === 'bridge' ? 12 : 4,
    channelWidth: kind === 'bridge' ? 18 : 8,
    waterH: 9.6,
    naturalBedH: 9.2,
    crossSin: 1,
    span: kind === 'bridge' ? 18 : 8,
  }
}

function route(opts?: {
  kind?: RoadRoute['kind']
  crossings?: RoadRiverCrossing[]
}): RoadRoute {
  const a = point(0, 0)
  const b = point(20, 0)
  const kind = opts?.kind ?? 'road'
  return {
    points: [a, b],
    segments: [{ a, b, kind }],
    kind,
    crossings: opts?.crossings ?? [],
  }
}

function record(
  seed: number,
  subKey: string,
  fingerprint: string,
  payload: unknown,
  version = ROAD_ROUTE_CACHE_VERSION,
) {
  return {
    key: cacheKey(seed, ROAD_ROUTE_CACHE_NAMESPACE, version, subKey),
    seed,
    namespace: ROAD_ROUTE_CACHE_NAMESPACE,
    version,
    fingerprint,
    payload,
    lastAccessedAt: 1,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createSessionCache(options?: { debounceMs?: number, maxRecordsPerSeed?: number }) {
  const session = new Map<string, RoadRoute | null>()
  const searches: string[] = []
  const cache = createRoadRouteWorldgenCache({
    debounceMs: options?.debounceMs,
    maxRecordsPerSeed: options?.maxRecordsPerSeed,
    hydrateInto(key, value) {
      if (session.has(key)) return
      session.set(key, value)
    },
  })
  function lookup(key: string): RoadRoute | null | undefined {
    return session.get(key)
  }
  function compute(key: string, value: RoadRoute | null): RoadRoute | null {
    searches.push(key)
    session.set(key, value)
    cache.remember(key, value)
    return value
  }
  function resolve(key: string, fallback: () => RoadRoute | null): RoadRoute | null {
    const cached = session.get(key)
    if (cached !== undefined) return cached
    return compute(key, fallback())
  }
  return { session, searches, cache, lookup, compute, resolve }
}

describe('roadRouteFingerprint (plan world-terrain-029)', () => {
  it('is stable for identical params, radius and home size', () => {
    const input = { params: params(), localSearchRadius: 56, homeSize: 'MD' as const }
    expect(roadRouteFingerprint(input)).toBe(roadRouteFingerprint(input))
  })

  it('changes when waterLevel / region terrain config changes', () => {
    const base = roadRouteFingerprint({ params: params(), localSearchRadius: 56, homeSize: 'MD' })
    expect(roadRouteFingerprint({ params: params({ waterLevel: 0.9 }), localSearchRadius: 56, homeSize: 'MD' })).not.toBe(base)
    const region = params()
    region.region = {
      ...region.region,
      roadNetwork: { ...region.region.roadNetwork, meanderAmplitude: 4 },
    }
    expect(roadRouteFingerprint({ params: region, localSearchRadius: 56, homeSize: 'MD' })).not.toBe(base)
  })

  it('changes when homeSize or local-search radius changes', () => {
    const base = roadRouteFingerprint({ params: params(), localSearchRadius: 56, homeSize: 'MD' })
    expect(roadRouteFingerprint({ params: params(), localSearchRadius: 56, homeSize: 'LG' })).not.toBe(base)
    expect(roadRouteFingerprint({ params: params(), localSearchRadius: 80, homeSize: 'MD' })).not.toBe(base)
  })
})

describe('isValidRoadRoutePayload', () => {
  it('accepts literal null and a well-formed route with crossings', () => {
    expect(isValidRoadRoutePayload(null)).toBe(true)
    expect(isValidRoadRoutePayload(route({ crossings: [crossing('a|b:0', 'bridge'), crossing('a|b:1', 'ford')] }))).toBe(true)
  })

  it('rejects malformed payloads', () => {
    expect(isValidRoadRoutePayload(undefined)).toBe(false)
    expect(isValidRoadRoutePayload({})).toBe(false)
    expect(isValidRoadRoutePayload({ ...route(), kind: 'trail' })).toBe(false)
    expect(isValidRoadRoutePayload({ ...route(), points: [point(0, 0)] })).toBe(false)
    expect(isValidRoadRoutePayload({ ...route(), crossings: [{ id: 'x', kind: 'ford' }] })).toBe(false)
    const broken = route()
    broken.segments[0]!.b = point(99, 99)
    expect(isValidRoadRoutePayload(broken)).toBe(false)
  })
})

describe('createRoadRouteWorldgenCache (plan world-terrain-029)', () => {
  it('distinguishes a miss from a cached failed route', () => {
    const { cache, lookup, compute } = createSessionCache()
    cache.activate(1, 'fp')
    expect(lookup('a|b')).toBeUndefined()
    compute('a|b', null)
    expect(lookup('a|b')).toBeNull()
    cache.dispose()
  })

  it('hydrates a RoadRoute with ford/bridge crossings without a second search', async () => {
    const seed = 1
    const fp = 'fp-route'
    const stored = route({ crossings: [crossing('s-a|s-b:0', 'bridge'), crossing('s-a|s-b:1', 'ford')] })
    await putCacheRecords([record(seed, 's-a|s-b', fp, stored)])
    const { cache, lookup, searches, resolve } = createSessionCache()
    cache.activate(seed, fp)
    await cache.ready()
    expect(lookup('s-a|s-b')).toEqual(stored)
    expect(resolve('s-a|s-b', () => route())).toEqual(stored)
    expect(searches).toEqual([])
    cache.dispose()
  })

  it('hydrated crossings and polyline equal the persisted canonical result', async () => {
    const stored = route({ crossings: [crossing('pair:0', 'bridge')] })
    await putCacheRecords([record(1, 'pair', 'fp', stored)])
    const { cache, lookup } = createSessionCache()
    cache.activate(1, 'fp')
    await cache.ready()
    const hydrated = lookup('pair')
    expect(hydrated).not.toBeUndefined()
    expect(hydrated?.points).toEqual(stored.points)
    expect(hydrated?.crossings).toEqual(stored.crossings)
    cache.dispose()
  })

  it('cached null avoids a second search', async () => {
    await putCacheRecords([record(1, 'a|b', 'fp', null)])
    const { cache, lookup, searches, resolve } = createSessionCache()
    cache.activate(1, 'fp')
    await cache.ready()
    expect(lookup('a|b')).toBeNull()
    expect(resolve('a|b', () => route())).toBeNull()
    expect(searches).toEqual([])
    cache.dispose()
  })

  it('A→B and B→A share one persisted subkey', async () => {
    const key = 'alpha|beta'
    await putCacheRecords([record(1, key, 'fp', route({ crossings: [crossing(`${key}:0`)] }))])
    const { cache, lookup } = createSessionCache()
    cache.activate(1, 'fp')
    await cache.ready()
    expect(lookup(key)?.crossings[0]?.id).toBe(`${key}:0`)
    expect(lookup('beta|alpha')).toBeUndefined()
    cache.dispose()
  })

  it('remember() is immediately visible before persistence completes', async () => {
    const { cache, lookup, compute } = createSessionCache({ debounceMs: 50 })
    cache.activate(1, 'fp')
    compute('a|b', route())
    expect(lookup('a|b')).toEqual(route())
    expect((await listCacheRecords(1, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION)).length).toBe(0)
    cache.dispose()
  })

  it('flushes a computed route including null', async () => {
    const { cache, compute } = createSessionCache({ debounceMs: 20 })
    cache.activate(1, 'fp')
    const stored = route({ crossings: [crossing('a|b:0', 'ford')] })
    compute('a|b', stored)
    compute('home:dock', null)
    await sleep(60)
    const rows = await listCacheRecords<RoadRoute | null>(1, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION)
    expect(rows).toHaveLength(2)
    const byKey = new Map(rows.map((row) => [row.key, row.payload]))
    expect(byKey.get(cacheKey(1, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION, 'a|b'))).toEqual(stored)
    expect(byKey.get(cacheKey(1, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION, 'home:dock'))).toBeNull()
    cache.dispose()
  })

  it('treats a different seed, fingerprint or version as a miss', async () => {
    const stored = route()
    await putCacheRecords([record(1, 'a|b', 'fp-stale', stored)])
    const { cache: fpCache, lookup: fpLookup } = createSessionCache()
    fpCache.activate(1, 'fp-current')
    await fpCache.ready()
    expect(fpLookup('a|b')).toBeUndefined()
    fpCache.dispose()

    const { cache: seedCache, lookup: seedLookup } = createSessionCache()
    seedCache.activate(2, 'fp-stale')
    await seedCache.ready()
    expect(seedLookup('a|b')).toBeUndefined()
    seedCache.dispose()

    await putCacheRecords([record(1, 'a|b', 'fp', stored, ROAD_ROUTE_CACHE_VERSION + 1)])
    const { cache: verCache, lookup: verLookup } = createSessionCache()
    verCache.activate(1, 'fp')
    await verCache.ready()
    expect(verLookup('a|b')).toBeUndefined()
    verCache.dispose()
  })

  it('runtime-computed value wins over an in-flight hydrate for the same key', async () => {
    const stale = route({ crossings: [crossing('stale:0', 'ford')] })
    const fresh = route({ crossings: [crossing('fresh:0', 'bridge')] })
    await putCacheRecords([record(1, 'a|b', 'fp', stale)])
    const { cache, lookup, compute } = createSessionCache()
    cache.activate(1, 'fp')
    compute('a|b', fresh)
    await cache.ready()
    expect(lookup('a|b')).toEqual(fresh)
    cache.dispose()
  })

  it('stale activation cannot populate or flush after rebuild', async () => {
    const stored = route({ crossings: [crossing('old:0')] })
    await putCacheRecords([record(1, 'a|b', 'fp-a', stored)])
    const { cache, lookup, compute, session } = createSessionCache({ debounceMs: 20 })
    cache.activate(1, 'fp-a')
    compute('c|d', route())
    // Production rebuild: `clearRoadNetworkCaches()` drops the runtime map
    // *and* invalidates the previous hydrate generation before the next activate.
    session.clear()
    cache.activate(2, 'fp-b')
    await cache.ready()
    expect(lookup('a|b')).toBeUndefined()
    expect(lookup('c|d')).toBeUndefined()
    await sleep(50)
    const rows = await listCacheRecords(2, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION)
    expect(rows).toHaveLength(0)
    cache.dispose()
  })

  it('invalidate() drops in-flight hydrate so a cleared runtime map stays empty', async () => {
    await putCacheRecords([record(1, 'a|b', 'fp', route())])
    const { cache, lookup } = createSessionCache()
    cache.activate(1, 'fp')
    cache.invalidate()
    await cache.ready()
    await sleep(40)
    expect(lookup('a|b')).toBeUndefined()
    cache.dispose()
  })

  it('ignores a malformed payload', async () => {
    await putCacheRecords([record(1, 'a|b', 'fp', { kind: 'road', points: [], segments: [], crossings: [] })])
    const { cache, lookup } = createSessionCache()
    cache.activate(1, 'fp')
    await cache.ready()
    expect(lookup('a|b')).toBeUndefined()
    cache.dispose()
  })

  it('storage failure falls back to normal route generation', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { cache, lookup, searches, resolve } = createSessionCache()
    cache.activate(1, 'fp')
    await expect(cache.ready()).resolves.toBeUndefined()
    expect(lookup('a|b')).toBeUndefined()
    const generated = route()
    expect(resolve('a|b', () => generated)).toEqual(generated)
    expect(searches).toEqual(['a|b'])
    cache.dispose()
  })

  it('ready() resolves for an empty store', async () => {
    const { cache, lookup } = createSessionCache()
    cache.activate(1, 'fp')
    await expect(cache.ready()).resolves.toBeUndefined()
    expect(lookup('a|b')).toBeUndefined()
    cache.dispose()
  })

  it('enforces a per-seed record cap after a flush (eviction is performance-only)', async () => {
    const { cache, compute } = createSessionCache({ debounceMs: 20, maxRecordsPerSeed: 2 })
    cache.activate(1, 'fp')
    compute('a|b', route())
    compute('c|d', route())
    compute('e|f', route())
    await sleep(60)
    const rows = await listCacheRecords(1, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION)
    expect(rows.length).toBe(2)
    cache.dispose()
  })

  it('does not persist until activate()', async () => {
    const { cache, compute } = createSessionCache({ debounceMs: 20 })
    compute('a|b', route())
    await sleep(50)
    expect((await listCacheRecords(1, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION)).length).toBe(0)
    cache.dispose()
  })
})
