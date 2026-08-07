import { loadSaveData, type SaveData } from './saveData'

const DB_NAME = 'seedvale'
const DB_VERSION = 1
const STORE_NAME = 'saves'
const SAVE_KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Best-effort: missing IndexedDB support, quota errors, or corrupted data all
 *  resolve to `null`/no-op rather than throwing — a lost save should never
 *  block boot or gameplay. */
export async function readSave(): Promise<SaveData | null> {
  try {
    const db = await openDb()
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(SAVE_KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return loadSaveData(result)
  } catch {
    return null
  }
}

export async function writeSave(data: SaveData): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(data, SAVE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Quota / unsupported / interrupted by unload — ignore.
  }
}

export async function clearSave(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(SAVE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // ignore
  }
}
