import { Group, type Object3D, type Scene, type Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
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
import { ANIMAL_DEFS, AnimalAgent, type AnimalKind, type VillageInfo } from './AnimalAgent'
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

/** Hardcoded prey spawners (cave / thicket) — see docs/plans/archive/2026-08-07--predator-prey-system.md. */
const SPAWNER_SPECS: { type: PreySpawner['type'], kind: AnimalKind, respawnTime: number, maxPreyCount: number }[] = [
  { type: 'cave', kind: 'deer', respawnTime: 8, maxPreyCount: 3 },
  { type: 'thicket', kind: 'stag', respawnTime: 12, maxPreyCount: 2 },
]

export const SPAWNER_LABELS: Record<PreySpawner['type'], string> = {
  cave: 'jaskinia',
  thicket: 'zagajnik',
  grove: 'gaj',
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
  // GLB clones share GPU resources with the loader cache — only free capsules.
  if (agent.mesh.userData.faunaCapsule) disposeObject3D(agent.mesh)
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
    return new AnimalAgent(
      ANIMAL_DEFS[kind],
      sampleHeight,
      waterLevel,
      collidersNear,
      x,
      z,
      visual,
      animations,
      undefined,
      sampleForestFactor,
    )
  }

  for (const spec of SPAWNS) {
    const [minOffset, maxOffset] = SPAWN_RING_OFFSET[spec.profile]
    const habitatFilter = habitatFilterFor(spec.profile)
    const filter = (x: number, z: number) =>
      (!habitatFilter || habitatFilter(x, z)) && farFromOtherSpawns(x, z)
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
  for (const spec of SPAWNER_SPECS) {
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
    spawners.push({ ...pos, ...spec, timeSinceLastRespawn: 0 })

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
