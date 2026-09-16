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

const UBC_HAIR_MATERIAL_NAMES = new Set(['MI_Hair_1', 'MI_Hair_2'])

function cloneNamedMaterials(
  root: THREE.Object3D,
  names: ReadonlySet<string>,
  flag: 'ubcOutfitMaterial' | 'ubcHairMaterial' | 'ubcAccessoryMaterial',
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned = source.map((material) => {
      if (!names.has(material.name)) return material
      const copy = material.clone()
      copy.userData[flag] = true
      copy.userData.sharedGpu = false
      copy.userData.defaultMap = (copy as THREE.MeshStandardMaterial).map ?? null
      return copy
    })
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]!
  })
}

/**
 * Clone `MI_*` outfit and `MI_Hair_*` materials so a tint swap cannot mutate
 * the shared GLTF cache (player and NPCs load the same male Peasant/Wizard
 * meshes; npc-040 also swaps hair albedo).
 */
export function cloneOutfitMaterials(root: THREE.Object3D): void {
  cloneNamedMaterials(root, UBC_OUTFIT_MATERIAL_NAMES, 'ubcOutfitMaterial')
  cloneNamedMaterials(root, UBC_HAIR_MATERIAL_NAMES, 'ubcHairMaterial')
}

/**
 * Clone `MI_*` materials on a runtime accessory so player `?playerTint=`
 * cannot recolor them through {@link applyOutfitTint}.
 */
export function cloneAccessoryMaterials(root: THREE.Object3D): void {
  cloneNamedMaterials(root, UBC_OUTFIT_MATERIAL_NAMES, 'ubcAccessoryMaterial')
}

export function disposeOutfitMaterialClones(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (
        material.userData.ubcOutfitMaterial
        || material.userData.ubcHairMaterial
        || material.userData.ubcAccessoryMaterial
      ) {
        material.dispose()
      }
    }
  })
}

export function disposeAccessoryMaterialClones(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (material.userData.ubcAccessoryMaterial) material.dispose()
    }
  })
}

function applyMapOnFlag(
  root: THREE.Object3D,
  flag: 'ubcOutfitMaterial' | 'ubcHairMaterial' | 'ubcAccessoryMaterial',
  tintMap: THREE.Texture | null,
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material.userData[flag]) continue
      const std = material as THREE.MeshStandardMaterial
      const fallback = (material.userData.defaultMap as THREE.Texture | null | undefined) ?? null
      std.map = tintMap ?? fallback
      std.needsUpdate = true
    }
  })
}

async function loadTintMap(tintUrl: string): Promise<THREE.Texture | null> {
  try {
    const tintMap = await loadTexture(tintUrl)
    tintMap.flipY = false
    tintMap.wrapS = THREE.RepeatWrapping
    tintMap.wrapT = THREE.RepeatWrapping
    tintMap.colorSpace = THREE.SRGBColorSpace
    tintMap.needsUpdate = true
    return tintMap
  } catch (err) {
    console.warn(`[ubc] failed to load tint ${tintUrl}`, err)
    return null
  }
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
    tintMap = await loadTintMap(tintUrl)
    if (!tintMap) return false
  }
  applyMapOnFlag(root, 'ubcOutfitMaterial', tintMap)
  return true
}

/** Swap cloned accessory `MI_*` albedo independently of player outfit tint. */
export async function applyAccessoryTint(
  root: THREE.Object3D,
  tintUrl: string | null,
): Promise<boolean> {
  let tintMap: THREE.Texture | null = null
  if (tintUrl) {
    tintMap = await loadTintMap(tintUrl)
    if (!tintMap) return false
  }
  applyMapOnFlag(root, 'ubcAccessoryMaterial', tintMap)
  return true
}

/** Multiply cloned outfit albedo after the role sidecar (npc-040). */
export function applyClothingHue(root: THREE.Object3D, hue: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material.userData.ubcOutfitMaterial) continue
      const std = material as THREE.MeshStandardMaterial
      std.color.setHex(hue)
      std.needsUpdate = true
    }
  })
}

/** Multiply cloned `MI_Hair_*` albedo (npc-040 hair color). */
export function applyHairColor(root: THREE.Object3D, color: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material.userData.ubcHairMaterial) continue
      const std = material as THREE.MeshStandardMaterial
      std.color.setHex(color)
      std.needsUpdate = true
    }
  })
}

/**
 * Swap cloned `MI_Hair_*` albedo maps. Beard uses `MI_Hair_1`, so it follows
 * the same sidecar. Returns false if the sidecar failed to load.
 */
export async function applyHairTint(
  root: THREE.Object3D,
  tintUrl: string | null,
): Promise<boolean> {
  let tintMap: THREE.Texture | null = null
  if (tintUrl) {
    tintMap = await loadTintMap(tintUrl)
    if (!tintMap) return false
  }
  applyMapOnFlag(root, 'ubcHairMaterial', tintMap)
  return true
}
