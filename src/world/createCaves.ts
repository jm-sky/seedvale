import * as THREE from 'three'
import type { VillageTorch } from '../settlement/houseLighting'
import type { ChunkManager } from '../terrain/chunkManager'
import type { CaveArchetype } from './caves/caveArchetype'
import type { CaveTopology } from './caves/caveTopology'
import type { DungeonChamber } from './caves/dungeonChambers'
import { disposeObject3D } from '../assets/loadGltf'
import { isBootMarkMode, isSystemEnabled } from '../debug/debugMode'
import { type CaveGroundQueryDebug, writeHitSnapshot } from '../debug/playerGroundTrace'
import { getMonitor } from '../perf/active'
import { villageSizeConfig } from '../settlement/families'
import { cellsWithinRadius, SETTLEMENT_GRID_STEP } from '../settlement/settlementGenerator'
import { useBootMark } from '../shared/bootMark'
import { assignCaveArchetypes } from './caves/caveArchetype'
import {
  type CaveContentAnchor,
  resolveCaveContentAnchors,
} from './caves/caveContentAnchors'
import {
  buildDungeonHeightfieldWithPool,
  type CaveUndergroundPool,
} from './caves/caveUndergroundPool'
import {
  type CaveUndergroundPoolPresentation,
  createCaveUndergroundPoolPresentation,
} from './caves/caveUndergroundPoolPresentation'
import { dungeonChambersFromTopology } from './caves/dungeonChambers'
import { createWaterMaterial } from './waterMaterial'

export type { CaveContentAnchor }
export type { CaveTraversalDescriptor, CaveTraversalPoint } from './caves/caveHabitat'
export type { CaveUndergroundPool } from './caves/caveUndergroundPool'
export type { DungeonChamber, DungeonChamberClass } from './caves/dungeonChambers'
import {
  CAVE_ADVENTURE_PROPS_GROUP_NAME,
  CAVE_ADVENTURE_PROPS_USERDATA_KEY,
  presentationAnchorsFromContent,
} from './caves/caveAdventureProps'
import {
  applyCaveGroundHysteresis,
  applyCaveInteriorHysteresis,
  CAVE_OCCUPANCY_EPS,
  type CaveGroundHit,
  type CaveVerticalInterval,
} from './caves/caveGroundQuery'
import {
  type CaveTraversalDescriptor,
  type CaveTraversalPoint,
  resolveCaveRouteBetweenNodes,
  resolveCaveTraversal,
  type ResolveCaveTraversalOptions,
} from './caves/caveHabitat'
import {
  createCaveHeightfieldMaterial,
  disposeCaveHeightfieldMaterialGpu,
} from './caves/caveHeightfieldMaterial'
import {
  createCaveHeightfieldPresentation,
  createMouthUndersideMaskMaterial,
} from './caves/caveHeightfieldPresentation'
import {
  heightfieldGroundColumn,
  heightfieldInteriorAt,
  heightfieldOccupancyAt,
  heightfieldStandingClearance,
  queryHeightfieldGround,
  resolveHeightfieldHorizontal,
} from './caves/caveHeightfieldQuery'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  sampleHeightfieldAt,
  type SurfaceSampler,
} from './caves/caveHeightfieldRepresentation'
import {
  type CaveInteriorRockPlacement,
  resolveCaveInteriorRocks,
} from './caves/caveInteriorRocks'
import {
  type CaveStreamingStats,
  createCavePresentationQueue,
  createCaveStreamingController,
} from './caves/cavePresentationLifecycle'
import { caveTerrainCutout } from './caves/caveTerrainCutout'
import {
  MOUTH_INTERIOR_ALONG,
  mouthAlong,
  mouthCarveDepth,
  mouthCarveDiscs,
  mouthLateral,
} from './caves/mouthCarve'
import { buildProductionCaveTopology } from './caves/productionTopology'
import { topologyToCaveDefinition } from './caves/topologyAdapter'
import { type CaveBounds, type CaveDefinition } from './caveVolume'
import { type LargeCaveSite, pickLargeCaveSites } from './largeCaves'
import { createNullPointLightBudget, type PointLightBudget } from './pointLightBudget'
import type { Scene } from 'three'

/** Presentation builds run synchronously on the main thread; this many
 *  caves may build in one `update()` call. Activations are rare and
 *  nearest-first, so one per frame keeps any hitch to a single cave. */
const PRESENTATION_BUILDS_PER_UPDATE = 1

/** World-scale grid cell (independent of the terrain chunk grid) used only
 *  to narrow streaming candidates — not cave identity/generation. */
const CAVE_GRID_CELL = 500

/** Independent two-sample interior confirmation slots. Fog uses `camera`;
 *  audio / player-facing callers use `player` (the default). */
export type CaveInteriorQueryChannel = 'player' | 'camera'

