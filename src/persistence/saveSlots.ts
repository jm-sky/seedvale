import { loadStoredSave, type SaveData } from './saveData'

export const MAX_SAVES = 8
export const SAVE_NAME_MAX_LENGTH = 40
export const LEGACY_SAVE_KEY = 'current'
export const ACTIVE_SAVE_ID_KEY = 'seedvale:activeSaveId:v1'
export const LEGACY_DEFAULT_SAVE_NAME = 'Zapis'
export const DEFAULT_SAVE_NAME_PREFIX = 'Gra'

export type SaveSlotEnvelope = {
  name: string
  data: SaveData
}

export type SaveSlotInfo = {
  id: string
  name: string
  savedAt: number
  seed: number
  playerName: string
  elapsedDays: number
}

export type CreateSaveError = 'empty' | 'too-long' | 'duplicate' | 'limit' | 'invalid'

export type NameValidation =
  | { ok: true, name: string }
  | { ok: false, error: CreateSaveError }

export function generateSaveId(now = Date.now(), rand = Math.random()): string {
  return `slot_${now.toString(36)}_${Math.floor(rand * 0xffffffff).toString(36)}`
}

export function isSaveSlotEnvelope(value: unknown): value is { name: string, data: unknown } {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.name === 'string' && 'data' in record && record.version === undefined
}

export function wrapSave(name: string, data: SaveData): SaveSlotEnvelope {
  return { name, data }
}

export function legacyNameFromSave(data: SaveData): string {
  const name = data.config.player.name.trim()
  return name || LEGACY_DEFAULT_SAVE_NAME
}

/** Status-aware counterpart of `parseStoredSave()` (persistence-003) — same
 *  raw-value → slot boundary, but keeps a failure's status/detected version
 *  instead of collapsing every non-`'ok'` case into `null`. Preserves the
 *  existing envelope model unchanged: only `data` ever carries a schema
 *  version, `name` stays outside it. `name` on an unhealthy result is
 *  recovered only when the envelope itself still parses (plan
 *  persistence-004 §5) — the payload is never trusted to produce it. */
export type InspectedSaveSlot =
  | { status: 'ok', id: string, name: string, data: SaveData }
  | { status: 'invalid', id: string, name?: string }
  | { status: 'migration-failed', id: string, version: number, name?: string }
  | { status: 'unsupported-version', id: string, version: number, name?: string }

export function inspectStoredSave(key: string, value: unknown): InspectedSaveSlot {
  const envelope = isSaveSlotEnvelope(value)
  const result = loadStoredSave(envelope ? value.data : value)
  if (result.status === 'ok') {
    const name = envelope ? (value.name.trim() || legacyNameFromSave(result.data)) : legacyNameFromSave(result.data)
    return { status: 'ok', id: key, name, data: result.data }
  }
  const recoveredName = envelope ? value.name.trim() || undefined : undefined
  if (result.status === 'invalid') return { status: 'invalid', id: key, name: recoveredName }
  return { status: result.status, id: key, version: result.version, name: recoveredName }
}

/** Every status a stored row's own `id` can be shown/managed under, whether
 *  or not the payload could be read as a normal save (plan persistence-004
 *  §5) — the counterpart to `SaveSlotInfo` for a row that isn't loadable. */
export type UnhealthySaveStatus = 'invalid' | 'migration-failed' | 'unsupported-version'

export type SaveManagementEntry =
  | (SaveSlotInfo & { status: 'ok' })
  | { status: UnhealthySaveStatus, id: string, name?: string, version?: number }

export function toSaveManagementEntry(slot: InspectedSaveSlot): SaveManagementEntry {
  if (slot.status === 'ok') return { status: 'ok', ...toSaveSlotInfo(slot) }
  return { status: slot.status, id: slot.id, name: slot.name, version: 'version' in slot ? slot.version : undefined }
}

/** Healthy entries first (existing recency order), unhealthy ones after —
 *  there's no meaningful "recency" for a row whose `savedAt` can't be read. */
export function sortSaveManagementEntries(entries: readonly SaveManagementEntry[]): SaveManagementEntry[] {
  const healthy = entries.filter((e): e is SaveSlotInfo & { status: 'ok' } => e.status === 'ok')
  const unhealthy = entries.filter((e) => e.status !== 'ok')
  return [...sortSavesByRecency(healthy).map((s): SaveManagementEntry => ({ status: 'ok', ...s })), ...unhealthy]
}

export function unhealthySaveStatusLabel(status: UnhealthySaveStatus): string {
  if (status === 'invalid') return 'Uszkodzony'
  if (status === 'migration-failed') return 'Nieudana migracja'
  return 'Nieobsługiwana wersja'
}

export function parseStoredSave(key: string, value: unknown): { id: string, name: string, data: SaveData } | null {
  const result = inspectStoredSave(key, value)
  return result.status === 'ok' ? { id: result.id, name: result.name, data: result.data } : null
}

export function toSaveSlotInfo(slot: { id: string, name: string, data: SaveData }): SaveSlotInfo {
  return {
    id: slot.id,
    name: slot.name,
    savedAt: slot.data.savedAt,
    seed: slot.data.config.seed,
    playerName: slot.data.config.player.name,
    elapsedDays: slot.data.elapsedDays,
  }
}

export function sortSavesByRecency(slots: readonly SaveSlotInfo[]): SaveSlotInfo[] {
  return [...slots].sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name, 'pl'))
}

export function pickActiveSaveId(storedId: string | null, slots: readonly SaveSlotInfo[]): string | null {
  if (slots.length === 0) return null
  if (storedId && slots.some((slot) => slot.id === storedId)) return storedId
  return sortSavesByRecency(slots)[0]?.id ?? null
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('pl') === b.trim().toLocaleLowerCase('pl')
}

export function validateSaveName(
  raw: string,
  existingNames: readonly string[],
  options?: { ignoreName?: string },
): NameValidation {
  const name = raw.trim()
  if (!name) return { ok: false, error: 'empty' }
  if (name.length > SAVE_NAME_MAX_LENGTH) return { ok: false, error: 'too-long' }
  const ignore = options?.ignoreName?.trim()
  const taken = existingNames.some((existing) => {
    if (ignore && namesMatch(existing, ignore)) return false
    return namesMatch(existing, name)
  })
  if (taken) return { ok: false, error: 'duplicate' }
  return { ok: true, name }
}

export function nextDefaultSaveName(existingNames: readonly string[]): string {
  for (let n = 1; n <= MAX_SAVES + 8; n++) {
    const candidate = `${DEFAULT_SAVE_NAME_PREFIX} ${n}`
    if (validateSaveName(candidate, existingNames).ok) return candidate
  }
  return `${DEFAULT_SAVE_NAME_PREFIX} ${Date.now().toString(36)}`
}

export function assertCanCreateSave(
  name: string,
  existingNames: readonly string[],
  count: number,
): NameValidation {
  if (count >= MAX_SAVES) return { ok: false, error: 'limit' }
  return validateSaveName(name, existingNames)
}

export function formatSaveDay(elapsedDays: number): string {
  return `Dzień ${Math.max(1, Math.floor(elapsedDays) + 1)}`
}

export function saveErrorMessage(error: CreateSaveError): string {
  if (error === 'empty') return 'Podaj nazwę zapisu.'
  if (error === 'too-long') return 'Nazwa może mieć najwyżej 40 znaków.'
  if (error === 'duplicate') return 'Zapis o tej nazwie już istnieje.'
  if (error === 'invalid') return 'Nie można zapisać — dane gry są uszkodzone.'
  return 'Można mieć najwyżej 8 zapisów.'
}
