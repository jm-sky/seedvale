import type { AnimalKind } from './animalDefs'
import type { AnimalOwner } from './animalOwnership'

/**
 * Durable per-animal stray/displacement episode (plan fauna-024).
 * Owned by fauna/domestication, never by QuestManager. Absent/`undefined`
 * means this individual has never started an episode; an inactive record
 * after return keeps origin so the same animal is not redisplaced.
 *
 * @domain fauna
 */
export type AnimalStrayState = {
  active: boolean
  originX: number
  originZ: number
  survivalAssist: boolean
  corpseInspected: boolean
}

/**
 * World snapshot for a lost-livestock source. QuestManager reads this
 * through an injected lookup; fauna never stores quest ids.
 *
 * @domain fauna
 */
export type LostLivestockSourceStatus =
  | 'lost-alive'
  | 'returned'
  | 'corpse-uninspected'
  | 'corpse-inspected'
  | 'unavailable'

/** Livestock yard wander max (`LIVESTOCK_WANDER_RADIUS` in livestock.ts). */
export const STRAY_RETURN_RADIUS = 6

/** Displacement must leave the ordinary livestock yard/roam band. */
export const STRAY_MIN_DISTANCE = 36
export const STRAY_MAX_DISTANCE = 90
export const STRAY_PROBE_ATTEMPTS = 16
export const STRAY_PREDATOR_PRESSURE_RADIUS = 28
export const STRAY_PREDATOR_SCORE_PENALTY = 22

/** Extra flee detection while `stray.active && stray.survivalAssist`. */
export const STRAY_FLEE_RANGE_BONUS = 4
/** Modest flee-sprint multiplier while survival assist is gated on. */
export const STRAY_FLEE_SPEED_MULT = 1.12

/**
 * Uninspected stray-corpse retention cap in simulation seconds.
 * `timeSinceDeath` already includes time-skip catch-up, so this is two
 * default world days (`dayLengthSec = 480`) rather than wall-clock hours.
 */
export const STRAY_CORPSE_RETENTION_SECONDS = 960

/**
 * Grace window (plan fauna-025) before sustained displacement past
 * `STRAY_MIN_DISTANCE` becomes a natural stray episode — long enough that a
 * single flee burst past the boundary doesn't instantly classify as lost,
 * short enough that a genuinely sustained displacement still latches within
 * one chase/scare episode.
 */
export const STRAY_CLASSIFICATION_GRACE_SECONDS = 12

export type LivestockStrayCandidate = {
  animalId: string
  kind: AnimalKind
  settlementId: string
  houseId: string
  dead: boolean
  mounted: boolean
  owner: AnimalOwner
  stray: AnimalStrayState | undefined
}

export type StrayDisplacementContext = {
  origin: { readonly x: number, readonly z: number }
  isValid: (x: number, z: number) => boolean
  predators?: readonly { readonly x: number, readonly z: number }[]
  random?: () => number
  minDistance?: number
  maxDistance?: number
  attempts?: number
}

const SHEEP_KIND_PRIORITY = 0
const OTHER_KIND_PRIORITY = 1

/**
 * @domain fauna
 * @role Creates the inactive stray sentinel used before an episode starts.
 */
export function createEmptyStrayState(): AnimalStrayState | undefined {
  return undefined
}

/**
 * @domain fauna
 * @role True while this animal currently has a live stray episode.
 */
export function isStrayEpisodeActive(stray: AnimalStrayState | undefined): boolean {
  return stray?.active === true
}

/**
 * @domain fauna
 * @role Survival-assist gate. Never true for ordinary animals.
 */
export function isStraySurvivalAssistActive(stray: AnimalStrayState | undefined): boolean {
  return stray?.active === true && stray.survivalAssist === true
}

export function straySurvivalFleeRangeBonus(stray: AnimalStrayState | undefined): number {
  return isStraySurvivalAssistActive(stray) ? STRAY_FLEE_RANGE_BONUS : 0
}

export function straySurvivalFleeSpeedMultiplier(stray: AnimalStrayState | undefined): number {
  return isStraySurvivalAssistActive(stray) ? STRAY_FLEE_SPEED_MULT : 1
}

/**
 * @domain fauna
 * @role Pure return predicate — alive strayed livestock inside the stored
 *  origin/home radius ends the episode.
 */
