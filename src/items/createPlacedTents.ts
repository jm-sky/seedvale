import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { RepairProgress } from '../world/repair'
import type { MaterialRequirement } from './constructionMaterials'
import type { ItemCapability } from './itemCatalog'
import { placeOnGround } from '../settlement/props'
import { CONDITION_MAX } from '../world/condition'
import {
  resolveWeatherDrivenCondition,
  SLEEPING_UTILITY_SIM_WINDOW_DAYS,
} from '../world/sleepingUtilities'
import {
  applyCampRepairWork,
  beginCampRepair,
  type CampRepairStartOutcome,
  hasActiveCampRepair,
} from './campRepair'
import { createPlacedTentProp, disposePlacedTentProp } from './tentProp'

export type PlacedTent = {
  id: string
  x: number
  z: number
  yaw: number
  /** 0..100 — lazy weather-driven condition (plan items-player-018). Owned
   *  by this world record, never derived from the camera or a per-frame tick.
   *  `0` does not auto-remove the tent. */
  condition: number
  lastConditionUpdateAtDays: number
  /** Active repair episode (plan items-player-019). Frozen degradation while set. */
  repair?: RepairProgress
}

export type PlacedTentEntry = PlacedTent & { mesh: Object3D }

export type TentPackResult =
  | { status: 'packed', tent: PlacedTent }
  | { status: 'blocked' }
  | { status: 'missing' }

export type PlacedTents = {
  list: () => readonly PlacedTentEntry[]
  nodes: () => readonly PlacedTent[]
  get: (id: string) => PlacedTent | null
  place: (
    x: number,
    z: number,
    yaw: number,
    worldDays: number,
    from?: { id: string, condition: number },
  ) => PlacedTent
  pack: (id: string, nowDays: number) => TentPackResult
  /** Resolved current condition, or `null` if `id` no longer exists. Tents
   *  are never sheltered by another tent — they degrade from direct rain/snow.
   *  Active repair freezes degradation at the checkpointed condition. */
  conditionOf: (id: string, worldDays: number) => number | null
  startRepair: (
    id: string,
    nowDays: number,
    hasCapability: (capability: ItemCapability) => boolean,
    hasMaterial: (requirement: MaterialRequirement) => boolean,
    consumeMaterial: (requirement: MaterialRequirement) => void,
  ) => CampRepairStartOutcome
  contributeRepairWork: (id: string, workAmount: number, nowDays: number) => number
  dispose: () => void
}

/** Tent rain/snow decay on the same scale as sleeping-utility rates, but
 *  slower — a tent is more weather-resistant than an exposed bedroll
 *  (plan items-player-018). */
export const TENT_RAIN_DECAY_PER_DAY = 10
export const TENT_SNOW_DECAY_PER_DAY = 8
export const TENT_CONDITION_MAX = CONDITION_MAX

let nextTentId = 0

function tentRecord(entry: PlacedTentEntry): PlacedTent {
  return {
    id: entry.id,
    x: entry.x,
    z: entry.z,
    yaw: entry.yaw,
    condition: entry.condition,
    lastConditionUpdateAtDays: entry.lastConditionUpdateAtDays,
    ...(entry.repair
      ? {
          repair: {
            startedCondition: entry.repair.startedCondition,
            targetCondition: entry.repair.targetCondition,
            requiredWork: entry.repair.requiredWork,
            completedWork: entry.repair.completedWork,
          },
        }
      : {}),
  }
}

/**
 * Player-pitched tents — same persistence idea as `PlacedFires`: positions
 * are chosen by the player, so the full record round-trips through the save.
 * Condition is lazy-resolved from the persisted anchor + weather, never
 * ticked per frame (plan items-player-018). Repair episodes live on the
 * world record (plan items-player-019).
 *
 * @domain items-player
 */
export function createPlacedTents(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly PlacedTent[] = [],
  seed = 0,
): PlacedTents {
  const tents: PlacedTentEntry[] = []

  const spawn = (record: PlacedTent): void => {
    const mesh = createPlacedTentProp()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    tents.push({ ...record, mesh })
  }

  for (const tent of initial) spawn(tent)

  const find = (id: string): PlacedTentEntry | undefined => tents.find((entry) => entry.id === id)

  const resolveCondition = (entry: PlacedTentEntry, worldDays: number): number => {
    if (hasActiveCampRepair(entry)) return entry.condition
    return resolveWeatherDrivenCondition(entry, seed, worldDays, 0, {
      rainDecayPerDay: TENT_RAIN_DECAY_PER_DAY,
      snowDecayPerDay: TENT_SNOW_DECAY_PER_DAY,
      simWindowDays: SLEEPING_UTILITY_SIM_WINDOW_DAYS,
    })
  }

  return {
    list: () => tents,
    nodes: () => tents.map(tentRecord),
    get(id) {
      const entry = find(id)
      return entry ? tentRecord(entry) : null
    },
    place(x, z, yaw, worldDays, from) {
      const record: PlacedTent = {
        id: from?.id ?? `tent:${Date.now()}:${nextTentId++}`,
        x,
        z,
        yaw,
        condition: from ? from.condition : TENT_CONDITION_MAX,
        lastConditionUpdateAtDays: worldDays,
      }
      spawn(record)
      return record
    },
    pack(id, nowDays) {
      const index = tents.findIndex((entry) => entry.id === id)
      if (index === -1) return { status: 'missing' }
      const entry = tents[index]
      if (!entry) return { status: 'missing' }
      if (hasActiveCampRepair(entry)) return { status: 'blocked' }
      entry.condition = resolveCondition(entry, nowDays)
      entry.lastConditionUpdateAtDays = nowDays
      tents.splice(index, 1)
      disposePlacedTentProp(entry.mesh)
      return { status: 'packed', tent: tentRecord(entry) }
    },
    conditionOf(id, worldDays) {
      const entry = find(id)
      if (!entry) return null
      return resolveCondition(entry, worldDays)
    },
    startRepair(id, nowDays, hasCapability, hasMaterial, consumeMaterial) {
      const entry = find(id)
      if (!entry) return { status: 'unavailable' }
      const outcome = beginCampRepair({
        kind: 'tent',
        currentCondition: resolveCondition(entry, nowDays),
        nowDays,
        hasActiveRepair: hasActiveCampRepair(entry),
        hasCapability,
        hasMaterial,
        consumeMaterial,
      })
      if (outcome.status !== 'started') return outcome
      entry.condition = outcome.condition
      entry.lastConditionUpdateAtDays = outcome.lastConditionUpdateAtDays
      entry.repair = outcome.progress
      return outcome
    },
    contributeRepairWork(id, workAmount, nowDays) {
      const entry = find(id)
      if (!entry) return 0
      const { record, acceptedWork } = applyCampRepairWork(tentRecord(entry), workAmount, nowDays)
      entry.condition = record.condition
      entry.lastConditionUpdateAtDays = record.lastConditionUpdateAtDays
      if (record.repair) entry.repair = record.repair
      else delete entry.repair
      return acceptedWork
    },
    dispose() {
      for (const tent of tents) disposePlacedTentProp(tent.mesh)
      tents.length = 0
    },
  }
}
