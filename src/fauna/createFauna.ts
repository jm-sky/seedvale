import { Group, type Object3D, type Scene, type Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import type { PlayerStealthState } from './playerAwareness'
import {
  disposeObject3D,
  type GltfAsset,
  loadGltfAsset,
  prepareProp,
} from '../assets/loadGltf'
import { isSystemEnabled } from '../debug/debugMode'
import { distanceToSegment } from '../math/segment'
import { createCaveMouth, createThicket, tintPropMaterials } from '../settlement/props'
import { isCoastalPlacement } from '../terrain/coastPlacement'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { skyParamsFromTime } from '../world/dayNight'
import { createSeededRandom } from '../world/parseSeed'
import { ANIMAL_DEFS, AnimalAgent, type AnimalKind, type AnimalLifeStage, type VillageInfo } from './AnimalAgent'
import {
  type PreySpawner,
  SPAWNER_RADIUS,
  shouldDeplete,
  tickSpawnPointRecovery,
  updateSpawners,
} from './AnimalSpawner'
import {
  HERD_CLUSTER_RADIUS,
  HERD_SPECIES,
  JUVENILE_SPAWN_CHANCE,
} from './herdCohesion'
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
    /** `dayNight.elapsedDays` — drives the low-frequency spawn-point
     *  recovery check (plan 125 §8), at most once per in-game day. */
    worldDays: number,
    litFires: readonly { x: number, z: number }[],
    /** Loaded settlements' centers + real footprint radii
     *  (`SettlementsManager.getLoaded()`, plan 080) — wild animals react to
     *  proximity to any of these, see `AnimalAgent.ts`'s village-avoidance/
     *  flee-bias (plan 044 §2.3/§2.4). Owned livestock (horse/cow/sheep/
     *  chicken) isn't spawned here at all — see `settlement/livestock.ts`,
     *  spawned per-settlement instead. */
    villages: readonly VillageInfo[],
    /** Player + nearby NPCs for predator crowd fear (plan 056). Default 1. */
    nearbyHumanCount?: number,
    /** Fauna→player damage callback when a predator bites in contact range. */
    onHumanHit?: (damage: number) => void,
    /** Sneak/movement stealth inputs (plan 124 §4). Defaults to "no effect"
     *  (see `AnimalAgent.update`'s own default) when omitted. */
    playerStealth?: PlayerStealthState,
  ) => void
  dispose: () => void
  getAgents: () => AnimalAgent[]
  getSpawners: () => readonly PreySpawner[]
  /** True once every wolf originally spawned by the wolf den (`WOLF_DEN_ID`,
   *  plan 093 Etap E) is dead — `false` if the den has none tracked yet
   *  (including a failed placement) or any tracked wolf is still alive. */
  isWolfDenCleared: () => boolean
  /** Label suffix (e.g. quest `!`/`?`) for a spawner type's CSS2D label — set
   *  externally (e.g. by a QuestManager), mirrors `NpcAgent.setQuestMarker`. */
  setSpawnerMarker: (type: PreySpawner['type'], marker: string | null) => void
  /** Player "Zniszcz" on a `depleted` spawn point (plan 125 §6) — moves it to
   *  `disabled`, burns its prop dark and carves a small scorch depression.
   *  Caller (`gameLoop.ts`) is responsible for consuming the 4 branches and
   *  placing the fire; returns `false` (no state change, no branches should
   *  be spent) if `spawnerId` isn't found or isn't currently `depleted`. */
  destroySpawner: (spawnerId: string, nowDays: number) => boolean
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

/** [minOffset, maxOffset] *past* the settlement's real footprint radius
 *  (`footprintRadius` — `VILLAGE_SIZE_CONFIG.footprintRadius`, see
 *  `settlement/families.ts`) for each `SpawnProfile` (plan 080) — starts a
 *  bit past `AnimalAgent.ts`'s `VILLAGE_AVOID_MARGIN` so a freshly-spawned
 *  wild animal's own home point isn't already inside the zone its wander
 *  logic then refuses to path back into. Offset widths match the original
 *  flat-radius bands (18/18/21/20); only the anchor changed from a fixed
 *  guess (~20) to the settlement's real boundary, which ranges 22 (`OUTPOST`)
 *  to 72 (`XL`). */
