import { type Object3D, type Scene, Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSeededRandom } from '../world/parseSeed'
import { createItemMesh, ITEM_DEFS, type ItemKind } from './items'
import { type ItemSpawnPoint, updateItemSpawnPoints } from './ItemSpawner'

export type ItemSpawners = {
  nodes: () => readonly ItemSpawnPoint[]
  /** Removes the pickup mesh and marks the point collected; null if already
   *  collected or `id` doesn't match a known point. */
  collect: (id: string) => { kind: ItemKind; x: number; z: number } | null
  update: (dt: number, observerPos: Vector3) => void
  dispose: () => void
}

/** One renewable pickup per kind, close to the settlement — a reliable fallback
 *  source for quests regardless of whether world-generated coast/mountain items
 *  (`terrain/chunkItems.ts`) happened to land nearby this seed. */
const SPAWN_SPECS: { kind: ItemKind, respawnTime: number }[] = [
  { kind: 'stone', respawnTime: 100 },
  { kind: 'shell', respawnTime: 90 },
]

export function createItemSpawners(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  homeRadius: number,
  settlementCenter: Vector3,
  seed: number,
): ItemSpawners {
  const random = createSeededRandom(seed ^ 0x17ea)
  const points: ItemSpawnPoint[] = []
  const meshes: (Object3D | null)[] = []
  const labels: { object: CSS2DObject, el: HTMLDivElement }[] = []

  const findWalkableNear = (
    cx: number,
    cz: number,
    minDist: number,
    maxDist: number,
  ): { x: number, z: number } | null => {
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = minDist + random() * (maxDist - minDist)
      const x = cx + Math.cos(angle) * dist
      const z = cz + Math.sin(angle) * dist
      if (Math.abs(x) > homeRadius - 4 || Math.abs(z) > homeRadius - 4) continue
      if (sampleHeight(x, z) <= waterLevel + 0.6) continue
      return { x, z }
    }
    return null
  }

  const spawnMeshAt = (index: number): void => {
    const p = points[index]!
    const mesh = createItemMesh(p.kind)
    placeOnGround(mesh, p.x, p.z, sampleHeight)
    scene.add(mesh)
    meshes[index] = mesh
  }

  for (const spec of SPAWN_SPECS) {
    const pos = findWalkableNear(settlementCenter.x, settlementCenter.z, 20, 42)
    if (!pos) continue
    const index = points.length
    points.push({
      id: `spawner:${index}`,
      x: pos.x,
      z: pos.z,
      kind: spec.kind,
      respawnTime: spec.respawnTime,
      timeSinceCollected: 0,
      collected: false,
    })
    meshes.push(null)
    spawnMeshAt(index)

    const el = document.createElement('div')
    el.className = 'npc-label'
    el.textContent = ITEM_DEFS[spec.kind].label
    const label = new CSS2DObject(el)
    label.position.set(pos.x, sampleHeight(pos.x, pos.z) + 0.4, pos.z)
    scene.add(label)
    labels.push({ object: label, el })
  }

  return {
    nodes: () => points,
    collect(id) {
      const index = points.findIndex((p) => p.id === id)
      const p = points[index]
      if (!p || p.collected) return null
      p.collected = true
      p.timeSinceCollected = 0
      const mesh = meshes[index]
      if (mesh) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
        meshes[index] = null
      }
      return { kind: p.kind, x: p.x, z: p.z }
    },
    update(dt, observerPos) {
      const wasCollected = points.map((p) => p.collected)
      updateItemSpawnPoints(points, dt)
      points.forEach((p, i) => {
        if (wasCollected[i] && !p.collected) spawnMeshAt(i)
      })
      for (const { object, el } of labels) {
        el.style.opacity = String(
          labelOpacityForDistance(object.position.distanceTo(observerPos)),
        )
      }
    },
    dispose() {
      for (const mesh of meshes) {
        if (mesh) {
          mesh.removeFromParent()
          disposeObject3D(mesh)
        }
      }
      meshes.length = 0
      for (const { object, el } of labels) {
        object.removeFromParent()
        el.remove()
      }
      labels.length = 0
    },
  }
}
