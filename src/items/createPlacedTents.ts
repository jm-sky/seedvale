import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { placeOnGround } from '../settlement/props'
import { CONDITION_MAX } from '../world/condition'
import {
  resolveWeatherDrivenCondition,
  SLEEPING_UTILITY_SIM_WINDOW_DAYS,
} from '../world/sleepingUtilities'
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
}

export type PlacedTentEntry = PlacedTent & { mesh: Object3D }

export type PlacedTents = {
  list: () => readonly PlacedTentEntry[]
  nodes: () => readonly PlacedTent[]
  place: (x: number, z: number, yaw: number, worldDays: number) => PlacedTent
  pack: (id: string) => PlacedTent | null
  /** Resolved current condition, or `null` if `id` no longer exists. Tents
   *  are never sheltered by another tent — they degrade from direct rain/snow. */
  conditionOf: (id: string, worldDays: number) => number | null
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
  }
}

/**
 * Player-pitched tents — same persistence idea as `PlacedFires`: positions
 * are chosen by the player, so the full record round-trips through the save.
 * Condition is lazy-resolved from the persisted anchor + weather, never
 * ticked per frame (plan items-player-018).
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

  return {
    list: () => tents,
    nodes: () => tents.map(tentRecord),
    place(x, z, yaw, worldDays) {
      const record: PlacedTent = {
        id: `tent:${Date.now()}:${nextTentId++}`,
        x,
        z,
        yaw,
        condition: TENT_CONDITION_MAX,
        lastConditionUpdateAtDays: worldDays,
      }
      spawn(record)
      return record
    },
    pack(id) {
      const index = tents.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const [entry] = tents.splice(index, 1)
      if (!entry) return null
      disposePlacedTentProp(entry.mesh)
      return tentRecord(entry)
    },
    conditionOf(id, worldDays) {
      const entry = tents.find((tent) => tent.id === id)
      if (!entry) return null
      return resolveWeatherDrivenCondition(entry, seed, worldDays, 0, {
        rainDecayPerDay: TENT_RAIN_DECAY_PER_DAY,
        snowDecayPerDay: TENT_SNOW_DECAY_PER_DAY,
        simWindowDays: SLEEPING_UTILITY_SIM_WINDOW_DAYS,
      })
    },
    dispose() {
      for (const tent of tents) disposePlacedTentProp(tent.mesh)
      tents.length = 0
    },
  }
}
