/**
 * House/well disks are solid (no doors). Destinations that sit in a foreign
 * collider's core are unreachable from outside (`ARRIVE` vs core fraction),
 * and rescue probes that reuse `isWalkable`'s "already inside → allowed"
 * exception hop deeper into the trap (plan 108).
 *
 * Pure, Three.js-free helpers — same shape as `npcMovementWatchdog.ts`.
 */

import type { Collider } from '../world/collision'

export type Point2 = { x: number, z: number }

/** Stand this far outside a collider's recorded radius so the point is
 *  unambiguously exterior (on-boundary `dist === radius` is already
 *  walkable, but a small margin survives float error and grazing). */
export const COLLIDER_RIM_MARGIN = 0.2

const DEGENERATE_EPSILON = 1e-4

export function pointInsideCollider(x: number, z: number, collider: Collider): boolean {
  return Math.hypot(x - collider.x, z - collider.z) < collider.radius
}

export function isInsideAnyCollider(x: number, z: number, colliders: readonly Collider[]): boolean {
  for (const collider of colliders) {
    if (pointInsideCollider(x, z, collider)) return true
  }
  return false
}

/** Rescue / wander probe without the 097 "already inside → allowed" exit
 *  patch: a point inside *any* disk is not a valid recovery target. */
export function isExteriorPoint(x: number, z: number, colliders: readonly Collider[]): boolean {
  return !isInsideAnyCollider(x, z, colliders)
}

/** Point on `collider`'s rim (`radius + margin`) facing `(fromX, fromZ)`.
 *  Degenerate (standing on the center) falls back to +X. */
export function rimPointFacing(
  collider: Collider,
  fromX: number,
  fromZ: number,
  margin = COLLIDER_RIM_MARGIN,
): Point2 {
  const dx = fromX - collider.x
  const dz = fromZ - collider.z
  const dist = Math.hypot(dx, dz)
  const rim = collider.radius + margin
  if (dist < DEGENERATE_EPSILON) return { x: collider.x + rim, z: collider.z }
  return {
    x: collider.x + (dx / dist) * rim,
    z: collider.z + (dz / dist) * rim,
  }
}

/**
 * If `dest` lies inside a collider that `pos` is **not** standing in, snap
 * dest to that collider's rim on the side facing the NPC. Occupied disks
 * are left alone so an NPC already inside can still walk out (097).
 */
export function destinationOnColliderRim(
  pos: Point2,
  dest: Point2,
  colliders: readonly Collider[],
  margin = COLLIDER_RIM_MARGIN,
): Point2 {
  for (const collider of colliders) {
    if (!pointInsideCollider(dest.x, dest.z, collider)) continue
    if (pointInsideCollider(pos.x, pos.z, collider)) continue
    return rimPointFacing(collider, pos.x, pos.z, margin)
  }
  return dest
}

/**
 * Local-escape hop distances. When the NPC is inside a disk, the first ring
 * is far enough to land outside that disk (`> remaining distance to rim`)
 * instead of sampling 1.5 m hops that stay in the core.
 */
export function localEscapeRadii(
  pos: Point2,
  colliders: readonly Collider[],
  margin = COLLIDER_RIM_MARGIN,
): readonly number[] {
  let maxExit = 0
  for (const collider of colliders) {
    const dist = Math.hypot(pos.x - collider.x, pos.z - collider.z)
    if (dist >= collider.radius) continue
    const exit = collider.radius - dist + margin
    if (exit > maxExit) maxExit = exit
  }
  if (maxExit <= 0) return [1.5, 3]
  const first = Math.max(maxExit, 1.5)
  return [first, first + 1.5, first + 3]
}

/**
 * Emergency-teleport picker: snap each candidate to a foreign-disk rim,
 * then keep the first exterior walkable point. Never returns a point inside
 * any supplied collider (so a house-center `home` candidate is rejected).
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
