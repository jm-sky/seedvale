import * as THREE from 'three'
import type { ChunkManager } from '../terrain/chunkManager'
import type { CaveTopology } from './caves/caveTopology'
import { disposeObject3D } from '../assets/loadGltf'
import { villageSizeConfig } from '../settlement/families'
import { cellsWithinRadius, SETTLEMENT_GRID_STEP } from '../settlement/settlementGenerator'
import { buildCaveWallColliders } from './caveColliders'
import { CAVE_MOUTH_DEPTH } from './caveGenerator'
import { createCaveSpikeMaterial } from './caves/caveSpikeMaterial'
import { buildProductionCaveTopology } from './caves/productionTopology'
import { buildSdfCaveMesh } from './caves/sdfCaveMesh'
import { topologyToCaveDefinition } from './caves/topologyAdapter'
import { type CaveBounds, type CaveDefinition, type CaveVolume, createCaveVolume } from './caveVolume'
import { type LargeCaveSite, openingDirection, pickLargeCaveSites } from './largeCaves'
import { createLargeCaveVisual, placeLargeCaveVisual } from './largeCaveVisual'
import type { Scene } from 'three'

/** Local terrain recess at the mouth only — the underground passage itself
 *  is never carved into the surface heightmap, it's the procedural interior
 *  mesh (`sdfCaveMesh.ts`). Same constants `createLargeCaves.ts` used for its
 *  mouth/approach carve. */
const APPROACH_RADIUS = 3.2
const APPROACH_DEPTH = 1.35
const MOUTH_RADIUS = 1.65
/** Same depth `productionTopology.ts` starts the interior at — the mouth
 *  node's floor is the bottom of this recess, so the two must never drift
 *  apart. */
const MOUTH_DEPTH = CAVE_MOUTH_DEPTH

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
  contains: (x: number, y: number, z: number) => boolean
  sampleFloor: (x: number, z: number) => number | null
  sampleCeiling: (x: number, z: number) => number | null
  dispose: () => void
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
 * Owns the Cave V2 subsystem (plan world-terrain-008 Milestone B1):
 * deterministic production `CaveTopology`s (cheap, all computed up front —
 * same reasoning as `largeCaves.ts`'s sites), streamed SDF presentation and
 * cave-wall collision for whichever caves are near the player.
 *
 * Placement reuses `pickLargeCaveSites()` unchanged; topology generation and
 * terrain acceptance are owned by `productionTopology.ts`, not V1's
 * tunnel/chamber `CaveDefinition` graph (`caveGenerator.ts`) — a site is
 * dropped here if no reasonable route fits under the local terrain, same as
 * V1's own overburden rejection. `topologyToCaveDefinition` remains a
 * transitional compatibility adapter for `CaveVolume`/collision only (plan
 * §"Compatibility boundary") — it is never Cave V2's source of truth.
 *
 * Same lifecycle as `WorldBundle` (create/dispose alongside it, never
 * survives a rebuild).
 *
 * @system caves
 * @role Owns cave topologies, streamed interior presentation and cave-wall
 *  collider registration; `PlayerController` ground/ceiling queries go
 *  through `contains`/`sampleFloor`/`sampleCeiling`.
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

  // Topology/proxy precompute — lightweight deterministic data (no Three.js
  // geometry), same "cheap, all computed up front" reasoning as `sites`
  // itself. Actual presentation geometry is still built lazily on
  // activation. A site is silently dropped if no reasonable route fits
  // under its local terrain (`buildProductionCaveTopology` returning
  // `null`) — the Cave V2 acceptance authority, not V1's.
  const v2ByCaveId = new Map<string, { topology: CaveTopology, definition: CaveDefinition }>()
  const siteByCaveId = new Map<string, LargeCaveSite>()
  for (const site of sites) {
    const topology = buildProductionCaveTopology({
      seed,
      site,
      sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
      sampleBaseHeight: analyticSurfaceHeight,
    })
    if (!topology) continue
    v2ByCaveId.set(topology.caveId, { topology, definition: topologyToCaveDefinition(topology) })
    siteByCaveId.set(topology.caveId, site)
  }

  const definitions: CaveDefinition[] = [...v2ByCaveId.values()].map((v) => v.definition)
  if (definitions.length === 0) {
    console.warn('[caves] no cave sites accepted for this seed — try a different ?seed=')
  }

  const volumes: readonly CaveVolume[] = definitions.map((def) => createCaveVolume(def))

  // Local entrance recess only — deterministic from `definition.entrance`,
  // redone from scratch on every world build, never persisted (same
  // 'system' contract `createLargeCaves.ts` used).
  for (const def of definitions) {
    const out = openingDirection(def.entrance.yaw)
    chunkManager.modifyTerrain(
      def.entrance.x + out.dx * 2.2,
      def.entrance.z + out.dz * 2.2,
      APPROACH_RADIUS,
      APPROACH_DEPTH,
      'system',
    )
    chunkManager.modifyTerrain(def.entrance.x, def.entrance.z, MOUTH_RADIUS, MOUTH_DEPTH, 'system')
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

  function activate(def: CaveDefinition): void {
    if (active.has(def.caveId)) return
    const v2 = v2ByCaveId.get(def.caveId)!
    const group = new THREE.Group()
    group.name = `cave:${def.caveId}`
    // Built fresh on every activation (not cached) — `deactivate()` disposes
    // the group's geometry, so a shared/cached mesh would render nothing (or
    // throw) on the next activation.
    const built = buildSdfCaveMesh(v2.topology, undefined, analyticSurfaceHeight)
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
    chunkManager.registerColliders(colliderOwnerKey(def.caveId), buildCaveWallColliders(v2.definition))
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
    contains(x, y, z) {
      return volumes.some((volume) => volume.contains(x, y, z))
    },
    sampleFloor(x, z) {
      let lowest: number | null = null
      for (const volume of volumes) {
        const floor = volume.sampleFloor(x, z)
        if (floor !== null && (lowest === null || floor < lowest)) lowest = floor
      }
      return lowest
    },
    sampleCeiling(x, z) {
      let lowestFloor: number | null = null
      let ceiling: number | null = null
      for (const volume of volumes) {
        const floor = volume.sampleFloor(x, z)
        if (floor !== null && (lowestFloor === null || floor < lowestFloor)) {
          lowestFloor = floor
          ceiling = volume.sampleCeiling(x, z)
        }
      }
      return ceiling
    },
    dispose() {
      for (const caveId of [...active.keys()]) deactivate(caveId)
    },
  }
}
