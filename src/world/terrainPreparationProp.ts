import * as THREE from 'three'

/**
 * Procedural marker for an active terrain-preparation work site (plan
 * `world-terrain-002` §8) — no GLB exists or is needed for this: a simple
 * wooden stake with a small cloth flag, same "no asset yet, plain procedural
 * shape" convention as `trapProp.ts`/`items/tentProp.ts`. Purely a runtime
 * "work in progress here" flag — never itself the authoritative preparation
 * state.
 */
const STAKE_COLOR = 0x6b4a2f
const FLAG_COLOR = 0xc9a13b

export function createTerrainPreparationMarker(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'terrain-preparation-marker'

  const stake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: STAKE_COLOR, flatShading: true, roughness: 0.9 }),
  )
  stake.position.y = 0.45
  stake.castShadow = true
  group.add(stake)

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.2),
    new THREE.MeshStandardMaterial({
      color: FLAG_COLOR,
      flatShading: true,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  )
  flag.position.set(0.17, 0.78, 0)
  flag.castShadow = true
  group.add(flag)

  return group
}
