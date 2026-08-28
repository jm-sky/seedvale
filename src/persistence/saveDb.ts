import { type SaveData } from './saveData'
import {
  ACTIVE_SAVE_ID_KEY,
  assertCanCreateSave,
  type CreateSaveError,
  generateSaveId,
  LEGACY_SAVE_KEY,
  nextDefaultSaveName,
  parseStoredSave,
  pickActiveSaveId,
  type SaveSlotInfo,
  sortSavesByRecency,
  toSaveSlotInfo,
  validateSaveName,
  wrapSave,
} from './saveSlots'

/**
 * @domain persistence
 * @system save-storage
 * @role Owns IndexedDB save slots and the active-save id.
 * @uses SaveData
 */
const DB_NAME = 'seedvale'
const DB_VERSION = 1
const STORE_NAME = 'saves'

export type { CreateSaveError, SaveSlotInfo }
export type CreateSaveResult =
  | { ok: true, id: string, name: string }
  | { ok: false, error: CreateSaveError }

let pendingNewSaveName: string | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function storeGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function storePut(db: IDBDatabase, value: unknown, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function storeDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function storeGetAll(db: IDBDatabase): Promise<{ key: IDBValidKey, value: unknown }[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.openCursor()
    const rows: { key: IDBValidKey, value: unknown }[] = []
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve(rows)
        return
      }
      rows.push({ key: cursor.key, value: cursor.value })
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

export function getActiveSaveId(): string | null {
  try {
    const value = localStorage.getItem(ACTIVE_SAVE_ID_KEY)
    return value && value.trim() ? value : null
  } catch {
    return null
  }
}

export function setActiveSaveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_SAVE_ID_KEY, id)
    else localStorage.removeItem(ACTIVE_SAVE_ID_KEY)
  } catch {
    // ignore
  }
}

export function getPendingNewSaveName(): string | null {
  return pendingNewSaveName
}

export function setPendingNewSaveName(name: string | null): void {
  pendingNewSaveName = name
}

/** Next `writeSave()` without an id creates a new named slot instead of overwriting. */
export function beginNewSave(name: string): void {
  setActiveSaveId(null)
  setPendingNewSaveName(name)
}

function parseRow(key: IDBValidKey, value: unknown): ReturnType<typeof parseStoredSave> {
  if (typeof key !== 'string') return null
  return parseStoredSave(key, value)
}

async function readAllSlots(db: IDBDatabase): Promise<NonNullable<ReturnType<typeof parseStoredSave>>[]> {
  const rows = await storeGetAll(db)
  const slots: NonNullable<ReturnType<typeof parseStoredSave>>[] = []
  for (const row of rows) {
    const parsed = parseRow(row.key, row.value)
    if (parsed) slots.push(parsed)
  }
  return slots
}

/** Promote a leftover key `'current'` (raw `SaveData` or envelope) to a named slot. */
async function migrateLegacyIfNeeded(): Promise<void> {
  const db = await openDb()
  try {
    const raw = await storeGet(db, LEGACY_SAVE_KEY)
    if (raw == null) return
    const parsed = parseStoredSave(LEGACY_SAVE_KEY, raw)
    if (!parsed) {
      await storeDelete(db, LEGACY_SAVE_KEY)
      return
    }
    const id = generateSaveId()
    await storePut(db, wrapSave(parsed.name, parsed.data), id)
    await storeDelete(db, LEGACY_SAVE_KEY)
    if (!getActiveSaveId()) setActiveSaveId(id)
  } finally {
    db.close()
  }
}

export async function listSaves(): Promise<SaveSlotInfo[]> {
  try {
    await migrateLegacyIfNeeded()
    const db = await openDb()
    try {
      const slots = await readAllSlots(db)
      return sortSavesByRecency(slots.map(toSaveSlotInfo))
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

export async function readSave(id?: string): Promise<SaveData | null> {
  try {
    await migrateLegacyIfNeeded()
    const slots = await listSaves()
    const targetId = id ?? pickActiveSaveId(getActiveSaveId(), slots)
    if (!targetId) return null
    const db = await openDb()
    try {
      const raw = await storeGet(db, targetId)
      const parsed = parseStoredSave(targetId, raw)
      if (!parsed) return null
      if (!id) setActiveSaveId(targetId)
      return parsed.data
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function writeSave(data: SaveData, id?: string): Promise<void> {
  try {
    await migrateLegacyIfNeeded()
    const targetId = id ?? getActiveSaveId()
    if (!targetId) {
      const slots = await listSaves()
      const existingNames = slots.map((slot) => slot.name)
      const pending = getPendingNewSaveName()
      const name = pending ?? nextDefaultSaveName(existingNames)
      await createSave(name, data)
      return
    }
    const db = await openDb()
    try {
      const raw = await storeGet(db, targetId)
      const parsed = parseStoredSave(targetId, raw)
      const name = parsed?.name ?? getPendingNewSaveName() ?? nextDefaultSaveName([])
      await storePut(db, wrapSave(name, data), targetId)
      setActiveSaveId(targetId)
    } finally {
      db.close()
    }
  } catch {
    // Quota / unsupported / interrupted by unload — ignore.
  }
}

export async function createSave(name: string, data: SaveData): Promise<CreateSaveResult> {
  try {
    await migrateLegacyIfNeeded()
    const slots = await listSaves()
    const check = assertCanCreateSave(name, slots.map((slot) => slot.name), slots.length)
    if (!check.ok) return check
    const id = generateSaveId()
    const db = await openDb()
    try {
      await storePut(db, wrapSave(check.name, data), id)
    } finally {
      db.close()
    }
    setActiveSaveId(id)
    setPendingNewSaveName(null)
    return { ok: true, id, name: check.name }
  } catch {
    return { ok: false, error: 'limit' }
  }
}

export async function renameSave(id: string, name: string): Promise<CreateSaveResult> {
  try {
    await migrateLegacyIfNeeded()
    const slots = await listSaves()
    const current = slots.find((slot) => slot.id === id)
    if (!current) return { ok: false, error: 'empty' }
    const check = validateSaveName(name, slots.filter((slot) => slot.id !== id).map((slot) => slot.name))
    if (!check.ok) return check
    const db = await openDb()
    try {
      const raw = await storeGet(db, id)
      const parsed = parseStoredSave(id, raw)
      if (!parsed) return { ok: false, error: 'empty' }
      await storePut(db, wrapSave(check.name, parsed.data), id)
    } finally {
      db.close()
    }
    return { ok: true, id, name: check.name }
  } catch {
    return { ok: false, error: 'empty' }
  }
}

export async function deleteSave(id: string): Promise<void> {
  try {
    await migrateLegacyIfNeeded()
    const db = await openDb()
    try {
      await storeDelete(db, id)
    } finally {
      db.close()
    }
    if (getActiveSaveId() === id) {
      const remaining = await listSaves()
      setActiveSaveId(pickActiveSaveId(null, remaining))
    }
  } catch {
    // ignore
  }
}
