import * as THREE from 'three'
import { loadTexture } from './loadTexture'

/** Outfit clothes materials in composed UBC GLBs (gltfpack drops mesh names). */
const UBC_OUTFIT_MATERIAL_NAMES = new Set([
  'MI_Knight',
  'MI_Noble',
  'MI_Peasant',
  'MI_Ranger',
  'MI_Wizard',
])

/**
 * Clone `MI_*` outfit materials so a tint swap cannot mutate the shared GLTF
 * cache (player and NPCs load the same male Peasant/Wizard meshes).
 */
export function cloneOutfitMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned = source.map((material) => {
      if (!UBC_OUTFIT_MATERIAL_NAMES.has(material.name)) return material
      const copy = material.clone()
      copy.userData.ubcOutfitMaterial = true
      copy.userData.sharedGpu = false
      copy.userData.defaultMap = (copy as THREE.MeshStandardMaterial).map ?? null
      return copy
    })
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]!
  })
}

export function disposeOutfitMaterialClones(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (material.userData.ubcOutfitMaterial) material.dispose()
    }
  })
}

function applyOutfitTintMap(root: THREE.Object3D, tintMap: THREE.Texture | null): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material.userData.ubcOutfitMaterial) continue
      const std = material as THREE.MeshStandardMaterial
      const fallback = (material.userData.defaultMap as THREE.Texture | null | undefined) ?? null
      std.map = tintMap ?? fallback
      std.needsUpdate = true
    }
  })
}

/**
 * Swap cloned `MI_*` albedo maps to `tintUrl`, or restore the baked default
 * when `tintUrl` is null. Returns false if the sidecar failed to load.
 */
export async function applyOutfitTint(
  root: THREE.Object3D,
  tintUrl: string | null,
): Promise<boolean> {
  let tintMap: THREE.Texture | null = null
  if (tintUrl) {
    try {
      tintMap = await loadTexture(tintUrl)
      tintMap.flipY = false
      tintMap.wrapS = THREE.RepeatWrapping
      tintMap.wrapT = THREE.RepeatWrapping
      tintMap.colorSpace = THREE.SRGBColorSpace
      tintMap.needsUpdate = true
    } catch (err) {
      console.warn(`[ubc] failed to load outfit tint ${tintUrl}`, err)
      return false
    }
  }
  applyOutfitTintMap(root, tintMap)
  return true
}
