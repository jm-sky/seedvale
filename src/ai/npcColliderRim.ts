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
 * A* goal for a destination close enough to `colliders` that locomotion's
 * own destination-aware approach exception would apply to it (plan npc-007
 * — the identical `colliderSignedDistance <= approachBuffer` test
 * `NpcAgent.isWalkable` itself uses). `dest` at that range is exactly where
 * the coarse local-grid A* (`navigation.ts`) can snap its goal cell to a
 * cell still inside the collider's disk, or on its far side — sending the
 * route somewhere the real destination never intended. Returns a point
 * pulled back onto that collider's rim by `clearance` (large enough to
 * survive the grid's worst-case snapping error) instead, so A* only ever
 * has to route to open ground; the existing destination-aware final
 * approach covers the short remaining stretch onto the real `dest` once the
 * route arrives. Returns `dest` unchanged when no collider is that close —
 * the common case for an ordinary, not-collider-adjacent destination.
 */
export function navigationApproachTarget(
  dest: Point2,
  colliders: readonly Collider[],
  approachBuffer: number,
  clearance: number,
): Point2 {
  for (const collider of colliders) {
    if (colliderSignedDistance(collider, dest.x, dest.z) > approachBuffer) continue
    return colliderRimPoint(collider, dest.x, dest.z, clearance)
  }
  return dest
}

/**
 * `isWalkable`'s penetration rule (review 2026-09-03 §5 E7 / §8 step 8) —
 * pure geometry only; the caller keeps the water-level check (not a
 * collider concern) and resolves `colliders`/`destination` from its own
 * live state before calling. A point inside a foreign collider is walkable
 * only when it's a shallow approach-buffer graze toward the NPC's real
 * `destination` (queued drink stand, workplace right next to an obstacle)
 * that doesn't penetrate past `coreFraction` of the collider's own radius;
 * a collider the agent already stands in (`agentX`/`agentZ`) is skipped
 * entirely so an interior NPC can still walk out.
 */
export function isPointWalkableForNpc(
  x: number,
  z: number,
  colliders: readonly Collider[],
  agentX: number,
  agentZ: number,
  destination: Point2 | null,
  approachBuffer: number,
  coreFraction: number,
): boolean {
  for (const collider of colliders) {
    if (!colliderContainsPoint(collider, x, z)) continue
    if (colliderContainsPoint(collider, agentX, agentZ)) continue
    const destNearCollider =
      destination != null && colliderSignedDistance(collider, destination.x, destination.z) <= approachBuffer
    if (!destNearCollider) return false
    const depth = -colliderSignedDistance(collider, x, z)
    const coreDepth = collider.type === 'circle' ? collider.radius * (1 - coreFraction) : 0
    if (depth > coreDepth) return false
  }
  return true
}

/**
 * `resolveSteerTarget`'s bypass (review §5 E7 / §8 step 8) — if the straight
 * segment from `(fromX, fromZ)` to `dest` cuts through a nearby collider's
 * disk, returns a bypass point on that disk's rim; `null` when nothing
 * blocks (caller keeps steering straight at `dest`). A collider the agent
 * already stands in, or one `dest` is already allowed to approach
 * (`approachBuffer`), is skipped. Only resolves the first blocking
 * collider found — matches `isPointWalkableForNpc`'s "closest obstacle"
 * simplicity (plan 097 §2.2), not full multi-obstacle routing.
 */
export function bypassPointForSegment(
  fromX: number,
  fromZ: number,
  dest: Point2,
  colliders: readonly Collider[],
  approachBuffer: number,
): Point2 | null {
  for (const collider of colliders) {
    if (colliderContainsPoint(collider, fromX, fromZ)) continue
    if (colliderSignedDistance(collider, dest.x, dest.z) <= approachBuffer) continue

    const abx = dest.x - fromX
    const abz = dest.z - fromZ
    const abLen2 = abx * abx + abz * abz
    if (abLen2 < 1e-8) continue

    const apx = collider.x - fromX
    const apz = collider.z - fromZ
    let t = (apx * abx + apz * abz) / abLen2
    t = Math.max(0, Math.min(1, t))
    const cx = fromX + abx * t
    const cz = fromZ + abz * t
    if (!colliderContainsPoint(collider, cx, cz)) continue

    const extent = collider.type === 'circle' ? collider.radius : Math.max(collider.halfWidth, collider.halfDepth)
    return colliderRimPoint(collider, cx, cz, extent * 0.2)
  }
  return null
}

/**
 * Deterministic ring sampler (review §5 E7 / §8 step 8) — `attemptLocalEscape`'s
 * loop: for each radius in `radii` (checked in order, e.g.
 * `localEscapeRadii`'s output), walks `attempts` evenly-spaced points around
 * that ring and returns the first exterior one. Deterministic (no
 * `Math.random()`) so two NPCs at the same position with the same colliders
 * always escape to the same point — never a candidate for P10's "uncontrolled
 * randomness" list. `null` when nothing on any ring is exterior.
 */
export function sampleNearbyExteriorPoint(
  originX: number,
  originZ: number,
  radii: readonly number[],
  attempts: number,
  isExterior: (x: number, z: number) => boolean,
): Point2 | null {
  for (const radius of radii) {
    for (let i = 0; i < attempts; i++) {
      const angle = (i / attempts) * Math.PI * 2
      const x = originX + Math.cos(angle) * radius
      const z = originZ + Math.sin(angle) * radius
      if (isExterior(x, z)) return { x, z }
    }
  }
  return null
}

/**
 * Random-annulus sampler (review §5 E7 / §8 step 8) — `attemptBlindRepath`'s
 * loop: `attempts` tries at a random angle and a random radius within
 * `[minRadius, minRadius + span]`, returning the first exterior hit. Kept
 * distinct from `sampleNearbyExteriorPoint` above rather than forced into
 * one shape: unlike the deterministic ring, this one already uses
 * `Math.random()` today (P10 — recorded, not fixed, by this refactor) and
 * unifying the two would either make the deterministic escape random (a
 * behavior change) or make this one deterministic (also a behavior
 * change) — neither is a pure refactor. `random` is injected so both the
 * runtime call site and a test can control it.
 */
export function sampleRandomExteriorPoint(
  originX: number,
  originZ: number,
  minRadius: number,
  span: number,
  attempts: number,
  isExterior: (x: number, z: number) => boolean,
  random: () => number,
): Point2 | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = minRadius + random() * span
    const x = originX + Math.cos(angle) * radius
    const z = originZ + Math.sin(angle) * radius
    if (isExterior(x, z)) return { x, z }
  }
  return null
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