export type Caves = {
  definitions: () => readonly CaveDefinition[]
  /** Streams cave presentation in/out around the observer
   *  (player) position — call once per frame. Cheap: a 3x3 world-grid
   *  lookup, never a scan of every cave. */
  update: (observerX: number, observerZ: number, dt?: number) => void
  /** Y-aware player ground query over the heightfield (world-terrain-019):
   *  the floor returned is the rendered floor. `null` outside cave space,
   *  including a surface entity above a tunnel. Player-stateful: includes
   *  underground-miss hysteresis — call once per frame from the player. */
  queryGround: (x: number, y: number, z: number) => CaveGroundHit | null
  /**
   * Last `queryGround` breakdown (reused object, mutated in place).
   * Debug ground-trace only — gameplay must use `queryGround` / `occupancyAt`.
   */
  peekGroundQueryDebug: () => CaveGroundQueryDebug
  /** Debug movement-trace only — bilinear heightfield sample at `(x,z)` for
   *  the nearest cave field (smallest outside-grid distance). */
  peekHeightfieldMovementSample: (x: number, z: number, playerY: number) => {
    outsideGrid: boolean
    openSky: boolean
    gap: number
    floorY: number
    ceilY: number
    surfaceY: number
    playerY: number
  } | null
  /** Strict heightfield occupancy — no floor grace, no hysteresis, stateless.
   *  `null` is solid rock / outside cave void / a surface entity above an
   *  underground tunnel; `openSky` at the mouth. Camera boom and swim
   *  eligibility share this. */
  occupancyAt: (x: number, y: number, z: number) => CaveVerticalInterval | null
  /**
   * Entity-neutral horizontal cave containment (world-terrain-019): pushes
   * an XZ capsule of `radius` that needs `entityHeight` of clearance out of
   * rock and the low rounded fringe of every cave, along the heightfield's
   * `gap` gradient. Identity outdoors, on the hillside above a tunnel
   * (`y` above the walk surface) and in the open-sky mouth. Stateless — no
   * hysteresis, no teleport-back. Runs *after* ordinary world colliders.
   */
  resolveHorizontal: (x: number, z: number, y: number, radius: number, entityHeight: number) => { x: number, z: number }
  /**
   * Hysteretic cave-interior flag. Approach/mouth portal occupancy is not
   * interior. Each channel keeps its own two-sample confirmation so camera
   * boom (scene fog) and player body (audio) cannot contaminate each other
   * at the mouth. Call at most once per frame per channel.
   */
  queryInterior: (x: number, y: number, z: number, channel?: CaveInteriorQueryChannel) => boolean
  /**
   * Presentation/relevance counters (B4). Debug / tests — gameplay must use
   * `queryGround` / `occupancyAt`, never this. `queuedJobs` counts pending
   * main-thread heightfield builds; there is no async/in-flight path since
   * world-terrain-019 B.
   */
  peekStreamingDebug: () => CaveStreamingStats & { queuedJobs: number }
  /** `occupancyAt(...) !== null`. Not hysteretic `queryGround` — torch /
   *  audio callers must not mutate the player's floor hysteresis. */
  contains: (x: number, y: number, z: number) => boolean
  /** Y-blind heightfield floor / ceiling at `(x, z)` — both from the same
   *  cave sample (lowest floor wins where cave bounds overlap). Player
   *  ground uses `queryGround` — do not route `CaveGroundQuery` through
   *  these. */
  sampleFloor: (x: number, z: number) => number | null
  sampleCeiling: (x: number, z: number) => number | null
  /** Which production recipe built this cave (plan world-terrain-020).
   *  `null` for an unknown id. Runtime/content metadata only — never a
   *  spatial query, and deliberately not part of `CaveTopology`, which stays
   *  representation-neutral. */
  archetypeOf: (caveId: string) => CaveArchetype | null
  /**
   * Deterministic adventure content anchors for every accepted cave
   * (plan world-terrain-020 Stage B). Natural caves contribute nothing.
   * Independent of presentation streaming — these are world definitions,
   * not meshes. Frozen snapshots; callers must not mutate them.
   */
  contentAnchors: () => readonly CaveContentAnchor[]
  /** Content anchors of one cave. Empty for natural caves and unknown ids. */
  contentAnchorsOf: (caveId: string) => readonly CaveContentAnchor[]
  /**
   * Stable dungeon chamber view for later fauna/pool plans (world-terrain-024).
   * Empty for non-dungeon caves and unknown ids. Identity is the topology
   * node id; classification is derived from those ids, never array position.
   * Independent of presentation streaming.
   */
  dungeonChambersOf: (caveId: string) => readonly DungeonChamber[]
  /**
   * Deterministic shallow underground pool for an accepted `dungeon` cave
   * (plan world-terrain-025). `null` for natural/adventure caves and unknown
   * ids. Independent of presentation streaming.
   */
  undergroundPoolOf: (caveId: string) => CaveUndergroundPool | null
  /**
   * World-owned cave-scoped semantic/traversal contract (plan fauna-019):
   * an interior home anchor and the deterministic route to the entrance for
   * one cave, resolved directly against its retained topology/heightfield —
   * O(1) via `caveId`, no scan of every cave, no dependency on presentation.
   * `entityHeight` is the resolving occupant's own standing clearance
   * requirement; `null` when the cave id is unknown or no chamber candidate
   * is standable for that height. Never persisted — re-resolve after a
   * `WorldBundle` rebuild.
   */
  resolveHabitat: (
    caveId: string,
    entityHeight: number,
    options?: ResolveCaveTraversalOptions,
  ) => CaveTraversalDescriptor | null
  /** Floor-snapped route between two topology node ids in one cave (plan fauna-027). */
  resolveRouteBetween: (
    caveId: string,
    fromNodeId: string,
    toNodeId: string,
  ) => readonly CaveTraversalPoint[] | null
  /**
   * Stateless, cave-scoped ground query for a known occupant of `caveId` —
   * the fauna-facing counterpart of `queryGround`, without its player-only
   * underground-miss hysteresis. `null` for an unknown cave id or outside
   * that cave's void.
   */
  queryGroundIn: (caveId: string, x: number, y: number, z: number) => CaveGroundHit | null
  /**
   * Cave-scoped horizontal containment for a known occupant of `caveId` —
   * the fauna-facing counterpart of `resolveHorizontal`, resolved against
   * only that cave's own field. Identity (`{ x, z }` unchanged) for an
   * unknown cave id.
   */
  resolveHorizontalIn: (
    caveId: string,
    x: number,
    z: number,
    y: number,
    radius: number,
    entityHeight: number,
  ) => { x: number, z: number }
  dispose: () => void
}

