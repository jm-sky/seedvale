import * as THREE from 'three'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import type { SettlementSite } from './findSettlementSite'
import type { FoodSourceType } from './settlementGenerator'
import type { ClearingLayout } from './villageClearing'
import type { VillageLandmarkPlan, VillagePlan } from './villagePlan'
import { disposeObject3D, loadGltf, prepareProp, preparePropFitMax } from '../assets/loadGltf'
import { isDebugMode } from '../debug/debugMode'
import { distanceToSegment, projectOntoSegment } from '../math/segment'
import { createSparks, type Sparks } from '../shared/getFireParticles'
import { type CoastalSamplers, isCoastalPlacement } from '../terrain/coastPlacement'
import { patchProceduralFoliageMaterial } from '../world/foliageWind'
import { createSeededRandom } from '../world/parseSeed'
import { makeTreeId, rollLivingAge, rollSizeClass, type TreeLivingAge, type TreeSizeClass, visualScaleForTree } from '../world/treeLifecycle'
import { type VillageSize, villageSizeConfig } from './families'
import {
  gardenBedCount,
  gardenClearingRadius,
  type GardenScale,
} from './gardenScale'
import {
  HOUSE_FLOOR_LAMP_Y,
  HOUSE_LAMP_MAX_LOCAL_Y,
  type HouseCatalogEntry,
  type HouseLampMount,
  type HouseLampStyle,
  pickHomeHouse,
  resolveHouseHeight,
} from './houseCatalog'
import { yawToward } from './roadNetwork'
import { pathPlansToCorridorData } from './villagePlanner'

export type SettlementHouseLandmark = {
  position: THREE.Vector3
  houseId: string
  modelUrl: string | null
  label: string
  examine: string
  /** Local lamp mount used at build time (for debug gaze / catalog paste). */
  lampMount: HouseLampMount | null
  lampMountSource: string | null
}

export type SettlementLandmarks = {
  well: THREE.Vector3
  stockpile: THREE.Vector3
  garden: THREE.Vector3
  /** All garden pads (plan 077); `garden` mirrors the primary (index 0). */
  gardens: THREE.Vector3[]
  /** Trader's `workplace` (`places.ts`'s `workplaceFor`) — crate + barrel
   *  market stall, the one role in the workplace hybrid that gets a
   *  dedicated new prop instead of reusing an existing landmark (2026-08-09
   *  decision). Built unconditionally, like well/garden/stockpile, whether
   *  or not this settlement's families happen to roll a trader. */
  market: THREE.Vector3
  /** Foot positions for homes — same order as `houses` (compat for places/livestock). */
  homes: THREE.Vector3[]
  /** Per-house catalog identity for examine / debug (issue 018). */
  houses: SettlementHouseLandmark[]
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
  sizeClass: TreeSizeClass
  sizeJitter: number
  initialStage: TreeLivingAge
}

const WALL_URL = '/models/settlement/wall.glb'
const WALL_TARGET_HEIGHT = 1.85
/** Approximate world half-width of a wall segment after `prepareProp` height fit. */
const WALL_HALF_LENGTH = 2.2
/** Gate gap half-angle (radians) left open for the road/path. */
const PALISADE_GATE_HALF_ANGLE = 0.38
/** How many wall segments on each side of the gate (small villages stay modest). */
const PALISADE_SEGMENTS_PER_SIDE: Record<VillageSize, number> = {
  OUTPOST: 1,
  SM: 2,
  MD: 3,
  LG: 3,
  XL: 4,
}

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

/** Chunk-environment rocks / fallen logs (plan 065) — previously procedural-only. */
export const ROCK_SPECS = [
  { url: '/models/nature/rock_a.glb', height: 1.2 },
] as const

export const ROCK_CLUSTER_SPECS = [
  { url: '/models/nature/rock_cluster_a.glb', height: 0.9 },
] as const

export const FALLEN_LOG_SPECS = [
  { url: '/models/nature/fallen_log_a.glb', height: 0.55 },
] as const

/** Visible ore piles (`terrain/resourceDeposits.ts`, plan 065). */
export const RESOURCE_GOLD_SPECS = [
  { url: '/models/nature/resource_gold_1.glb', height: 1.1 },
] as const

export const RESOURCE_ROCK_SPECS = [
  { url: '/models/nature/resource_rock_1.glb', height: 1.1 },
] as const

/**
 * Recolor a cloned prop without mutating shared GLTF materials
 * (`loadGltf` marks cache materials `sharedGpu`). Clones each material,
 * clears the shared flag so `disposeObject3D` can free the tint instance,
 * then applies `hex`.
 */
export function tintPropMaterials(root: THREE.Object3D, hex: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const apply = (mat: THREE.Material): THREE.Material => {
      const next = mat.clone()
      next.userData = { ...next.userData, sharedGpu: false }
      const colored = next as THREE.Material & { color?: THREE.Color }
      if (colored.color) colored.color.setHex(hex)
      return next
    }
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(apply)
    } else {
      mesh.material = apply(mesh.material)
    }
  })
}

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

  // Wall band ~2m before `prepareProp` scales via house catalog height.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.0, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, flatShading: true }),
  )
  walls.position.y = 1.0
  walls.castShadow = true
  walls.receiveShadow = true
  hut.add(walls)

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.0, 1.3, 4),
    new THREE.MeshStandardMaterial({ color: 0x6b3a2a, flatShading: true }),
  )
  roof.position.y = 2.65
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

/** Fallback if `hay.glb` fails — small rectangular bale. */
export function createHayBale(scale = 1): THREE.Group {
  const hay = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9a84a, flatShading: true })
  const bale = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.4 * scale, 0.45 * scale), mat)
  bale.position.y = 0.2 * scale
  bale.castShadow = true
  hay.add(bale)
  return hay
}

