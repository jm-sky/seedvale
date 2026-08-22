import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { Collider } from './collision'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { createGardenPlotProp } from './gardenPlotProp'
import { GARDEN_FOOTPRINT_RADIUS, type PlayerGardenRecord } from './playerGarden'

export type PlayerGardenEntry = PlayerGardenRecord & { mesh: Object3D }

export type PlayerGardens = {
  list: () => readonly PlayerGardenEntry[]
  nodes: () => readonly PlayerGardenRecord[]
  /** Places a new, immediately-usable garden plot at `(x, z)` (plan 174 §1) —
   *  unlike a well there is no multi-stage active-work construction: the
   *  plot exists the moment the placement busy channel completes. */
  place: (x: number, z: number, yaw: number) => PlayerGardenRecord
  dispose: () => void
}

const colliderKey = (id: string): string => `playerGarden:${id}`

let nextGardenId = 0

/**
 * Player-built garden plots (plan 174) — same "player chose the spot, whole
 * record round-trips through the save" shape as `PlacedTents`/`PlayerWells`.
 * A plot is a plain world object: no reference to `PlayerController`, no
 * `GardenManager`. Registers a collider through the shared `ColliderRegistry`
 * (same mechanism `PlayerWells` uses) so NPC pathing routes around it.
 */
export function createPlayerGardens(
  scene: Scene,
  sampleHeight: HeightSampler,
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  initial: readonly PlayerGardenRecord[] = [],
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

  for (const record of initial) spawn(record)

  return {
    list: () => gardens,
    nodes: () => gardens.map(({ id, x, z, yaw }) => ({ id, x, z, yaw })),
    place(x, z, yaw) {
      const record: PlayerGardenRecord = { id: `garden:${Date.now()}:${nextGardenId++}`, x, z, yaw }
      spawn(record)
      return record
    },
    dispose() {
      for (const entry of gardens) {
        disposeObject3D(entry.mesh)
        entry.mesh.removeFromParent()
        clearColliders(colliderKey(entry.id))
      }
      gardens.length = 0
    },
  }
}