type CaveRuntime = {
  /** Recipe this cave was actually built and accepted with — deterministic
   *  from the world seed, the existing cave sites and the home settlement,
   *  so it is never persisted. */
  archetype: CaveArchetype
  topology: CaveTopology
  definition: CaveDefinition
  /** The one spatial authority (world-terrain-019): presentation, terrain
   *  mouth, ground / floor / ceiling, strict occupancy, horizontal
   *  containment, interior and camera space all read this. */
  heightfield: CaveHeightfieldRepresentation
  /** Deterministic sampler the heightfield was built against:
   *  `sampleBaseHeight - mouthCarveDepth`. Presentation, mask, framing and
   *  the terrain cutout all evaluate the mouth contour with this one. */
  walkSurfaceAt: SurfaceSampler
  /** Adventure content placements resolved against `heightfield`. Empty for
   *  `natural`. Frozen; never mutated after construction. */
  contentAnchors: readonly CaveContentAnchor[]
  /** Generic interior rock/boulder clutter (world-terrain-022), resolved
   *  against `heightfield` and `contentAnchors`. Empty when
   *  `?debugDisableSystems=caveInteriorRocks` disables the system. Frozen;
   *  never mutated after construction. */
  interiorRocks: readonly CaveInteriorRockPlacement[]
  /** Frozen dungeon chamber view. Empty unless `archetype === 'dungeon'`. */
  dungeonChambers: readonly DungeonChamber[]
  /** Frozen dungeon pool contract. `null` unless `archetype === 'dungeon'`. */
  undergroundPool: CaveUndergroundPool | null
}

function gridKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

function gridCellOf(x: number, z: number): { cx: number, cz: number } {
  return { cx: Math.floor(x / CAVE_GRID_CELL), cz: Math.floor(z / CAVE_GRID_CELL) }
}

function distanceToBoundsXZ(bounds: CaveBounds, x: number, z: number): number {
  const cx = Math.max(bounds.minX, Math.min(bounds.maxX, x))
  const cz = Math.max(bounds.minZ, Math.min(bounds.maxZ, z))
  return Math.hypot(x - cx, z - cz)
}

/** One registration for every cave's mouth cutout — cutouts are static
 *  world-build state, registered once after heightfields exist. */
const TERRAIN_CUTOUT_OWNER_KEY = 'caves'

