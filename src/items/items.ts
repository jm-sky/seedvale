import * as THREE from 'three'
import { cloneItemGlb } from './itemModels'

export type ItemKind =
  | 'shell'
  | 'stone'
  | 'branch'
  | 'mushroom'
  | 'flower'
  | 'cone'
  | 'knife'
  | 'long_sword'
  | 'firestarter'
  | 'blanket'
  | 'shovel'
  | 'axe'
  | 'pitchfork'
  | 'sickle'
  | 'wooden_torch'
  | 'pickaxe'
  | 'tent'
  | 'coal'
  | 'iron'
  | 'gold'

export type ItemCategory = 'resource' | 'tool' | 'utility'

export type ItemDef = {
  label: string
  kind: ItemKind
  category: ItemCategory
  description?: string | null | undefined
  /** Kilograms — see `Inventory.ts`'s `totalWeight()`/`canAdd()`. */
  weight: number
  color: number
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  shell: { kind: 'shell', label: 'muszla', category: 'resource', weight: 0.05, color: 0xf2e4c9 },
  stone: { kind: 'stone', label: 'kamień', category: 'resource', weight: 1, color: 0x8c8c8c },
  branch: { kind: 'branch', label: 'gałąź', category: 'resource', weight: 0.5, color: 0x6b4a2f },
  mushroom: { kind: 'mushroom', label: 'grzyb', category: 'resource', weight: 0.1, color: 0xc0453c },
  flower: { kind: 'flower', label: 'kwiat', category: 'resource', weight: 0.05, color: 0xdb6fa3 },
  cone: { kind: 'cone', label: 'szyszka', category: 'resource', weight: 0.1, color: 0x7a5230 },
  knife: { kind: 'knife', label: 'nóż', category: 'tool', weight: 0.4, color: 0xb7bfc7 },
  firestarter: { kind: 'firestarter', label: 'krzesiwo', category: 'tool', weight: 0.2, color: 0x54504a },
  blanket: { kind: 'blanket', label: 'koc', category: 'utility', weight: 1.5, color: 0x8a4b3a },
  shovel: { kind: 'shovel', label: 'łopata', category: 'tool', weight: 2, color: 0x6b4a32 },
  axe: { kind: 'axe', label: 'siekiera', category: 'tool', weight: 2.5, color: 0x7a7e86 },
  long_sword: { kind: 'long_sword', label: 'miecz', category: 'tool', weight: 2.5, color: 0x7a7e86 },
  pitchfork: { kind: 'pitchfork', label: 'widły', category: 'tool', weight: 1.8, color: 0x6b5a3a },
  sickle: { kind: 'sickle', label: 'sierp', category: 'tool', weight: 0.7, color: 0x8a9098 },
  wooden_torch: { kind: 'wooden_torch', label: 'pochodnia', category: 'tool', weight: 1.2, color: 0x7a5230 },
  pickaxe: { kind: 'pickaxe', label: 'kilof', category: 'tool', weight: 2.5, color: 0x7a7e86 },
  tent: { kind: 'tent', label: 'namiot', category: 'utility', weight: 3, color: 0x8a6a3a },
  coal: { kind: 'coal', label: 'węgiel', category: 'resource', weight: 1, color: 0x1c1c1c },
  iron: { kind: 'iron', label: 'żelazo', category: 'resource', weight: 1.5, color: 0x8a4a30 },
  gold: { kind: 'gold', label: 'złoto', category: 'resource', weight: 0.4, color: 0xd4af37 },
}

/** Pickup mesh — prefers a preloaded GLB clone when available (`itemModels.ts`),
 *  otherwise a cheap procedural stand-in (resources + tool fallbacks). */
export function createItemMesh(kind: ItemKind): THREE.Object3D {
  const glb = cloneItemGlb(kind)
  if (glb) return glb

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
  if (kind === 'long_sword') {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.long_sword.color, flatShading: true, metalness: 0.4 }),
    )
    blade.rotation.x = Math.PI / 2
    blade.position.set(0, 0.05, 0.11)
    blade.castShadow = true
    group.add(blade)
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
  if (kind === 'shovel') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a24, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.4
    handle.position.set(0, 0.16, -0.05)
    handle.castShadow = true
    group.add(handle)
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.shovel.color, flatShading: true, metalness: 0.3 }),
    )
    blade.rotation.x = Math.PI
    blade.scale.set(1, 1, 0.5)
    blade.position.set(0, 0.08, 0.13)
    blade.castShadow = true
    group.add(blade)
    return group
  }
  if (kind === 'axe') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.2
    handle.position.set(0, 0.14, -0.02)
    handle.castShadow = true
    group.add(handle)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.05),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.axe.color, flatShading: true, metalness: 0.45 }),
    )
    head.position.set(0.02, 0.18, 0.14)
    head.castShadow = true
    group.add(head)
    return group
  }
  if (kind === 'pitchfork') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a24, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.3
    handle.position.set(0, 0.12, -0.08)
    handle.castShadow = true
    group.add(handle)
    for (let i = -1; i <= 1; i++) {
      const tine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.01, 0.22, 4),
        new THREE.MeshStandardMaterial({ color: ITEM_DEFS.pitchfork.color, flatShading: true, metalness: 0.35 }),
      )
      tine.rotation.x = Math.PI / 2.1
      tine.position.set(i * 0.04, 0.14, 0.22)
      tine.castShadow = true
      group.add(tine)
    }
    return group
  }
  if (kind === 'sickle') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, flatShading: true }),
    )
    handle.rotation.z = Math.PI / 2.4
    handle.position.set(-0.06, 0.06, 0)
    handle.castShadow = true
    group.add(handle)
    const blade = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.018, 4, 10, Math.PI * 1.1),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.sickle.color, flatShading: true, metalness: 0.45 }),
    )
    blade.rotation.set(Math.PI / 2, 0, -0.4)
    blade.position.set(0.06, 0.08, 0.02)
    blade.castShadow = true
    group.add(blade)
    return group
  }
  if (kind === 'coal' || kind === 'iron' || kind === 'gold') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({
        color: ITEM_DEFS[kind].color,
        flatShading: true,
        metalness: kind === 'gold' ? 0.55 : 0.15,
      }),
    )
    mesh.position.y = 0.09
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'pickaxe') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.2
    handle.position.set(0, 0.14, -0.02)
    handle.castShadow = true
    group.add(handle)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.pickaxe.color, flatShading: true, metalness: 0.4 }),
    )
    head.position.set(0, 0.18, 0.16)
    head.castShadow = true
    group.add(head)
    return group
  }
  if (kind === 'tent') {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.tent.color, flatShading: true }),
    )
    mesh.position.y = 0.07
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'wooden_torch') {
    const group = new THREE.Group()
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.028, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.wooden_torch.color, flatShading: true }),
    )
    stick.position.y = 0.28
    stick.castShadow = true
    group.add(stick)
    const wrap = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xc45a1a, flatShading: true, emissive: 0x331100 }),
    )
    wrap.position.y = 0.58
    wrap.scale.set(1, 1.2, 1)
    wrap.castShadow = true
    group.add(wrap)
    return group
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
