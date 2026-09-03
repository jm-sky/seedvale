export const MAX_NAVIGATION_TARGETS = 3

export type NavigationTargetEntry = {
  id: string
  /** Stable 1-3 slot index — assigned on `set()` (lowest free slot) and kept
   *  for the target's whole lifetime, so its map/minimap colour never shifts
   *  while other targets come and go (plan §13 "Każdy cel ma osobny
   *  kolor/slot"). */
  slot: number
}

export type SetTargetResult = 'ok' | 'already_set' | 'full'

/**
 * Player's active travel targets (plan world-012 §13) — at most
 * `MAX_NAVIGATION_TARGETS` `WorldLocation` ids. Deliberately separate from
 * `WorldLocation` (identity) and `LocationKnowledge` (discovery) — this is
 * gameplay/UI state, not world data (notes §16/"Kluczowa decyzja
 * architektoniczna").
 */
export type NavigationTargets = {
  list(): readonly NavigationTargetEntry[]
  has(id: string): boolean
  set(id: string): SetTargetResult
  remove(id: string): boolean
  clear(): void
  serialize(): string[]
  /** `isValid` re-checks each id still resolves to a real, discovered
   *  location (notes §16 "Walidacja celu musi sprawdzać, że ID nadal
   *  wskazuje istniejącą i odkrytą lokację") — an id that no longer
   *  validates is silently dropped rather than restored. */
  restore(ids: readonly string[], isValid: (id: string) => boolean): void
}

export function createNavigationTargets(): NavigationTargets {
  const targets: NavigationTargetEntry[] = []

  function freeSlot(): number {
    const used = new Set(targets.map((t) => t.slot))
    for (let slot = 1; slot <= MAX_NAVIGATION_TARGETS; slot++) {
      if (!used.has(slot)) return slot
    }
    return -1
  }

  return {
    list() {
      return targets
    },
    has(id) {
      return targets.some((t) => t.id === id)
    },
    set(id) {
      if (targets.some((t) => t.id === id)) return 'already_set'
      const slot = freeSlot()
      if (slot < 0) return 'full'
      targets.push({ id, slot })
      return 'ok'
    },
    remove(id) {
      const index = targets.findIndex((t) => t.id === id)
      if (index < 0) return false
      targets.splice(index, 1)
      return true
    },
    clear() {
      targets.length = 0
    },
    serialize() {
      return targets.map((t) => t.id)
    },
    restore(ids, isValid) {
      targets.length = 0
      let slot = 1
      for (const id of ids) {
        if (slot > MAX_NAVIGATION_TARGETS) break
        if (!isValid(id)) continue
        targets.push({ id, slot })
        slot++
      }
    },
  }
}

let activeNavigationTargets: NavigationTargets | null = null

/** Same imperative-handle pattern as `world/map/mapData.ts`'s
 *  `getActiveMapData` — minimap draw needs targets without Vue reactivity,
 *  and without re-scanning `WorldLocation[]` every frame (notes §18). */
export function setActiveNavigationTargets(targets: NavigationTargets | null): void {
  activeNavigationTargets = targets
}

export function getActiveNavigationTargets(): NavigationTargets | null {
  return activeNavigationTargets
}