/**
 * Owns the Cave V2 subsystem (plan world-terrain-008 Milestone B4, plus the
 * world-terrain-019 heightfield migration): deterministic production
 * `CaveTopology`s, one retained `CaveHeightfieldRepresentation` per cave —
 * the single spatial authority for presentation, terrain mouth, ground /
 * floor / ceiling, strict occupancy, horizontal containment, interior and
 * camera space — and streamed heightfield presentation (synchronous
 * main-thread mesh assembly, nearest-first). There are no cave wall
 * colliders: lateral containment is `resolveHorizontal` over the same
 * field the mesh renders, so gameplay stays coherent with what is visible.
 *
 * The mouth is a real hole: every cave registers a `TerrainCutout` with
 * `ChunkManager` (`caveTerrainCutout.ts`) on the same `mouthOpeningAt`
 * contour the cave ceiling is clipped on, and the existing `mouthCarveDiscs`
 * recess still shapes the walk surface / approach.
 *
 * Placement reuses `pickLargeCaveSites()` unchanged; topology generation and
 * terrain acceptance are owned by `productionTopology.ts`. All spatial
 * queries go through `caveHeightfieldQuery.ts`; per-entity continuity
 * (ground underground-miss hysteresis, two-sample interior confirmation)
 * is `caveGroundQuery.ts` and is player-stateful here. `CaveVolume` is not
 * consulted. `topologyToCaveDefinition` remains only for `definitions()` /
 * location catalog / streaming bounds. Adventure caves also expose
 * deterministic interior content anchors (`contentAnchors` /
 * `contentAnchorsOf`) resolved against each cave's own heightfield — world
 * definitions, not presentation, and never a second spatial representation.
 * Dungeon caves additionally expose a read-only chamber view
 * (`dungeonChambersOf`) derived from the same retained topology.
 *
 * Same lifecycle as `WorldBundle` (create/dispose alongside it, never
 * survives a rebuild).
 *
 * @system caves
 * @role Owns cave topologies, retained heightfield representations
 *  (presentation mesh + terrain mouth cutout + every spatial query),
 *  streamed interior presentation, and deterministic adventure content
 *  anchors; `PlayerController` ground goes through `queryGround`, lateral
 *  containment through `resolveHorizontal`, camera and swim eligibility
 *  through `occupancyAt`. `queryInterior` is the hysteretic cave-interior
 *  signal: `player` (default, audio) and `camera` (scene fog) keep separate
 *  confirmation slots.
 * @owns Caves
 * @lifecycle rebuild
 */
