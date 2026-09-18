import { Group, type Object3D, type Scene } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { EconomicSourceId } from '../economy/kinds'
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
  isDepleted,
  type MineableOre,
  ORE_YIELD_LABEL,
  recordMined,
  type ResourceDepletionState,
  yieldForOre,
} from './depositMining'
import {
  depositMatchesQueryContext,
  type DepositQueryOptions,
  type MineableDepositDefinition,
  mineableDepositFromNaturalResource,
  querySpatialContext,
  resolveDepositRemaining,
} from './mineableDeposit'
import { type ResourceEnv, resourcesNear } from './naturalResources'

/** Ore-bearing types that get a visible pile in the world — the rest of
 *  `naturalResources.ts`'s pool (fish/fertile_soil/clay/salt/resin/herbs)
 *  stays a data-only signal for settlement generation, same as before this
 *  module existed. Deliberately small, matching the "surface just a few
 *  resources visually, not everything" ask. */
type VisibleOreType = MineableOre

const ORE_COLOR: Record<VisibleOreType, number> = {
  // Rust/hematite red-brown — reads as "iron ore", not generic gray rock.
  iron: 0x8a4a30,
  coal: 0x1c1c1c,
  gold: 0xd4af37,
  // Oxidized copper-orange, distinct from iron's darker rust-brown.
  copper_ore: 0xb5651d,
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

/** Simple string hash (FNV-1a) — deposit ids are strings, but pile placement
 *  wants a numeric seed for `createSeededRandom`. */
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
  definition: MineableDepositDefinition
  group: Object3D
  label: CSS2DObject
  labelEl: HTMLDivElement
  remaining: number
}

