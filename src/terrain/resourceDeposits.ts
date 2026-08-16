import { Group, type Object3D, type Scene } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { disposeObject3D } from '../assets/loadGltf'
import {
  clonePropWithYaw,
  createRockCluster,
  loadPropTemplates,
  placeOnGround,
  RESOURCE_GOLD_SPECS,
  RESOURCE_ROCK_SPECS,
  tintPropMaterials,
} from '../settlement/props'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSeededRandom } from '../world/parseSeed'
import {
  hitsForRichness,
  type MineableOre,
  ORE_YIELD_LABEL,
  yieldForOre,
} from './depositMining'
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

/** GLB resource nodes are already full RTS piles — 1–2 per deposit, not the
 *  former 2–3 tiny procedural pebble heaps (plan 065). */
const PILES_MIN = 1
const PILES_MAX = 2
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

type OreTemplates = {
  gold: Object3D[]
  rock: Object3D[]
}

type DepositInstance = {
  resource: NaturalResource
  group: Object3D
  label: CSS2DObject
  labelEl: HTMLDivElement
  remaining: number
}

export type DepositTarget = {
  id: string
  type: MineableOre
  x: number
  z: number
  remaining: number
}

export type MineResult =
  | { ok: true, yield: { kind: ReturnType<typeof yieldForOre>['kind'], count: number }, remaining: number }
  | { ok: false, reason: 'missing' | 'depleted' }

/** A secondary streaming anchor (plan 131) — e.g. a settlement center — kept
 *  loaded independently of the player so NPC mining can find a deposit while
 *  the player is elsewhere. Deliberately not a full player-independent
 *  rewrite of this module's streaming (implementation notes §4): interest
 *  points still ride the same load/unload radii and recheck cadence as the
 *  player, just unioned in. */
export type InterestPoint = { x: number, z: number }

export type ResourceDeposits = {
  /** `interestPoints` — extra anchors (settlement centers) that keep nearby
   *  deposits loaded even while the player is far away; label fade still
   *  follows the player only. */
  update: (playerX: number, playerZ: number, interestPoints?: readonly InterestPoint[]) => void
  /** Nearest loaded ore pile the player (or an NPC, plan 131) can mine. */
  queryNearest: (x: number, z: number, range: number) => DepositTarget | null
  mine: (id: string) => MineResult
  dispose: () => void
}

/** Narrow view over `ResourceDeposits` for NPC mining (plan 131) — mirrors
 *  `SettlementForestHooks`' shape: just the domain operations a settlement
 *  needs, not `update`/`dispose` (owned by `WorldBundle`). */
export type SettlementMiningHooks = {
  queryNearest: ResourceDeposits['queryNearest']
  mine: ResourceDeposits['mine']
}

/**
 * Streams ore piles (GLB resource nodes + a name label) into the world near
 * the player, one per significant iron/coal/gold `NaturalResource`
 * (plan 032 / 065). Pickaxe mining (plan 090) consumes remaining hits on the
 * loaded instance. Main-thread, radius-based streaming — mirrors
 * `SettlementsManager`'s load/unload-by-distance shape, not the chunk-worker
 * pipeline.
 */
