import type { ChunkManager } from '../terrain/chunkManager'
import { disposeObject3D } from '../assets/loadGltf'
import { villageSizeConfig } from '../settlement/families'
import { cellsWithinRadius, SETTLEMENT_GRID_STEP } from '../settlement/settlementGenerator'
import {
  LARGE_CAVE_MOUTH_WIDTH,
  type LargeCaveSite,
  openingDirection,
  pickLargeCaveSites,
  tunnelDirection,
} from './largeCaves'
import { createLargeCaveVisual, placeLargeCaveVisual } from './largeCaveVisual'
import type { Scene } from 'three'

export type LargeCaves = {
  sites: () => readonly LargeCaveSite[]
  dispose: () => void
}

const APPROACH_RADIUS = 3.2
const APPROACH_DEPTH = 1.35
const MOUTH_RADIUS = LARGE_CAVE_MOUTH_WIDTH * 0.55
const MOUTH_DEPTH = 2.4
const TUNNEL_RADIUS = 1.7
const TUNNEL_DEPTH = 2.8
const END_RADIUS = 1.5
const END_DEPTH = 2.2

/** Deterministic from `site` (itself derived from `pickLargeCaveSites`+seed)
 *  — redone from scratch on every world build (fresh load *and* rebuild), so
 *  every carve here is `'system'`: never persisted, never replayed from a
 *  saved modification (plan `world-terrain-save`). */
function carveSite(chunkManager: ChunkManager, site: LargeCaveSite): void {
  const out = openingDirection(site.yaw)
  const into = tunnelDirection(site.yaw)

  chunkManager.modifyTerrain(
    site.x + out.dx * 2.2,
    site.z + out.dz * 2.2,
    APPROACH_RADIUS,
    APPROACH_DEPTH,
    'system',
  )
  chunkManager.modifyTerrain(site.x, site.z, MOUTH_RADIUS, MOUTH_DEPTH, 'system')

  const steps = Math.max(5, Math.round(site.length / 2))
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    const along = t * site.length
    const depth = TUNNEL_DEPTH * (0.85 + (1 - t) * 0.2)
    chunkManager.modifyTerrain(
      site.x + into.dx * along,
      site.z + into.dz * along,
      TUNNEL_RADIUS + (1 - t) * 0.25,
      depth,
      'system',
    )
  }
  chunkManager.modifyTerrain(
    site.x + into.dx * site.length,
    site.z + into.dz * site.length,
    END_RADIUS,
    END_DEPTH,
    'system',
  )
}

/**
 * Places world-scale walk-in caves: heightmap trench + rock framing.
 * Modifications live on `ChunkManager` so they reapply when chunks stream in.
 */
export function createLargeCaves(
  scene: Scene,
  chunkManager: ChunkManager,
  seed: number,
  homeRadius: number,
  coastThreshold: number,
): LargeCaves {
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

  const meshes = sites.map((site) => {
    carveSite(chunkManager, site)
    const visual = createLargeCaveVisual(site)
    placeLargeCaveVisual(visual, site, (x, z) => chunkManager.sampleBaseHeight(x, z))
    scene.add(visual)
    return visual
  })

  return {
    sites: () => sites,
    dispose() {
      for (const mesh of meshes) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
      }
      meshes.length = 0
    },
  }
}
