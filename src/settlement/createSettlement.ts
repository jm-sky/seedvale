import {
  type Material,
  type Mesh,
  type Scene,
  Vector3,
} from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { NpcAgent } from '../ai/NpcAgent'
import { findSettlementSite } from './findSettlementSite'
import { buildSettlementProps } from './props'

export type Settlement = {
  spawn: Vector3
  center: Vector3
  update: (dt: number) => void
  dispose: () => void
}

export function createSettlement(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  halfExtent: number,
  seed: number,
): Settlement {
  const site = findSettlementSite(sampleHeight, waterLevel, halfExtent, seed)
  const { group, landmarks } = buildSettlementProps(site, sampleHeight)
  scene.add(group)

  const agents: NpcAgent[] = []
  const count = Math.min(5, Math.max(3, landmarks.homes.length + 1))
  for (let i = 0; i < count; i++) {
    const home =
      landmarks.homes[i % landmarks.homes.length] ??
      landmarks.well.clone()
    const agent = new NpcAgent(
      sampleHeight,
      landmarks,
      home,
      i,
      i / Math.max(1, count - 1),
    )
    scene.add(agent.mesh)
    agents.push(agent)
  }

  const spawn = new Vector3(
    site.x + 3.5,
    sampleHeight(site.x + 3.5, site.z - 3),
    site.z - 3,
  )

  return {
    spawn,
    center: new Vector3(site.x, site.y, site.z),
    update(dt) {
      for (const agent of agents) agent.update(dt)
    },
    dispose() {
      for (const agent of agents) {
        agent.disposeLabel()
        agent.mesh.removeFromParent()
        agent.mesh.geometry.dispose()
        ;(agent.mesh.material as Material).dispose()
      }
      group.traverse((obj) => {
        const mesh = obj as Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      })
      group.removeFromParent()
    },
  }
}
