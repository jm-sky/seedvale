import type { NpcAuthoritativeState } from '../settlement/npcState'
import {
  beginOffscreenNpcTravel,
  type NpcTravelPoint,
} from './npcTravel'

/**
 * Idempotent dispatch of a `ready` expedition assignment onto per-member
 * generic travel continuity (plan settlements-npcs-028). Does not reselect
 * members, provision inventories, or change settlement/home membership.
 *
 * Assignment ownership stays with the 027 registry; this module only consumes
 * the ready slice plus an already-resolved world-space destination.
 *
 * @domain settlements-npcs
 */

export type ReadyExpeditionAssignmentSlice = {
  id: string
  state: string
  memberNpcIds: readonly string[]
}

export type DispatchReadyExpeditionInput = {
  assignment: ReadyExpeditionAssignmentSlice
  destination: NpcTravelPoint
  nowDays: number
  dayLengthSec: number
  getNpcState: (id: string) => NpcAuthoritativeState | undefined
  originOf: (id: string) => NpcTravelPoint | undefined
  isLive?: (id: string) => boolean
}

export type DispatchReadyExpeditionResult = {
  ok: boolean
  reason?: 'not-ready' | 'invalid-destination'
  dispatchedNpcIds: string[]
  skippedNpcIds: string[]
}

function isSameExpeditionTravel(state: NpcAuthoritativeState, assignmentId: string): boolean {
  return state.travel?.purpose?.kind === 'expedition'
    && state.travel.purpose.assignmentId === assignmentId
}

function hasIncompatibleCommitment(state: NpcAuthoritativeState, assignmentId: string): boolean {
  if (state.health.dead || state.postDeath != null) return true
  if (state.accompanyCommitment) return true
  if (!state.travel) return false
  if (isSameExpeditionTravel(state, assignmentId)) return false
  return true
}

function isFinitePoint(point: NpcTravelPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z)
}

/**
 * Start per-member generic travel for a `ready` assignment. Repeated calls
 * do not reset `lastPosition`, `departedAtDays`, or ETA.
 *
 * @domain settlements-npcs
 */
export function dispatchReadyExpedition(input: DispatchReadyExpeditionInput): DispatchReadyExpeditionResult {
  const dispatchedNpcIds: string[] = []
  const skippedNpcIds: string[] = []
  if (input.assignment.state !== 'ready') {
    return { ok: false, reason: 'not-ready', dispatchedNpcIds, skippedNpcIds: [...input.assignment.memberNpcIds] }
  }
  if (!isFinitePoint(input.destination)) {
    return { ok: false, reason: 'invalid-destination', dispatchedNpcIds, skippedNpcIds: [...input.assignment.memberNpcIds] }
  }

  const purpose = { kind: 'expedition' as const, assignmentId: input.assignment.id }
  for (const npcId of input.assignment.memberNpcIds) {
    const state = input.getNpcState(npcId)
    if (!state || hasIncompatibleCommitment(state, input.assignment.id)) {
      skippedNpcIds.push(npcId)
      continue
    }
    if (isSameExpeditionTravel(state, input.assignment.id)) {
      dispatchedNpcIds.push(npcId)
      continue
    }
    const origin = input.originOf(npcId)
    if (!origin || !isFinitePoint(origin)) {
      skippedNpcIds.push(npcId)
      continue
    }
    const live = input.isLive?.(npcId) === true
    if (live) {
      state.travel = {
        destination: { ...input.destination },
        lastPosition: { ...origin },
        purpose,
      }
    } else {
      state.travel = beginOffscreenNpcTravel(
        origin,
        input.destination,
        input.nowDays,
        input.dayLengthSec,
        { destination: input.destination, lastPosition: origin, purpose },
      )
    }
    dispatchedNpcIds.push(npcId)
  }

  return { ok: true, dispatchedNpcIds, skippedNpcIds }
}

