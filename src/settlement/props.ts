import * as THREE from 'three'
import type { VillageSize } from './families'
import type { SettlementSite } from './findSettlementSite'
import type { ClearingLayout } from './villageClearing'
import { disposeObject3D, loadGltf, prepareProp } from '../assets/loadGltf'
import { distanceToSegment } from '../math/segment'
import { createSeededRandom } from '../world/parseSeed'

export type SettlementLandmarks = {
  well: THREE.Vector3
  stockpile: THREE.Vector3
  garden: THREE.Vector3
  homes: THREE.Vector3[]
  trees: THREE.Vector3[]
  /** Settlement's dock/pier, if it has one (near-coast settlements only) —
   *  see `settlement/minorLocations.ts`. */
  dock?: THREE.Vector3
  /** Waypoints from the settlement center to `dock` (inclusive), already
   *  height-sampled — empty when there's no dock. NPCs walk these in order
   *  instead of a straight line (`NpcAgent.ts`'s `followPath` phase). */
  dockRoute: THREE.Vector3[]
  /** The settlement's own lightable campfire (MD/LG only, see
   *  `buildSettlementProps`) — `flame` is the toggleable fire visual
   *  (`createCampfireFlame`), added as a child of the campfire prop but
   *  hidden until `settlement/VillageFire.ts` lights it. Distinct from the
   *  purely decorative world campfires in `terrain/chunkEnvironment.ts`. */
  campfire?: { position: THREE.Vector3, flame: THREE.Object3D }
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
  { url: '/models/nature/birch_1.glb', height: 4.4 },
  { url: '/models/nature/maple_1.glb', height: 4.8 },
  { url: '/models/nature/deadtree_1.glb', height: 3.6 },
] as const

export const BUSH_SPECS = [
  { url: '/models/nature/bush_a.glb', height: 1.4 },
  { url: '/models/nature/bush_b.glb', height: 1.8 },
  { url: '/models/nature/flower_clump_1.glb', height: 0.4 },
] as const

export const CACTUS_SPECS = [
  { url: '/models/nature/cactus_a.glb', height: 1.4 },
  { url: '/models/nature/cactus_b.glb', height: 2.0 },
] as const

export const REED_SPECS = [
  { url: '/models/nature/reed_a.glb', height: 1.1 },
] as const

export const DOCK_SPECS = [
  { url: '/models/settlement/dock_a.glb', height: 1.0 },
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

/** A short wooden pier — deck extends along local +X (rotate by the
 *  `MinorLocation.angle` to point out over the water). */
export function createDock(): THREE.Group {
  const dock = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, flatShading: true })

  const deckLength = 5
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckLength, 0.15, 1.4), woodMat)
  deck.position.set(deckLength / 2, 0.4, 0)
  deck.castShadow = true
  deck.receiveShadow = true
  dock.add(deck)

  const postPositions = [0.6, deckLength - 0.6]
  for (const px of postPositions) {
    for (const pz of [-0.55, 0.55]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6), woodMat)
      post.position.set(px, 0, pz)
      post.castShadow = true
      dock.add(post)
    }
  }

  return dock
}

/** A roadside signpost — post rises along Y, board's long axis (arrow-like)
 *  extends along local +X (rotate by the target road's direction angle, same
 *  convention as `createDock`). */
export function createSignpost(): THREE.Group {
  const signpost = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, flatShading: true })

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), woodMat)
  post.position.y = 1.1
  post.castShadow = true
  signpost.add(post)

  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.06), woodMat)
  board.position.set(0.55, 1.75, 0)
  board.castShadow = true
  signpost.add(board)

  return signpost
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

export function createCactus(scale = 1): THREE.Group {
  const cactus = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4d7a4a, flatShading: true })

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 1.6 * scale, 7), mat)
  trunk.position.y = 0.8 * scale
  trunk.castShadow = true
  cactus.add(trunk)

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.16 * scale, 0.7 * scale, 6), mat)
  arm.position.set(0.28 * scale, 1.05 * scale, 0)
  arm.rotation.z = -0.5
  arm.castShadow = true
  cactus.add(arm)

  return cactus
}

