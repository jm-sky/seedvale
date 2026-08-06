import type { HeightSampler } from '../player/PlayerController'
import { createSeededRandom } from '../world/parseSeed'
import { ANIMAL_DEFS, AnimalAgent, type AnimalKind } from './AnimalAgent'
import type { Scene, Vector3 } from 'three'

export type Fauna = {
  update: (dt: number) => void
  dispose: () => void
}

type SpawnSpec = { kind: AnimalKind, count: number }

const SPAWNS: SpawnSpec[] = [
  { kind: 'wolf', count: 2 },
  { kind: 'bear', count: 1 },
  { kind: 'deer', count: 4 },
  { kind: 'rabbit', count: 5 },
]

/**
 * Place animals in a ring around the settlement (forest belt).
 * Mesh = capsule placeholder; swap via `mesh` later when GLB packs land.
 */
export function createFauna(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  halfExtent: number,
  settlementCenter: Vector3,
  seed: number,
): Fauna {
  const random = createSeededRandom(seed ^ 0xfa11)
  const agents: AnimalAgent[] = []

  const trySpawn = (kind: AnimalKind): AnimalAgent | null => {
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = 18 + random() * 22
      const x = settlementCenter.x + Math.cos(angle) * dist
      const z = settlementCenter.z + Math.sin(angle) * dist
      if (Math.abs(x) > halfExtent - 4 || Math.abs(z) > halfExtent - 4) continue
      const y = sampleHeight(x, z)
      if (y <= waterLevel + 0.6) continue
      return new AnimalAgent(
        ANIMAL_DEFS[kind],
        sampleHeight,
        waterLevel,
        halfExtent,
        x,
        z,
      )
    }
    return null
  }

  for (const spec of SPAWNS) {
    for (let i = 0; i < spec.count; i++) {
      const agent = trySpawn(spec.kind)
      if (!agent) continue
      scene.add(agent.mesh)
      agents.push(agent)
    }
  }

  return {
    update(dt) {
      for (const a of agents) a.update(dt, agents)
    },
    dispose() {
      for (const a of agents) {
        a.mesh.removeFromParent()
        a.mesh.geometry.dispose()
        const mat = a.mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
      agents.length = 0
    },
  }
}