/** Fallback if `pickaxe.glb` fails — decorative only (not an ItemKind yet). */
export function createPickaxeProp(): THREE.Group {
  const group = new THREE.Group()
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
  )
  handle.rotation.x = Math.PI / 2.2
  handle.position.set(0, 0.16, -0.04)
  handle.castShadow = true
  group.add(handle)
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x7a7e86, flatShading: true, metalness: 0.4 }),
  )
  head.position.set(0, 0.2, 0.18)
  head.castShadow = true
  group.add(head)
  return group
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
 *  since catalog hut variants (`houseCatalog.ts`) don't share the fallback
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
 *  the point, accurate enough for the roughly-boxy catalog hut shapes), and
 *  the lamp geometry is rotated to sit flush against it from any angle.
 *
 *  Wall fixtures are half the reference lantern size; floor-center keeps full
 *  size. Cap (daszek) and base (podstawka) share the body's XZ center and sit
 *  flush above/below it. */
export function createHouseLight(
  mountHeight: number,
  mountX: number,
  mountZ: number,
  style: HouseLampStyle = 'wall',
): HouseLight {
  const group = new THREE.Group()
  const scale = style === 'wall' ? 0.5 : 1

  const outwardLen = Math.hypot(mountX, mountZ) || 1
  const nx = mountX / outwardLen
  const nz = mountZ / outwardLen
  const yaw = Math.atan2(nx, nz)

  // Reference lantern (scale=1); wall uses 50%.
  const bodyW = 0.12 * scale
  const bodyH = 0.16 * scale
  const bodyD = 0.08 * scale
  const plateW = 0.14 * scale
  const plateH = 0.04 * scale
  const plateD = 0.14 * scale
  const stickOut = style === 'wall' ? 0.04 * scale : 0

  // One shared center for body + cap + base (fixes old offset where the glow
  // cube sat forward of the wood plates).
  const cx = mountX + nx * stickOut
  const cy = mountHeight
  const cz = mountZ + nz * stickOut
  const halfBody = bodyH * 0.5
  const halfPlate = plateH * 0.5

  const baseMat = new THREE.MeshBasicMaterial({ color: 0x6b4226 })
  const lampMat = new THREE.MeshBasicMaterial({ color: HOUSE_LAMP_OFF_COLOR })

  const top = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), baseMat)
  top.position.set(cx, cy + halfBody + halfPlate, cz)
  top.rotation.y = yaw
  group.add(top)

  const base = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), baseMat)
  base.position.set(cx, cy - halfBody - halfPlate, cz)
  base.rotation.y = yaw
  group.add(base)

  const lamp = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), lampMat)
  lamp.position.set(cx, cy, cz)
  lamp.rotation.y = yaw
  group.add(lamp)

  const light = new THREE.PointLight(0xffb35c, 0, 4.5 * scale, 2)
  light.position.set(cx - nx * 0.08 * scale, cy, cz - nz * 0.08 * scale)
  group.add(light)

  return {
    object: group,
    setNightIntensity(t) {
      const clamped = Math.max(0, Math.min(1, t))
      lampMat.color.lerpColors(HOUSE_LAMP_OFF_COLOR, HOUSE_LAMP_ON_COLOR, clamped)
      light.intensity = clamped * (style === 'wall' ? 0.85 : 1)
    },
  }
}

/** How far outside a hut's footprint to start each search ray — comfortably
 *  past any catalog/fallback hut's extent. */
const WALL_MOUNT_SEARCH_RADIUS = 20
/** Tried lowest-first within each catalog entry's `lightHeightFractions`. */
const DEFAULT_LIGHT_HEIGHT_FRACTIONS = [0.22, 0.3, 0.38] as const
const WALL_MOUNT_ANGLE_STEPS = 16

/** Finds a real point on a loaded hut's exterior surface to mount a wall
 *  lamp against. Replaces an earlier approach that placed the lamp at a
 *  fraction of the model's raw bounding-box Z extent — which assumed a
 *  symmetric, Z-facing box. Catalog entries supply height fractions so
 *  roof-heavy First Age huts don't mount lamps in the roof volume.
 *
 *  Searches outside-in from several heights and angles around the hut and
 *  returns the first real surface hit. `hut` must still be in its
 *  own post-`prepareProp` local frame (before `placeOnGround` moves it into
 *  world space). Returns `null` if no surface is found. */
/** Finds a wall-lamp mount in the hut's **local** frame (child of `hut`).
 *  Rays are cast in world space via `hut.matrixWorld`, then hits are converted
 *  with `worldToLocal` — required after `prepareProp` offsets the root.
 *  Rejects roof/underside normals and anything above the door-band cap. */
function findWallMount(
  hut: THREE.Object3D,
  hutHeight: number,
  heightFractions: readonly number[] = DEFAULT_LIGHT_HEIGHT_FRACTIONS,
  maxHeightFraction = 0.45,
): HouseLampMount | null {
  hut.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  raycaster.far = WALL_MOUNT_SEARCH_RADIUS * 2
  const originLocal = new THREE.Vector3()
  const origin = new THREE.Vector3()
  const dirLocal = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const worldNormal = new THREE.Vector3()
  const localHit = new THREE.Vector3()
  const maxY = Math.min(hutHeight * maxHeightFraction, HOUSE_LAMP_MAX_LOCAL_Y)

  for (const heightFraction of heightFractions) {
    const y = hutHeight * heightFraction
    if (y > maxY) continue
    for (let i = 0; i < WALL_MOUNT_ANGLE_STEPS; i++) {
      const angle = (i / WALL_MOUNT_ANGLE_STEPS) * Math.PI * 2
      const dx = Math.sin(angle)
      const dz = Math.cos(angle)
      originLocal.set(dx * WALL_MOUNT_SEARCH_RADIUS, y, dz * WALL_MOUNT_SEARCH_RADIUS)
      dirLocal.set(-dx, 0, -dz)
      origin.copy(originLocal).applyMatrix4(hut.matrixWorld)
      dir.copy(dirLocal).transformDirection(hut.matrixWorld).normalize()
      raycaster.set(origin, dir)
      const hit = raycaster.intersectObject(hut, true)[0]
      if (!hit?.face) continue
      worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize()
      if (Math.abs(worldNormal.y) > 0.45) continue
      if (worldNormal.dot(dir) > -0.15) continue
      localHit.copy(hit.point)
      hut.worldToLocal(localHit)
      if (localHit.y < 0.45 || localHit.y > maxY) continue
      return { x: localHit.x, y: localHit.y, z: localHit.z }
    }
  }
  return null
}

