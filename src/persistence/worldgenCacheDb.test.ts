import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheKey,
  type CacheRecord,
  countCacheForSeed,
  deleteCacheForSeed,
  enforceCacheCap,
  listCacheRecords,
  putCacheRecords,
} from './worldgenCacheDb'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function record(seed: number, key: string, fingerprint: string, lastAccessedAt: number, namespace = 'ns', version = 1): CacheRecord<string> {
  return { key: cacheKey(seed, namespace, version, key), seed, namespace, version, fingerprint, payload: `payload:${key}`, lastAccessedAt }
}

describe('worldgenCacheDb — generic (seed, namespace, version, key) cache (plan world-015 §11/§12)', () => {
  it('round-trips a batch of records and lists them back for (seed, namespace, version)', async () => {
    await putCacheRecords([record(1, 'a', 'fp', 10), record(1, 'b', 'fp', 20)])
    const rows = await listCacheRecords(1, 'ns', 1)
    expect(rows.map((r) => r.payload).sort()).toEqual(['payload:a', 'payload:b'])
  })

  it('cache for one seed never leaks into a query for another seed (plan §19 "seed A never reaches seed B")', async () => {
    await putCacheRecords([record(1, 'a', 'fp', 10), record(2, 'a', 'fp', 10)])
    expect((await listCacheRecords(1, 'ns', 1)).length).toBe(1)
    expect((await listCacheRecords(2, 'ns', 1)).length).toBe(1)
  })

  it('a different namespace or version is never returned by a query for another one', async () => {
    await putCacheRecords([
      record(1, 'a', 'fp', 10, 'ns-a', 1),
      record(1, 'a', 'fp', 10, 'ns-b', 1),
      record(1, 'a', 'fp', 10, 'ns-a', 2),
    ])
    expect((await listCacheRecords(1, 'ns-a', 1)).length).toBe(1)
    expect((await listCacheRecords(1, 'ns-b', 1)).length).toBe(1)
    expect((await listCacheRecords(1, 'ns-a', 2)).length).toBe(1)
  })

  it('deleteCacheForSeed removes every namespace for that seed only', async () => {
    await putCacheRecords([record(1, 'a', 'fp', 10, 'ns-a'), record(1, 'a', 'fp', 10, 'ns-b'), record(2, 'a', 'fp', 10)])
    await deleteCacheForSeed(1)
    expect((await listCacheRecords(1, 'ns-a', 1)).length).toBe(0)
    expect((await listCacheRecords(1, 'ns-b', 1)).length).toBe(0)
    expect((await listCacheRecords(2, 'ns', 1)).length).toBe(1)
  })

  it('countCacheForSeed counts every namespace for that seed', async () => {
    await putCacheRecords([record(1, 'a', 'fp', 10, 'ns-a'), record(1, 'b', 'fp', 10, 'ns-b')])
    expect(await countCacheForSeed(1)).toBe(2)
    expect(await countCacheForSeed(2)).toBe(0)
  })

  it('enforceCacheCap drops only the least-recently-accessed records past the cap (plan §17)', async () => {
    await putCacheRecords([
      record(1, 'old', 'fp', 1),
      record(1, 'mid', 'fp', 2),
      record(1, 'new', 'fp', 3),
    ])
    await enforceCacheCap(1, 'ns', 1, 2)
    const remaining = await listCacheRecords(1, 'ns', 1)
    expect(remaining.map((r) => r.payload).sort()).toEqual(['payload:mid', 'payload:new'])
  })

  it('enforceCacheCap is a no-op under the cap', async () => {
    await putCacheRecords([record(1, 'a', 'fp', 1), record(1, 'b', 'fp', 2)])
    await enforceCacheCap(1, 'ns', 1, 10)
    expect((await listCacheRecords(1, 'ns', 1)).length).toBe(2)
  })

  it('putCacheRecords with an empty batch is a safe no-op', async () => {
    await expect(putCacheRecords([])).resolves.toBeUndefined()
  })
})
