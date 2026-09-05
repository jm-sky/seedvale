import type { AnimalRole } from './AnimalAgent'

/**
 * Pure prey/domestic-herbivore threat-alert relevance (plan fauna-012 §6/§8/
 * §9/§11) — mirrors `dogGuard.ts` in shape and testability: a small
 * deterministic read over caller-bounded live candidates, no
 * `AnimalAgent`/Three.js import here, unit-testable directly.
 *
 * Only ever consulted once `updatePrey()`'s existing spatial `nearest(others,
 * 'predator', fleeRange)` check has already found nothing this tick
 * (implementation notes' "keep two concepts separate" — an immediate live
 * threat within `fleeRange` always wins; this is the transient/stimulus tier
 * below it, not a replacement for it).
 */

/** One live candidate as seen by a fleeing prey/domestic animal — a wolf,
 *  another livestock individual, or a guard dog. `recentVocalizeAlert` and
 *  `huntingLiveTarget` mirror `AnimalAgent`'s own read-only accessors of the
 *  same name; the caller never re-derives either from proximity alone (plan
 *  fauna-012 §8's "nie rekonstruować ataku wyłącznie z odległości"). */
export type PreyAlertCandidate = {
  x: number
  z: number
  dead: boolean
  role: AnimalRole
  /** This candidate's current recent-vocalization stimulus, if any — `null`
   *  once it has decayed (`AnimalAgent.recentVocalizeAlert`). */
  recentVocalizeAlert: { context: 'ambient' | 'alert' } | null
  /** True while this candidate (a predator) is currently committed to a live
   *  NPC or animal attack target — read-only combat/live-threat state, never
   *  itself a stimulus with an age (plan fauna-012 §8). */
  huntingLiveTarget: boolean
}

/**
 * A candidate is a relevant alert source when either:
 * - it's a `predator` with a recent vocalization (a howl — ambient by
 *   construction today, but relevance never depends on that: a predator's
 *   own vocalization context doesn't matter, only its role), or
 * - it vocalized with `alert` context regardless of role (a household dog's
 *   contextual bark — plan fauna-012 §7/§12's alarm propagation: an alert
 *   bark is information for nearby fauna even though the dog itself isn't a
 *   predator), or
 * - it's a predator currently committed to a live NPC/animal attack target
 *   (plan fauna-012 §6/§8).
 *
 * A `prey`/`livestock` individual's own ambient vocalization (bleat/moo/
 * cluck/crow) never qualifies — those share the exact same `ambient`
 * context as a howl, so the role check is what keeps a nearby sheep from
 * treating another sheep's own bleat as a threat.
 *
 * Returns the first in-range relevant source's position (never the nearest —
 * same "first match wins" convention as `dogGuard.ts`'s
 * `resolveDogBarkStimulus` tiers), or `null` with nothing relevant in range.
 */
export function resolvePreyAlertThreat(
  selfX: number,
  selfZ: number,
  candidates: readonly PreyAlertCandidate[],
  alertRadius: number,
): { x: number, z: number } | null {
  if (alertRadius <= 0) return null
  for (const c of candidates) {
    if (c.dead) continue
    const vocalRelevant = c.recentVocalizeAlert !== null
      && (c.role === 'predator' || c.recentVocalizeAlert.context === 'alert')
    if (!vocalRelevant && !c.huntingLiveTarget) continue
    if (Math.hypot(c.x - selfX, c.z - selfZ) <= alertRadius) return { x: c.x, z: c.z }
  }
  return null
}
