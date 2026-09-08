import type { SocialConsequence } from './ReputationManager'
import { createSeededRandom } from '../world/parseSeed'

/**
 * Deterministic social-exposure risk for a known local act (plan
 * quests-progression-011). Abstracts whether the act became locally known —
 * no NPC witnesses, line of sight, or gossip.
 *
 * @domain quests-progression
 * @system reputation
 * @role Pure social-exposure risk + event-roll resolver.
 */

/** Daytime exposure chance with Sneak inactive. */
export const SOCIAL_EXPOSURE_BASE_RISK = 0.5
/** Subtracted from the base risk when the canonical clock phase is night. */
export const SOCIAL_EXPOSURE_NIGHT_REDUCTION = 0.3
/** Floor after time and Sneak — even perfect Sneak is not guaranteed. */
export const SOCIAL_EXPOSURE_MIN_RISK = 0.02

const SOCIAL_EXPOSURE_SALT = 'social-exposure'

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export type SocialExposureContext = {
  night: boolean
  sneakActive: boolean
  sneakValue: number
  eventRoll: number
}

export type SocialExposureResult = {
  exposed: boolean
  finalRisk: number
  eventRoll: number
}

/** Reputation/renown deltas applied when a cemetery grave disturbance is
 *  socially exposed. Callers still supply `settlementId`. */
export const GRAVE_DISTURBANCE_EXPOSURE = {
  reputation: { integrity: -8, trust: -4 },
  renown: 2,
} as const satisfies Omit<SocialConsequence, 'settlementId'>

/** Final exposure probability in `0..1` after night, Sneak, and the 2% floor. */
export function socialExposureRisk(input: {
  night: boolean
  sneakActive: boolean
  sneakValue: number
}): number {
  const riskAfterTime = input.night
    ? SOCIAL_EXPOSURE_BASE_RISK - SOCIAL_EXPOSURE_NIGHT_REDUCTION
    : SOCIAL_EXPOSURE_BASE_RISK
  const sneakMultiplier = input.sneakActive ? 1 - clamp01(input.sneakValue) : 1
  return clamp01(Math.max(SOCIAL_EXPOSURE_MIN_RISK, riskAfterTime * sneakMultiplier))
}

/** Stable `[0,1)` roll for one Hidden Find / grave-spot identity. Night and
 *  Sneak must not be mixed into this seed — they only change the threshold. */
export function socialExposureEventRoll(spotId: string): number {
  return createSeededRandom(hashString(`${spotId}:${SOCIAL_EXPOSURE_SALT}`))()
}

export function resolveSocialExposure(ctx: SocialExposureContext): SocialExposureResult {
  const finalRisk = socialExposureRisk(ctx)
  const eventRoll = clamp01(ctx.eventRoll)
  return {
    exposed: eventRoll < finalRisk,
    finalRisk,
    eventRoll,
  }
}
