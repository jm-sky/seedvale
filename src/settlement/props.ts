import * as THREE from 'three'
import type { SettlementSite } from './findSettlementSite'
import { disposeObject3D, loadGltf, prepareProp } from '../assets/loadGltf'

export type SettlementLandmarks = {
  well: THREE.Vector3
  stockpile: THREE.Vector3
  garden: THREE.Vector3
  homes: THREE.Vector3[]
  trees: THREE.Vector3[]
}

const HUT_URLS = [
  '/models/settlement/hut_a.glb',
  '/models/settlement/hut_b.glb',
  '/models/settlement/hut_c.glb',
] as const

export const TREE_SPECS = [
  { url: '/models/nature/tree_a.glb', height: 4.2 },
  { url: '/models/nature/tree_b.glb', height: 3.8 },
  { url: '/models/nature/tree_c.glb', height: 4.6 },
] as const

export const BUSH_SPECS = [
  { url: '/models/nature/bush_a.glb', height: 1.0 },
  { url: '/models/nature/bush_b.glb', height: 1.3 },
] as const

export function placeOnGround(
  mesh: THREE.Object3D,
  x: number,
  z: number,
  sampleHeight: (x: number, z: number) => number,
  yOffset = 0,
): void {
  // Preserve local offsets from prepareProp (foot / center).
  const ox = mesh.position.x
  const oy = mesh.position.y
  const oz = mesh.position.z
  mesh.position.set(
    x + ox,
    sampleHeight(x, z) + yOffset + oy,
    z + oz,
  )
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

export function createTree(scale = 1): THREE.Group {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 1.6 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true }),
  )
  trunk.position.y = 0.8 * scale
  trunk.castShadow = true
  tree.add(trunk)

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.1 * scale, 2.2 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f6b3a, flatShading: true }),
  )
  crown.position.y = 2.3 * scale
  crown.castShadow = true
  tree.add(crown)
  return tree
}

export function createBush(scale = 1): THREE.Group {
  const bush = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.55 * scale, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0x3d7a3a, flatShading: true }),
  )
  body.scale.y = 0.75
  body.position.y = 0.42 * scale
  body.castShadow = true
  bush.add(body)
  return bush
}

export function createGarden(): THREE.Group {
  const garden = new THREE.Group()
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.2, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x5a3d24, flatShading: true }),
  )
  bed.position.y = 0.1
  bed.receiveShadow = true
  garden.add(bed)

  const cropMat = new THREE.MeshStandardMaterial({
    color: 0x6db33f,
    flatShading: true,
  })
  for (let i = 0; i < 6; i++) {
    const crop = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 4), cropMat)
    crop.position.set(-0.8 + (i % 3) * 0.8, 0.4, i < 3 ? -0.35 : 0.35)
    crop.castShadow = true
    garden.add(crop)
  }
  return garden
}

async function loadPropOrFallback(
  url: string,
  targetHeight: number,
  fallback: () => THREE.Object3D,
): Promise<THREE.Object3D> {
  try {
    const model = await loadGltf(url)
    prepareProp(model, targetHeight)
    return model
  } catch (err) {
    console.warn(`[settlement] failed to load ${url}, using fallback`, err)
    return fallback()
  }
}

type ClusterSize = 'medium' | 'small'

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function loadPropTemplates(
  specs: ReadonlyArray<{ url: string, height: number }>,
  fallback: () => THREE.Object3D,
): Promise<THREE.Object3D[]> {
  return Promise.all(
    specs.map((spec) => loadPropOrFallback(spec.url, spec.height, fallback)),
  )
}

export function cloneProp(
  templates: THREE.Object3D[],
  index: number,
  scale: number,
): THREE.Object3D {
  const src = templates[index % templates.length]!
  const prop = src.clone(true)
  prop.scale.multiplyScalar(scale)
  prop.rotation.y = Math.random() * Math.PI * 2
  return prop
}

function plantTreeCluster(
  group: THREE.Group,
  landmarks: SettlementLandmarks,
  treeTemplates: THREE.Object3D[],
  bushTemplates: THREE.Object3D[],
  cx: number,
  cz: number,
  size: ClusterSize,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  halfExtent: number,
  random: () => number,
  treeCounter: { n: number },
  bushCounter: { n: number },
): void {
  const count =
    size === 'small' ? 4 + Math.floor(random() * 4) : 7 + Math.floor(random() * 6)
  const radius = size === 'small' ? 3.2 : 6.5
  const limit = halfExtent - 2

  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2
    const d = Math.sqrt(random()) * radius
    const tx = cx + Math.cos(a) * d
    const tz = cz + Math.sin(a) * d
    if (Math.abs(tx) > limit || Math.abs(tz) > limit) continue

    const y = sampleHeight(tx, tz)
    if (y <= waterLevel + 0.55) continue

    // Bushes cluster toward the cluster's outer rim; big trees dominate the core.
    const edgeFactor = d / radius
    const isBush = random() < 0.12 + edgeFactor * 0.45

    if (isBush) {
      const scale = 0.6 + random() * 0.5
      const bush = cloneProp(bushTemplates, bushCounter.n++, scale)
      placeOnGround(bush, tx, tz, sampleHeight)
      group.add(bush)
    } else {
      const scale = 0.7 + random() * 0.6
      const tree = cloneProp(treeTemplates, treeCounter.n++, scale)
      placeOnGround(tree, tx, tz, sampleHeight)
      group.add(tree)
      landmarks.trees.push(new THREE.Vector3(tx, y, tz))
    }
  }
}

