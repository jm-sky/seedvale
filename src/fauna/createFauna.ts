import { Group, type Object3D, type Scene, type Vector3 } from 'three'
import {
  disposeObject3D,
  loadGltfAsset,
  prepareProp,
  type GltfAsset,
} from '../assets/loadGltf'
import type { HeightSampler } from '../player/PlayerController'
import { createSeededRandom } from '../world/parseSeed'
import { ANIMAL_DEFS, AnimalAgent, type AnimalKind } from './AnimalAgent'

export type Fauna = {
  update: (dt: number, observerPos: Vector3) => void
  dispose: () => void
}

type SpawnSpec = { kind: AnimalKind, count: number }

const SPAWNS: SpawnSpec[] = [
  { kind: 'wolf', count: 2 },
  { kind: 'fox', count: 2 },
  { kind: 'deer', count: 4 },
  { kind: 'stag', count: 2 },
]

const FAUNA_URLS: Record<AnimalKind, string> = {
  wolf: '/models/fauna/wolf.glb',
  fox: '/models/fauna/fox.glb',
  deer: '/models/fauna/deer.glb',
  stag: '/models/fauna/stag.glb',
}

type FaunaTemplate = GltfAsset

async function loadFaunaTemplates(): Promise<
  Partial<Record<AnimalKind, FaunaTemplate>>
> {
  const entries = await Promise.all(
    (Object.keys(FAUNA_URLS) as AnimalKind[]).map(async (kind) => {
      try {
        const asset = await loadGltfAsset(FAUNA_URLS[kind])
        prepareProp(asset.root, ANIMAL_DEFS[kind].modelHeight)
        return [kind, asset] as const
      } catch (err) {
        console.warn(
          `[fauna] failed to load ${FAUNA_URLS[kind]}, capsule fallback`,
          err,
        )
        return [kind, null] as const
      }
    }),
  )
  const out: Partial<Record<AnimalKind, FaunaTemplate>> = {}
  for (const [kind, asset] of entries) {
    if (asset) out[kind] = asset
  }
  return out
}

/** Keep prepareProp foot/center offsets on the child; world pos lives on the wrap. */
function wrapModel(model: Object3D): Group {
  const wrap = new Group()
  wrap.add(model)
  return wrap
}

/**
 * Place animals in a ring around the settlement (forest belt).
 * Prefers GLB from `public/models/fauna/` keyed by `userData.animalKind`.
 */
export async function createFauna(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  homeRadius: number,
  settlementCenter: Vector3,
  seed: number,
): Promise<Fauna> {
  const random = createSeededRandom(seed ^ 0xfa11)
  const agents: AnimalAgent[] = []
  const templates = await loadFaunaTemplates()

  const trySpawn = (kind: AnimalKind): AnimalAgent | null => {
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = 18 + random() * 22
      const x = settlementCenter.x + Math.cos(angle) * dist
      const z = settlementCenter.z + Math.sin(angle) * dist
      if (Math.abs(x) > homeRadius - 4 || Math.abs(z) > homeRadius - 4) continue
      const y = sampleHeight(x, z)
      if (y <= waterLevel + 0.6) continue

      const tpl = templates[kind]
      let visual: Object3D | undefined
      let animations = tpl?.animations ?? []
      if (tpl) {
        visual = wrapModel(tpl.clone())
        animations = tpl.animations
      }

      return new AnimalAgent(
        ANIMAL_DEFS[kind],
        sampleHeight,
        waterLevel,
        x,
        z,
        visual,
        animations,
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
    update(dt, observerPos) {
      for (const a of agents) a.update(dt, agents, observerPos)
    },
    dispose() {
      for (const a of agents) {
        a.dispose()
        a.mesh.removeFromParent()
        // GLB clones share GPU resources with the loader cache — only free capsules.
        if (a.mesh.userData.faunaCapsule) disposeObject3D(a.mesh)
      }
      agents.length = 0
    },
  }
}
