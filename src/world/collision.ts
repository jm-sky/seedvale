/** Plan 097 §2.2 — shared collision primitive + spatial index for player/NPC/
 *  fauna movement and (later) `CaveVolume` walls. Deliberately not a physics
 *  engine: two shapes (circle, 2D OBB — plan 203/settlements-001 added the
 *  OBB for house walls/doors), one op per shape pair (push the point outside
 *  the deepest overlap), one index (grid of buckets sized like a terrain
 *  chunk). See the plans for why this is enough and a rigid-body library
 *  isn't. */

export type CircleCollider = {
  type: 'circle'
  x: number
  z: number
  radius: number
}

/** Axis-aligned in its own frame, rotated by `rotationY` into world/house-
 *  local space — the same rotate-then-translate convention `houseBuilder.ts`
 *  uses everywhere else (world = local rotated by yaw, `x*cos - z*sin` /
 *  `x*sin + z*cos`). Used for house wall segments and closed door leaves,
 *  which need real rectangular footprints, not oversized circles. */
export type ObbCollider = {
  type: 'obb'
  x: number
  z: number
  halfWidth: number
  halfDepth: number
  rotationY: number
}

export type Collider = CircleCollider | ObbCollider

const DEGENERATE_EPSILON = 1e-4

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function toObbLocal(collider: ObbCollider, x: number, z: number): { lx: number, lz: number } {
  const cos = Math.cos(collider.rotationY)
  const sin = Math.sin(collider.rotationY)
  const wx = x - collider.x
  const wz = z - collider.z
  return { lx: wx * cos + wz * sin, lz: -wx * sin + wz * cos }
}

function obbLocalToWorld(collider: ObbCollider, lx: number, lz: number): { x: number, z: number } {
  const cos = Math.cos(collider.rotationY)
  const sin = Math.sin(collider.rotationY)
  return { x: collider.x + lx * cos - lz * sin, z: collider.z + lx * sin + lz * cos }
}

/**
 * Signed distance from `(x, z)` to `collider`'s boundary: negative when
 * inside (magnitude = penetration depth to the nearest edge/rim), positive
 * outside (distance to the nearest point on the shape), zero on the
 * boundary. The one geometric primitive every point-vs-collider consumer
 * (walkability, rim/escape helpers, NPC steering) builds on instead of each
 * assuming `.radius`.
 */
export function colliderSignedDistance(collider: Collider, x: number, z: number): number {
  if (collider.type === 'circle') {
    return Math.hypot(x - collider.x, z - collider.z) - collider.radius
  }
  const { lx, lz } = toObbLocal(collider, x, z)
  const dx = Math.abs(lx) - collider.halfWidth
  const dz = Math.abs(lz) - collider.halfDepth
  if (dx <= 0 && dz <= 0) return Math.max(dx, dz)
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
}

export function colliderContainsPoint(collider: Collider, x: number, z: number): boolean {
  return colliderSignedDistance(collider, x, z) < 0
}

export function isInsideAnyCollider(x: number, z: number, colliders: readonly Collider[]): boolean {
  for (const collider of colliders) {
    if (colliderContainsPoint(collider, x, z)) return true
  }
  return false
}

/**
 * Nearest point on `collider`'s boundary/perimeter to `(x, z)`. For an
 * exterior point this is the closest point on the shape; for an interior
 * point it's the point on the nearest edge (not the input point itself).
 */
