import * as THREE from 'three'

export type ItemKind =
  | 'shell'
  | 'stone'
  | 'branch'
  | 'mushroom'
  | 'flower'
  | 'cone'
  | 'knife'
  | 'firestarter'
  | 'blanket'

export type ItemCategory = 'resource' | 'tool' | 'utility'

export type ItemDef = {
  label: string
  category: ItemCategory
  /** Kilograms — see `Inventory.ts`'s `totalWeight()`/`canAdd()`. */
  weight: number
  color: number
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  shell: { label: 'muszla', category: 'resource', weight: 0.05, color: 0xf2e4c9 },
  stone: { label: 'kamień', category: 'resource', weight: 1, color: 0x8c8c8c },
  branch: { label: 'gałąź', category: 'resource', weight: 0.5, color: 0x6b4a2f },
  mushroom: { label: 'grzyb', category: 'resource', weight: 0.1, color: 0xc0453c },
  flower: { label: 'kwiat', category: 'resource', weight: 0.05, color: 0xdb6fa3 },
  cone: { label: 'szyszka', category: 'resource', weight: 0.1, color: 0x7a5230 },
  knife: { label: 'nóż', category: 'tool', weight: 0.4, color: 0xb7bfc7 },
  firestarter: { label: 'krzesiwo', category: 'tool', weight: 0.2, color: 0x54504a },
  blanket: { label: 'koc', category: 'utility', weight: 1.5, color: 0x8a4b3a },
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
  if (kind === 'cone') {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.cone.color, flatShading: true }),
    )
    mesh.position.y = 0.07
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'knife') {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.knife.color, flatShading: true, metalness: 0.4 }),
    )
    blade.rotation.x = Math.PI / 2
    blade.position.set(0, 0.05, 0.11)
    blade.castShadow = true
    group.add(blade)
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2
    handle.position.set(0, 0.05, -0.06)
    handle.castShadow = true
    group.add(handle)
    return group
  }
  if (kind === 'firestarter') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.1, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.firestarter.color, flatShading: true }),
    )
    mesh.scale.set(1.2, 0.5, 0.9)
    mesh.position.y = 0.06
    mesh.castShadow = true
    return mesh
  }
  // blanket
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.06, 0.32),
    new THREE.MeshStandardMaterial({ color: ITEM_DEFS.blanket.color, flatShading: true }),
  )
  mesh.position.y = 0.03
  mesh.castShadow = true
  return mesh
}
