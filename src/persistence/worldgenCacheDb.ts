import { openSeedvaleDb, WORLDGEN_CACHE_BY_SEED_INDEX, WORLDGEN_CACHE_STORE } from './db'

/**
 * @domain persistence
 * @system worldgen-cache
 * @role Generic `(seed, namespace, version, key) -> payload` disposable
 *  derived-data store (plan world-015 §11/§12) — a persistence primitive,
 *  never a source of world truth. A namespace owner (e.g.
 *  `world/locations/locationsCoarseCache.ts`) decides its own payload shape,
 *  fingerprint and versioning; this module only knows how to store/retrieve/
 *  bound it.
 * @integration Runtime correctness must never depend on this succeeding — a
 *  read miss or write failure always falls back to normal procedural
 *  generation at the call site.
 */
export type CacheRecord<TPayload = unknown> = {
  key: string
  seed: number
  namespace: string
  version: number
  /** Fingerprint of every deterministic input besides `seed` that this
   *  namespace's payload depends on (plan §8) — a record whose fingerprint
   *  doesn't match the caller's current one is a cache miss, never migrated. */
  fingerprint: string
  payload: TPayload
  lastAccessedAt: number
}

export function cacheKey(seed: number, namespace: string, version: number, subKey: string): string {
  return `${seed}/${namespace}/${version}/${subKey}`
}

function withStore<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore, tx: IDBTransaction) => void, collect: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORLDGEN_CACHE_STORE, mode)
    const store = tx.objectStore(WORLDGEN_CACHE_STORE)
    run(store, tx)
    tx.oncomplete = () => resolve(collect())
    tx.onerror = () => reject(tx.error)
  })
}

function getAllBySeed(db: IDBDatabase, seed: number): Promise<CacheRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORLDGEN_CACHE_STORE, 'readonly')
    const index = tx.objectStore(WORLDGEN_CACHE_STORE).index(WORLDGEN_CACHE_BY_SEED_INDEX)
    const req = index.getAll(seed)
    req.onsuccess = () => resolve((req.result as CacheRecord[]) ?? [])
    req.onerror = () => reject(req.error)
  })
}

/** Every record for `(seed, namespace, version)`, regardless of fingerprint —
 *  the caller (namespace owner) filters by its own current fingerprint, so a
 *  stale-terrain-config record is a miss rather than something this module
 *  has to understand. */
export async function listCacheRecords<TPayload = unknown>(seed: number, namespace: string, version: number): Promise<CacheRecord<TPayload>[]> {
  try {
    const db = await openSeedvaleDb()
    try {
      const rows = await getAllBySeed(db, seed)
      return rows.filter((r) => r.namespace === namespace && r.version === version) as CacheRecord<TPayload>[]
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

/** Bounded batch upsert (plan §16) — one readwrite transaction for the whole
 *  batch instead of one per record. Never throws into a gameplay path; a
 *  failure here only means this session's dirty tiles stay unpersisted. */
export async function putCacheRecords(records: readonly CacheRecord[]): Promise<void> {
  if (records.length === 0) return
  try {
    const db = await openSeedvaleDb()
    try {
      await withStore(db, 'readwrite', (store) => {
        for (const record of records) store.put(record)
      }, () => undefined)
    } finally {
      db.close()
    }
  } catch {
    // Persistence is an optimization only — swallow and let the next dirty
    // batch retry naturally.
  }
}

export async function deleteCacheForSeed(seed: number): Promise<void> {
  try {
    const db = await openSeedvaleDb()
    try {
      const rows = await getAllBySeed(db, seed)
      if (rows.length === 0) return
      await withStore(db, 'readwrite', (store) => {
        for (const row of rows) store.delete(row.key)
      }, () => undefined)
    } finally {
      db.close()
    }
  } catch {
    // ignore — Clear cache/Delete seed are best-effort against disposable data
  }
}

export async function countCacheForSeed(seed: number): Promise<number> {
  try {
    const db = await openSeedvaleDb()
    try {
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(WORLDGEN_CACHE_STORE, 'readonly')
        const index = tx.objectStore(WORLDGEN_CACHE_STORE).index(WORLDGEN_CACHE_BY_SEED_INDEX)
        const req = index.count(seed)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

/** Simple bounded-cleanup seam (plan §17) — no quota manager, just "drop the
 *  least-recently-touched records for this seed/namespace once it grows past
 *  `maxRecords`". Never touches `SeedRecord` metadata or saves; only ever
 *  called after a successful `putCacheRecords()` for the same namespace. */
export async function enforceCacheCap(seed: number, namespace: string, version: number, maxRecords: number): Promise<void> {
  try {
    const db = await openSeedvaleDb()
    try {
      const rows = (await getAllBySeed(db, seed)).filter((r) => r.namespace === namespace && r.version === version)
      if (rows.length <= maxRecords) return
      const toDrop = [...rows].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt).slice(0, rows.length - maxRecords)
      await withStore(db, 'readwrite', (store) => {
        for (const row of toDrop) store.delete(row.key)
      }, () => undefined)
    } finally {
      db.close()
    }
  } catch {
    // ignore — cleanup is best-effort, an oversized cache is not a correctness bug
  }
}
