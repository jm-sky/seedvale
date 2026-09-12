import type { Role } from './characters'
import type { ScheduleActivity } from './schedule'
import {
  contractRewardRate,
  type EscortWorkContractRecord,
  expectedCandidateWork,
  type MeasurableWorkContractRecord,
  type WorkContractRecord,
  type WorkContractRelationLevel,
} from '../world/workContract'
import {
  contractProvisionFeasibilityPenalty,
  contractTravelHours,
  escortAwayHours,
  estimateContractProvisionNeed,
  estimateEscortProvisionNeed,
} from './npcPersonalProvisions'
import { idleIntentFor } from './schedule'

/**
 * Pure evaluation of an advertised Work Contract as a candidate opportunity
 * for one NPC (plan npc-015 §3/§4) — kept free of `NpcAgent`/THREE so the
 * scoring formula stays deterministic and unit-testable without a real
 * agent, matching `npcStrategies.ts`/`npcPlan.ts`'s split. `NpcAgent` is the
 * only caller; it supplies every input (position, role, schedule, day
 * length) and only ever *reads* the result — mutation stays entirely in
 * `WorkContracts`/`world/workContract.ts`.
 *
 * Conceptually (plan §3): `reward + suitability - travelCost - workDuration
 * - scheduleConflict`, compared against zero — never a fixed reward
 * threshold. A positive score is worth accepting; the caller still compares
 * every currently discoverable candidate and keeps the best.
 *
 * @domain npc
 */

/** Coin-equivalent weight of one hour of travel — deliberately larger than
 *  `CONTRACT_WORK_HOUR_COST` (plan §4: travel is pure overhead, the work
 *  itself is what the reward is actually paying for). */
const CONTRACT_TRAVEL_HOUR_COST = 5
/** Coin-equivalent weight of one hour of the construction work itself. */
const CONTRACT_WORK_HOUR_COST = 3
/** Flat penalty applied when accepting would compete with this NPC's own
 *  scheduled workplace duty right now (plan §3 "relevant household/role
 *  responsibilities") — enough to outweigh a modest reward on its own, not
 *  enough to make a very attractive contract impossible to ever accept
 *  during work hours. */
const CONTRACT_SCHEDULE_CONFLICT_PENALTY = 15

/** Manual-labour roles read as a natural fit for hired construction work;
 *  roles with a stronger standing duty (guard) or a role built around trade
 *  rather than labour (trader) are less suited. Every other role is
 *  neutral. Deliberately small values — suitability nudges the decision, it
 *  never dominates reward/travel/duration on its own. */
const CONTRACT_SUITABILITY_BY_ROLE: Partial<Record<Role, number>> = {
  woodcutter: 5,
  farmer: 5,
  miner: 5,
  fisher: 2,
  hunter: 2,
  trader: -5,
  guard: -10,
}

/** Escort-specific suitability (plan npc-030 §18) — a modifier, never a hard
 *  `escortEligible` flag. Guard/hunter read as a natural capability fit;
 *  roles with a strong fixed local duty carry a small opportunity-cost
 *  penalty instead. Deliberately the mirror image of
 *  `CONTRACT_SUITABILITY_BY_ROLE` (a guard is a poor construction hire but a
 *  good escort, and vice versa). */
const ESCORT_SUITABILITY_BY_ROLE: Partial<Record<Role, number>> = {
  guard: 10,
  hunter: 6,
  trader: -4,
  woodcutter: -2,
  farmer: -2,
  miner: -2,
  fisher: -2,
}

/** Coin-equivalent weight of one hour away from ordinary life (plan npc-030
 *  §21) — duration itself is the primary commitment cost for escort, so
 *  this plays the combined role `CONTRACT_TRAVEL_HOUR_COST`/
 *  `CONTRACT_WORK_HOUR_COST` play for measurable work. */
const ESCORT_AWAY_HOUR_COST = 1.5

/** Relation bonus at claim-freeze granularity (plan npc-030 §19) — reuses
 *  the exact same `WorkContractRelationLevel` payment-patience already
 *  uses, rather than a second relation scale. */
const ESCORT_RELATION_BONUS: Record<WorkContractRelationLevel, number> = {
  stranger: 0,
  acquainted: 3,
  friendly: 6,
  trusted: 10,
}

/** Weight applied to a 0..1 local-reputation average (trust/competence/
 *  courage/integrity, whichever are available — plan §19). */
