import * as THREE from 'three'
import { discoverGlbAnchors, resolveAssetAnchors } from '../assets/anchorResolve'
import { anchorsForAsset } from '../assets/assetAnchorData'
import { mergeAnchorDefs } from '../assets/assetAnchors'
import { createTorchSparks } from '../shared/getFireParticles'
import {
  HOUSE_FLOOR_LAMP_Y,
  HOUSE_LAMP_MAX_LOCAL_Y,
  type HouseCatalogEntry,
  type HouseLampMount,
  type HouseLampStyle,
} from './houseCatalog'
import { LANTERN_FLOOR_MAX, LANTERN_WALL_MAX } from './propSpecs'

const HOUSE_LAMP_OFF_COLOR = new THREE.Color(0x3a2c22)
const HOUSE_LAMP_ON_COLOR = new THREE.Color(0xffb35c)
/** Original procedural box height (metres) used as the scale reference. */
const PROCEDURAL_LANTERN_REF_MAX = 0.16

/** House night lamp: GLB body (or procedural boxes) + one unshadowed PointLight.
 *  `setNightIntensity(t)` is 0 = daylight / unlit, 1 = full night glow. */
export type HouseLight = {
  readonly object: THREE.Object3D
  setNightIntensity: (t: number) => void
}

/** Night-auto village torch post (plaza / gate) — not player-fueled. */
export type VillageTorch = {
  readonly object: THREE.Object3D
  setLit: (lit: boolean) => void
  update: (dt: number) => void
}

type LampMountPose = {
  nx: number
  nz: number
  yaw: number
  cx: number
  cy: number
  cz: number
  visualSize: number
}

function lampVisualSize(style: HouseLampStyle): number {
  return style === 'wall' ? LANTERN_WALL_MAX : LANTERN_FLOOR_MAX
}

/** Outward normal from the hut origin through the mount, plus a small wall stick-out. */
function lampMountPose(
  mountX: number,
  mountZ: number,
  mountHeight: number,
  style: HouseLampStyle,
  explicitYaw?: number,
): LampMountPose {
  const visualSize = lampVisualSize(style)
  const outwardLen = Math.hypot(mountX, mountZ) || 1
  const nx = mountX / outwardLen
  const nz = mountZ / outwardLen
  const yaw = explicitYaw ?? Math.atan2(nx, nz)
  const stickOut = style === 'wall' ? visualSize * 0.18 : 0
  return {
    nx,
    nz,
    yaw,
    cx: mountX + nx * stickOut,
    cy: mountHeight,
    cz: mountZ + nz * stickOut,
    visualSize,
  }
}

function attachLanternGlb(
  group: THREE.Group,
  lanternBody: THREE.Object3D,
  pose: LampMountPose,
): void {
  const pivot = new THREE.Group()
  pivot.position.set(pose.cx, pose.cy, pose.cz)
  pivot.rotation.y = pose.yaw
  // Preserve `preparePropFitMax` translation (see `createHouseLight` WIP notes).
  pivot.add(lanternBody.clone(true))
  group.add(pivot)
}

/** Box lantern sized to the same longest-axis as `LANTERN_*_MAX` (GLB fit). */
function attachProceduralLantern(
  group: THREE.Group,
  pose: LampMountPose,
): THREE.MeshBasicMaterial {
  const k = pose.visualSize / PROCEDURAL_LANTERN_REF_MAX
  const bodyW = 0.12 * k
  const bodyH = 0.16 * k
  const bodyD = 0.08 * k
  const plateW = 0.14 * k
  const plateH = 0.04 * k
  const plateD = 0.14 * k
  const halfBody = bodyH * 0.5
  const halfPlate = plateH * 0.5

  const baseMat = new THREE.MeshBasicMaterial({ color: 0x6b4226 })
  const lampMat = new THREE.MeshBasicMaterial({ color: HOUSE_LAMP_OFF_COLOR })

  const top = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), baseMat)
  top.position.set(pose.cx, pose.cy + halfBody + halfPlate, pose.cz)
  top.rotation.y = pose.yaw
  group.add(top)

  const base = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, plateD), baseMat)
  base.position.set(pose.cx, pose.cy - halfBody - halfPlate, pose.cz)
  base.rotation.y = pose.yaw
  group.add(base)

  const lamp = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), lampMat)
  lamp.position.set(pose.cx, pose.cy, pose.cz)
  lamp.rotation.y = pose.yaw
  group.add(lamp)

  return lampMat
}

