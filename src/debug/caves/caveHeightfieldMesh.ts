/** Debug harness re-export of the production cave heightfield mesher.
 *
 *  The buffer assembly lives in `src/world/caves/caveHeightfieldMesh.ts`
 *  (pure) and the Three.js wrappers in
 *  `src/world/caves/caveHeightfieldPresentation.ts`; the shared contour
 *  helper is `src/terrain/gridContour.ts`. This module keeps the spike
 *  names so the `?caveHeightfieldTest` harness does not fork a second mesh
 *  algorithm (plan world-terrain-019 Milestone B).
 *
 * @domain world-terrain
 */

import { Mesh } from 'three'
import type { CaveHeightfield } from './caveHeightfieldRepresentation'
import { buildHeightfieldMeshBuffers, type HeightfieldMeshBuffers } from '../../world/caves/caveHeightfieldMesh'
import {
  createCaveHeightfieldGeometry,
  createCaveHeightfieldMaterial,
  createMouthUndersideMaskMaterial,
  createMouthUndersideMask as createProductionMouthUndersideMask,
} from '../../world/caves/caveHeightfieldPresentation'

export { CELL_RING, marchCellRing } from '../../terrain/gridContour'
export {
  buildHeightfieldMeshBuffers,
  buildMouthUndersideMaskBuffers,
  type HeightfieldMeshBuffers,
  type MouthUndersideMaskBuffers,
} from '../../world/caves/caveHeightfieldMesh'
export {
  createCaveHeightfieldGeometry as createHeightfieldCaveGeometry,
  createCaveHeightfieldMaterial as createHeightfieldCaveMaterial,
} from '../../world/caves/caveHeightfieldPresentation'

export function createHeightfieldCaveMesh(field: CaveHeightfield): {
  mesh: Mesh
  buffers: HeightfieldMeshBuffers
} {
  const buffers = buildHeightfieldMeshBuffers(field)
  const mesh = new Mesh(createCaveHeightfieldGeometry(buffers), createCaveHeightfieldMaterial())
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'cave-heightfield'
  return { mesh, buffers }
}

/** Harness variant owns its own (per-scene) mask material. */
export function createMouthUndersideMask(
  field: CaveHeightfield,
  mouthOpening: (x: number, z: number) => number,
  walkSurfaceAt: (x: number, z: number) => number,
): Mesh | null {
  const mesh = createProductionMouthUndersideMask(field, mouthOpening, walkSurfaceAt, createMouthUndersideMaskMaterial())
  if (mesh) mesh.name = 'cave-heightfield-mouth-mask'
  return mesh
}
