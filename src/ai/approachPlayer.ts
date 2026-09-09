/**
 * Small reusable "approach a nearby player for an interaction intent"
 * helpers (plan npc-016 §12). Movement stays generic; callers supply the
 * interaction context. Payment is the first consumer.
 *
 * @domain npc
 */

export type ApproachPlayerIntent = {
  kind: 'work_contract_payment'
  contractId: string
  npcId: string
}

/** Nearby-in-the-same-scene range — not a world-wide chase. */
export const PLAYER_APPROACH_LOCAL_RANGE = 24

/** Arrival / talk distance, matching the player's NPC interact range. */
export const PLAYER_APPROACH_ARRIVE_RANGE = 2.5

export function horizontalDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  return Math.hypot(ax - bx, az - bz)
}

export function isPlayerLocallyEligible(
  npcX: number,
  npcZ: number,
  playerX: number,
  playerZ: number,
  range = PLAYER_APPROACH_LOCAL_RANGE,
): boolean {
  return horizontalDistance(npcX, npcZ, playerX, playerZ) <= range
}

export function isPlayerApproachArrived(
  npcX: number,
  npcZ: number,
  playerX: number,
  playerZ: number,
  range = PLAYER_APPROACH_ARRIVE_RANGE,
): boolean {
  return horizontalDistance(npcX, npcZ, playerX, playerZ) <= range
}
