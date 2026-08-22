import * as THREE from 'three'

/** Player-built garden plot — a small raised bed (wooden frame + tilled
 *  soil), no GLB planned (procedural only, same convention as
 *  `world/playerWellProp.ts`'s `pit`/`well` stages and `world/trapProp.ts`).
 *  Purely a placement/anchor prop (plan 174 §1) — crop visuals are separate
 *  `chunk-crops` meshes placed on top by the existing plan 126/172 planting
 *  flow, never owned by this prop. */
export function createGardenPlotProp(): THREE.Group {
  const group = new THREE.Group()

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5c4630, flatShading: true, roughness: 1 })
  const halfSize = 0.9
  const frameHeight = 0.16
  const frameThickness = 0.12

  const edgeGeometry = new THREE.BoxGeometry(halfSize * 2, frameHeight, frameThickness)
  const edgeOffsets: [number, number, number][] = [
    [0, frameHeight / 2, halfSize - frameThickness / 2],
    [0, frameHeight / 2, -(halfSize - frameThickness / 2)],
  ]
  for (const [x, y, z] of edgeOffsets) {
    const edge = new THREE.Mesh(edgeGeometry, frameMat)
    edge.position.set(x, y, z)
    edge.castShadow = true
    edge.receiveShadow = true
    group.add(edge)
  }
  const sideGeometry = new THREE.BoxGeometry(frameThickness, frameHeight, halfSize * 2)
  const sideOffsets: [number, number, number][] = [
    [halfSize - frameThickness / 2, frameHeight / 2, 0],
    [-(halfSize - frameThickness / 2), frameHeight / 2, 0],
  ]
  for (const [x, y, z] of sideOffsets) {
    const side = new THREE.Mesh(sideGeometry, frameMat)
    side.position.set(x, y, z)
    side.castShadow = true
    side.receiveShadow = true
    group.add(side)
  }

  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(halfSize * 2 - frameThickness, 0.08, halfSize * 2 - frameThickness),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, flatShading: true, roughness: 1 }),
  )
  soil.position.y = frameHeight - 0.04
  soil.receiveShadow = true
  group.add(soil)

  return group
}
