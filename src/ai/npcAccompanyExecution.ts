import type { FollowHysteresisState } from '../shared/followHysteresis'
import type { NpcAccompanyCommitment } from './npcAccompanyCommitment'
import { resolveFollowHysteresis } from '../shared/followHysteresis'

/**
 * Transient follow/stay movement for an accompany commitment (plan npc-029).
 * Pure: does not own the commitment, does not teleport, and does not treat
 * a large gap as abandonment.
 *
 * @domain npc
 */

/** Same start/stop band as owned-livestock Follow — a walking NPC keeps a
 *  sensible trail distance without sticking to the player. */
export const NPC_ACCOMPANY_FOLLOW_START_DISTANCE = 12
export const NPC_ACCOMPANY_FOLLOW_STOP_DISTANCE = 6
/** How far the player must move before follow retargets the current go-to. */
export const NPC_ACCOMPANY_FOLLOW_RETARGET_DISTANCE = 2
/** Stay walks back to the recorded anchor past this distance. */
export const NPC_ACCOMPANY_STAY_ARRIVE_DISTANCE = 1.5

export type NpcAccompanyMovement =
  | { kind: 'follow', x: number, z: number }
  | { kind: 'hold', x: number, z: number }
  | { kind: 'none' }

export function horizontalDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  return Math.hypot(ax - bx, az - bz)
}

export function shouldRetargetFollowDestination(
  currentDest: { x: number, z: number },
  targetPos: { x: number, z: number },
  threshold = NPC_ACCOMPANY_FOLLOW_RETARGET_DISTANCE,
): boolean {
  return horizontalDistance(currentDest.x, currentDest.z, targetPos.x, targetPos.z) > threshold
}

/**
 * Resolves the next follow/stay movement from the persistent commitment and
 * transient hysteresis state. Missing player position while following holds
 * in place rather than cancelling the commitment.
 *
 * @domain npc
 */
export function resolveNpcAccompanyMovement(
  commitment: NpcAccompanyCommitment | null | undefined,
  hysteresis: FollowHysteresisState,
  npcPos: { x: number, z: number },
  playerPos: { x: number, z: number } | null | undefined,
): NpcAccompanyMovement {
  if (!commitment) return { kind: 'none' }
  if (commitment.mode === 'stay') {
    const anchor = commitment.stayAnchor
    if (!anchor) return { kind: 'hold', x: npcPos.x, z: npcPos.z }
    if (horizontalDistance(npcPos.x, npcPos.z, anchor.x, anchor.z) > NPC_ACCOMPANY_STAY_ARRIVE_DISTANCE) {
      return { kind: 'follow', x: anchor.x, z: anchor.z }
    }
    return { kind: 'hold', x: anchor.x, z: anchor.z }
  }
  if (!playerPos) return { kind: 'hold', x: npcPos.x, z: npcPos.z }
  const follow = resolveFollowHysteresis(
    hysteresis,
    npcPos,
    playerPos,
    NPC_ACCOMPANY_FOLLOW_START_DISTANCE,
    NPC_ACCOMPANY_FOLLOW_STOP_DISTANCE,
  )
  if (follow.kind === 'follow') return { kind: 'follow', x: follow.x, z: follow.z }
  return { kind: 'hold', x: npcPos.x, z: npcPos.z }
}
