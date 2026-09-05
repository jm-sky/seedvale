import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openSeedvaleDb, SAVES_STORE, SEEDS_STORE, WORLDGEN_CACHE_STORE } from './db'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Simulates a pre-Seed-Library database — the exact v1 shape `saveDb.ts`
 *  used to create on its own (plan world-015 §2). */
function openLegacyV1Db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('seedvale', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SAVES_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function put(db: IDBDatabase, store: string, value: unknown, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function get(db: IDBDatabase, store: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

describe('openSeedvaleDb — v1 -> v2 upgrade (plan world-015 §2)', () => {
  it('adds seeds/worldgenCache stores without touching existing saves rows', async () => {
    const legacy = await openLegacyV1Db()
    await put(legacy, SAVES_STORE, { name: 'Zapis', data: { marker: 'pre-upgrade' } }, 'slot_1')
    legacy.close()

    const upgraded = await openSeedvaleDb()
    expect(upgraded.objectStoreNames.contains(SAVES_STORE)).toBe(true)
    expect(upgraded.objectStoreNames.contains(SEEDS_STORE)).toBe(true)
    expect(upgraded.objectStoreNames.contains(WORLDGEN_CACHE_STORE)).toBe(true)
    expect(await get(upgraded, SAVES_STORE, 'slot_1')).toEqual({ name: 'Zapis', data: { marker: 'pre-upgrade' } })
    upgraded.close()
  })

  it('a fresh database (no prior version) gets all three stores directly', async () => {
    const db = await openSeedvaleDb()
    expect(db.objectStoreNames.contains(SAVES_STORE)).toBe(true)
    expect(db.objectStoreNames.contains(SEEDS_STORE)).toBe(true)
    expect(db.objectStoreNames.contains(WORLDGEN_CACHE_STORE)).toBe(true)
    db.close()
  })
})