const ESCORT_REPUTATION_WEIGHT = 8
/** Weight applied to a 0..1 renown figure — used "only where semantically
 *  useful" (plan §19), so callers with no renown concept simply pass 0. */
const ESCORT_RENOWN_WEIGHT = 4
/** Small nudge for the existing `curious` trait (plan §20) — never a new
 *  companion-specific personality store. */
const ESCORT_CURIOUS_BONUS = 4
/** Weight applied to a bounded 0..1 danger estimate (plan §24). */
const ESCORT_DANGER_WEIGHT = 20

/** Deterministic, bounded escort-suitability/social/danger context (plan
 *  npc-030 §19/§20/§24) — every field the pure evaluator needs beyond the
 *  shared measurable-work inputs. `NpcAgent` supplies real values from
 *  `PlayerSocialLookup`/existing personality/traits/danger estimation; a
 *  conservative neutral default (see `DEFAULT_ESCORT_EVALUATION_CONTEXT`)
 *  covers a caller that genuinely has nothing better (plan §24: "if
 *  reliable danger context is unavailable, use a conservative neutral
 *  default rather than fabricated precision"). */
export type EscortEvaluationContext = {
  relationLevel: WorkContractRelationLevel
  /** 0..1 average of whichever local reputation dimensions are available. */
  localReputation: number
  /** 0..1, only meaningful where the caller already tracks it. */
  renown: number
  /** Existing `curious` personality trait, if already available. */
  curious: boolean
  /** Conservative bounded expedition danger estimate, 0..1. */
  danger: number
}

/** Conservative neutral fallback (plan §24) — never fabricated precision:
 *  average reputation/no renown/not curious/mid-danger. */
export const DEFAULT_ESCORT_EVALUATION_CONTEXT: EscortEvaluationContext = {
  relationLevel: 'stranger',
  localReputation: 0.5,
  renown: 0,
  curious: false,
  danger: 0.5,
}

export type WorkContractEvaluationInput = {
  npcX: number
  npcZ: number
  role: Role
  /** This NPC's currently *effective* scheduled activity (plan §3 household/
   *  role responsibilities) — same value `NpcAgent.beginIdle()` already
   *  resolved for the ordinary idle-fallback dispatch. */
  scheduledActivity: ScheduleActivity
  /** Whether this NPC has a workplace at all — a schedule `work` block only
   *  actually competes with the contract when there's a real job to do. */
  hasWorkplace: boolean
  dayLengthSec: number
  /** Real-world walk speed (m/s) — `NpcAgent`'s own `WALK_SPEED`, reused
   *  rather than duplicated so the travel-time estimate always matches how
   *  long the trip will actually take (plan §4: "reuse existing travel...
   *  estimates"). */
  walkSpeed: number
  /** Current hunger/thirst for bounded remote-work provisioning feasibility
   *  (plan npc-017) — read-only inputs; the scorer never mutates inventory. */
  hunger: number
  thirst: number
  personalFoodUnits: number
  personalDrinkPortions: number
  householdFoodUnits: number
  householdWaterUnits: number
  canFillWaterskin: boolean
  /** Escort-only inputs (plan npc-030 §19/§20/§24) — ignored for measurable
   *  work. Falls back to `DEFAULT_ESCORT_EVALUATION_CONTEXT` when a
   *  measurable-work-only caller (or a test) omits it. */
  escort?: EscortEvaluationContext
}

function scoreMeasurableWorkOpportunity(
  contract: MeasurableWorkContractRecord,
  input: WorkContractEvaluationInput,
): number {
  const travelHours = contractTravelHours(contract, input)
  const suitability = CONTRACT_SUITABILITY_BY_ROLE[input.role] ?? 0
  const scheduleConflict =
    input.hasWorkplace && idleIntentFor(input.scheduledActivity) === 'work' ? CONTRACT_SCHEDULE_CONFLICT_PENALTY : 0
  const expectedWork = expectedCandidateWork(contract)
  const expectedReward = expectedWork * contractRewardRate(contract)
  const baseScore =
    expectedReward
    + suitability
    - travelHours * CONTRACT_TRAVEL_HOUR_COST
    - expectedWork * CONTRACT_WORK_HOUR_COST
    - scheduleConflict
  const estimate = estimateContractProvisionNeed({
    travelHours,
    workHours: expectedWork,
    hunger: input.hunger,
    thirst: input.thirst,
  })
  const provisionPenalty = contractProvisionFeasibilityPenalty(estimate, {
    personalFoodUnits: input.personalFoodUnits,
    personalDrinkPortions: input.personalDrinkPortions,
    householdFoodUnits: input.householdFoodUnits,
    householdWaterUnits: input.householdWaterUnits,
    canFillWaterskin: input.canFillWaterskin,
  })
  if (!Number.isFinite(provisionPenalty)) return Number.NEGATIVE_INFINITY
  return baseScore - provisionPenalty
}