const SPAWN_RING_OFFSET: Record<SpawnProfile, [number, number]> = {
  open: [6, 24],
  meadow: [6, 24],
  forest: [6, 27],
  water: [4, 24],
}

/** [minOffset, maxOffset] past the settlement's real footprint radius for
 *  cave/thicket prey spawners (plan 080) — same reasoning as
 *  `SPAWN_RING_OFFSET`, widths matching the original flat 45–65 band.
 *  Exported so `worldBundle.ts`'s `buildFauna` can size its
 *  `roadCorridorsNear` query to actually cover the (now size-dependent)
 *  spawner ring instead of a fixed guess. */
export const SPAWNER_RING_OFFSET: [number, number] = [25, 45]

/** Minimum distance (world units) between any two wild-fauna spawn points
 *  placed while building one settlement's fauna — ring spawns and cave/
 *  thicket spawners share one running list so e.g. a cave spawner can't land
 *  next to a thicket spawner, or one species' initial spawn next to
 *  another's (plan 080). Not applied to `updateSpawners`'s runtime
 *  respawn-near-spawner call — that's intentionally close to its own
 *  spawner, not a new independent spawn point. */
const MIN_SPAWN_SEPARATION = 10

/** "Zniszcz" burn-site depression (plan 125 §7/§9) — a shallow, small scorch
 *  mark, deliberately shallower/narrower than `CAVE_DEPRESSION_*` below (this
 *  isn't a walk-in opening, just disturbed ground); the large fire + darkened
 *  prop are the primary burnt-site read. */
const BURN_PATCH_RADIUS = 2.5
const BURN_PATCH_DEPTH = 0.35
/** Tint applied to a destroyed spawn point's prop (`tintPropMaterials`, same
 *  technique as `AnimalAgent.markDangerous()`) — dark ash/char, not the
 *  "dangerous" red-black. */
const BURNED_SPAWNER_TINT_HEX = 0x241d17

/** Cave depression carve (plan 083) — a real terrain pit under the rock
 *  ring, replacing the old flat dark prop disc. Sized for a walk-in opening,
 *  not shovel-dig scale (`terrain/dig.ts`'s `DIG_RADIUS`/`DIG_DEPTH_SOIL` are
 *  far too small to read as a cave mouth). */
const CAVE_DEPRESSION_RADIUS = 2.6
const CAVE_DEPRESSION_DEPTH = 1.8
/** Skip carving into terrain that already reads as bare mountain rock — same
 *  threshold `terrain/dig.ts`'s `getDigProfileAt` rejects digging into,
 *  duplicated locally since it's fauna-placement-specific and `dig.ts`
 *  doesn't export it. */
const CAVE_ROCK_MOUNTAIN_RIDGE_THRESHOLD = 0.3
/** Radius (world units) `measureSlope` samples around a cave candidate. */
const CAVE_SLOPE_SAMPLE_RADIUS = 3
/** Minimum height drop across `CAVE_SLOPE_SAMPLE_RADIUS` for a site to count
 *  as "sloped" — below this, the cave falls back to flat-ground placement/
 *  orientation (facing away from the settlement, the pre-083 behavior). */
const CAVE_MIN_SLOPE_DROP = 0.6

/** Steepest-descent direction + height drop across `radius` around (cx, cz)
 *  — 8-direction sample, same shape as `settlement/villagePlanner.ts`'s
 *  `downhillAngle`. `yaw` is Three.js Y-rotation convention (`atan2(dx, dz)`,
 *  matching how `createCaveMouth`'s `mouth.rotation.y` is already set
 *  elsewhere in this file) so an object can be oriented to open toward the
 *  downhill side; `drop` is ~0 on flat ground. Pure — no Three.js dependency
 *  — exported for unit testing. */
export function measureSlope(
  cx: number,
  cz: number,
  radius: number,
  sampleHeight: HeightSampler,
): { yaw: number, drop: number } {
  const centerH = sampleHeight(cx, cz)
  let bestDrop = 0
  let bestYaw = 0
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const dx = Math.cos(angle) * radius
    const dz = Math.sin(angle) * radius
    const drop = centerH - sampleHeight(cx + dx, cz + dz)
    if (drop > bestDrop) {
      bestDrop = drop
      bestYaw = Math.atan2(dx, dz)
    }
  }
  return { yaw: bestYaw, drop: bestDrop }
}

