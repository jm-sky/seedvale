import * as THREE from 'three'
import { disposeObject3D } from '../assets/loadGltf'

/** Simple procedural visuals for the two sleeping utilities (plan
 *  items-player-013) — same "no GLB, flat-shaded primitives" approach as
 *  `items/tentProp.ts`'s tent. V1 has exactly one bedroll variant (`leather`)
 *  so there is no per-variant branching yet. */

/** World-space bedroll mattress — shared by the procedural prop and the
 *  placement preview box (plan `ui-input-012`). */
export const BEDROLL_LENGTH = 1.9
export const BEDROLL_WIDTH = 0.7
const BEDROLL_HEIGHT = 0.12

export function createBedrollProp(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b4226, flatShading: true, roughness: 0.95 })
  const rollMat = new THREE.MeshStandardMaterial({ color: 0x8a5a34, flatShading: true, roughness: 0.9 })

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BEDROLL_WIDTH, BEDROLL_HEIGHT, BEDROLL_LENGTH),
    mat,
  )
  body.position.y = BEDROLL_HEIGHT * 0.5
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  for (const z of [-BEDROLL_LENGTH * 0.5, BEDROLL_LENGTH * 0.5]) {
    const roll = new THREE.Mesh(
      new THREE.CylinderGeometry(BEDROLL_WIDTH * 0.42, BEDROLL_WIDTH * 0.42, BEDROLL_WIDTH * 1.02, 8),
      rollMat,
    )
    roll.rotation.z = Math.PI / 2
    roll.position.set(0, BEDROLL_HEIGHT * 0.9, z)
    roll.castShadow = true
    group.add(roll)
  }

  return group
}

/** Source-mesh platform deck before `PLATFORM_VISUAL_SCALE` — preview uses
 *  the post-scale world size so the ghost matches the placed prop. */
export const PLATFORM_LENGTH = 2.4
export const PLATFORM_WIDTH = 1.6
export const PLATFORM_VISUAL_SCALE = 0.75
export const PLATFORM_FOOTPRINT_WIDTH = PLATFORM_WIDTH * PLATFORM_VISUAL_SCALE
export const PLATFORM_FOOTPRINT_LENGTH = PLATFORM_LENGTH * PLATFORM_VISUAL_SCALE
const PLATFORM_DECK_HEIGHT = 0.5
const PLATFORM_DECK_THICKNESS = 0.08

export function createPlatformProp(): THREE.Group {
  const group = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, flatShading: true, roughness: 1 })
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true, roughness: 1 })

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_WIDTH, PLATFORM_DECK_THICKNESS, PLATFORM_LENGTH),
    woodMat,
  )
  deck.position.y = PLATFORM_DECK_HEIGHT
  deck.castShadow = true
  deck.receiveShadow = true
  group.add(deck)

  const legHeight = PLATFORM_DECK_HEIGHT - PLATFORM_DECK_THICKNESS * 0.5
  const legRadius = 0.07
  for (const x of [-PLATFORM_WIDTH * 0.42, PLATFORM_WIDTH * 0.42]) {
    for (const z of [-PLATFORM_LENGTH * 0.42, PLATFORM_LENGTH * 0.42]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 6), legMat)
      leg.position.set(x, legHeight * 0.5, z)
      leg.castShadow = true
      group.add(leg)
    }
  }

  group.scale.setScalar(PLATFORM_VISUAL_SCALE)

  return group
}

export function disposeSleepingUtilityProp(prop: THREE.Object3D): void {
  prop.removeFromParent()
  disposeObject3D(prop)
}