export function createReed(scale = 1): THREE.Group {
  const reed = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x6f8a4a, flatShading: true })
  for (let i = 0; i < 5; i++) {
    const height = (0.8 + Math.random() * 0.5) * scale
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035 * scale, height, 4), mat)
    blade.position.set((Math.random() - 0.5) * 0.3 * scale, height / 2, (Math.random() - 0.5) * 0.3 * scale)
    blade.castShadow = true
    reed.add(blade)
  }
  return reed
}

/** Irregular boulder — `IcosahedronGeometry` squashed/stretched per axis from
 *  `variant` (deterministic, no `Math.random()`: the caller already rolled a
 *  seeded `variant` in `chunkEnvironment.ts`, so re-rolling here would break
 *  the "same chunk reload = same world" guarantee). */
export function createLargeRock(scale = 1, variant = 0.5): THREE.Group {
  const rock = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9 * scale, 0),
    new THREE.MeshStandardMaterial({ color: 0x7d7a72, flatShading: true, roughness: 1 }),
  )
  mesh.scale.set(
    0.75 + variant * 0.6,
    0.55 + ((variant * 7) % 1) * 0.5,
    0.75 + ((variant * 13) % 1) * 0.6,
  )
  mesh.position.y = 0.35 * scale
  mesh.castShadow = true
  mesh.receiveShadow = true
  rock.add(mesh)
  return rock
}

/** Small cluster of pebbles (same geometry as the collectible `stone` item,
 *  `items.ts` — pure visual reuse) scattered deterministically from `variant`
 *  via trig offsets rather than `Math.random()`. */
export function createRockCluster(scale = 1, variant = 0.5): THREE.Group {
  const cluster = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, flatShading: true })
  const count = 3 + Math.floor(variant * 5) % 3
  for (let i = 0; i < count; i++) {
    const a = variant * Math.PI * 2 + i * 2.4
    const r = 0.15 + ((variant * (i + 3)) % 1) * 0.25
    const pebble = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.16 * scale * (0.7 + (i % 3) * 0.15), 0),
      mat,
    )
    pebble.position.set(Math.cos(a) * r, 0.08 * scale, Math.sin(a) * r)
    pebble.rotation.set(a, a * 1.3, 0)
    pebble.castShadow = true
    cluster.add(pebble)
  }
  return cluster
}

/** Fallen tree trunk lying on its side — `length` (world units) comes from
 *  `EnvironmentPlacement.variant`. Reuses `createTree`'s trunk color. */
export function createFallenLog(scale = 1, length = 2.4): THREE.Group {
  const log = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.26 * scale, length * scale, 7),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true }),
  )
  trunk.rotation.z = Math.PI / 2
  trunk.position.y = 0.22 * scale
  trunk.castShadow = true
  trunk.receiveShadow = true
  log.add(trunk)
  return log
}

/** Old campfire remains — stone ring + ash patch + a few branches. Purely
 *  decorative, not an `Interactable` (see plans/2026-08-07--030). */
export function createCampfire(scale = 1): THREE.Group {
  const fire = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6f6b63, flatShading: true })
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x2b2724, flatShading: true, roughness: 1 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, flatShading: true })

  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.55 * scale, 10), ashMat)
  ash.rotation.x = -Math.PI / 2
  ash.position.y = 0.02
  ash.receiveShadow = true
  fire.add(ash)

  const ringCount = 8
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 * scale, 0), stoneMat)
    stone.position.set(Math.cos(a) * 0.6 * scale, 0.08 * scale, Math.sin(a) * 0.6 * scale)
    stone.rotation.set(a, a * 0.7, 0)
    stone.castShadow = true
    fire.add(stone)
  }

  for (let i = 0; i < 3; i++) {
    const a = i * 2.1
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025 * scale, 0.03 * scale, 0.7 * scale, 5),
      woodMat,
    )
    branch.rotation.set(Math.PI / 2 - 0.25, 0, a)
    branch.position.y = 0.05 * scale
    branch.castShadow = true
    fire.add(branch)
  }

  return fire
}

