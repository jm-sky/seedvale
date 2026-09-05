import { openSeedvaleDb, SEEDS_STORE } from './db'
import { isSeedRecord, type SeedRecord } from './seedRecord'

/**
 * @domain persistence
 * @system seed-library
 * @role CRUD for `SeedRecord`s in the shared `seedvale` IndexedDB database.
 * @uses SeedRecord
 */

function storeGet(db: IDBDatabase, seed: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SEEDS_STORE, 'readonly')
    const req = tx.objectStore(SEEDS_STORE).get(seed)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function storePut(db: IDBDatabase, record: SeedRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SEEDS_STORE, 'readwrite')
    tx.objectStore(SEEDS_STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function storeDelete(db: IDBDatabase, seed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SEEDS_STORE, 'readwrite')
    tx.objectStore(SEEDS_STORE).delete(seed)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function storeGetAll(db: IDBDatabase): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SEEDS_STORE, 'readonly')
    const req = tx.objectStore(SEEDS_STORE).getAll()
    req.onsuccess = () => resolve(req.result as unknown[])
    req.onerror = () => reject(req.error)
  })
}

export async function listSeedRecords(): Promise<SeedRecord[]> {
  try {
    const db = await openSeedvaleDb()
    try {
      const rows = await storeGetAll(db)
      return rows.filter(isSeedRecord)
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

export async function getSeedRecord(seed: number): Promise<SeedRecord | null> {
  try {
    const db = await openSeedvaleDb()
    try {
      const raw = await storeGet(db, seed)
      return isSeedRecord(raw) ? raw : null
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

/** Never inserts a value the current schema can't read back — same
 *  outgoing-validation guard `saveDb.ts` uses for `SaveData`. */
export async function putSeedRecord(record: SeedRecord): Promise<boolean> {
  if (!isSeedRecord(record)) return false
  try {
    const db = await openSeedvaleDb()
    try {
      await storePut(db, record)
      return true
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

/** Cheap metadata bump (plan §13/§15) — a New Game reusing an existing seed,
 *  or a save load, touches this without materializing/scanning anything.
 *  No-ops for a seed with no record yet (nothing to backfill from here). */
export async function touchSeedLastUsed(seed: number, now = Date.now()): Promise<void> {
  const existing = await getSeedRecord(seed)
  if (!existing) return
  await putSeedRecord({ ...existing, lastUsedAt: now })
}

export async function renameSeedRecord(seed: number, customName: string): Promise<boolean> {
  const existing = await getSeedRecord(seed)
  if (!existing) return false
  const trimmed = customName.trim()
  return putSeedRecord({ ...existing, customName: trimmed || undefined })
}

export async function updateSeedDescription(seed: number, description: string): Promise<boolean> {
  const existing = await getSeedRecord(seed)
  if (!existing) return false
  const trimmed = description.trim()
  return putSeedRecord({ ...existing, description: trimmed || undefined })
}

export async function updateSeedTags(seed: number, tags: readonly string[]): Promise<boolean> {
  const existing = await getSeedRecord(seed)
  if (!existing) return false
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  return putSeedRecord({ ...existing, tags: cleaned })
}

/** Unconditional delete — callers (plan §10/§14: `world/seedLibrary.ts`) are
 *  responsible for the "referenced by a save" guard before calling this. */
export async function deleteSeedRecord(seed: number): Promise<void> {
  try {
    const db = await openSeedvaleDb()
    try {
      await storeDelete(db, seed)
    } finally {
      db.close()
    }
  } catch {
    // ignore — a failed delete leaves harmless metadata behind, never save data
  }
}
