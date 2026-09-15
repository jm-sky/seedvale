import type { NpcAuthoritativeState } from '../settlement/npcState'
import { resolveNpcOffscreenTravelInterval } from './npcOffscreenSurvival'
import {
  blockNpcTravel,
  interpolateNpcTravelPosition,
  type NpcTravelResolveResult,
  resolveOffscreenNpcTravel,
} from './npcTravel'

/**
 * Bounded streaming/time-skip/restore checkpoint for generic NPC travel
 * (plan settlements-npcs-028). Survival first (exactly once per elapsed
 * interval), then spatial arrival. Not a per-frame loop.
 *
 * @domain npc
 */

function survivalFromDays(state: NpcAuthoritativeState, nowDays: number): number {
  const travel = state.travel
  if (!travel) return nowDays
  if (travel.survivalResolvedAtDays != null) return travel.survivalResolvedAtDays
  if (travel.execution) return travel.execution.departedAtDays
  return nowDays
}

function survivalToDays(state: NpcAuthoritativeState, nowDays: number): number {
  const travel = state.travel
  if (!travel?.execution) return nowDays
  return Math.min(nowDays, travel.execution.arrivesAtDays)
}

/**
 * @domain npc
 */
export function resolveNpcTravelCheckpoint(
  state: NpcAuthoritativeState,
  nowDays: number,
  dayLengthSec: number,
): NpcTravelResolveResult {
  const travel = state.travel
  if (!travel) return { kind: 'none' }
  if (travel.arrival === 'reached') return { kind: 'arrived' }

  const fromDays = survivalFromDays(state, nowDays)
  const toDays = survivalToDays(state, nowDays)
  if (travel.execution != null && dayLengthSec > 0) {
    const survival = resolveNpcOffscreenTravelInterval(state, fromDays, toDays, dayLengthSec)
    if (state.travel) state.travel.survivalResolvedAtDays = survival.settledAtDays
    if (survival.kind === 'cannot-progress') {
      const current = state.travel
      if (current && current.arrival !== 'reached') {
        const at = current.execution
          ? interpolateNpcTravelPosition(current, survival.settledAtDays)
          : current.lastPosition
        state.travel = blockNpcTravel(current, at)
        if (state.travel) state.travel.survivalResolvedAtDays = survival.settledAtDays
      }
      return { kind: 'cannot-progress' }
    }
  }

  return resolveOffscreenNpcTravel(state, nowDays)
}
