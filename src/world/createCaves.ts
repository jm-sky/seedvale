import * as THREE from 'three'
import type { ChunkManager } from '../terrain/chunkManager'
import type { CaveTopology } from './caves/caveTopology'
import type { Collider } from './collision'
import { disposeObject3D } from '../assets/loadGltf'
import { isSystemEnabled } from '../debug/debugMode'
import { type CaveGroundQueryDebug, writeHitSnapshot } from '../debug/playerGroundTrace'
import { villageSizeConfig } from '../settlement/families'
import { cellsWithinRadius, SETTLEMENT_GRID_STEP } from '../settlement/settlementGenerator'
import { buildCaveSdfColliders, caveMouthColliderFilter } from './caves/caveSdfColliders'
import { buildCaveSdfRepresentation, type CaveSdfSpatialRepresentation } from './caves/caveSdfField'
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
  mouthCarveDiscs,
  mouthLateral,
} from './caves/mouthCarve'
import { buildProductionCaveTopology } from './caves/productionTopology'
import { buildSdfCaveMesh } from './caves/sdfCaveMesh'
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
const ACTIVATE_DISTANCE = 55
/** > ACTIVATE_DISTANCE — hysteresis ring avoiding activate/deactivate
 *  thrashing right at the boundary (same pattern as settlement streaming). */
const DEACTIVATE_DISTANCE = 80

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
 * Owns the Cave V2 subsystem (plan world-terrain-008 Milestone B3):
 * deterministic production `CaveTopology`s, retained SDF representations and
 * derived column indexes (cheap, all computed up front), streamed SDF
 * presentation and occupancy-derived cave-wall collision for whichever caves
 * are near the player.
 *
 * Placement reuses `pickLargeCaveSites()` unchanged; topology generation and
 * terrain acceptance are owned by `productionTopology.ts`. Gameplay
 * floor/containment is the SDF column index (`caveSdfQuery.ts`), not
 * `CaveVolume`. Wall colliders are derived from strict occupancy
 * (`caveSdfColliders.ts`). `topologyToCaveDefinition` remains only for
 * `definitions()` / location catalog / streaming bounds until B5.
 *
 * Same lifecycle as `WorldBundle` (create/dispose alongside it, never
 * survives a rebuild).
 *
 * @system caves
 * @role Owns cave topologies, retained SDF/column-index gameplay space,
 *  streamed interior presentation, occupancy-derived wall colliders, and
 *  strict occupancy queries; `PlayerController` ground goes through
 *  `queryGround` and camera through `occupancyAt`. `queryInterior` is the
 *  hysteretic player-position cave-interior signal (audio / diagnostics).
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
  // cave is not activated. Presentation geometry stays lazy on activate.
  const detailEnabled = isSystemEnabled('caveDetail')
  const v2ByCaveId = new Map<string, CaveRuntime>()
  const siteByCaveId = new Map<string, LargeCaveSite>()
  for (const site of sites) {
    const topology = buildProductionCaveTopology({
      seed,
      site,
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: analyticSurfaceHeight,
    })
    if (!topology) continue
    const representation = buildCaveSdfRepresentation(topology, undefined, detailEnabled)
    const index = buildCaveSdfColumnIndex(representation, topology, analyticSurfaceHeight)
    v2ByCaveId.set(topology.caveId, {
      topology,
      definition: topologyToCaveDefinition(topology),
      representation,
      index,
      colliders: buildCaveSdfColliders(index, analyticSurfaceHeight, representation, caveMouthColliderFilter(topology)),
    })
    siteByCaveId.set(topology.caveId, site)
  }

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

  const active = new Map<string, THREE.Object3D>()
  const caveMaterial = createCaveSpikeMaterial('sdf')
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

  function activate(def: CaveDefinition): void {
    if (active.has(def.caveId)) return
    const v2 = v2ByCaveId.get(def.caveId)!
    const group = new THREE.Group()
    group.name = `cave:${def.caveId}`
    // Built fresh on every activation (not cached) — `deactivate()` disposes
    // the group's geometry, so a shared/cached mesh would render nothing (or
    // throw) on the next activation. The SDF *field* is retained from world
    // build and reused so meshing does not reconstruct primitives.
    const built = buildSdfCaveMesh(v2.topology, undefined, analyticSurfaceHeight, v2.representation)
    const mesh = new THREE.Mesh(built.geometry, caveMaterial)
    mesh.name = `cave-interior:${def.caveId}`
    mesh.receiveShadow = true
    group.add(mesh)
    const site = siteByCaveId.get(def.caveId)!
    const framingSite = { ...site, length: MOUTH_FRAMING_LENGTH }
    const framing = createLargeCaveVisual(framingSite)
    placeLargeCaveVisual(framing, framingSite, (x, z) => chunkManager.sampleBaseHeight(x, z))
    group.add(framing)
    scene.add(group)
    chunkManager.registerColliders(colliderOwnerKey(def.caveId), v2.colliders)
    active.set(def.caveId, group)
  }

  function deactivate(caveId: string): void {
    const group = active.get(caveId)
    if (!group) return
    group.removeFromParent()
    disposeObject3D(group)
    chunkManager.clearColliders(colliderOwnerKey(caveId))
    active.delete(caveId)
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
            const distance = distanceToBoundsXZ(def.bounds, observerX, observerZ)
            if (distance <= ACTIVATE_DISTANCE) activate(def)
            else if (distance >= DEACTIVATE_DISTANCE) deactivate(def.caveId)
          }
        }
      }
      // Anything active outside the current 3x3 grid neighborhood is well
      // past DEACTIVATE_DISTANCE by construction — drop it too.
      for (const caveId of active.keys()) {
        if (!nearby.has(caveId)) deactivate(caveId)
      }
    },
    queryGround,
    peekGroundQueryDebug: () => groundQueryDebug,
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
      for (const caveId of [...active.keys()]) deactivate(caveId)
    },
  }
}
