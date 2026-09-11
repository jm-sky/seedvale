/** Cave mouth → persistent terrain cutout descriptor (plan world-terrain-019
 *  Milestone B). The only thing the terrain side learns about a cave is a
 *  small `TerrainCutout`: an id, tight XZ bounds around the aperture and the
 *  shared `mouthOpeningAt` predicate — never the representation itself.
 *
 *  The predicate is the *same* contour the heightfield ceiling is clipped on
 *  (`caveHeightfieldMesh.ts`) and the underside mask / rock framing march
 *  along (`caveHeightfieldPresentation.ts`), so terrain and cave stop on one
 *  logical line. Positive = cave void breaks the walk surface = no terrain.
 *
 * @domain world-terrain
 */

import type { TerrainCutout, TerrainCutoutBounds } from '../../terrain/terrainCutout'
import {
  type CaveHeightfieldRepresentation,
  heightfieldNodeGap,
  heightfieldNodeOpenSky,
  mouthOpeningAt,
  type SurfaceSampler,
} from './caveHeightfieldRepresentation'

/** Metres added around the open-sky node box. Covers the half-cell the true
 *  zero crossing can sit past the last open node, plus bilinear-vs-exact
 *  surface slack between heightfield nodes, with margin to spare — the
 *  terrain grid (~1 m) only evaluates the predicate inside these bounds. */
const CUTOUT_BOUNDS_MARGIN = 1.5

/** XZ box of every node whose ceiling breaks the walk surface, or `null`
 *  when the field never reaches the surface (no aperture to cut). */
export function caveOpenSkyBounds(field: CaveHeightfieldRepresentation): TerrainCutoutBounds | null {
  let minIx = Infinity
  let maxIx = -Infinity
  let minIz = Infinity
  let maxIz = -Infinity
  for (let iz = 0; iz < field.nz; iz++) {
    for (let ix = 0; ix < field.nx; ix++) {
      const i = iz * field.nx + ix
      // `mouthOpeningAt = min(gap, ...)`: only void nodes can open.
      if (heightfieldNodeGap(field, i) <= 0 || !heightfieldNodeOpenSky(field, i)) continue
      if (ix < minIx) minIx = ix
      if (ix > maxIx) maxIx = ix
      if (iz < minIz) minIz = iz
      if (iz > maxIz) maxIz = iz
    }
  }
  if (!Number.isFinite(minIx)) return null
  return {
    minX: field.originX + minIx * field.cellSize - CUTOUT_BOUNDS_MARGIN,
    maxX: field.originX + maxIx * field.cellSize + CUTOUT_BOUNDS_MARGIN,
    minZ: field.originZ + minIz * field.cellSize - CUTOUT_BOUNDS_MARGIN,
    maxZ: field.originZ + maxIz * field.cellSize + CUTOUT_BOUNDS_MARGIN,
  }
}

/**
 * Terrain-facing cutout for one cave, or `null` when the cave has no
 * surface-breaking aperture. `walkSurfaceAt` must be the same deterministic
 * sampler the field was built against (`sampleBaseHeight - mouthCarveDepth`).
 *
 * @domain world-terrain
 */
export function caveTerrainCutout(
  field: CaveHeightfieldRepresentation,
  walkSurfaceAt: SurfaceSampler,
): TerrainCutout | null {
  const bounds = caveOpenSkyBounds(field)
  if (!bounds) return null
  return {
    id: `cave:${field.caveId}`,
    bounds,
    openingAt: (x, z) => mouthOpeningAt(field, walkSurfaceAt, x, z),
    // The cave's open-sky rim sits on the walk surface; pin the terrain edge
    // to the same height so the seam closes vertically too.
    surfaceYAt: walkSurfaceAt,
  }
}