/** Provisional +Z wall face from bbox — always places a lamp so we can tune
 *  via console (`lampMount` paste into `houseCatalog`). */
function provisionalWallMount(hut: THREE.Object3D): HouseLampMount {
  hut.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(hut)
  const world = new THREE.Vector3(
    (box.min.x + box.max.x) * 0.5,
    Math.min(1.75, HOUSE_LAMP_MAX_LOCAL_Y),
    box.max.z - 0.08,
  )
  hut.worldToLocal(world)
  return {
    x: world.x,
    y: Math.max(0.5, Math.min(HOUSE_LAMP_MAX_LOCAL_Y, world.y)),
    z: world.z,
  }
}

export type ResolvedHouseLampMount = HouseLampMount & { source: string }

/** Catalog override → floor center → wall raycast → bbox provisional. */
export function resolveHouseLampMount(
  entry: HouseCatalogEntry,
  hut: THREE.Object3D,
  hutHeight: number,
): ResolvedHouseLampMount {
  if (entry.lampMount) {
    return { ...entry.lampMount, source: 'catalog' }
  }
  if (entry.lampStyle === 'floorCenter') {
    return { x: 0, y: HOUSE_FLOOR_LAMP_Y, z: 0, source: 'floorCenter' }
  }
  const wall = findWallMount(
    hut,
    hutHeight,
    entry.lightHeightFractions,
    entry.lightMaxHeightFraction,
  )
  if (wall) return { ...wall, source: 'raycast' }
  return { ...provisionalWallMount(hut), source: 'bboxProvisional' }
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
 *  extends along local +X. Use `yawToward(dx, dz)` for `rotation.y`. */
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

/** Village name plaque by the well — two posts + board; CSS2D text is added by the caller.
 *  Overall height ~4 m; board ~0.6 m (plan 076 + raise). */
export const VILLAGE_NAMEPOST_BOARD_CENTER_Y = 3.4

export function createVillageNamepost(): THREE.Group {
  const post = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4e32, flatShading: true })
  const poleHeight = 4.0
  const poleGap = 1.55
  const boardH = 0.6
  const boardW = 1.7
  for (const side of [-1, 1] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, poleHeight, 6), woodMat)
    pole.position.set(side * (poleGap * 0.5), poleHeight * 0.5, 0)
    pole.castShadow = true
    post.add(pole)
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.07), woodMat)
  board.position.set(0, VILLAGE_NAMEPOST_BOARD_CENTER_Y, 0)
  board.castShadow = true
  post.add(board)
  return post
}

/** Fallback palisade stake if `wall.glb` fails to load. */
function createPalisadeStake(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x5c4030, flatShading: true })
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.8, 5), mat)
  stake.position.y = 0.9
  stake.castShadow = true
  g.add(stake)
  return g
}

/**
 * Short palisade wings beside the main entrance — a gate gap, not a full ring.
 * Uses `wall.glb` (Quaternius Fantasy RTS) with procedural stake fallback.
 * Skips seaward / beach entrances so coastal villages don't wall off the ocean.
 * Also skips (or never opens onto) road/path corridors so stakes don't sit in
 * the dirt strip — the gate angle alone is not enough when the road bearing
 * differs from the entrance ray or a second corridor crosses the ring.
 */
async function plantEntrancePalisade(
  group: THREE.Group,
  site: SettlementSite,
  size: VillageSize,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  plan: VillagePlan | undefined,
  coast?: CoastalSamplers,
  corridors: readonly RoadCorridorSegment[] = [],
): Promise<void> {
  const segmentsPerSide = PALISADE_SEGMENTS_PER_SIDE[size]
  if (segmentsPerSide <= 0) return

  const coastEnv: CoastalSamplers = coast ?? { sampleHeight, waterLevel }
  const radius = plan?.boundary.radius ?? villageSizeConfig(size).footprintRadius * 0.72

  const entrances = plan?.entrances ?? []
  const inlandEntrances = entrances.filter((e) => !isCoastalPlacement(e.x, e.z, coastEnv))
  const entrance = inlandEntrances.find((e) => e.kind === 'road')
    ?? inlandEntrances[0]
  if (!entrance && entrances.length > 0) {
    // Every planned entrance is coastal — skip palisade rather than wall the sea.
    return
  }

  const outward = entrance
    ? Math.atan2(entrance.z - site.z, entrance.x - site.x)
    : 0

  // Also reject if the gate mid-point itself sits on beach (no plan entrances).
  const gateX = site.x + Math.cos(outward) * radius
  const gateZ = site.z + Math.sin(outward) * radius
  if (isCoastalPlacement(gateX, gateZ, coastEnv)) return

  // Widen the angular gate so a typical inter-settlement road (~roadHalfWidth 5)
  // plus a wall segment fits through even when the ray is slightly off.
  let maxCorridorHalf = 5
  for (const seg of corridors) {
    if (seg.halfWidth > maxCorridorHalf) maxCorridorHalf = seg.halfWidth
  }
  const gateHalf = Math.max(
    PALISADE_GATE_HALF_ANGLE,
    Math.atan2(maxCorridorHalf + WALL_HALF_LENGTH, Math.max(radius, 1)),
  )

  const wall = await loadPropOrFallback(WALL_URL, WALL_TARGET_HEIGHT, createPalisadeStake)
  const step = (WALL_HALF_LENGTH * 2) / radius

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < segmentsPerSide; i++) {
      const ang = outward + side * (gateHalf + step * (i + 0.5))
      const x = site.x + Math.cos(ang) * radius
      const z = site.z + Math.sin(ang) * radius
      if (isCoastalPlacement(x, z, coastEnv)) continue
      if (pointHitsCorridor(x, z, corridors, WALL_HALF_LENGTH + 0.4)) continue
      const segment = wall.clone(true)
      // Wall's long axis is local +X in the Quaternius asset — tangent to the ring.
      const tangent = ang + Math.PI / 2
      segment.rotation.y = yawToward(Math.cos(tangent), Math.sin(tangent))
      placeOnGround(segment, x, z, sampleHeight)
      group.add(segment)
    }
  }
}

