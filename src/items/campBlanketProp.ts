import * as THREE from 'three'
import { disposeObject3D } from '../assets/loadGltf'
import { ITEM_DEFS } from './items'

/** Bedroll-sized ground mat for the camp-rest sequence (not the inventory
 *  pickup mesh — that stays the small `createItemMesh('blanket')` box).
 *  Long axis is Z so it matches the player spine after `lieDown()` tips the
 *  model −90° around X (body ends up along mesh-local Z, not X). */
export function createCampBlanketProp(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.08, 1.6),
    new THREE.MeshStandardMaterial({ color: ITEM_DEFS.blanket.color, flatShading: true }),
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function disposeCampBlanketProp(prop: THREE.Object3D): void {
  prop.removeFromParent()
  disposeObject3D(prop)
}
