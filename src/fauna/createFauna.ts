import { Group, type Object3D, type Scene, type Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import {
  disposeObject3D,
  type GltfAsset,
  loadGltfAsset,
  prepareProp,
} from '../assets/loadGltf'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { skyParamsFromTime } from '../world/dayNight'
import { createSeededRandom } from '../world/parseSeed'
import { ANIMAL_DEFS, AnimalAgent, type AnimalKind } from './AnimalAgent'
import { type PreySpawner, updateSpawners } from './AnimalSpawner'

export type Fauna = {
  update: (dt: number, observerPos: Vector3, timeOfDay: number) => void
  dispose: () => void
  getAgents: () => AnimalAgent[]
}

type SpawnSpec = { kind: AnimalKind, count: number }

const SPAWNS: SpawnSpec[] = [
  { kind: 'wolf', count: 2 },
  { kind: 'fox', count: 2 },
  { kind: 'deer', count: 4 },
  { kind: 'stag', count: 2 },
]

/** Hardcoded prey spawners (cave / thicket) — see docs/plans/2026-08-07--predator-prey-system.md. */
const SPAWNER_SPECS: { type: PreySpawner['type'], kind: AnimalKind, respawnTime: number, maxPreyCount: number }[] = [
  { type: 'cave', kind: 'deer', respawnTime: 8, maxPreyCount: 3 },
  { type: 'thicket', kind: 'stag', respawnTime: 12, maxPreyCount: 2 },
]

const SPAWNER_LABELS: Record<PreySpawner['type'], string> = {
  cave: 'jaskinia',
  thicket: 'zagajnik',
  grove: 'gaj',
}

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

function disposeAgent(agent: AnimalAgent): void {
  agent.dispose()
  agent.mesh.removeFromParent()
  // GLB clones share GPU resources with the loader cache — only free capsules.
  if (agent.mesh.userData.faunaCapsule) disposeObject3D(agent.mesh)
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
  let agents: AnimalAgent[] = []
  const templates = await loadFaunaTemplates()

  /** Random point within [minDist, maxDist] of (cx, cz), clear of water and homeRadius bounds. */
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

  const spawnAgent = (kind: AnimalKind, x: number, z: number): AnimalAgent => {
    const tpl = templates[kind]
    let visual: Object3D | undefined
    let animations = tpl?.animations ?? []
    if (tpl) {
      visual = wrapModel(tpl.clone())
      animations = tpl.animations
    }
    return new AnimalAgent(ANIMAL_DEFS[kind], sampleHeight, waterLevel, x, z, visual, animations)
  }

  for (const spec of SPAWNS) {
    for (let i = 0; i < spec.count; i++) {
      const pos = findWalkableNear(settlementCenter.x, settlementCenter.z, 18, 40)
      if (!pos) continue
      const agent = spawnAgent(spec.kind, pos.x, pos.z)
      scene.add(agent.mesh)
      agents.push(agent)
    }
  }

  const spawners: PreySpawner[] = []
  const spawnerLabels: { object: CSS2DObject, el: HTMLDivElement }[] = []
  for (const spec of SPAWNER_SPECS) {
    const pos = findWalkableNear(settlementCenter.x, settlementCenter.z, 45, 65)
    if (!pos) continue
    spawners.push({ ...pos, ...spec, timeSinceLastRespawn: 0 })

    const el = document.createElement('div')
    el.className = 'npc-label'
    el.textContent = SPAWNER_LABELS[spec.type]
    const label = new CSS2DObject(el)
    label.position.set(pos.x, sampleHeight(pos.x, pos.z) + 0.6, pos.z)
    scene.add(label)
    spawnerLabels.push({ object: label, el })
  }

  return {
    update(dt, observerPos, timeOfDay) {
      const isNight = skyParamsFromTime(timeOfDay).dayFactor <= 0
      for (const a of agents) a.update(dt, agents, observerPos, isNight)

      if (agents.some((a) => a.readyToRemove())) {
        const alive: AnimalAgent[] = []
        for (const a of agents) {
          if (a.readyToRemove()) disposeAgent(a)
          else alive.push(a)
        }
        agents = alive
      }

      updateSpawners(
        spawners,
        dt,
        agents
          .filter((a) => a.def.role === 'prey' && !a.isDead())
          .map((a) => ({ kind: a.def.kind, x: a.mesh.position.x, z: a.mesh.position.z })),
        (spawner) => {
          const pos = findWalkableNear(spawner.x, spawner.z, 0, 4) ?? spawner
          const agent = spawnAgent(spawner.kind, pos.x, pos.z)
          scene.add(agent.mesh)
          agents.push(agent)
        },
      )

      for (const { object, el } of spawnerLabels) {
        el.style.opacity = String(
          labelOpacityForDistance(object.position.distanceTo(observerPos)),
        )
      }
    },
    dispose() {
      for (const a of agents) disposeAgent(a)
      agents = []
      for (const { object, el } of spawnerLabels) {
        object.removeFromParent()
        el.remove()
      }
      spawnerLabels.length = 0
    },
    getAgents: () => agents,
  }
}