/** True when `(x,z)` lies inside any corridor capsule (+ extra clearance). */
function pointHitsCorridor(
  x: number,
  z: number,
  corridors: readonly RoadCorridorSegment[],
  extraClearance: number,
): boolean {
  for (const seg of corridors) {
    const need = seg.halfWidth + extraClearance
    const { distSq } = projectOntoSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz)
    if (distSq < need * need) return true
  }
  return false
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
  patchProceduralFoliageMaterial(crown.material as THREE.MeshStandardMaterial)
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

/** Chop step 1 visual — tall trunk without crown (limbed / "dead" tree). */
export function createLimbedTree(scale = 1): THREE.Group {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 2.8 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true }),
  )
  trunk.position.y = 1.4 * scale
  trunk.castShadow = true
  tree.add(trunk)

  // A couple of short stub branches so it reads as "stripped", not a pole.
  const stubMat = new THREE.MeshStandardMaterial({ color: 0x3d2e22, flatShading: true })
  const stubA = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.45 * scale, 5), stubMat)
  stubA.position.set(0.28 * scale, 2.1 * scale, 0)
  stubA.rotation.z = -0.9
  stubA.castShadow = true
  tree.add(stubA)
  const stubB = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.045 * scale, 0.35 * scale, 5), stubMat)
  stubB.position.set(-0.22 * scale, 1.7 * scale, 0.1 * scale)
  stubB.rotation.z = 1.0
  stubB.castShadow = true
  tree.add(stubB)
  return tree
}

/**
 * Chop step 2 visual — low stump + fallen log beside it (same TreeId group).
 * `yaw` rotates the log offset so neighboring trees don't stack logs the same way.
 */
export function createFelledTree(scale = 1, yaw = 0): THREE.Group {
  const group = new THREE.Group()
  const stump = createTreeStump(scale)
  group.add(stump)

  const log = createFallenLog(scale, 2.6)
  const offset = 1.25 * scale
  log.position.set(Math.sin(yaw) * offset, 0, Math.cos(yaw) * offset)
  log.rotation.y = yaw + Math.PI / 2
  group.add(log)
  return group
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

/** Tight cluster of five small trees — visual for the prey `thicket`
 *  spawner (`createFauna.ts`). Origin at feet; footprint ~2.5 m at scale 1.
 *  `variant` (0..1) jitters tree scales/offsets so two thickets don't look
 *  identical. Reuses `createTree` so foliage wind matches other procedural
 *  crowns. */
export function createThicket(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  // Five trees packed close around the origin (~72° apart) — reads as a
  // dense little grove, not a few scattered trees.
  const placements: Array<{ angle: number, radius: number, size: number }> = [
    { angle: 0.15 + variant * 0.4, radius: 0.7, size: 0.68 },
    { angle: 1.4 + variant * 0.3, radius: 0.55, size: 0.5 },
    { angle: 2.65 + variant * 0.35, radius: 0.75, size: 0.6 },
    { angle: 3.9 + variant * 0.25, radius: 0.5, size: 0.48 },
    { angle: 5.15 + variant * 0.3, radius: 0.65, size: 0.58 },
  ]
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!
    const sizeJitter = 0.9 + ((variant * (i + 3)) % 1) * 0.25
    const tree = createTree(scale * p.size * sizeJitter)
    const r = p.radius * scale * (0.9 + ((variant * (i + 5)) % 1) * 0.2)
    tree.position.set(Math.sin(p.angle) * r, 0, Math.cos(p.angle) * r)
    tree.rotation.y = variant * 4.2 + i * 1.7
    group.add(tree)
  }
  return group
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
    // No shadow: a 3.5cm-radius blade contributes an imperceptible shadow at
    // the world's shadow-map resolution but still costs a draw call (perf
    // review A2 — "drobne propsy").
    blade.castShadow = false
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
    // No shadow: same reasoning as `createReed` (perf review A2).
    pebble.castShadow = false
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

/** Horseshoe of rocks framing a real terrain depression — visual for the prey
 *  `cave` spawner (`createFauna.ts`, plan 083). Origin at feet; footprint
 *  ~2–3 m at scale 1. `variant` (0..1) jitters rock sizes/angles so two caves
 *  don't look identical. Open side faces +Z (caller may rotate) — the caller
 *  carves the actual pit into the terrain (`ChunkManager.modifyTerrain`)
 *  centered on this same origin; this prop only supplies the rock framing
 *  and a small dark accent, not the hole itself. */
export function createCaveMouth(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7d7a72,
    flatShading: true,
    roughness: 1,
  })
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x1a1814,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  })

  // U-shaped rock ring: angles spanning the back and sides, leaving +Z open.
  const rockAngles = [-2.2, -1.4, -0.7, 0.7, 1.4, 2.2]
  for (let i = 0; i < rockAngles.length; i++) {
    const a = rockAngles[i]!
    const sizeJitter = 0.75 + ((variant * (i + 3)) % 1) * 0.55
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55 * scale * sizeJitter, 0),
      rockMat,
    )
    const r = (1.05 + ((variant * (i + 5)) % 1) * 0.25) * scale
    rock.position.set(Math.sin(a) * r, 0.4 * scale * sizeJitter, Math.cos(a) * r * 0.55)
    rock.scale.set(
      0.85 + ((variant * (i + 2)) % 1) * 0.4,
      0.9 + ((variant * (i + 7)) % 1) * 0.5,
      0.85 + ((variant * (i + 11)) % 1) * 0.4,
    )
    rock.rotation.set(a * 0.3, a, variant * 1.7)
    rock.castShadow = true
    rock.receiveShadow = true
    group.add(rock)
  }

  // The opening itself is a real depression carved into the terrain by the
  // caller (`ChunkManager.modifyTerrain`, see `fauna/createFauna.ts`, plan
  // 083) — this prop no longer fakes it with a flat standing disc. A small
  // dark pool low at the back (away from the +Z open side, where the rock
  // ring is densest) hints the ground goes dark/deeper without reading as a
  // floating cap over the opening.
  const shadowPool = new THREE.Mesh(
    new THREE.CircleGeometry(0.5 * scale, 8),
    mouthMat,
  )
  shadowPool.rotation.x = -Math.PI / 2
  shadowPool.position.set(0, -0.35 * scale, -0.35 * scale)
  group.add(shadowPool)

  // Low threshold stone at the pit's open (+Z) lip, marking where natural
  // ground gives way to the carved depression.
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(1.4 * scale, 0.12 * scale, 0.5 * scale),
    rockMat,
  )
  sill.position.set(0, 0.02 * scale, 0.65 * scale)
  sill.receiveShadow = true
  group.add(sill)

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

