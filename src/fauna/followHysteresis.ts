/** Pure hysteresis follow-a-target primitive (plan fauna-020 / fauna-007).
 *  Owned Follow/Stay and temporary leading share this, with different
 *  distance bands. Mutates `state.following` so commitment survives across
 *  ticks without a second controller. */

export type FollowHysteresisState = {
  following?: boolean
}

export type FollowHysteresisResult =
  | { kind: 'follow', x: number, z: number }
  | { kind: 'none' }

/**
 * @domain fauna
 * @role Distance-band follow commitment used by owned Follow and leading.
 */
export function resolveFollowHysteresis(
  state: FollowHysteresisState,
  animalPos: { x: number, z: number },
  targetPos: { x: number, z: number } | null | undefined,
  startDistance: number,
  stopDistance: number,
): FollowHysteresisResult {
  if (!targetPos) return { kind: 'none' }
  const dist = Math.hypot(targetPos.x - animalPos.x, targetPos.z - animalPos.z)
  let following = state.following ?? false
  if (!following && dist > startDistance) following = true
  if (following && dist < stopDistance) following = false
  state.following = following
  if (following) return { kind: 'follow', x: targetPos.x, z: targetPos.z }
  return { kind: 'none' }
}
