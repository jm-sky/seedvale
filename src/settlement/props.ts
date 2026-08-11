import * as THREE from 'three'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import type { VillageSize } from './families'
import type { SettlementSite } from './findSettlementSite'
import type { FoodSourceType } from './settlementGenerator'
import type { ClearingLayout } from './villageClearing'
import { disposeObject3D, loadGltf, prepareProp } from '../assets/loadGltf'
import { distanceToSegment } from '../math/segment'
import { createSparks, type Sparks } from '../shared/getFireParticles'
import { createSeededRandom } from '../world/parseSeed'
import { makeTreeId, type TreeGrowthStage, visualScale } from '../world/treeLifecycle'

export type SettlementLandmarks = {
  well: THREE.Vector3
  stockpile: THREE.Vector3
  garden: THREE.Vector3
  /** Trader's `workplace` (`places.ts`'s `workplaceFor`) — crate + barrel
   *  market stall, the one role in the workplace hybrid that gets a
   *  dedicated new prop instead of reusing an existing landmark (2026-08-09
   *  decision). Built unconditionally, like well/garden/stockpile, whether
   *  or not this settlement's families happen to roll a trader. */
  market: THREE.Vector3
  homes: THREE.Vector3[]
  /** Settlement forest trees — each carries a stable `TreeId` for lifecycle
   *  / NPC harvest (plan 058). `mesh` is the live prop for stump swaps. */
  trees: SettlementTreeLandmark[]
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
  campfire?: { position: THREE.Vector3, flame: CampfireFlame }
}

export type SettlementTreeLandmark = {
  id: string
  position: THREE.Vector3
  mesh: THREE.Object3D
  speciesIndex: number
  baseScale: number
  initialStage: 'sapling' | 'young' | 'mature'
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

/** Indices 2-4 (the flower entries) are also referenced by exact position from
 *  `terrain/chunkVegetation.ts`'s `FLOWER_BUSH_SPECIES_INDICES` for meadow
 *  patches — keep flowers grouped at the end if this list changes. */
export const BUSH_SPECS = [
  { url: '/models/nature/bush_a.glb', height: 1.4 },
  { url: '/models/nature/bush_b.glb', height: 1.8 },
  { url: '/models/nature/flower_clump_1.glb', height: 0.4 },
  { url: '/models/nature/flower_clump_2.glb', height: 0.4 },
  { url: '/models/nature/bush_flowers_1.glb', height: 0.6 },
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

/** Stone ring + roofed crossbeam + hanging bucket — more of a village
 *  landmark than the bare cylinder this replaces (plan 044 §1.3), still
 *  primitives-only (no GLB) since a well has no gameplay mechanic to justify
 *  sourcing/loading a dedicated model. */
export function createWell(): THREE.Group {
  const well = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a72, flatShading: true, roughness: 0.95 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c3a24, flatShading: true })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.7, 10), stoneMat)
  base.position.y = 0.35
  base.castShadow = true
  base.receiveShadow = true
  well.add(base)

  // A slightly darker capstone ring reads as dressed stone rather than a
  // single flat-shaded drum.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.09, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x625f58, flatShading: true, roughness: 0.9 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.72
  rim.castShadow = true
  well.add(rim)

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a7ca5, flatShading: true, roughness: 0.3 }),
  )
  water.position.y = 0.55
  well.add(water)

  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.6, 6)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, woodMat)
    post.position.set(0, 0.35 + 0.8, side * 0.65)
    post.castShadow = true
    well.add(post)
  }

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), woodMat)
  beam.rotation.z = Math.PI / 2
  beam.position.set(0, 1.55, 0)
  beam.castShadow = true
  well.add(beam)

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.6, 4), roofMat)
  roof.position.y = 2.0
  roof.rotation.y = Math.PI / 4
  roof.castShadow = true
  well.add(roof)

  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.22, 8),
    woodMat,
  )
  bucket.position.set(0, 1.1, 0)
  bucket.castShadow = true
  well.add(bucket)

  return well
}

