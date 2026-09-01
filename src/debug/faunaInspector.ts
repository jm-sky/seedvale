import type { WorldBundle } from '../app/worldBundle'
import type { AnimalAgent } from '../fauna/AnimalAgent'

/**
 * Frenzied-wolf runtime diagnostics registry (fauna debug tooling — see
 * `AnimalAgent.showDebug()`/`getDebugInfo()`). Mirrors `npcInspector.ts`'s
 * "never cache a live reference across calls" contract: only a bare
 * `animalId` is remembered as the selection cursor, re-resolved against
 * `bundle.fauna.getAgents()` on every call — `Fauna` stays the sole owner of
 * `AnimalAgent` instances, this module never keeps its own list. A wolf
 * dying, despawning or a world rebuild naturally invalidates the selection
 * instead of leaving a stale `AnimalAgent` reference behind.
 */

let selectedAnimalId: string | null = null

export type FrenzyWolfCandidate = { animalId: string, frenzied: boolean, dead: boolean }

/** Pure selection-cycling rule behind `getNextFrenzyWolf()` — unit-testable
 *  without a real `WorldBundle`/`AnimalAgent`. Filters to live frenzied
 *  wolves (`wolves`' own order), then advances cyclically from `currentId`
 *  — picking the first eligible wolf when `currentId` is `null` or no longer
 *  eligible — wrapping back to the start past the end. `null` when no
 *  eligible wolf exists. */
export function pickNextFrenzyWolfId(
  wolves: readonly FrenzyWolfCandidate[],
  currentId: string | null,
): string | null {
  const eligible = wolves.filter((w) => w.frenzied && !w.dead)
  if (eligible.length === 0) return null
  const currentIndex = currentId ? eligible.findIndex((w) => w.animalId === currentId) : -1
  return eligible[(currentIndex + 1) % eligible.length]!.animalId
}

function findAgentById(bundle: WorldBundle, id: string): AnimalAgent | undefined {
  return bundle.fauna.getAgents().find((a) => a.animalId === id)
}

/** Live, frenzied, non-dead wolves — `Fauna.getAgents()`'s own stable
 *  iteration order, never scanned independently of `Fauna`'s ownership. */
export function getFrenzyWolves(bundle: WorldBundle): AnimalAgent[] {
  return bundle.fauna.getAgents().filter((a) => a.def.kind === 'wolf' && a.isFrenzied() && !a.isDead())
}

/** Currently selected wolf, or `null` if nothing is selected or the
 *  selection is no longer a live frenzied wolf (dead, cured, or despawned
 *  since it was picked). */
export function getCurrentFrenzyWolf(bundle: WorldBundle): AnimalAgent | null {
  if (!selectedAnimalId) return null
  const found = getFrenzyWolves(bundle).find((w) => w.animalId === selectedAnimalId)
  if (!found) selectedAnimalId = null
  return found ?? null
}

/** Cycles the selection to the next live frenzied wolf (`getFrenzyWolves()`'s
 *  order), clearing the previous selection's highlight and setting the new
 *  one's — reuses `AnimalAgent.setHighlighted()`, no parallel highlight
 *  state. Wraps back to the first wolf past the end; returns (and selects)
 *  `null` when no frenzied wolf is currently loaded. */
export function getNextFrenzyWolf(bundle: WorldBundle): AnimalAgent | null {
  const wolves = getFrenzyWolves(bundle)
  const previous = selectedAnimalId ? findAgentById(bundle, selectedAnimalId) : undefined
  const nextId = pickNextFrenzyWolfId(
    wolves.map((w) => ({ animalId: w.animalId, frenzied: w.isFrenzied(), dead: w.isDead() })),
    selectedAnimalId,
  )
  if (!nextId) {
    previous?.setHighlighted(false)
    selectedAnimalId = null
    return null
  }
  const next = wolves.find((w) => w.animalId === nextId) ?? null
  if (previous && previous !== next) previous.setHighlighted(false)
  next?.setHighlighted(true)
  selectedAnimalId = nextId
  return next
}
