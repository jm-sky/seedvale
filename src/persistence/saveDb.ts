import { openSeedvaleDb, SAVES_STORE } from './db'
import { isSaveData, type SaveData } from './saveData'
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
  type SaveManagementEntry,
  type SaveSlotInfo,
  sortSaveManagementEntries,
  sortSavesByRecency,
  toSaveManagementEntry,
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
const STORE_NAME = SAVES_STORE

export type { CreateSaveError, SaveManagementEntry, SaveSlotInfo }
export type CreateSaveResult =
  | { ok: true, id: string, name: string }
  | { ok: false, error: CreateSaveError }

/** Why a `writeSave()` call did not persist. `invalid-existing-slot` means the
 *  guard refused to overwrite a record it could not read/parse (plan
 *  persistence-002) — the original bytes are untouched. `invalid-outgoing-
 *  snapshot` means the assembled `SaveData` about to be written failed
 *  current-schema validation (plan persistence-004 §1) — again, the original
 *  bytes are untouched. `db-error` covers an IndexedDB failure during the
 *  attempt itself. */
export type WriteSaveError = 'invalid-existing-slot' | 'invalid-outgoing-snapshot' | 'db-error'
export type WriteSaveResult =
  | { ok: true }
  | { ok: false, error: WriteSaveError }

/** Caller intent behind a `writeSave()`/`saveNow()` call (plan
 *  persistence-004 §6/§12) — carried only for diagnostics; every reason
 *  still goes through the same integrity guard. */
export type SaveReason = 'manual' | 'autosave' | 'save-as' | 'new-game-transition' | 'load-transition'

let pendingNewSaveName: string | null = null

type SaveDiagnosticKind =
  | 'missing' | 'invalid' | 'migration-failed' | 'unsupported-version'
  | 'read-error' | 'write-error' | 'invalid-outgoing'

/** Dev-console-only breadcrumb for a persistence anomaly. Never pass the
 *  `SaveData`/envelope value itself — `context` should be an operation +
 *  slot id, `detail` an error object at most (plan persistence-002). */
function logSaveDiagnostic(kind: SaveDiagnosticKind, context: string, detail?: unknown): void {
  if (!import.meta.env.DEV) return
  console.warn(`[persistence] ${kind}: ${context}`, detail ?? '')
}

const openDb = openSeedvaleDb

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

/** Every normally-loadable row (persistence-003) — a row that's present but
 *  unreadable (an older version with no migration path, a newer unsupported
 *  version, or genuinely malformed data) is logged and excluded here, but
 *  never mutated or removed; see `listSaveManagementEntries()` for the
 *  counterpart that surfaces those rows instead of dropping them. */
async function readAllSlots(db: IDBDatabase): Promise<{ id: string, name: string, data: SaveData }[]> {
  const rows = await storeGetAll(db)
  const ok: { id: string, name: string, data: SaveData }[] = []
  for (const row of rows) {
    if (typeof row.key !== 'string') continue
    const result = inspectStoredSave(row.key, row.value)
    if (result.status === 'ok') {
      ok.push({ id: result.id, name: result.name, data: result.data })
    } else if (row.key !== LEGACY_SAVE_KEY) {
      logSaveDiagnostic(result.status, `listSaves:${row.key}`)
    }
  }
  return ok
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

/** Result-typed counterpart of `listSaves()` (plan persistence-004 §4) — lets
 *  a caller that must act differently on a genuine IndexedDB failure (boot
 *  deciding whether it's safe to start fresh, the pause menu's active-save
 *  label) tell that apart from "confirmed zero/normal saves" instead of both
 *  collapsing to `[]`. */
export type ListSavesResult =
  | { ok: true, slots: SaveSlotInfo[] }
  | { ok: false, error: 'db-error' }

export async function listSavesResult(): Promise<ListSavesResult> {
  try {
    await migrateLegacyIfNeeded()
    const db = await openDb()
    try {
      const slots = await readAllSlots(db)
      return { ok: true, slots: sortSavesByRecency(slots.map(toSaveSlotInfo)) }
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
    return { ok: false, error: 'db-error' }
  }
}

/** Convenience wrapper over `listSavesResult()` for callers that only ever
 *  render a slot list and never make a destructive/lifecycle decision from
 *  "the list came back empty" (plan persistence-004 §4) — those callers must
 *  use `listSavesResult()` instead so a read failure isn't silently treated
 *  as zero saves. */
export async function listSaves(): Promise<SaveSlotInfo[]> {
  const result = await listSavesResult()
  return result.ok ? result.slots : []
}

/** Every stored row, healthy or not, as a UI-manageable entry (plan
 *  persistence-004 §5) — the save-management surface for a row `listSaves()`
 *  would silently drop. Never mutates a row; deletion still goes through the
 *  existing `deleteSave(id)`. */
export type SaveManagementResult =
  | { ok: true, entries: SaveManagementEntry[] }
  | { ok: false, error: 'db-error' }

export async function listSaveManagementEntries(): Promise<SaveManagementResult> {
  try {
    await migrateLegacyIfNeeded()
    const db = await openDb()
    try {
      const rows = await storeGetAll(db)
      const entries: SaveManagementEntry[] = []
      for (const row of rows) {
        if (typeof row.key !== 'string' || row.key === LEGACY_SAVE_KEY) continue
        entries.push(toSaveManagementEntry(inspectStoredSave(row.key, row.value)))
      }
      return { ok: true, entries: sortSaveManagementEntries(entries) }
    } finally {
      db.close()
    }
  } catch (err) {
    logSaveDiagnostic('read-error', 'listSaveManagementEntries', err)
    return { ok: false, error: 'db-error' }
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
 *  A slot with no existing record still gets created normally. Also refuses
 *  an outgoing `data` that fails current-schema validation before any
 *  destructive `storePut()` (plan persistence-004 §1) — a TypeScript
 *  `SaveData` type alone doesn't rule out a runtime-invalid value (e.g. an
 *  enum-like field outside its validated set) reaching persistence.
 */
export async function writeSave(data: SaveData, id?: string, reason: SaveReason = 'autosave'): Promise<WriteSaveResult> {
  if (!isSaveData(data)) {
    // Never log the full payload — only that this write, for this slot/
    // reason, produced a snapshot the current schema rejects.
    logSaveDiagnostic('invalid-outgoing', `writeSave:${id ?? 'active'}:${reason}`)
    return { ok: false, error: 'invalid-outgoing-snapshot' }
  }
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

/**
 * @role Creates a brand-new named slot from `data`.
 * @integration Same outgoing-validation guard as `writeSave()` (plan
 *  persistence-004 §1) — an invalid `data` must not be allowed to create a
 *  slot that would immediately be excluded from `listSaves()` again.
 */
export async function createSave(name: string, data: SaveData): Promise<CreateSaveResult> {
  if (!isSaveData(data)) {
    logSaveDiagnostic('invalid-outgoing', `createSave:${name}`)
    return { ok: false, error: 'invalid' }
  }
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