/** The lightable/toggleable fire visual for a settlement's own campfire —
 *  separate from `createCampfire()`'s static stone-ring/ash/branches prop
 *  (which stays purely decorative for the world-scattered "old campfire"
 *  elements, `terrain/chunkEnvironment.ts`). A small emissive cone + a low-
 *  range point light, both flat/simple like the rest of this file's props —
 *  no particle system. Caller (`settlement/VillageFire.ts`) toggles
 *  `.visible` on the returned group; starts hidden. */
export function createCampfireFlame(scale = 1): THREE.Group {
  const flame = new THREE.Group()
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff9a3c,
    emissive: 0xff6a1a,
    emissiveIntensity: 1.4,
    flatShading: true,
  })
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28 * scale, 0.6 * scale, 6), flameMat)
  cone.position.y = 0.3 * scale
  flame.add(cone)

  const light = new THREE.PointLight(0xff8a3c, 3, 5 * scale, 2)
  light.position.y = 0.35 * scale
  flame.add(light)

  flame.visible = false
  return flame
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

/** Clearance (world units) a tree/bush must keep from a house↔core path —
 *  a bit past the path's own half-width (`worldConfig.ts`'s `pathHalfWidth`,
 *  ~1.5) so canopies don't visually hang over it either. */
const PATH_TREE_CLEARANCE = 2.5

/** Rejects candidates sitting on a clearing (well/stockpile/garden/hut pad)
 *  or on the walking path between a house and the core — the settlement's
 *  bespoke forest belt is independent of the per-chunk vegetation pipeline
 *  (`chunkVegetation.ts`, which already rejects on `roadTint`), so without
 *  this a "near" woodlot cluster (close to the village on purpose, for NPC
 *  wood-chopping) can easily land trees right on top of the new house↔core
 *  paths (`villageClearing.ts`). */