/** Escort-scope net-value score (plan npc-030 §16-§25) — same
 *  `reward + suitability - cost` shape as measurable work, but reward is
 *  the offered `rewardCoins` directly (never a manufactured
 *  `expectedCandidateWork`, plan §17), cost is driven by expected away time
 *  rather than travel + work, and relation/reputation/renown/personality/
 *  danger contribute real, bounded terms instead of being ignored. */
function scoreEscortOpportunity(
  contract: EscortWorkContractRecord,
  input: WorkContractEvaluationInput,
): number {
  const terms = contract.scope.terms
  const escort = input.escort ?? DEFAULT_ESCORT_EVALUATION_CONTEXT
  const awayHours = escortAwayHours(terms, input)
  const suitability = ESCORT_SUITABILITY_BY_ROLE[input.role] ?? 0
  const scheduleConflict =
    input.hasWorkplace && idleIntentFor(input.scheduledActivity) === 'work' ? CONTRACT_SCHEDULE_CONFLICT_PENALTY : 0
  const relationBonus = ESCORT_RELATION_BONUS[escort.relationLevel]
  const reputationBonus = escort.localReputation * ESCORT_REPUTATION_WEIGHT
  const renownBonus = escort.renown * ESCORT_RENOWN_WEIGHT
  const curiousBonus = escort.curious ? ESCORT_CURIOUS_BONUS : 0
  const dangerPenalty = escort.danger * ESCORT_DANGER_WEIGHT
  const baseScore =
    contract.rewardCoins
    + suitability
    + relationBonus
    + reputationBonus
    + renownBonus
    + curiousBonus
    - awayHours * ESCORT_AWAY_HOUR_COST
    - dangerPenalty
    - scheduleConflict
  const estimate = estimateEscortProvisionNeed({
    awayHours,
    hunger: input.hunger,
    thirst: input.thirst,
  })
  const provisionPenalty = contractProvisionFeasibilityPenalty(estimate, {
    personalFoodUnits: input.personalFoodUnits,
    personalDrinkPortions: input.personalDrinkPortions,
    householdFoodUnits: input.householdFoodUnits,
    householdWaterUnits: input.householdWaterUnits,
    canFillWaterskin: input.canFillWaterskin,
  })
  if (!Number.isFinite(provisionPenalty)) return Number.NEGATIVE_INFINITY
  return baseScore - provisionPenalty
}

/** Deterministic net-value score for `contract` given `input` — see this
 *  module's header doc for the formula. Positive means "worth it"; the
 *  caller (`NpcAgent`) still picks the best-scoring candidate among every
 *  currently discoverable contract, not just any positive one. Dispatches
 *  by `contract.scope.kind` (plan npc-030 §8) — measurable work keeps its
 *  existing formula unchanged. */
export function scoreWorkContractOpportunity(
  contract: WorkContractRecord,
  input: WorkContractEvaluationInput,
): number {
  if (contract.scope.kind === 'expedition_escort') {
    return scoreEscortOpportunity(contract as EscortWorkContractRecord, input)
  }
  return scoreMeasurableWorkOpportunity(contract as MeasurableWorkContractRecord, input)
}

export type ScoredWorkContract = { contract: WorkContractRecord, score: number }

/** Scores every entry in `candidates` and returns the best one, or `null` if
 *  none scores above zero (plan §3: never a fixed reward threshold, but a
 *  negative-value opportunity is still not worth taking). Ties break toward
 *  the earlier candidate in `candidates` — deterministic given a stable
 *  input order. */
export function selectBestWorkContract(
  candidates: readonly WorkContractRecord[],
  input: WorkContractEvaluationInput,
): { best: ScoredWorkContract | null, scored: readonly ScoredWorkContract[] } {
  const scored = candidates.map((contract) => ({ contract, score: scoreWorkContractOpportunity(contract, input) }))
  let best: ScoredWorkContract | null = null
  for (const entry of scored) {
    if (entry.score > 0 && (best === null || entry.score > best.score)) best = entry
  }
  return { best, scored }
}
