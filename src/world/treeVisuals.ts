import * as THREE from 'three'
import type {
  ResolvedTreeState,
  TreeGrowthStage,
  TreeSizeClass,
  TreeVisualKind,
} from './treeLifecycle'
import { disposeObject3D } from '../assets/loadGltf'
import {
  createFelledTree,
  createLimbedTree,
  createTree,
  createTreeStump,
} from '../settlement/props'
import { treeVisualKind, visualScaleForTree } from './treeLifecycle'

/** Stable yaw from TreeId so felled logs don't all point the same way. */
export function felledYawFromTreeId(treeId: string): number {
  let h = 0
  for (let i = 0; i < treeId.length; i++) h = (h * 31 + treeId.charCodeAt(i)) | 0
  return ((h >>> 0) % 360) * (Math.PI / 180)
}

/** Build the mesh for a resolved chop/growth visual (no living GLB templates). */
export function createTreeStageMesh(
  visual: TreeVisualKind,
  scale: number,
  treeId: string,
): THREE.Object3D {
  switch (visual) {
    case 'felled':
      return createFelledTree(scale, felledYawFromTreeId(treeId))
    case 'limbed':
      return createLimbedTree(scale)
    case 'living':
      return createTree(scale)
    case 'stump':
      return createTreeStump(scale)
    default:
      return createTree(scale)
  }
}

export function readTreeSizeClass(userData: Record<string, unknown>): TreeSizeClass {
  const v = userData.treeSizeClass
  if (v === 'small' || v === 'medium' || v === 'large') return v
  return 'medium'
}

export function readTreeSizeJitter(userData: Record<string, unknown>): number {
  return typeof userData.treeSizeJitter === 'number' ? userData.treeSizeJitter : 0.5
}

export function readTreeLivingStage(
  userData: Record<string, unknown>,
): 'sapling' | 'young' | 'mature' | 'old' {
  const v = userData.treeInitialStage
  if (v === 'sapling' || v === 'young' || v === 'mature' || v === 'old') return v
  return 'mature'
}

/**
 * Swap a tree mesh for the mesh matching `stage` (same parent/pose/userData).
 * Returns the new object so callers can update landmark mesh refs.
 */
export function applyTreeStageVisual(
  tree: THREE.Object3D,
  stage: TreeGrowthStage,
): THREE.Object3D {
  const parent = tree.parent
  const speciesIndex =
    typeof tree.userData.treeSpeciesIndex === 'number' ? tree.userData.treeSpeciesIndex : 0
  const sizeClass = readTreeSizeClass(tree.userData)
  const sizeJitter = readTreeSizeJitter(tree.userData)
  const treeId = typeof tree.userData.treeId === 'string' ? tree.userData.treeId : ''
  const visual = treeVisualKind(stage)
  const scale = visualScaleForTree(speciesIndex, stage, sizeClass, sizeJitter)
  const next = createTreeStageMesh(visual, scale, treeId)
  next.position.copy(tree.position)
  next.rotation.copy(tree.rotation)
  next.userData = { ...tree.userData, treeStage: stage }
  parent?.add(next)
  tree.removeFromParent()
  disposeObject3D(tree)
  return next
}

/**
 * Swap a living tree mesh for a stump in-place (same parent/pose/userData).
 * @deprecated Prefer `applyTreeStageVisual(tree, 'harvested')`.
 */
export function applyHarvestedTreeVisual(tree: THREE.Object3D): THREE.Object3D {
  return applyTreeStageVisual(tree, 'harvested')
}

/** Tag a freshly built tree mesh with lifecycle identity for later harvest visuals. */
export function tagTreeMesh(
  mesh: THREE.Object3D,
  resolved: ResolvedTreeState,
  sizeClass: TreeSizeClass,
  sizeJitter: number,
  speciesIndex: number,
  initialStage: string,
): void {
  mesh.userData.treeId = resolved.id
  mesh.userData.treeSizeClass = sizeClass
  mesh.userData.treeSizeJitter = sizeJitter
  mesh.userData.treeSpeciesIndex = speciesIndex
  mesh.userData.treeInitialStage = initialStage
  mesh.userData.treeStage = resolved.stage
}
