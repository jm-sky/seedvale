import { ANIMAL_DEFS, type AnimalKind } from './animalDefs'
import {
  depletionThreshold,
  type PreySpawner,
  type SpawnPointState,
} from './AnimalSpawner'
import { ordinaryHabitatCapacity } from './persistentOccupants'
import { effectiveMaxPreyCount } from './wolfDenScenario'

/**
 * @domain fauna
 * Derived, read-only habitat condition for one managed `PreySpawner`.
 * Not authoritative state, not persisted, and not a second ecosystem sim
 * (plan fauna-031).
 */
export type HabitatPressureKind =
  | 'population-loss'
  | 'mortality'
  | 'predators'
  | 'food-shortage'

export type HabitatPressureCondition = 'healthy' | 'strained' | 'critical'

export type HabitatPressureSnapshot = {
  habitatId: string
  kind: AnimalKind
  population: {
    live: number
    capacity: number
    ratio: number
    pressure: number
  }
  mortality: {
    deathsThisCycle: number
    threshold: number
    pressure: number
  }
  predators: {
    nearby: number
    pressure: number
  }
  food: {
    available: number
    pressure: number
  }
  condition: HabitatPressureCondition
  dominantPressure: HabitatPressureKind | null
}

/** World-time freshness window — one in-game hour. */
export const HABITAT_PRESSURE_TTL_DAYS = 1 / 24

/** Habitat-local forage query radius (m), near managed-spawner locality. */
export const HABITAT_FOOD_PRESSURE_RADIUS = 12

/** Nearby-predator count radius (m) around the habitat center. */
export const HABITAT_PREDATOR_PRESSURE_RADIUS = 24

/** Predator count that saturates predator pressure at 1. */
export const HABITAT_PREDATOR_PRESSURE_FULL_COUNT = 3

/** Available grass patches that count as sufficient habitat forage. */
export const HABITAT_FOOD_SUFFICIENT_COUNT = 4

export const HABITAT_PRESSURE_STRAINED_AT = 0.35
export const HABITAT_PRESSURE_CRITICAL_AT = 0.7

/**
 * Tie-break order when two component pressures share the same value —
 * earlier wins. Deterministic; no RNG.
 */
export const HABITAT_PRESSURE_TIE_ORDER: readonly HabitatPressureKind[] = [
  'mortality',
  'population-loss',
  'predators',
  'food-shortage',
]

export type HabitatPressureCacheEntry = {
  atDays: number
  snapshot: HabitatPressureSnapshot
}

/** Duck-typed live animal for one uncached agent pass — no Three.js import. */
export type HabitatPressureScanAgent = {
  isDead(): boolean
  spawnPointId?: string
  def: { kind: AnimalKind }
  mesh: { position: { x: number; z: number } }
}

export type HabitatPressureScoreInput = {
  habitatId: string
  kind: AnimalKind
  state: SpawnPointState
  live: number
  capacity: number
  deathsThisCycle: number
  mortalityThreshold: number
  nearbyPredators: number
  /** `null` when grass forage does not apply (no grass diet, or no service). */
  forageAvailable: number | null
}

