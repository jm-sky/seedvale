import * as THREE from 'three'
import { disposeObject3D } from '../assets/loadGltf'
import { ITEM_DEFS } from './items'

/** World-space A-frame tent for a placed `tent` item (plan 090).
 *  Long axis is Z so it matches the player spine after `lieDown()`. */
export const TENT_LENGTH = 2.2
export const TENT_WIDTH = 1.6
export const TENT_HEIGHT = 1.25
/** Clearance radius used by placement / packing probes. */
export const TENT_FOOTPRINT_RADIUS = 1.4

export function createPlacedTentProp(): THREE.Group {
  const group = new THREE.Group()
  const canvas = new THREE.MeshStandardMaterial({
    color: ITEM_DEFS.tent.color,
    flatShading: true,
    roughness: 0.92,
    side: THREE.DoubleSide,
  })
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true, roughness: 1 })

  const halfW = TENT_WIDTH * 0.5
  const halfL = TENT_LENGTH * 0.5
  const ridge = TENT_HEIGHT

  const left = new THREE.BufferGeometry()
  left.setAttribute('position', new THREE.Float32BufferAttribute([
    -halfW, 0.02, -halfL,
    0, ridge, -halfL,
    0, ridge, halfL,
    -halfW, 0.02, -halfL,
    0, ridge, halfL,
    -halfW, 0.02, halfL,
  ], 3))
  left.computeVertexNormals()
  const leftMesh = new THREE.Mesh(left, canvas)
  leftMesh.castShadow = true
  leftMesh.receiveShadow = true
  group.add(leftMesh)

  const right = new THREE.BufferGeometry()
  right.setAttribute('position', new THREE.Float32BufferAttribute([
    halfW, 0.02, -halfL,
    halfW, 0.02, halfL,
    0, ridge, halfL,
    halfW, 0.02, -halfL,
    0, ridge, halfL,
    0, ridge, -halfL,
  ], 3))
  right.computeVertexNormals()
  const rightMesh = new THREE.Mesh(right, canvas)
  rightMesh.castShadow = true
  rightMesh.receiveShadow = true
  group.add(rightMesh)

  const back = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      -halfW, 0.02, -halfL,
      halfW, 0.02, -halfL,
      0, ridge, -halfL,
    ], 3)),
    canvas,
  )
  ;(back.geometry as THREE.BufferGeometry).computeVertexNormals()
  back.castShadow = true
  group.add(back)

  for (const z of [-halfL + 0.08, halfL - 0.08]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, ridge, 5), poleMat)
    pole.position.set(0, ridge * 0.5, z)
    pole.castShadow = true
    group.add(pole)
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(TENT_WIDTH * 0.7, TENT_LENGTH * 0.75),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, flatShading: true, roughness: 1 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.03
  floor.receiveShadow = true
  group.add(floor)

  return group
}

export function disposePlacedTentProp(prop: THREE.Object3D): void {
  prop.removeFromParent()
  disposeObject3D(prop)
}
