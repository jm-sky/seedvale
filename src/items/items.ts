import * as THREE from 'three'

export type ItemKind = 'shell' | 'stone' | 'branch' | 'mushroom' | 'flower' | 'cone'

export type ItemDef = {
  label: string
  color: number
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  shell: { label: 'muszla', color: 0xf2e4c9 },
  stone: { label: 'kamień', color: 0x8c8c8c },
  branch: { label: 'gałąź', color: 0x6b4a2f },
  mushroom: { label: 'grzyb', color: 0xc0453c },
  flower: { label: 'kwiat', color: 0xdb6fa3 },
  cone: { label: 'szyszka', color: 0x7a5230 },
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
  if (kind === 'shell') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 6, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.shell.color, flatShading: true }),
    )
    mesh.scale.set(1, 0.5, 1.3)
    mesh.position.y = 0.08
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'branch') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.035, 0.4, 5),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.branch.color, flatShading: true }),
    )
    mesh.rotation.z = Math.PI / 2.3
    mesh.rotation.y = 0.4
    mesh.position.y = 0.05
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'mushroom') {
    const group = new THREE.Group()
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, flatShading: true }),
    )
    stem.position.y = 0.07
    stem.castShadow = true
    group.add(stem)
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.mushroom.color, flatShading: true }),
    )
    cap.position.y = 0.13
    cap.castShadow = true
    group.add(cap)
    return group
  }
  if (kind === 'flower') {
    const group = new THREE.Group()
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.015, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a7a3a, flatShading: true }),
    )
    stem.position.y = 0.11
    stem.castShadow = true
    group.add(stem)
    const bloom = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.06, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.flower.color, flatShading: true }),
    )
    bloom.position.y = 0.24
    bloom.castShadow = true
    group.add(bloom)
    return group
  }
  // cone
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.14, 6),
    new THREE.MeshStandardMaterial({ color: ITEM_DEFS.cone.color, flatShading: true }),
  )
  mesh.position.y = 0.07
  mesh.castShadow = true
  return mesh
}
