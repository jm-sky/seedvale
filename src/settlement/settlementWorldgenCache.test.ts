import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawSampleParams, RegionParams } from '../terrain/chunkHeightmap'
import type { TerrainSamplers } from './settlementTerrain'
import { cacheKey, listCacheRecords, putCacheRecords } from '../persistence/worldgenCacheDb'
import * as settlementGenerator from './settlementGenerator'
import { generateSettlementDef, type SettlementDef } from './settlementGenerator'
import {
  activateSettlementDefinitionCacheForWorld,
  attachSettlementDefinitionPersistence,
  cachedSettlementProgressionPolicy,
  clearSettlementDefCache,
  ingestHydratedSettlementDef,
  settlementDefFor,
  settlementDefinitionCacheReady,
  type SettlementResolveContext,
} from './settlementPlanCache'
import {
  createSettlementWorldgenCache,
  isValidSettlementDefPayload,
  parseSettlementCellSubKey,
  SETTLEMENT_DEFINITION_CACHE_NAMESPACE,
  SETTLEMENT_DEFINITION_CACHE_VERSION,
  settlementCellSubKey,
  settlementDefinitionFingerprint,
  type SettlementProgressionIdentity,
} from './settlementWorldgenCache'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  clearSettlementDefCache()
})

afterEach(() => {
  attachSettlementDefinitionPersistence(null)
  clearSettlementDefCache()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
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

const samplers: TerrainSamplers = {
  sampleContinentalness: () => 0.55,
  sampleMountainRidge: () => 0.05,
  sampleMoistureRegion: () => 0.45,
}

const region = {
  coastThreshold: 0.45,
  desertThreshold: 0.35,
  desertThresholdWidth: 0.12,
  swampThreshold: 0.72,
  swampThresholdWidth: 0.15,
  village: {
    coreRadius: 9,
    houseRadius: 4.5,
    heightStrength: 0.8,
    tintStrength: 0.75,
    regionalHeightStrengthFlat: 0.3,
    regionalHeightStrengthMountain: 0.15,
  },
  roadNetwork: {
    dockSearchRadius: 140,
  },
} as RegionParams

const flatHeight = (): number => 12
const wetHeight = (): number => -2

function ctxFor(
  seed: number,
  sampleHeight = flatHeight,
  homeSize?: SettlementResolveContext['homeSize'],
): SettlementResolveContext {
  return {
    seed,
    sampleHeight,
    waterLevel: 0,
    localSearchRadius: 56,
    terrainSamplers: samplers,
    heightScale: 1,
    region,
    homeSize,
  }
}

function fingerprintFor(
  overrides: {
    params?: RawSampleParams
    localSearchRadius?: number
    homeSize?: SettlementResolveContext['homeSize']
    progression?: SettlementProgressionIdentity
  } = {},
): string {
  return settlementDefinitionFingerprint({
    params: overrides.params ?? params(),
    localSearchRadius: overrides.localSearchRadius ?? 56,
    homeSize: overrides.homeSize,
    progression: overrides.progression ?? null,
  })
}

function record(
  seed: number,
  gx: number,
  gz: number,
  fingerprint: string,
  payload: unknown,
  version = SETTLEMENT_DEFINITION_CACHE_VERSION,
) {
  const subKey = settlementCellSubKey(gx, gz)
  return {
    key: cacheKey(seed, SETTLEMENT_DEFINITION_CACHE_NAMESPACE, version, subKey),
    seed,
    namespace: SETTLEMENT_DEFINITION_CACHE_NAMESPACE,
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
  const session = new Map<string, SettlementDef | null>()
  const searches: string[] = []
  const cache = createSettlementWorldgenCache({
    debounceMs: options?.debounceMs,
    maxRecordsPerSeed: options?.maxRecordsPerSeed,
    hydrateInto(key, value) {
      if (session.has(key)) return
      session.set(key, value)
    },
  })
  function lookup(key: string): SettlementDef | null | undefined {
    return session.get(key)
  }
  function compute(key: string, value: SettlementDef | null): SettlementDef | null {
    searches.push(key)
    session.set(key, value)
    cache.remember(key, value)
    return value
  }
  function resolve(key: string, fallback: () => SettlementDef | null): SettlementDef | null {
    const cached = session.get(key)
    if (cached !== undefined) return cached
    return compute(key, fallback())
  }
  return { session, searches, cache, lookup, compute, resolve }
}

function realDef(cell = { gx: 1, gz: 0 }, seed = 99): SettlementDef {
  const def = generateSettlementDef(cell, seed, flatHeight, 0, 56, samplers, 1, region)
  if (!def) throw new Error('expected a settlement def on dry land')
  return def
}

function persistCache(options?: { debounceMs?: number, maxRecordsPerSeed?: number }) {
  const cache = createSettlementWorldgenCache({
    debounceMs: options?.debounceMs,
    maxRecordsPerSeed: options?.maxRecordsPerSeed,
    hydrateInto: ingestHydratedSettlementDef,
  })
  attachSettlementDefinitionPersistence(cache)
  return cache
}

describe('settlementCellSubKey', () => {
  it('round-trips integer grid coordinates, including negatives', () => {
    expect(parseSettlementCellSubKey(settlementCellSubKey(2, -3))).toEqual({ gx: 2, gz: -3 })
    expect(parseSettlementCellSubKey('2_-3')).toBeNull()
  })
})

describe('settlementDefinitionFingerprint (plan settlements-014)', () => {
  it('is stable for identical params, radius, home size and progression identity', () => {
    const progression: SettlementProgressionIdentity = {
      homeSize: 'SM',
      near: { gx: 1, gz: 0, minimum: 'MD' },
      far: { gx: 4, gz: -2, minimum: 'LG' },
    }
    const input = { params: params(), localSearchRadius: 56, homeSize: 'auto' as const, progression }
    expect(settlementDefinitionFingerprint(input)).toBe(settlementDefinitionFingerprint(input))
  })

  it('changes when waterLevel / region terrain config changes', () => {
    const base = fingerprintFor()
    expect(fingerprintFor({ params: params({ waterLevel: 0.9 }) })).not.toBe(base)
    const regionParams = params()
    regionParams.region = {
      ...regionParams.region,
      mountainGain: 1.4,
    }
    expect(fingerprintFor({ params: regionParams })).not.toBe(base)
  })

  it('changes when homeSize or local-search radius changes', () => {
    const base = fingerprintFor({ homeSize: 'MD' })
    expect(fingerprintFor({ homeSize: 'LG' })).not.toBe(base)
    expect(fingerprintFor({ homeSize: 'MD', localSearchRadius: 80 })).not.toBe(base)
  })

  it('changes when resolved progression-policy identity changes', () => {
    const base = fingerprintFor({
      progression: { homeSize: 'SM', near: { gx: 1, gz: 0, minimum: 'MD' }, far: null },
    })
    expect(fingerprintFor({
      progression: { homeSize: 'SM', near: { gx: 0, gz: 1, minimum: 'MD' }, far: null },
    })).not.toBe(base)
    expect(fingerprintFor({ progression: null })).not.toBe(base)
  })
})

describe('isValidSettlementDefPayload', () => {
  it('accepts literal null and a generated SettlementDef with nested VillagePlan', () => {
    const def = realDef()
    expect(isValidSettlementDefPayload(null)).toBe(true)
    expect(isValidSettlementDefPayload(def)).toBe(true)
    expect(def.plan.identity.id).toBe(def.id)
    expect(def.plan.identity.name).toBe(def.name)
    expect(def.plan.site.x).toBe(def.x)
  })

  it('round-trips current optional VillagePlan structures when generation produced them', () => {
    let found: SettlementDef | null = null
    for (const seed of [7, 11, 19, 41, 99, 128, 256, 512]) {
      for (const cell of [{ gx: 1, gz: 0 }, { gx: 2, gz: -1 }, { gx: 3, gz: 1 }, { gx: 0, gz: 2 }]) {
        const def = generateSettlementDef(cell, seed, flatHeight, 0, 56, samplers, 1, region)
        if (!def) continue
        if (def.plan.pasture || def.plan.paddock) {
          found = def
          break
        }
      }
      if (found) break
    }
    expect(found).not.toBeNull()
    expect(isValidSettlementDefPayload(found)).toBe(true)
    const cloned = structuredClone(found)
    expect(isValidSettlementDefPayload(cloned)).toBe(true)
    expect(cloned).toEqual(found)
  })

  it('rejects malformed payloads', () => {
    expect(isValidSettlementDefPayload(undefined)).toBe(false)
    expect(isValidSettlementDefPayload({})).toBe(false)
    const def = realDef()
    expect(isValidSettlementDefPayload({ ...def, id: 'not-the-cell' })).toBe(false)
    expect(isValidSettlementDefPayload({ ...def, families: [{ id: 'family-0' }] })).toBe(false)
    expect(isValidSettlementDefPayload({ ...def, plan: { ...def.plan, pattern: 'spiral' } })).toBe(false)
    expect(isValidSettlementDefPayload({ ...def, name: 'other-name' })).toBe(false)
  })
})

describe('createSettlementWorldgenCache (plan settlements-014)', () => {
  it('round-trips SettlementDef including nested VillagePlan', async () => {
    const stored = realDef({ gx: 2, gz: -1 }, 7)
    const fp = 'fp'
    await putCacheRecords([record(1, 2, -1, fp, stored)])
    const { cache, lookup, searches, resolve } = createSessionCache()
    cache.activate(1, fp)
    await cache.ready()
    const key = settlementCellSubKey(2, -1)
    expect(lookup(key)).toEqual(stored)
    expect(lookup(key)?.plan).toEqual(stored.plan)
    expect(resolve(key, () => realDef())).toEqual(stored)
    expect(searches).toEqual([])
    cache.dispose()
  })

  it('distinguishes a miss from a cached empty cell', async () => {
    const { cache, lookup, compute } = createSessionCache()
    cache.activate(1, 'fp')
    const key = settlementCellSubKey(2, 3)
    expect(lookup(key)).toBeUndefined()
    compute(key, null)
    expect(lookup(key)).toBeNull()
    cache.dispose()
  })

  it('cached null avoids a second generation', async () => {
    const key = settlementCellSubKey(2, 3)
    await putCacheRecords([record(1, 2, 3, 'fp', null)])
    const { cache, lookup, searches, resolve } = createSessionCache()
    cache.activate(1, 'fp')
    await cache.ready()
    expect(lookup(key)).toBeNull()
    expect(resolve(key, () => realDef())).toBeNull()
    expect(searches).toEqual([])
    cache.dispose()
  })

  it('treats a different seed, fingerprint or version as a miss', async () => {
    const stored = realDef()
    await putCacheRecords([record(1, 1, 0, 'fp-stale', stored)])
    const { cache: fpCache, lookup: fpLookup } = createSessionCache()
    fpCache.activate(1, 'fp-current')
    await fpCache.ready()
    expect(fpLookup(settlementCellSubKey(1, 0))).toBeUndefined()
    fpCache.dispose()

    const { cache: seedCache, lookup: seedLookup } = createSessionCache()
    seedCache.activate(2, 'fp-stale')
    await seedCache.ready()
    expect(seedLookup(settlementCellSubKey(1, 0))).toBeUndefined()
    seedCache.dispose()

    await putCacheRecords([record(1, 1, 0, 'fp', stored, SETTLEMENT_DEFINITION_CACHE_VERSION + 1)])
    const { cache: verCache, lookup: verLookup } = createSessionCache()
    verCache.activate(1, 'fp')
    await verCache.ready()
    expect(verLookup(settlementCellSubKey(1, 0))).toBeUndefined()
    verCache.dispose()
  })

  it('runtime-computed value wins over an in-flight hydrate for the same key', async () => {
    const stale = realDef({ gx: 1, gz: 0 }, 1)
    const fresh = realDef({ gx: 1, gz: 0 }, 2)
    await putCacheRecords([record(1, 1, 0, 'fp', stale)])
    const { cache, lookup, compute } = createSessionCache()
    cache.activate(1, 'fp')
    compute(settlementCellSubKey(1, 0), fresh)
    await cache.ready()
    expect(lookup(settlementCellSubKey(1, 0))).toEqual(fresh)
    cache.dispose()
  })

  it('stale activation cannot populate or flush after rebuild', async () => {
    const stored = realDef()
    await putCacheRecords([record(1, 1, 0, 'fp-a', stored)])
    const { cache, lookup, compute, session } = createSessionCache({ debounceMs: 20 })
    cache.activate(1, 'fp-a')
    compute(settlementCellSubKey(3, 3), realDef({ gx: 3, gz: 3 }))
    session.clear()
    cache.activate(2, 'fp-b')
    await cache.ready()
    expect(lookup(settlementCellSubKey(1, 0))).toBeUndefined()
    expect(lookup(settlementCellSubKey(3, 3))).toBeUndefined()
    await sleep(50)
    const rows = await listCacheRecords(2, SETTLEMENT_DEFINITION_CACHE_NAMESPACE, SETTLEMENT_DEFINITION_CACHE_VERSION)
    expect(rows).toHaveLength(0)
    cache.dispose()
  })

  it('invalidate() drops in-flight hydrate so a cleared runtime map stays empty', async () => {
    await putCacheRecords([record(1, 1, 0, 'fp', realDef())])
    const { cache, lookup } = createSessionCache()
    cache.activate(1, 'fp')
    cache.invalidate()
    await cache.ready()
    await sleep(40)
    expect(lookup(settlementCellSubKey(1, 0))).toBeUndefined()
    cache.dispose()
  })

  it('ignores a malformed payload', async () => {
    await putCacheRecords([record(1, 1, 0, 'fp', { id: '1_0', gx: 1, gz: 0 })])
    const { cache, lookup } = createSessionCache()
    cache.activate(1, 'fp')
    await cache.ready()
    expect(lookup(settlementCellSubKey(1, 0))).toBeUndefined()
    cache.dispose()
  })

  it('storage failure falls back to normal generation', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { cache, lookup, searches, resolve } = createSessionCache()
    cache.activate(1, 'fp')
    await expect(cache.ready()).resolves.toBeUndefined()
    expect(lookup(settlementCellSubKey(1, 0))).toBeUndefined()
    const generated = realDef()
    expect(resolve(settlementCellSubKey(1, 0), () => generated)).toEqual(generated)
    expect(searches).toEqual([settlementCellSubKey(1, 0)])
    cache.dispose()
  })

  it('enforces a per-seed record cap after a flush (eviction is performance-only)', async () => {
    const { cache, compute } = createSessionCache({ debounceMs: 20, maxRecordsPerSeed: 2 })
    cache.activate(1, 'fp')
    compute(settlementCellSubKey(1, 0), realDef({ gx: 1, gz: 0 }))
    compute(settlementCellSubKey(2, 0), realDef({ gx: 2, gz: 0 }))
    compute(settlementCellSubKey(3, 0), realDef({ gx: 3, gz: 0 }))
    // Flush is fire-and-forget after debounce; SettlementDef payloads are large
    // enough that a fixed sleep can observe the put before enforceCacheCap.
    await vi.waitFor(async () => {
      const rows = await listCacheRecords(1, SETTLEMENT_DEFINITION_CACHE_NAMESPACE, SETTLEMENT_DEFINITION_CACHE_VERSION)
      expect(rows.length).toBe(2)
    })
    cache.dispose()
  })

  it('does not persist until activate()', async () => {
    const { cache, compute } = createSessionCache({ debounceMs: 20 })
    compute(settlementCellSubKey(1, 0), realDef())
    await sleep(50)
    expect((await listCacheRecords(1, SETTLEMENT_DEFINITION_CACHE_NAMESPACE, SETTLEMENT_DEFINITION_CACHE_VERSION)).length).toBe(0)
    cache.dispose()
  })
})

describe('settlementPlanCache persistent hydrate (plan settlements-014)', () => {
  it('hydrated SettlementDef skip generateSettlementDef on the same seed/fingerprint/cell', async () => {
    const cache = persistCache()
    const ctx = ctxFor(11)
    activateSettlementDefinitionCacheForWorld(ctx, params({ seed: 11 }))
    const generated = settlementDefFor({ gx: 1, gz: 0 }, ctx)
    expect(generated).not.toBeNull()
    await sleep(0)
    cache.dispose()

    const fp = fingerprintFor({
      params: params({ seed: 11 }),
      progression: (() => {
        const policy = cachedSettlementProgressionPolicy()
        if (policy === undefined || policy === null) return null
        return {
          homeSize: policy.homeSize,
          near: policy.near
            ? { gx: policy.near.cell.gx, gz: policy.near.cell.gz, minimum: policy.near.minimum }
            : null,
          far: policy.far
            ? { gx: policy.far.cell.gx, gz: policy.far.cell.gz, minimum: policy.far.minimum }
            : null,
        }
      })(),
    })
    await putCacheRecords([record(11, 1, 0, fp, generated)])

    clearSettlementDefCache()
    const cold = persistCache()
    const spy = vi.spyOn(settlementGenerator, 'generateSettlementDef')
    activateSettlementDefinitionCacheForWorld(ctxFor(11), params({ seed: 11 }))
    await settlementDefinitionCacheReady()
    const hydrated = settlementDefFor({ gx: 1, gz: 0 }, ctxFor(11))
    expect(hydrated).toEqual(generated)
    expect(spy).not.toHaveBeenCalled()
    cold.dispose()
  })

  it('cached null from settlementDefFor is a hit, not a miss', async () => {
    const ctx = ctxFor(11, wetHeight)
    const cache = persistCache({ debounceMs: 20 })
    activateSettlementDefinitionCacheForWorld(ctx, params({ seed: 11 }))
    await settlementDefinitionCacheReady()
    expect(settlementDefFor({ gx: 2, gz: 3 }, ctx)).toBeNull()
    await sleep(50)
    const rows = await listCacheRecords(11, SETTLEMENT_DEFINITION_CACHE_NAMESPACE, SETTLEMENT_DEFINITION_CACHE_VERSION)
    expect(rows.some((row) => row.payload === null)).toBe(true)
    cache.dispose()

    clearSettlementDefCache()
    const cold = persistCache()
    const spy = vi.spyOn(settlementGenerator, 'generateSettlementDef')
    activateSettlementDefinitionCacheForWorld(ctxFor(11, wetHeight), params({ seed: 11 }))
    await settlementDefinitionCacheReady()
    expect(settlementDefFor({ gx: 2, gz: 3 }, ctxFor(11, wetHeight))).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    cold.dispose()
  })

  it('in-flight hydrate cannot overwrite a newly generated result', async () => {
    const stale = realDef({ gx: 1, gz: 0 }, 1)
    const ctx = ctxFor(21)
    activateSettlementDefinitionCacheForWorld(ctx, params({ seed: 21 }))
    const policy = cachedSettlementProgressionPolicy()
    const fp = fingerprintFor({
      params: params({ seed: 21 }),
      progression: policy && policy !== undefined
        ? {
            homeSize: policy.homeSize,
            near: policy.near
              ? { gx: policy.near.cell.gx, gz: policy.near.cell.gz, minimum: policy.near.minimum }
              : null,
            far: policy.far
              ? { gx: policy.far.cell.gx, gz: policy.far.cell.gz, minimum: policy.far.minimum }
              : null,
          }
        : null,
    })
    clearSettlementDefCache()
    await putCacheRecords([record(21, 1, 0, fp, stale)])
    persistCache()
    const liveCtx = ctxFor(21)
    activateSettlementDefinitionCacheForWorld(liveCtx, params({ seed: 21 }))
    const generated = settlementDefFor({ gx: 1, gz: 0 }, liveCtx)
    await settlementDefinitionCacheReady()
    expect(settlementDefFor({ gx: 1, gz: 0 }, liveCtx)).toEqual(generated)
    expect(generated).not.toEqual(stale)
  })

  it('rebuild cannot leak previous-world defs', async () => {
    const cache = persistCache()
    const ctxA = ctxFor(31)
    activateSettlementDefinitionCacheForWorld(ctxA, params({ seed: 31 }))
    await settlementDefinitionCacheReady()
    const defA = settlementDefFor({ gx: 1, gz: 0 }, ctxA)
    expect(defA).not.toBeNull()
    clearSettlementDefCache()
    const ctxB = ctxFor(32)
    activateSettlementDefinitionCacheForWorld(ctxB, params({ seed: 32 }))
    await settlementDefinitionCacheReady()
    expect(settlementDefFor({ gx: 1, gz: 0 }, ctxB)?.id).toBe('1_0')
    expect(settlementDefFor({ gx: 1, gz: 0 }, ctxB)).not.toEqual(defA)
    cache.dispose()
  })

  it('progression-policy change invalidates previously persisted cells', async () => {
    const stored = realDef({ gx: 1, gz: 0 }, 41)
    const fpA = fingerprintFor({
      params: params({ seed: 41 }),
      progression: { homeSize: 'SM', near: { gx: 1, gz: 0, minimum: 'MD' }, far: null },
    })
    const fpB = fingerprintFor({
      params: params({ seed: 41 }),
      progression: { homeSize: 'SM', near: { gx: 0, gz: 1, minimum: 'MD' }, far: null },
    })
    expect(fpA).not.toBe(fpB)
    await putCacheRecords([record(41, 1, 0, fpA, stored)])
    const { cache, lookup } = createSessionCache()
    cache.activate(41, fpB)
    await cache.ready()
    expect(lookup(settlementCellSubKey(1, 0))).toBeUndefined()
    cache.dispose()
  })

  it('storage failure falls back to generateSettlementDef', async () => {
    vi.stubGlobal('indexedDB', undefined)
    persistCache()
    const spy = vi.spyOn(settlementGenerator, 'generateSettlementDef')
    const ctx = ctxFor(51)
    activateSettlementDefinitionCacheForWorld(ctx, params({ seed: 51 }))
    await expect(settlementDefinitionCacheReady()).resolves.toBeUndefined()
    const def = settlementDefFor({ gx: 1, gz: 0 }, ctx)
    expect(def).not.toBeNull()
    expect(spy).toHaveBeenCalled()
  })
})
