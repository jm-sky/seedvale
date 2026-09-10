import type { AnimalAgent, AnimalKind, AnimalSaveState } from './AnimalAgent'

/**
 * @domain fauna
 * @system persistent-habitat-occupants
 * @role Sparse fauna-owned identity/persistence for wild animals bound to a
 *  stable habitat slot (plan fauna-018) — serializable types, stable keys,
 *  and registry operations. Not a simulation manager: real `AnimalAgent`
 *  instances still come from `createFauna()`.
 */

export type PersistentOccupantDecl = {
  habitatId: string
  occupantKey: string
  kind: AnimalKind
}

export type PersistentOccupantSaveRecord = {
  habitatId: string
  occupantKey: string
  animalId: string
  kind: AnimalKind
  state: AnimalSaveState
}

export type PersistentOccupantSnapshot = {
  entries: PersistentOccupantSaveRecord[]
  removedSlots: string[]
}

export const EMPTY_PERSISTENT_OCCUPANT_SNAPSHOT: PersistentOccupantSnapshot = {
  entries: [],
  removedSlots: [],
}

/** Logical slot identity — tombstones are keyed here, not by runtime `animalId`. */
export function persistentOccupantSlotKey(habitatId: string, occupantKey: string): string {
  return `${habitatId}:${occupantKey}`
}

/**
 * Stable individual id namespaced away from ordinary `${kind}-${n}` ids.
 * Derived only from habitat identity + occupant key, never from spawn order.
 */
export function persistentAnimalId(habitatId: string, occupantKey: string): string {
  return `persistent:${habitatId}:${occupantKey}`
}

/** Ordinary respawn/fill cap after reserved persistent slots (live, corpse, or tombstone). */
export function ordinaryHabitatCapacity(maxPreyCount: number, persistentSlotCount: number): number {
  return Math.max(0, maxPreyCount - persistentSlotCount)
}

export type PersistentOccupantRestoreAction =
  | { type: 'skip' }
  | { type: 'fresh' }
  | { type: 'hydrate', record: PersistentOccupantSaveRecord }
  | { type: 'mismatch' }

/**
 * Reconstruction decision for one declared slot. Tombstone wins; a saved
 * record whose `kind` disagrees with the live declaration is not applied.
 */
export function persistentOccupantRestoreAction(
  decl: PersistentOccupantDecl,
  snapshot: PersistentOccupantSnapshot | undefined,
): PersistentOccupantRestoreAction {
  const slot = persistentOccupantSlotKey(decl.habitatId, decl.occupantKey)
  if (snapshot?.removedSlots.includes(slot)) return { type: 'skip' }
  const record = snapshot?.entries.find(
    (entry) => persistentOccupantSlotKey(entry.habitatId, entry.occupantKey) === slot,
  )
  if (!record) return { type: 'fresh' }
  if (record.kind !== decl.kind) return { type: 'mismatch' }
  return { type: 'hydrate', record }
}

export type PersistentOccupantRegistry = {
  registerDeclarations: (decls: readonly PersistentOccupantDecl[]) => void
  slotCountFor: (habitatId: string) => number
  slotCountsByHabitatId: () => ReadonlyMap<string, number>
  slotKeyForAnimalId: (animalId: string) => string | undefined
  hasPersistentAnimalId: (animalId: string) => boolean
  markRemoved: (slotKey: string) => void
  capture: (animals: readonly AnimalAgent[]) => void
  serialize: () => PersistentOccupantSnapshot
  restoreAction: (decl: PersistentOccupantDecl) => PersistentOccupantRestoreAction
}

export function createPersistentOccupantRegistry(
  initial?: PersistentOccupantSnapshot,
): PersistentOccupantRegistry {
  const entries = new Map<string, PersistentOccupantSaveRecord>()
  const removed = new Set<string>(initial?.removedSlots ?? [])
  for (const entry of initial?.entries ?? []) {
    const slot = persistentOccupantSlotKey(entry.habitatId, entry.occupantKey)
    if (removed.has(slot)) continue
    entries.set(slot, entry)
  }

  const decls: PersistentOccupantDecl[] = []
  const slotByAnimalId = new Map<string, string>()

  return {
    registerDeclarations(next) {
      decls.length = 0
      slotByAnimalId.clear()
      for (const decl of next) {
        decls.push(decl)
        slotByAnimalId.set(
          persistentAnimalId(decl.habitatId, decl.occupantKey),
          persistentOccupantSlotKey(decl.habitatId, decl.occupantKey),
        )
      }
    },
    slotCountFor(habitatId) {
      let n = 0
      for (const decl of decls) if (decl.habitatId === habitatId) n++
      return n
    },
    slotCountsByHabitatId() {
      const counts = new Map<string, number>()
      for (const decl of decls) {
        counts.set(decl.habitatId, (counts.get(decl.habitatId) ?? 0) + 1)
      }
      return counts
    },
    slotKeyForAnimalId: (animalId) => slotByAnimalId.get(animalId),
    hasPersistentAnimalId: (animalId) => slotByAnimalId.has(animalId),
    markRemoved(slotKey) {
      entries.delete(slotKey)
      removed.add(slotKey)
    },
    capture(animals) {
      for (const animal of animals) {
        const slot = slotByAnimalId.get(animal.animalId)
        if (!slot || removed.has(slot)) continue
        const decl = decls.find(
          (d) => persistentOccupantSlotKey(d.habitatId, d.occupantKey) === slot,
        )
        if (!decl) continue
        entries.set(slot, {
          habitatId: decl.habitatId,
          occupantKey: decl.occupantKey,
          animalId: animal.animalId,
          kind: decl.kind,
          state: animal.snapshot(),
        })
      }
    },
    serialize() {
      return {
        entries: [...entries.values()],
        removedSlots: [...removed],
      }
    },
    restoreAction(decl) {
      return persistentOccupantRestoreAction(decl, {
        entries: [...entries.values()],
        removedSlots: [...removed],
      })
    },
  }
}
