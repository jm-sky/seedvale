import { estimateOffscreenTravelDays } from '../world/transportOffscreen'

/**
 * Generic NPC travel continuity (plan settlements-npcs-019 duration math,
 * consumed by npc-029). Not companion-specific and not a second off-screen
 * engine: detailed XOR off-screen execution, same `estimateOffscreenTravelDays`
 * a transport carrier already uses.
 *
 * Absent `execution` means a live `NpcAgent` owns progress. `lastPosition` is
 * the handoff origin (or last detailed checkpoint), never a per-frame path.
 *
 * @domain npc
 */

export type NpcTravelPoint = { x: number, z: number }

export type NpcTravelExecution = {
  mode: 'off-screen'
  departedAtDays: number
  arrivesAtDays: number
}

export type NpcTravelContinuity = {
  destination: NpcTravelPoint
  lastPosition: NpcTravelPoint
  execution?: NpcTravelExecution
}

/** Narrow authoritative slice so this module does not import `npcState.ts`. */
export type NpcTravelHost = {
  accompanyCommitment: unknown | null
  travel: NpcTravelContinuity | null
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
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
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
  if (!travel.execution) return false
  return nowDays >= travel.execution.arrivesAtDays
}

/**
 * Detailed → off-screen handoff. Captures remaining travel from the live
 * position still known at stream-out. Zero remaining distance stores a
 * stationary checkpoint with no execution metadata (Stay, or already there).
 *
 * @domain npc
 */
export function beginOffscreenNpcTravel(
  from: NpcTravelPoint,
  destination: NpcTravelPoint,
  nowDays: number,
  dayLengthSec: number,
): NpcTravelContinuity {
  const travelDays = estimateOffscreenTravelDays(from, destination, dayLengthSec)
  if (!(travelDays > 0)) {
    return { destination: { ...destination }, lastPosition: { ...from } }
  }
  return {
    destination: { ...destination },
    lastPosition: { ...from },
    execution: {
      mode: 'off-screen',
      departedAtDays: nowDays,
      arrivesAtDays: nowDays + travelDays,
    },
  }
}

/**
 * Off-screen → detailed handoff. Places the NPC at the interpolated point
 * and drops execution so the live agent owns progress from here. Does not
 * advance time twice: `lastPosition` remains the original origin until this
 * call, then becomes the reified point.
 *
 * @domain npc
 */
export function reifyNpcTravel(
  travel: NpcTravelContinuity,
  nowDays: number,
): NpcTravelContinuity {
  const at = interpolateNpcTravelPosition(travel, nowDays)
  return { destination: { ...travel.destination }, lastPosition: at }
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
  }
}

/**
 * Completes an off-screen return (no accompany commitment) once the captured
 * arrival time has elapsed. Accompanying NPCs keep the checkpoint until
 * reification so follow/stay can resume from a coherent position. Idempotent.
 *
 * @domain npc
 */
export function resolveOffscreenNpcTravel(state: NpcTravelHost, nowDays: number): void {
  const travel = state.travel
  if (!travel?.execution) return
  if (state.accompanyCommitment) return
  if (!isNpcTravelArrived(travel, nowDays)) return
  state.travel = null
}
