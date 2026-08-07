import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { createItemMesh, type ItemKind } from './items'

export type DroppedItem = {
  id: string
  kind: ItemKind
  x: number
  z: number
}

export type DroppedItems = {
  nodes: () => readonly DroppedItem[]
  /** Places one unit of `kind` at (x, z) as a new pickup, world-persistent
   *  (unlike the renewable spawner pool, dropped items don't respawn — once
   *  collected they're gone for good, same as world-generated ones). */
  drop: (kind: ItemKind, x: number, z: number) => void
  /** Removes a dropped item's mesh and record; null if `id` isn't known. */
  collect: (id: string) => { kind: ItemKind, x: number, z: number } | null
  dispose: () => void
}

let nextDropId = 0

/** Player-placed pickups — the "throw it back into the world" counterpart to
 *  `terrain/chunkItems.ts` (world-generated) and `ItemSpawner.ts` (renewable).
 *  Unlike those, positions here aren't derivable from the seed, so the full
 *  record (not just a collected-id set) has to round-trip through the save. */
export function createDroppedItems(
  scene: Scene,
  sampleHeight: HeightSampler,
  initial: readonly DroppedItem[] = [],
): DroppedItems {
  const items: DroppedItem[] = []
  const meshes = new Map<string, Object3D>()

  const spawnMesh = (item: DroppedItem): void => {
    const mesh = createItemMesh(item.kind)
    placeOnGround(mesh, item.x, item.z, sampleHeight)
    scene.add(mesh)
    meshes.set(item.id, mesh)
  }

  for (const item of initial) {
    items.push(item)
    spawnMesh(item)
  }

  return {
    nodes: () => items,
    drop(kind, x, z) {
      const item: DroppedItem = { id: `drop:${Date.now()}:${nextDropId++}`, kind, x, z }
      items.push(item)
      spawnMesh(item)
    },
    collect(id) {
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) return null
      const [item] = items.splice(index, 1)
      const mesh = meshes.get(id)
      if (mesh) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
        meshes.delete(id)
      }
      return { kind: item!.kind, x: item!.x, z: item!.z }
    },
    dispose() {
      for (const mesh of meshes.values()) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }
      meshes.clear()
      items.length = 0
    },
  }
}