/** Hardcoded prey spawners (cave / thicket) — see docs/plans/archive/2026-08-07--predator-prey-system.md.
 *  `wolfDen` (plan 093 Etap E) piggybacks on the same list/shape purely to
 *  get a placed prop + labeled marker for free — `respawnTime: Infinity`
 *  keeps `updateSpawners` from ever repopulating it; its initial pack is
 *  spawned once, directly, in the placement loop below. */
const SPAWNER_SPECS: { type: PreySpawner['type'], kind: AnimalKind, respawnTime: number, maxPreyCount: number }[] = [
  { type: 'cave', kind: 'deer', respawnTime: 8, maxPreyCount: 3 },
  { type: 'thicket', kind: 'stag', respawnTime: 12, maxPreyCount: 2 },
  { type: 'wolfDen', kind: 'wolf', respawnTime: Infinity, maxPreyCount: 2 },
]

export const SPAWNER_LABELS: Record<PreySpawner['type'], string> = {
  cave: 'jaskinia',
  thicket: 'zagajnik',
  grove: 'gaj',
  wolfDen: 'wilcza jama',
}

/** Wild fauna GLBs (Quaternius pack). Livestock GLBs live in `livestock.ts`. */
export const FAUNA_URLS: Partial<Record<AnimalKind, string>> = {
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
  // `disposeObject3D` checks `sharedGpu` per mesh/material, so it already
  // no-ops safely on anything still cache-shared with the GLB loader — this
  // is unconditional so materials un-shared by e.g. `markDangerous()`'s
  // `tintPropMaterials` clone (plan 110) actually get freed on despawn
  // (matches the existing pattern in `terrain/resourceDeposits.ts`).
  disposeObject3D(agent.mesh)
}

/**
 * Place animals in a ring around the settlement (forest belt).
 * Prefers GLB from `public/models/fauna/` keyed by `userData.animalKind`.
 * `roadSegments` — corridors near home used to keep prey spawners off roads.
 * `footprintRadius` — this settlement's real boundary radius
 * (`VILLAGE_SIZE_CONFIG.footprintRadius`, plan 080) — spawn rings anchor past
 * it instead of a fixed guess, see `SPAWN_RING_OFFSET`/`SPAWNER_RING_OFFSET`.
 * `terrainCarving` — lets the cave spawner cut a real depression into the
 * terrain (plan 083) instead of relying on a flat prop; optional so callers
 * without terrain-modification access (e.g. future tests) still work, just
 * without the carved pit.
 */