export function closestBoundaryPoint(collider: Collider, x: number, z: number): { x: number, z: number } {
  if (collider.type === 'circle') {
    const dx = x - collider.x
    const dz = z - collider.z
    const dist = Math.hypot(dx, dz)
    if (dist < DEGENERATE_EPSILON) return { x: collider.x + collider.radius, z: collider.z }
    return { x: collider.x + (dx / dist) * collider.radius, z: collider.z + (dz / dist) * collider.radius }
  }
  const { lx, lz } = toObbLocal(collider, x, z)
  const dx = collider.halfWidth - Math.abs(lx)
  const dz = collider.halfDepth - Math.abs(lz)
  if (dx >= 0 && dz >= 0) {
    // Inside the rectangle — snap to the nearer edge.
    if (dx < dz) return obbLocalToWorld(collider, Math.sign(lx || 1) * collider.halfWidth, lz)
    return obbLocalToWorld(collider, lx, Math.sign(lz || 1) * collider.halfDepth)
  }
  const cx = clamp(lx, -collider.halfWidth, collider.halfWidth)
  const cz = clamp(lz, -collider.halfDepth, collider.halfDepth)
  return obbLocalToWorld(collider, cx, cz)
}

/**
 * Point on `collider`'s rim, `margin` past the boundary, on the side facing
 * `(fromX, fromZ)` — the same "stand just outside this obstacle, facing
 * where I came from" query used for NPC rescue/wander destinations and
 * steering avoidance. Degenerate (from sitting exactly on a circle's center)
 * falls back to +X; reduces to the pre-OBB `radius + margin` formula exactly
 * for circles.
 */
export function colliderRimPoint(
  collider: Collider,
  fromX: number,
  fromZ: number,
  margin: number,
): { x: number, z: number } {
  const boundary = closestBoundaryPoint(collider, fromX, fromZ)
  const inside = colliderContainsPoint(collider, fromX, fromZ)
  let nx = inside ? boundary.x - fromX : fromX - boundary.x
  let nz = inside ? boundary.z - fromZ : fromZ - boundary.z
  const len = Math.hypot(nx, nz)
  if (len < DEGENERATE_EPSILON) {
    nx = 1
    nz = 0
  } else {
    nx /= len
    nz /= len
  }
  return { x: boundary.x + nx * margin, z: boundary.z + nz * margin }
}

type Push = { penetration: number, x: number, z: number }

function resolveCirclePush(collider: CircleCollider, x: number, z: number, entityRadius: number): Push {
  const dx = x - collider.x
  const dz = z - collider.z
  const dist = Math.hypot(dx, dz)
  const minDist = collider.radius + entityRadius
  const penetration = minDist - dist
  if (dist < DEGENERATE_EPSILON) {
    // Entity center coincides with the collider's — no direction to push
    // along, so pick one arbitrarily rather than divide by ~0.
    return { penetration, x: collider.x + minDist, z: collider.z }
  }
  const scale = minDist / dist
  return { penetration, x: collider.x + dx * scale, z: collider.z + dz * scale }
}

/** Circle-shaped entity vs. OBB: closest point on the rectangle via clamp
 *  (outside case) or push through the nearest edge (inside case) — plan
 *  settlements-001 §3's "Circle vs OBB" steps. The inside branch is
 *  guaranteed a nonzero push axis (a deterministic edge pick, never NaN);
 *  the outside branch is guaranteed `dist > 0` because at least one axis is
 *  already known to overflow the half-extent. */
function resolveObbPush(collider: ObbCollider, x: number, z: number, entityRadius: number): Push {
  const { lx, lz } = toObbLocal(collider, x, z)
  const dx = collider.halfWidth - Math.abs(lx)
  const dz = collider.halfDepth - Math.abs(lz)
  let pushLx: number
  let pushLz: number
  let penetration: number
  if (dx >= 0 && dz >= 0) {
    if (dx < dz) {
      pushLx = Math.sign(lx || 1) * (collider.halfWidth + entityRadius)
      pushLz = lz
      penetration = dx + entityRadius
    } else {
      pushLx = lx
      pushLz = Math.sign(lz || 1) * (collider.halfDepth + entityRadius)
      penetration = dz + entityRadius
    }
  } else {
    const cx = clamp(lx, -collider.halfWidth, collider.halfWidth)
    const cz = clamp(lz, -collider.halfDepth, collider.halfDepth)
    const ddx = lx - cx
    const ddz = lz - cz
    const dist = Math.hypot(ddx, ddz)
    penetration = entityRadius - dist
    const scale = entityRadius / dist
    pushLx = cx + ddx * scale
    pushLz = cz + ddz * scale
  }
  const world = obbLocalToWorld(collider, pushLx, pushLz)
  return { penetration, x: world.x, z: world.z }
}

