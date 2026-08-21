import * as THREE from 'three'
import type { WellStage } from './playerWell'
import { createWell } from '../settlement/settlementStructures'

/** Dug-earth hole — the `pit` stage. No GLB planned (docs/assets/MODELS.md
 *  M54); procedural only, same convention as `world/trapProp.ts`. */
function createWellPitProp(): THREE.Group {
  const group = new THREE.Group()
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, flatShading: true, roughness: 1 })
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.4, 10), dirtMat)
  hole.position.y = -0.18
  hole.receiveShadow = true
  group.add(hole)

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.12, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x5c4630, flatShading: true, roughness: 1 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.02
  rim.castShadow = true
  group.add(rim)

  return group
}

/** Stone ring + water, no roof/posts yet — the `well` stage, in-progress
 *  before the daszek. Reuses the same stone/rim geometry `createWell` builds
 *  its base from, just without the roofed superstructure. */
function createWellBodyProp(): THREE.Group {
  const group = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a72, flatShading: true, roughness: 0.95 })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.7, 10), stoneMat)
  base.position.y = 0.35
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.09, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x625f58, flatShading: true, roughness: 0.9 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.72
  rim.castShadow = true
  group.add(rim)

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a7ca5, flatShading: true, roughness: 0.3 }),
  )
  water.position.y = 0.55
  group.add(water)

  return group
}

/** One representation per stage (plan §8) — `roof` reuses the existing
 *  settlement `createWell()` procedural fallback directly rather than a
 *  parallel completed-well mesh; a finished player well should look like any
 *  other well. No render manager: the caller (`createPlayerWells.ts`) just
 *  swaps the whole prop on a stage change. */
export function createPlayerWellStageProp(stage: WellStage): THREE.Group {
  switch (stage) {
    case 'pit':
      return createWellPitProp()
    case 'roof':
      return createWell()
    case 'well':
      return createWellBodyProp()
  }
}
