import * as THREE from 'three'
import { disposeObject3D } from '../assets/loadGltf'
import { PALISADE_HALF_LENGTH } from './palisade'

const POST_HEIGHT = 1.5
const POST_RADIUS_TOP = 0.05
const POST_RADIUS_BOTTOM = 0.07
const RAIL_HEIGHT = 0.14
const POST_SPACING = 0.55

/** No GLB planned for this plan — procedural only, same convention as
 *  `world/standingTorchProp.ts`'s fallback post. A row of sharpened posts
 *  joined by two horizontal rails along local +Z (matches `palisade.ts`'s
 *  `palisadeEndpoints` axis), so consecutive segments (`createPalisades.ts`)
 *  read as one continuous fence line once snapped end-to-end. Materials are
 *  created fresh per call (not module-shared) so `disposePalisadeSegmentProp`
 *  can freely dispose one segment's GPU resources without affecting any
 *  other live segment — same convention as `tentProp.ts`'s
 *  `createPlacedTentProp`. */
export function createPalisadeSegmentProp(): THREE.Group {
  const group = new THREE.Group()
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5a3f26, flatShading: true, roughness: 1 })
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true, roughness: 0.95 })

  const postCount = Math.max(2, Math.round((PALISADE_HALF_LENGTH * 2) / POST_SPACING) + 1)
  const span = PALISADE_HALF_LENGTH * 2
  for (let i = 0; i < postCount; i++) {
    const t = postCount === 1 ? 0 : i / (postCount - 1)
    const z = -PALISADE_HALF_LENGTH + t * span
    const post = new THREE.Mesh(new THREE.CylinderGeometry(POST_RADIUS_TOP, POST_RADIUS_BOTTOM, POST_HEIGHT, 6), postMat)
    post.position.set(0, POST_HEIGHT * 0.5, z)
    post.castShadow = true
    post.receiveShadow = true
    group.add(post)

    const tip = new THREE.Mesh(new THREE.ConeGeometry(POST_RADIUS_TOP, 0.14, 6), postMat)
    tip.position.set(0, POST_HEIGHT + 0.06, z)
    tip.castShadow = true
    group.add(tip)
  }

  for (const y of [POST_HEIGHT * 0.35, POST_HEIGHT * 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, RAIL_HEIGHT, span + 0.1), railMat)
    rail.position.set(0, y, 0)
    rail.castShadow = true
    rail.receiveShadow = true
    group.add(rail)
  }

  return group
}

export function disposePalisadeSegmentProp(prop: THREE.Object3D): void {
  prop.removeFromParent()
  disposeObject3D(prop)
}