function clamp01(n: number): number {
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

function populationSignal(live: number, capacity: number): { ratio: number; pressure: number } {
  if (capacity <= 0) {
    // All ordinary capacity reserved: not an empty-habitat catastrophe.
    return { ratio: 1, pressure: 0 }
  }
  const ratio = clamp01(live / capacity)
  return { ratio, pressure: 1 - ratio }
}

function conditionFrom(
  maxPressure: number,
  state: SpawnPointState,
): HabitatPressureCondition {
  let condition: HabitatPressureCondition = 'healthy'
  if (maxPressure >= HABITAT_PRESSURE_CRITICAL_AT) condition = 'critical'
  else if (maxPressure >= HABITAT_PRESSURE_STRAINED_AT) condition = 'strained'

  if (state === 'depleted' || state === 'disabled') return 'critical'
  if (state === 'recovering' && condition === 'healthy') return 'strained'
  return condition
}

/**
 * Pure habitat-pressure scoring from primitive inputs.
 *
 * @domain fauna
 */
export function scoreHabitatPressure(input: HabitatPressureScoreInput): HabitatPressureSnapshot {
  const population = populationSignal(input.live, input.capacity)
  const mortalityPressure = input.mortalityThreshold <= 0
    ? 0
    : clamp01(input.deathsThisCycle / input.mortalityThreshold)
  const predatorPressure = clamp01(
    input.nearbyPredators / HABITAT_PREDATOR_PRESSURE_FULL_COUNT,
  )
  const foodAvailable = input.forageAvailable ?? 0
  const foodPressure = input.forageAvailable == null
    ? 0
    : 1 - clamp01(foodAvailable / HABITAT_FOOD_SUFFICIENT_COUNT)

  const values: Record<HabitatPressureKind, number> = {
    mortality: mortalityPressure,
    'population-loss': population.pressure,
    predators: predatorPressure,
    'food-shortage': foodPressure,
  }

  let maxPressure = 0
  for (const kind of HABITAT_PRESSURE_TIE_ORDER) {
    if (values[kind] > maxPressure) maxPressure = values[kind]
  }

  const condition = conditionFrom(maxPressure, input.state)

  let dominantPressure: HabitatPressureKind | null = null
  if (condition !== 'healthy') {
    let best = -1
    for (const kind of HABITAT_PRESSURE_TIE_ORDER) {
      const value = values[kind]
      if (value < HABITAT_PRESSURE_STRAINED_AT) continue
      if (value > best) {
        best = value
        dominantPressure = kind
      }
    }
  }

  return {
    habitatId: input.habitatId,
    kind: input.kind,
    population: {
      live: input.live,
      capacity: input.capacity,
      ratio: population.ratio,
      pressure: population.pressure,
    },
    mortality: {
      deathsThisCycle: input.deathsThisCycle,
      threshold: input.mortalityThreshold,
      pressure: mortalityPressure,
    },
    predators: {
      nearby: input.nearbyPredators,
      pressure: predatorPressure,
    },
    food: {
      available: foodAvailable,
      pressure: foodPressure,
    },
    condition,
    dominantPressure,
  }
}

/** Cache is fresh only when time moved forward and stays inside the TTL. */
export function isHabitatPressureCacheFresh(
  atDays: number,
  nowDays: number,
  ttlDays = HABITAT_PRESSURE_TTL_DAYS,
): boolean {
  return nowDays >= atDays && nowDays - atDays < ttlDays
}

const PREDATOR_RADIUS_SQ =
  HABITAT_PREDATOR_PRESSURE_RADIUS * HABITAT_PREDATOR_PRESSURE_RADIUS

/**
 * One linear pass over live wild agents: habitat members + nearby predators.
 *
 * @domain fauna
 */
export function scanHabitatPressureAgents(
  agents: Iterable<HabitatPressureScanAgent>,
  habitatId: string,
  habitatKind: AnimalKind,
  originX: number,
  originZ: number,
): { live: number; nearbyPredators: number } {
  let live = 0
  let nearbyPredators = 0
  for (const agent of agents) {
    if (agent.isDead()) continue
    if (agent.spawnPointId === habitatId && agent.def.kind === habitatKind) live++
    if (ANIMAL_DEFS[agent.def.kind].role !== 'predator') continue
    if (agent.spawnPointId === habitatId) continue
    const dx = agent.mesh.position.x - originX
    const dz = agent.mesh.position.z - originZ
    if (dx * dx + dz * dz <= PREDATOR_RADIUS_SQ) nearbyPredators++
  }
  return { live, nearbyPredators }
}

export type HabitatPressureResolveArgs = {
  spawnerId: string
  nowDays: number
  cache: Map<string, HabitatPressureCacheEntry>
  getSpawner: (id: string) => PreySpawner | undefined
  agents: Iterable<HabitatPressureScanAgent>
  slotCountFor: (habitatId: string) => number
  queryForage?: (x: number, z: number, radius: number, nowDays: number) => { readonly length: number }
}

/**
 * Lazy habitat-pressure lookup: unknown id returns `null` with no scans;
 * a fresh cache hit returns the stored snapshot; otherwise one agent pass
 * and at most one bounded forage query.
 *
 * @domain fauna
 */
export function resolveHabitatPressure(
  args: HabitatPressureResolveArgs,
): HabitatPressureSnapshot | null {
  const spawner = args.getSpawner(args.spawnerId)
  if (!spawner) return null

  const cached = args.cache.get(args.spawnerId)
  if (cached && isHabitatPressureCacheFresh(cached.atDays, args.nowDays)) {
    return cached.snapshot
  }

  const effectiveMax = effectiveMaxPreyCount(spawner)
  const capacity = ordinaryHabitatCapacity(
    effectiveMax,
    args.slotCountFor(spawner.id),
  )
  const { live, nearbyPredators } = scanHabitatPressureAgents(
    args.agents,
    spawner.id,
    spawner.kind,
    spawner.x,
    spawner.z,
  )

  const hasGrassDiet = ANIMAL_DEFS[spawner.kind].diet?.grass != null
  let forageAvailable: number | null = null
  if (hasGrassDiet && args.queryForage) {
    forageAvailable = args.queryForage(
      spawner.x,
      spawner.z,
      HABITAT_FOOD_PRESSURE_RADIUS,
      args.nowDays,
    ).length
  }

  const snapshot = scoreHabitatPressure({
    habitatId: spawner.id,
    kind: spawner.kind,
    state: spawner.state,
    live,
    capacity,
    deathsThisCycle: spawner.deathsThisCycle,
    mortalityThreshold: depletionThreshold(effectiveMax),
    nearbyPredators,
    forageAvailable,
  })
  args.cache.set(args.spawnerId, { atDays: args.nowDays, snapshot })
  return snapshot
}