/** Fallback if `barrel.glb`/`crate.glb` fail to load — plain flat-shaded
 *  cylinder with a couple of darker hoop rings. */
export function createBarrel(scale = 1): THREE.Group {
  const barrel = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, flatShading: true })
  const hoopMat = new THREE.MeshStandardMaterial({ color: 0x3d3630, flatShading: true })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.3 * scale, 0.65 * scale, 10), woodMat)
  body.position.y = 0.33 * scale
  body.castShadow = true
  barrel.add(body)

  for (const t of [0.14, 0.52]) {
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.32 * scale, 0.02 * scale, 5, 12),
      hoopMat,
    )
    hoop.rotation.x = Math.PI / 2
    hoop.position.y = t * scale
    barrel.add(hoop)
  }

  return barrel
}

const HOUSE_LAMP_OFF_COLOR = new THREE.Color(0x3a2c22)
const HOUSE_LAMP_ON_COLOR = new THREE.Color(0xffb35c)

/** Small lamp mounted on a house wall — a lantern-sized cube rather than a
 *  window-sized pane, toggled continuously via `setNightIntensity(t)`
 *  (0 = daylight, dark/unlit fixture; 1 = full night glow), see
 *  `settlement/createSettlement.ts`'s day/night wiring. `MeshBasicMaterial`
 *  (unlit) so it doesn't pick up ordinary scene shading and read as a plain
 *  lit card during the day — previously a `MeshStandardMaterial` plane, which
 *  stayed visibly bright under daylight even at `emissiveIntensity: 0` (see
 *  plan `2026-08-08--044` §1.1's "hanging square" report; the wall-mount fix
 *  there addressed positioning, not this). Kept as one cheap unlit cube + one
 *  short-falloff, unshadowed point light per house rather than anything more
 *  elaborate — a handful of these per loaded settlement is the same order of
 *  magnitude as the existing campfire flame light.
 *
 *  `mountHeight`/`mountZ` place the lamp against an actual wall — derived by
 *  the caller from the specific hut's own bounding box (`buildSettlementProps`),
 *  since the three GLB hut variants (`HUT_URLS`) don't share the fallback
 *  `createHut()` box's proportions. `mountZ` is pulled in slightly from the
 *  raw bounding-box edge since that edge is often the roof eave, not the
 *  wall face, on the GLB hut models. */
export type HouseLight = {
  readonly object: THREE.Object3D
  setNightIntensity: (t: number) => void
}

/** `createHouseLight`'s mount point is now a real point on the hut's exterior
 *  surface (`findWallMount` below), not an assumed Z-facing wall — `mountX`/
 *  `mountZ` place the lamp there, offset a little in/out along that surface's
 *  outward normal (approximated as the direction from the vertical axis to
 *  the point, accurate enough for the roughly-boxy `HUT_URLS` shapes), and
 *  the lamp geometry is rotated to sit flush against it from any angle. */
export function createHouseLight(mountHeight: number, mountX: number, mountZ: number): HouseLight {
  const group = new THREE.Group()

  const outwardLen = Math.hypot(mountX, mountZ) || 1
  const nx = mountX / outwardLen
  const nz = mountZ / outwardLen

  const baseMat = new THREE.MeshBasicMaterial({ color: 0x6b4226 })
  const lampMat = new THREE.MeshBasicMaterial({ color: HOUSE_LAMP_OFF_COLOR })

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.14), baseMat)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.14), baseMat)

  top.position.set(mountX, mountHeight + 0.08, mountZ)
  top.rotation.y = Math.atan2(nx, nz)
  group.add(top)

  base.position.set(mountX, mountHeight - 0.08, mountZ)
  base.rotation.y = Math.atan2(nx, nz)
  group.add(base)

  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), lampMat)

  lamp.position.set(mountX + nx * 0.04, mountHeight, mountZ + nz * 0.04)
  lamp.rotation.y = Math.atan2(nx, nz)
  group.add(lamp)

  const light = new THREE.PointLight(0xffb35c, 0, 4.5, 2)
  light.position.set(mountX - nx * 0.1, mountHeight, mountZ - nz * 0.1)
  group.add(light)

  const lightIntensityBonus = 0.0

  return {
    object: group,
    setNightIntensity(t) {
      const clamped = Math.max(0, Math.min(1, t))
      lampMat.color.lerpColors(HOUSE_LAMP_OFF_COLOR, HOUSE_LAMP_ON_COLOR, clamped)
      light.intensity = clamped * (1.0 + lightIntensityBonus)
    },
  }
}

