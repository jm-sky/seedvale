import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import {
  type BeehiveRecord,
  burnHive as burnHiveDomain,
  collectHoney as collectHoneyDomain,
} from './beehives'
import { createSeededRandom } from './parseSeed'
import type { Object3D, Scene, Vector3 } from 'three'

export type BeehiveEntry = BeehiveRecord & { mesh: Object3D }

export type Beehives = {
  list: () => readonly BeehiveEntry[]
  nodes: () => readonly BeehiveRecord[]
  /** Mutates the hive's `lastCollectedAtDay` in place and returns how much
   *  honey the collection yielded (0 if none accrued yet or already burned). */
  collect: (id: string, nowDays: number) => number
  /** Mutates the hive to `burned`; returns the one-time reward (0 if already
   *  burned or the reward was already granted before a reload). */
  burn: (id: string) => number
  dispose: () => void
}

const HIVE_MIN_DIST = 2
const HIVE_MAX_DIST = 5

function createHiveMesh(): Object3D {
  const group = new THREE.Group()
  const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), bark)
  trunk.position.y = 0.3
  trunk.castShadow = true
  group.add(trunk)
  const hiveMat = new THREE.MeshStandardMaterial({ color: 0x9c7a3a, flatShading: true })
  for (let i = 0; i < 3; i++) {
    const lump = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.02, 7, 5), hiveMat)
    lump.position.set(0.1, 0.55 + i * 0.14, 0.05)
    lump.castShadow = true
    group.add(lump)
  }
  return group
}

function setHiveVisualBurned(mesh: Object3D, burned: boolean): void {
  mesh.traverse((obj) => {
    const m = obj as THREE.Mesh
    if (!m.isMesh) return
    const mat = m.material as THREE.MeshStandardMaterial
    mat.color.set(burned ? 0x1c1a16 : (m === mesh.children[0] ? 0x6b4a2f : 0x9c7a3a))
  })
}

/**
 * Wild beehives (plan 159 §11) — deterministic placement near a settlement's
 * trees, same anchoring idea as `createItemSpawners.ts`'s branch points.
 * Production/burn state is fully owned by `BeehiveRecord`; this runtime only
 * holds the presentation mesh and dispatches to the pure domain functions in
 * `beehives.ts`. No bee agents, no per-frame simulation.
 */
export function createBeehives(
  scene: Scene,
  sampleHeight: HeightSampler,
  trees: readonly Vector3[],
  seed: number,
  initial: readonly BeehiveRecord[] = [],
): Beehives {
  const hives: BeehiveEntry[] = []

  const spawn = (record: BeehiveRecord): void => {
    const mesh = createHiveMesh()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    if (record.burned) setHiveVisualBurned(mesh, true)
    hives.push({ ...record, mesh })
  }

  if (initial.length > 0) {
    for (const hive of initial) spawn(hive)
  } else if (trees.length > 0) {
    const random = createSeededRandom(seed ^ 0x8ee71)
    const count = 1 + Math.floor(random() * 2) // 1–2 hives
    for (let i = 0; i < count; i++) {
      const tree = trees[Math.floor(random() * trees.length)]!
      const angle = random() * Math.PI * 2
      const dist = HIVE_MIN_DIST + random() * (HIVE_MAX_DIST - HIVE_MIN_DIST)
      const x = tree.x + Math.cos(angle) * dist
      const z = tree.z + Math.sin(angle) * dist
      spawn({
        id: `hive:${i}:${Math.round(tree.x)}:${Math.round(tree.z)}`,
        x,
        z,
        yaw: random() * Math.PI * 2,
        lastCollectedAtDay: 0,
        burned: false,
        burnRewardCollected: false,
      })
    }
  }

  const find = (id: string): BeehiveEntry | undefined => hives.find((entry) => entry.id === id)

  return {
    list: () => hives,
    nodes: () => hives.map(({ id, x, z, yaw, lastCollectedAtDay, burned, burnRewardCollected }) => (
      { id, x, z, yaw, lastCollectedAtDay, burned, burnRewardCollected }
    )),
    collect(id, nowDays) {
      const entry = find(id)
      if (!entry || entry.burned) return 0
      const result = collectHoneyDomain(entry, nowDays)
      entry.lastCollectedAtDay = result.lastCollectedAtDay
      return result.amount
    },
    burn(id) {
      const entry = find(id)
      if (!entry) return 0
      const result = burnHiveDomain(entry)
      if (result.alreadyBurned) return 0
      entry.burned = true
      entry.burnRewardCollected = true
      setHiveVisualBurned(entry.mesh, true)
      return result.reward
    },
    dispose() {
      for (const hive of hives) {
        hive.mesh.removeFromParent()
        disposeObject3D(hive.mesh)
      }
      hives.length = 0
    },
  }
}