function attachHousePointLight(
  group: THREE.Group,
  pose: LampMountPose,
  style: HouseLampStyle,
): THREE.PointLight {
  const light = new THREE.PointLight(0xffb35c, 0, style === 'wall' ? 10 : 20, 2)
  const inset = pose.visualSize * 0.18
  light.position.set(pose.cx - pose.nx * inset, pose.cy, pose.cz - pose.nz * inset)
  group.add(light)
  return light
}

/** Interior fill only (no mesh). WIP: Y / intensity / distance not tuned;
 *  doubles the per-house PointLight count (plan 157 budget). */
function attachHouseInnerLight(group: THREE.Group): THREE.PointLight {
  const light = new THREE.PointLight(0xffb35c, 0, 12, 2)
  light.position.set(0, 1.5, 0)
  light.visible = false
  group.add(light)
  return light
}

/**
 * House night lamp (wall GLB or procedural) + exterior PointLight + interior fill.
 *
 * WIP / unfinished (2026-08-19): wall lantern still looks too small in-game.
 * Do not treat `LANTERN_WALL_MAX = 0.45` as a verified visual size.
 *
 * Discoveries so far:
 * - `style === 'wall' ? 0.5 : 1` never scaled the GLB. Village path uses
 *   `lantern.glb` via `preparePropFitMax(LANTERN_WALL_MAX)` in `props.ts`.
 *   Old 0.16 m longest-axis was a fist-sized fixture on a ~3.4 m MegaKit wall.
 * - `lantern.glb` is obj2gltf (Tomáš Bayer / ElwFor_Lantern). Vertex units
 *   ~85 × 180 × 25, origin at the OBJ corner — not metres, not centered.
 *   Longest axis is the tall wooden body; the cage/glass is a small slice of
 *   that bbox, so FitMax-to-0.45 m can still look like a tiny lamp head.
 * - Overwriting the clone's `position` with the mount dropped the FitMax
 *   foot/center offset. Most of the mesh sat inside the wall (sliver outside).
 *   Pivot at the mount + keep FitMax translation on the clone.
 * - `hut.add(lamp)` inherits `hut.scale` (MegaKit `HOUSE_ASSEMBLY_SCALE`;
 *   catalog GLB `prepareProp` can be ~0.1). Compensating the whole lamp group
 *   also moves the mount (hut-local metres). `props.ts` scales each child
 *   instead. Inner fill at (0, 1.5, 0) is hut-local because the lamp group
 *   sits at the hut origin.
 */
export function createHouseLight(
  mountHeight: number,
  mountX: number,
  mountZ: number,
  style: HouseLampStyle = 'wall',
  lanternBody: THREE.Object3D | null = null,
  explicitYaw?: number,
): HouseLight {
  const group = new THREE.Group()
  const pose = lampMountPose(mountX, mountZ, mountHeight, style, explicitYaw)

  let lampMat: THREE.MeshBasicMaterial | null = null
  if (lanternBody) attachLanternGlb(group, lanternBody, pose)
  else lampMat = attachProceduralLantern(group, pose)

  const light = attachHousePointLight(group, pose, style)
  const innerLight = attachHouseInnerLight(group)

  return {
    object: group,
    setNightIntensity(t) {
      const clamped = Math.max(0, Math.min(1, t))
      if (lampMat) lampMat.color.lerpColors(HOUSE_LAMP_OFF_COLOR, HOUSE_LAMP_ON_COLOR, clamped)
      light.intensity = clamped * (style === 'wall' ? 2.5 : 5)
      innerLight.intensity = clamped * 2
      // Plan 157 §3.2 — Three's WebGLLights only collects visible lights, so
      // an off lamp that stays `visible = true` still costs a
      // NUM_POINT_LIGHTS slot / program cache variant for nothing.
      const on = clamped > 0
      light.visible = on
      innerLight.visible = on
    },
  }
}

export function createProceduralTorchPost(): THREE.Object3D {
  const group = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
  )
  pole.position.y = 0.7
  pole.castShadow = true
  group.add(pole)
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.05, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, flatShading: true }),
  )
  head.position.y = 1.45
  head.castShadow = true
  group.add(head)
  return group
}

/** Freestanding village torch — GLB post with its own `Fire` mesh + a small
 *  ember particle pool, toggled at dusk/dawn. */