/** How far outside a hut's footprint to start each search ray — comfortably
 *  past any `HUT_URLS`/fallback hut's extent. */
const WALL_MOUNT_SEARCH_RADIUS = 20
/** Tried lowest-first: real wall height varies a lot between the `HUT_URLS`
 *  GLB variants — one only has wall left at 25% of total height before the
 *  roof takes over, another still has wall at 45%. */
const WALL_MOUNT_HEIGHT_FRACTIONS = [0.25, 0.35, 0.45, 0.55] as const
const WALL_MOUNT_ANGLE_STEPS = 16

/** Finds a real point on a loaded hut's exterior surface to mount a wall
 *  lamp against. Replaces an earlier approach that placed the lamp at a
 *  fraction of the model's raw bounding-box Z extent — which assumed a
 *  symmetric, Z-facing box. The actual `HUT_URLS` GLB variants are neither
 *  (confirmed by raycasting each one — see history around plan
 *  `2026-08-08--044`'s "hanging square" and the report that followed even
 *  the wall-mount fix there): the lamp ended up floating in open air next to
 *  the house, sometimes a couple of meters off, because the wall it was
 *  "mounted" on wasn't necessarily there at that height/side for that
 *  particular hut model.
 *
 *  Searches outside-in from several heights and angles around the hut and
 *  returns the first real surface hit, so it adapts to whatever shape each
 *  model actually has instead of guessing one. `hut` must still be in its
 *  own post-`prepareProp` local frame (before `placeOnGround` moves it into
 *  world space) — same assumption the old bounding-box approach relied on.
 *  Returns `null` in the extremely unlikely case no surface is found at any
 *  tried height/angle (e.g. a hollow/open model) — callers fall back to the
 *  hut's center, which at least never floats away from it. */
function findWallMount(hut: THREE.Object3D, hutHeight: number): { height: number, x: number, z: number } | null {
  const raycaster = new THREE.Raycaster()
  raycaster.far = WALL_MOUNT_SEARCH_RADIUS * 2
  const origin = new THREE.Vector3()
  const dir = new THREE.Vector3()
  for (const heightFraction of WALL_MOUNT_HEIGHT_FRACTIONS) {
    const y = hutHeight * heightFraction
    for (let i = 0; i < WALL_MOUNT_ANGLE_STEPS; i++) {
      const angle = (i / WALL_MOUNT_ANGLE_STEPS) * Math.PI * 2
      const dx = Math.sin(angle)
      const dz = Math.cos(angle)
      origin.set(dx * WALL_MOUNT_SEARCH_RADIUS, y, dz * WALL_MOUNT_SEARCH_RADIUS)
      dir.set(-dx, 0, -dz)
      raycaster.set(origin, dir)
      const hit = raycaster.intersectObject(hut, true)[0]
      if (hit) return { height: y, x: hit.point.x, z: hit.point.z }
    }
  }
  return null
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

/** Fallback if `crate.glb` fails to load — plain flat-shaded box, same
 *  material family as `createBarrel`'s fallback. */
export function createCrate(scale = 1): THREE.Group {
  const crate = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, flatShading: true })
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, 0.6 * scale, 0.6 * scale), mat)
  box.position.y = 0.3 * scale
  box.castShadow = true
  crate.add(box)
  return crate
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