export function createResourceDeposits(scene: Scene, env: ResourceEnv, seed: number): ResourceDeposits {
  const instances = new Map<string, DepositInstance>()
  /** Session-only — depleted piles do not respawn until world rebuild (like dig holes). */
  const depletedIds = new Set<string>()
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY
  /** Forces a `recheck` when the interest-point set itself changes (e.g. a
   *  settlement streams in/out) even if the player hasn't moved far enough
   *  to trigger the distance-based recheck below. */
  let lastInterestCount = -1
  let templatesPromise: Promise<OreTemplates> | null = null
  let templates: OreTemplates | null = null
  let disposed = false
  /** Spawns deferred until GLB templates finish loading (first nearby ore). */
  const pendingIds = new Set<string>()

  function setLabel(instance: DepositInstance): void {
    const type = instance.resource.type
    if (!isVisibleOre(type)) return
    instance.labelEl.textContent = `${ORE_YIELD_LABEL[type]} (${instance.remaining})`
  }

  function getTemplates(): Promise<OreTemplates> {
    return (templatesPromise ??= Promise.all([
      loadPropTemplates(RESOURCE_GOLD_SPECS, () => createRockCluster(1, 0.14, ORE_COLOR.gold)),
      loadPropTemplates(RESOURCE_ROCK_SPECS, () => createRockCluster(1, 0.14, ORE_COLOR.iron)),
    ]).then(([gold, rock]) => {
      templates = { gold, rock }
      return templates
    }))
  }

  function createPile(
    type: VisibleOreType,
    scale: number,
    rotationY: number,
    oreTemplates: OreTemplates,
  ): Object3D {
    if (type === 'gold') {
      return clonePropWithYaw(oreTemplates.gold, 0, scale, rotationY)
    }
    const pile = clonePropWithYaw(oreTemplates.rock, 0, scale, rotationY)
    // Iron / coal share `resource_rock_1`; tint distinguishes them without
    // mutating the shared GLTF material cache (`tintPropMaterials`).
    tintPropMaterials(pile, ORE_COLOR[type])
    return pile
  }

  function spawnSync(resource: NaturalResource, oreTemplates: OreTemplates): void {
    if (disposed || !isVisibleOre(resource.type)) return
    if (depletedIds.has(resource.id) || instances.has(resource.id)) return
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
      const scale = 0.85 + random() * 0.35
      const yaw = random() * Math.PI * 2
      const pile = createPile(resource.type, scale, yaw, oreTemplates)
      placeOnGround(pile, px, pz, env.sampleHeight)
      group.add(pile)
    }
    scene.add(group)

    const remaining = hitsForRichness(resource.richness)
    const labelEl = document.createElement('div')
    labelEl.className = 'npc-label'
    const label = new CSS2DObject(labelEl)
    const labelY = env.sampleHeight(resource.x, resource.z) + 0.6
    label.position.set(resource.x, labelY, resource.z)
    scene.add(label)

    const instance: DepositInstance = { resource, group, label, labelEl, remaining }
    setLabel(instance)
    instances.set(resource.id, instance)
  }

  function spawn(resource: NaturalResource): void {
    if (disposed || !isVisibleOre(resource.type) || depletedIds.has(resource.id)) return
    if (instances.has(resource.id) || pendingIds.has(resource.id)) return
    if (templates) {
      spawnSync(resource, templates)
      return
    }
    pendingIds.add(resource.id)
    void getTemplates().then((oreTemplates) => {
      pendingIds.delete(resource.id)
      if (disposed) return
      // Player may have walked away while templates loaded.
      const dist = Math.hypot(resource.x - lastCheckX, resource.z - lastCheckZ)
      if (dist > UNLOAD_RADIUS) return
      spawnSync(resource, oreTemplates)
    })
  }

  function despawn(id: string): void {
    pendingIds.delete(id)
    const instance = instances.get(id)
    if (!instance) return
    instance.group.removeFromParent()
    disposeObject3D(instance.group)
    instance.label.removeFromParent()
    instance.labelEl.remove()
    instances.delete(id)
  }

  function recheck(playerX: number, playerZ: number, interestPoints: readonly InterestPoint[]): void {
    lastCheckX = playerX
    lastCheckZ = playerZ
    lastInterestCount = interestPoints.length
    const anchors: InterestPoint[] = [{ x: playerX, z: playerZ }, ...interestPoints]
    const wanted = new Set<string>()
    for (const anchor of anchors) {
      const nearby = resourcesNear(anchor.x, anchor.z, LOAD_RADIUS, seed, env)
      for (const resource of nearby) {
        if (!isVisibleOre(resource.type) || depletedIds.has(resource.id)) continue
        wanted.add(resource.id)
        if (!instances.has(resource.id)) spawn(resource)
      }
    }
    for (const [id, instance] of instances) {
      if (wanted.has(id)) continue
      const nearAnyAnchor = anchors.some(
        (anchor) => Math.hypot(instance.resource.x - anchor.x, instance.resource.z - anchor.z) <= UNLOAD_RADIUS,
      )
      if (!nearAnyAnchor) despawn(id)
    }
  }

  return {
    update(playerX, playerZ, interestPoints = []) {
      if (
        Math.hypot(playerX - lastCheckX, playerZ - lastCheckZ) >= RECHECK_DISTANCE
        || interestPoints.length !== lastInterestCount
      ) {
        recheck(playerX, playerZ, interestPoints)
      }
      for (const instance of instances.values()) {
        const dist = Math.hypot(instance.resource.x - playerX, instance.resource.z - playerZ)
        instance.labelEl.style.opacity = String(labelOpacityForDistance(dist))
      }
    },
    queryNearest(x, z, range) {
      let best: DepositTarget | null = null
      let bestDist = range
      for (const instance of instances.values()) {
        const type = instance.resource.type
        if (!isVisibleOre(type) || instance.remaining <= 0) continue
        const dist = Math.hypot(instance.resource.x - x, instance.resource.z - z)
        if (dist > bestDist) continue
        bestDist = dist
        best = {
          id: instance.resource.id,
          type,
          x: instance.resource.x,
          z: instance.resource.z,
          remaining: instance.remaining,
        }
      }
      return best
    },
    mine(id) {
      const instance = instances.get(id)
      if (!instance) return { ok: false, reason: 'missing' }
      const type = instance.resource.type
      if (!isVisibleOre(type) || instance.remaining <= 0) {
        return { ok: false, reason: 'depleted' }
      }
      instance.remaining -= 1
      const mined = yieldForOre(type)
      if (instance.remaining <= 0) {
        depletedIds.add(id)
        despawn(id)
      } else {
        setLabel(instance)
      }
      return { ok: true, yield: mined, remaining: instance.remaining }
    },
    dispose() {
      disposed = true
      pendingIds.clear()
      depletedIds.clear()
      for (const id of [...instances.keys()]) despawn(id)
    },
  }
}
