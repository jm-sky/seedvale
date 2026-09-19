import type { AnimalAgent } from './AnimalAgent'

/**
 * @domain fauna
 * @role Runtime-only coarse spatial hash for local inter-animal queries
 *  (plan fauna-042). Derived from the live `AnimalAgent[]` owned by
 *  `createFauna()`; not an authoritative registry and not persisted.
 *
 *  Cell covering may include neighbouring cells so a target on a cell
 *  boundary is still visited. Callers must still apply the original
 *  radius / role / dead / self predicates before selection.
 */

/** World-unit cell size. Typical detect/flee/food radii are 10–20 m;
 *  extra-range prey alert reaches ~40 m. One extra neighbouring cell is
 *  always included so a same-frame step cannot drop a just-in-range
 *  neighbour. */
export const FAUNA_PROXIMITY_CELL_SIZE = 16

/** Pack signed cell coordinates into a unique Map key. 20 bits per axis
 *  covers ±524 km of cell origins — far beyond the playable map. */
const CELL_KEY_STRIDE = 1 << 20

export type FaunaProximityVisitor = (agent: AnimalAgent) => void

export type FaunaProximityPredicate = (agent: AnimalAgent) => boolean

export type FaunaProximityIndex = {
  /** Rebuild buckets from the current wild pool. O(N). Livestock passed as
   *  `huntableLivestock` must not be included here. */
  rebuild(agents: readonly AnimalAgent[]): void
  /** Wild-pool membership for committed-target validation — not a radius check. */
  has(agent: AnimalAgent): boolean
  /** Visit every wild agent whose cell can intersect the query disk.
   *  Does not apply the radius predicate; the caller does. */
  forEachNear(x: number, z: number, radius: number, visit: FaunaProximityVisitor): void
  /** Count covering-cell agents that pass `predicate` and lie strictly
   *  inside `radius` (`hypot < radius`, matching `SPAWNER_RADIUS` occupancy). */
  countNear(x: number, z: number, radius: number, predicate: FaunaProximityPredicate): number
}

function cellCoord(v: number): number {
  return Math.floor(v / FAUNA_PROXIMITY_CELL_SIZE)
}

function cellKey(cx: number, cz: number): number {
  return cx * CELL_KEY_STRIDE + cz
}

function coveringCellRange(v: number, radius: number): { min: number, max: number } {
  const cover = radius + FAUNA_PROXIMITY_CELL_SIZE
  return {
    min: cellCoord(v - cover),
    max: cellCoord(v + cover),
  }
}

/**
 * Scratch spatial hash local to one `createFauna()` instance. Reuses cell
 * bucket arrays across rebuilds so the common fauna pass stays allocation-free
 * after warmup.
 */
export function createFaunaProximityIndex(): FaunaProximityIndex {
  const buckets = new Map<number, AnimalAgent[]>()
  const idleBuckets: AnimalAgent[][] = []
  const members = new Set<AnimalAgent>()

  function forEachCovering(x: number, z: number, radius: number, visit: FaunaProximityVisitor): void {
    const xRange = coveringCellRange(x, radius)
    const zRange = coveringCellRange(z, radius)
    for (let cx = xRange.min; cx <= xRange.max; cx++) {
      for (let cz = zRange.min; cz <= zRange.max; cz++) {
        const bucket = buckets.get(cellKey(cx, cz))
        if (!bucket) continue
        for (let i = 0; i < bucket.length; i++) visit(bucket[i]!)
      }
    }
  }

  return {
    rebuild(agents) {
      members.clear()
      for (const bucket of buckets.values()) bucket.length = 0
      for (const agent of agents) {
        members.add(agent)
        const key = cellKey(cellCoord(agent.mesh.position.x), cellCoord(agent.mesh.position.z))
        let bucket = buckets.get(key)
        if (!bucket) {
          bucket = idleBuckets.pop() ?? []
          buckets.set(key, bucket)
        }
        bucket.push(agent)
      }
      for (const [key, bucket] of buckets) {
        if (bucket.length > 0) continue
        buckets.delete(key)
        idleBuckets.push(bucket)
      }
    },
    has(agent) {
      return members.has(agent)
    },
    forEachNear(x, z, radius, visit) {
      forEachCovering(x, z, radius, visit)
    },
    countNear(x, z, radius, predicate) {
      let n = 0
      forEachCovering(x, z, radius, (agent) => {
        if (!predicate(agent)) return
        const d = Math.hypot(agent.mesh.position.x - x, agent.mesh.position.z - z)
        if (d < radius) n++
      })
      return n
    },
  }
}
