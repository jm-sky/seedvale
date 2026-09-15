import { estimateOffscreenTravelDays } from '../world/transportOffscreen'

/**
 * Generic NPC travel continuity (plan settlements-npcs-019 duration math,
 * extended by settlements-npcs-028). Not companion-specific and not a second
 * off-screen engine: detailed XOR off-screen execution, same
 * `estimateOffscreenTravelDays` a transport carrier already uses.
 *
 * Absent `execution` means a live `NpcAgent` owns progress. `lastPosition` is
 * the handoff origin (or last detailed checkpoint), never a per-frame path.
 * Optional `purpose` is caller/arrival context so expedition (and later
 * generic) arrivals can be observed exactly once without a parallel registry.
 *
 * @domain npc
 */

export type NpcTravelPoint = { x: number, z: number }

export type NpcTravelExecution = {
  mode: 'off-screen'
  departedAtDays: number
  arrivesAtDays: number
}

/** Semantic caller of a travel commitment — not a quest/object ref. */
export type NpcTravelPurpose = {
  kind: 'expedition'
  assignmentId: string
}

export type NpcTravelContinuity = {
  destination: NpcTravelPoint
  lastPosition: NpcTravelPoint
  execution?: NpcTravelExecution
  purpose?: NpcTravelPurpose
  /** Last world-days the generic off-screen survival checkpoint settled. */
  survivalResolvedAtDays?: number
  /** Logical arrival waiting for an idempotent caller observation. */
  arrival?: 'reached'
  /** Neutral stall: authoritative state cannot continue this journey. */
  blocked?: boolean
}

export type NpcTravelResolveResult =
  | { kind: 'none' }
  | { kind: 'in-progress' }
  | { kind: 'arrived' }
  | { kind: 'cannot-progress' }

/** Narrow authoritative slice so this module does not import `npcState.ts`. */
export type NpcTravelHost = {
  accompanyCommitment: unknown | null
  health?: { dead: boolean }
  travel: NpcTravelContinuity | null
}

export function cloneNpcTravelPurpose(
  purpose: NpcTravelPurpose | null | undefined,
): NpcTravelPurpose | undefined {
  if (!purpose) return undefined
  return { kind: purpose.kind, assignmentId: purpose.assignmentId }
}

