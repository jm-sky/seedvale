import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SAVE_VERSION, type SaveConfig, type SaveData } from './saveData'
import {
  createSave,
  deleteSave,
  getActiveSaveId,
  listSaveManagementEntries,
  listSaves,
  listSavesResult,
  readSave,
  renameSave,
  writeSave,
} from './saveDb'
import { MAX_SAVES } from './saveSlots'

const config = {
  seed: 7,
  terrain: { chunkSize: 64 },
  sky: { inclination: 0.5 },
  player: { name: 'Anna' },
  settlements: {},
} as SaveConfig

function makeSaveData(overrides?: Partial<Pick<SaveData, 'savedAt' | 'elapsedDays'>>): SaveData {
  return {
    version: CURRENT_SAVE_VERSION,
    config,
    player: { x: 1, z: 2, yaw: 0, pitch: 0 },
    savedAt: overrides?.savedAt ?? 100,
    quests: { progress: [], exp: 0, relations: {} },
    inventory: {},
    inventoryInstances: [],
    collectedItemIds: [],
    droppedItems: [],
    placedFires: [],
    timeOfDay: 0.32,
    elapsedDays: overrides?.elapsedDays ?? 0,
    heldTool: null,
    treeOverrides: {},
    playerTorch: null,
    placedTents: [],
    placedTraps: [],
    worldFlags: {},
    resolvedHiddenFindSpotIds: [],
    badges: { earned: [], gravesDisturbed: 0, hiddenFindsFound: 0 },
    map: { discoveredCells: [], discoveredLocations: [], targets: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100, starvationDuration: 0, dehydrationDuration: 0 },
    ownedLandPlots: [],
    skills: {
      sneak: { xp: 0 },
      survival: { xp: 0 },
      traps: { xp: 0 },
      defense: { xp: 0 },
      archery: { xp: 0 },
      riding: { xp: 0 },
    },
    spawnPoints: [],
    foodBatches: {},
    dryingRacks: [],
    hives: [],
    fishingBait: {},
    harvestedCropIds: [],
    placedContainers: [],
    carriedContainer: null,
    playerWells: [],
    terrainPreparations: [],
    terrainModifications: [],
    plantedTrees: [],
    plantedCrops: [],
    playerGardens: [],
    standingTorches: [],
    palisades: [],
    bedrolls: [],
    platforms: [],
    resourceDeposits: {},
    workContracts: [],
  }
}

/** In-memory `localStorage` stand-in — Node's test environment has none. */
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', makeMemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('writeSave — save integrity guard', () => {
  it('updates an existing valid slot normally', async () => {
    const created = await createSave('Save A', makeSaveData({ elapsedDays: 1 }))
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await writeSave(makeSaveData({ elapsedDays: 5 }), created.id)
    expect(result).toEqual({ ok: true })

    const reloaded = await readSave(created.id)
    expect(reloaded?.elapsedDays).toBe(5)

    const slots = await listSaves()
    expect(slots.find((s) => s.id === created.id)?.name).toBe('Save A')
  })

  it('creates a fresh row when the target slot id has no existing record', async () => {
    const result = await writeSave(makeSaveData(), 'slot_never_created')
    expect(result).toEqual({ ok: true })

    const reloaded = await readSave('slot_never_created')
    expect(reloaded).not.toBeNull()
  })

  it('never overwrites an existing slot whose record cannot be parsed (destructive-write regression)', async () => {
    const created = await createSave('Save A', makeSaveData({ elapsedDays: 42 }))
    expect(created.ok).toBe(true)
    if (!created.ok) return

    // Directly corrupt the stored record, simulating a save written by a
    // schema the current code can no longer read.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('seedvale', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const corrupted = { name: 'Save A', data: { version: 999, garbage: true } }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite')
      tx.objectStore('saves').put(corrupted, created.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    // Simulate the app booting with this slot active and autosave firing.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await writeSave(makeSaveData({ elapsedDays: 0 }), created.id)
    warnSpy.mockRestore()

    expect(result).toEqual({ ok: false, error: 'invalid-existing-slot' })

    // The original corrupted bytes must be untouched — not replaced by the
    // new (blank) autosave data.
    const stillCorrupted = await new Promise<unknown>((resolve, reject) => {
      const readDb = indexedDB.open('seedvale', 1)
      readDb.onsuccess = () => {
        const tx = readDb.result.transaction('saves', 'readonly')
        const req = tx.objectStore('saves').get(created.id)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }
    })
    expect(stillCorrupted).toEqual(corrupted)

    // readSave() must likewise refuse to fabricate data for it.
    expect(await readSave(created.id)).toBeNull()
  })

  it('fails safely (does not throw, does not write) on an IndexedDB error', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const req = { onerror: null as ((ev: unknown) => void) | null, error: new Error('boom') }
        queueMicrotask(() => req.onerror?.(new Event('error')))
        return req
      },
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await writeSave(makeSaveData(), 'some-slot')
    warnSpy.mockRestore()

    expect(result).toEqual({ ok: false, error: 'db-error' })
  })
})

