import { describe, expect, it } from 'vitest'
import type { SaveConfig, SaveData } from './saveData'
import { loadSaveData } from './saveData'
import {
  assertCanCreateSave,
  formatSaveDay,
  generateSaveId,
  isSaveSlotEnvelope,
  legacyNameFromSave,
  MAX_SAVES,
  nextDefaultSaveName,
  parseStoredSave,
  pickActiveSaveId,
  SAVE_NAME_MAX_LENGTH,
  saveErrorMessage,
  sortSavesByRecency,
  toSaveSlotInfo,
  validateSaveName,
  wrapSave,
} from './saveSlots'

const config = {
  seed: 7,
  terrain: { chunkSize: 64 },
  sky: { inclination: 0.5 },
  player: { name: 'Anna' },
} as SaveConfig

const v1 = {
  version: 1 as const,
  config,
  player: { x: 1, z: 2, yaw: 0, pitch: 0 },
  savedAt: 100,
}

function loaded(extra?: Partial<{ savedAt: number, seed: number, playerName: string, elapsedDays: number }>): SaveData {
  const data = loadSaveData({
    ...v1,
    savedAt: extra?.savedAt ?? 100,
    config: {
      ...config,
      seed: extra?.seed ?? 7,
      player: { name: extra?.playerName ?? 'Anna' },
    },
  })
  if (!data) throw new Error('expected save')
  if (extra?.elapsedDays != null) data.elapsedDays = extra.elapsedDays
  return data
}

describe('saveSlots', () => {
  it('generates slot ids that are not the legacy current key', () => {
    const id = generateSaveId(1_700_000_000_000, 0.5)
    expect(id.startsWith('slot_')).toBe(true)
    expect(id).not.toBe('current')
  })

  it('wraps SaveData in an envelope without a top-level version', () => {
    const data = loaded()
    const envelope = wrapSave('Las Anny', data)
    expect(isSaveSlotEnvelope(envelope)).toBe(true)
    expect(isSaveSlotEnvelope(data)).toBe(false)
    expect(envelope.name).toBe('Las Anny')
    expect(envelope.data).toBe(data)
  })

  it('parses a legacy raw SaveData under current using the player name', () => {
    const parsed = parseStoredSave('current', v1)
    expect(parsed).not.toBeNull()
    expect(parsed?.id).toBe('current')
    expect(parsed?.name).toBe('Anna')
    expect(parsed?.data.version).toBe(25)
    expect(parsed?.data.config.seed).toBe(7)
  })

  it('falls back to Zapis when the legacy player name is blank', () => {
    const parsed = parseStoredSave('current', {
      ...v1,
      config: { ...config, player: { name: '   ' } },
    })
    expect(parsed?.name).toBe('Zapis')
    expect(legacyNameFromSave(parsed!.data)).toBe('Zapis')
  })

  it('parses an envelope and keeps its name', () => {
    const data = loaded()
    const parsed = parseStoredSave('slot_abc', wrapSave('  Las  ', data))
    expect(parsed?.id).toBe('slot_abc')
    expect(parsed?.name).toBe('Las')
  })

  it('rejects corrupt stored values', () => {
    expect(parseStoredSave('current', { version: 1 })).toBeNull()
    expect(parseStoredSave('slot_x', { name: 'A', data: { nope: true } })).toBeNull()
  })

  it('validates names: empty, length, case-insensitive uniqueness', () => {
    expect(validateSaveName('  ', [])).toEqual({ ok: false, error: 'empty' })
    expect(validateSaveName('a'.repeat(SAVE_NAME_MAX_LENGTH + 1), [])).toEqual({ ok: false, error: 'too-long' })
    expect(validateSaveName('Las', ['las'])).toEqual({ ok: false, error: 'duplicate' })
    expect(validateSaveName('Las', ['Las'], { ignoreName: 'las' })).toEqual({ ok: true, name: 'Las' })
    expect(validateSaveName('  Dolina  ', ['Las'])).toEqual({ ok: true, name: 'Dolina' })
  })

  it('picks Gra N as the next unused default name', () => {
    expect(nextDefaultSaveName([])).toBe('Gra 1')
    expect(nextDefaultSaveName(['Gra 1', 'gra 2'])).toBe('Gra 3')
  })

  it('blocks a ninth save', () => {
    const names = Array.from({ length: MAX_SAVES }, (_, i) => `Gra ${i + 1}`)
    expect(assertCanCreateSave('Extra', names, names.length)).toEqual({ ok: false, error: 'limit' })
    expect(assertCanCreateSave('Extra', names.slice(0, 2), 2).ok).toBe(true)
  })

  it('picks the stored active id when it still exists, else the newest savedAt', () => {
    const a = toSaveSlotInfo({ id: 'a', name: 'A', data: loaded({ savedAt: 10 }) })
    const b = toSaveSlotInfo({ id: 'b', name: 'B', data: loaded({ savedAt: 50, seed: 2 }) })
    const c = toSaveSlotInfo({ id: 'c', name: 'C', data: loaded({ savedAt: 30 }) })
    expect(pickActiveSaveId('c', [a, b, c])).toBe('c')
    expect(pickActiveSaveId('missing', [a, b, c])).toBe('b')
    expect(pickActiveSaveId(null, [])).toBeNull()
    expect(sortSavesByRecency([a, b, c]).map((slot) => slot.id)).toEqual(['b', 'c', 'a'])
  })

  it('formats in-game day from elapsedDays', () => {
    expect(formatSaveDay(0)).toBe('Dzień 1')
    expect(formatSaveDay(2.9)).toBe('Dzień 3')
  })

  it('maps create errors to Polish copy', () => {
    expect(saveErrorMessage('empty')).toContain('nazwę')
    expect(saveErrorMessage('limit')).toContain('8')
  })
})
