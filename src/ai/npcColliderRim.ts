/**
 * House/well colliders (circle or, since plan settlements-001, house wall/
 * door OBBs) have no doors of their own here — this module treats any
 * `Collider` as a solid obstacle. Destinations that sit in a foreign
 * collider's core are unreachable from outside (`ARRIVE` vs core fraction),
 * and rescue probes that reuse `isWalkable`'s "already inside → allowed"
 * exception hop deeper into the trap (plan 108).
 *
 * Pure, Three.js-free helpers — same shape as `npcMovementWatchdog.ts`. All
 * shape math (circle/OBB) lives in `world/collision.ts`; this module only
 * adds the NPC-specific rescue/rim semantics on top.
 */

import {
  type Collider,
  colliderContainsPoint,
  colliderRimPoint,
  colliderSignedDistance,
  isInsideAnyCollider,
} from '../world/collision'

export type Point2 = { x: number, z: number }

/** Stand this far outside a collider's boundary so the point is
 *  unambiguously exterior (on-boundary is already walkable, but a small
 *  margin survives float error and grazing). */
export const COLLIDER_RIM_MARGIN = 0.2

export function pointInsideCollider(x: number, z: number, collider: Collider): boolean {
  return colliderContainsPoint(collider, x, z)
}

export { isInsideAnyCollider }

/** Rescue / wander probe without the 097 "already inside → allowed" exit
 *  patch: a point inside *any* collider is not a valid recovery target. */
export function isExteriorPoint(x: number, z: number, colliders: readonly Collider[]): boolean {
  return !isInsideAnyCollider(x, z, colliders)
}

/** Point on `collider`'s rim (boundary + margin) facing `(fromX, fromZ)`.
 *  Degenerate (standing on the collider's center) falls back to +X. */
export function rimPointFacing(
  collider: Collider,
  fromX: number,
  fromZ: number,
  margin = COLLIDER_RIM_MARGIN,
): Point2 {
  return colliderRimPoint(collider, fromX, fromZ, margin)
}

/**
 * If `dest` lies inside a collider that `pos` is **not** standing in, snap
 * dest to that collider's rim on the side facing the NPC. Occupied colliders
 * are left alone so an NPC already inside can still walk out (097).
 */
export function destinationOnColliderRim(
  pos: Point2,
  dest: Point2,
  colliders: readonly Collider[],
  margin = COLLIDER_RIM_MARGIN,
): Point2 {
  for (const collider of colliders) {
    if (!colliderContainsPoint(collider, dest.x, dest.z)) continue
    if (colliderContainsPoint(collider, pos.x, pos.z)) continue
    return colliderRimPoint(collider, pos.x, pos.z, margin)
  }
  return dest
}

/**
 * Local-escape hop distances. When the NPC is inside a collider, the first
 * ring is far enough to land outside it (`> remaining distance to the rim`)
 * instead of sampling 1.5 m hops that stay in the core.
 */
export function localEscapeRadii(
  pos: Point2,
  colliders: readonly Collider[],
  margin = COLLIDER_RIM_MARGIN,
): readonly number[] {
  let maxExit = 0
  for (const collider of colliders) {
    const depth = -colliderSignedDistance(collider, pos.x, pos.z)
    if (depth <= 0) continue
    const exit = depth + margin
    if (exit > maxExit) maxExit = exit
  }
  if (maxExit <= 0) return [1.5, 3]
  const first = Math.max(maxExit, 1.5)
  return [first, first + 1.5, first + 3]
}

/**
 * Emergency-teleport picker: snap each candidate to a foreign collider's
 * rim, then keep the first exterior walkable point. Never returns a point
 * inside any supplied collider (so a house-center `home` candidate is
 * rejected).
 */
export function pickEmergencyTeleportPoint(
  pos: Point2,
  candidates: readonly Point2[],
  colliders: readonly Collider[],
  isWalkableExterior: (x: number, z: number) => boolean,
): Point2 | null {
  for (const candidate of candidates) {
    const rim = destinationOnColliderRim(pos, candidate, colliders)
    if (!isExteriorPoint(rim.x, rim.z, colliders)) continue
    if (!isWalkableExterior(rim.x, rim.z)) continue
    return rim
  }
  return null
}
