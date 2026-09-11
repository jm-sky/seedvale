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
import {
  createCaveExtractionClient,
  createCaveExtractionWorkerRunner,
} from './caves/caveExtractionClient'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
} from './caves/caveHeightfieldRepresentation'
import {
  type CaveStreamingStats,
  createCaveStreamingController,
} from './caves/cavePresentationLifecycle'
import { buildCaveSdfColliders, caveMouthColliderFilter } from './caves/caveSdfColliders'
import { cavePresentationBounds } from './caves/caveSdfExtraction'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation, DEFAULT_SDF_PARAMS } from './caves/caveSdfField'
import {
  applyCaveGroundHysteresis,
  applyCaveInteriorHysteresis,
  buildCaveSdfColumnIndex,
  CAVE_OCCUPANCY_EPS,
  type CaveGroundHit,
  type CaveSdfColumnIndex,
  type CaveVerticalInterval,
  isCaveInteriorAt,
  lowestCeilingAt,
  lowestFloorAt,
  occupancyContains,
  occupancyIntervalAt,
  queryColumnIndex,
} from './caves/caveSdfQuery'
import { createCaveSpikeMaterial } from './caves/caveSpikeMaterial'
import {
  MOUTH_INTERIOR_ALONG,
  mouthAlong,
  mouthCarveDepth,
  mouthCarveDiscs,
  mouthLateral,
} from './caves/mouthCarve'
import { buildProductionCaveTopology } from './caves/productionTopology'
import { finalizeSdfCaveMesh } from './caves/sdfCaveMesh'
import { topologyToCaveDefinition } from './caves/topologyAdapter'
import { type CaveBounds, type CaveDefinition } from './caveVolume'
import { type LargeCaveSite, pickLargeCaveSites } from './largeCaves'
import { createLargeCaveVisual, placeLargeCaveVisual } from './largeCaveVisual'
import type { Scene } from 'three'

/** Short site-shaped input fed to the existing `largeCaveVisual.ts`
 *  rock-framing helper — just enough for a convincing mouth cluster; the
 *  interior beyond it is the procedural mesh, not a rock-lined trench. */
const MOUTH_FRAMING_LENGTH = 3

/** World-scale grid cell (independent of the terrain chunk grid) used only
 *  to narrow streaming candidates — not cave identity/generation. */
const CAVE_GRID_CELL = 500

export type Caves = {
  definitions: () => readonly CaveDefinition[]
  /** Streams cave presentation/collision in/out around the observer
   *  (player) position — call once per frame. Cheap: a 3x3 world-grid
   *  lookup, never a scan of every cave. */
  update: (observerX: number, observerZ: number) => void
  /** Y-aware gameplay query over the SDF column index (plan world-terrain-008
   *  B2). `null` outside cave space, including a surface entity above a
   *  tunnel. Includes mouth-portal coverage and underground-miss hysteresis. */
  queryGround: (x: number, y: number, z: number) => CaveGroundHit | null
  /**
   * Last `queryGround` breakdown (reused object, mutated in place).
   * Debug ground-trace only — gameplay must use `queryGround` / `occupancyAt`.
   */
  peekGroundQueryDebug: () => CaveGroundQueryDebug
  /** Strict occupancy (B3) — no floor grace, no hysteresis. `null` is solid
   *  rock / outside cave void. Camera boom and derived collision share this. */
  occupancyAt: (x: number, y: number, z: number) => CaveVerticalInterval | null
  /**
   * Hysteretic cave-interior flag for the player's current position.
   * Call once per frame from the player sample — not from camera march.
   * Approach/mouth portal occupancy is not interior.
   */
  queryInterior: (x: number, y: number, z: number) => boolean
  /**
   * Presentation/relevance counters (B4). Debug / tests — gameplay must use
   * `queryGround` / `occupancyAt`, never this.
   */
  peekStreamingDebug: () => CaveStreamingStats & { queuedJobs: number, inFlightJobs: number }
  /** Strict occupancy at `(x, y, z)`. Not hysteretic `queryGround` — torch
   *  / audio callers must not mutate the player's floor hysteresis. */
  contains: (x: number, y: number, z: number) => boolean
  /** Transitional Y-blind lowest-interval accessors. Player ground uses
   *  `queryGround` — do not route `CaveGroundQuery` through these. */
  sampleFloor: (x: number, z: number) => number | null
  sampleCeiling: (x: number, z: number) => number | null
  dispose: () => void
}

