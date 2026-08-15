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
  /** Advances items still in flight (plan 097 phase 2.1). Landed items cost
   *  nothing — only entries in `falling` are touched. */
  tick: (dt: number) => void
  dispose: () => void
}

let nextDropId = 0

/** Hand/waist height a freshly dropped item starts at, before gravity takes
 *  over — replaces the old instant teleport onto the ground. */
const DROP_SPAWN_HEIGHT = 0.9
const GRAVITY = 20

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
  // Items still airborne — landed items (the common case) aren't tracked here
  // and cost nothing per tick, same as today. Flight isn't persisted: `x/z`
  // don't change while falling (no throw arc in v1) and a save mid-flight
  // just resumes landed, a sub-second, sub-metre visual difference.
  const falling = new Map<string, { vy: number }>()

  const spawnMesh = (item: DroppedItem, yOffset = 0): void => {
    const mesh = createItemMesh(item.kind)
    // TEMP: isolation test — props/tree subgroups
    mesh.name = 'dropped-item'
    placeOnGround(mesh, item.x, item.z, sampleHeight, yOffset)
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
      spawnMesh(item, DROP_SPAWN_HEIGHT)
      falling.set(item.id, { vy: 0 })
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
      falling.delete(id)
      return { kind: item!.kind, x: item!.x, z: item!.z }
    },
    tick(dt) {
      if (falling.size === 0) return
      for (const [id, state] of falling) {
        const item = items.find((it) => it.id === id)
        const mesh = meshes.get(id)
        if (!item || !mesh) {
          falling.delete(id)
          continue
        }
        state.vy -= GRAVITY * dt
        const groundY = sampleHeight(item.x, item.z)
        const candidateY = mesh.position.y + state.vy * dt
        if (candidateY <= groundY) {
          mesh.position.y = groundY
          falling.delete(id)
        } else {
          mesh.position.y = candidateY
        }
      }
    },
    dispose() {
      for (const mesh of meshes.values()) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }
      meshes.clear()
      items.length = 0
      falling.clear()
    },
  }
}
