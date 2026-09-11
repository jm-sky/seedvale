import * as THREE from 'three'
import type { ChunkManager } from '../terrain/chunkManager'
import type { CaveTopology } from './caves/caveTopology'
import type { Collider } from './collision'
import { disposeObject3D } from '../assets/loadGltf'
import { isBootMarkMode, isSystemEnabled } from '../debug/debugMode'
import { type CaveGroundQueryDebug, writeHitSnapshot } from '../debug/playerGroundTrace'
import { getMonitor } from '../perf/active'
import { villageSizeConfig } from '../settlement/families'
import { cellsWithinRadius, SETTLEMENT_GRID_STEP } from '../settlement/settlementGenerator'
import { useBootMark } from '../shared/bootMark'
import { applyCaveGroundHysteresis, type CaveGroundHit, type CaveVerticalInterval } from './caves/caveGroundQuery'
import {
  createCaveHeightfieldMaterial,
  createCaveHeightfieldPresentation,
  createMouthUndersideMaskMaterial,
} from './caves/caveHeightfieldPresentation'
import { heightfieldGroundColumn, queryHeightfieldGround } from './caves/caveHeightfieldQuery'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  type SurfaceSampler,
} from './caves/caveHeightfieldRepresentation'
import {
  type CaveStreamingStats,
  createCavePresentationQueue,
  createCaveStreamingController,
} from './caves/cavePresentationLifecycle'
import { buildCaveSdfColliders, caveMouthColliderFilter } from './caves/caveSdfColliders'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation, DEFAULT_SDF_PARAMS } from './caves/caveSdfField'
import {
  applyCaveInteriorHysteresis,
  buildCaveSdfColumnIndex,
  CAVE_OCCUPANCY_EPS,
  type CaveSdfColumnIndex,
  isCaveInteriorAt,
  occupancyContains,
  occupancyIntervalAt,
} from './caves/caveSdfQuery'
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
import type { Scene } from 'three'

/** Presentation builds run synchronously on the main thread; this many
 *  caves may build in one `update()` call. Activations are rare and
 *  nearest-first, so one per frame keeps any hitch to a single cave. */
const PRESENTATION_BUILDS_PER_UPDATE = 1

/** World-scale grid cell (independent of the terrain chunk grid) used only
 *  to narrow streaming candidates — not cave identity/generation. */
const CAVE_GRID_CELL = 500

export type Caves = {
  definitions: () => readonly CaveDefinition[]
  /** Streams cave presentation/collision in/out around the observer
   *  (player) position — call once per frame. Cheap: a 3x3 world-grid
   *  lookup, never a scan of every cave. */
  update: (observerX: number, observerZ: number) => void
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
  /** Strict occupancy (B3) — no floor grace, no hysteresis. `null` is solid
   *  rock / outside cave void. Camera boom and derived collision share this.
   *  Still the SDF column index (transitional until world-terrain-019 D). */
  occupancyAt: (x: number, y: number, z: number) => CaveVerticalInterval | null
  /**
   * Hysteretic cave-interior flag for the player's current position.
   * Call once per frame from the player sample — not from camera march.
   * Approach/mouth portal occupancy is not interior.
   */
  queryInterior: (x: number, y: number, z: number) => boolean
  /**
   * Presentation/relevance counters (B4). Debug / tests — gameplay must use
   * `queryGround` / `occupancyAt`, never this. `queuedJobs` counts pending
   * main-thread heightfield builds; there is no async/in-flight path since
   * world-terrain-019 B.
   */
  peekStreamingDebug: () => CaveStreamingStats & { queuedJobs: number }
  /** Strict occupancy at `(x, y, z)`. Not hysteretic `queryGround` — torch
   *  / audio callers must not mutate the player's floor hysteresis. SDF
   *  column index (transitional until world-terrain-019 D). */
  contains: (x: number, y: number, z: number) => boolean
  /** Y-blind heightfield floor / ceiling at `(x, z)` — both from the same
   *  cave sample (lowest floor wins where cave bounds overlap). Player
   *  ground uses `queryGround` — do not route `CaveGroundQuery` through
   *  these. */
  sampleFloor: (x: number, z: number) => number | null
  sampleCeiling: (x: number, z: number) => number | null
  dispose: () => void
}

