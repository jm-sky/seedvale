import type { MapConfidence, MapSource } from '../map/mapTypes'

export type LocationKnowledgeEntry = {
  id: string
  state: MapConfidence
  source: MapSource
}

/** Rank used to decide whether a new `reveal()` actually upgrades an entry —
 *  `estimated → discovered → confirmed` only ever moves forward (plan §16). */
const STATE_RANK: Record<MapConfidence, number> = { estimated: 0, discovered: 1, confirmed: 2 }

/**
 * Player knowledge of concrete `WorldLocation`s (plan world-012 §3) —
 * intentionally separate from `world/map/mapDiscovery.ts`'s `MapDiscovery`
 * (terrain-cell Fog of War). Sparse: only locations the player has learned
 * about at all are present.
 */
export type LocationKnowledge = {
  get(id: string): LocationKnowledgeEntry | undefined
  has(id: string): boolean
  /** Idempotent: revealing an already-`confirmed` location with `estimated`
   *  never downgrades it, and revealing the same state/source twice never
   *  produces a duplicate "newly discovered" result (notes §11). Returns
   *  `true` only when this call actually changed something (new entry or a
   *  forward state upgrade) — the caller (guard dialogue, merchant map)
   *  uses that to decide what to show as "newly discovered". */
  reveal(id: string, state: MapConfidence, source: MapSource): boolean
  list(): readonly LocationKnowledgeEntry[]
  serialize(): LocationKnowledgeEntry[]
  restore(entries: readonly LocationKnowledgeEntry[]): void
  clear(): void
}

export function createLocationKnowledge(initial?: readonly LocationKnowledgeEntry[]): LocationKnowledge {
  const entries = new Map<string, LocationKnowledgeEntry>()
  for (const entry of initial ?? []) entries.set(entry.id, entry)

  return {
    get(id) {
      return entries.get(id)
    },
    has(id) {
      return entries.has(id)
    },
    reveal(id, state, source) {
      const existing = entries.get(id)
      if (!existing) {
        entries.set(id, { id, state, source })
        return true
      }
      if (STATE_RANK[state] > STATE_RANK[existing.state]) {
        entries.set(id, { id, state, source })
        return true
      }
      return false
    },
    list() {
      return [...entries.values()]
    },
    serialize() {
      return [...entries.values()]
    },
    restore(next) {
      entries.clear()
      for (const entry of next) entries.set(entry.id, entry)
    },
    clear() {
      entries.clear()
    },
  }
}

let activeLocationKnowledge: LocationKnowledge | null = null

/** Imperative handle so canvas drawers (`drawMap.ts`/`drawMinimap.ts`, same
 *  pattern as `world/map/mapData.ts`'s `getActiveMapData`) can query without
 *  Vue reactivity. */
export function setActiveLocationKnowledge(knowledge: LocationKnowledge | null): void {
  activeLocationKnowledge = knowledge
}

export function getActiveLocationKnowledge(): LocationKnowledge | null {
  return activeLocationKnowledge
}