export function isStrayedAnimalReturned(
  stray: AnimalStrayState | undefined,
  position: { readonly x: number, readonly z: number },
  dead: boolean,
  radius: number = STRAY_RETURN_RADIUS,
): boolean {
  if (!isStrayEpisodeActive(stray) || dead || !stray) return false
  return Math.hypot(position.x - stray.originX, position.z - stray.originZ) <= radius
}

/**
 * @domain fauna
 * @role Durable corpse-retention predicate for an unresolved stray death.
 */
export function shouldRetainStrayedCorpse(
  stray: AnimalStrayState | undefined,
  dead: boolean,
  timeSinceDeath: number,
): boolean {
  if (!dead || !isStrayEpisodeActive(stray) || stray?.corpseInspected) return false
  return timeSinceDeath < STRAY_CORPSE_RETENTION_SECONDS
}

/**
 * @domain fauna
 * @role Eligibility for starting a new stray episode on an existing individual.
 */
export function isEligibleLostLivestock(
  candidate: LivestockStrayCandidate,
  sourceHouseholdId?: string,
  supportedKinds?: readonly AnimalKind[],
): boolean {
  if (candidate.dead || candidate.mounted) return false
  if (candidate.owner?.kind !== 'household') return false
  if (sourceHouseholdId && candidate.owner.houseId !== sourceHouseholdId) return false
  if (isStrayEpisodeActive(candidate.stray) || candidate.stray) return false
  if (supportedKinds && !supportedKinds.includes(candidate.kind)) return false
  return true
}

function kindPriority(kind: AnimalKind): number {
  return kind === 'sheep' ? SHEEP_KIND_PRIORITY : OTHER_KIND_PRIORITY
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * @domain fauna
 * @role Deterministic pick of an existing household livestock id. Never
 *  invents a new identity. Prefers sheep when any are eligible.
 */
export function selectLostLivestock(
  candidates: readonly LivestockStrayCandidate[],
  seedKey: string,
  sourceHouseholdId?: string,
  supportedKinds?: readonly AnimalKind[],
): LivestockStrayCandidate | null {
  const eligible = candidates.filter((candidate) =>
    isEligibleLostLivestock(candidate, sourceHouseholdId, supportedKinds),
  )
  if (eligible.length === 0) return null
  const preferred = eligible.filter((candidate) => candidate.kind === 'sheep')
  const pool = preferred.length > 0 ? preferred : eligible
  const sorted = pool.slice().sort((a, b) => {
    const kind = kindPriority(a.kind) - kindPriority(b.kind)
    if (kind !== 0) return kind
    return a.animalId.localeCompare(b.animalId)
  })
  const index = hashString(seedKey) % sorted.length
  return sorted[index] ?? null
}

export function predatorPressureAt(
  x: number,
  z: number,
  predators: readonly { readonly x: number, readonly z: number }[],
  radius: number = STRAY_PREDATOR_PRESSURE_RADIUS,
): number {
  if (radius <= 0 || predators.length === 0) return 0
  let pressure = 0
  for (const predator of predators) {
    const distance = Math.hypot(predator.x - x, predator.z - z)
    if (distance <= radius) pressure += (radius - distance) / radius
  }
  return pressure
}

/**
 * @domain fauna
 * @role Bounded one-shot destination probe. Invalid terrain is rejected;
 *  predator pressure is a score penalty, never a hard exclusion. Falls back
 *  to the best valid candidate when every probe still has nearby predators.
 */
export function selectStrayDisplacementTarget(
  context: StrayDisplacementContext,
): { x: number, z: number } | null {
  const minDistance = context.minDistance ?? STRAY_MIN_DISTANCE
  const maxDistance = context.maxDistance ?? STRAY_MAX_DISTANCE
  const attempts = context.attempts ?? STRAY_PROBE_ATTEMPTS
  const random = context.random ?? Math.random
  const predators = context.predators ?? []
  const span = Math.max(0, maxDistance - minDistance)
  let best: { x: number, z: number } | null = null
  let bestScore = -Infinity
  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = random() * Math.PI * 2
    const dist = minDistance + random() * span
    const x = context.origin.x + Math.cos(angle) * dist
    const z = context.origin.z + Math.sin(angle) * dist
    if (!context.isValid(x, z)) continue
    const score = dist - predatorPressureAt(x, z, predators) * STRAY_PREDATOR_SCORE_PENALTY
    if (score > bestScore) {
      bestScore = score
      best = { x, z }
    }
  }
  return best
}

