/**
 * @domain persistence
 * @system worldgen-cache
 * @role Shared IndexedDB open/upgrade seam for the whole `seedvale` database.
 * @integration `saveDb.ts` keeps owning save-slot semantics against the
 *  `saves` store; `seedDb.ts`/`worldgenCacheDb.ts` (plan world-015) own the
 *  `seeds`/`worldgenCache` stores added here. Every caller still opens and
 *  closes its own connection per operation (same lifecycle `saveDb.ts`
 *  already used) — this module only centralizes `DB_NAME`/`DB_VERSION` and
 *  the `onupgradeneeded` store creation so a version bump can never leave one
 *  store owner unaware of another's schema.
 */
export const DB_NAME = 'seedvale'
export const DB_VERSION = 2

export const SAVES_STORE = 'saves'
export const SEEDS_STORE = 'seeds'
export const WORLDGEN_CACHE_STORE = 'worldgenCache'
/** Index on `worldgenCache.seed` — every "all cache for this seed" read
 *  (hydrate-on-activate, Clear cache, delete-seed cleanup) goes through it
 *  instead of a full store scan. */
export const WORLDGEN_CACHE_BY_SEED_INDEX = 'by_seed'

/** Opens (or upgrades) the shared `seedvale` database. Never caches the
 *  connection — each caller opens, does its transaction(s), and closes, same
 *  as the pre-existing `saveDb.ts` pattern; upgrading here only adds stores
 *  that don't exist yet, so existing `saves` rows are untouched (v1 → v2). */
export function openSeedvaleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SAVES_STORE)) {
        db.createObjectStore(SAVES_STORE)
      }
      if (!db.objectStoreNames.contains(SEEDS_STORE)) {
        db.createObjectStore(SEEDS_STORE, { keyPath: 'seed' })
      }
      if (!db.objectStoreNames.contains(WORLDGEN_CACHE_STORE)) {
        const store = db.createObjectStore(WORLDGEN_CACHE_STORE, { keyPath: 'key' })
        store.createIndex(WORLDGEN_CACHE_BY_SEED_INDEX, 'seed')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
