import type { NeedId } from './Needs'
import type { NpcStrategyId } from './npcStrategies'

/**
 * Persistent NPC intent (plan ai-004) — the result an NPC currently wants to
 * achieve, sitting between the already-selected `NeedId` (ai-001/002) and the
 * concrete `NpcStrategyId` (ai-003) `beginNeed()` executes. Deliberately a
 * small domain-local identifier, not a `GoalSystem` — one entry per `NeedId`
 * that currently drives a persistent `NpcPlan` (see `goalForNeed`/
 * `needForGoal` below). Pure, Three.js-free, so plan lifecycle transitions
 * are unit-testable without a real `NpcAgent`.
 */
export type NpcGoalId = 'fulfilWorkDuty' | 'obtainWood' | 'secureFood' | 'secureWater'

export type NpcPlanState =
  | 'active'
  | 'blocked'
  | 'completed'
  | 'interrupted'
  | 'obsolete'
  | 'partially_completed'

/**
 * Minimal persistent plan (plan ai-004 §3) — "what I want to achieve and
 * where I am", never a queued list of future `PlannedAction`s or an action
 * history. `progress.amount` is a small bounded counter (e.g. wood collected
 * this pursuit), not an unlimited log. `currentStep` is a short semantic
 * label (the `NpcStrategyId` currently being pursued, or `'findNextTarget'`
 * before one is chosen) — descriptive only, never itself resolved into an
 * action; `beginNeed()`'s existing branches remain the only place that
 * resolves a concrete next `PlannedAction`.
 */
export type NpcPlan = {
  goal: NpcGoalId
  strategy: NpcStrategyId | null
  state: NpcPlanState
  progress: { amount: number }
  currentStep: string
}

/** The `NeedId`s that currently drive a persistent `NpcPlan` — `'idle'` has
 *  no Goal, matching `beginNeed()`'s own `'idle'` routes to `beginIdle`. */
export function goalForNeed(need: NeedId): NpcGoalId | null {
  switch (need) {
    case 'food': return 'secureFood'
    case 'water': return 'secureWater'
    case 'waterDuty': return 'fulfilWorkDuty'
    case 'wood': return 'obtainWood'
    default: return null
  }
}

/** Inverse of `goalForNeed` — used to re-check the originating need's own
 *  pressure/value once a Goal has an active Plan (goal satisfaction is
 *  reported in terms of the underlying need, never a second criterion). */
export function needForGoal(goal: NpcGoalId): NeedId {
  switch (goal) {
    case 'fulfilWorkDuty': return 'waterDuty'
    case 'obtainWood': return 'wood'
    case 'secureFood': return 'food'
    case 'secureWater': return 'water'
  }
}

const TERMINAL_STATES: ReadonlySet<NpcPlanState> = new Set(['completed', 'obsolete'])

export function isPlanTerminal(plan: NpcPlan): boolean {
  return TERMINAL_STATES.has(plan.state)
}

/** A non-`null` plan for `goal` that hasn't reached a terminal state — i.e.
 *  one `ensurePlanForNeed` may resume instead of replacing. */
export function planIsResumable(plan: NpcPlan | null, goal: NpcGoalId): plan is NpcPlan {
  return plan != null && plan.goal === goal && !isPlanTerminal(plan)
}

export function createNpcPlan(goal: NpcGoalId, currentStep = 'findNextTarget'): NpcPlan {
  return { goal, strategy: null, state: 'active', progress: { amount: 0 }, currentStep }
}

export function setPlanStrategy(plan: NpcPlan, strategy: NpcStrategyId | null): NpcPlan {
  if (plan.strategy === strategy) return plan
  return { ...plan, strategy, currentStep: strategy ?? plan.currentStep }
}

/** Interruption (plan ai-004 §8) — clears no state, only marks the Plan as
 *  no longer actively executing; a terminal Plan is left untouched. */
export function interruptPlan(plan: NpcPlan): NpcPlan {
  if (isPlanTerminal(plan)) return plan
  return { ...plan, state: 'interrupted' }
}

/** Resume after interruption/blocking — re-enters `active` (or
 *  `partially_completed` when real progress already happened) without
 *  resetting progress/strategy/currentStep. A terminal Plan is left
 *  untouched. */
export function resumePlan(plan: NpcPlan): NpcPlan {
  if (isPlanTerminal(plan)) return plan
  return { ...plan, state: plan.progress.amount > 0 ? 'partially_completed' : 'active' }
}

/** Goal still makes sense, but the current Strategy can't currently produce
 *  a step (plan ai-004 §9) — not a generic prerequisite solver, just a state
 *  label driven by `selectStrategy()` finding no available candidate. */
export function blockPlan(plan: NpcPlan): NpcPlan {
  if (isPlanTerminal(plan)) return plan
  return { ...plan, state: 'blocked' }
}

/** Goal no longer needs to be pursued — e.g. a higher-priority Goal took
 *  over, or the underlying shortage resolved through another actor. */
export function obsoletePlan(plan: NpcPlan): NpcPlan {
  return { ...plan, state: 'obsolete' }
}

/** Goal satisfied, regardless of how many `PlannedAction`s it took or which
 *  strategy/actor actually satisfied it. */
export function completePlan(plan: NpcPlan): NpcPlan {
  return { ...plan, state: 'completed' }
}

/** Real world-effect progress (plan ai-004 §6) — never incremented merely
 *  because a `PlannedAction` was created or completed, only from actual
 *  world results (see `NpcAgent`'s call sites). A no-op for a terminal Plan;
 *  `amount <= 0` is a no-op too (nothing to record). */
export function progressPlan(plan: NpcPlan, amount: number): NpcPlan {
  if (amount <= 0 || isPlanTerminal(plan)) return plan
  return { ...plan, progress: { amount: plan.progress.amount + amount }, state: 'partially_completed' }
}
