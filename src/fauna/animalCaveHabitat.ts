import type { CaveGroundHit } from '../world/caves/caveGroundQuery'
import type { CaveHomePlacementHint, CaveTraversalDescriptor, CaveTraversalPoint } from '../world/caves/caveHabitat'
import type { CaveUndergroundPool } from '../world/caves/caveUndergroundPool'

/**
 * @domain fauna
 * @role Fauna-owned cave habitat binding + the narrow world-cave contract it
 *  resolves against (plan fauna-019). This is the only place fauna touches
 *  cave types — `AnimalAgent`/`animalRoaming`/`animalForaging` never import
 *  `createCaves.ts`, `ChunkManager` or cave presentation; the composition
 *  root (`worldBundle.ts`) adapts the real `Caves` instance into
 *  `AnimalCaveWorldContract` before it reaches `createFauna()`.
 */

/** Narrow, read-only cave-world contract fauna consumes for a cave-bound
 *  resident's home/route/movement — exactly the `Caves` methods needed here.
 *  Stateless and per-`caveId`, so it is shared across every cave-bound
 *  animal rather than allocated per instance. */
export type AnimalCaveWorldContract = {
  resolveHabitat: (
    caveId: string,
    entityHeight: number,
    options?: { homeNodeId?: string, homePlacementHint?: CaveHomePlacementHint },
  ) => CaveTraversalDescriptor | null
  queryGroundIn: (caveId: string, x: number, y: number, z: number) => CaveGroundHit | null
  resolveHorizontalIn: (
    caveId: string,
    x: number,
    z: number,
    y: number,
    radius: number,
    entityHeight: number,
  ) => { x: number, z: number }
  /** Shallow underground pool for a dungeon cave (plan fauna-027) — cave-local only. */
  undergroundPoolOf?: (caveId: string) => CaveUndergroundPool | null
  resolveRouteBetween?: (
    caveId: string,
    fromNodeId: string,
    toNodeId: string,
  ) => readonly CaveTraversalPoint[] | null
}

/** Fauna-owned stable reference from one habitat slot to its real-world
 *  source. Resolved home/route are runtime-derived from the world contract,
 *  never a second persistent definition — see `resolveAnimalCaveHabitat`. */
export type AnimalHabitatBinding = {
  habitatId: string
  source: { kind: 'cave', caveId: string, homeNodeId?: string }
}

/** Infinite environmental fish source at a dungeon pool shoreline (plan fauna-027). */
export type EnvironmentalAnimalFoodSource = {
  id: string
  kind: 'fish'
  x: number
  z: number
  chamberNodeId: string
}

/** Cave-local pool drink target (plan fauna-027). */
export type EnvironmentalCaveWaterSource = {
  id: string
  x: number
  z: number
  chamberNodeId: string
}

/** Per-agent runtime companion cached for the lifetime of one `AnimalAgent`
 *  (never persisted — re-resolved from `caveId` after any `WorldBundle`
 *  rebuild, plan fauna-019 §10/§11). */
export type AnimalCaveContext = {
  world: AnimalCaveWorldContract
  caveId: string
  homeNodeId: string
  home: CaveTraversalPoint
  entrance: CaveTraversalPoint
  /** Route home -> entrance, inclusive of both ends. */
  homeToEntrance: readonly CaveTraversalPoint[]
  /** Same waypoints, entrance -> home — precomputed once so a committed
   *  return trip never reverses the array per tick. */
  entranceToHome: readonly CaveTraversalPoint[]
  /** Cached home → pool chamber route for needs pursuit (plan fauna-027). */
  homeToPoolRoute: readonly CaveTraversalPoint[] | null
  poolWater: EnvironmentalCaveWaterSource | null
  poolFish: EnvironmentalAnimalFoodSource | null
  /** This resident's own physical dimensions for cave wall containment and
   *  standing-clearance checks (plan fauna-019 §4). */
  entityRadius: number
  entityHeight: number
}

export type ResolvedAnimalCaveHabitat = {
  binding: AnimalHabitatBinding
  context: AnimalCaveContext
}

/** Capsule collision-radius scale `AnimalAgent`'s procedural fallback mesh
 *  already uses (`radius = ANIMAL_CAPSULE_RADIUS_SCALE * def.scale`) — the
 *  one existing physical body-radius proxy every species already has via
 *  `def.scale`, reused here for cave horizontal containment instead of a
 *  second, bear-specific constant (plan fauna-019 §4's guidance: check for
 *  an existing collision dimension before adding a new one). */
export const ANIMAL_CAPSULE_RADIUS_SCALE = 0.28

