import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { placeOnGround } from '../settlement/props'
import { createPlacedTentProp, disposePlacedTentProp } from './tentProp'

export type PlacedTent = { id: string, x: number, z: number, yaw: number }

export type PlacedTentEntry = PlacedTent & { mesh: Object3D }

export type PlacedTents = {
  list: () => readonly PlacedTentEntry[]
  nodes: () => readonly PlacedTent[]
  place: (x: number, z: number, yaw: number) => PlacedTent
  pack: (id: string) => PlacedTent | null
  dispose: () => void
}

let nextTentId = 0

/**
 * Player-pitched tents — same persistence idea as `PlacedFires`: positions
 * are chosen by the player, so the full record round-trips through the save.
 */
export function createPlacedTents(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly PlacedTent[] = [],
): PlacedTents {
  const tents: PlacedTentEntry[] = []

  const spawn = (record: PlacedTent): void => {
    const mesh = createPlacedTentProp()
    // TEMP: isolation test — props/tree subgroups
    mesh.name = 'placed-tent'
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    tents.push({ ...record, mesh })
  }

  for (const tent of initial) spawn(tent)

  return {
    list: () => tents,
    nodes: () => tents.map(({ id, x, z, yaw }) => ({ id, x, z, yaw })),
    place(x, z, yaw) {
      const record: PlacedTent = { id: `tent:${Date.now()}:${nextTentId++}`, x, z, yaw }
      spawn(record)
      return record
    },
    pack(id) {
      const index = tents.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const [entry] = tents.splice(index, 1)
      if (!entry) return null
      disposePlacedTentProp(entry.mesh)
      return { id: entry.id, x: entry.x, z: entry.z, yaw: entry.yaw }
    },
    dispose() {
      for (const tent of tents) disposePlacedTentProp(tent.mesh)
      tents.length = 0
    },
  }
}
