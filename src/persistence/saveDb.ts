import { type SaveData } from './saveData'
import {
  ACTIVE_SAVE_ID_KEY,
  assertCanCreateSave,
  type CreateSaveError,
  generateSaveId,
  inspectStoredSave,
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

/** Why a `writeSave()` call did not persist. `invalid-existing-slot` means the
 *  guard refused to overwrite a record it could not read/parse (plan
 *  persistence-002) — the original bytes are untouched. `db-error` covers an
 *  IndexedDB failure during the attempt itself. */
export type WriteSaveError = 'invalid-existing-slot' | 'db-error'
export type WriteSaveResult =
  | { ok: true }
  | { ok: false, error: WriteSaveError }

let pendingNewSaveName: string | null = null

type SaveDiagnosticKind = 'missing' | 'invalid' | 'migration-failed' | 'unsupported-version' | 'read-error' | 'write-error'

/** Dev-console-only breadcrumb for a persistence anomaly. Never pass the
 *  `SaveData`/envelope value itself — `context` should be an operation +
 *  slot id, `detail` an error object at most (plan persistence-002). */
function logSaveDiagnostic(kind: SaveDiagnosticKind, context: string, detail?: unknown): void {
  if (!import.meta.env.DEV) return
  console.warn(`[persistence] ${kind}: ${context}`, detail ?? '')
}

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

/** One pass over every stored row, split into normally-loadable slots and
 *  whether any row present in the store could not be read as-is
 *  (persistence-003) — an older version with no migration path, a newer
 *  unsupported version, or genuinely malformed data. Never mutates or
 *  removes anything; a problem row stays in IndexedDB untouched. */
async function scanRows(db: IDBDatabase): Promise<{ ok: { id: string, name: string, data: SaveData }[], hasProblems: boolean }> {
  const rows = await storeGetAll(db)
  const ok: { id: string, name: string, data: SaveData }[] = []
  let hasProblems = false
  for (const row of rows) {
    if (typeof row.key !== 'string') continue
    const result = inspectStoredSave(row.key, row.value)
    if (result.status === 'ok') {
      ok.push({ id: result.id, name: result.name, data: result.data })
    } else if (row.key !== LEGACY_SAVE_KEY) {
      // Present but unreadable — kept out of the list (it can't be sorted/
      // shown as a normal slot) but never dropped from the store itself.
      hasProblems = true
      logSaveDiagnostic(result.status, `listSaves:${row.key}`)
    }
  }
  return { ok, hasProblems }
}

async function readAllSlots(db: IDBDatabase): Promise<{ id: string, name: string, data: SaveData }[]> {
  return (await scanRows(db)).ok
}

/** Promote a leftover key `'current'` (raw `SaveData` or envelope) to a named
 *  slot. A schema-migration failure or an unsupported future version must
 *  not delete this row (persistence-003 §6/§8) — only data that is
 *  genuinely malformed (not a save this or any known-older schema produced)
 *  is discarded here. */
async function migrateLegacyIfNeeded(): Promise<void> {
  const db = await openDb()
  try {
    const raw = await storeGet(db, LEGACY_SAVE_KEY)
    if (raw == null) return
    const result = inspectStoredSave(LEGACY_SAVE_KEY, raw)
    if (result.status !== 'ok') {
      if (result.status === 'invalid') {
        await storeDelete(db, LEGACY_SAVE_KEY)
      } else {
        logSaveDiagnostic(result.status, `migrateLegacyIfNeeded:${LEGACY_SAVE_KEY}`)
      }
      return
    }
    const id = generateSaveId()
    await storePut(db, wrapSave(result.name, result.data), id)
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
  } catch (err) {
    // A genuine IndexedDB failure here must not be mistaken by a caller for
    // "confirmed zero saves" — it's surfaced as a diagnostic, and callers
    // deciding whether to start a new game must not also clear/repurpose
    // `activeSaveId`, since `writeSave()` re-validates the target record on
    // every write regardless of how the caller got here (plan persistence-002).
    logSaveDiagnostic('read-error', 'listSaves', err)
    return []
  }
}

/** Whether the store holds any row that exists but cannot currently be read
 *  as a normal slot (persistence-003 §9) — an older version with no
 *  migration path, a newer unsupported version, or malformed data. Boot uses
 *  this to tell "genuinely zero saves" apart from "saves exist but none are
 *  loadable right now", so the latter is never silently treated as though no
 *  save exists (see `main.ts`). */
export async function hasUnreadableSaves(): Promise<boolean> {
  try {
    await migrateLegacyIfNeeded()
    const db = await openDb()
    try {
      return (await scanRows(db)).hasProblems
    } finally {
      db.close()
    }
  } catch (err) {
    logSaveDiagnostic('read-error', 'hasUnreadableSaves', err)
    return false
  }
}

export async function readSave(id?: string): Promise<SaveData | null> {
  try {
    await migrateLegacyIfNeeded()
    const slots = await listSaves()
    const targetId = id ?? pickActiveSaveId(getActiveSaveId(), slots)
    if (!targetId) {
      logSaveDiagnostic('missing', 'readSave:no-active-slot')
      return null
    }
    const db = await openDb()
    try {
      const raw = await storeGet(db, targetId)
      if (raw === undefined) {
        logSaveDiagnostic('missing', `readSave:${targetId}`)
        return null
      }
      const result = inspectStoredSave(targetId, raw)
      if (result.status !== 'ok') {
        logSaveDiagnostic(result.status, `readSave:${targetId}`)
        return null
      }
      if (!id) setActiveSaveId(targetId)
      return result.data
    } finally {
      db.close()
    }
  } catch (err) {
    logSaveDiagnostic('read-error', `readSave:${id ?? 'active'}`, err)
    return null
  }
}

/**
 * @domain persistence
 * @role Writes `data` into the active (or given) named slot.
 * @integration Never overwrites a slot whose existing record is present but
 *  fails to parse, has no known migration path, or is a newer unsupported
 *  version — see `docs/plans/persistence-002-save-integrity-guard.md` and
 *  `docs/plans/persistence-003-save-schema-versioning-and-migrations.md`.
 *  A slot with no existing record still gets created normally.
 */
export async function writeSave(data: SaveData, id?: string): Promise<WriteSaveResult> {
  try {
    await migrateLegacyIfNeeded()
    const targetId = id ?? getActiveSaveId()
    if (!targetId) {
      const slots = await listSaves()
      const existingNames = slots.map((slot) => slot.name)
      const pending = getPendingNewSaveName()
      const name = pending ?? nextDefaultSaveName(existingNames)
      const created = await createSave(name, data)
      return created.ok ? { ok: true } : { ok: false, error: 'db-error' }
    }
    const db = await openDb()
    try {
      const raw = await storeGet(db, targetId)
      if (raw !== undefined) {
        const result = inspectStoredSave(targetId, raw)
        if (result.status !== 'ok') {
          // The slot exists but the current code can't read it as-is (e.g.
          // it predates a schema change, has no migration path, or is from a
          // newer app version). Overwriting it here would silently destroy
          // the only copy of that record — refuse instead and let the caller
          // decide (autosave just fails safely for this slot).
          logSaveDiagnostic(result.status, `writeSave:${targetId}`)
          return { ok: false, error: 'invalid-existing-slot' }
        }
        await storePut(db, wrapSave(result.name, data), targetId)
        setActiveSaveId(targetId)
        return { ok: true }
      }
      // No existing row under this id — retain the existing new-slot
      // behavior (e.g. `activeSaveId` pointing at an id never actually
      // written yet).
      const name = getPendingNewSaveName() ?? nextDefaultSaveName([])
      await storePut(db, wrapSave(name, data), targetId)
      setActiveSaveId(targetId)
      return { ok: true }
    } finally {
      db.close()
    }
  } catch (err) {
    // Quota / unsupported / interrupted by unload / other IndexedDB failure.
    logSaveDiagnostic('write-error', `writeSave:${id ?? 'active'}`, err)
    return { ok: false, error: 'db-error' }
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
