import type { NpcId } from '../settlement/npcState'
import { createSeededRandom } from '../world/parseSeed'

/** One-hour world-time evening offer window length (fraction of a day). */
export const EVENING_OFFER_WINDOW_LENGTH = 1 / 24

/** Late-afternoon / evening band where the daily window may start (plan
 *  quests-progression-021). */
const EVENING_WINDOW_START_MIN = 0.68
const EVENING_WINDOW_START_MAX = 0.82

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Deterministic per-day evening start for a guard quest offer (plan
 * quests-progression-021) — keyed by world seed, guard `NpcId` and whole day.
 *
 * @domain quests-progression
 */
export function deterministicEveningOfferWindowStart(
  worldSeed: number,
  giverNpcId: NpcId,
  elapsedDays: number,
): number {
  const day = Math.floor(elapsedDays)
  const rng = createSeededRandom(
    stableHash(`${worldSeed}\0${giverNpcId}\0${day}`) ^ 0x4556454e,
  )
  const span = EVENING_WINDOW_START_MAX - EVENING_WINDOW_START_MIN
  return EVENING_WINDOW_START_MIN + rng() * span
}

/** Whether `timeOfDay` (0..1) lies inside today's one-hour offer window. */
export function isWithinEveningOfferWindow(
  worldSeed: number,
  giverNpcId: NpcId,
  elapsedDays: number,
  timeOfDay: number,
): boolean {
  const start = deterministicEveningOfferWindowStart(worldSeed, giverNpcId, elapsedDays)
  const end = start + EVENING_OFFER_WINDOW_LENGTH
  if (end <= 1) return timeOfDay >= start && timeOfDay < end
  return timeOfDay >= start || timeOfDay < end - 1
}