function blocksPathOrClearing(tx: number, tz: number, clearings: ClearingLayout): boolean {
  for (const area of [clearings.core, ...clearings.houses]) {
    if (Math.hypot(tx - area.x, tz - area.z) < area.radius + 1) return true
  }
  for (const house of clearings.houses) {
    if (distanceToSegment(tx, tz, clearings.core.x, clearings.core.z, house.x, house.z) < PATH_TREE_CLEARANCE) {
      return true
    }
  }
  return false
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
  clearings: ClearingLayout,
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
    if (blocksPathOrClearing(tx, tz, clearings)) continue

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

const CORE_PROP_SITE_ATTEMPTS = 5
const CORE_PROP_JITTER = 3.5
const CORE_PROP_WATER_MARGIN = 0.8

/** Same 4-direction flatness cross-probe as `findSettlementSite.ts`, applied to
 *  a prop's preferred offset from the village core — tries the exact offset
 *  first (attempt 0, jitter 0), then a few jittered candidates, picks the
 *  flattest dry one. Keeps props close to their intended relative layout via
 *  a drift penalty rather than wandering toward the single flattest spot in
 *  the whole clearing. */
function findFlatSpot(
  site: { x: number, z: number },
  dx: number,
  dz: number,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  random: () => number,
): { x: number, z: number } {
  let best = { x: site.x + dx, z: site.z + dz }
  let bestScore = -Infinity
  for (let attempt = 0; attempt < CORE_PROP_SITE_ATTEMPTS; attempt++) {
    const jx = attempt === 0 ? dx : dx + (random() * 2 - 1) * CORE_PROP_JITTER
    const jz = attempt === 0 ? dz : dz + (random() * 2 - 1) * CORE_PROP_JITTER
    const x = site.x + jx
    const z = site.z + jz
    const y = sampleHeight(x, z)
    if (y <= waterLevel + CORE_PROP_WATER_MARGIN) continue

    const step = 2.5
    const maxDelta = Math.max(
      Math.abs(sampleHeight(x + step, z) - y),
      Math.abs(sampleHeight(x - step, z) - y),
      Math.abs(sampleHeight(x, z + step) - y),
      Math.abs(sampleHeight(x, z - step) - y),
    )
    const driftPenalty = Math.hypot(jx - dx, jz - dz) * 0.3
    const score = 8 - maxDelta * 3 - driftPenalty
    if (score > bestScore) {
      bestScore = score
      best = { x, z }
    }
  }
  return best
}

export async function buildSettlementProps(
  site: SettlementSite,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  halfExtent: number,
  seed: number,
  /** Where houses/well/stockpile/garden actually sit — one clearing per
   *  family (its house) plus a shared core, see `villageClearing.ts`. Houses
   *  are no longer a fixed 3-offset layout: their count and position follow
   *  `clearings.houses` 1:1. */
  clearings: ClearingLayout,
  /** Bigger villages get a bit more shared infrastructure (draft: "większe
   *  wioski mogą otrzymać dodatkowe obiekty") — a second stockpile/campfire,
   *  not a structural change to the core clearing itself. */
  size: VillageSize,
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
    dockRoute: [],
  }

  const coreRandom = createSeededRandom(seed ^ 0x5a17e)

  const well = createWell()
  placeOnGround(well, site.x, site.z, sampleHeight)
  group.add(well)
  landmarks.well.set(site.x, sampleHeight(site.x, site.z), site.z)

  const { x: stockX, z: stockZ } = findFlatSpot(site, 4, 1.5, sampleHeight, waterLevel, coreRandom)
  const stockpile = await loadPropOrFallback(
    '/models/settlement/logs.glb',
    0.9,
    createStockpile,
  )
  placeOnGround(stockpile, stockX, stockZ, sampleHeight)
  group.add(stockpile)
  landmarks.stockpile.set(stockX, sampleHeight(stockX, stockZ), stockZ)

  const { x: gardenX, z: gardenZ } = findFlatSpot(site, -2.5, 5, sampleHeight, waterLevel, coreRandom)
  const garden = await loadPropOrFallback(
    '/models/settlement/garden.glb',
    1.2,
    createGarden,
  )
  placeOnGround(garden, gardenX, gardenZ, sampleHeight)
  group.add(garden)
  landmarks.garden.set(gardenX, sampleHeight(gardenX, gardenZ), gardenZ)

  for (let i = 0; i < clearings.houses.length; i++) {
    const area = clearings.houses[i]!
    const hut = await loadPropOrFallback(
      HUT_URLS[i % HUT_URLS.length]!,
      2.8,
      createHut,
    )
    placeOnGround(hut, area.x, area.z, sampleHeight)
    group.add(hut)
    landmarks.homes.push(new THREE.Vector3(area.x, sampleHeight(area.x, area.z), area.z))
  }

  if (size !== 'SM') {
    const { x: fireX, z: fireZ } = findFlatSpot(site, -4.5, -2, sampleHeight, waterLevel, coreRandom)
    const campfire = createCampfire()
    placeOnGround(campfire, fireX, fireZ, sampleHeight)
    group.add(campfire)

    const flame = createCampfireFlame()
    campfire.add(flame)
    landmarks.campfire = {
      position: new THREE.Vector3(fireX, sampleHeight(fireX, fireZ), fireZ),
      flame,
    }
  }
  if (size === 'LG') {
    const { x: stock2X, z: stock2Z } = findFlatSpot(site, 5.5, -2.5, sampleHeight, waterLevel, coreRandom)
    const stockpile2 = await loadPropOrFallback(
      '/models/settlement/logs.glb',
      0.9,
      createStockpile,
    )
    placeOnGround(stockpile2, stock2X, stock2Z, sampleHeight)
    group.add(stockpile2)
  }

  if (plantForest) {
    const random = createSeededRandom(seed ^ 0x7e3d)
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
        clearings,
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
        clearings,
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
        clearings,
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
        clearings,
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