type CaveRuntime = {
  topology: CaveTopology
  definition: CaveDefinition
  /** Presentation + terrain mouth + player ground / floor / ceiling
   *  authority (world-terrain-019 B + early gameplay migration). */
  heightfield: CaveHeightfieldRepresentation
  /** Deterministic sampler the heightfield was built against:
   *  `sampleBaseHeight - mouthCarveDepth`. Presentation, mask, framing and
   *  the terrain cutout all evaluate the mouth contour with this one. */
  walkSurfaceAt: SurfaceSampler
  // retained until world-terrain-019 D/E (strict occupancy / interior /
  // wall colliders / camera):
  representation: CaveSdfSpatialRepresentation
  index: CaveSdfColumnIndex
  colliders: readonly Collider[]
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

function colliderOwnerKey(caveId: string): string {
  return `cave:${caveId}`
}

/** One registration for every cave's mouth cutout — cutouts are static
 *  world-build state, registered once after heightfields exist. */
const TERRAIN_CUTOUT_OWNER_KEY = 'caves'

/**
 * Owns the Cave V2 subsystem (plan world-terrain-008 Milestone B4, plus
 * world-terrain-019 Milestones A/B and the early ground migration):
 * deterministic production `CaveTopology`s, retained heightfield
 * representations (presentation + terrain-mouth + player ground / floor /
 * ceiling authority), retained SDF representations and derived column
 * indexes (transitional strict occupancy / interior / collision / camera
 * authority until world-terrain-019 D), streamed heightfield presentation
 * (synchronous main-thread mesh assembly, nearest-first) and
 * occupancy-derived cave-wall collision for whichever caves are near the
 * player. Collider registration is relevance-scoped and does not wait for
 * render mesh completion.
 *
 * The mouth is a real hole: every cave registers a `TerrainCutout` with
 * `ChunkManager` (`caveTerrainCutout.ts`) on the same `mouthOpeningAt`
 * contour the cave ceiling is clipped on, and the existing `mouthCarveDiscs`
 * recess still shapes the walk surface / approach.
 *
 * Placement reuses `pickLargeCaveSites()` unchanged; topology generation and
 * terrain acceptance are owned by `productionTopology.ts`. Player ground /
 * floor / ceiling is the heightfield (`caveHeightfieldQuery.ts`) — one
 * source of truth with the rendered floor; strict containment is still the
 * SDF column index (`caveSdfQuery.ts`), not `CaveVolume`. Wall colliders
 * are derived from strict occupancy (`caveSdfColliders.ts`).
 * `topologyToCaveDefinition` remains only for `definitions()` / location
 * catalog / streaming bounds until later world-terrain-019 milestones.
 *
 * Same lifecycle as `WorldBundle` (create/dispose alongside it, never
 * survives a rebuild).
 *
 * @system caves
 * @role Owns cave topologies, retained heightfield representations
 *  (presentation mesh + terrain mouth cutout + player ground), retained
 *  SDF/column-index strict occupancy space, streamed interior presentation
 *  (main-thread heightfield assembly), occupancy-derived wall colliders, and
 *  strict occupancy queries; `PlayerController` ground goes through
 *  `queryGround` (heightfield) and camera through `occupancyAt` (SDF). `queryInterior` is the hysteretic player-position
 *  cave-interior signal (audio / diagnostics).
 * @owns Caves
 * @lifecycle rebuild
 */
export function createCaves(
  scene: Scene,
  chunkManager: ChunkManager,
  seed: number,
  homeRadius: number,
  coastThreshold: number,
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

  // Topology + heightfield + SDF field + column index are all computed up
  // front and must be available to gameplay queries even when the cave is
  // not activated. Presentation geometry stays lazy on streaming. The
  // column index (~2 s at boot) now serves only strict occupancy / interior
  // / colliders / camera — player ground reads the heightfield.
  const { bootMark, bootMarkEnd } = useBootMark('createCaves')
  const detailEnabled = isSystemEnabled('caveDetail')
  const mouthRocksEnabled = isSystemEnabled('caveMouthRocks')
  const v2ByCaveId = new Map<string, CaveRuntime>()

  bootMark('cave.topology')
  const accepted: { site: LargeCaveSite, topology: CaveTopology }[] = []
  for (const site of sites) {
    const topology = buildProductionCaveTopology({
      seed,
      site,
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: analyticSurfaceHeight,
    })
    if (topology) accepted.push({ site, topology })
  }
  bootMarkEnd('cave.topology')

  bootMark('cave.sdfRepresentation')
  const representations = accepted.map(({ topology }) => (
    buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS, detailEnabled)
  ))
  bootMarkEnd('cave.sdfRepresentation')

  bootMark('cave.heightfield')
  const walkSurfaceSamplers: SurfaceSampler[] = accepted.map(({ topology }) => (
    (x, z) => analyticSurfaceHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  ))
  const heightfields = accepted.map(({ topology }, i) => (
    buildCaveHeightfieldRepresentation(topology, walkSurfaceSamplers[i]!).heightfield
  ))
  bootMarkEnd('cave.heightfield')

  bootMark('cave.columnIndex')
  const indexes = accepted.map(({ topology }, i) => (
    buildCaveSdfColumnIndex(representations[i]!, topology, analyticSurfaceHeight)
  ))
  bootMarkEnd('cave.columnIndex')

  bootMark('cave.colliders')
  for (let i = 0; i < accepted.length; i++) {
    const { topology } = accepted[i]!
    const representation = representations[i]!
    const index = indexes[i]!
    v2ByCaveId.set(topology.caveId, {
      topology,
      definition: topologyToCaveDefinition(topology),
      heightfield: heightfields[i]!,
      walkSurfaceAt: walkSurfaceSamplers[i]!,
      representation,
      index,
      colliders: buildCaveSdfColliders(index, analyticSurfaceHeight, representation, caveMouthColliderFilter(topology)),
    })
  }
  bootMarkEnd('cave.colliders')

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
  // Shared across every cave presentation; disposed once in `dispose()`,
  // never by `disposeObject3D()` (`sharedGpu`).
  const caveMaterial = createCaveHeightfieldMaterial()
  caveMaterial.userData.sharedGpu = true
  const maskMaterial = createMouthUndersideMaskMaterial()
  maskMaterial.userData.sharedGpu = true
  let lastGroundHit: CaveGroundHit | null = null
  let lastInteriorRaw: boolean | null = null
  let interiorConfirmed = false
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
    group.removeFromParent()
    disposeObject3D(group)
    presentations.delete(caveId)
  }

  /** Builds and attaches one cave's heightfield presentation synchronously.
   *  Runs from the queue drain; the streaming controller's generation check
   *  around it (`markBuilding` / `accept`) is what rejects stale work. */
  function attachPresentation(caveId: string): void {
    const v2 = v2ByCaveId.get(caveId)
    if (!v2) return
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const presentation = createCaveHeightfieldPresentation({
      field: v2.heightfield,
      walkSurfaceAt: v2.walkSurfaceAt,
      caveMaterial,
      maskMaterial,
      rocks: mouthRocksEnabled,
    })
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
        colliderCount: v2.colliders.length,
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
    registerColliders(caveId) {
      const v2 = v2ByCaveId.get(caveId)
      if (!v2) return
      chunkManager.registerColliders(colliderOwnerKey(caveId), v2.colliders)
    },
    clearColliders(caveId) {
      chunkManager.clearColliders(colliderOwnerKey(caveId))
    },
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

  return {
    definitions: () => definitions,
    update(observerX, observerZ) {
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
    peekStreamingDebug: () => ({
      ...streaming.stats(),
      queuedJobs: presentationQueue.queuedCount,
    }),
    occupancyAt(x, y, z) {
      for (const runtime of runtimes) {
        const hit = occupancyIntervalAt(runtime.index, x, y, z)
        if (hit) return hit
      }
      return null
    },
    queryInterior(x, y, z) {
      let sample = false
      for (const runtime of runtimes) {
        if (isCaveInteriorAt(runtime.index, runtime.topology.entrance, x, y, z)) {
          sample = true
          break
        }
      }
      const resolved = applyCaveInteriorHysteresis(sample, lastInteriorRaw, interiorConfirmed)
      lastInteriorRaw = resolved.rememberRaw
      interiorConfirmed = resolved.interior
      return interiorConfirmed
    },
    contains(x, y, z) {
      for (const runtime of runtimes) {
        if (occupancyContains(runtime.index, x, y, z)) return true
      }
      return false
    },
    sampleFloor(x, z) {
      return sampleGroundColumn(x, z)?.floorY ?? null
    },
    sampleCeiling(x, z) {
      return sampleGroundColumn(x, z)?.ceilingY ?? null
    },
    dispose() {
      lastGroundHit = null
      lastHitRuntime = null
      lastInteriorRaw = null
      interiorConfirmed = false
      writeGroundQueryDebug(0, 0, 0, null, null, null, 0, null)
      streaming.dispose()
      presentationQueue.clear()
      chunkManager.clearTerrainCutouts(TERRAIN_CUTOUT_OWNER_KEY)
      caveMaterial.dispose()
      maskMaterial.dispose()
    },
  }
}