/** Visible harvest remainder (plan 058) — same TreeId as the living tree. */
export function createTreeStump(scale = 1): THREE.Group {
  const stump = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * scale, 0.26 * scale, 0.45 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true }),
  )
  trunk.position.y = 0.22 * scale
  trunk.castShadow = true
  stump.add(trunk)

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.22 * scale, 0.06 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b5340, flatShading: true }),
  )
  top.position.y = 0.48 * scale
  top.castShadow = true
  stump.add(top)
  return stump
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
 *  via trig offsets rather than `Math.random()`. `color` defaults to plain
 *  rock gray — overridden for ore piles (`terrain/resourceDeposits.ts`, e.g.
 *  rust for iron, near-black for coal, gold for a gold vein). */
export function createRockCluster(scale = 1, variant = 0.5, color = 0x8c8c8c): THREE.Group {
  const cluster = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true })
  // Wider spread than a fixed 3-5: `variant` (already a random 0..1 roll from
  // the caller) pushes some clusters up to 9 pebbles for visible size variety
  // between clusters, not just within one.
  const count = 3 + Math.floor(variant * 7)
  const spread = 0.7 + variant * 0.6
  for (let i = 0; i < count; i++) {
    const a = variant * Math.PI * 2 + i * 2.4
    const r = (0.15 + ((variant * (i + 3)) % 1) * 0.3) * spread
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

/** Single standing stone landmark (plans/2026-08-09--049, "częste" tier) —
 *  a tapered low-poly pillar with a slight lean plus a couple of grounding
 *  rubble pebbles at its base. `variant` (0..1) drives height, lean and
 *  rubble placement so no two monoliths look identical. */
export function createMonolith(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x726d64, flatShading: true, roughness: 1 })

  const height = (3 + variant * 2.4) * scale
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32 * scale, 0.5 * scale, height, 5),
    mat,
  )
  stone.rotation.y = variant * Math.PI * 2
  stone.rotation.z = (variant - 0.5) * 0.18 // slight deliberate lean
  stone.position.y = height / 2
  stone.castShadow = true
  stone.receiveShadow = true
  group.add(stone)

  const rubbleCount = 2 + Math.floor(variant * 3)
  for (let i = 0; i < rubbleCount; i++) {
    const a = variant * Math.PI * 2 + i * 2.3
    const r = 0.5 * scale + ((variant * (i + 4)) % 1) * 0.3 * scale
    const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 * scale, 0), mat)
    rubble.position.set(Math.cos(a) * r, 0.1 * scale, Math.sin(a) * r)
    rubble.rotation.set(a, a * 1.4, 0)
    rubble.castShadow = true
    group.add(rubble)
  }

  return group
}

/** Small stone circle landmark (plans/2026-08-09--049, "rzadkie" tier) — a
 *  ring of upright stones of uneven height, deterministically varied by
 *  `variant` (stone count 6-9, per-stone height jitter). Reads as a miniature
 *  Stonehenge from a distance without needing per-stone unique geometry. */
export function createStoneCircle(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x736e64, flatShading: true, roughness: 1 })

  const count = 6 + Math.floor(variant * 4)
  const radius = 2.6 * scale
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const h = (1.3 + ((variant * (i + 2)) % 1) * 0.9) * scale
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.3 * scale, h, 5),
      mat,
    )
    stone.position.set(Math.cos(a) * radius, h / 2, Math.sin(a) * radius)
    stone.rotation.y = a
    stone.castShadow = true
    stone.receiveShadow = true
    group.add(stone)
  }

  return group
}

/** Small ruined wall/foundation fragment (plans/2026-08-09--049, "rzadkie"
 *  tier) — a low foundation slab with two intersecting wall stubs of uneven,
 *  broken height, reading as the corner of a long-gone building rather than
 *  a random pile of boxes. `variant` (0..1) drives wall height/damage. */
