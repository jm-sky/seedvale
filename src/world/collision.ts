/** Plan 097 §2.2 — shared collision primitive + spatial index for player/NPC/
 *  fauna movement and (later) `CaveVolume` walls. Deliberately not a physics
 *  engine: one shape (circle), one op (push the point outside the deepest
 *  overlap), one index (grid of buckets sized like a terrain chunk). See the
 *  plan for why this is enough and a rigid-body library isn't. */

export type Collider = {
  x: number
  z: number
  radius: number
}

const DEGENERATE_EPSILON = 1e-4

/** Pushes (x, z) outside the single most-overlapping collider ("closest
 *  primitive wins" — plan 097 §2.2), along the vector from that collider's
 *  center through the point. Colliders the entity isn't inside are ignored.
 *  Doesn't attempt to resolve simultaneous overlap with a second collider
 *  (e.g. standing in a corner between two rocks) — acceptable for v1 per
 *  the plan; a future pass could iterate if that turns out to matter. */
export function resolvePosition(
  x: number,
  z: number,
  entityRadius: number,
  colliders: readonly Collider[],
): { x: number, z: number } {
  let deepest: Collider | null = null
  let deepestPenetration = 0
  let deepestDist = 0

  for (const collider of colliders) {
    const dx = x - collider.x
    const dz = z - collider.z
    const dist = Math.hypot(dx, dz)
    const penetration = collider.radius + entityRadius - dist
    if (penetration > deepestPenetration) {
      deepest = collider
      deepestPenetration = penetration
      deepestDist = dist
    }
  }

  if (!deepest) return { x, z }
  const minDist = deepest.radius + entityRadius
  if (deepestDist < DEGENERATE_EPSILON) {
    // Entity center coincides with the collider's — no direction to push
    // along, so pick one arbitrarily rather than divide by ~0.
    return { x: deepest.x + minDist, z: deepest.z }
  }
  const scale = minDist / deepestDist
  return {
    x: deepest.x + (x - deepest.x) * scale,
    z: deepest.z + (z - deepest.z) * scale,
  }
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
