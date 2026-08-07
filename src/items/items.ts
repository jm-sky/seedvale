import * as THREE from 'three'

export type ItemKind = 'shell' | 'stone'

export type ItemDef = {
  label: string
  color: number
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  shell: { label: 'muszla', color: 0xf2e4c9 },
  stone: { label: 'kamień', color: 0x8c8c8c },
}

/** Small procedural pickup mesh — no GLB assets for these, they're meant to be
 *  cheap and plentiful. */
export function createItemMesh(kind: ItemKind): THREE.Object3D {
  if (kind === 'stone') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.14, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.stone.color, flatShading: true }),
    )
    mesh.position.y = 0.1
    mesh.castShadow = true
    return mesh
  }
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 6, 4),
    new THREE.MeshStandardMaterial({ color: ITEM_DEFS.shell.color, flatShading: true }),
  )
  mesh.scale.set(1, 0.5, 1.3)
  mesh.position.y = 0.08
  mesh.castShadow = true
  return mesh
}
