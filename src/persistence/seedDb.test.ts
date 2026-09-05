import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteSeedRecord,
  getSeedRecord,
  listSeedRecords,
  putSeedRecord,
  renameSeedRecord,
  touchSeedLastUsed,
  updateSeedDescription,
  updateSeedTags,
} from './seedDb'
import { minimalSeedRecord } from './seedRecord'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('seedDb — SeedRecord CRUD (plan world-015 §1/§9)', () => {
  it('round-trips a record through IndexedDB', async () => {
    const record = minimalSeedRecord(7, 'Leśne Wzgórza', 1000)
    expect(await putSeedRecord(record)).toBe(true)
    expect(await getSeedRecord(7)).toEqual(record)
  })

  it('getSeedRecord returns null for a seed with no record', async () => {
    expect(await getSeedRecord(999)).toBeNull()
  })

  it('listSeedRecords returns every stored record', async () => {
    await putSeedRecord(minimalSeedRecord(1, 'A', 1))
    await putSeedRecord(minimalSeedRecord(2, 'B', 2))
    const list = await listSeedRecords()
    expect(list.map((r) => r.seed).sort()).toEqual([1, 2])
  })

  it('touchSeedLastUsed bumps lastUsedAt without touching user metadata', async () => {
    const record = { ...minimalSeedRecord(7, 'Leśne Wzgórza', 1000), customName: 'Mój ulubiony', tags: ['dobry-start'] }
    await putSeedRecord(record)
    await touchSeedLastUsed(7, 5000)
    const after = await getSeedRecord(7)
    expect(after?.lastUsedAt).toBe(5000)
    expect(after?.customName).toBe('Mój ulubiony')
    expect(after?.tags).toEqual(['dobry-start'])
    expect(after?.generatedName).toBe('Leśne Wzgórza')
  })

  it('touchSeedLastUsed on a seed with no record is a no-op (never fabricates one)', async () => {
    await touchSeedLastUsed(42, 5000)
    expect(await getSeedRecord(42)).toBeNull()
  })

  it('rename/description/tags edits leave the generated name untouched (plan §6)', async () => {
    await putSeedRecord(minimalSeedRecord(7, 'Leśne Wzgórza', 1000))
    await renameSeedRecord(7, '  Świetny seed z rzeką  ')
    await updateSeedDescription(7, 'Dobry start przy lesie')
    await updateSeedTags(7, ['rzeka', ' las ', 'rzeka'])
    const record = await getSeedRecord(7)
    expect(record?.customName).toBe('Świetny seed z rzeką')
    expect(record?.description).toBe('Dobry start przy lesie')
    expect(record?.tags).toEqual(['rzeka', 'las'])
    expect(record?.generatedName).toBe('Leśne Wzgórza')
  })

  it('renaming to an empty string clears customName back to the generated name (plan §6 display fallback)', async () => {
    await putSeedRecord({ ...minimalSeedRecord(7, 'Leśne Wzgórza', 1000), customName: 'Coś' })
    await renameSeedRecord(7, '   ')
    expect((await getSeedRecord(7))?.customName).toBeUndefined()
  })

  it('deleteSeedRecord removes the record', async () => {
    await putSeedRecord(minimalSeedRecord(7, 'Leśne Wzgórza', 1000))
    await deleteSeedRecord(7)
    expect(await getSeedRecord(7)).toBeNull()
  })
})