/**
 * @domain fauna
 * @role Starts a stray episode record. Idempotent: an already-active or
 *  previously-ended episode is left untouched so restore/materialization
 *  cannot redisplace the same animal.
 */
export function beginStrayState(
  current: AnimalStrayState | undefined,
  origin: { readonly x: number, readonly z: number },
): { state: AnimalStrayState, started: boolean } {
  if (current) return { state: current, started: false }
  return {
    state: {
      active: true,
      originX: origin.x,
      originZ: origin.z,
      survivalAssist: true,
      corpseInspected: false,
    },
    started: true,
  }
}

/**
 * @domain fauna
 * @role Ends the live episode, drops survival assist/lead-relevant flags,
 *  and keeps origin so a later start is refused.
 */
export function clearStrayEpisode(current: AnimalStrayState | undefined): AnimalStrayState | undefined {
  if (!current) return undefined
  return {
    ...current,
    active: false,
    survivalAssist: false,
  }
}

/**
 * @domain fauna
 * @role Marks a dead strayed animal as inspected. Does not harvest or remove.
 */
export function inspectStrayedCorpseState(
  current: AnimalStrayState | undefined,
  dead: boolean,
): AnimalStrayState | undefined {
  if (!current?.active || !dead) return current
  return { ...current, corpseInspected: true }
}

/**
 * @domain fauna
 * @role Classifies one livestock individual for quest/world lookup.
 */
export function classifyLostLivestock(input: {
  found: boolean
  dead: boolean
  stray: AnimalStrayState | undefined
}): LostLivestockSourceStatus {
  if (!input.found) return 'unavailable'
  if (isStrayEpisodeActive(input.stray)) {
    if (!input.dead) return 'lost-alive'
    return input.stray?.corpseInspected ? 'corpse-inspected' : 'corpse-uninspected'
  }
  if (input.stray && !input.dead) return 'returned'
  if (input.dead) return 'unavailable'
  return 'unavailable'
}

export function snapshotStrayState(
  stray: AnimalStrayState | undefined,
): AnimalStrayState | undefined {
  if (!stray) return undefined
  return {
    active: stray.active,
    originX: stray.originX,
    originZ: stray.originZ,
    survivalAssist: stray.survivalAssist,
    corpseInspected: stray.corpseInspected,
  }
}

export function hydrateStrayState(saved: AnimalStrayState | undefined): AnimalStrayState | undefined {
  if (!saved) return undefined
  return {
    active: saved.active === true,
    originX: saved.originX,
    originZ: saved.originZ,
    survivalAssist: saved.survivalAssist === true,
    corpseInspected: saved.corpseInspected === true,
  }
}

export function isAnimalStraySave(value: unknown): value is AnimalStrayState {
  if (!value || typeof value !== 'object') return false
  const stray = value as Record<string, unknown>
  return (
    typeof stray.active === 'boolean'
    && typeof stray.originX === 'number'
    && typeof stray.originZ === 'number'
    && typeof stray.survivalAssist === 'boolean'
    && typeof stray.corpseInspected === 'boolean'
  )
}

/** Deterministic seed for one-shot displacement selection. */
export function strayEpisodeSeed(animalId: string): number {
  return hashString(`stray:${animalId}`)
}

/**
 * @domain fauna
 * @role Natural-stray grace accumulator (plan fauna-025) — resets the
 *  instant the animal is back inside `minDistance` of its own home/wander
 *  anchor, so a short flee that ends back near home never latches, while a
 *  sustained displacement accumulates toward `shouldBeginNaturalStray`.
 */
export function tickStrayClassificationGrace(
  graceSec: number,
  distanceFromHome: number,
  dt: number,
  minDistance: number = STRAY_MIN_DISTANCE,
): number {
  if (distanceFromHome <= minDistance) return 0
  return graceSec + dt
}

/**
 * @domain fauna
 * @role True once sustained out-of-band displacement has cleared the grace
 *  window — the caller's cue to begin a natural (non-quest) stray episode.
 */
export function shouldBeginNaturalStray(
  graceSec: number,
  graceSeconds: number = STRAY_CLASSIFICATION_GRACE_SECONDS,
): boolean {
  return graceSec >= graceSeconds
}
