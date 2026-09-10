import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { AnimalSociability } from './animalDefs'
import { shoreProbeHits } from '../terrain/waterBodyKind'

/**
 * @domain fauna
 * @role Water-trip state machine plus the shared bounded radial-probe
 *  search primitive (plan fauna-017 step 7, review E5/P11) — `findWaterTarget`/
 *  `findForageTarget` (`animalForaging.ts`) and the trip destination search
 *  below are three copies of the same "random angle+distance, accept gate,
 *  score metric, keep best" loop; this module is only that shared loop, not
 *  a new common notion of "best location" — each caller keeps its own
 *  accept predicate and scoring metric to the byte. Ordinary wander/follow
 *  steering (`wander()`, `continueTrip()`, `pickWanderTarget()`,
 *  `pickFollowTarget()`) stays on `AnimalAgent` — it reads mother/herd/home
 *  state that belongs to the agent.
 */

/** Bounded radial-probe attempt budget for a water-trip destination search
 *  (plan fauna-016 §5/§10) — only spent once, when a trip actually starts,
 *  same idiom as `animalForaging.ts`'s `WATER_SEARCH_ATTEMPTS` for the
 *  needs-driven search. */
const WATER_TRIP_SEARCH_ATTEMPTS = 16

/** A committed "trip" beyond normal local wander (plan fauna-016 §4) —
 *  `destination` is chosen once (`AnimalAgent.maybeStartWaterTrip`) and
 *  retained for the whole trip; `wander()`'s own per-tick retargeting never
 *  touches it. `'water'` is the only trip kind so far, but the shape
 *  (destination + phase + committed state) is meant to generalize to a
 *  later trip kind without a second movement system. */
export type AnimalTripKind = 'water' | 'settlement'
export type AnimalTripPhase = 'traveling' | 'staying' | 'returning'
export type AnimalTrip = {
  kind: AnimalTripKind
  destination: THREE.Vector3
  phase: AnimalTripPhase
  /** Countdown (sec) while `phase === 'staying'`; unused otherwise. */
  stayRemainingSec: number
}

/** FNV-1a string hash — same local-per-module idiom as e.g.
 *  `world/fishing.ts`'s `hashString` (deliberately duplicated rather than
 *  shared, matching that convention). Used only to phase-offset a trip's day
 *  bucket per animal below. */
function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic day-bucket index for `animalId`'s next trip opportunity
 *  (plan fauna-016 §5/§10) — advances once per `cooldownDays`, phase-offset
 *  per animal (a stable hash of its own id) so a whole population doesn't
 *  become "due" on the same day. Pure/testable; `AnimalAgent` only commits to
 *  a new trip when this bucket differs from the last one it acted on
 *  (`maybeStartWaterTrip`), never by rerolling every tick. */
export function tripDayBucket(animalId: string, worldDays: number, cooldownDays: number): number {
  if (cooldownDays <= 0) return 0
  const phase = (hashString(animalId) % 1000) / 1000
  return Math.floor(worldDays / cooldownDays + phase)
}

/** The one loop `findWaterTarget`/`findForageTarget`
 *  (`animalForaging.ts`) and `findWaterTripDestination` below are three
 *  copies of — random angle+distance around `center` out to `radius`, an
 *  `accept` gate, a `score` metric, keep the best-scoring accepted
 *  candidate over `attempts` tries. `random` defaults to `Math.random` for
 *  production; tests inject a deterministic generator. Each caller supplies
 *  its own `accept`/`score` — this function invents no shared notion of
 *  "best location" beyond the search shape itself. */
export function probeBestPointNear(
  center: { readonly x: number, readonly z: number },
  radius: number,
  attempts: number,
  accept: (x: number, z: number) => boolean,
  score: (x: number, z: number) => number,
  random: () => number = Math.random,
): { x: number, z: number } | null {
  let best: { x: number, z: number } | null = null
  let bestScore = -Infinity
  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = random() * Math.PI * 2
    const dist = random() * radius
    const x = center.x + Math.cos(angle) * dist
    const z = center.z + Math.sin(angle) * dist
    if (!accept(x, z)) continue
    const candidateScore = score(x, z)
    if (candidateScore > bestScore) {
      bestScore = candidateScore
      best = { x, z }
    }
  }
  return best
}

/** Per-call environment for `findWaterTripDestination` — deliberately not
 *  the same `ForagingContext` `animalForaging.ts` uses: a trip destination
 *  search is centered on `home` (stable regardless of where the trip
 *  starts), not on the animal's current position. */
export type TripDestinationContext = {
  home: { readonly x: number, readonly z: number }
  searchRadius: number
  sociability: AnimalSociability
  sampleHeight: HeightSampler
  waterLevel: number
  isWalkable: (x: number, z: number) => boolean
  isNearVillage: (pos: { readonly x: number, readonly z: number }) => boolean
}

/** Bounded radial-probe search for a reachable water-trip destination (plan
 *  fauna-016 §5/§6) — same shoreline-probe technique as
 *  `animalForaging.ts`'s `findWaterTarget`, but centered on `home` and
 *  allowed out to `searchRadius`, deliberately past `ROAM_RADIUS`/
 *  `wanderRadius`. Only ever called once, when a trip is starting — never
 *  scans per-frame or across all loaded water features. */
const SETTLEMENT_TRIP_SEARCH_ATTEMPTS = 16

/** Settlement outskirts destination for a pressure-driven wolf den trip (plan
 *  quests-progression-007) — ring around the settlement footprint, not the
 *  village center. */
export function findSettlementOutskirtsDestination(
  settlementCenter: { readonly x: number, readonly z: number },
  outskirtsRadius: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  isWalkable: (x: number, z: number) => boolean,
  random: () => number = Math.random,
): { x: number, z: number } | null {
  return probeBestPointNear(
    settlementCenter,
    outskirtsRadius,
    SETTLEMENT_TRIP_SEARCH_ATTEMPTS,
    (x, z) => {
      if (!isWalkable(x, z)) return false
      if (sampleHeight(x, z) <= waterLevel + 0.6) return false
      const dist = Math.hypot(x - settlementCenter.x, z - settlementCenter.z)
      return dist >= outskirtsRadius * 0.55
    },
    (x, z) => {
      const dist = Math.hypot(x - settlementCenter.x, z - settlementCenter.z)
      return -Math.abs(dist - outskirtsRadius)
    },
    random,
  )
}

export function findWaterTripDestination(ctx: TripDestinationContext): { x: number, z: number } | null {
  return probeBestPointNear(
    ctx.home,
    ctx.searchRadius,
    WATER_TRIP_SEARCH_ATTEMPTS,
    (x, z) => {
      if (!ctx.isWalkable(x, z)) return false
      if (shoreProbeHits(x, z, ctx.sampleHeight, ctx.waterLevel) === 0) return false
      if (ctx.sociability === 'wild' && ctx.isNearVillage({ x, z })) return false
      return true
    },
    (x, z) => {
      const hits = shoreProbeHits(x, z, ctx.sampleHeight, ctx.waterLevel)
      const d = Math.hypot(x - ctx.home.x, z - ctx.home.z)
      return hits * 10 - d
    },
  )
}
