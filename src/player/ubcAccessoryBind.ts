import * as THREE from 'three'

export type NamedBone = { name: string }

/**
 * Map accessory joint names onto a destination skeleton. Returns the
 * destination names in source order, or `null` when any joint is missing.
 *
 * @domain items-player
 */
export function mapBonesByName(
  sourceBones: readonly NamedBone[],
  destNames: ReadonlySet<string>,
): string[] | null {
  const mapped: string[] = []
  for (const bone of sourceBones) {
    if (!destNames.has(bone.name)) return null
    mapped.push(bone.name)
  }
  return mapped
}

export function collectBoneNames(root: THREE.Object3D): Set<string> {
  const names = new Set<string>()
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) names.add(obj.name)
  })
  return names
}

function collectBonesByName(root: THREE.Object3D): Map<string, THREE.Bone> {
  const bones = new Map<string, THREE.Bone>()
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) bones.set(obj.name, obj as THREE.Bone)
  })
  return bones
}

function collectSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = []
  root.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(obj as THREE.SkinnedMesh)
  })
  return meshes
}

/**
 * Rebind accessory skinned meshes onto the live player UBC skeleton.
 * The accessory armature is remap source data only — no second mixer.
 * Missing joints fail closed (skip + warn) rather than a partial bind.
 *
 * @domain items-player
 */
export function bindAccessoryToPlayerSkeleton(
  accessoryRoot: THREE.Object3D,
  playerRoot: THREE.Object3D,
): THREE.Group | null {
  const destBones = collectBonesByName(playerRoot)
  const destNames = new Set(destBones.keys())
  const skinned = collectSkinnedMeshes(accessoryRoot)
  if (skinned.length === 0) {
    console.warn('[player] accessory has no SkinnedMesh; skipping visual')
    return null
  }

  const wrapper = new THREE.Group()
  wrapper.name = 'ubcEquipmentVisual'
  for (const mesh of skinned) {
    const mapped = mapBonesByName(mesh.skeleton.bones, destNames)
    if (!mapped) {
      console.warn('[player] accessory skeleton joints do not match the UBC rig; skipping visual')
      return null
    }
    const bones = mapped.map((name) => destBones.get(name)!)
    mesh.bind(new THREE.Skeleton(bones, mesh.skeleton.boneInverses.slice()))
    mesh.removeFromParent()
    wrapper.add(mesh)
  }
  return wrapper
}