export function createCaves(
  scene: Scene,
  chunkManager: ChunkManager,
  seed: number,
  homeRadius: number,
  coastThreshold: number,
  pointLightBudget: PointLightBudget = createNullPointLightBudget(),
): Caves {
  const homeFootprint = Math.max(homeRadius, villageSizeConfig('MD').footprintRadius)
  const villages = cellsWithinRadius({ gx: 0, gz: 0 }, 3).map((cell) => ({
    x: cell.gx * SETTLEMENT_GRID_STEP,
    z: cell.gz * SETTLEMENT_GRID_STEP,
    radius: cell.gx === 0 && cell.gz === 0 ? homeFootprint : villageSizeConfig('MD').footprintRadius,
  }))

  const sites = pickLargeCaveSites({
    seed,
    sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
    sampleContinentalness: (x, z) => chunkManager.sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => chunkManager.sampleMountainRidge(x, z),
    waterLevel: chunkManager.waterLevel,
    coastThreshold,
    roadsNear: (x, z, querySize) => chunkManager.roadCorridorsNear(x, z, querySize),
    villages,
  })

  // Deterministic analytic surface — `sampleHeight` reads the chunk tile once
  // a chunk is resident, so topology would otherwise depend on streaming
  // order (it is built on activation, not at world build).
  const analyticSurfaceHeight = (x: number, z: number): number => chunkManager.sampleBaseHeight(x, z)

  // Topology + heightfield are computed up front and must be available to
  // gameplay queries even when the cave is not activated. Presentation
  // geometry stays lazy on streaming.
  const { bootMark, bootMarkEnd } = useBootMark('createCaves')
  const mouthRocksEnabled = isSystemEnabled('caveMouthRocks')
  const interiorRocksEnabled = isSystemEnabled('caveInteriorRocks')
  const v2ByCaveId = new Map<string, CaveRuntime>()

  bootMark('cave.topology')
  const buildTopology = (site: LargeCaveSite, archetype: CaveArchetype): CaveTopology | null =>
    buildProductionCaveTopology({
      seed,
      site,
      archetype,
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: analyticSurfaceHeight,
    })

  // Home-area adventure guarantee, then the further dungeon guarantee, plus
  // per-site dungeon/adventure rolls (plans world-terrain-020 / 024) —
  // ordering and rolls are pure and deterministic in `caveArchetype.ts`;
  // acceptance stays here, owned by the topology builders. No second siting
  // pass, no synthesized site.
  const accepted = assignCaveArchetypes(seed, sites, buildTopology)
  bootMarkEnd('cave.topology')

  bootMark('cave.heightfield')
  for (const { topology, archetype } of accepted) {
    const walkSurfaceAt: SurfaceSampler = (x, z) => analyticSurfaceHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
    let heightfield: CaveHeightfieldRepresentation
    let undergroundPool: CaveUndergroundPool | null = null
    if (archetype === 'dungeon') {
      const built = buildDungeonHeightfieldWithPool(topology, walkSurfaceAt)
      if (!built) {
        console.warn(`[caves] dungeon ${topology.caveId} missing pool after acceptance — skipping cave`)
        continue
      }
      heightfield = built.heightfield
      undergroundPool = built.pool
    } else {
      heightfield = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt).heightfield
    }
    const contentAnchors = resolveCaveContentAnchors({ archetype, topology, heightfield })
    v2ByCaveId.set(topology.caveId, {
      archetype,
      topology,
      definition: topologyToCaveDefinition(topology),
      heightfield,
      walkSurfaceAt,
      contentAnchors,
      // Presentation-only, so skip the CPU work entirely when the debug
      // system disables it — unlike `contentAnchors`, it never renders.
      interiorRocks: interiorRocksEnabled
        ? resolveCaveInteriorRocks({ archetype, topology, heightfield, contentAnchors })
        : [],
      dungeonChambers: dungeonChambersFromTopology(topology),
      undergroundPool,
    })
  }
  bootMarkEnd('cave.heightfield')

  const runtimes: readonly CaveRuntime[] = [...v2ByCaveId.values()]
  const definitions: CaveDefinition[] = runtimes.map((v) => v.definition)
  if (definitions.length === 0) {
    console.warn('[caves] no cave sites accepted for this seed — try a different ?seed=')
  }

  // Local entrance recess only — discs come from `deriveMouthGeometry` /
  // `mouthCarveDiscs` so carve matches the gameplay portal (B3).
  for (const def of definitions) {
    for (const disc of mouthCarveDiscs(def.entrance)) {
      chunkManager.modifyTerrain(disc.x, disc.z, disc.radius, disc.depth, 'system')
    }
  }

  // Real aperture (world-terrain-019 B): a persistent terrain cutout on the
  // shared `mouthOpeningAt` contour, owned by the chunk lifecycle so it
  // survives unload/reload and every re-mesh path. Narrow descriptor only —
  // the representation itself never crosses into terrain code.
  bootMark('cave.terrainCutout')
  const terrainCutouts = runtimes.flatMap((runtime) => {
    const cutout = caveTerrainCutout(runtime.heightfield, runtime.walkSurfaceAt)
    return cutout ? [cutout] : []
  })
  chunkManager.registerTerrainCutouts(TERRAIN_CUTOUT_OWNER_KEY, terrainCutouts)
  bootMarkEnd('cave.terrainCutout')

  const grid = new Map<string, CaveDefinition[]>()
  for (const def of definitions) {
    const { cx, cz } = gridCellOf(def.entrance.x, def.entrance.z)
    const key = gridKey(cx, cz)
    let bucket = grid.get(key)
    if (!bucket) {
      bucket = []
      grid.set(key, bucket)
    }
    bucket.push(def)
  }

  const presentations = new Map<string, THREE.Object3D>()
  const adventureLanternTorchesByCave = new Map<string, readonly VillageTorch[]>()
  // Shared across every cave presentation; disposed once in `dispose()`,
  // never by `disposeObject3D()` (`sharedGpu`).
  const caveMaterial = createCaveHeightfieldMaterial({
    surfaceDetail: isSystemEnabled('caveSurfaceDetail'),
  })
  caveMaterial.userData.sharedGpu = true
  const maskMaterial = createMouthUndersideMaskMaterial()
  maskMaterial.userData.sharedGpu = true
  const poolWaterMaterial = createWaterMaterial({ ocean: 0, waterLevel: 0 })
  poolWaterMaterial.userData.sharedGpu = true
  const poolPresentationsByCave = new Map<string, CaveUndergroundPoolPresentation>()
  const CAVE_POOL_PRESENTATION_KEY = 'caveUndergroundPoolPresentation'
  let lastGroundHit: CaveGroundHit | null = null
  const interiorHysteresis: Record<CaveInteriorQueryChannel, { lastRaw: boolean | null, confirmed: boolean }> = {
    player: { lastRaw: null, confirmed: false },
    camera: { lastRaw: null, confirmed: false },
  }
  /** Cave the remembered `lastGroundHit` belongs to — debug trace `caveId`
   *  only; ground resolution never reads it. Cleared with the hit. */
  let lastHitRuntime: CaveRuntime | null = null
  const groundQueryDebug: CaveGroundQueryDebug = {
    raw: null,
    lastHitBefore: null,
    resolved: null,
    source: 'surface',
    surfaceY: 0,
    occupancy: false,
    queryInterior: false,
    caveId: null,
    along: null,
    lateral: null,
  }
  const rawHitSlot = { floorY: 0, ceilingY: 0, openSky: false }
  const lastHitSlot = { floorY: 0, ceilingY: 0, openSky: false }
  const resolvedHitSlot = { floorY: 0, ceilingY: 0, openSky: false }

  function writeGroundQueryDebug(
    x: number,
    y: number,
    z: number,
    raw: CaveGroundHit | null,
    lastHitBefore: CaveGroundHit | null,
    resolved: CaveGroundHit | null,
    surfaceY: number,
    runtime: CaveRuntime | null,
  ): void {
    const occupancy = raw != null
      && y >= raw.floorY - CAVE_OCCUPANCY_EPS
      && y <= raw.ceilingY
    const entrance = runtime?.topology.entrance
    const along = entrance ? mouthAlong(x, z, entrance) : null
    groundQueryDebug.raw = writeHitSnapshot(rawHitSlot, raw)
    groundQueryDebug.lastHitBefore = writeHitSnapshot(lastHitSlot, lastHitBefore)
    groundQueryDebug.resolved = writeHitSnapshot(resolvedHitSlot, resolved)
    groundQueryDebug.source = raw ? 'cave' : resolved ? 'hysteresis' : 'surface'
    groundQueryDebug.surfaceY = surfaceY
    groundQueryDebug.occupancy = occupancy
    groundQueryDebug.queryInterior = occupancy && along != null && along <= MOUTH_INTERIOR_ALONG
    groundQueryDebug.caveId = runtime?.topology.caveId ?? null
    groundQueryDebug.along = along
    groundQueryDebug.lateral = entrance ? mouthLateral(x, z, entrance) : null
  }

  function disposePresentation(caveId: string): void {
    const group = presentations.get(caveId)
    if (!group) return
    const propsRoot = group.userData[CAVE_ADVENTURE_PROPS_USERDATA_KEY] as THREE.Object3D | undefined
    if (propsRoot) {
      pointLightBudget.unregisterSubtree(propsRoot)
      delete group.userData[CAVE_ADVENTURE_PROPS_USERDATA_KEY]
    }
    const poolPresentation = poolPresentationsByCave.get(caveId)
    if (poolPresentation) {
      poolPresentation.dispose()
      poolPresentationsByCave.delete(caveId)
      delete group.userData[CAVE_POOL_PRESENTATION_KEY]
    }
    group.removeFromParent()
    disposeObject3D(group)
    presentations.delete(caveId)
    adventureLanternTorchesByCave.delete(caveId)
  }

  /** Builds and attaches one cave's heightfield presentation synchronously.
   *  Runs from the queue drain; the streaming controller's generation check
   *  around it (`markBuilding` / `accept`) is what rejects stale work. */
  function attachPresentation(caveId: string): void {
    const v2 = v2ByCaveId.get(caveId)
    if (!v2) return
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const adventurePropAnchors = v2.archetype === 'adventure'
      ? presentationAnchorsFromContent(v2.contentAnchors)
      : []
    const presentation = createCaveHeightfieldPresentation({
      field: v2.heightfield,
      walkSurfaceAt: v2.walkSurfaceAt,
      caveMaterial,
      maskMaterial,
      rocks: mouthRocksEnabled,
      interiorRockPlacements: v2.interiorRocks,
      adventurePropAnchors,
    })
    if (presentation.adventureLanternLightCount > 0) {
      const propsRoot = presentation.group.children.find(
        (c) => c.name === CAVE_ADVENTURE_PROPS_GROUP_NAME,
      )
      if (propsRoot) {
        presentation.group.userData[CAVE_ADVENTURE_PROPS_USERDATA_KEY] = propsRoot
        pointLightBudget.registerSubtree(propsRoot)
      }
    }
    if (presentation.adventureLanternTorches.length > 0) {
      adventureLanternTorchesByCave.set(caveId, presentation.adventureLanternTorches)
    }
    if (v2.undergroundPool) {
      const poolPresentation = createCaveUndergroundPoolPresentation(v2.undergroundPool, poolWaterMaterial)
      poolPresentation.group.userData[CAVE_POOL_PRESENTATION_KEY] = true
      presentation.group.add(poolPresentation.group)
      poolPresentationsByCave.set(caveId, poolPresentation)
    }
    scene.add(presentation.group)
    presentations.set(caveId, presentation.group)
    const activationTotalMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    getMonitor().recordHitch('STREAMING', activationTotalMs, 'cave presentation')
    if (isBootMarkMode()) {
      console.log(`[caves] presentation ${caveId}`)
      console.table({
        'cave.meshBuffers': presentation.buffers.meshBuildMs,
        'cave.assemble': presentation.assembleMs,
        'cave.activationTotal': activationTotalMs,
        vertices: presentation.buffers.vertices,
        triangles: presentation.buffers.triangles,
        rimVertices: presentation.buffers.rimVertexCount,
        skyVertices: presentation.buffers.skyVertexCount,
        geometryBytes: presentation.buffers.geometryBytes,
        maskVertices: presentation.maskVertices,
        rocks: presentation.rockCount,
        interiorRocks: presentation.interiorRockCount,
        adventureProps: presentation.adventurePropCount,
        adventureLanternLights: presentation.adventureLanternLightCount,
      })
    }
  }

  const presentationQueue = createCavePresentationQueue((caveId, generation) => {
    if (!streaming.markBuilding(caveId, generation)) return
    try {
      attachPresentation(caveId)
    } catch (error) {
      console.error('[caves] presentation build failed', caveId, error)
      disposePresentation(caveId)
      streaming.fail(caveId, generation)
      return
    }
    if (!streaming.accept(caveId, generation)) disposePresentation(caveId)
  })
  const streaming = createCaveStreamingController({
    requestPresentation(caveId, generation, distance) {
      presentationQueue.request(caveId, generation, distance)
    },
    reprioritisePresentation(caveId, distance) {
      presentationQueue.reprioritise(caveId, distance)
    },
    cancelPresentation(caveId) {
      presentationQueue.cancel(caveId)
    },
    disposePresentation,
  })

  function queryGround(x: number, y: number, z: number): CaveGroundHit | null {
    let hit: CaveGroundHit | null = null
    let hitRuntime: CaveRuntime | null = null
    for (const runtime of runtimes) {
      const candidate = queryHeightfieldGround(runtime.heightfield, analyticSurfaceHeight, x, y, z)
      if (candidate) {
        hit = candidate
        hitRuntime = runtime
        break
      }
    }
    const lastHitBefore = lastGroundHit
    const surfaceY = analyticSurfaceHeight(x, z)
    // A fresh hit (any cave) always wins; a remembered hit is only ever the
    // one this entity last stood in, so hysteresis cannot carry one cave's
    // floor into another.
    const resolved = applyCaveGroundHysteresis(hit, y, surfaceY, lastHitBefore)
    lastGroundHit = resolved.remember
    lastHitRuntime = resolved.remember ? (hitRuntime ?? lastHitRuntime) : null
    writeGroundQueryDebug(x, y, z, hit, lastHitBefore, resolved.hit, surfaceY, lastHitRuntime)
    return resolved.hit
  }

  /** Y-blind floor + ceiling from one heightfield sample. Where cave bounds
   *  overlap, the lowest floor wins and its own ceiling comes with it —
   *  never a floor from one cave and a ceiling from another. */
  function sampleGroundColumn(x: number, z: number): CaveVerticalInterval | null {
    let best: CaveVerticalInterval | null = null
    for (const runtime of runtimes) {
      const column = heightfieldGroundColumn(runtime.heightfield, analyticSurfaceHeight, x, z)
      if (column && (best === null || column.floorY < best.floorY)) best = column
    }
    return best
  }

  /** Strict, stateless heightfield occupancy across every cave — first
   *  cave whose column holds `y` wins. */
  function occupancyAt(x: number, y: number, z: number): CaveVerticalInterval | null {
    for (const runtime of runtimes) {
      const hit = heightfieldOccupancyAt(runtime.heightfield, analyticSurfaceHeight, x, y, z)
      if (hit) return hit
    }
    return null
  }

  return {
    definitions: () => definitions,
    update(observerX, observerZ, dt = 0) {
      for (const torches of adventureLanternTorchesByCave.values()) {
        for (const torch of torches) torch.update(dt)
      }
      for (const poolPresentation of poolPresentationsByCave.values()) {
        poolPresentation.update(dt)
      }
      const { cx, cz } = gridCellOf(observerX, observerZ)
      const nearby = new Set<string>()
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(gridKey(cx + dx, cz + dz))
          if (!bucket) continue
          for (const def of bucket) {
            nearby.add(def.caveId)
            streaming.apply(def.caveId, distanceToBoundsXZ(def.bounds, observerX, observerZ))
          }
        }
      }
      // Anything still tracked outside the current 3x3 grid neighborhood is
      // well past CAVE_DEACTIVATE_DISTANCE by construction — drop it too.
      for (const caveId of streaming.trackedIds()) {
        if (!nearby.has(caveId)) streaming.drop(caveId)
      }
      presentationQueue.drain(PRESENTATION_BUILDS_PER_UPDATE)
    },
    queryGround,
    peekGroundQueryDebug: () => groundQueryDebug,
    peekHeightfieldMovementSample(x, z, playerY) {
      let best: ReturnType<typeof sampleHeightfieldAt> | null = null
      let bestOut = Infinity
      for (const runtime of runtimes) {
        const sample = sampleHeightfieldAt(runtime.heightfield, x, z)
        const outDist = sample.outsideGrid
          ? Math.hypot(x - runtime.heightfield.originX, z - runtime.heightfield.originZ)
          : 0
        if (best == null || outDist < bestOut || (!sample.outsideGrid && best.outsideGrid)) {
          best = sample
          bestOut = outDist
        }
      }
      if (!best || best.outsideGrid) return null
      return {
        outsideGrid: best.outsideGrid,
        openSky: best.openSky,
        gap: best.gap,
        floorY: best.floorY,
        ceilY: best.ceilY,
        surfaceY: best.surfaceY,
        playerY,
      }
    },
    peekStreamingDebug: () => ({
      ...streaming.stats(),
      queuedJobs: presentationQueue.queuedCount,
    }),
    occupancyAt,
    resolveHorizontal(x, z, y, radius, entityHeight) {
      // Every field is `outsideGrid` except the cave(s) local to the point,
      // for which the resolver is the identity; sequential application is
      // the whole multi-cave rule.
      const minGap = heightfieldStandingClearance(entityHeight)
      let px = x
      let pz = z
      for (const runtime of runtimes) {
        const resolved = resolveHeightfieldHorizontal(runtime.heightfield, px, pz, y, radius, minGap)
        px = resolved.x
        pz = resolved.z
      }
      return { x: px, z: pz }
    },
    queryInterior(x, y, z, channel = 'player') {
      let sample = false
      for (const runtime of runtimes) {
        if (heightfieldInteriorAt(runtime.heightfield, analyticSurfaceHeight, runtime.topology.entrance, x, y, z)) {
          sample = true
          break
        }
      }
      const slot = interiorHysteresis[channel]
      const resolved = applyCaveInteriorHysteresis(sample, slot.lastRaw, slot.confirmed)
      slot.lastRaw = resolved.rememberRaw
      slot.confirmed = resolved.interior
      return slot.confirmed
    },
    contains(x, y, z) {
      return occupancyAt(x, y, z) !== null
    },
    sampleFloor(x, z) {
      return sampleGroundColumn(x, z)?.floorY ?? null
    },
    sampleCeiling(x, z) {
      return sampleGroundColumn(x, z)?.ceilingY ?? null
    },
    archetypeOf(caveId) {
      return v2ByCaveId.get(caveId)?.archetype ?? null
    },
    contentAnchors() {
      return runtimes.flatMap((runtime) => runtime.contentAnchors)
    },
    contentAnchorsOf(caveId) {
      return v2ByCaveId.get(caveId)?.contentAnchors ?? []
    },
    dungeonChambersOf(caveId) {
      return v2ByCaveId.get(caveId)?.dungeonChambers ?? []
    },
    undergroundPoolOf(caveId) {
      return v2ByCaveId.get(caveId)?.undergroundPool ?? null
    },
    resolveHabitat(caveId, entityHeight, options) {
      const runtime = v2ByCaveId.get(caveId)
      if (!runtime) return null
      return resolveCaveTraversal(runtime.topology, runtime.heightfield, analyticSurfaceHeight, entityHeight, options)
    },
    resolveRouteBetween(caveId, fromNodeId, toNodeId) {
      const runtime = v2ByCaveId.get(caveId)
      if (!runtime) return null
      return resolveCaveRouteBetweenNodes(runtime.topology, runtime.heightfield, analyticSurfaceHeight, fromNodeId, toNodeId)
    },
    queryGroundIn(caveId, x, y, z) {
      const runtime = v2ByCaveId.get(caveId)
      if (!runtime) return null
      return queryHeightfieldGround(runtime.heightfield, analyticSurfaceHeight, x, y, z)
    },
    resolveHorizontalIn(caveId, x, z, y, radius, entityHeight) {
      const runtime = v2ByCaveId.get(caveId)
      if (!runtime) return { x, z }
      const minGap = heightfieldStandingClearance(entityHeight)
      return resolveHeightfieldHorizontal(runtime.heightfield, x, z, y, radius, minGap)
    },
    dispose() {
      lastGroundHit = null
      lastHitRuntime = null
      interiorHysteresis.player.lastRaw = null
      interiorHysteresis.player.confirmed = false
      interiorHysteresis.camera.lastRaw = null
      interiorHysteresis.camera.confirmed = false
      writeGroundQueryDebug(0, 0, 0, null, null, null, 0, null)
      streaming.dispose()
      presentationQueue.clear()
      adventureLanternTorchesByCave.clear()
      for (const poolPresentation of poolPresentationsByCave.values()) poolPresentation.dispose()
      poolPresentationsByCave.clear()
      chunkManager.clearTerrainCutouts(TERRAIN_CUTOUT_OWNER_KEY)
      disposeCaveHeightfieldMaterialGpu(caveMaterial)
      maskMaterial.dispose()
      poolWaterMaterial.dispose()
    },
  }
}