describe('readSave / listSaves', () => {
  it('readSave() returns null when there is no active or given slot', async () => {
    expect(await readSave()).toBeNull()
  })

  it('missing slot can still be created via writeSave/createSave', async () => {
    const created = await createSave('New Game', makeSaveData())
    expect(created.ok).toBe(true)
    const slots = await listSaves()
    expect(slots).toHaveLength(1)
  })

  it('an unreadable slot is excluded from listSaves() but not deleted', async () => {
    const created = await createSave('Save A', makeSaveData())
    if (!created.ok) throw new Error('setup failed')

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('seedvale', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite')
      tx.objectStore('saves').put({ name: 'Save A', data: { version: 999 } }, created.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const slots = await listSaves()
    warnSpy.mockRestore()

    expect(slots).toHaveLength(0)

    // The row itself is still in the store (nothing deleted it).
    const raw = await new Promise<unknown>((resolve, reject) => {
      const readDb = indexedDB.open('seedvale', 1)
      readDb.onsuccess = () => {
        const tx = readDb.result.transaction('saves', 'readonly')
        const req = tx.objectStore('saves').get(created.id)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }
    })
    expect(raw).toBeTruthy()
  })
})

describe('named-slot behavior unchanged', () => {
  it('enforces the eight-slot limit', async () => {
    for (let i = 0; i < MAX_SAVES; i++) {
      const result = await createSave(`Save ${i}`, makeSaveData())
      expect(result.ok).toBe(true)
    }
    const overflow = await createSave('One too many', makeSaveData())
    expect(overflow).toEqual({ ok: false, error: 'limit' })
  })

  it('rename and delete still operate on valid slots', async () => {
    const created = await createSave('Original', makeSaveData())
    if (!created.ok) throw new Error('setup failed')

    const renamed = await renameSave(created.id, 'Renamed')
    expect(renamed.ok).toBe(true)

    await deleteSave(created.id)
    expect(await listSaves()).toHaveLength(0)
    expect(getActiveSaveId()).toBeNull()
  })
})

/** Runtime-invalid current-schema data (plan persistence-004 §1/§13) — a
 *  non-finite `fuelRemaining` is a field `isSaveData()` already rejects via
 *  `isPlayerTorchField`'s `Number.isFinite` check, so no test-only validation
 *  rule is needed. TypeScript's `SaveData` type doesn't rule this out (`number`
 *  includes `NaN`), which is exactly the gap this plan closes. */
function makeInvalidSaveData(overrides?: Partial<Pick<SaveData, 'elapsedDays'>>): SaveData {
  return { ...makeSaveData(overrides), playerTorch: { source: 'branch', fuelRemaining: Number.NaN } }
}

async function putRawRow(id: string, value: unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('seedvale', 1)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite')
    tx.objectStore('saves').put(value, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

describe('writeSave/createSave — outgoing snapshot integrity (plan persistence-004 §1/§3)', () => {
  it('refuses to overwrite a valid slot with a runtime-invalid outgoing snapshot, leaving it untouched', async () => {
    const created = await createSave('Save A', makeSaveData({ elapsedDays: 3 }))
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await writeSave(makeInvalidSaveData({ elapsedDays: 99 }), created.id)
    warnSpy.mockRestore()

    expect(result).toEqual({ ok: false, error: 'invalid-outgoing-snapshot' })

    // The previous valid slot remains loadable, unchanged.
    const reloaded = await readSave(created.id)
    expect(reloaded?.elapsedDays).toBe(3)
  })

  it('refuses to create a brand-new slot from a runtime-invalid outgoing snapshot (Save As)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await createSave('New Slot', makeInvalidSaveData())
    warnSpy.mockRestore()

    expect(result).toEqual({ ok: false, error: 'invalid' })
    // It must not have created a slot that would then vanish from listSaves().
    expect(await listSaves()).toHaveLength(0)
  })

  it('writeSave() with no target id also refuses an invalid outgoing snapshot instead of creating a new slot', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await writeSave(makeInvalidSaveData())
    warnSpy.mockRestore()

    expect(result).toEqual({ ok: false, error: 'invalid-outgoing-snapshot' })
    expect(await listSaves()).toHaveLength(0)
  })
})

describe('listSavesResult — read failure vs. confirmed-empty (plan persistence-004 §4)', () => {
  it('reports ok with an empty array for a genuinely empty database', async () => {
    expect(await listSavesResult()).toEqual({ ok: true, slots: [] })
  })

  it('distinguishes a genuine IndexedDB failure from zero saves', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const req = { onerror: null as ((ev: unknown) => void) | null, error: new Error('boom') }
        queueMicrotask(() => req.onerror?.(new Event('error')))
        return req
      },
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await listSavesResult()
    warnSpy.mockRestore()

    expect(result).toEqual({ ok: false, error: 'db-error' })
  })
})

describe('listSaveManagementEntries — unhealthy rows stay visible/manageable (plan persistence-004 §5)', () => {
  it('surfaces an unreadable row as an unhealthy entry, blocks loading it, and allows explicit deletion by id', async () => {
    const healthy = await createSave('Save A', makeSaveData({ elapsedDays: 2 }))
    const toCorrupt = await createSave('Save B', makeSaveData())
    if (!healthy.ok || !toCorrupt.ok) throw new Error('setup failed')

    // A newer, unsupported version — genuinely present, but this build can't
    // read it as-is.
    await putRawRow(toCorrupt.id, { name: 'Save B', data: { version: 999 } })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await listSaveManagementEntries()
    warnSpy.mockRestore()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toHaveLength(2)

    const ok = result.entries.find((e) => e.id === healthy.id)
    expect(ok?.status).toBe('ok')

    const unhealthy = result.entries.find((e) => e.id === toCorrupt.id)
    expect(unhealthy?.status).toBe('unsupported-version')

    // readSave() must also refuse to fabricate data for the unhealthy row.
    expect(await readSave(toCorrupt.id)).toBeNull()

    // Explicit deletion works purely by id — no successful SaveData parsing required.
    await deleteSave(toCorrupt.id)
    const after = await listSaveManagementEntries()
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.entries).toHaveLength(1)
    expect(after.entries[0]?.id).toBe(healthy.id)

    // Deleting the unreadable row left the healthy sibling intact.
    expect((await readSave(healthy.id))?.elapsedDays).toBe(2)
  })
})