export function createSmallRuins(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8478, flatShading: true, roughness: 1 })

  const size = 3.2 * scale
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(size, 0.15 * scale, size), mat)
  foundation.position.y = 0.075 * scale
  foundation.receiveShadow = true
  group.add(foundation)

  const wallHeight = (1.1 + variant * 0.7) * scale
  const wall1 = new THREE.Mesh(new THREE.BoxGeometry(size, wallHeight, 0.28 * scale), mat)
  wall1.position.set(0, wallHeight / 2, -size / 2 + 0.14 * scale)
  wall1.castShadow = true
  wall1.receiveShadow = true
  group.add(wall1)

  // Adjoining wall is more broken down — shorter, so the corner still reads
  // clearly as a ruin rather than an intact room.
  const wall2Height = wallHeight * (0.45 + variant * 0.35)
  const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, wall2Height, size), mat)
  wall2.position.set(-size / 2 + 0.14 * scale, wall2Height / 2, 0)
  wall2.castShadow = true
  wall2.receiveShadow = true
  group.add(wall2)

  const rubbleCount = 2 + Math.floor(variant * 3)
  for (let i = 0; i < rubbleCount; i++) {
    const a = variant * Math.PI * 2 + i * 1.9
    const r = size * 0.3 + ((variant * (i + 5)) % 1) * size * 0.25
    const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * scale, 0), mat)
    rubble.position.set(Math.cos(a) * r, 0.11 * scale, Math.sin(a) * r)
    rubble.rotation.set(a, a * 1.2, 0)
    rubble.castShadow = true
    group.add(rubble)
  }

  return group
}

/** A minimal "prosta ognisko" base — ash patch + a couple of branches, no
 *  stone ring (that's what distinguishes it from `createCampfire()`'s
 *  palenisko look, see `docs/plans/2026-08-09--050`). Used by
 *  `PlacedFires.ts` for the cheaper, shorter-burning `kind: 'simple'` fire. */
export function createSimpleFireBase(scale = 1): THREE.Group {
  const fire = new THREE.Group()
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x2b2724, flatShading: true, roughness: 1 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, flatShading: true })

  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.4 * scale, 10), ashMat)
  ash.rotation.x = -Math.PI / 2
  ash.position.y = 0.02
  ash.receiveShadow = true
  fire.add(ash)

  for (let i = 0; i < 2; i++) {
    const a = i * 2.4
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022 * scale, 0.028 * scale, 0.55 * scale, 5),
      woodMat,
    )
    branch.rotation.set(Math.PI / 2 - 0.25, 0, a)
    branch.position.y = 0.04 * scale
    branch.castShadow = true
    fire.add(branch)
  }

  return fire
}

/** How small a near-spent fire shrinks to and how large a freshly-stacked
 *  one grows to, relative to `setSize(1)`'s normal single-branch look — see
 *  `CampfireFlame.setSize`. */
const FLAME_MIN_SIZE = 0.55
const FLAME_MAX_SIZE = 1.8

/** The lightable/toggleable fire visual for a settlement's own campfire —
 *  separate from `createCampfire()`'s static stone-ring/ash/branches prop
 *  (which stays purely decorative for the world-scattered "old campfire"
 *  elements, `terrain/chunkEnvironment.ts`). `object` bundles a small
 *  emissive cone + a low-range point light + rising spark particles
 *  (`shared/getFireParticles.ts`); `update` must be called each frame (only
 *  while lit — see `settlement/VillageFire.ts`/`player/PlayerTorch.ts`) to
 *  animate the sparks. `setSize(factor)` scales the cone/light/sparks
 *  together (`factor` 1 = the normal single-branch look, clamped to
 *  `[FLAME_MIN_SIZE, FLAME_MAX_SIZE]`) and also scales the light's
 *  intensity/range, which a plain transform scale wouldn't touch — callers
 *  drive this from their current fuel level relative to one branch's worth
 *  (`VillageFire.ts`/`PlayerTorch.ts`), so the fire visibly grows when
 *  refueled and shrinks as it burns down. Caller toggles `.visible` on
 *  `object`; starts hidden. */
export type CampfireFlame = {
  object: THREE.Group
  update: (dt: number) => void
  setSize: (factor: number) => void
}

