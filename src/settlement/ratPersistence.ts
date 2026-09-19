import type { AnimalSaveState } from '../fauna/AnimalAgent'
import type { AnimalAgent } from '../fauna/AnimalAgent'

/**
 * @domain fauna
 * @system settlement-rat-persistence
 * @role Per-`SettlementsManager` persistence for wild settlement rats (plan
 *  quests-progression-006) — mirrors `livestock.ts`'s registry lifecycle
 *  without livestock ownership semantics.
 */

export type RatSaveRecord = AnimalSaveState & {
  settlementId: string
  animalId: string
}

export type RatPersistence = {
  getSaved: (settlementId: string) => ReadonlyMap<string, RatSaveRecord> | undefined
  getRemoved: (settlementId: string) => ReadonlySet<string> | undefined
  markRemoved: (settlementId: string, animalId: string) => void
  /** Last reconciliation bucket processed for this settlement (plan fauna-040). */
  getLastReconcileBucket: (settlementId: string) => number | undefined
  /** Records that side effects for `bucket` ran exactly once (plan fauna-040). */
  markReconcileBucketProcessed: (settlementId: string, bucket: number) => void
}

export type RatRegistry = RatPersistence & {
  capture: (settlementId: string, animals: readonly AnimalAgent[]) => void
  serialize: () => {
    entries: RatSaveRecord[]
    removedIds: string[]
    reconcileBuckets: Record<string, number>
  }
  clear: () => void
}

function ratToSaveRecord(settlementId: string, animal: AnimalAgent): RatSaveRecord {
  return {
    settlementId,
    animalId: animal.animalId,
    ...animal.snapshot(),
  }
}

function removedKey(settlementId: string, animalId: string): string {
  return `${settlementId}:${animalId}`
}

export function createRatRegistry(initial?: {
  entries: readonly RatSaveRecord[]
  removedIds: readonly string[]
  reconcileBuckets?: Record<string, number>
}): RatRegistry {
  const bySettlement = new Map<string, Map<string, RatSaveRecord>>()
  const removedBySettlement = new Map<string, Set<string>>()
  const reconcileBucketBySettlement = new Map<string, number>(
    Object.entries(initial?.reconcileBuckets ?? {}),
  )

  function savedFor(settlementId: string): Map<string, RatSaveRecord> {
    let m = bySettlement.get(settlementId)
    if (!m) {
      m = new Map()
      bySettlement.set(settlementId, m)
    }
    return m
  }

  for (const entry of initial?.entries ?? []) savedFor(entry.settlementId).set(entry.animalId, entry)
  for (const composite of initial?.removedIds ?? []) {
    const sep = composite.indexOf(':')
    if (sep < 0) continue
    const settlementId = composite.slice(0, sep)
    const animalId = composite.slice(sep + 1)
    let s = removedBySettlement.get(settlementId)
    if (!s) {
      s = new Set()
      removedBySettlement.set(settlementId, s)
    }
    s.add(animalId)
  }

  return {
    capture(settlementId, animals) {
      const m = savedFor(settlementId)
      for (const animal of animals) m.set(animal.animalId, ratToSaveRecord(settlementId, animal))
    },
    markRemoved(settlementId, animalId) {
      bySettlement.get(settlementId)?.delete(animalId)
      let s = removedBySettlement.get(settlementId)
      if (!s) {
        s = new Set()
        removedBySettlement.set(settlementId, s)
      }
      s.add(animalId)
    },
    getSaved: (settlementId) => bySettlement.get(settlementId),
    getRemoved: (settlementId) => removedBySettlement.get(settlementId),
    getLastReconcileBucket: (settlementId) => reconcileBucketBySettlement.get(settlementId),
    markReconcileBucketProcessed(settlementId, bucket) {
      reconcileBucketBySettlement.set(settlementId, bucket)
    },
    serialize() {
      const entries: RatSaveRecord[] = []
      for (const m of bySettlement.values()) entries.push(...m.values())
      const removedIds: string[] = []
      for (const [settlementId, ids] of removedBySettlement) {
        for (const animalId of ids) removedIds.push(removedKey(settlementId, animalId))
      }
      const reconcileBuckets: Record<string, number> = {}
      for (const [settlementId, bucket] of reconcileBucketBySettlement) {
        reconcileBuckets[settlementId] = bucket
      }
      return { entries, removedIds, reconcileBuckets }
    },
    clear() {
      bySettlement.clear()
      removedBySettlement.clear()
      reconcileBucketBySettlement.clear()
    },
  }
}
