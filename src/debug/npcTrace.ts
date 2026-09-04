import type { ScoredNeedCandidate } from '../ai/decisionModifiers'
import type { NeedId, NpcPressure } from '../ai/Needs'
import type { ActionId, Phase } from '../ai/NpcAgent'
import type { NpcGoalId, NpcPlanState } from '../ai/npcPlan'
import type { NpcStrategyCandidate, NpcStrategyId } from '../ai/npcStrategies'
import { createBoundedHistoryBuffer } from './domainHistory'

/**
 * Bounded per-NPC trace ring buffer (plan 170 — NPC simulation inspector and
 * trace). Structured data only, recorded at authoritative transition points
 * in `NpcAgent` — never formatted strings, never one entry per `update()`
 * tick. Format only at the UI/console boundary.
 */
export type NpcTraceEvent =
  /** `pressures` (plan ai-001) — the full candidate list arbitration ran
   *  over for this decision, not just the winner; plain-data copy.
   *  `candidates` (plan ai-002) — the same list with personality/role
   *  modifiers applied; optional so pre-ai-002 event literals stay valid. */
  | {
      simTime: number
      type: 'need.selected'
      need: NeedId
      pressures: readonly NpcPressure[]
      candidates?: readonly ScoredNeedCandidate[]
    }
  /** Strategy candidates + selection (plan ai-003) — recorded right after
   *  `need.selected`, before `beginNeed()`'s existing execution branch runs,
   *  so the trace shows the causal chain `need.selected` → `strategy.selected`
   *  → `action.planned`. `selected` is `null` only when every candidate for
   *  this need is unavailable (falls through to `beginUnscheduledIdle`). */
  | {
      simTime: number
      type: 'strategy.selected'
      need: NeedId
      candidates: readonly NpcStrategyCandidate[]
      selected: NpcStrategyId | null
    }
  | { simTime: number; type: 'action.planned'; action: ActionId; queueId: string | null }
  | { simTime: number; type: 'action.completed'; action: ActionId }
  /** `reason: 'invalid'` — `goTo` lost its `pendingAction` (defensive safety
   *  net, should not happen in practice). `'interrupt'` — a genuinely urgent
   *  vigor/need interrupt cancelled an in-flight action (`tickCriticalInterrupt`)
   *  or a debug re-evaluate request. `'abandon'` — the movement watchdog gave
   *  up after repath+escape both failed. */
  | { simTime: number; type: 'action.failed'; action: ActionId | null; reason: 'abandon' | 'interrupt' | 'invalid' }
  | { simTime: number; type: 'phase.changed'; from: Phase; to: Phase }
  | { simTime: number; type: 'queue.joined'; queueId: string }
  | { simTime: number; type: 'queue.left'; queueId: string }
  | { simTime: number; type: 'queue.served'; queueId: string }
  | { simTime: number; type: 'movement.rescue'; stage: 'abandon' | 'escape' | 'repath' }
  /** Combat lifecycle (plan 177) — `beginCombat()`/`endCombat()`/a landed
   *  hit/death, never per-frame combat-phase ticking. */
  | { simTime: number; type: 'combat.started'; targetId: string }
  | { simTime: number; type: 'combat.ended'; outcome: 'cancelled' | 'complete' | 'failed' }
  | { simTime: number; type: 'combat.hit'; targetId: string }
  | { simTime: number; type: 'combat.died' }
  | { simTime: number; type: 'debug.freeze' }
  | { simTime: number; type: 'debug.unfreeze' }
  | { simTime: number; type: 'debug.reevaluate' }
  /** Animal-threat perception/response diagnostics (animal-threat diagnostics
   *  task). `sensed` fires only on the `null → threat` transition in
   *  `NpcAgent.update()` — never per-tick while a threat stays present; a
   *  threat that disappears and later reappears logs a fresh `sensed`.
   *  `response` fires once per `reactToAnimalThreat()` call with the actual
   *  chosen response, not candidate scores. */
  | { simTime: number; type: 'animalThreat.sensed'; animalId: string; distance: number }
  | { simTime: number; type: 'animalThreat.response'; response: 'defend' | 'flee'; canFight: boolean; healthRatio: number }
  /** Persistent Plan lifecycle (plan ai-004) — recorded at establishment,
   *  every lifecycle-state transition, real progress, and completion. Never
   *  per-tick; a Plan can sit `active` across many ticks with no trace
   *  entries at all. */
  | { simTime: number; type: 'plan.created'; goal: NpcGoalId }
  | { simTime: number; type: 'plan.stateChanged'; goal: NpcGoalId; from: NpcPlanState; to: NpcPlanState }
  | { simTime: number; type: 'plan.progressed'; goal: NpcGoalId; amount: number; total: number }
  | { simTime: number; type: 'plan.completed'; goal: NpcGoalId }
  /** Work Contract commitment diagnostics (plan npc-015 §14) — a deliberate
   *  commitment/opportunity, never a Plan/Goal (no `work` `NpcGoalId`), so it
   *  gets its own small event family instead of reusing `plan.*`.
   *  `evaluated` fires once per settlement-board evaluation pass (every
   *  candidate + its score, not one event per candidate) whenever this NPC
   *  has no active commitment and its board has something posted —
   *  deterministic and plain-data, per plan §3/§14. */
  | { simTime: number; type: 'contract.evaluated'; candidates: readonly { contractId: string; score: number }[] }
  | { simTime: number; type: 'contract.accepted'; contractId: string; score: number }
  | { simTime: number; type: 'contract.invalidated'; contractId: string; reason: 'missingTarget' }
  | { simTime: number; type: 'contract.workCompleted'; contractId: string }

export type NpcTraceEventType = NpcTraceEvent['type']

/** Record one semantic event — O(1), no allocation beyond the event object
 *  the caller already built. `history()` returns a chronological
 *  (oldest → newest) snapshot capped at capacity, a fresh array every call —
 *  the internal ring cannot be mutated through it. Backed by the shared
 *  bounded ring buffer (plan settlements-npcs-013, `domainHistory.ts`) also
 *  used by the household/settlement history buffers. */
export type NpcTraceBuffer = {
  record(event: NpcTraceEvent): void
  history(): readonly NpcTraceEvent[]
}

/** Roughly a "handful of decision cycles" of history per NPC (plan 170
 *  scope: ~100-200 semantic events), never every simulation tick. */
export const NPC_TRACE_CAPACITY = 150

export function createNpcTraceBuffer(capacity = NPC_TRACE_CAPACITY): NpcTraceBuffer {
  return createBoundedHistoryBuffer<NpcTraceEvent>(capacity)
}