export function createCampfireFlame(scale = 1): CampfireFlame {
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

  const baseIntensity = 3
  const baseDistance = 5 * scale
  const light = new THREE.PointLight(0xff8a3c, baseIntensity, baseDistance, 2)
  light.position.y = 0.35 * scale
  flame.add(light)

  const sparks: Sparks = createSparks(scale)
  flame.add(sparks.points)

  flame.visible = false

  function setSize(factor: number) {
    const clamped = THREE.MathUtils.clamp(factor, FLAME_MIN_SIZE, FLAME_MAX_SIZE)
    flame.scale.setScalar(clamped)
    light.intensity = baseIntensity * clamped
    light.distance = baseDistance * clamped
  }
  setSize(1)

  return { object: flame, update: sparks.update, setSize }
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

/** Golden — distinctly different from `createGarden`'s green crop cones and
 *  from any grass tint (`grass.ts`'s `ARID_GRASS`/`HUMID_GRASS`/`SWAMP_GRASS`
 *  top out at an olive `0x9c9a54`), so a wheat field reads at a glance. */
const WHEAT_COLOR = 0xd8b23c

/** A small patch of thin, tall cone "stalks" — same silhouette idea as
 *  `createReed` (a clump of narrow cones) but denser, taller, and narrower
 *  per stalk, tinted gold instead of green, arranged as a filled disk instead
 *  of one small clump. Placed near a settlement's `garden` landmark when its
 *  `foodSourceType` is `'field'` (plan 032 §8) — deterministic from `variant`
 *  (trig/golden-angle spread, same reasoning as `createRockCluster`) so a
 *  reload doesn't reshuffle the field. */
export function createWheatField(scale = 1, variant = 0.5, radius = 3.2): THREE.Group {
  const field = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: WHEAT_COLOR, flatShading: true })
  const count = 45 + Math.floor(variant * 25)
  for (let i = 0; i < count; i++) {
    // Golden-angle-ish step so stalks fill the disk evenly instead of
    // spiraling into visible rings.
    const a = variant * Math.PI * 2 + i * 2.399963
    const r = radius * Math.sqrt((variant * (i + 11)) % 1)
    const height = (0.7 + ((variant * (i + 5)) % 1) * 0.3) * scale
    // Narrower than a normal grass/reed blade (0.022 vs createReed's 0.035) —
    // "węższa i wyższą" (narrower and taller), per the ask.
    const stalk = new THREE.Mesh(new THREE.ConeGeometry(0.022 * scale, height, 4), mat)
    stalk.position.set(Math.cos(a) * r, height / 2, Math.sin(a) * r)
    stalk.rotation.y = a
    stalk.castShadow = true
    field.add(stalk)
  }
  return field
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

/** Same idea as `PATH_TREE_CLEARANCE`, added on top of each road/path
 *  segment's own `halfWidth` (roads and dock/minor-location paths use
 *  different widths, `roadNetwork.ts`'s `roadHalfWidth`/`pathHalfWidth`) —
 *  one constant works for both since it's relative to the segment's actual
 *  width, not a fixed absolute clearance. */
const ROAD_TREE_CLEARANCE = 1

/** Rejects candidates sitting on a clearing (well/stockpile/garden/hut pad),
 *  on the walking path between a house and the core, or within an
 *  out-of-settlement road/path corridor (`roadSegments` — inter-settlement
 *  roads and settlement↔minor-location paths, `roadNetwork.ts`'s
 *  `segmentsNear`, resolved by `createSettlement.ts` before calling
 *  `buildSettlementProps`). The settlement's bespoke forest belt is
 *  otherwise independent of the per-chunk vegetation pipeline
 *  (`chunkVegetation.ts`, which already rejects on `roadTint`) — without
 *  this a "near" woodlot cluster (close to the village on purpose, for NPC
 *  wood-chopping) can land trees/bushes right on top of the road/paths
 *  (`villageClearing.ts`'s house↔core paths, or the road leaving the
 *  settlement toward a neighbor/dock). */