/** Procedural garden beds — S = one bed (legacy), M/L = side-by-side beds (plan 077). */
export function createGarden(scale: GardenScale = 'S'): THREE.Group {
  const garden = new THREE.Group()
  const beds = gardenBedCount(scale)
  const bedW = 2.4
  const bedD = 1.6
  const gap = 0.35
  const totalW = beds * bedW + (beds - 1) * gap
  const startX = -totalW * 0.5 + bedW * 0.5

  const bedMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, flatShading: true })
  const cropMat = new THREE.MeshStandardMaterial({
    color: 0x6db33f,
    flatShading: true,
  })

  for (let b = 0; b < beds; b++) {
    const bx = startX + b * (bedW + gap)
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bedW, 0.2, bedD), bedMat)
    bed.position.set(bx, 0.1, 0)
    bed.receiveShadow = true
    garden.add(bed)

    for (let i = 0; i < 6; i++) {
      const crop = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 4), cropMat)
      crop.position.set(bx - 0.8 + (i % 3) * 0.8, 0.4, i < 3 ? -0.35 : 0.35)
      crop.castShadow = true
      garden.add(crop)
    }
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

/** Like `cloneProp`, but yaw comes from the caller (seeded / placement) —
 *  avoids `Math.random()` so chunk reload and ore piles stay deterministic. */
