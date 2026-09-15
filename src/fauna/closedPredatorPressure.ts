import type { AnimalKind } from './AnimalAgent'
import type { PreySpawner, SpawnerType } from './AnimalSpawner'
import { SETTLEMENT_CHARACTER_SALT } from '../settlement/settlementCharacter'
import { ANIMAL_DEFS } from './animalDefs'

/**
 * Radius (world units) around a closed settlement used to measure configured
 * predator pressure. Covers outskirts and nearby wilderness without spanning
 * a whole settlement-grid cell (`SETTLEMENT_GRID_STEP` is 280).
 *
 * @domain fauna
 */
export const CLOSED_PREDATOR_PRESSURE_RADIUS = 100

/**
 * Minimum local configured predator capacity for a closed settlement.
 * Calibrated as ~25% above a typical single wolf `rockDen` (maxPreyCount 2),
 * not as a multiplier applied to already-high natural pressure.
 */
const CLOSED_TARGET_CAPACITY = 3
/** At least one predator habitat — 30% more presence is the calibration of
 *  this floor, not a second den on every already-pressured site. */
const CLOSED_TARGET_PRESENCE = 1
const EXTRA_SPAWNER_CAPACITY = 2
const EXTRA_SPAWNER_KIND: AnimalKind = 'wolf'
const EXTRA_SPAWNER_TYPE: SpawnerType = 'rockDen'
const EXTRA_RESPAWN_INTERVAL_DAYS = 2

/**
 * A closed settlement whose surroundings may need predator-capacity fill.
 * `x`/`z` are the settlement site; extras are accounted at this point until
 * terrain placement runs.
 *
 * @domain fauna
 */
export type ClosedSettlementSite = {
  id: string
  x: number
  z: number
  footprintRadius: number
}

/** Configured spawn-point snapshot the pressure resolver reads — never live count. */
export type ConfiguredPredatorSpawner = {
  id: string
  x: number
  z: number
  type: SpawnerType
  kind: AnimalKind
  maxPreyCount: number
}

export type ClosedPressureCapacityBump = {
  id: string
  maxPreyCount: number
}

export type ClosedPressureExtraSpawner = {
  id: string
  x: number
  z: number
  footprintRadius: number
  type: SpawnerType
  kind: AnimalKind
  maxPreyCount: number
  respawnIntervalDays: number
}

export type ClosedPredatorPressurePlan = {
  capacityBumps: readonly ClosedPressureCapacityBump[]
  extraSpawners: readonly ClosedPressureExtraSpawner[]
}

function isPredatorKind(kind: AnimalKind): boolean {
  return ANIMAL_DEFS[kind].role === 'predator'
}

function isPressureSpawner(spawner: Pick<ConfiguredPredatorSpawner, 'kind'>): boolean {
  return isPredatorKind(spawner.kind)
}

function isAugmentable(spawner: Pick<ConfiguredPredatorSpawner, 'type' | 'kind'>): boolean {
  return isPressureSpawner(spawner) && spawner.type !== 'wolfDen'
}

function inRadius(
  spawner: Pick<ConfiguredPredatorSpawner, 'x' | 'z'>,
  site: ClosedSettlementSite,
): boolean {
  return Math.hypot(spawner.x - site.x, spawner.z - site.z) <= CLOSED_PREDATOR_PRESSURE_RADIUS
}

/**
 * Stable id for a closed-settlement pressure extra. Derived from settlement
 * identity + per-settlement slot, never an insertion-order counter.
 *
 * @domain fauna
 */
export function closedPressureSpawnerId(settlementId: string, slot: number): string {
  return `${settlementId}:closed-pressure:${slot}`
}

function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Dedicated placement seed for one closed-pressure extra. Independent of the
 * fauna construction RNG so extra dens do not reshuffle ordinary habitat.
 *
 * @domain fauna
 */
export function closedPressurePlacementSeed(worldSeed: number, extraId: string): number {
  return (worldSeed ^ SETTLEMENT_CHARACTER_SALT ^ hashId(extraId)) >>> 0
}

