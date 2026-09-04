import type { ScoredAction } from '../simulation/scoreActions'
import type { NeedId } from './Needs'
import type { ScheduleActivity } from './schedule'
import type { NpcDecisionTarget } from './weatherPressure'
import { WEATHER_SEVERE_SHELTER_THRESHOLD } from './weatherPressure'

/**
 * Pure NPC top-level decision arbitration (review 2026-09-03 §5 E4) —
 * mirrors `fauna/faunaDecision.ts` in shape and testability. This only
 * encodes today's `NpcAgent.update()` `choose` case's sequencing and
 * `tickCriticalInterrupt()`'s precedence as data; it does not change which
 * outcome wins for any given input, and it deliberately keeps the two
 * precedences distinct — they are not meant to agree (see
 * `shouldInterruptAction`'s doc comment).
 *
 * The actual need/weather pressure arbitration (`pickActionKind` over
 * `NpcDecisionTarget` scores) stays in `NpcAgent` — this module starts one
 * step downstream, once that arbitration already produced a winner
 * (`wonNeed`/`criticalNeed`), and decides the outer sequencing: vigor
 * collapse, then that winner, then the schedule, then idle.
 */

/** Top-level outcome of one `choose()` decision tick. */
export type NpcDecisionKind = 'collapseSleep' | 'idle' | 'need' | 'scheduledSleep' | 'seekShelter'

export type NpcDecisionInput = {
  /** `shouldCollapseSleep(vigor)` — physiological collapse outranks
   *  everything else unconditionally. */
  collapsing: boolean
  /** The winner of the same-tick `pickActionKind<NpcDecisionTarget>` need/
   *  weather-pressure arbitration — a real `NeedId`, `'seekShelter'`, or
   *  `'idle'` when nothing crossed its threshold. */
  wonNeed: NpcDecisionTarget
  scheduleActivity: ScheduleActivity
}

/** Priority ranks — encode today's sequencing 1:1 (higher wins, ties keep
 *  the earlier entry in `DECISION_ORDER`, same rule as `pickHighestScore`).
 *  Gaps of 10 leave room to insert a new outcome without renumbering. */
export const NPC_DECISION_PRIORITY: Record<NpcDecisionKind, number> = {
  collapseSleep: 100,
  seekShelter: 90,
  need: 80,
  scheduledSleep: 70,
  idle: 60,
}

const DECISION_ORDER: readonly NpcDecisionKind[] = (
  Object.keys(NPC_DECISION_PRIORITY) as NpcDecisionKind[]
).sort((a, b) => NPC_DECISION_PRIORITY[b] - NPC_DECISION_PRIORITY[a])

/** Single source of truth for validity, shared by `decideNpcAction` and
 *  `scoreNpcDecisions` so the runtime path and the debug/test path can
 *  never drift apart. */
function isDecisionValid(kind: NpcDecisionKind, input: NpcDecisionInput): boolean {
  switch (kind) {
    case 'collapseSleep':
      return input.collapsing
    case 'idle':
      return true
    case 'need':
      return input.wonNeed !== 'idle' && input.wonNeed !== 'seekShelter'
    case 'scheduledSleep':
      return input.scheduleActivity === 'sleep'
    case 'seekShelter':
      return input.wonNeed === 'seekShelter'
  }
}

/** Runtime path: allocation-free ordered scan — called once per `choose()`
 *  tick. `idle` is always valid, so this never returns anything falsy and
 *  no fallback argument is needed. */
export function decideNpcAction(input: NpcDecisionInput): NpcDecisionKind {
  for (const kind of DECISION_ORDER) {
    if (isDecisionValid(kind, input)) return kind
  }
  // Unreachable: 'idle' is always valid.
  return 'idle'
}

/** Debug/test path only — materializes the valid candidates with their
 *  ranks so the ordering is inspectable (`?debug=1`) and assertable in
 *  tests, mirroring `scoreFaunaBehaviours`. Not called from the per-tick
 *  runtime path. */
export function scoreNpcDecisions(input: NpcDecisionInput): ScoredAction<NpcDecisionKind>[] {
  const scored: ScoredAction<NpcDecisionKind>[] = []
  for (const kind of DECISION_ORDER) {
    if (isDecisionValid(kind, input)) scored.push({ kind, score: NPC_DECISION_PRIORITY[kind] })
  }
  return scored
}

export type NpcInterruptInput = {
  /** `shouldCollapseSleep(vigor)` — outranks needs unconditionally, same as
   *  `decideNpcAction`. */
  collapsing: boolean
  activeNeed: NeedId
  /** `pickNeed(needs, { ...options, critical: true })` — the stricter
   *  interrupt-only thresholds, never the normal `choose()` pick. */
  criticalNeed: NeedId
  weatherPressure: number
}

/**
 * Throttled in-flight-action interrupt check (`NpcAgent.tickCriticalInterrupt`)
 * — deliberately a *different* precedence from `decideNpcAction`, not a
 * reuse of it: a critical need and severe weather only outrank a
 * schedule-driven action already in flight when this NPC isn't already
 * pursuing a need (`activeNeed === 'idle'`) — no thrashing between two
 * needs, and weather never pre-empts a genuinely active need either.
 * Ordinary schedule/time changes never interrupt. Copied verbatim from the
 * pre-extraction method (review §8 step 6) — this is a pure refactor, the
 * two precedences stay exactly as different as they were.
 */
export function shouldInterruptAction(input: NpcInterruptInput): boolean {
  if (input.collapsing) return true
  if (input.activeNeed !== 'idle') return false
  if (input.criticalNeed !== 'idle') return true
  return input.weatherPressure >= WEATHER_SEVERE_SHELTER_THRESHOLD
}
