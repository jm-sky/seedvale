/** Pure hysteresis follow-a-target primitive (plan fauna-020 / fauna-007 /
 *  npc-029). Owned animal Follow/Stay, temporary leading, and NPC accompany
 *  share this, with different distance bands. Mutates `state.following` so
 *  the start/stop commitment survives across ticks without a second
 *  controller. */

export type FollowHysteresisState = {
  following?: boolean
}

export type FollowHysteresisResult =
  | { kind: 'follow', x: number, z: number }
  | { kind: 'none' }

/**
 * @domain shared
 * @role Distance-band follow primitive used by fauna Follow/Lead and NPC accompany.
 */
export function resolveFollowHysteresis(
  state: FollowHysteresisState,
  actorPos: { x: number, z: number },
  targetPos: { x: number, z: number } | null | undefined,
  startDistance: number,
  stopDistance: number,
): FollowHysteresisResult {
  if (!targetPos) return { kind: 'none' }
  const dist = Math.hypot(targetPos.x - actorPos.x, targetPos.z - actorPos.z)
  let following = state.following ?? false
  if (!following && dist > startDistance) following = true
  if (following && dist < stopDistance) following = false
  state.following = following
  if (following) return { kind: 'follow', x: targetPos.x, z: targetPos.z }
  return { kind: 'none' }
}
