import * as THREE from 'three'
import type { ChunkManager } from '../terrain/chunkManager'
import type { CaveTopology } from './caves/caveTopology'
import { disposeObject3D } from '../assets/loadGltf'
import { caveSpikeVariant } from '../debug/debugMode'
import { villageSizeConfig } from '../settlement/families'
import { cellsWithinRadius, SETTLEMENT_GRID_STEP } from '../settlement/settlementGenerator'
import { buildCaveWallColliders } from './caveColliders'
import { CAVE_MOUTH_DEPTH, generateCaveDefinitions } from './caveGenerator'
import { createCaveInteriorMesh } from './caveMesh'
import { createCaveSpikeMaterial } from './caves/caveSpikeMaterial'
import { reportCaveSpikeMetrics, runMedianOfN } from './caves/caveSpikeMetrics'
import { buildSdfCaveMesh } from './caves/sdfCaveMesh'
import { buildSpikeTestTopology } from './caves/spikeTestCave'
import { buildSweepCaveMesh } from './caves/sweepCaveMesh'
import { topologyToCaveDefinition } from './caves/topologyAdapter'
import { type CaveBounds, type CaveDefinition, type CaveVolume, createCaveVolume } from './caveVolume'
import { openingDirection } from './largeCaves'
import { createLargeCaveVisual, placeLargeCaveVisual } from './largeCaveVisual'
import type { Scene } from 'three'

/** Local terrain recess at the mouth only — the underground tunnel/chamber
 *  itself is never carved into the surface heightmap (plan world-terrain-007
 *  §7/§9), it's the procedural interior mesh (`caveMesh.ts`). Same constants
 *  `createLargeCaves.ts` used for its mouth/approach carve. */
const APPROACH_RADIUS = 3.2
const APPROACH_DEPTH = 1.35
const MOUTH_RADIUS = 1.65
/** Same depth `caveGenerator.ts` starts the interior at — the mouth node's
 *  floor is the bottom of this recess, so the two must never drift apart. */
const MOUTH_DEPTH = CAVE_MOUTH_DEPTH

/** Short synthetic "site" length fed to the existing `largeCaveVisual.ts`
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
 * Owns the plan world-terrain-007 cave subsystem: deterministic
 * `CaveDefinition`s (cheap, all computed up front — same reasoning as
 * `largeCaves.ts`'s sites), streamed presentation and cave-wall collision
 * for whichever caves are near the player. Same lifecycle as `WorldBundle`
 * (create/dispose alongside it, never survives a rebuild).
 *
 * @system caves
 * @role Owns cave definitions, streamed interior presentation and
 *  cave-wall collider registration; `PlayerController` ground/ceiling
 *  queries go through `contains`/`sampleFloor`/`sampleCeiling`.
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

  const definitions = generateCaveDefinitions({
    seed,
    sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
    sampleContinentalness: (x, z) => chunkManager.sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => chunkManager.sampleMountainRidge(x, z),
    waterLevel: chunkManager.waterLevel,
    coastThreshold,
    roadsNear: (x, z, querySize) => chunkManager.roadCorridorsNear(x, z, querySize),
    villages,
  })
  // Plan world-terrain-008 Milestone A comparison harness — off by default,
  // one cave only, deleted (along with `caveSpikeVariant()`) after the
  // architecture decision gate. See implementation notes "Shared Comparison
  // Harness".
  const spikeVariant = caveSpikeVariant()
  const spikeTarget = spikeVariant ? definitions[0] : undefined
  let spikeTopology: CaveTopology | undefined
  let spikeDef: CaveDefinition | undefined
  if (spikeVariant && !spikeTarget) {
    console.warn('[caveSpike] no cave definitions accepted for this seed — try a different ?seed=')
  } else if (spikeVariant && spikeTarget) {
    spikeTopology = buildSpikeTestTopology(seed, spikeTarget.entrance)
    spikeDef = topologyToCaveDefinition(spikeTopology)
    console.log(
      `[caveSpike] variant=${spikeVariant} caveId=${spikeTarget.caveId} entrance=(${spikeTarget.entrance.x.toFixed(1)}, ${spikeTarget.entrance.z.toFixed(1)})`,
    )
    const build = (): ReturnType<typeof buildSweepCaveMesh> | ReturnType<typeof buildSdfCaveMesh> =>
      spikeVariant === 'sweep' ? buildSweepCaveMesh(spikeTopology!) : buildSdfCaveMesh(spikeTopology!)
    const sample = runMedianOfN(build, 5)
    sample.geometry.dispose()
    reportCaveSpikeMetrics(sample.metrics)
  }

  const volumes: readonly CaveVolume[] = definitions.map((def) =>
    createCaveVolume(spikeTarget && spikeDef && def.caveId === spikeTarget.caveId ? spikeDef : def),
  )

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

  function activate(def: CaveDefinition): void {
    if (active.has(def.caveId)) return
    const isSpikeTarget = Boolean(spikeVariant && spikeTarget && spikeTopology && def.caveId === spikeTarget.caveId)
    const group = new THREE.Group()
    group.name = `cave:${def.caveId}`
    if (isSpikeTarget) {
      // Built fresh on every activation (not cached) — `deactivate()` disposes
      // the group's geometry, so a shared/cached spike mesh would render
      // nothing (or throw) on the next activation.
      const built = spikeVariant === 'sweep' ? buildSweepCaveMesh(spikeTopology!) : buildSdfCaveMesh(spikeTopology!)
      const mesh = new THREE.Mesh(built.geometry, createCaveSpikeMaterial())
      mesh.name = `cave-interior-spike:${def.caveId}`
      mesh.receiveShadow = true
      group.add(mesh)
    } else {
      group.add(createCaveInteriorMesh(def))
    }
    const framingSite = { x: def.entrance.x, z: def.entrance.z, yaw: def.entrance.yaw, length: MOUTH_FRAMING_LENGTH, variant: def.variant }
    const framing = createLargeCaveVisual(framingSite)
    placeLargeCaveVisual(framing, framingSite, (x, z) => chunkManager.sampleBaseHeight(x, z))
    group.add(framing)
    scene.add(group)
    chunkManager.registerColliders(colliderOwnerKey(def.caveId), buildCaveWallColliders(isSpikeTarget && spikeDef ? spikeDef : def))
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