export function cloneNpcTravel(
  travel: NpcTravelContinuity | null | undefined,
): NpcTravelContinuity | null {
  if (!travel) return null
  return {
    destination: { x: travel.destination.x, z: travel.destination.z },
    lastPosition: { x: travel.lastPosition.x, z: travel.lastPosition.z },
    execution: travel.execution
      ? {
          mode: 'off-screen',
          departedAtDays: travel.execution.departedAtDays,
          arrivesAtDays: travel.execution.arrivesAtDays,
        }
      : undefined,
    purpose: cloneNpcTravelPurpose(travel.purpose),
    survivalResolvedAtDays: travel.survivalResolvedAtDays,
    arrival: travel.arrival,
    blocked: travel.blocked,
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function copyMeta(travel: NpcTravelContinuity | null | undefined): Pick<
  NpcTravelContinuity,
  'purpose' | 'survivalResolvedAtDays' | 'arrival' | 'blocked'
> {
  return {
    purpose: cloneNpcTravelPurpose(travel?.purpose),
    survivalResolvedAtDays: travel?.survivalResolvedAtDays,
    arrival: travel?.arrival,
    blocked: travel?.blocked,
  }
}

export function travelProgress01(travel: NpcTravelContinuity, nowDays: number): number {
  const execution = travel.execution
  if (!execution) return 0
  const span = execution.arrivesAtDays - execution.departedAtDays
  if (!(span > 0)) return nowDays >= execution.arrivesAtDays ? 1 : 0
  return Math.min(1, Math.max(0, (nowDays - execution.departedAtDays) / span))
}

export function interpolateNpcTravelPosition(
  travel: NpcTravelContinuity,
  nowDays: number,
): NpcTravelPoint {
  const t = travel.execution ? travelProgress01(travel, nowDays) : 0
  if (t <= 0) return { x: travel.lastPosition.x, z: travel.lastPosition.z }
  if (t >= 1) return { x: travel.destination.x, z: travel.destination.z }
  return {
    x: lerp(travel.lastPosition.x, travel.destination.x, t),
    z: lerp(travel.lastPosition.z, travel.destination.z, t),
  }
}

export function isNpcTravelArrived(travel: NpcTravelContinuity, nowDays: number): boolean {
  if (travel.arrival === 'reached') return true
  if (!travel.execution) return false
  return nowDays >= travel.execution.arrivesAtDays
}

/** True while a purpose-backed commitment still owns this NPC's travel. */
export function hasCommittedNpcTravel(travel: NpcTravelContinuity | null | undefined): boolean {
  return travel?.purpose != null
}

export function keepsNpcTravelAfterReify(travel: NpcTravelContinuity | null | undefined): boolean {
  return travel?.purpose != null || travel?.arrival === 'reached' || travel?.blocked === true
}

/**
 * Detailed → off-screen handoff. Captures remaining travel from the live
 * position still known at stream-out. Zero remaining distance stores a
 * stationary checkpoint with no execution metadata (Stay, or already there).
 * Optional `carry` preserves purpose/survival/arrival across the handoff.
 *
 * @domain npc
 */
export function beginOffscreenNpcTravel(
  from: NpcTravelPoint,
  destination: NpcTravelPoint,
  nowDays: number,
  dayLengthSec: number,
  carry?: NpcTravelContinuity | null,
): NpcTravelContinuity {
  const meta = copyMeta(carry)
  if (meta.blocked || meta.arrival === 'reached') {
    return {
      destination: { ...destination },
      lastPosition: { ...from },
      ...meta,
    }
  }
  const travelDays = estimateOffscreenTravelDays(from, destination, dayLengthSec)
  if (!(travelDays > 0)) {
    return {
      destination: { ...destination },
      lastPosition: { ...from },
      ...meta,
      survivalResolvedAtDays: meta.survivalResolvedAtDays ?? nowDays,
      arrival: meta.purpose ? 'reached' : meta.arrival,
    }
  }
  return {
    destination: { ...destination },
    lastPosition: { ...from },
    execution: {
      mode: 'off-screen',
      departedAtDays: nowDays,
      arrivesAtDays: nowDays + travelDays,
    },
    ...meta,
    survivalResolvedAtDays: meta.survivalResolvedAtDays ?? nowDays,
  }
}

/**
 * Off-screen → detailed handoff. Places the NPC at the interpolated point
 * and drops execution so the live agent owns progress from here. Does not
 * advance time twice: `lastPosition` remains the original origin until this
 * call, then becomes the reified point. Purpose/survival/arrival survive.
 *
 * @domain npc
 */
export function reifyNpcTravel(
  travel: NpcTravelContinuity,
  nowDays: number,
): NpcTravelContinuity {
  const at = interpolateNpcTravelPosition(travel, nowDays)
  return {
    destination: { ...travel.destination },
    lastPosition: at,
    ...copyMeta(travel),
  }
}

/**
 * Keep a detailed-position checkpoint without taking off-screen ownership.
 * Used by save/rebuild while a live agent still exists.
 *
 * @domain npc
 */
export function stampNpcTravelCheckpoint(
  travel: NpcTravelContinuity | null,
  livePos: NpcTravelPoint,
  destination?: NpcTravelPoint,
): NpcTravelContinuity {
  const dest = destination ?? travel?.destination ?? livePos
  return {
    destination: { ...dest },
    lastPosition: { ...livePos },
    ...copyMeta(travel),
  }
}

/** Stamp arrival exactly once without clearing the commitment. */
export function markNpcTravelReached(travel: NpcTravelContinuity): NpcTravelContinuity {
  return {
    destination: { ...travel.destination },
    lastPosition: { ...travel.destination },
    purpose: cloneNpcTravelPurpose(travel.purpose),
    survivalResolvedAtDays: travel.survivalResolvedAtDays,
    arrival: 'reached',
    blocked: travel.blocked,
  }
}

/** Freeze further spatial progress without treating it as arrival. */
export function blockNpcTravel(
  travel: NpcTravelContinuity,
  lastPosition: NpcTravelPoint,
): NpcTravelContinuity {
  return {
    destination: { ...travel.destination },
    lastPosition: { ...lastPosition },
    purpose: cloneNpcTravelPurpose(travel.purpose),
    survivalResolvedAtDays: travel.survivalResolvedAtDays,
    arrival: travel.arrival,
    blocked: true,
  }
}

/**
 * Completes off-screen travel once the captured arrival time has elapsed.
 *
 * Return-without-purpose still clears travel (accompany keeps the checkpoint
 * until reification). Purpose-backed travel marks `arrival: 'reached'` and
 * leaves the commitment in place until `observeNpcTravelArrival()`.
 *
 * Idempotent. Death and `blocked` never become arrival.
 *
 * @domain npc
 */
export function resolveOffscreenNpcTravel(
  state: NpcTravelHost,
  nowDays: number,
): NpcTravelResolveResult {
  const travel = state.travel
  if (!travel) return { kind: 'none' }
  if (travel.arrival === 'reached') return { kind: 'arrived' }
  if (state.health?.dead) {
    if (travel.execution) {
      state.travel = blockNpcTravel(travel, interpolateNpcTravelPosition(travel, nowDays))
    } else if (!travel.blocked) {
      state.travel = { ...travel, blocked: true }
    }
    return { kind: 'cannot-progress' }
  }
  if (travel.blocked) return { kind: 'cannot-progress' }
  if (state.accompanyCommitment) return travel.execution ? { kind: 'in-progress' } : { kind: 'none' }
  if (!travel.execution) {
    if (travel.purpose && travel.lastPosition.x === travel.destination.x && travel.lastPosition.z === travel.destination.z) {
      state.travel = markNpcTravelReached(travel)
      return { kind: 'arrived' }
    }
    return travel.purpose ? { kind: 'in-progress' } : { kind: 'none' }
  }
  if (!isNpcTravelArrived(travel, nowDays)) return { kind: 'in-progress' }
  if (travel.purpose) {
    state.travel = markNpcTravelReached(travel)
    return { kind: 'arrived' }
  }
  state.travel = null
  return { kind: 'arrived' }
}

/**
 * Caller-owned arrival observation. Returns true exactly once for a purpose
 * commitment that has reached its destination, then clears generic travel.
 *
 * @domain npc
 */
export function observeNpcTravelArrival(state: NpcTravelHost): boolean {
  const travel = state.travel
  if (travel?.arrival !== 'reached') return false
  state.travel = null
  return true
}
