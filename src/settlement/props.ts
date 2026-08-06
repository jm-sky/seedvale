import * as THREE from 'three'
import type { SettlementSite } from './findSettlementSite'

export type SettlementLandmarks = {
  well: THREE.Vector3
  stockpile: THREE.Vector3
  homes: THREE.Vector3[]
  trees: THREE.Vector3[]
}

function placeOnGround(
  mesh: THREE.Object3D,
  x: number,
  z: number,
  sampleHeight: (x: number, z: number) => number,
  yOffset = 0,
): void {
  mesh.position.set(x, sampleHeight(x, z) + yOffset, z)
}

export function createHut(): THREE.Group {
  const hut = new THREE.Group()

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, flatShading: true }),
  )
  walls.position.y = 0.7
  walls.castShadow = true
  walls.receiveShadow = true
  hut.add(walls)

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 1.1, 4),
    new THREE.MeshStandardMaterial({ color: 0x6b3a2a, flatShading: true }),
  )
  roof.position.y = 1.85
  roof.rotation.y = Math.PI / 4
  roof.castShadow = true
  hut.add(roof)

  return hut
}

export function createWell(): THREE.Group {
  const well = new THREE.Group()
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.85, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0x7a7a72, flatShading: true }),
  )
  base.position.y = 0.35
  base.castShadow = true
  well.add(base)

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8),
    new THREE.MeshStandardMaterial({
      color: 0x3a7ca5,
      flatShading: true,
      roughness: 0.3,
    }),
  )
  water.position.y = 0.55
  well.add(water)
  return well
}

export function createStockpile(): THREE.Group {
  const pile = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    flatShading: true,
  })
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), mat)
    log.rotation.z = Math.PI / 2
    log.position.set(0, 0.15 + i * 0.12, (i - 2) * 0.15)
    log.castShadow = true
    pile.add(log)
  }
  return pile
}

export function createTree(): THREE.Group {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.25, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true }),
  )
  trunk.position.y = 0.8
  trunk.castShadow = true
  tree.add(trunk)

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 2.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f6b3a, flatShading: true }),
  )
  crown.position.y = 2.3
  crown.castShadow = true
  tree.add(crown)
  return tree
}

export function buildSettlementProps(
  site: SettlementSite,
  sampleHeight: (x: number, z: number) => number,
): { group: THREE.Group, landmarks: SettlementLandmarks } {
  const group = new THREE.Group()
  group.name = 'settlement'

  const landmarks: SettlementLandmarks = {
    well: new THREE.Vector3(),
    stockpile: new THREE.Vector3(),
    homes: [],
    trees: [],
  }

  const well = createWell()
  placeOnGround(well, site.x, site.z, sampleHeight)
  group.add(well)
  landmarks.well.set(site.x, sampleHeight(site.x, site.z), site.z)

  const stockX = site.x + 4
  const stockZ = site.z + 1.5
  const stockpile = createStockpile()
  placeOnGround(stockpile, stockX, stockZ, sampleHeight)
  group.add(stockpile)
  landmarks.stockpile.set(stockX, sampleHeight(stockX, stockZ), stockZ)

  const homeOffsets = [
    [-5, -2],
    [-4, 4],
    [5, -3],
  ] as const
  for (const [dx, dz] of homeOffsets) {
    const hx = site.x + dx
    const hz = site.z + dz
    const hut = createHut()
    placeOnGround(hut, hx, hz, sampleHeight)
    group.add(hut)
    landmarks.homes.push(new THREE.Vector3(hx, sampleHeight(hx, hz), hz))
  }

  const treeOffsets = [
    [8, 6],
    [10, 2],
    [7, -5],
    [-8, 7],
    [-9, -4],
    [3, 9],
  ] as const
  for (const [dx, dz] of treeOffsets) {
    const tx = site.x + dx
    const tz = site.z + dz
    const tree = createTree()
    placeOnGround(tree, tx, tz, sampleHeight)
    group.add(tree)
    landmarks.trees.push(new THREE.Vector3(tx, sampleHeight(tx, tz), tz))
  }

  return { group, landmarks }
}