function compareId(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Generation-time configured predator-pressure fill for closed settlements.
 * Counts `maxPreyCount` of predator-compatible spawners (including `wolfDen`
 * as natural pressure) inside {@link CLOSED_PREDATOR_PRESSURE_RADIUS}. Adds
 * only the local deficit versus a closed minimum target; overlapping closed
 * settlements do not stack. Never reads live animal counts. Does not mutate
 * `wolfDen` quest/scenario spawners.
 *
 * @domain fauna
 */
export function resolveClosedPredatorPressure(
  existing: readonly ConfiguredPredatorSpawner[],
  closedSettlements: readonly ClosedSettlementSite[],
): ClosedPredatorPressurePlan {
  const originalIds = new Set(existing.map((spawner) => spawner.id))
  const working: ConfiguredPredatorSpawner[] = existing.map((spawner) => ({ ...spawner }))
  const bumpById = new Map<string, number>()
  const extraSpawners: ClosedPressureExtraSpawner[] = []
  const extraSlots = new Map<string, number>()

  const sites = [...closedSettlements].sort((a, b) => compareId(a.id, b.id))
  for (const site of sites) {
    const originalNearby = existing.filter((spawner) => isPressureSpawner(spawner) && inRadius(spawner, site))
    const naturalCapacity = originalNearby.reduce((sum, spawner) => sum + spawner.maxPreyCount, 0)
    const naturalPresence = originalNearby.length
    const targetCapacity = Math.max(naturalCapacity, CLOSED_TARGET_CAPACITY)
    const targetPresence = Math.max(naturalPresence, CLOSED_TARGET_PRESENCE)

    const currentNearby = (): ConfiguredPredatorSpawner[] =>
      working.filter((spawner) => isPressureSpawner(spawner) && inRadius(spawner, site))

    const addExtra = (capacity: number): void => {
      const slot = extraSlots.get(site.id) ?? 0
      extraSlots.set(site.id, slot + 1)
      const extra: ClosedPressureExtraSpawner = {
        id: closedPressureSpawnerId(site.id, slot),
        x: site.x,
        z: site.z,
        footprintRadius: site.footprintRadius,
        type: EXTRA_SPAWNER_TYPE,
        kind: EXTRA_SPAWNER_KIND,
        maxPreyCount: capacity,
        respawnIntervalDays: EXTRA_RESPAWN_INTERVAL_DAYS,
      }
      extraSpawners.push(extra)
      working.push(extra)
    }

    let remainingPresence = Math.max(0, targetPresence - currentNearby().length)
    let remainingCapacity = Math.max(
      0,
      targetCapacity - currentNearby().reduce((sum, spawner) => sum + spawner.maxPreyCount, 0),
    )

    while (remainingPresence > 0) {
      const capacity = Math.min(EXTRA_SPAWNER_CAPACITY, Math.max(remainingCapacity, 1))
      addExtra(capacity)
      remainingPresence--
      remainingCapacity = Math.max(0, remainingCapacity - capacity)
    }

    if (remainingCapacity > 0) {
      const augmentable = currentNearby()
        .filter(isAugmentable)
        .sort((a, b) => compareId(a.id, b.id))
      const target = augmentable[0]
      if (target) {
        target.maxPreyCount += remainingCapacity
        if (originalIds.has(target.id)) bumpById.set(target.id, target.maxPreyCount)
        remainingCapacity = 0
      }
    }

    while (remainingCapacity > 0) {
      const capacity = Math.min(EXTRA_SPAWNER_CAPACITY, remainingCapacity)
      addExtra(capacity)
      remainingCapacity -= capacity
    }
  }

  const capacityBumps: ClosedPressureCapacityBump[] = [...bumpById.entries()]
    .sort(([a], [b]) => compareId(a, b))
    .map(([id, maxPreyCount]) => ({ id, maxPreyCount }))
  return { capacityBumps, extraSpawners }
}

/** True when a live `PreySpawner` may receive a closed-pressure capacity bump. */
export function canBumpClosedPressureSpawner(spawner: Pick<PreySpawner, 'type' | 'kind'>): boolean {
  return isAugmentable(spawner)
}