export function createVillageTorchLight(
  post: THREE.Object3D,
): VillageTorch {
  const group = new THREE.Group()
  group.add(post)

  // torch.glb ships two primitives on one `Torch` node — `DarkMetal`
  // (Torch_1, the fixture itself) and `Fire` (Torch_2, the model's own
  // flame mesh, roughly local Y 0.86–1.55 on the fitted 1.55m-tall post).
  // The Fire material is authored (in the GLB itself, not patched here at
  // runtime) as `alphaMode: BLEND`, `baseColorFactor` alpha 0.4, and an
  // `emissiveFactor` glow, double-sided — a same-value JS-side `transparent`/
  // `opacity` override here previously read as visually indistinguishable
  // from opaque against a dark night background; baking it into the asset
  // is the reliable fix. Only DarkMetal keeps its normal opaque shading/shadow.
  let fireMesh: THREE.Mesh | null = null
  post.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (!(child.material instanceof THREE.MeshStandardMaterial)) return
    if (child.material.name !== 'Fire') return

    child.castShadow = false
    fireMesh = child
    // Unlit by default — `setLit` drives visibility from here on.
    child.visible = false
  })

  // A handful of larger, faster-rising sparks instead of the full campfire
  // particle rig (cone + 8 sparks + 5 embers + 10-point ignite burst = 4
  // draw calls) — one cheap `THREE.Points` pool (4 points) is plenty for a
  // wall/post torch seen from a few meters away. `createEmbers`'s tuning
  // (built for a ground-level campfire base) read as too small/too slow up
  // here — `createTorchSparks` is sized and paced for this instead. Anchored
  // near the top of the Fire mesh (~y 1.3, not the post's base) so they
  // visibly climb up off the flame instead of floating in empty air below it.
  const sparks = createTorchSparks(1)
  const flameObj: THREE.Object3D = sparks.points
  const flameUpdate = sparks.update
  flameObj.position.set(0, 1.3, 0)
  // Unlit by default, same as `fireMesh` above — `setLit` turns it on.
  flameObj.visible = false
  group.add(flameObj)

  // `distance` (the 3rd ctor arg) is only a hard falloff cutoff — with
  // `decay: 2` (physically-based inverse-square, matches every other point
  // light in this file/`campfireProps.ts`/`PlayerTorch.ts`) brightness at a
  // given point is already ~`intensity / distance²` well before that cutoff
  // is reached, so raising it past the point light's real (intensity-bound)
  // falloff range is invisible — pushing `distance` to 500 with intensity
  // still single-digit changed nothing on screen for exactly this reason.
  // `intensity` is the actual lever for "shines further".
  const light = new THREE.PointLight(0xff8a3c, 0, 25, 2)
  light.position.set(0, 1.3, 0)
  group.add(light)

  let lit = false

  return {
    object: group,
    setLit(on) {
      lit = on
      flameObj.visible = on
      if (fireMesh) fireMesh.visible = on
      light.intensity = on ? 6 : 0
      // Plan 157 §3.2 — same visibility fix as `createHouseLight` above; an
      // extinguished torch's light previously stayed `visible = true`.
      light.visible = on
    },
    update(dt) {
      if (lit) flameUpdate(dt)
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

export type ResolvedHouseLampMount = HouseLampMount & { source: string, yaw?: number }

function resolveLampMountFromAnchor(
  hut: THREE.Object3D,
  assetId: string,
): ResolvedHouseLampMount | null {
  const glb = discoverGlbAnchors(hut)
  const metadata = anchorsForAsset(assetId)
  const merged = mergeAnchorDefs(glb.defs, metadata)
  const lampDef = merged.defs.find((d) => d.name === 'lamp_mount')
  if (!lampDef) return null

  const { anchors } = resolveAssetAnchors(hut, [lampDef], {
    glbNames: new Set(glb.defs.map((d) => d.name)),
    metadataNames: new Set(metadata.map((d) => d.name)),
  })
  const resolved = anchors.find((a) => a.def.name === 'lamp_mount')
  if (!resolved) return null

  const pos = new THREE.Vector3()
  resolved.localMatrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3())

  let yaw: number | undefined
  if (resolved.hasOrientation) {
    const forward = new THREE.Vector3(0, 0, 1).applyMatrix4(resolved.localMatrix)
    forward.sub(pos)
    if (forward.lengthSq() > 1e-8) {
      forward.normalize()
      yaw = Math.atan2(forward.x, forward.z)
    }
  }

  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    source: 'anchor',
    ...(yaw !== undefined ? { yaw } : {}),
  }
}

/** Anchor → catalog override → floor center → wall raycast → bbox provisional. */
export function resolveHouseLampMount(
  entry: HouseCatalogEntry,
  hut: THREE.Object3D,
  hutHeight: number,
): ResolvedHouseLampMount {
  const assetId = `house:${entry.id}`
  const fromAnchor = resolveLampMountFromAnchor(hut, assetId)
  if (fromAnchor) return fromAnchor

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
