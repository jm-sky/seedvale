import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSeedRecord, putSeedRecord } from '../persistence/seedDb'
import { minimalSeedRecord } from '../persistence/seedRecord'
import { countCacheForSeed } from '../persistence/worldgenCacheDb'
import { type RawSampleParams } from '../terrain/chunkHeightmap'
import {
  clearSeedCache,
  deleteSeedGuarded,
  ensureSeedRecordsForSeeds,
  isSeedInLibrary,
  resolveInitialSeedChoice,
  resolveNewGameSeed,
} from './seedLibrary'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeSampleParams(seed: number): RawSampleParams {
  return {
    seed,
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
  }
}

describe('resolveNewGameSeed (plan world-015 §3)', () => {
  it('an "existing" choice returns that seed verbatim and never calls randomSeed()', async () => {
    await putSeedRecord(minimalSeedRecord(7, 'Leśne Wzgórza', 1000))
    const seed = await resolveNewGameSeed({ kind: 'existing', seed: 7 }, fakeSampleParams)
    expect(seed).toBe(7)
  })

  it('an "existing" choice bumps lastUsedAt without creating a duplicate/second record', async () => {
    await putSeedRecord(minimalSeedRecord(7, 'Leśne Wzgórza', 1000))
    await resolveNewGameSeed({ kind: 'existing', seed: 7 }, fakeSampleParams)
    const record = await getSeedRecord(7)
    expect(record?.lastUsedAt).toBeGreaterThanOrEqual(1000)
    expect(record?.generatedName).toBe('Leśne Wzgórza')
  })

  it('a "generate" choice creates a brand-new SeedRecord from a cheap profile, without world/location scan', async () => {
    const seed = await resolveNewGameSeed({ kind: 'generate' }, fakeSampleParams)
    const record = await getSeedRecord(seed)
    expect(record).not.toBeNull()
    expect(record?.seed).toBe(seed)
    expect(record?.generatedName.length).toBeGreaterThan(0)
    // Creating a seed must never write any worldgen cache itself (plan §5
    // "otwarcie Seed Library nie zwiększa zakresu policzonego world cache").
    expect(await countCacheForSeed(seed)).toBe(0)
  })
})

describe('ensureSeedRecordsForSeeds (plan world-015 §3/§13 lazy backfill)', () => {
  it('creates a minimal record for a seed with none yet', async () => {
    await ensureSeedRecordsForSeeds([42])
    const record = await getSeedRecord(42)
    expect(record).not.toBeNull()
    expect(record?.tags).toEqual([])
  })

  it('never overwrites an existing record\'s user metadata', async () => {
    await putSeedRecord({ ...minimalSeedRecord(42, 'Stara nazwa', 1), customName: 'Mój seed', tags: ['ulubiony'] })
    await ensureSeedRecordsForSeeds([42])
    const record = await getSeedRecord(42)
    expect(record?.customName).toBe('Mój seed')
    expect(record?.tags).toEqual(['ulubiony'])
    expect(record?.generatedName).toBe('Stara nazwa')
  })

  it('deduplicates repeated seeds across many saves', async () => {
    await ensureSeedRecordsForSeeds([1, 1, 1, 2])
    expect(await getSeedRecord(1)).not.toBeNull()
    expect(await getSeedRecord(2)).not.toBeNull()
  })
})

describe('deleteSeedGuarded (plan world-015 §10/§14)', () => {
  it('refuses to delete a seed referenced by an existing save', async () => {
    await putSeedRecord(minimalSeedRecord(7, 'X', 1))
    const result = await deleteSeedGuarded(7, new Set([7]))
    expect(result).toEqual({ ok: false, error: 'referenced' })
    expect(await getSeedRecord(7)).not.toBeNull()
  })

  it('deletes an unreferenced seed and its cache', async () => {
    await putSeedRecord(minimalSeedRecord(7, 'X', 1))
    const result = await deleteSeedGuarded(7, new Set())
    expect(result).toEqual({ ok: true })
    expect(await getSeedRecord(7)).toBeNull()
  })
})

describe('clearSeedCache (plan world-015 §9/§10)', () => {
  it('clearing cache never touches the SeedRecord itself', async () => {
    const record = { ...minimalSeedRecord(7, 'X', 1), customName: 'Nazwa', tags: ['a'] }
    await putSeedRecord(record)
    await clearSeedCache(7)
    expect(await getSeedRecord(7)).toEqual(record)
  })
})

describe('isSeedInLibrary (plan persistence-004 §9 follow-up)', () => {
  it('is true when the seed already has a library entry', () => {
    expect(isSeedInLibrary(7, [minimalSeedRecord(7, 'X', 1)])).toBe(true)
  })

  it('is false for a seed with no library entry', () => {
    expect(isSeedInLibrary(123, [minimalSeedRecord(7, 'X', 1)])).toBe(false)
  })

  it('is false against an empty library', () => {
    expect(isSeedInLibrary(123, [])).toBe(false)
  })
})

describe('resolveInitialSeedChoice (plan persistence-004 §9 follow-up)', () => {
  it('picks an explicit URL seed over the most-recently-used library seed', () => {
    const seeds = [minimalSeedRecord(7, 'Stary', 1000), minimalSeedRecord(9, 'Nowszy', 2000)]
    expect(resolveInitialSeedChoice(123, seeds)).toEqual({ kind: 'existing', seed: 123 })
  })

  it('picks the URL seed even when it already matches a library entry, without duplicating it', () => {
    const seeds = [minimalSeedRecord(7, 'X', 1000)]
    expect(resolveInitialSeedChoice(7, seeds)).toEqual({ kind: 'existing', seed: 7 })
  })

  it('falls back to the most recently used seed when there is no URL seed', () => {
    const seeds = [minimalSeedRecord(7, 'Stary', 1000), minimalSeedRecord(9, 'Nowszy', 2000)]
    expect(resolveInitialSeedChoice(null, seeds)).toEqual({ kind: 'existing', seed: 9 })
  })

  it('falls back to "generate" when there is no URL seed and the library is empty', () => {
    expect(resolveInitialSeedChoice(null, [])).toEqual({ kind: 'generate' })
  })
})