type CaveRuntime = {
  topology: CaveTopology
  definition: CaveDefinition
  heightfield: CaveHeightfieldRepresentation
  // retained until world-terrain-019 D/E:
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

/**
 * Owns the Cave V2 subsystem (plan world-terrain-008 Milestone B4, plus
 * world-terrain-019 Milestone A): deterministic production `CaveTopology`s,
 * retained heightfield representations (not yet gameplay/presentation
 * authority), retained SDF representations and derived column indexes
 * (cheap, all computed up front), streamed SDF presentation (async
 * extraction) and occupancy-derived cave-wall collision for whichever caves
 * are near the player. Collider registration is relevance-scoped and does
 * not wait for render mesh completion.
 *
 * Placement reuses `pickLargeCaveSites()` unchanged; topology generation and
 * terrain acceptance are owned by `productionTopology.ts`. Gameplay
 * floor/containment is the SDF column index (`caveSdfQuery.ts`), not
 * `CaveVolume`. Wall colliders are derived from strict occupancy
 * (`caveSdfColliders.ts`). `topologyToCaveDefinition` remains only for
 * `definitions()` / location catalog / streaming bounds until later
 * world-terrain-019 milestones.
 *
 * Same lifecycle as `WorldBundle` (create/dispose alongside it, never
 * survives a rebuild).
 *
 * @system caves
 * @role Owns cave topologies, retained heightfield representations (not yet
 *  gameplay/presentation authority), retained SDF/column-index gameplay space,
 *  streamed interior presentation (async SDF extraction), occupancy-derived
 *  wall colliders, and strict occupancy queries; `PlayerController` ground
 *  goes through `queryGround` and camera through `occupancyAt`. `queryInterior`
 *  is the hysteretic player-position cave-interior signal (audio / diagnostics).
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

  // Topology + SDF field + column index are cheap relative to mesh
  // extraction and must be available to gameplay queries even when the
  // cave is not activated. Presentation geometry stays lazy on streaming.
  const { bootMark, bootMarkEnd } = useBootMark('createCaves')
  const detailEnabled = isSystemEnabled('caveDetail')
  const v2ByCaveId = new Map<string, CaveRuntime>()
  const siteByCaveId = new Map<string, LargeCaveSite>()

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
  const heightfields = accepted.map(({ topology }) => (
    buildCaveHeightfieldRepresentation(
      topology,
      (x, z) => analyticSurfaceHeight(x, z) - mouthCarveDepth(x, z, topology.entrance),
    ).heightfield
  ))
  bootMarkEnd('cave.heightfield')

  bootMark('cave.columnIndex')
  const indexes = accepted.map(({ topology }, i) => (
    buildCaveSdfColumnIndex(representations[i]!, topology, analyticSurfaceHeight)
  ))
  bootMarkEnd('cave.columnIndex')

  bootMark('cave.colliders')
  for (let i = 0; i < accepted.length; i++) {
    const { site, topology } = accepted[i]!
    const representation = representations[i]!
    const index = indexes[i]!
    v2ByCaveId.set(topology.caveId, {
      topology,
      definition: topologyToCaveDefinition(topology),
      heightfield: heightfields[i]!,
      representation,
      index,
      colliders: buildCaveSdfColliders(index, analyticSurfaceHeight, representation, caveMouthColliderFilter(topology)),
    })
    siteByCaveId.set(topology.caveId, site)
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
  const caveMaterial = createCaveSpikeMaterial('sdf')
  caveMaterial.userData.sharedGpu = true
  let lastGroundHit: CaveGroundHit | null = null
  let lastInteriorRaw: boolean | null = null
  let interiorConfirmed = false
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

  function attachPresentation(
    caveId: string,
    positions: ArrayLike<number>,
    indices: ArrayLike<number>,
    extraction: { sdfSamplingMs: number, surfaceNetsMs: number, representationMs: number, peakTempBytes: number, vertices: number, triangles: number },
  ): void {
    const v2 = v2ByCaveId.get(caveId)
    const site = siteByCaveId.get(caveId)
    if (!v2 || !site) return
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const finalized = finalizeSdfCaveMesh(positions, indices, v2.topology, analyticSurfaceHeight)
    const group = new THREE.Group()
    group.name = `cave:${caveId}`
    const mesh = new THREE.Mesh(finalized.geometry, caveMaterial)
    mesh.name = `cave-interior:${caveId}`
    mesh.receiveShadow = true
    group.add(mesh)
    const tFraming = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const framingSite = { ...site, length: MOUTH_FRAMING_LENGTH }
    const framing = createLargeCaveVisual(framingSite)
    placeLargeCaveVisual(framing, framingSite, (x, z) => chunkManager.sampleBaseHeight(x, z))
    group.add(framing)
    scene.add(group)
    presentations.set(caveId, group)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const framingMs = now - tFraming
    const activationTotalMs = now - t0
    getMonitor().recordHitch('STREAMING', activationTotalMs, 'cave presentation')
    if (isBootMarkMode()) {
      console.log(`[caves] presentation ${caveId}`)
      console.table({
        'cave.sdfSampling': extraction.sdfSamplingMs,
        'cave.surfaceNets': extraction.surfaceNetsMs,
        'cave.clipping': finalized.clippingMs,
        'cave.bufferGeometry': finalized.bufferGeometryMs,
        'cave.normalsBounds': finalized.normalsBoundsMs,
        'cave.framing': framingMs,
        'cave.activationTotal': activationTotalMs,
        vertices: finalized.vertices,
        triangles: finalized.triangles,
        geometryBytes: finalized.geometryBytes,
        peakTempBytes: extraction.peakTempBytes,
        colliderCount: v2.colliders.length,
      })
    }
  }

  const presentationJobs = {
    request: (_caveId: string, _generation: number, _distance: number): void => {},
    reprioritise: (_caveId: string, _distance: number): void => {},
    cancel: (_caveId: string): void => {},
  }
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
      presentationJobs.request(caveId, generation, distance)
    },
    reprioritisePresentation(caveId, distance) {
      presentationJobs.reprioritise(caveId, distance)
    },
    cancelPresentation(caveId) {
      presentationJobs.cancel(caveId)
    },
    disposePresentation,
  })
  const extraction = createCaveExtractionClient({
    runner: createCaveExtractionWorkerRunner(),
    onStarted(caveId, requestId) {
      streaming.markBuilding(caveId, requestId)
    },
    onComplete(result) {
      const snap = streaming.snapshot(result.caveId)
      if (!snap || snap.generation !== result.requestId) return
      if (snap.phase !== 'building' && snap.phase !== 'queued') return
      attachPresentation(result.caveId, result.positions, result.indices, result.metrics)
      if (!streaming.accept(result.caveId, result.requestId)) {
        disposePresentation(result.caveId)
      }
    },
    onError(caveId, requestId, error) {
      console.error('[caves] presentation extraction failed', caveId, error)
      streaming.fail(caveId, requestId)
    },
  })
  presentationJobs.request = (caveId, generation, distance) => {
    const v2 = v2ByCaveId.get(caveId)
    if (!v2) return
    extraction.request({
      caveId,
      requestId: generation,
      topology: v2.topology,
      params: DEFAULT_SDF_PARAMS,
      detailEnabled,
      meshBounds: cavePresentationBounds(v2.representation.bounds, v2.topology, DEFAULT_SDF_PARAMS),
      distance,
    })
  }
  presentationJobs.reprioritise = (caveId, distance) => {
    extraction.reprioritise(caveId, distance)
  }
  presentationJobs.cancel = (caveId) => {
    extraction.cancel(caveId)
  }

  function queryGround(x: number, y: number, z: number): CaveGroundHit | null {
    let hit: CaveGroundHit | null = null
    let hitRuntime: CaveRuntime | null = null
    for (const runtime of runtimes) {
      const candidate = queryColumnIndex(runtime.index, x, y, z)
      if (candidate) {
        hit = candidate
        hitRuntime = runtime
        break
      }
    }
    const lastHitBefore = lastGroundHit
    const surfaceY = analyticSurfaceHeight(x, z)
    const resolved = applyCaveGroundHysteresis(hit, y, surfaceY, lastHitBefore)
    lastGroundHit = resolved.remember
    if (hitRuntime) lastHitRuntime = hitRuntime
    writeGroundQueryDebug(x, y, z, hit, lastHitBefore, resolved.hit, surfaceY, hitRuntime ?? lastHitRuntime)
    return resolved.hit
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
    },
    queryGround,
    peekGroundQueryDebug: () => groundQueryDebug,
    peekStreamingDebug: () => ({
      ...streaming.stats(),
      queuedJobs: extraction.queuedCount,
      inFlightJobs: extraction.inFlightCount,
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
      let lowest: number | null = null
      for (const runtime of runtimes) {
        const floor = lowestFloorAt(runtime.index, x, z)
        if (floor !== null && (lowest === null || floor < lowest)) lowest = floor
      }
      return lowest
    },
    sampleCeiling(x, z) {
      let lowestFloor: number | null = null
      let ceiling: number | null = null
      for (const runtime of runtimes) {
        const floor = lowestFloorAt(runtime.index, x, z)
        if (floor !== null && (lowestFloor === null || floor < lowestFloor)) {
          lowestFloor = floor
          ceiling = lowestCeilingAt(runtime.index, x, z)
        }
      }
      return ceiling
    },
    dispose() {
      lastGroundHit = null
      lastHitRuntime = null
      lastInteriorRaw = null
      interiorConfirmed = false
      writeGroundQueryDebug(0, 0, 0, null, null, null, 0, null)
      streaming.dispose()
      extraction.dispose()
      caveMaterial.dispose()
    },
  }
}