export type DepositTarget = {
  id: string
  type: MineableOre
  x: number
  y: number
  z: number
  spatialContext: MineableDepositDefinition['spatialContext']
  remaining: number
  /** See `MineableDepositDefinition.economicSourceId` (plan settlements-004). */
  economicSourceId?: EconomicSourceId
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

/**
 * Landmark-owned (and other non-scatter) definitions plus cave-floor
 * sampling. Getters so `createCaves()` can land after this runtime in
 * `worldBundle.ts` without a second deposit manager.
 *
 * @domain world
 */
export type ResourceDepositSources = {
  extraDefinitions?: () => readonly MineableDepositDefinition[]
  caveFloorY?: (caveId: string, x: number, y: number, z: number) => number | null
}

export type ResourceDeposits = {
  /** `interestPoints` — extra anchors (settlement centers) that keep nearby
   *  deposits loaded even while the player is far away; label fade still
   *  follows the player only. */
  update: (playerX: number, playerZ: number, interestPoints?: readonly InterestPoint[]) => void
  /** Nearest spatially valid ore deposit the player (or an NPC) can mine.
   *  `options.spatialContext` defaults to surface. */
  queryNearest: (
    x: number,
    z: number,
    range: number,
    options?: DepositQueryOptions,
  ) => DepositTarget | null
  mine: (id: string) => MineResult
  /** Canonical deposit-id → `economicSourceId` lookup (plan settlements-004),
   *  covering both streamed and landmark-owned `extraDefinitions` deposits.
   *  `null` for an unknown id or an ordinary unattributed deposit. */
  resolveEconomicSourceId: (id: string) => EconomicSourceId | null
  dispose: () => void
}

/** Narrow view over `ResourceDeposits` for NPC mining (plan 131) — mirrors
 *  `SettlementForestHooks`' shape: just the domain operations a settlement
 *  needs, not `update`/`dispose` (owned by `WorldBundle`). */
export type SettlementMiningHooks = {
  queryNearest: ResourceDeposits['queryNearest']
  mine: ResourceDeposits['mine']
  resolveEconomicSourceId: ResourceDeposits['resolveEconomicSourceId']
}

function targetFromDefinition(
  definition: MineableDepositDefinition,
  remaining: number,
): DepositTarget {
  return {
    id: definition.id,
    type: definition.type,
    x: definition.x,
    y: definition.y,
    z: definition.z,
    spatialContext: definition.spatialContext,
    remaining,
    ...(definition.economicSourceId ? { economicSourceId: definition.economicSourceId } : {}),
  }
}

/**
 * Streams ore piles (GLB resource nodes + a name label) into the world near
 * the player, one per mineable deposit definition — ordinary surface ores
 * plus landmark-owned cave/surface nodes (plan world-018). Pickaxe mining
 * consumes remaining hits through caller-owned `depletionState`.
 *
 * @domain world
 */
export function createResourceDeposits(
  scene: Scene,
  env: ResourceEnv,
  seed: number,
  depletionState: ResourceDepletionState,
  sources: ResourceDepositSources = {},
): ResourceDeposits {
  const extraDefinitions = sources.extraDefinitions ?? (() => [])
  const instances = new Map<string, DepositInstance>()
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

  function groundY(definition: MineableDepositDefinition, px: number, pz: number): number | null {
    if (definition.spatialContext.kind === 'cave') {
      return sources.caveFloorY?.(definition.spatialContext.caveId, px, definition.y, pz) ?? definition.y
    }
    const h = env.sampleHeight(px, pz)
    if (h <= env.waterLevel + 0.4) return null
    return h
  }

  function lookupDefinition(id: string): MineableDepositDefinition | null {
    const instance = instances.get(id)
    if (instance) return instance.definition
    return extraDefinitions().find((definition) => definition.id === id) ?? null
  }

  function setLabel(instance: DepositInstance): void {
    instance.labelEl.textContent = `${ORE_YIELD_LABEL[instance.definition.type]} (${instance.remaining})`
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

  function spawnSync(definition: MineableDepositDefinition, oreTemplates: OreTemplates): void {
    if (disposed) return
    if (isDepleted(depletionState, definition.id) || instances.has(definition.id)) return
    const random = createSeededRandom(hashId(definition.id))
    const group = new Group()
    group.name = `resourceDeposit:${definition.id}`

    const pileCount = PILES_MIN + Math.floor(random() * (PILES_MAX - PILES_MIN + 1))
    const scatterMax = definition.radius * PILE_SCATTER_RADIUS_FRACTION
    const scatterMin = scatterMax * PILE_SCATTER_MIN_FRACTION
    for (let i = 0; i < pileCount; i++) {
      const angle = random() * Math.PI * 2
      const dist = scatterMin + random() * (scatterMax - scatterMin)
      const px = definition.x + Math.cos(angle) * dist
      const pz = definition.z + Math.sin(angle) * dist
      const h = groundY(definition, px, pz)
      if (h == null) continue
      const scale = 0.85 + random() * 0.35
      const yaw = random() * Math.PI * 2
      const pile = createPile(definition.type, scale, yaw, oreTemplates)
      placeOnGround(pile, px, pz, () => h)
      group.add(pile)
    }
    scene.add(group)

    const remaining = resolveDepositRemaining(depletionState, definition)
    const labelEl = document.createElement('div')
    labelEl.className = 'npc-label'
    const label = new CSS2DObject(labelEl)
    label.position.set(definition.x, definition.y + 0.6, definition.z)
    scene.add(label)

    const instance: DepositInstance = { definition, group, label, labelEl, remaining }
    setLabel(instance)
    instances.set(definition.id, instance)
  }

  function spawn(definition: MineableDepositDefinition): void {
    if (disposed || isDepleted(depletionState, definition.id)) return
    if (instances.has(definition.id) || pendingIds.has(definition.id)) return
    if (templates) {
      spawnSync(definition, templates)
      return
    }
    pendingIds.add(definition.id)
    void getTemplates().then((oreTemplates) => {
      pendingIds.delete(definition.id)
      if (disposed) return
      const dist = Math.hypot(definition.x - lastCheckX, definition.z - lastCheckZ)
      if (dist > UNLOAD_RADIUS) return
      spawnSync(definition, oreTemplates)
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

  function consider(definition: MineableDepositDefinition | null, wanted: Set<string>): void {
    if (!definition || isDepleted(depletionState, definition.id)) return
    wanted.add(definition.id)
    if (!instances.has(definition.id)) spawn(definition)
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
        consider(mineableDepositFromNaturalResource(resource, env.sampleHeight), wanted)
      }
    }
    for (const definition of extraDefinitions()) {
      const nearAnyAnchor = anchors.some(
        (anchor) => Math.hypot(definition.x - anchor.x, definition.z - anchor.z) <= LOAD_RADIUS,
      )
      if (nearAnyAnchor) consider(definition, wanted)
    }
    for (const [id, instance] of instances) {
      if (wanted.has(id)) continue
      const nearAnyAnchor = anchors.some(
        (anchor) => Math.hypot(instance.definition.x - anchor.x, instance.definition.z - anchor.z) <= UNLOAD_RADIUS,
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
        const dist = Math.hypot(instance.definition.x - playerX, instance.definition.z - playerZ)
        instance.labelEl.style.opacity = String(labelOpacityForDistance(dist))
      }
    },
    queryNearest(x, z, range, options) {
      const queryContext = querySpatialContext(options)
      let best: DepositTarget | null = null
      let bestDist = range
      const seen = new Set<string>()

      const considerTarget = (definition: MineableDepositDefinition, remaining: number): void => {
        if (seen.has(definition.id) || remaining <= 0) return
        seen.add(definition.id)
        if (!depositMatchesQueryContext(definition, queryContext)) return
        const dist = Math.hypot(definition.x - x, definition.z - z)
        if (dist > bestDist) return
        bestDist = dist
        best = targetFromDefinition(definition, remaining)
      }

      for (const instance of instances.values()) {
        considerTarget(instance.definition, instance.remaining)
      }
      for (const definition of extraDefinitions()) {
        considerTarget(definition, resolveDepositRemaining(depletionState, definition))
      }
      return best
    },
    mine(id) {
      const instance = instances.get(id)
      const definition = lookupDefinition(id)
      if (!definition) return { ok: false, reason: 'missing' }
      const remaining = instance?.remaining ?? resolveDepositRemaining(depletionState, definition)
      if (remaining <= 0) return { ok: false, reason: 'depleted' }
      const next = remaining - 1
      recordMined(depletionState, id, next)
      if (instance) {
        instance.remaining = next
        if (next <= 0) despawn(id)
        else setLabel(instance)
      }
      return { ok: true, yield: yieldForOre(definition.type), remaining: next }
    },
    resolveEconomicSourceId(id) {
      return lookupDefinition(id)?.economicSourceId ?? null
    },
    dispose() {
      disposed = true
      pendingIds.clear()
      for (const id of [...instances.keys()]) despawn(id)
    },
  }
}
