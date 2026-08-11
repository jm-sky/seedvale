import * as THREE from 'three'
import type { ResolvedTreeState } from './treeLifecycle'
import { disposeObject3D } from '../assets/loadGltf'
import { createTreeStump } from '../settlement/props'

/**
 * Swap a living tree mesh for a stump in-place (same parent/pose/userData).
 * Returns the new stump object so callers can update landmark mesh refs.
 */
export function applyHarvestedTreeVisual(tree: THREE.Object3D): THREE.Object3D {
  const parent = tree.parent
  const baseScale =
    typeof tree.userData.treeBaseScale === 'number' ? tree.userData.treeBaseScale : 1
  const stump = createTreeStump(baseScale * 0.28)
  stump.position.copy(tree.position)
  stump.rotation.copy(tree.rotation)
  stump.userData = { ...tree.userData, treeStage: 'harvested' }
  parent?.add(stump)
  tree.removeFromParent()
  disposeObject3D(tree)
  return stump
}

/** Tag a freshly built tree mesh with lifecycle identity for later harvest visuals. */
export function tagTreeMesh(
  mesh: THREE.Object3D,
  resolved: ResolvedTreeState,
  baseScale: number,
  speciesIndex: number,
  initialStage: string,
): void {
  mesh.userData.treeId = resolved.id
  mesh.userData.treeBaseScale = baseScale
  mesh.userData.treeSpeciesIndex = speciesIndex
  mesh.userData.treeInitialStage = initialStage
  mesh.userData.treeStage = resolved.stage
}