export function clonePropWithYaw(
  templates: THREE.Object3D[],
  index: number,
  scale: number,
  rotationY: number,
): THREE.Object3D {
  const src = templates[index % templates.length]!
  const prop = src.clone(true)
  prop.scale.multiplyScalar(scale)
  prop.rotation.y = rotationY
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
const ROAD_TREE_CLEARANCE = 1.25

/** Local VillagePlan path polylines as corridor segments for prop rejection. */
function localPathCorridors(
  plan: VillagePlan | undefined,
  sampleHeight: (x: number, z: number) => number,
): RoadCorridorSegment[] {
  if (!plan) return []
  return pathPlansToCorridorData(plan.paths, sampleHeight).map((seg) => ({
    ax: seg.ax,
    az: seg.az,
    ah: seg.ah,
    bx: seg.bx,
    bz: seg.bz,
    bh: seg.bh,
    halfWidth: seg.halfWidth,
    heightStrength: 0,
    tintStrength: 0,
  }))
}

/** Push a point outside corridor capsules (plaza paths / roads). */
function pushOffCorridors(
  x: number,
  z: number,
  corridors: readonly RoadCorridorSegment[],
  extraClearance: number,
): { x: number, z: number } {
  let px = x
  let pz = z
  for (let iter = 0; iter < 5; iter++) {
    let moved = false
    for (const seg of corridors) {
      const need = seg.halfWidth + extraClearance
      const { distSq, t } = projectOntoSegment(px, pz, seg.ax, seg.az, seg.bx, seg.bz)
      const dist = Math.sqrt(distSq)
      if (dist >= need) continue
      const cx = seg.ax + (seg.bx - seg.ax) * t
      const cz = seg.az + (seg.bz - seg.az) * t
      let dx = px - cx
      let dz = pz - cz
      const len = Math.hypot(dx, dz)
      if (len < 1e-4) {
        const sx = seg.bx - seg.ax
        const sz = seg.bz - seg.az
        const sl = Math.hypot(sx, sz) || 1
        dx = -sz / sl
        dz = sx / sl
      } else {
        dx /= len
        dz /= len
      }
      px = cx + dx * need
      pz = cz + dz * need
      moved = true
    }
    if (!moved) break
  }
  return { x: px, z: pz }
}

/** Rejects candidates sitting on a clearing (well/stockpile/garden/hut pad),
 *  on house↔core links, within road/path corridors (inter-settlement + local
 *  VillagePlan paths), or inside the residential courtyard (plan 076). */
function blocksPathOrClearing(
  tx: number,
  tz: number,
  clearings: ClearingLayout,
  roadSegments: readonly RoadCorridorSegment[],
  courtyardRadius = 0,
): boolean {
  if (courtyardRadius > 0) {
    const dCore = Math.hypot(tx - clearings.core.x, tz - clearings.core.z)
    if (dCore < courtyardRadius) return true
  }
  for (const area of [clearings.core, ...clearings.houses, ...(clearings.gardens ?? [])]) {
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
  courtyardRadius = 0,
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
    if (blocksPathOrClearing(tx, tz, clearings, roadSegments, courtyardRadius)) continue

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
      const sizeClass = rollSizeClass(random())
      const sizeJitter = random()
      const initialStage = rollLivingAge({
        sizeClass,
        ageRoll: random(),
        oldRoll: random(),
        saplingChance: 0.12,
        youngChance: 0.13,
      })
      const speciesIndex = treeCounter.n % Math.max(1, treeTemplates.length)
      const tree = cloneProp(
        treeTemplates,
        treeCounter.n++,
        visualScaleForTree(speciesIndex, initialStage, sizeClass, sizeJitter),
      )
      placeOnGround(tree, tx, tz, sampleHeight)
      const id = makeTreeId(worldSeed, tx, tz, speciesIndex)
      tree.userData.treeId = id
      tree.userData.treeSizeClass = sizeClass
      tree.userData.treeSizeJitter = sizeJitter
      tree.userData.treeSpeciesIndex = speciesIndex
      tree.userData.treeInitialStage = initialStage
      group.add(tree)
      landmarks.trees.push({
        id,
        position: new THREE.Vector3(tx, y, tz),
        mesh: tree,
        speciesIndex,
        sizeClass,
        sizeJitter,
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


/** Prefer a planned landmark position; `findFlatSpot` only micro-corrects
 *  around that candidate (plan 047 §9.11) — it must not invent a new layout.
 *  Optional `avoid` keeps props (campfire) out of another landmark's disk. */
function placeFromLandmark(
  site: { x: number, z: number },
  landmark: VillageLandmarkPlan | undefined,
  fallbackDx: number,
  fallbackDz: number,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  random: () => number,
  avoid?: { x: number, z: number, minDist: number },
): { x: number, z: number } {
  const raw = landmark
    ? findFlatSpot(
        site,
        landmark.x - site.x,
        landmark.z - site.z,
        sampleHeight,
        waterLevel,
        random,
      )
    : findFlatSpot(site, fallbackDx, fallbackDz, sampleHeight, waterLevel, random)
  if (!avoid) return raw
  return pushAwayFrom(raw.x, raw.z, avoid.x, avoid.z, avoid.minDist)
}

function pushAwayFrom(
  x: number,
  z: number,
  ox: number,
  oz: number,
  minDist: number,
): { x: number, z: number } {
  const dx = x - ox
  const dz = z - oz
  const d = Math.hypot(dx, dz)
  if (d >= minDist) return { x, z }
  if (d < 1e-4) {
    return { x: ox + minDist, z: oz }
  }
  const s = minDist / d
  return { x: ox + dx * s, z: oz + dz * s }
}

/** Pull a point onto/inside a disk (campfire stays on plaza dirt after jitter). */
function pullIntoDisk(
  x: number,
  z: number,
  cx: number,
  cz: number,
  maxRadius: number,
): { x: number, z: number } {
  const dx = x - cx
  const dz = z - cz
  const d = Math.hypot(dx, dz)
  if (d <= maxRadius || d < 1e-4) return { x, z }
  const s = maxRadius / d
  return { x: cx + dx * s, z: cz + dz * s }
}

function landmarkOf(plan: VillagePlan | undefined, kind: VillageLandmarkPlan['kind'], index = 0) {
  return plan?.landmarks.find((l) => l.kind === kind && l.index === index)
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
  /** Authoritative layout (plan 047). When present, prop positions come from
   *  planned landmarks; `findFlatSpot` only corrects locally. */
  plan?: VillagePlan,
  /** Optional coast samplers — skips palisade on beach / seaward entrances. */
  coast?: CoastalSamplers,
): Promise<{ group: THREE.Group, landmarks: SettlementLandmarks, houseLights: HouseLight[] }> {
  const group = new THREE.Group()
  group.name = 'settlement'

  const landmarks: SettlementLandmarks = {
    well: new THREE.Vector3(),
    stockpile: new THREE.Vector3(),
    garden: new THREE.Vector3(),
    gardens: [],
    market: new THREE.Vector3(),
    homes: [],
    houses: [],
    trees: [],
    dockRoute: [],
  }

  const coreRandom = createSeededRandom(seed ^ 0x5a17e)
  const pathCorridors: RoadCorridorSegment[] = [
    ...roadSegments,
    ...localPathCorridors(plan, sampleHeight),
  ]

  const wellLm = landmarkOf(plan, 'well')
  const wellX = wellLm?.x ?? site.x
  const wellZ = wellLm?.z ?? site.z
  const well = createWell()
  placeOnGround(well, wellX, wellZ, sampleHeight)
  group.add(well)
  landmarks.well.set(wellX, sampleHeight(wellX, wellZ), wellZ)

  const { x: stockX, z: stockZ } = placeFromLandmark(
    site, landmarkOf(plan, 'stockpile', 0), 4, 1.5, sampleHeight, waterLevel, coreRandom,
  )
  const stockpile = await loadPropOrFallback(
    '/models/settlement/logs.glb',
    0.9,
    createStockpile,
  )
  placeOnGround(stockpile, stockX, stockZ, sampleHeight)
  group.add(stockpile)
  landmarks.stockpile.set(stockX, sampleHeight(stockX, stockZ), stockZ)

  const gardenLms = (plan?.landmarks.filter((l) => l.kind === 'garden') ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
  const gardenPlazaClear = clearings.core.radius + 3
  const gardenCount = Math.max(1, gardenLms.length)
  for (let gi = 0; gi < gardenCount; gi++) {
    const lm = gardenLms[gi]
    const scale: GardenScale = lm?.gardenScale ?? 'S'
    const pathClear = 2.4 + gardenClearingRadius(scale) * 0.4
    let { x: gardenX, z: gardenZ } = placeFromLandmark(
      site,
      lm,
      -2.5 - gi * 2.2,
      5 + gi * 2.5,
      sampleHeight,
      waterLevel,
      coreRandom,
      { x: clearings.core.x, z: clearings.core.z, minDist: gardenPlazaClear },
    )
    for (let i = 0; i < 8; i++) {
      ;({ x: gardenX, z: gardenZ } = pushAwayFrom(
        gardenX,
        gardenZ,
        clearings.core.x,
        clearings.core.z,
        gardenPlazaClear,
      ))
      ;({ x: gardenX, z: gardenZ } = pushOffCorridors(gardenX, gardenZ, pathCorridors, pathClear))
    }
    // Prefer procedural multi-bed for M/L; S may use GLB with procedural fallback.
    const garden =
      scale === 'S'
        ? await loadPropOrFallback('/models/settlement/garden.glb', 1.2, () => createGarden('S'))
        : createGarden(scale)
    placeOnGround(garden, gardenX, gardenZ, sampleHeight)
    garden.name = `garden:${scale}`
    group.add(garden)
    const foot = new THREE.Vector3(gardenX, sampleHeight(gardenX, gardenZ), gardenZ)
    landmarks.gardens.push(foot)
  }
  if (landmarks.gardens[0]) {
    landmarks.garden.copy(landmarks.gardens[0])
  }

  if (foodSourceType === 'field') {
    const { x: wheatX, z: wheatZ } = placeFromLandmark(
      site, landmarkOf(plan, 'field', 0), -2.5, 8.2, sampleHeight, waterLevel, coreRandom,
    )
    const wheat = createWheatField(0.9 + coreRandom() * 0.3, coreRandom())
    placeOnGround(wheat, wheatX, wheatZ, sampleHeight)
    group.add(wheat)
  }

  // Trader's market stall (`landmarks.market`, see `places.ts`'s `workplaceFor`)
  // — built unconditionally like well/garden/stockpile, whether or not this
  // settlement's families happen to roll a trader.
  const { x: marketX, z: marketZ } = placeFromLandmark(
    site, landmarkOf(plan, 'market', 0), 2, -5, sampleHeight, waterLevel, coreRandom,
  )
  const marketCrate = await loadPropOrFallback('/models/settlement/crate.glb', 0.6, () => createCrate(1))
  placeOnGround(marketCrate, marketX, marketZ, sampleHeight)
  group.add(marketCrate)
  const marketBarrel = await loadPropOrFallback('/models/settlement/barrel.glb', 0.65, () => createBarrel(1))
  placeOnGround(marketBarrel, marketX + 0.7, marketZ + 0.3, sampleHeight)
  group.add(marketBarrel)
  landmarks.market.set(marketX, sampleHeight(marketX, marketZ), marketZ)

  const houseLights: HouseLight[] = []
  const housePlots = (plan?.plots.filter((p) => p.role === 'house') ?? [])
    .slice()
    .sort((a, b) => (a.familyIndex ?? 0) - (b.familyIndex ?? 0))
  const houseRing = villageSizeConfig(size).houseRingMax * 0.85
  const houseYawRandom = createSeededRandom(seed ^ 0xa11ce)
  for (let i = 0; i < clearings.houses.length; i++) {
    const area = clearings.houses[i]!
    const entry = pickHomeHouse(size, i, seed)
    const targetHeight = resolveHouseHeight(entry)
    const hut = entry.url
      ? await loadPropOrFallback(entry.url, targetHeight, createHut)
      : (() => {
          const fallback = createHut()
          prepareProp(fallback, targetHeight)
          return fallback
        })()
    // Computed before `placeOnGround` moves `hut.position` to world
    // coordinates, so this is in the hut's own local frame — exactly what a
    // child (`houseLight.object`) needs to be positioned relative to.
    const hutBounds = new THREE.Box3().setFromObject(hut)
    const hutHeight = hutBounds.max.y - hutBounds.min.y
    const lampMount = resolveHouseLampMount(entry, hut, hutHeight)

    const plot = housePlots[i]
    const outward =
      plot?.rotation ??
      Math.atan2(area.z - clearings.core.z, area.x - clearings.core.x)
    // Face the plaza (inward); outskirts get a seeded yaw jitter (plan 076).
    let yaw = outward + Math.PI
    const dist = Math.hypot(area.x - clearings.core.x, area.z - clearings.core.z)
    if (dist > houseRing * 0.75) {
      yaw += (houseYawRandom() - 0.5) * Math.PI * 0.9
    }
    hut.rotation.y = yaw

    placeOnGround(hut, area.x, area.z, sampleHeight, entry.groundYOffset)
    hut.name = `house:${entry.id}`
    hut.userData.houseId = entry.id
    hut.userData.houseModelUrl = entry.url
    hut.userData.hasWalls = entry.hasWalls
    hut.userData.lampMount = { x: lampMount.x, y: lampMount.y, z: lampMount.z }
    hut.userData.lampMountSource = lampMount.source
    group.add(hut)

    const foot = new THREE.Vector3(
      area.x,
      sampleHeight(area.x, area.z) + entry.groundYOffset,
      area.z,
    )
    landmarks.homes.push(foot)
    landmarks.houses.push({
      position: foot.clone(),
      houseId: entry.id,
      modelUrl: entry.url,
      label: entry.label,
      examine: entry.examine,
      lampMount: { x: lampMount.x, y: lampMount.y, z: lampMount.z },
      lampMountSource: lampMount.source,
    })

    const houseLight = createHouseLight(lampMount.y, lampMount.x, lampMount.z, entry.lampStyle)
    hut.add(houseLight.object)
    houseLights.push(houseLight)

    if (isDebugMode()) {
      console.info('[house:lamp]', {
        id: entry.id,
        style: entry.lampStyle,
        source: lampMount.source,
        mount: { x: +lampMount.x.toFixed(3), y: +lampMount.y.toFixed(3), z: +lampMount.z.toFixed(3) },
        paste: `lampMount: { x: ${lampMount.x.toFixed(3)}, y: ${lampMount.y.toFixed(3)}, z: ${lampMount.z.toFixed(3)} }`,
      })
    }
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

  // Hay bales near garden pads + a decorative pickaxe by the stockpile (plan 082 B).
  const hayTemplates = await loadPropTemplates(
    [{ url: '/models/settlement/hay.glb', height: 0.55 }],
    () => createHayBale(),
  )
  const hayGardens = landmarks.gardens.length > 0 ? landmarks.gardens : [landmarks.garden]
  const hayCount = Math.min(2, Math.max(1, hayGardens.length))
  for (let i = 0; i < hayCount; i++) {
    const g = hayGardens[i % hayGardens.length]!
    const ang = coreRandom() * Math.PI * 2
    const dist = 1.6 + coreRandom() * 1.2
    const hay = cloneProp(hayTemplates, 0, 0.9 + coreRandom() * 0.25)
    hay.rotation.y = coreRandom() * Math.PI * 2
    placeOnGround(hay, g.x + Math.cos(ang) * dist, g.z + Math.sin(ang) * dist, sampleHeight)
    group.add(hay)
  }
  const pickaxe = await (async () => {
    try {
      const model = await loadGltf('/models/items/pickaxe.glb')
      // Authored long/flat — height-fit would make it several meters long.
      return preparePropFitMax(model, 0.9)
    } catch {
      return createPickaxeProp()
    }
  })()
  pickaxe.rotation.y = coreRandom() * Math.PI * 2
  placeOnGround(pickaxe, stockX - 1.2, stockZ + 0.9, sampleHeight)
  group.add(pickaxe)

  // Infrastructure counts come from centralized `VILLAGE_SIZE_CONFIG` (plan
  // 047) — OUTPOST/SM stay without a village campfire; MD+ get one; LG/XL
  // get a second stockpile. Do not re-encode size thresholds here.
  const infra = villageSizeConfig(size).infrastructure
  if (infra.campfires > 0) {
    const plazaPad = Math.max(2.5, clearings.core.radius - 1.2)
    let { x: fireX, z: fireZ } = placeFromLandmark(
      site,
      landmarkOf(plan, 'campfire', 0),
      -4.5,
      -2,
      sampleHeight,
      waterLevel,
      coreRandom,
      { x: wellX, z: wellZ, minDist: 5.5 },
    )
    // findFlatSpot jitter (±3.5) and well push can eject the fire onto grass
    // beside the square — snap back onto packed-dirt plaza.
    ;({ x: fireX, z: fireZ } = pullIntoDisk(
      fireX,
      fireZ,
      clearings.core.x,
      clearings.core.z,
      plazaPad,
    ))
    ;({ x: fireX, z: fireZ } = pushAwayFrom(fireX, fireZ, wellX, wellZ, 5.5))
    ;({ x: fireX, z: fireZ } = pullIntoDisk(
      fireX,
      fireZ,
      clearings.core.x,
      clearings.core.z,
      plazaPad,
    ))
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
  if (infra.stockpiles > 1) {
    const { x: stock2X, z: stock2Z } = placeFromLandmark(
      site, landmarkOf(plan, 'stockpile', 1), 5.5, -2.5, sampleHeight, waterLevel, coreRandom,
    )
    const stockpile2 = await loadPropOrFallback(
      '/models/settlement/logs.glb',
      0.9,
      createStockpile,
    )
    placeOnGround(stockpile2, stock2X, stock2Z, sampleHeight)
    group.add(stockpile2)
  }

  await plantEntrancePalisade(group, site, size, sampleHeight, waterLevel, plan, coast, pathCorridors)

  if (plantForest) {
    const random = createSeededRandom(seed ^ 0x7e3d)
    const treeTemplates = await loadPropTemplates(TREE_SPECS, () => createTree(1))
    const bushTemplates = await loadPropTemplates(BUSH_SPECS, () => createBush(1))
    const treeCounter = { n: 0 }
    const bushCounter = { n: 0 }
    // Inter-settlement roads + local VillagePlan paths — trees on the dirt strip
    // came from only checking house↔core chords + segmentsNear (no local paths).
    const treeCorridors = pathCorridors

    const sizeCfg = villageSizeConfig(size)
    const minHouseDist = clearings.houses.reduce(
      (min, h) => Math.min(min, Math.hypot(h.x - clearings.core.x, h.z - clearings.core.z)),
      Infinity,
    )
    const courtyardRadius = Math.max(
      clearings.core.radius * 1.6,
      Number.isFinite(minHouseDist) ? minHouseDist * 0.55 : clearings.core.radius * 1.6,
    )

    // Scale forests to map size (halfExtent), not fixed village yards.
    const midMin = halfExtent * 0.32
    const midMax = halfExtent * 0.55
    const farMin = halfExtent * 0.55
    const farMax = halfExtent * 0.88

    // Sparse plaza trees (0–3) between core and house ring — not a woodlot (plan 076).
    const plazaTreeCount = Math.floor(random() * 4)
    const plazaBandMin = clearings.core.radius + 2.5
    const plazaBandMax = Math.max(plazaBandMin + 2, courtyardRadius * 0.92)
    for (let i = 0; i < plazaTreeCount; i++) {
      const angle = random() * Math.PI * 2
      const dist = plazaBandMin + random() * Math.max(0.5, plazaBandMax - plazaBandMin)
      const tx = clearings.core.x + Math.cos(angle) * dist
      const tz = clearings.core.z + Math.sin(angle) * dist
      if (blocksPathOrClearing(tx, tz, clearings, treeCorridors, 0)) continue
      const y = sampleHeight(tx, tz)
      if (y <= waterLevel + 0.55) continue
      const sizeClass = rollSizeClass(random())
      const sizeJitter = random()
      const initialStage = rollLivingAge({
        sizeClass,
        ageRoll: random(),
        oldRoll: random(),
        saplingChance: 0.05,
        youngChance: 0.2,
      })
      const speciesIndex = treeCounter.n % Math.max(1, treeTemplates.length)
      const tree = cloneProp(
        treeTemplates,
        treeCounter.n++,
        visualScaleForTree(speciesIndex, initialStage, sizeClass, sizeJitter),
      )
      placeOnGround(tree, tx, tz, sampleHeight)
      const id = makeTreeId(seed, tx, tz, speciesIndex)
      tree.userData.treeId = id
      tree.userData.treeSizeClass = sizeClass
      tree.userData.treeSizeJitter = sizeJitter
      tree.userData.treeSpeciesIndex = speciesIndex
      tree.userData.treeInitialStage = initialStage
      group.add(tree)
      landmarks.trees.push({
        id,
        position: new THREE.Vector3(tx, y, tz),
        mesh: tree,
        speciesIndex,
        sizeClass,
        sizeJitter,
        initialStage,
      })
    }

    // NPC woodlots just outside the house ring — never inside the courtyard.
    const woodlotR = Math.max(sizeCfg.houseRingMax * 0.95, courtyardRadius + 6)
    const nearCenters: Array<[number, number]> = [
      [woodlotR * 0.85, woodlotR * 0.25],
      [-woodlotR * 0.8, woodlotR * 0.35],
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
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
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
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
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
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
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
        treeCorridors,
        random,
        treeCounter,
        bushCounter,
        seed,
        courtyardRadius,
      )
    }
  }

  return { group, landmarks, houseLights }
}

export function disposeSettlementGroup(group: THREE.Group): void {
  disposeObject3D(group)
}
