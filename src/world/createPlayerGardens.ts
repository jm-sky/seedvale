import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { Collider } from './collision'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { createGardenPlotProp } from './gardenPlotProp'
import {
  applyCultivationMaintenance,
  CARE_REMOVAL_THRESHOLD,
  GARDEN_FOOTPRINT_RADIUS,
  type PlayerGardenRecord,
  resolveCultivationCare,
} from './playerGarden'

export type PlayerGardenEntry = PlayerGardenRecord & { mesh: Object3D }

export type PlayerGardens = {
  list: () => readonly PlayerGardenEntry[]
  nodes: () => readonly PlayerGardenRecord[]
  /** Places a new, immediately-usable garden plot at `(x, z)` (plan 174 §1) —
   *  unlike a well there is no multi-stage active-work construction: the
   *  plot exists the moment the placement busy channel completes. Starts
   *  fully maintained (plan 176 §4), anchored at `worldDays`. */
  place: (x: number, z: number, yaw: number, worldDays: number) => PlayerGardenRecord
  /** Resolved current care (plan 176 §5), or `null` if `id` no longer
   *  exists. */
  careOf: (id: string, worldDays: number) => number | null
  /** Applies maintenance (plan 176 §4/§10) and returns the new resolved
   *  care, or `null` if `id` no longer exists — the caller (a busy-channel
   *  completion) must revalidate before mutating, never trust a stale id. */
  applyMaintenance: (id: string, worldDays: number) => number | null
  /** Removes any plot whose resolved care has reached the removal threshold
   *  (plan 176 §6/§20) — bounded to this list's own size (player-built
   *  plots only), never a world-wide scan. */
  pruneDecayed: (worldDays: number) => void
  dispose: () => void
}

const colliderKey = (id: string): string => `playerGarden:${id}`

let nextGardenId = 0

/**
 * Player-built garden plots (plan 174, maintenance state plan 176) — same
 * "player chose the spot, whole record round-trips through the save" shape
 * as `PlacedTents`/`PlayerWells`. A plot is a plain world object: no
 * reference to `PlayerController`, no `GardenManager`. Registers a collider
 * through the shared `ColliderRegistry` (same mechanism `PlayerWells` uses)
 * so NPC pathing routes around it.
 */
export function createPlayerGardens(
  scene: Scene,
  sampleHeight: HeightSampler,
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  initial: readonly PlayerGardenRecord[] = [],
  worldDays = 0,
): PlayerGardens {
  const gardens: PlayerGardenEntry[] = []

  const spawn = (record: PlayerGardenRecord): PlayerGardenEntry => {
    const mesh = createGardenPlotProp()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    registerColliders(colliderKey(record.id), [{ x: record.x, z: record.z, radius: GARDEN_FOOTPRINT_RADIUS }])
    const entry: PlayerGardenEntry = { ...record, mesh }
    gardens.push(entry)
    return entry
  }

  const removeEntry = (entry: PlayerGardenEntry): void => {
    disposeObject3D(entry.mesh)
    entry.mesh.removeFromParent()
    clearColliders(colliderKey(entry.id))
    const index = gardens.indexOf(entry)
    if (index >= 0) gardens.splice(index, 1)
  }

  // Plan 176 §21 — a plot that decayed past the removal threshold while
  // unloaded (or across a session gap) is dropped here instead of spawning
  // and then reappearing until the next lazy resolution.
  for (const record of initial) {
    if (resolveCultivationCare(record, worldDays) <= CARE_REMOVAL_THRESHOLD) continue
    spawn(record)
  }

  return {
    list: () => gardens,
    nodes: () => gardens.map(({ id, x, z, yaw, care, lastMaintainedAtDays }) => ({ id, x, z, yaw, care, lastMaintainedAtDays })),
    place(x, z, yaw, placedAtDays) {
      const record: PlayerGardenRecord = {
        id: `garden:${Date.now()}:${nextGardenId++}`,
        x,
        z,
        yaw,
        care: 100,
        lastMaintainedAtDays: placedAtDays,
      }
      spawn(record)
      return record
    },
    careOf(id, days) {
      const entry = gardens.find((g) => g.id === id)
      return entry ? resolveCultivationCare(entry, days) : null
    },
    applyMaintenance(id, days) {
      const entry = gardens.find((g) => g.id === id)
      if (!entry) return null
      const next = applyCultivationMaintenance(entry, days)
      entry.care = next.care
      entry.lastMaintainedAtDays = next.lastMaintainedAtDays
      return next.care
    },
    pruneDecayed(days) {
      for (const entry of [...gardens]) {
        if (resolveCultivationCare(entry, days) <= CARE_REMOVAL_THRESHOLD) removeEntry(entry)
      }
    },
    dispose() {
      for (const entry of [...gardens]) removeEntry(entry)
    },
  }
}
