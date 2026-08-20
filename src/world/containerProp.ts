import * as THREE from 'three'
import { disposeObject3D } from '../assets/loadGltf'
import { ITEM_DEFS } from '../items/items'

/**
 * Procedural visual for a placed `chest` container (plan 164 §26 — no GLB
 * yet, `docs/assets/MODELS.md`). Same convention as `items/tentProp.ts` /
 * `world/trapProp.ts`: a cheap box + lid, no per-frame animation.
 */
const CHEST_WIDTH = 0.9
const CHEST_DEPTH = 0.55
const CHEST_BODY_HEIGHT = 0.45
const CHEST_LID_HEIGHT = 0.16

export function createPlacedContainerProp(): THREE.Group {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({
    color: ITEM_DEFS.chest.color,
    flatShading: true,
    roughness: 0.9,
  })
  const band = new THREE.MeshStandardMaterial({ color: 0x3a3028, flatShading: true, roughness: 0.6, metalness: 0.2 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(CHEST_WIDTH, CHEST_BODY_HEIGHT, CHEST_DEPTH), wood)
  body.position.y = CHEST_BODY_HEIGHT * 0.5
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const lid = new THREE.Mesh(new THREE.BoxGeometry(CHEST_WIDTH * 1.02, CHEST_LID_HEIGHT, CHEST_DEPTH * 1.05), wood)
  lid.position.y = CHEST_BODY_HEIGHT + CHEST_LID_HEIGHT * 0.5
  lid.castShadow = true
  group.add(lid)

  for (const dz of [-CHEST_DEPTH * 0.5, CHEST_DEPTH * 0.5]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(CHEST_WIDTH * 1.03, CHEST_BODY_HEIGHT + CHEST_LID_HEIGHT, 0.04), band)
    strap.position.set(0, (CHEST_BODY_HEIGHT + CHEST_LID_HEIGHT) * 0.5, dz)
    group.add(strap)
  }

  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), band)
  clasp.position.set(0, CHEST_BODY_HEIGHT - 0.05, CHEST_DEPTH * 0.5)
  group.add(clasp)

  return group
}

export function disposePlacedContainerProp(prop: THREE.Object3D): void {
  prop.removeFromParent()
  disposeObject3D(prop)
}