export async function buildSettlementProps(
  site: SettlementSite,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  halfExtent: number,
  seed: number,
  /** Non-home settlements skip the forest belt: it's expensive (dozens of
   *  clusters) and would double up with the per-chunk terrain vegetation that,
   *  unlike home chunks, isn't suppressed around them. They still get their
   *  well/stockpile/garden/huts. */
  plantForest = true,
): Promise<{ group: THREE.Group, landmarks: SettlementLandmarks }> {
  const group = new THREE.Group()
  group.name = 'settlement'

  const landmarks: SettlementLandmarks = {
    well: new THREE.Vector3(),
    stockpile: new THREE.Vector3(),
    garden: new THREE.Vector3(),
    homes: [],
    trees: [],
  }

  const well = createWell()
  placeOnGround(well, site.x, site.z, sampleHeight)
  group.add(well)
  landmarks.well.set(site.x, sampleHeight(site.x, site.z), site.z)

  const stockX = site.x + 4
  const stockZ = site.z + 1.5
  const stockpile = await loadPropOrFallback(
    '/models/settlement/logs.glb',
    0.9,
    createStockpile,
  )
  placeOnGround(stockpile, stockX, stockZ, sampleHeight)
  group.add(stockpile)
  landmarks.stockpile.set(stockX, sampleHeight(stockX, stockZ), stockZ)

  const gardenX = site.x - 2.5
  const gardenZ = site.z + 5
  const garden = await loadPropOrFallback(
    '/models/settlement/garden.glb',
    1.2,
    createGarden,
  )
  placeOnGround(garden, gardenX, gardenZ, sampleHeight)
  group.add(garden)
  landmarks.garden.set(gardenX, sampleHeight(gardenX, gardenZ), gardenZ)

  const homeOffsets = [
    [-5, -2],
    [-4, 4],
    [5, -3],
  ] as const
  for (let i = 0; i < homeOffsets.length; i++) {
    const [dx, dz] = homeOffsets[i]!
    const hx = site.x + dx
    const hz = site.z + dz
    const hut = await loadPropOrFallback(
      HUT_URLS[i % HUT_URLS.length]!,
      2.8,
      createHut,
    )
    placeOnGround(hut, hx, hz, sampleHeight)
    group.add(hut)
    landmarks.homes.push(new THREE.Vector3(hx, sampleHeight(hx, hz), hz))
  }

  if (plantForest) {
    const random = mulberry(seed ^ 0x7e3d)
    const treeTemplates = await loadPropTemplates(TREE_SPECS, () => createTree(1))
    const bushTemplates = await loadPropTemplates(BUSH_SPECS, () => createBush(1))
    const treeCounter = { n: 0 }
    const bushCounter = { n: 0 }

    // Scale forests to map size (halfExtent), not fixed village yards.
    const nearR = Math.min(18, halfExtent * 0.22)
    const midMin = halfExtent * 0.32
    const midMax = halfExtent * 0.55
    const farMin = halfExtent * 0.55
    const farMax = halfExtent * 0.88

    // Only a couple of small woodlots by the village (NPC wood).
    const nearCenters: Array<[number, number]> = [
      [nearR * 0.7, nearR * 0.35],
      [-nearR * 0.75, nearR * 0.4],
    ]
    for (const [dx, dz] of nearCenters) {
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        site.x + dx,
        site.z + dz,
        'small',
        sampleHeight,
        waterLevel,
        halfExtent,
        random,
        treeCounter,
        bushCounter,
      )
    }

    // Mid forest belt — away from houses, still walkable from village.
    const midCount = 12 + Math.floor(random() * 5)
    for (let i = 0; i < midCount; i++) {
      const angle = (i / midCount) * Math.PI * 2 + (random() - 0.5) * 0.55
      const dist = midMin + random() * (midMax - midMin)
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        site.x + Math.cos(angle) * dist,
        site.z + Math.sin(angle) * dist,
        random() < 0.35 ? 'small' : 'medium',
        sampleHeight,
        waterLevel,
        halfExtent,
        random,
        treeCounter,
        bushCounter,
      )
    }

    // Far belt toward map edges.
    const farCount = 14 + Math.floor(random() * 6)
    for (let i = 0; i < farCount; i++) {
      const angle = random() * Math.PI * 2
      const dist = farMin + random() * (farMax - farMin)
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        site.x + Math.cos(angle) * dist,
        site.z + Math.sin(angle) * dist,
        random() < 0.3 ? 'small' : 'medium',
        sampleHeight,
        waterLevel,
        halfExtent,
        random,
        treeCounter,
        bushCounter,
      )
    }

    // Fill the rest of the map with scattered clumps (not centered on village).
    const fillCount = 10 + Math.floor(random() * 6)
    for (let i = 0; i < fillCount; i++) {
      const tx = (random() * 2 - 1) * (halfExtent * 0.9)
      const tz = (random() * 2 - 1) * (halfExtent * 0.9)
      // Keep a clear meadow around the settlement.
      if (Math.hypot(tx - site.x, tz - site.z) < midMin * 0.85) continue
      plantTreeCluster(
        group,
        landmarks,
        treeTemplates,
        bushTemplates,
        tx,
        tz,
        random() < 0.4 ? 'small' : 'medium',
        sampleHeight,
        waterLevel,
        halfExtent,
        random,
        treeCounter,
        bushCounter,
      )
    }
  }

  return { group, landmarks }
}

export function disposeSettlementGroup(group: THREE.Group): void {
  disposeObject3D(group)
}
