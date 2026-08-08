import { Group, type Object3D, type Scene } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { disposeObject3D } from '../assets/loadGltf'
import { createRockCluster, placeOnGround } from '../settlement/props'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSeededRandom } from '../world/parseSeed'
import { type NaturalResource, type ResourceEnv, resourcesNear } from './naturalResources'

/** Ore-bearing types that get a visible pile in the world — the rest of
 *  `naturalResources.ts`'s pool (fish/fertile_soil/clay/salt/resin/herbs)
 *  stays a data-only signal for settlement generation, same as before this
 *  module existed. Deliberately small, matching the "surface just a few
 *  resources visually, not everything" ask. */
type VisibleOreType = 'coal' | 'gold' | 'iron'

const ORE_COLOR: Record<VisibleOreType, number> = {
  // Rust/hematite red-brown — reads as "iron ore", not generic gray rock.
  iron: 0x8a4a30,
  coal: 0x1c1c1c,
  gold: 0xd4af37,
}

const ORE_LABEL: Record<VisibleOreType, string> = {
  iron: 'Żelazo',
  coal: 'Węgiel',
  gold: 'Złoto',
}

function isVisibleOre(type: NaturalResource['type']): type is VisibleOreType {
  return type === 'iron' || type === 'coal' || type === 'gold'
}

/** How far from the player deposits get instantiated/kept — deliberately
 *  smaller than settlement streaming radii (`SETTLEMENT_LOAD_RADIUS` = 300 in
 *  `app/createApp.ts`): these are small decorative piles, not worth building
 *  far outside render/interest range. `UNLOAD` > `LOAD` is the same
 *  hysteresis-ring reasoning `SettlementsManager.ts` uses, avoiding
 *  load/unload thrashing right at the boundary. */
const LOAD_RADIUS = 160
const UNLOAD_RADIUS = 220
const RECHECK_DISTANCE = LOAD_RADIUS * 0.25

const PILES_MIN = 2
const PILES_MAX = 3
/** Passed as `createRockCluster`'s `variant` — that function's own pebble
 *  count is `3 + floor(variant * 7)`, so capping variant this low keeps every
 *  pile a small 3-4 rock heap ("2-3 kupki po 3-4 kamienie"), not the fuller
 *  3-9 range `variant`'s full 0..1 range would allow. */
const PILE_VARIANT_MAX = 0.14
/** Piles scatter within this fraction of the deposit's own `radius` — keeps
 *  them visibly clustered around one spot rather than spread across the
 *  whole (up to 20-unit) deposit radius, which exists for the
 *  site-attraction falloff (`naturalResources.ts`), not as a literal "piles
 *  anywhere in here" box. */
const PILE_SCATTER_RADIUS_FRACTION = 0.5
const PILE_SCATTER_MIN_FRACTION = 0.25

/** Simple string hash (FNV-1a) — `NaturalResource.id` is a string
 *  (`resource_{rx}_{rz}`), but pile placement wants a numeric seed for
 *  `createSeededRandom`, same as every other seeded RNG in this codebase. */
function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

type DepositInstance = {
  resource: NaturalResource
  group: Object3D
  label: CSS2DObject
  labelEl: HTMLDivElement
}

export type ResourceDeposits = {
  update: (playerX: number, playerZ: number) => void
  dispose: () => void
}

/**
 * Streams small, non-interactive ore piles (colored rock clusters + a name
 * label) into the world near the player, one per significant iron/coal/gold
 * `NaturalResource` (plan 032) — the first visible surface of a resource
 * layer that was, until now, pure settlement-generation data (no world
 * geometry at all). Main-thread, radius-based streaming — mirrors
 * `SettlementsManager`'s load/unload-by-distance shape, not the chunk-worker
 * pipeline: `naturalResources.ts`'s query functions are cheap pure functions
 * of already-available `ChunkManager` samplers (see `ambientWeights.ts` for
 * the same "reuse ChunkManager's exposed samplers on the main thread"
 * approach), so there's no need to thread this through the terrain worker.
 */
export function createResourceDeposits(scene: Scene, env: ResourceEnv, seed: number): ResourceDeposits {
  const instances = new Map<string, DepositInstance>()
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY

  function spawn(resource: NaturalResource): void {
    if (!isVisibleOre(resource.type)) return
    const random = createSeededRandom(hashId(resource.id))
    const group = new Group()
    group.name = `resourceDeposit:${resource.id}`

    const pileCount = PILES_MIN + Math.floor(random() * (PILES_MAX - PILES_MIN + 1))
    const scatterMax = resource.radius * PILE_SCATTER_RADIUS_FRACTION
    const scatterMin = scatterMax * PILE_SCATTER_MIN_FRACTION
    for (let i = 0; i < pileCount; i++) {
      const angle = random() * Math.PI * 2
      const dist = scatterMin + random() * (scatterMax - scatterMin)
      const px = resource.x + Math.cos(angle) * dist
      const pz = resource.z + Math.sin(angle) * dist
      const h = env.sampleHeight(px, pz)
      if (h <= env.waterLevel + 0.4) continue
      const pile = createRockCluster(
        0.55 + random() * 0.25,
        random() * PILE_VARIANT_MAX,
        ORE_COLOR[resource.type],
      )
      placeOnGround(pile, px, pz, env.sampleHeight)
      group.add(pile)
    }
    scene.add(group)

    const labelEl = document.createElement('div')
    labelEl.className = 'npc-label'
    labelEl.textContent = ORE_LABEL[resource.type]
    const label = new CSS2DObject(labelEl)
    const labelY = env.sampleHeight(resource.x, resource.z) + 0.6
    label.position.set(resource.x, labelY, resource.z)
    scene.add(label)

    instances.set(resource.id, { resource, group, label, labelEl })
  }

  function despawn(id: string): void {
    const instance = instances.get(id)
    if (!instance) return
    instance.group.removeFromParent()
    disposeObject3D(instance.group)
    instance.label.removeFromParent()
    instance.labelEl.remove()
    instances.delete(id)
  }

  function recheck(playerX: number, playerZ: number): void {
    lastCheckX = playerX
    lastCheckZ = playerZ
    const nearby = resourcesNear(playerX, playerZ, LOAD_RADIUS, seed, env)
    const wanted = new Set<string>()
    for (const resource of nearby) {
      if (!isVisibleOre(resource.type)) continue
      wanted.add(resource.id)
      if (!instances.has(resource.id)) spawn(resource)
    }
    for (const [id, instance] of instances) {
      if (wanted.has(id)) continue
      const dist = Math.hypot(instance.resource.x - playerX, instance.resource.z - playerZ)
      if (dist > UNLOAD_RADIUS) despawn(id)
    }
  }

  return {
    update(playerX, playerZ) {
      if (Math.hypot(playerX - lastCheckX, playerZ - lastCheckZ) >= RECHECK_DISTANCE) {
        recheck(playerX, playerZ)
      }
      for (const instance of instances.values()) {
        const dist = Math.hypot(instance.resource.x - playerX, instance.resource.z - playerZ)
        instance.labelEl.style.opacity = String(labelOpacityForDistance(dist))
      }
    },
    dispose() {
      for (const id of [...instances.keys()]) despawn(id)
    },
  }
}