/** This species' physical radius/height for cave wall containment and
 *  standing-clearance checks — `def.modelHeight` ("target model height in
 *  world meters") is already the right standing-clearance number; radius
 *  reuses the same scale the capsule fallback mesh is built with. */
export function animalCaveEntityDimensions(def: { scale: number, modelHeight: number }): {
  radius: number
  height: number
} {
  return { radius: ANIMAL_CAPSULE_RADIUS_SCALE * def.scale, height: def.modelHeight }
}

/**
 * Resolves one habitat binding against the world cave contract into a
 * cacheable per-agent context. `null` when the cave id is unknown or no
 * chamber candidate is standable for `entityDimensions.height` — callers
 * must not fall back to a spawner-style position; a binding that fails to
 * resolve simply has no resident this build (plan fauna-019 §2/§10).
 *
 * @domain fauna
 */
export function resolveAnimalCaveHabitat(
  binding: AnimalHabitatBinding,
  world: AnimalCaveWorldContract,
  entityDimensions: { radius: number, height: number },
): ResolvedAnimalCaveHabitat | null {
  const pool = world.undergroundPoolOf?.(binding.source.caveId) ?? null
  const homeNodeId = binding.source.homeNodeId
  const homePlacementHint = pool && homeNodeId === pool.chamberNodeId
    ? { dryApproach: { x: pool.shorelineApproach.x, z: pool.shorelineApproach.z } }
    : undefined
  const descriptor = world.resolveHabitat(binding.source.caveId, entityDimensions.height, {
    homeNodeId,
    homePlacementHint,
  })
  if (!descriptor) return null
  const homeToPoolRoute = pool && homeNodeId && world.resolveRouteBetween
    ? world.resolveRouteBetween(binding.source.caveId, homeNodeId, pool.chamberNodeId)
    : null
  const shoreline = pool?.shorelineApproach
  return {
    binding,
    context: {
      world,
      caveId: descriptor.caveId,
      homeNodeId: homeNodeId ?? '',
      home: descriptor.home,
      entrance: { x: descriptor.entrance.x, y: descriptor.entrance.y, z: descriptor.entrance.z },
      homeToEntrance: descriptor.routeToEntrance,
      entranceToHome: [...descriptor.routeToEntrance].reverse(),
      homeToPoolRoute,
      poolWater: pool && shoreline
        ? {
          id: pool.id,
          x: shoreline.x,
          z: shoreline.z,
          chamberNodeId: pool.chamberNodeId,
        }
        : null,
      poolFish: pool && shoreline
        ? {
          id: `${pool.id}:fish`,
          kind: 'fish',
          x: shoreline.x,
          z: shoreline.z,
          chamberNodeId: pool.chamberNodeId,
        }
        : null,
      entityRadius: entityDimensions.radius,
      entityHeight: entityDimensions.height,
    },
  }
}

export type CaveRouteProgress = {
  /** Next waypoint to steer toward, or `null` once the route is complete. */
  point: CaveTraversalPoint | null
  /** Updated cursor — the caller stores this back onto its own field for
   *  the next call. */
  index: number
}

/**
 * Advances a small monotonic cursor along `route`: `index` names the
 * waypoint currently being walked toward; once `(x, z)` is within
 * `arrivalRadius` of it, the cursor moves to the next one, in order.
 * `point` is `null` once every waypoint has been passed.
 *
 * A cursor (not a nearest-point projection) is deliberate: the folded
 * `adventure` cave recipe can bring two non-adjacent legs of the same route
 * geometrically closer to each other than `MIN_DISCONNECTED_CLEARANCE`
 * allows them to touch, so "which route point is nearest right now" is not
 * always "how far along the route the animal actually is". A plain index
 * has no such failure mode and is still trivially resumable after a threat/
 * combat interruption — it just stays wherever it was; it only needs to be
 * reset to `0` when a fresh leg of the journey starts (plan fauna-019 §6).
 * Never persisted (plan fauna-019 §10/§11): a fresh `AnimalAgent` after
 * reload simply restarts at `0`.
 *
 * @domain fauna
 */
export function advanceCaveRoute(
  route: readonly CaveTraversalPoint[],
  index: number,
  x: number,
  z: number,
  arrivalRadius: number,
): CaveRouteProgress {
  let i = index
  while (i < route.length) {
    const point = route[i]!
    if (Math.hypot(point.x - x, point.z - z) <= arrivalRadius) {
      i++
      continue
    }
    return { point, index: i }
  }
  return { point: null, index: i }
}