/** Pushes (x, z) outside the single most-overlapping collider ("closest
 *  primitive wins" — plan 097 §2.2), circle or OBB. Colliders the entity
 *  isn't overlapping are ignored. Doesn't attempt to resolve simultaneous
 *  overlap with a second collider (e.g. standing in a corner between two
 *  rocks) — acceptable for v1 per the plan; a future pass could iterate if
 *  that turns out to matter. */
export function resolvePosition(
  x: number,
  z: number,
  entityRadius: number,
  colliders: readonly Collider[],
): { x: number, z: number } {
  let deepest: Push | null = null

  for (const collider of colliders) {
    const push = collider.type === 'circle'
      ? resolveCirclePush(collider, x, z, entityRadius)
      : resolveObbPush(collider, x, z, entityRadius)
    if (push.penetration > 0 && (!deepest || push.penetration > deepest.penetration)) {
      deepest = push
    }
  }

  if (!deepest) return { x, z }
  return { x: deepest.x, z: deepest.z }
}

export type ColliderRegistry = {
  /** Registers/replaces the collider set owned by `ownerKey` (a terrain
   *  chunk key, a settlement id, a well id, ...). Call again with the same
   *  key to replace a previous set without a separate clear. */
  setColliders: (ownerKey: string, colliders: readonly Collider[]) => void
  /** Removes everything `ownerKey` registered — chunk unload, settlement
   *  unload. No-op if `ownerKey` never registered anything. */
  clearColliders: (ownerKey: string) => void
  /** All colliders in the 3x3 neighborhood of buckets around (x, z). Callers'
   *  entity radius is always much smaller than `cellSize`, so this is a
   *  cheap superset — exact filtering happens in `resolvePosition`. */
  query: (x: number, z: number) => readonly Collider[]
}

/** `cellSize` should track the terrain chunk size the caller already uses —
 *  no need for the index to invent its own grid. */
export function createColliderRegistry(cellSize: number): ColliderRegistry {
  const byOwner = new Map<string, readonly Collider[]>()
  const cells = new Map<string, Collider[]>()

  const cellKey = (cx: number, cz: number): string => `${cx},${cz}`
  const cellOf = (x: number, z: number): { cx: number, cz: number } => ({
    cx: Math.floor(x / cellSize),
    cz: Math.floor(z / cellSize),
  })

  const removeFromCells = (colliders: readonly Collider[]): void => {
    for (const collider of colliders) {
      const { cx, cz } = cellOf(collider.x, collider.z)
      const bucket = cells.get(cellKey(cx, cz))
      if (!bucket) continue
      const index = bucket.indexOf(collider)
      if (index !== -1) bucket.splice(index, 1)
    }
  }

  return {
    setColliders(ownerKey, colliders) {
      const previous = byOwner.get(ownerKey)
      if (previous) removeFromCells(previous)
      byOwner.set(ownerKey, colliders)
      for (const collider of colliders) {
        const { cx, cz } = cellOf(collider.x, collider.z)
        const key = cellKey(cx, cz)
        let bucket = cells.get(key)
        if (!bucket) {
          bucket = []
          cells.set(key, bucket)
        }
        bucket.push(collider)
      }
    },
    clearColliders(ownerKey) {
      const previous = byOwner.get(ownerKey)
      if (!previous) return
      removeFromCells(previous)
      byOwner.delete(ownerKey)
    },
    query(x, z) {
      const { cx, cz } = cellOf(x, z)
      const result: Collider[] = []
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = cells.get(cellKey(cx + dx, cz + dz))
          if (bucket) result.push(...bucket)
        }
      }
      return result
    },
  }
}
