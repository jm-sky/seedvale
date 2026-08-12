import { Group, type Object3D, type Scene, type Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import {
  disposeObject3D,
  type GltfAsset,
  loadGltfAsset,
  prepareProp,
} from '../assets/loadGltf'
import { distanceToSegment } from '../math/segment'
import { createCaveMouth, createThicket } from '../settlement/props'
import { isCoastalPlacement } from '../terrain/coastPlacement'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { skyParamsFromTime } from '../world/dayNight'
import { createSeededRandom } from '../world/parseSeed'
import { ANIMAL_DEFS, AnimalAgent, type AnimalKind } from './AnimalAgent'
import { type PreySpawner, updateSpawners } from './AnimalSpawner'
import { createBoarModel, createDuckModel, createRabbitModel } from './proceduralAnimals'

/** Extra clearance past each corridor's `halfWidth` — matches forest-belt
 *  road avoidance in `props.ts` (`ROAD_TREE_CLEARANCE`). */
const SPAWNER_ROAD_CLEARANCE = 1

/** Label height above ground for a cave mouth (prop ~1.1 m tall at scale 1). */
const CAVE_LABEL_HEIGHT = 1.8
/** Label above a thicket crown (~createTree at ~0.7 scale → crown ~2.5 m). */
const THICKET_LABEL_HEIGHT = 3.2
const DEFAULT_SPAWNER_LABEL_HEIGHT = 0.6

export type Fauna = {
  update: (
    dt: number,
    observerPos: Vector3,
    timeOfDay: number,
    litFires: readonly { x: number, z: number }[],
    /** Loaded settlement centers (`SettlementsManager.getLoaded()`) — wild
     *  animals react to proximity to any of these, see `AnimalAgent.ts`'s
     *  village-avoidance/flee-bias (plan 044 §2.3/§2.4). Owned livestock
     *  (horse/cow/sheep/chicken) isn't spawned here at all — see
     *  `settlement/livestock.ts`, spawned per-settlement instead. */
    villages: readonly { x: number, z: number }[],
    /** Player + nearby NPCs for predator crowd fear (plan 056). Default 1. */
    nearbyHumanCount?: number,
    /** Fauna→player damage callback when a predator bites in contact range. */
    onHumanHit?: (damage: number) => void,
  ) => void
  dispose: () => void
  getAgents: () => AnimalAgent[]
  getSpawners: () => readonly PreySpawner[]
  /** Label suffix (e.g. quest `!`/`?`) for a spawner type's CSS2D label — set
   *  externally (e.g. by a QuestManager), mirrors `NpcAgent.setQuestMarker`. */
  setSpawnerMarker: (type: PreySpawner['type'], marker: string | null) => void
}

/** Where a species prefers to spawn relative to the home settlement (plan
 *  044 §2.1/§2.2's habitat preferences): `open` is the original ring used by
 *  wolf/fox/deer/stag (no habitat check beyond dry land), `meadow`/`forest`/
 *  `water` add a `sampleForestFactor`/shoreline check for the new wild
 *  species. Domestic livestock used to have a `farmstead` profile here —
 *  moved to `settlement/livestock.ts` (house-anchored, per-settlement, see
 *  the village livestock ownership plan) since a settlement-center ring
 *  can't express "belongs to this specific house". */
type SpawnProfile = 'open' | 'meadow' | 'forest' | 'water'
type SpawnSpec = { kind: AnimalKind, count: number, profile: SpawnProfile }

const SPAWNS: SpawnSpec[] = [
  { kind: 'wolf', count: 2, profile: 'open' },
  { kind: 'fox', count: 2, profile: 'open' },
  { kind: 'deer', count: 4, profile: 'open' },
  { kind: 'stag', count: 2, profile: 'open' },
  { kind: 'rabbit', count: 3, profile: 'meadow' },
  { kind: 'duck', count: 2, profile: 'water' },
  { kind: 'boar', count: 2, profile: 'forest' },
]

/** [minDist, maxDist] from the settlement center for each `SpawnProfile` —
 *  starts a bit past `AnimalAgent.ts`'s `VILLAGE_AVOID_RADIUS` (20) so a
 *  freshly-spawned wild animal's own home point isn't already inside the
 *  zone its wander logic then refuses to path back into. */
const SPAWN_RING: Record<SpawnProfile, [number, number]> = {
  open: [24, 42],
  meadow: [24, 42],
  forest: [24, 45],
  water: [22, 42],
}

/** Hardcoded prey spawners (cave / thicket) — see docs/plans/2026-08-07--predator-prey-system.md. */
const SPAWNER_SPECS: { type: PreySpawner['type'], kind: AnimalKind, respawnTime: number, maxPreyCount: number }[] = [
  { type: 'cave', kind: 'deer', respawnTime: 8, maxPreyCount: 3 },
  { type: 'thicket', kind: 'stag', respawnTime: 12, maxPreyCount: 2 },
]

export const SPAWNER_LABELS: Record<PreySpawner['type'], string> = {
  cave: 'jaskinia',
  thicket: 'zagajnik',
  grove: 'gaj',
}

/** Only wolf/fox/deer/stag have a GLB (Quaternius pack); the rest (plan 044)
 *  always use the procedural builders below — `Partial` since not every
 *  `AnimalKind` has an entry. */
const FAUNA_URLS: Partial<Record<AnimalKind, string>> = {
  wolf: '/models/fauna/wolf.glb',
  fox: '/models/fauna/fox.glb',
  deer: '/models/fauna/deer.glb',
  stag: '/models/fauna/stag.glb',
}

/** Primitive-built visuals (`proceduralAnimals.ts`) for species with no GLB —
 *  same role as `AnimalAgent`'s capsule fallback, just species-shaped. Origin
 *  at each animal's feet already, so no `wrapModel`/`prepareProp` needed. */
const PROCEDURAL_FALLBACKS: Partial<Record<AnimalKind, () => Object3D>> = {
  rabbit: createRabbitModel,
  duck: createDuckModel,
  boar: createBoarModel,
}

type FaunaTemplate = GltfAsset

async function loadFaunaTemplates(): Promise<
  Partial<Record<AnimalKind, FaunaTemplate>>
> {
  const entries = await Promise.all(
    (Object.entries(FAUNA_URLS) as [AnimalKind, string][]).map(async ([kind, url]) => {
      try {
        const asset = await loadGltfAsset(url)
        prepareProp(asset.root, ANIMAL_DEFS[kind].modelHeight)
        return [kind, asset] as const
      } catch (err) {
        console.warn(`[fauna] failed to load ${url}, capsule fallback`, err)
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
 * `roadSegments` — corridors near home used to keep prey spawners off roads.
 */
export async function createFauna(
  scene: Scene,
  sampleHeight: HeightSampler,
  sampleForestFactor: (x: number, z: number) => number,
  waterLevel: number,
  homeRadius: number,
  settlementCenter: Vector3,
  seed: number,
  roadSegments: readonly RoadCorridorSegment[] = [],
  coast?: {
    sampleContinentalness: (x: number, z: number) => number
    coastThreshold: number
  },
): Promise<Fauna> {
  const random = createSeededRandom(seed ^ 0xfa11)
  let agents: AnimalAgent[] = []
  const templates = await loadFaunaTemplates()
  const spawnerMeshes: Object3D[] = []

  const onRoad = (x: number, z: number): boolean => {
    for (const seg of roadSegments) {
      if (distanceToSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz) < seg.halfWidth + SPAWNER_ROAD_CLEARANCE) {
        return true
      }
    }
    return false
  }

  /** Random point within [minDist, maxDist] of (cx, cz), clear of water and
   *  homeRadius bounds — `filter` adds a habitat preference (meadow/forest/
   *  shoreline) on top, see `SPAWN_RING`/`SPAWNS`. */
  const findWalkableNear = (
    cx: number,
    cz: number,
    minDist: number,
    maxDist: number,
    filter?: (x: number, z: number) => boolean,
    maxAttempts = 24,
  ): { x: number, z: number } | null => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = minDist + random() * (maxDist - minDist)
      const x = cx + Math.cos(angle) * dist
      const z = cz + Math.sin(angle) * dist
      if (Math.abs(x) > homeRadius - 4 || Math.abs(z) > homeRadius - 4) continue
      if (sampleHeight(x, z) <= waterLevel + 0.6) continue
      if (filter && !filter(x, z)) continue
      return { x, z }
    }
    return null
  }

  /** True if any point a few meters out from (x, z) dips into water — used to
   *  bias duck spawns toward the shoreline without requiring the duck's own
   *  spot to be wet. */
  const nearWater = (x: number, z: number): boolean => {
    const offsets: Array<[number, number]> = [
      [5, 0], [-5, 0], [0, 5], [0, -5], [3.5, 3.5], [-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5],
    ]
    return offsets.some(([dx, dz]) => sampleHeight(x + dx, z + dz) <= waterLevel + 0.2)
  }

  const habitatFilterFor = (profile: SpawnProfile): ((x: number, z: number) => boolean) | undefined => {
    switch (profile) {
      case 'forest':
        return (x, z) => sampleForestFactor(x, z) > 0.45
      case 'meadow':
        return (x, z) => sampleForestFactor(x, z) < 0.35
      case 'water':
        return nearWater
      default:
        return undefined
    }
  }

  const spawnAgent = (kind: AnimalKind, x: number, z: number): AnimalAgent => {
    const tpl = templates[kind]
    let visual: Object3D | undefined
    let animations = tpl?.animations ?? []
    if (tpl) {
      visual = wrapModel(tpl.clone())
      animations = tpl.animations
    } else {
      visual = PROCEDURAL_FALLBACKS[kind]?.()
    }
    return new AnimalAgent(ANIMAL_DEFS[kind], sampleHeight, waterLevel, x, z, visual, animations)
  }

  for (const spec of SPAWNS) {
    const [minDist, maxDist] = SPAWN_RING[spec.profile]
    const filter = habitatFilterFor(spec.profile)
    for (let i = 0; i < spec.count; i++) {
      const pos = findWalkableNear(settlementCenter.x, settlementCenter.z, minDist, maxDist, filter)
      if (!pos) continue
      const agent = spawnAgent(spec.kind, pos.x, pos.z)
      scene.add(agent.mesh)
      agents.push(agent)
    }
  }

  const spawners: PreySpawner[] = []
  const spawnerLabels: {
    type: PreySpawner['type']
    object: CSS2DObject
    el: HTMLDivElement
    marker: string | null
    lastOpacity: number
  }[] = []
  const offRoad = (x: number, z: number) => !onRoad(x, z)
  /** Prey spawners (esp. thicket) stay inland — not on beach / coastal band. */
  const spawnerSiteOk = (x: number, z: number): boolean => {
    if (!offRoad(x, z)) return false
    return !isCoastalPlacement(x, z, {
      sampleHeight,
      waterLevel,
      sampleContinentalness: coast?.sampleContinentalness,
      coastThreshold: coast?.coastThreshold,
    })
  }
  for (const spec of SPAWNER_SPECS) {
    // Thicket also prefers some forest cover so it doesn't land on open sand/meadow shore.
    const filter = spec.type === 'thicket'
      ? (x: number, z: number) => spawnerSiteOk(x, z) && sampleForestFactor(x, z) > 0.28
      : spawnerSiteOk
    const pos = findWalkableNear(settlementCenter.x, settlementCenter.z, 45, 65, filter, 72)
    if (!pos) continue
    spawners.push({ ...pos, ...spec, timeSinceLastRespawn: 0 })

    const groundY = sampleHeight(pos.x, pos.z)
    if (spec.type === 'cave') {
      const mouth = createCaveMouth(1, random())
      mouth.position.set(pos.x, groundY, pos.z)
      // Open side (+Z) faces away from the settlement into the wild.
      mouth.rotation.y = Math.atan2(pos.x - settlementCenter.x, pos.z - settlementCenter.z)
      scene.add(mouth)
      spawnerMeshes.push(mouth)
    } else if (spec.type === 'thicket') {
      const thicket = createThicket(1, random())
      thicket.position.set(pos.x, groundY, pos.z)
      thicket.rotation.y = random() * Math.PI * 2
      scene.add(thicket)
      spawnerMeshes.push(thicket)
    }

    const el = document.createElement('div')
    el.className = 'npc-label'
    el.textContent = SPAWNER_LABELS[spec.type]
    const label = new CSS2DObject(el)
    const labelH = spec.type === 'cave'
      ? CAVE_LABEL_HEIGHT
      : spec.type === 'thicket'
        ? THICKET_LABEL_HEIGHT
        : DEFAULT_SPAWNER_LABEL_HEIGHT
    label.position.set(pos.x, groundY + labelH, pos.z)
    scene.add(label)
    spawnerLabels.push({ type: spec.type, object: label, el, marker: null, lastOpacity: -1 })
  }

  return {
    update(dt, observerPos, timeOfDay, litFires, villages, nearbyHumanCount = 1, onHumanHit) {
      const dayFactor = skyParamsFromTime(timeOfDay).dayFactor
      for (const a of agents) {
        const forestFactor = sampleForestFactor(a.mesh.position.x, a.mesh.position.z)
        a.update(
          dt,
          agents,
          observerPos,
          dayFactor,
          forestFactor,
          litFires,
          villages,
          nearbyHumanCount,
          onHumanHit,
        )
      }

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

      for (const entry of spawnerLabels) {
        const opacity = labelOpacityForDistance(entry.object.position.distanceTo(observerPos))
        if (opacity === entry.lastOpacity) continue
        entry.lastOpacity = opacity
        entry.el.style.opacity = String(opacity)
      }
    },
    dispose() {
      for (const a of agents) disposeAgent(a)
      agents = []
      for (const mesh of spawnerMeshes) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }
      spawnerMeshes.length = 0
      for (const { object, el } of spawnerLabels) {
        object.removeFromParent()
        el.remove()
      }
      spawnerLabels.length = 0
    },
    getAgents: () => agents,
    getSpawners: () => spawners,
    setSpawnerMarker(type, marker) {
      for (const entry of spawnerLabels) {
        if (entry.type !== type || entry.marker === marker) continue
        entry.marker = marker
        entry.el.textContent = marker
          ? `${SPAWNER_LABELS[type]} · ${marker}`
          : SPAWNER_LABELS[type]
      }
    },
  }
}
