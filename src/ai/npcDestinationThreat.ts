import type { DestinationAnimalThreat } from '../fauna/destinationThreatHooks'
import type { Role } from './characters'

/**
 * @domain npc
 * @role Pure, stateless NPC-side destination-risk assessment (plan npc-057)
 *  used before selected voluntary outdoor activities — "should I voluntarily
 *  start an activity at a place where I can already observe danger?". Never
 *  the immediate defend/flee pipeline (`npcAnimalThreat.ts` stays
 *  authoritative for that); this only gates *starting* a trip, evaluated
 *  once per destination-selection decision, never per-frame.
 */

/** Small explicit per-activity risk allowance (plan npc-057 §7) so future
 *  consumers (ordinary work, hunting, ...) differ by data, not by a
 *  role-specific exception ladder. Added directly to tolerance before the
 *  accept/reject comparison. */
export type ActivityRiskProfile = {
  id: string
  /** Negative for a conservative activity (ordinary gathering), positive for
   *  one that deliberately accepts more risk. `0` is neutral. */
  toleranceAllowance: number
}

/** V1's only consumer (plan npc-057 §8) — ordinary voluntary herb gathering
 *  stays conservative rather than neutral. */
export const HERBALIST_GATHER_RISK_PROFILE: ActivityRiskProfile = {
  id: 'herbalist-gather',
  toleranceAllowance: -0.1,
}

export type NpcDestinationThreatInput = {
  destination: { x: number, z: number }
  /** One bounded fauna snapshot (`SettlementDestinationThreatHooks.queryThreats`),
   *  reused across every candidate destination in the same decision — never
   *  re-queried per candidate. */
  threats: readonly DestinationAnimalThreat[]
  /** 0–1 current HP ratio — one of the strongest tolerance modifiers. */
  healthRatio: number
  hasMeleeCapability: boolean
  hasRangedCapability: boolean
  role: Role
  /** 0–1 Big Five neuroticism (plan ai-002) — higher lowers tolerance. */
  neuroticism: number
  activityRiskProfile: ActivityRiskProfile
}

export type DestinationThreatAssessment = {
  acceptable: boolean
  riskScore: number
  toleranceScore: number
  dominantThreatId?: string
  threatCount: number
  baseTolerance: number
  healthContribution: number
  combatContribution: number
  roleContribution: number
  neuroticismContribution: number
  activityAllowance: number
}

/** Threat contributions beyond this distance (m) from the destination don't
 *  count at all — deterministic linear falloff inside it (plan npc-057 §5).
 *  Exported so a consumer's one bounded fauna scan (plan npc-057 §3) can
 *  size its radius to cover every candidate destination's full threat
 *  neighborhood in a single query, e.g. `candidateSearchRadius + this`. */
export const DESTINATION_THREAT_INFLUENCE_RADIUS = 20

const BASE_TOLERANCE = 0.3
const HEALTH_TOLERANCE_WEIGHT = 0.5
const COMBAT_CAPABILITY_TOLERANCE_WEIGHT = 0.15
const NEUROTICISM_TOLERANCE_WEIGHT = 0.3
/** Bounded role bias (plan npc-057 §6) — only ever added when this NPC has
 *  *some* usable combat capability (never `role === 'hunter'` alone), and
 *  modest next to `HEALTH_TOLERANCE_WEIGHT` so it firms up an already-viable
 *  decision instead of overriding severe injury or a lack of weapons. */
const ROLE_TOLERANCE_BIAS: Partial<Record<Role, number>> = {
  hunter: 0.15,
  guard: 0.12,
}
/** Bounded multi-threat aggregation (plan npc-057 §5) — each next-most-
 *  dangerous contribution counts at this fraction of the previous one's
 *  already-attenuated share, so "one wolf < two wolves < a pack" without an
 *  unbounded linear sum (the series is bounded by `dominant / (1 - factor)`). */
const GROUP_DIMINISHING_FACTOR = 0.5

/** Deterministic monotonic linear falloff — `0` at/beyond
 *  `DESTINATION_THREAT_INFLUENCE_RADIUS`, `1` at the destination itself. */
function distanceInfluence(distance: number): number {
  if (distance >= DESTINATION_THREAT_INFLUENCE_RADIUS) return 0
  return 1 - distance / DESTINATION_THREAT_INFLUENCE_RADIUS
}

/**
 * Authoritative destination-risk scoring (plan npc-057 §4/§5/§6/§7) — the
 * one scorer diagnostics/tests must read rather than recomputing. Pure and
 * deterministic given `input`; ties resolve to `acceptable: true` (risk ≤
 * tolerance), and equal-contribution threats break by `animalId` so ordering
 * never depends on `Fauna.getAgents()` iteration order.
 */
export function assessDestinationThreat(input: NpcDestinationThreatInput): DestinationThreatAssessment {
  const contributions = input.threats
    .map((t) => ({
      animalId: t.animalId,
      contribution: t.humanDanger * distanceInfluence(Math.hypot(t.x - input.destination.x, t.z - input.destination.z)),
    }))
    .filter((c) => c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution || a.animalId.localeCompare(b.animalId))

  let riskScore = 0
  let weight = 1
  for (const c of contributions) {
    riskScore += c.contribution * weight
    weight *= GROUP_DIMINISHING_FACTOR
  }

  const canFight = input.hasMeleeCapability || input.hasRangedCapability
  const healthContribution = input.healthRatio * HEALTH_TOLERANCE_WEIGHT
  const combatContribution = canFight ? COMBAT_CAPABILITY_TOLERANCE_WEIGHT : 0
  const roleContribution = canFight ? (ROLE_TOLERANCE_BIAS[input.role] ?? 0) : 0
  const neuroticismContribution = -(input.neuroticism - 0.5) * NEUROTICISM_TOLERANCE_WEIGHT
  const activityAllowance = input.activityRiskProfile.toleranceAllowance

  const toleranceScore = BASE_TOLERANCE
    + healthContribution
    + combatContribution
    + roleContribution
    + neuroticismContribution
    + activityAllowance

  return {
    acceptable: riskScore <= toleranceScore,
    riskScore,
    toleranceScore,
    dominantThreatId: contributions[0]?.animalId,
    threatCount: contributions.length,
    baseTolerance: BASE_TOLERANCE,
    healthContribution,
    combatContribution,
    roleContribution,
    neuroticismContribution,
    activityAllowance,
  }
}
