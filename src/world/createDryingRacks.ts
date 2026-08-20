import * as THREE from 'three'
import { type Object3D, type Scene } from 'three'
import type { TimedProcess } from '../items/timedProcess'
import type { HeightSampler } from '../player/PlayerController'
import type { DryingRackRecord } from './dryingRacks'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'

export type DryingRackEntry = DryingRackRecord & { mesh: Object3D }

export type DryingRacks = {
  list: () => readonly DryingRackEntry[]
  nodes: () => readonly DryingRackRecord[]
  /** Sets `id`'s process — a no-op returning false if the rack already has
   *  one running (only one process per rack at a time). */
  startProcess: (id: string, process: TimedProcess) => boolean
  /** Clears `id`'s process and returns what was there (null if none). The
   *  caller (`app/createApp.ts`) decides whether it was actually complete
   *  before granting the output — this runtime just holds the record. */
  clearProcess: (id: string) => TimedProcess | null
  dispose: () => void
}

function createDryingRackMesh(): Object3D {
  const group = new THREE.Group()
  const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true })
  for (const dx of [-0.4, 0.4]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), bark)
    leg.position.set(dx, 0.45, 0)
    leg.castShadow = true
    group.add(leg)
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), bark)
  bar.rotation.z = Math.PI / 2
  bar.position.y = 0.85
  bar.castShadow = true
  group.add(bar)
  return group
}

/**
 * Drying racks (plan 159 §8) — deterministic settlement landmark, same
 * "persistent world record + presentation object" idea as the well/campfire,
 * not a player-placed prop. Holds at most one background `TimedProcess`;
 * this runtime only holds the presentation mesh, dispatching to the pure
 * domain in `dryingRacks.ts`.
 */
export function createDryingRacks(
  scene: Scene,
  sampleHeight: HeightSampler,
  /** Anchor to spawn a fresh rack near (settlement stockpile/campfire) —
   *  only used when `initial` is empty (a brand-new world). */
  anchor: { x: number, z: number } | undefined,
  initial: readonly DryingRackRecord[] = [],
): DryingRacks {
  const racks: DryingRackEntry[] = []

  const spawn = (record: DryingRackRecord): void => {
    const mesh = createDryingRackMesh()
    mesh.rotation.y = record.yaw
    placeOnGround(mesh, record.x, record.z, sampleHeight)
    scene.add(mesh)
    racks.push({ ...record, mesh })
  }

  if (initial.length > 0) {
    for (const rack of initial) spawn(rack)
  } else if (anchor) {
    spawn({ id: 'dryingrack:0', x: anchor.x + 2, z: anchor.z + 2, yaw: 0, process: null })
  }

  const find = (id: string): DryingRackEntry | undefined => racks.find((entry) => entry.id === id)

  return {
    list: () => racks,
    nodes: () => racks.map(({ id, x, z, yaw, process }) => ({ id, x, z, yaw, process })),
    startProcess(id, process) {
      const entry = find(id)
      if (!entry || entry.process) return false
      entry.process = process
      return true
    },
    clearProcess(id) {
      const entry = find(id)
      if (!entry) return null
      const process = entry.process
      entry.process = null
      return process
    },
    dispose() {
      for (const rack of racks) {
        rack.mesh.removeFromParent()
        disposeObject3D(rack.mesh)
      }
      racks.length = 0
    },
  }
}