function blocksPathOrClearing(
  tx: number,
  tz: number,
  clearings: ClearingLayout,
  roadSegments: readonly RoadCorridorSegment[],
): boolean {
  for (const area of [clearings.core, ...clearings.houses]) {
    if (Math.hypot(tx - area.x, tz - area.z) < area.radius + 1) return true
  }
  for (const house of clearings.houses) {
    if (distanceToSegment(tx, tz, clearings.core.x, clearings.core.z, house.x, house.z) < PATH_TREE_CLEARANCE) {
      return true
    }
  }
  for (const seg of roadSegments) {
    if (distanceToSegment(tx, tz, seg.ax, seg.az, seg.bx, seg.bz) < seg.halfWidth + ROAD_TREE_CLEARANCE) {
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
  roadSegments: readonly RoadCorridorSegment[],
  random: () => number,
  treeCounter: { n: number },
  bushCounter: { n: number },
  worldSeed: number,
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
    if (blocksPathOrClearing(tx, tz, clearings, roadSegments)) continue

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
      const roll = random()
      const initialStage: Exclude<TreeGrowthStage, 'harvested'> =
        roll < 0.12 ? 'sapling' : roll < 0.25 ? 'young' : 'mature'
      const baseScale = 0.7 + random() * 0.6
      const speciesIndex = treeCounter.n % Math.max(1, treeTemplates.length)
      const tree = cloneProp(treeTemplates, treeCounter.n++, visualScale(baseScale, initialStage))
      placeOnGround(tree, tx, tz, sampleHeight)
      const id = makeTreeId(worldSeed, tx, tz, speciesIndex)
      tree.userData.treeId = id
      tree.userData.treeBaseScale = baseScale
      tree.userData.treeSpeciesIndex = speciesIndex
      tree.userData.treeInitialStage = initialStage
      group.add(tree)
      landmarks.trees.push({
        id,
        position: new THREE.Vector3(tx, y, tz),
        mesh: tree,
        speciesIndex,
        baseScale,
        initialStage,
      })
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
  /** `'field'` (plan 032 §8 — a significant nearby `fertile_soil` resource)
   *  gets a wheat patch next to the garden, on top of the garden prop itself
   *  (which stays for every settlement regardless — no new food-source
   *  geometry is swapped in yet, see the plan doc's "Poza zakresem"). Purely
   *  decorative, no `Interactable`, matching `createRockCluster`'s ore piles
   *  in `terrain/resourceDeposits.ts`. */
  foodSourceType: FoodSourceType = 'garden',
  /** Inter-settlement road segments + settlement↔minor-location paths near
   *  this settlement (`roadNetwork.ts`'s `segmentsNear`, resolved by
   *  `createSettlement.ts` only when `plantForest` is set) — kept out of the
   *  forest belt via `blocksPathOrClearing`, same as the house↔core paths. */
  roadSegments: readonly RoadCorridorSegment[] = [],
): Promise<{ group: THREE.Group, landmarks: SettlementLandmarks, houseLights: HouseLight[] }> {
  const group = new THREE.Group()
  group.name = 'settlement'

  const landmarks: SettlementLandmarks = {
    well: new THREE.Vector3(),
    stockpile: new THREE.Vector3(),
    garden: new THREE.Vector3(),
    market: new THREE.Vector3(),
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

  if (foodSourceType === 'field') {
    const { x: wheatX, z: wheatZ } = findFlatSpot(site, -2.5, 8.2, sampleHeight, waterLevel, coreRandom)
    const wheat = createWheatField(0.9 + coreRandom() * 0.3, coreRandom())
    placeOnGround(wheat, wheatX, wheatZ, sampleHeight)
    group.add(wheat)
  }

  // Trader's market stall (`landmarks.market`, see `places.ts`'s `workplaceFor`)
  // — built unconditionally like well/garden/stockpile, whether or not this
  // settlement's families happen to roll a trader.
  const { x: marketX, z: marketZ } = findFlatSpot(site, 2, -5, sampleHeight, waterLevel, coreRandom)
  const marketCrate = await loadPropOrFallback('/models/settlement/crate.glb', 0.6, () => createCrate(1))
  placeOnGround(marketCrate, marketX, marketZ, sampleHeight)
  group.add(marketCrate)
  const marketBarrel = await loadPropOrFallback('/models/settlement/barrel.glb', 0.65, () => createBarrel(1))
  placeOnGround(marketBarrel, marketX + 0.7, marketZ + 0.3, sampleHeight)
  group.add(marketBarrel)
  landmarks.market.set(marketX, sampleHeight(marketX, marketZ), marketZ)

  const houseLights: HouseLight[] = []
  for (let i = 0; i < clearings.houses.length; i++) {
    const area = clearings.houses[i]!
    const hut = await loadPropOrFallback(
      HUT_URLS[i % HUT_URLS.length]!,
      2.8,
      createHut,
    )
    // Computed before `placeOnGround` moves `hut.position` to world
    // coordinates, so this is in the hut's own local frame — exactly what a
    // child (`houseLight.object`) needs to be positioned relative to.
    const hutBounds = new THREE.Box3().setFromObject(hut)
    const hutHeight = hutBounds.max.y - hutBounds.min.y
    const wallMount = findWallMount(hut, hutHeight)
    placeOnGround(hut, area.x, area.z, sampleHeight)
    group.add(hut)
    landmarks.homes.push(new THREE.Vector3(area.x, sampleHeight(area.x, area.z), area.z))

    // Users manual testing:
    // - divide height by 2 places the lamp at 1/2 of house height
    // - multiply x and z by 0.0 places the lamp *usually* at the exact center of the house
    const displacementFactor = 0
    const houseLight = wallMount
      ? createHouseLight((wallMount.height / 2), wallMount.x * displacementFactor, wallMount.z * displacementFactor)
      : createHouseLight((hutHeight / 2) * 0.4, 0, hutBounds.max.z * displacementFactor)
    hut.add(houseLight.object)
    houseLights.push(houseLight)
  }

  // A couple of barrels by the stockpile — everyday clutter, purely
  // decorative (plan 044 §1.2).
  const barrelTemplates = await loadPropTemplates(
    [{ url: '/models/settlement/barrel.glb', height: 0.65 }],
    () => createBarrel(1),
  )
  const barrelSpots: Array<[number, number]> = [[1.1, -0.6], [1.6, 0.4]]
  for (const [dx, dz] of barrelSpots) {
    const barrel = cloneProp(barrelTemplates, 0, 0.85 + coreRandom() * 0.3)
    placeOnGround(barrel, stockX + dx, stockZ + dz, sampleHeight)
    group.add(barrel)
  }

  // `size !== 'SM'` would also be true for 'OUTPOST' (plan 032 §7) — a lone
  // resident's cabin doesn't get a village campfire, so this is explicit
  // about which two sizes actually qualify instead of just excluding SM.
  if (size === 'MD' || size === 'LG') {
    const { x: fireX, z: fireZ } = findFlatSpot(site, -4.5, -2, sampleHeight, waterLevel, coreRandom)
    const campfire = createCampfire()
    placeOnGround(campfire, fireX, fireZ, sampleHeight)
    group.add(campfire)

    const flame = createCampfireFlame()
    campfire.add(flame.object)
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
        roadSegments,
        random,
        treeCounter,
        bushCounter,
        seed,
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
        roadSegments,
        random,
        treeCounter,
        bushCounter,
        seed,
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
        roadSegments,
        random,
        treeCounter,
        bushCounter,
        seed,
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
        roadSegments,
        random,
        treeCounter,
        bushCounter,
        seed,
      )
    }
  }

  return { group, landmarks, houseLights }
}

export function disposeSettlementGroup(group: THREE.Group): void {
  disposeObject3D(group)
}
