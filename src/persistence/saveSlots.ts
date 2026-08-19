import { loadSaveData, type SaveData } from './saveData'

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

export type CreateSaveError = 'empty' | 'too-long' | 'duplicate' | 'limit'

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

export function parseStoredSave(key: string, value: unknown): { id: string, name: string, data: SaveData } | null {
  if (isSaveSlotEnvelope(value)) {
    const data = loadSaveData(value.data)
    if (!data) return null
    const name = value.name.trim() || legacyNameFromSave(data)
    return { id: key, name, data }
  }
  const data = loadSaveData(value)
  if (!data) return null
  return { id: key, name: legacyNameFromSave(data), data }
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
  return 'Można mieć najwyżej 8 zapisów.'
}
