import * as THREE from 'three'
import type { CropGrowthStage } from './cropLifecycle'
import { createItemMesh, type ItemKind } from '../items/items'

/** Minimal stage visual (plan 172 §4) — reuses each crop's existing pickup
 *  mesh (`items.ts`'s `createItemMesh`) instead of authoring per-stage GLBs:
 *  `young` is a small pale sprout stand-in, `mature` is the normal pickup
 *  shape, `spoiled` is the same shape darkened. No shared/instanced geometry
 *  here — natural crop density per chunk is small (`CROP_CANDIDATES_PER_CHUNK`
 *  in `terrain/chunkCrops.ts`), the same order of magnitude as the existing
 *  individually-meshed flora pickups (`chunkManager.ts`'s `chunk-items` group). */
export function createCropStageMesh(harvestItem: ItemKind, stage: CropGrowthStage): THREE.Object3D {
  const mesh = createItemMesh(harvestItem)

  if (stage === 'young') {
    mesh.scale.multiplyScalar(0.45)
    tintMaterials(mesh, 0x8fbf5a, 0.35)
    return mesh
  }
  if (stage === 'spoiled') {
    tintMaterials(mesh, 0x2a2118, 0.6)
    mesh.rotation.z += 0.35
    return mesh
  }
  return mesh
}

function tintMaterials(root: THREE.Object3D, color: number, amount: number): void {
  const tint = new THREE.Color(color)
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.lerp(tint, amount)
      }
    }
  })
}
