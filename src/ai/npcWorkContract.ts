import type { Role } from './characters'
import type { ScheduleActivity } from './schedule'
import {
  contractRewardRate,
  expectedCandidateWork,
  type WorkContractRecord,
} from '../world/workContract'
import {
  contractProvisionFeasibilityPenalty,
  contractTravelHours,
  estimateContractProvisionNeed,
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
}

/** Deterministic net-value score for `contract` given `input` — see this
 *  module's header doc for the formula. Positive means "worth it"; the
 *  caller (`NpcAgent`) still picks the best-scoring candidate among every
 *  currently discoverable contract, not just any positive one. */
export function scoreWorkContractOpportunity(
  contract: WorkContractRecord,
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
    travelHours: contractTravelHours(contract, input),
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