export async function createFauna(
  scene: Scene,
  sampleHeight: HeightSampler,
  sampleForestFactor: (x: number, z: number) => number,
  waterLevel: number,
  collidersNear: ColliderSource,
  homeRadius: number,
  settlementCenter: Vector3,
  /** Stable settlement id (`Settlement.id`) — seeds each managed spawn
   *  point's deterministic `PreySpawner.id` (plan 125 §5), independent of
   *  runtime spawn order/rebuilds. */
  settlementId: string,
  seed: number,
  footprintRadius: number,
  roadSegments: readonly RoadCorridorSegment[] = [],
  coast?: {
    sampleContinentalness: (x: number, z: number) => number
    coastThreshold: number
  },
  terrainCarving?: {
    modifyTerrain: (x: number, z: number, radius: number, depth: number) => boolean
    sampleMountainRidge: (x: number, z: number) => number
  },
  /** Reports any wild-fauna death (any cause) by `animalId` — forwarded into
   *  every `AnimalAgent` this factory spawns (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
): Promise<Fauna> {
  const random = createSeededRandom(seed ^ 0xfa11)
  let agents: AnimalAgent[] = []
  /** `animalId`s of the wolf den's initial pack (plan 093 Etap E) — set once
   *  at placement, checked by `isWolfDenCleared()`. Empty if the den failed
   *  to find a valid site (`isWolfDenCleared()` then always reports `false`,
   *  never a false "cleared"). */
  const denWolfAnimalIds = new Set<string>()
  const templates = await loadFaunaTemplates()
  const spawnerMeshes: Object3D[] = []
  /** Managed spawn-point lifecycle state (plan 125), keyed by the stable
   *  `PreySpawner.id` — same objects also live in the `spawners` array below;
   *  this map exists purely for O(1) lookup from `destroySpawner()`/death
   *  accounting instead of a linear scan. */
  const spawnerById = new Map<string, PreySpawner>()
  /** A managed spawn point's prop mesh, keyed by `PreySpawner.id` — lets
   *  `destroySpawner()` tint the right prop without relying on array-index
   *  correlation with `spawnerMeshes`. */
  const spawnerMeshById = new Map<string, Object3D>()
  /** `animalId -> PreySpawner.id` for animals currently alive and generated
   *  by a managed spawn point (plan 125 §4/§5) — populated by `spawnAgent`
   *  when given a `spawnPointId`, consumed (and removed) exactly once by
   *  `handleAnimalDeath` so one animal can never be counted twice. */
  const animalToSpawner = new Map<string, string>()

  /** Wraps the injected `onAnimalDeath` (quest hook, plan 110) with local
   *  spawn-point death accounting (plan 125 §4) — every animal this factory
   *  spawns uses this as its `onDeath`, whether or not it carries a
   *  `spawnPointId`. Cause-independent (player, predator, life-need
   *  starvation): `AnimalAgent.collapse()` is the single call site regardless
   *  of what triggered it. */
  const handleAnimalDeath = (animalId: string): void => {
    const spawnerId = animalToSpawner.get(animalId)
    if (spawnerId) {
      animalToSpawner.delete(animalId)
      const spawner = spawnerById.get(spawnerId)
      if (spawner && spawner.state === 'active') {
        spawner.deathsThisCycle++
        if (shouldDeplete(spawner.deathsThisCycle, spawner.maxPreyCount)) spawner.state = 'depleted'
      }
    }
    onAnimalDeath?.(animalId)
  }

  const onRoad = (x: number, z: number): boolean => {
    for (const seg of roadSegments) {
      if (distanceToSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz) < seg.halfWidth + SPAWNER_ROAD_CLEARANCE) {
        return true
      }
    }
    return false
  }

  /** Random point within [minDist, maxDist] of (cx, cz), clear of water and
   *  a safety bound around (cx, cz) — `filter` adds a habitat preference
   *  (meadow/forest/shoreline) on top, see `SPAWN_RING_OFFSET`/`SPAWNS`. The
   *  safety bound is `homeRadius` by default but never tighter than the
   *  caller's own `maxDist` (plan 080 — `footprintRadius`-anchored rings for
   *  `LG`/`XL` villages can legitimately exceed the historical `homeRadius`
   *  guess, and a bound narrower than the requested ring would make
   *  placement impossible by construction). */
  const findWalkableNear = (
    cx: number,
    cz: number,
    minDist: number,
    maxDist: number,
    filter?: (x: number, z: number) => boolean,
    maxAttempts = 24,
  ): { x: number, z: number } | null => {
    const clampRadius = Math.max(homeRadius - 4, maxDist)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = minDist + random() * (maxDist - minDist)
      const x = cx + Math.cos(angle) * dist
      const z = cz + Math.sin(angle) * dist
      if (Math.abs(x - cx) > clampRadius || Math.abs(z - cz) > clampRadius) continue
      if (sampleHeight(x, z) <= waterLevel + 0.6) continue
      if (filter && !filter(x, z)) continue
      return { x, z }
    }
    return null
  }

  /** Wild-fauna spawn points placed so far this build (ring spawns + cave/
   *  thicket spawners) — `MIN_SPAWN_SEPARATION` rejection reads this, both
   *  loops below push into it (plan 080). */
  const placedSpawnPoints: { x: number, z: number }[] = []
  const farFromOtherSpawns = (x: number, z: number): boolean =>
    placedSpawnPoints.every((p) => Math.hypot(p.x - x, p.z - z) >= MIN_SPAWN_SEPARATION)

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

  /** Per-build counter for `animalId` — unique within this settlement's live
   *  `Fauna` (one instance per game session, see `worldBundle.ts`'s
   *  `buildFauna`), covering both the initial ring spawn and later
   *  spawner-driven respawns below. */
  let nextAnimalId = 0
  /** Per-build counter for `herdId` (plan 118) — mirrors `nextAnimalId`,
   *  only consumed by the ring-spawn loop below (spawner respawns stay
   *  solitary, see its own comment). */
  let nextHerdId = 0
  const spawnAgent = (
    kind: AnimalKind,
    x: number,
    z: number,
    herdId?: string,
    lifeStage?: AnimalLifeStage,
    motherId?: string,
    /** Managed spawn point this animal belongs to (plan 125 §5) — only
     *  passed by spawner-driven creation (initial placement + respawn) below,
     *  never by ring spawns/livestock/the one-time `wolfDen` pack. */
    spawnPointId?: string,
  ): AnimalAgent => {
    const tpl = templates[kind]
    let visual: Object3D | undefined
    let animations = tpl?.animations ?? []
    if (tpl) {
      visual = wrapModel(tpl.clone())
      animations = tpl.animations
    } else {
      visual = PROCEDURAL_FALLBACKS[kind]?.()
    }
    const animalId = `${kind}-${nextAnimalId++}`
    if (spawnPointId) animalToSpawner.set(animalId, spawnPointId)
    return new AnimalAgent(
      ANIMAL_DEFS[kind],
      animalId,
      sampleHeight,
      waterLevel,
      collidersNear,
      x,
      z,
      visual,
      animations,
      undefined,
      sampleForestFactor,
      undefined,
      handleAnimalDeath,
      herdId,
      lifeStage,
      motherId,
      undefined,
      spawnPointId,
    )
  }

  for (const spec of isSystemEnabled('animals') ? SPAWNS : []) {
    const [minOffset, maxOffset] = SPAWN_RING_OFFSET[spec.profile]
    const habitatFilter = habitatFilterFor(spec.profile)
    const filter = (x: number, z: number) =>
      (!habitatFilter || habitatFilter(x, z)) && farFromOtherSpawns(x, z)
    const herdTier = HERD_SPECIES[spec.kind]
    if (herdTier) {
      // Herd spawn (plan 118): one anchor point placed exactly like a
      // solitary spawn below (habitat-filtered, separation-checked against
      // other species' spawns), then the rest of the herd clusters around
      // it — mirrors the one-time `wolfDen` pack pattern further down
      // (`findWalkableNear(pos.x, pos.z, 0, 4)`, no `farFromOtherSpawns` on
      // individual pack members).
      const anchor = findWalkableNear(
        settlementCenter.x,
        settlementCenter.z,
        footprintRadius + minOffset,
        footprintRadius + maxOffset,
        filter,
      )
      if (!anchor) continue
      placedSpawnPoints.push(anchor)
      const herdId = `${spec.kind}-herd-${nextHerdId++}`
      const [clusterMin, clusterMax] = HERD_CLUSTER_RADIUS[herdTier]
      const adults: AnimalAgent[] = []
      const anchorAgent = spawnAgent(spec.kind, anchor.x, anchor.z, herdId, 'adult')
      scene.add(anchorAgent.mesh)
      agents.push(anchorAgent)
      adults.push(anchorAgent)
      for (let i = 1; i < spec.count; i++) {
        const pos = findWalkableNear(anchor.x, anchor.z, clusterMin, clusterMax) ?? anchor
        const agent = spawnAgent(spec.kind, pos.x, pos.z, herdId, 'adult')
        scene.add(agent.mesh)
        agents.push(agent)
        adults.push(agent)
      }
      // 0-2 juveniles per herd, each bound to a random already-placed adult
      // as `motherId` — deliberately rarer than adults (plan 118 §2).
      const juvenileChance = JUVENILE_SPAWN_CHANCE[spec.kind]
      if (juvenileChance) {
        for (const chance of [juvenileChance.first, juvenileChance.second]) {
          if (random() >= chance) continue
          const mother = adults[Math.floor(random() * adults.length)]
          const pos = findWalkableNear(mother.mesh.position.x, mother.mesh.position.z, clusterMin, clusterMax)
            ?? { x: mother.mesh.position.x, z: mother.mesh.position.z }
          const juvenile = spawnAgent(spec.kind, pos.x, pos.z, herdId, 'juvenile', mother.animalId)
          scene.add(juvenile.mesh)
          agents.push(juvenile)
        }
      }
      continue
    }
    for (let i = 0; i < spec.count; i++) {
      const pos = findWalkableNear(
        settlementCenter.x,
        settlementCenter.z,
        footprintRadius + minOffset,
        footprintRadius + maxOffset,
        filter,
      )
      if (!pos) continue
      placedSpawnPoints.push(pos)
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
  const [spawnerMinOffset, spawnerMaxOffset] = SPAWNER_RING_OFFSET
  // `animals` also gates prey spawners (cave/thicket/wolfDen) — when off, no
  // respawn/replenishment can occur either.
  for (const spec of isSystemEnabled('animals') ? SPAWNER_SPECS : []) {
    // Thicket also prefers some forest cover so it doesn't land on open sand/meadow shore.
    const baseFilter = spec.type === 'thicket'
      ? (x: number, z: number) => spawnerSiteOk(x, z) && sampleForestFactor(x, z) > 0.28
      : spawnerSiteOk
    const filter = (x: number, z: number) => baseFilter(x, z) && farFromOtherSpawns(x, z)
    // Cave prefers a sloped site (plan 083 — carved depression reads as cut
    // into a hillside); falls back to any valid flat site if none found.
    const slopedFilter = (x: number, z: number) =>
      filter(x, z) && measureSlope(x, z, CAVE_SLOPE_SAMPLE_RADIUS, sampleHeight).drop >= CAVE_MIN_SLOPE_DROP
    const pos = spec.type === 'cave'
      ? findWalkableNear(
          settlementCenter.x,
          settlementCenter.z,
          footprintRadius + spawnerMinOffset,
          footprintRadius + spawnerMaxOffset,
          slopedFilter,
          72,
        ) ?? findWalkableNear(
          settlementCenter.x,
          settlementCenter.z,
          footprintRadius + spawnerMinOffset,
          footprintRadius + spawnerMaxOffset,
          filter,
          72,
        )
      : findWalkableNear(
          settlementCenter.x,
          settlementCenter.z,
          footprintRadius + spawnerMinOffset,
          footprintRadius + spawnerMaxOffset,
          filter,
          72,
        )
    if (!pos) continue
    placedSpawnPoints.push(pos)
    const spawner: PreySpawner = {
      ...pos,
      ...spec,
      id: `${settlementId}:${spec.type}`,
      timeSinceLastRespawn: 0,
      state: 'active',
      deathsThisCycle: 0,
      disabledAtDay: null,
    }
    spawners.push(spawner)
    spawnerById.set(spawner.id, spawner)

    const groundY = sampleHeight(pos.x, pos.z)
    if (spec.type === 'cave') {
      const slope = measureSlope(pos.x, pos.z, CAVE_SLOPE_SAMPLE_RADIUS, sampleHeight)
      const facingVillage = Math.atan2(pos.x - settlementCenter.x, pos.z - settlementCenter.z)
      if (
        terrainCarving
        && terrainCarving.sampleMountainRidge(pos.x, pos.z) <= CAVE_ROCK_MOUNTAIN_RIDGE_THRESHOLD
      ) {
        terrainCarving.modifyTerrain(pos.x, pos.z, CAVE_DEPRESSION_RADIUS, CAVE_DEPRESSION_DEPTH)
      }
      const mouth = createCaveMouth(1, random())
      mouth.position.set(pos.x, groundY, pos.z)
      // Open side (+Z) faces downhill when a slope was found, otherwise away
      // from the settlement into the wild (pre-083 fallback behavior).
      mouth.rotation.y = slope.drop >= CAVE_MIN_SLOPE_DROP ? slope.yaw : facingVillage
      scene.add(mouth)
      spawnerMeshes.push(mouth)
      spawnerMeshById.set(spawner.id, mouth)
    } else if (spec.type === 'thicket') {
      const thicket = createThicket(1, random())
      thicket.position.set(pos.x, groundY, pos.z)
      thicket.rotation.y = random() * Math.PI * 2
      scene.add(thicket)
      spawnerMeshes.push(thicket)
      spawnerMeshById.set(spawner.id, thicket)
    } else if (spec.type === 'wolfDen') {
      // Reuses the cave-mouth prop (no dedicated den asset yet — plan 093
      // Etap E keeps this deliberately simple; a real `CaveVolume` (plan 104)
      // could replace this visual later without touching the den's identity/
      // quest contract). No terrain carving — that's cave-specific (083).
      const facingVillage = Math.atan2(pos.x - settlementCenter.x, pos.z - settlementCenter.z)
      const mouth = createCaveMouth(1, random())
      mouth.position.set(pos.x, groundY, pos.z)
      mouth.rotation.y = facingVillage
      scene.add(mouth)
      spawnerMeshes.push(mouth)

      // Initial pack, spawned once — see `SPAWNER_SPECS`' comment for why
      // `updateSpawners` never repopulates this spawner.
      for (let i = 0; i < spec.maxPreyCount; i++) {
        const spot = findWalkableNear(pos.x, pos.z, 0, 4) ?? pos
        const wolf = spawnAgent('wolf', spot.x, spot.z)
        scene.add(wolf.mesh)
        agents.push(wolf)
        denWolfAnimalIds.add(wolf.animalId)
      }
    }

    const el = document.createElement('div')
    el.className = 'npc-label'
    el.textContent = SPAWNER_LABELS[spec.type]
    const label = new CSS2DObject(el)
    const labelH = spec.type === 'cave' || spec.type === 'wolfDen'
      ? CAVE_LABEL_HEIGHT
      : spec.type === 'thicket'
        ? THICKET_LABEL_HEIGHT
        : DEFAULT_SPAWNER_LABEL_HEIGHT
    label.position.set(pos.x, groundY + labelH, pos.z)
    scene.add(label)
    spawnerLabels.push({ type: spec.type, object: label, el, marker: null, lastOpacity: -1 })
  }

  /** Last in-game day (floored) recovery was checked — guards the
   *  `disabled`/`recovering` scan below to at most once per in-game day
   *  (plan 125 §9), not per frame. `-1` so the first `update()` call always
   *  runs it once regardless of the starting `worldDays`. */
  let lastRecoveryCheckDay = -1

  return {
    update(dt, observerPos, timeOfDay, worldDays, litFires, villages, nearbyHumanCount = 1, onHumanHit, playerStealth) {
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
          playerStealth,
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
          const agent = spawnAgent(spawner.kind, pos.x, pos.z, undefined, undefined, undefined, spawner.id)
          scene.add(agent.mesh)
          agents.push(agent)
        },
      )

      // Recovery check (plan 125 §8) — at most once per in-game day, and
      // only for spawners actually waiting on it (`disabled`/`recovering`);
      // `tickSpawnPointRecovery` itself no-ops for every other state. Nearby
      // same-kind count reuses `agents` (already iterated above), scoped to
      // `SPAWNER_RADIUS` — no independent per-frame scan.
      const dayIndex = Math.floor(worldDays)
      if (dayIndex !== lastRecoveryCheckDay) {
        lastRecoveryCheckDay = dayIndex
        for (const spawner of spawners) {
          if (spawner.state !== 'disabled' && spawner.state !== 'recovering') continue
          let nearby = 0
          for (const a of agents) {
            if (a.isDead() || a.def.kind !== spawner.kind) continue
            if (Math.hypot(a.mesh.position.x - spawner.x, a.mesh.position.z - spawner.z) < SPAWNER_RADIUS) nearby++
          }
          tickSpawnPointRecovery(spawner, worldDays, nearby)
        }
      }

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
    isWolfDenCleared() {
      if (denWolfAnimalIds.size === 0) return false
      for (const a of agents) {
        if (denWolfAnimalIds.has(a.animalId) && !a.isDead()) return false
      }
      return true
    },
    setSpawnerMarker(type, marker) {
      for (const entry of spawnerLabels) {
        if (entry.type !== type || entry.marker === marker) continue
        entry.marker = marker
        entry.el.textContent = marker
          ? `${SPAWNER_LABELS[type]} · ${marker}`
          : SPAWNER_LABELS[type]
      }
    },
    destroySpawner(spawnerId, nowDays) {
      const spawner = spawnerById.get(spawnerId)
      if (!spawner || spawner.state !== 'depleted') return false
      spawner.state = 'disabled'
      spawner.disabledAtDay = nowDays
      const mesh = spawnerMeshById.get(spawnerId)
      if (mesh) tintPropMaterials(mesh, BURNED_SPAWNER_TINT_HEX)
      terrainCarving?.modifyTerrain(spawner.x, spawner.z, BURN_PATCH_RADIUS, BURN_PATCH_DEPTH)
      return true
    },
  }
}
